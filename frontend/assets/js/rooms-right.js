(function(){

  function el(tag, cls, html) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html !== undefined) node.innerHTML = html;
    return node;
  }
  function estadoClass(estado) {
    if (!estado) return 'occ-maint';
    const e = estado.toLowerCase();
    if (e.includes('dispon')) return 'occ-available';
    if (e.includes('ocup')) return 'occ-occupied';
    if (e.includes('mante') || e.includes('mantenimiento')) return 'occ-maint';
    return 'occ-maint';
  }
  function makeCard(room, currentEvent) {
    const card = el('div', 'classroom-card');
    card.dataset.clave = room.clave;

    let stripeClass = estadoClass(room.estado);
    // si hay clase en curso, forzar occupied
    if (room && currentEvent) {
      stripeClass = 'occ-occupied';
    } else {
      if (room && room.estado && /mante|mantenimiento/i.test(String(room.estado))) stripeClass = 'occ-maint';
      else if (!currentEvent) stripeClass = 'occ-available';
    }
    const stripe = el('div', 'occupancy-line ' + stripeClass);
    card.appendChild(stripe);

    const titleRow = el('div', 'room-title');
    titleRow.appendChild(el('div', '', room.nombre || room.clave || '—'));
    const pencil = el('button', 'room-edit-btn', '✏️');
    pencil.type = 'button';
    pencil.dataset.editRoom = room.clave;
    titleRow.appendChild(pencil);
    card.appendChild(titleRow);

    const cls = (currentEvent && (currentEvent.materia || currentEvent.materia_nombre || currentEvent.materia_name || currentEvent.grupo || currentEvent.asignatura)) || '—';
    const timeText = currentEvent ? `${currentEvent.inicio || ''} - ${currentEvent.fin || ''}` : '—';
    const bigClass = el('div', 'room-current-class', cls);
    const timeEl = el('div', 'room-time', timeText);
    card.appendChild(bigClass);
    card.appendChild(timeEl);

    return card;
  }

  function makeRoomsSlider(titleText, rooms, currentEventsMap) {
    const wrapper = el('div', 'slider-block');
    wrapper.dataset.floor = titleText;
    wrapper.appendChild(el('div', 'semester-title', titleText));

    const navL = el('button', 'rooms-nav left', '&#9664;');
    navL.type = 'button';
    navL.setAttribute('aria-label', 'Anterior salón');
    const navR = el('button', 'rooms-nav right', '&#9654;');
    navR.type = 'button';
    navR.setAttribute('aria-label', 'Siguiente salón');

    const container = el('div', 'classroom-slider');
    container.setAttribute('role', 'list');
    rooms.slice(0, 40).forEach(r => container.appendChild(makeCard(r, currentEventsMap?.[r.clave] || null)));

    navL.addEventListener('click', () => container.scrollBy({ left: -260, behavior: 'smooth' }));
    navR.addEventListener('click', () => container.scrollBy({ left: 260, behavior: 'smooth' }));

    const innerWrap = el('div', 'slider-row-wrap');
    innerWrap.appendChild(navL);
    innerWrap.appendChild(container);
    innerWrap.appendChild(navR);

    wrapper.appendChild(innerWrap);
    return wrapper;
  }

  const modalOverlay = document.getElementById('roomsModal');
  const modalTitle = document.getElementById('modalTitle');
  const scheduleBody = document.getElementById('scheduleBody');
  const modalClose = document.getElementById('modalClose');

  let allRooms = [];
  const scheduleCache = new Map();
  let currentFloor = 'Lobby';
  const adminSchedule = window.AdminMngSchedule || null;
  const adminMock = window._rooms_admin_mock || null;

  // API base y token (para endpoints protegidos como /api/salones)
  const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://localhost:3000'
    : 'https://bdsm-production-0032.up.railway.app';
  const TOKEN = (localStorage.getItem('token') || '').trim();

  async function loadRooms() {
    const container = document.getElementById('roomsRight');
    const loading = document.getElementById('roomsLoading');
    try {
      if (adminMock && Array.isArray(adminMock.mockRooms)){
        allRooms = adminMock.mockRooms.map(r => ({
          clave: r.id != null ? String(r.id) : (r.name ? String(r.name) : (r.clave||'')),
          nombre: r.name || r.nombre || (`Salón ${r.id || r.name || ''}`),
          piso: r.piso || r.floor || r.nivel || 'Lobby',
          estado: r.estado || 'Disponible'
        }));
        renderAllFloors();
      } else {
        const headers = TOKEN ? { 'Authorization': `Bearer ${TOKEN}` } : {};
        const res = await fetch(`${API_BASE}/api/salones`, { headers });
        let rooms = [];
        if (!res.ok) throw new Error('Network error');
        rooms = await res.json();
        if (!Array.isArray(rooms)) throw new Error('Invalid rooms response');

        // Normalizar respuesta del backend a { clave, nombre, piso, estado }
        allRooms = rooms.map(r => ({
          clave: r.id_salon != null ? String(r.id_salon) : (r.clave != null ? String(r.clave) : (r.nombre || '')),
          nombre: r.nombre || r.name || `Salón ${r.id_salon || r.clave || ''}`,
          piso: r.piso != null ? String(r.piso) : (r.floor || r.nivel || 'Lobby'),
          estado: r.estado || 'Disponible'
        }));
        renderAllFloors();
      }

    } catch (err) {
      console.error('loadRooms error:', err);
      // Si no hay token o no es admin, avisa discretamente en consola y usa mock
      if (!TOKEN) {
        console.warn('Sin token: inicia sesión para ver salones reales. Mostrando mock.');
      }
      if (String(err?.message||'').toLowerCase().includes('network error')) {
        console.warn('Posible 401/403 en /api/salones: asegúrate de rol Admin.');
      }
      // mock data 
      allRooms = [
        { clave: 'Lobby-01', nombre: 'Salón 1', piso: 'Lobby', estado: 'Disponible' },
        { clave: 'Lobby-02', nombre: 'Salón 2', piso: 'Lobby', estado: 'Disponible' },
        { clave: 'Lobby-03', nombre: 'Salón 3', piso: 'Lobby', estado: 'Ocupado' },
        { clave: 'Lobby-04', nombre: 'Salón 4', piso: 'Lobby', estado: 'Disponible' },
        { clave: 'P1-01', nombre: 'Salón 11', piso: 'Planta 1', estado: 'Disponible' },
        { clave: 'P1-02', nombre: 'Salón 12', piso: 'Planta 1', estado: 'Ocupado' },
        { clave: 'P1-03', nombre: 'Salón 13', piso: 'Planta 1', estado: 'Disponible' },
        { clave: 'P1-04', nombre: 'Salón 14', piso: 'Planta 1', estado: 'Disponible' },
        { clave: 'P2-01', nombre: 'Salón 21', piso: 'Planta 2', estado: 'Disponible' },
        { clave: 'P2-02', nombre: 'Salón 22', piso: 'Planta 2', estado: 'Ocupado' },
        { clave: 'P3-01', nombre: 'Salón 31', piso: 'Planta 3', estado: 'En Mantenimiento' }
        ,{ clave: 'P3-02', nombre: 'Salón 32', piso: 'Planta 3', estado: 'Disponible' }
      ];
      renderAllFloors();
    } finally {
      // leave loading DOM in place but don't show overlay for the right panel
    }
  }

  function getFloorFromRoom(room) {
    if (!room) return 'Lobby';
    const p = (room.piso || room.floor || room.nivel || room.f) || '';
    if (p) {
      const s = String(p).trim();
      // Mapear formatos a '1','2','3' o 'Lobby'
      if (/^planta\s*1$/i.test(s)) return '1';
      if (/^planta\s*2$/i.test(s)) return '2';
      if (/^planta\s*3$/i.test(s)) return '3';
      if (/^(lobby|0)$/i.test(s)) return 'Lobby';
      if (['1','2','3'].includes(s)) return s;
      // fallback
      return s;
    }
    const clave = (room.clave || '').toString().toUpperCase();
    if (clave.startsWith('P1') || clave.includes('P1-') ) return '1';
    if (clave.startsWith('P2') || clave.includes('P2-') ) return '2';
    if (clave.startsWith('P3') || clave.includes('P3-') ) return '3';
    if (clave.includes('LOBBY') || clave.startsWith('L') ) return 'Lobby';
    return 'Lobby';
  }

  async function fetchScheduleFor(clave) {
    if (scheduleCache.has(clave)) return scheduleCache.get(clave);
    try {
      const headers = TOKEN ? { 'Authorization': `Bearer ${TOKEN}` } : {};
      const res = await fetch(`${API_BASE}/api/horarios?salon=${encodeURIComponent(clave)}`, { headers });
      if (!res.ok) throw new Error('Schedule fetch failed');
      const data = await res.json();
      const arr = Array.isArray(data?.horarios) ? data.horarios : (Array.isArray(data) ? data : []);
      scheduleCache.set(clave, arr);
      return arr;
    } catch (err) {
      scheduleCache.set(clave, []);
      return [];
    }
  }

  function timeToMinutes(t) {
    if (!t) return null;
    const m = String(t).match(/(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  }

  // Extended to include evening periods so modal tables can reach 20:50 (last start 20:00)
  const FALLBACK_PERIOD_STARTS = ['06:00','07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00'];
  const FALLBACK_PERIOD_LEN = 50;

  function findCurrentEvent(schedule) {
    if (!Array.isArray(schedule) || schedule.length === 0) return null;
    const now = new Date();
    const days = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
    const today = days[now.getDay()];
    const nowMin = now.getHours() * 60 + now.getMinutes();
    for (const row of schedule) {
      const dia = (row.dia || row.day || '').toString().toLowerCase();
      if (!dia) continue;
      if (!dia.includes(today)) continue;
      const inicio = timeToMinutes(row.inicio || row.start || row.hora_inicio || '');
      const fin = timeToMinutes(row.fin || row.end || row.hora_fin || '');
      if (inicio !== null && fin !== null && nowMin >= inicio && nowMin < fin) {
        return row;
      }
    }
    return null;
  }

  // Render rows
  async function renderAllFloors() {
    const container = document.getElementById('roomsRight');
    if (!container) return;
    container.innerHTML = '';

    // Mostrar por pisos numéricos 1,2,3 como solicitaste (excluimos Lobby)
    const floors = ['1', '2', '3'];

    // Build a map
    const currentMap = {};
    if (adminSchedule && adminSchedule.scheduleDb) {
      const scheduleDb = adminSchedule.scheduleDb;
      const days = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
      const today = days[new Date().getDay()];
      const weekdayMap = { 'lunes':'mon','martes':'tue','miercoles':'wed','jueves':'thu','viernes':'fri' };
      const weekdayKey = weekdayMap[today] || 'mon';

      allRooms.forEach(r => {
        let found = null;
        for (const periodKey in scheduleDb) {
          const dayObj = scheduleDb[periodKey] || {};
          const entries = dayObj[weekdayKey] || [];
          for (const entry of entries) {
            if (entry.room_assigned == null) continue;
            if (String(entry.room_assigned) === String(r.clave) || String(entry.room_assigned) === String(r.nombre) || String(entry.room_assigned) === String(r.id)) {
              const inicio = entry.inicio || periodKey;
              const duration = entry.duration || 1;
              const periodStarts = adminSchedule.PERIOD_STARTS || [];
              const idx = periodStarts.indexOf(inicio);
              const endPeriodIndex = idx >= 0 ? idx + (duration - 1) : -1;
              const endTime = endPeriodIndex >= 0 && periodStarts[endPeriodIndex] ? (adminSchedule.addMinutes ? adminSchedule.addMinutes(periodStarts[endPeriodIndex], adminSchedule.PERIOD_LEN_MIN || 50) : (function(hm, mins){ const [h,m]=hm.split(":").map(Number); const d=new Date(2020,0,1,h,m); d.setMinutes(d.getMinutes()+mins); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; })(periodStarts[endPeriodIndex], adminSchedule.PERIOD_LEN_MIN || 50)) : entry.fin || '';
              const startMin = timeToMinutes(inicio);
              const endMin = timeToMinutes(endTime);
              const now = new Date();
              const nowMin = now.getHours() * 60 + now.getMinutes();
              if (startMin !== null && endMin !== null && nowMin >= startMin && nowMin < endMin) {
                found = Object.assign({}, entry, { inicio: inicio, fin: endTime });
                break;
              }
            }
          }
          if (found) break;
        }
        currentMap[r.clave] = found;
      });
    } else {
      // Sin AdminMngSchedule: detectar ocupación actual consultando API de horarios por salón
      try {
        await Promise.all(allRooms.map(async (r) => {
          const sch = await fetchScheduleFor(r.clave);
          const ce = findCurrentEvent(sch);
          currentMap[r.clave] = ce;
        }));
      } catch (e) {
        // si falla, dejar currentMap vacío y depender de estado
      }
    }

    for (const f of floors) {
      const rooms = allRooms.filter(r => getFloorFromRoom(r) === f);
      const block = makeRoomsSlider(f, rooms, currentMap);
      container.appendChild(block);
    }

    // click handlers
    attachRightHandlers();

      container.style.position = 'relative';
      container.style.overflowY = 'auto';
      if (!container.querySelector('.rooms-vertical-controls')) {
        const vwrap = el('div', 'rooms-vertical-controls');
        const up = el('button', 'rooms-vertical-btn up', '▲');
        const down = el('button', 'rooms-vertical-btn down', '▼');
        up.type = down.type = 'button';
        up.title = 'Subir'; down.title = 'Bajar';
        up.addEventListener('click', () => container.scrollBy({ top: -220, behavior: 'smooth' }));
        down.addEventListener('click', () => container.scrollBy({ top: 220, behavior: 'smooth' }));
        vwrap.appendChild(up); vwrap.appendChild(down);
        container.appendChild(vwrap);
      }
      syncRightHeight();
  }

    function syncRightHeight() {
      try {
        const left = document.querySelector('.left-column');
        const rightSection = document.querySelector('.right-section');
        if (!left || !rightSection) return;
        const leftRect = left.getBoundingClientRect();
        const height = left.offsetHeight;
        const roomsRight = document.getElementById('roomsRight');
        if (roomsRight) {
          roomsRight.style.maxHeight = `${height}px`;
          roomsRight.style.overflowY = 'auto';
        }
      } catch (e) {
        // nada
      }
    }


  function openModalFor(clave, name) {
    if (!modalOverlay) return;
    modalOverlay.style.display = 'flex';
    modalOverlay.classList.add('show');
    modalOverlay.setAttribute('aria-hidden', 'false');
    if (modalTitle) modalTitle.textContent = `Horario — ${name || clave}`;
    const sel = document.getElementById('modalDaySelect');
    if (sel && window.AdminMngSchedule) {
      const days = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
      const today = days[new Date().getDay()];
      const map = { 'lunes':'mon','martes':'tue','miercoles':'wed','miercoles':'wed','jueves':'thu','viernes':'fri' };
      sel.value = map[today] || 'mon';
    }
    if (modalOverlay) modalOverlay.dataset.roomClave = clave;
    loadSchedule(clave);
  }
  function closeModal() {
    if (!modalOverlay) return;
    modalOverlay.style.display = 'none';
    modalOverlay.classList.remove('show');
    modalOverlay.setAttribute('aria-hidden', 'true');
    if (scheduleBody) scheduleBody.innerHTML = `<tr><td colspan="6" class="schedule-empty">Cargando...</td></tr>`;
  }
  if (modalClose) modalClose.addEventListener('click', closeModal);
  if (modalOverlay) modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

  const modalDaySelect = document.getElementById('modalDaySelect');
  if (modalDaySelect) {
    modalDaySelect.addEventListener('change', () => {
      const clave = modalOverlay?.dataset?.roomClave || null;
      if (clave) loadSchedule(clave);
    });
  }

  function attachRightHandlers() {
    document.querySelectorAll('.classroom-card').forEach(card => {
      card.removeEventListener('click', cardClickHandler);
      card.addEventListener('click', cardClickHandler);
    });
    document.querySelectorAll('.room-edit-btn').forEach(btn => {
      btn.removeEventListener('click', editBtnHandler);
      btn.addEventListener('click', editBtnHandler);
    });
  }
  function cardClickHandler(evt) {
    const card = this || evt.currentTarget;
    const clave = card.dataset.clave;
    const name = card.querySelector('.room-title div')?.textContent || clave;
    openModalFor(clave, name);
  }
  function editBtnHandler(evt) {
    evt.stopPropagation();
    const clave = evt.currentTarget.dataset.editRoom;
    console.log('Edit room', clave);
  }

  async function loadSchedule(clave) {
    if (!scheduleBody) return;
    scheduleBody.innerHTML = `<tr><td colspan="6" class="schedule-empty">Cargando...</td></tr>`;
    try {
      if (window.AdminMngSchedule && window.AdminMngSchedule.scheduleDb) {
        const db = window.AdminMngSchedule.scheduleDb;
        const periodStarts = window.AdminMngSchedule.PERIOD_STARTS || [];
        const periodLen = window.AdminMngSchedule.PERIOD_LEN_MIN || 50;
        const dayKey = document.getElementById('modalDaySelect')?.value || 'mon';
        scheduleBody.innerHTML = '';

        const dayNameMap = { mon: 'Lunes', tue: 'Martes', wed: 'Miércoles', thu: 'Jueves', fri: 'Viernes' };
        const dayLabel = dayNameMap[dayKey] || '';
        periodStarts.forEach(ps => {
          const entries = (db[ps] && db[ps][dayKey]) ? db[ps][dayKey] : [];
          const assigned = entries.filter(e => e.room_assigned != null && String(e.room_assigned) === String(clave));
          const tr = document.createElement('tr');
          const endTime = (window.AdminMngSchedule.addMinutes ? window.AdminMngSchedule.addMinutes(ps, periodLen) : (function(hm, mins){ const [h,m]=hm.split(":").map(Number); const d=new Date(2020,0,1,h,m); d.setMinutes(d.getMinutes()+mins); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; })(ps, periodLen));
          if (assigned.length === 0) {
            tr.innerHTML = `<td>${dayLabel}</td><td>${ps} - ${endTime}</td><td colspan="4" class="small-muted">Disponible</td>`;
          } else {
            const first = assigned[0];
            // Mostrar nombre del salón en lugar del ID (usar el nombre del card o buscar en allRooms)
            const roomObj = allRooms.find(r => String(r.clave) === String(clave));
            const salonNombre = roomObj?.nombre || String(clave);
            tr.innerHTML = `<td>${dayLabel}</td><td>${ps} - ${endTime}</td><td>${escapeHtml(first.grupo || '')}</td><td>${escapeHtml(first.asignatura || '')}</td><td>${escapeHtml(first.profesor || '')}</td><td>${escapeHtml(salonNombre)}</td>`;
          }
          scheduleBody.appendChild(tr);
        });
        return;
      }

      // Usar API real y mostrar todas las asignaciones del salón seleccionado
      const res = await fetch(`${API_BASE}/api/horarios`);
      if (!res.ok) throw new Error('Network error fetching schedule');
      const data = await res.json().catch(() => ({}));
      const apiEntries = Array.isArray(data?.horarios) ? data.horarios : [];

      const selDayKey = document.getElementById('modalDaySelect')?.value || 'mon';
      const dayNameMap = { mon: 'Lunes', tue: 'Martes', wed: 'Miércoles', thu: 'Jueves', fri: 'Viernes' };
      const selectedDay = dayNameMap[selDayKey] || '';

      // Filtrar solo por el salón y el día seleccionado
      const assignedAll = apiEntries.filter(e => String(e.id_salon || '') === String(clave) && String(e.dia || '') === selectedDay);
      assignedAll.sort((a,b) => {
        const orderDia = { 'Lunes':1,'Martes':2,'Miércoles':3,'Jueves':4,'Viernes':5 };
        const odA = orderDia[a.dia] || 99; const odB = orderDia[b.dia] || 99;
        if (odA !== odB) return odA - odB;
        return String(a.hora_inicio).localeCompare(String(b.hora_inicio));
      });

      scheduleBody.innerHTML = '';
      if (assignedAll.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="6" class="schedule-empty">Sin asignaciones para este salón</td>`;
        scheduleBody.appendChild(tr);
      } else {
        assignedAll.forEach(row => {
          const hi = String(row.hora_inicio || '').slice(0,5);
          const hf = String(row.hora_fin || '').slice(0,5);
          const roomObj = allRooms.find(r => String(r.clave) === String(clave));
          const salonNombre = roomObj?.nombre || String(clave);
          const tr = document.createElement('tr');
          tr.innerHTML = `<td>${escapeHtml(row.dia || '')}</td><td>${hi} - ${hf}</td><td>${escapeHtml(row.grupo_nombre || '')}</td><td>${escapeHtml(row.asignatura || '')}</td><td>${escapeHtml(row.profesor || '')}</td><td>${escapeHtml(salonNombre)}</td>`;
          scheduleBody.appendChild(tr);
        });
      }
    } catch (err) {
      console.error('loadSchedule error', err);
      try {
        const periodStarts = (window.AdminMngSchedule && window.AdminMngSchedule.PERIOD_STARTS) || (window.SCHEDULE_CONFIG && window.SCHEDULE_CONFIG.PERIOD_STARTS) || FALLBACK_PERIOD_STARTS;
        const periodLen = (window.AdminMngSchedule && window.AdminMngSchedule.PERIOD_LEN_MIN) || (window.SCHEDULE_CONFIG && window.SCHEDULE_CONFIG.PERIOD_LEN_MIN) || FALLBACK_PERIOD_LEN;
        scheduleBody.innerHTML = '';
        periodStarts.forEach(ps => {
          const endTime = (function(hm, mins){ const [h,m]=hm.split(":").map(Number); const d=new Date(2020,0,1,h,m); d.setMinutes(d.getMinutes()+mins); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; })(ps, periodLen);
          const tr = document.createElement('tr');
          tr.innerHTML = `<td>Per.</td><td>${ps} - ${endTime}</td><td colspan="4" class="small-muted">Disponible</td>`;
          scheduleBody.appendChild(tr);
        });
      } catch (e) {
        scheduleBody.innerHTML = `<tr><td colspan="6" class="schedule-empty">No disponible</td></tr>`;
      }
    }
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  document.addEventListener('DOMContentLoaded', loadRooms);
  document.addEventListener('floor-change', (e) => {
    if (e && e.detail && e.detail.floor) {
      const floorName = e.detail.floor;
      const container = document.getElementById('roomsRight');
      if (!container) return;
      const blocks = container.querySelectorAll('.slider-block');

      for (const b of blocks) {
        if (String(b.dataset.floor).trim() === String(floorName).trim()) {
          // clear previous selections
          blocks.forEach(x => {
            x.classList.remove('selected-floor');
            x.classList.remove('highlight');
            x.querySelectorAll('.classroom-card').forEach(c => c.classList.remove('selected-card'));
          });

          b.classList.add('selected-floor');
          b.classList.add('highlight');
          b.querySelectorAll('.classroom-card').forEach(c => c.classList.add('selected-card'));

          b.scrollIntoView({ behavior: 'smooth', block: 'center' });
          break;
        }
      }
    }
  });


  window.addEventListener('resize', () => { syncRightHeight(); });
})();

