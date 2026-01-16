document.addEventListener("DOMContentLoaded", () => {

  const API_BASE = (location.hostname === "localhost" || location.hostname === "127.0.0.1")
    ? "http://localhost:3000"
    : "https://bdsm-production-0032.up.railway.app";
  const token = localStorage.getItem("token") || "";

  const SCHED = window.AdminMngSchedule || {};
  const SC = window.SCHEDULE_CONFIG || {};
  const PERIOD_LEN_MIN = SCHED.PERIOD_LEN_MIN || SC.PERIOD_LEN_MIN || 50;
  const PERIOD_STARTS = SCHED.PERIOD_STARTS || SC.PERIOD_STARTS || [
    "06:00","07:00","08:00","09:00","10:00",
    "11:00","12:00","13:00","14:00","15:00",
    "16:00","17:00","18:00","19:00","20:00"
  ];
  const addMinutes = SCHED.addMinutes || SC.addMinutes || function(hm, mins){ const [h,m]=hm.split(":").map(Number); const d=new Date(2020,0,1,h,m); d.setMinutes(d.getMinutes()+mins); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };
  const toMinutes = SCHED.toMinutes || SC.toMinutes || function(hm){ const [h,m]=hm.split(":").map(Number); return h*60 + m; };

  // mon-fri
  const WEEKDAY_KEYS = ['mon','tue','wed','thu','fri'];
  const WEEKDAY_LABELS = ['Lun','Mar','Mié','Jue','Vie'];
  function todayWeekdayKey(){ const k = new Date().getDay(); return ({1:'mon',2:'tue',3:'wed',4:'thu',5:'fri'})[k] || 'mon'; }
  let currentSelectedWeekdayRooms = todayWeekdayKey();

  // Estado en memoria
  let rooms = [];

 
  /* ------------------------
     DOM references 
     ------------------------ */
  const roomsTableBody = document.querySelector("#roomsTable tbody");
  const viewerModal = document.getElementById("viewerModal");
  const viewerClose = document.getElementById("viewerClose");
  const viewerTitle = document.getElementById("viewerTitle");
  const viewerBody = document.getElementById("viewerBody");

  const editorModal = document.getElementById("editorModal");
  const editorClose = document.getElementById("editorClose");
  const editorRoomLabel = document.getElementById("editorRoomLabel");
  const periodStrip = document.getElementById("periodStrip");
  const blockOptions = document.getElementById("blockOptions");
  const blockInfo = document.getElementById("blockInfo");
  const selectedBlockText = document.getElementById("selectedBlockText");

  /* ------------------------
     Estado
     ------------------------ */
  let currentViewerRoom = null;
  let horariosCache = [];

  const keyToDiaEsp = {
    mon: 'Lunes',
    tue: 'Martes',
    wed: 'Miércoles',
    thu: 'Jueves',
    fri: 'Viernes'
  };

  // Helpers para hora actual
  function nowHM(){ const d=new Date(); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
  function diaHoyEsp(){ const m = {0:'Domingo',1:'Lunes',2:'Martes',3:'Miércoles',4:'Jueves',5:'Viernes',6:'Sábado'}; return m[new Date().getDay()] || 'Lunes'; }

  function findCurrentHorarioForRoom(roomId){
    const dia = diaHoyEsp();
    const ahora = nowHM();
    const nowMins = toMinutes(ahora);
    const list = horariosCache.filter(h => String(h.id_salon)===String(roomId) && String(h.dia)===dia);
    // Buscar el horario que está activo: hora_inicio <= ahora < hora_fin
    for (const h of list){
      const hi = String(h.hora_inicio||'').slice(0,5);
      const hf = String(h.hora_fin||'').slice(0,5);
      const hiM = toMinutes(hi);
      const hfM = toMinutes(hf);
      if (hiM <= nowMins && nowMins < hfM){
        return { h, hi, hf };
      }
    }
    return null;
  }

  // Abreviar día y limitar longitudes para que quepa bien
  function abbrDia(d){ const m={'Lunes':'Lun','Martes':'Mar','Miércoles':'Mié','Jueves':'Jue','Viernes':'Vie'}; return m[String(d)] || String(d); }
  function shorten(s, max){ s = String(s || '-'); return s.length > max ? (s.slice(0, Math.max(0, max-1)) + '…') : s; }

  async function fetchHorarios(){
    try {
      const res = await fetch(`${API_BASE}/api/horarios`);
      const data = await res.json().catch(()=>({ horarios: [] }));
      horariosCache = Array.isArray(data.horarios) ? data.horarios : [];
    } catch (err) {
      horariosCache = [];
    }
  }

  function openViewer(roomId, dayKey){
    const room = rooms.find(x=> String(x.id_salon)===String(roomId));
    const dayKeyToUse = dayKey || currentSelectedWeekdayRooms;
    const diaEsp = keyToDiaEsp[dayKeyToUse] || 'Lunes';
    const list = horariosCache.filter(h => String(h.id_salon)===String(roomId) && String(h.dia)===diaEsp);
    viewerTitle.textContent = `Horario Salón ${room?.nombre || roomId}`;
    // Calcular bloque actual (solo si día es hoy)
    const esHoy = diaHoyEsp() === diaEsp;
    const current = esHoy ? findCurrentHorarioForRoom(roomId) : null;
    const currentId = current?.h?.id_horario;

    const rowsHtml = list.length ? list.map(h => {
      const hi = (h.hora_inicio || '').slice(0,5);
      const hf = (h.hora_fin || '').slice(0,5);
      const g = h.grupo_nombre || '-';
      const a = h.asignatura || '-';
      const p = h.profesor || '-';
      const isCurrent = currentId && Number(h.id_horario) === Number(currentId);
      const trStyle = isCurrent ? 'style="background:#fff3cd"' : '';
      const badge = isCurrent ? '<span class="badge" style="margin-right:6px">Ahora</span>' : '';
      return `<tr ${trStyle}>
        <td>${hi} - ${hf}</td>
        <td>${g}</td>
        <td>${a}</td>
        <td>${p}</td>
        <td><button class="icon-btn del-horario" data-id="${h.id_horario}">🗑️</button></td>
      </tr>`;
    }).join('') : `<tr><td colspan="5" class="schedule-empty">Sin horarios para ${diaEsp}</td></tr>`;
    const currentSummary = esHoy && current ? `${abbrDia(current.h.dia)} ${current.hi}-${current.hf} | ${shorten(current.h.grupo_nombre,8)} | ${shorten(current.h.asignatura,12)} | ${shorten(current.h.profesor,12)}` : '—';
    viewerBody.innerHTML = `
      <div class="current-summary" style="margin-bottom:8px"><strong>Ahora:</strong> ${currentSummary}</div>
      <table class="schedule-table" style="width:100%">
        <thead><tr><th>Hora</th><th>Grupo</th><th>Asignatura</th><th>Profesor</th><th></th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    `;
    // action to open editor
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'modal-actions';
    actionsDiv.innerHTML = `<button id="viewerOpenEditor" class="mng-confirm">Editar horario</button>`;
    viewerBody.appendChild(actionsDiv);
    viewerModal.classList.add('show');

    // delete handler
    viewerBody.querySelectorAll('.del-horario').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (!confirm('¿Eliminar este horario?')) return;
        try {
          const res = await fetch(`${API_BASE}/api/horarios/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const data = await res.json().catch(()=>({}));
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
          if (window.UI && window.UI.showBanner) window.UI.showBanner('success', 'Horario eliminado', 2500);
          await fetchHorarios();
          openViewer(roomId);
        } catch (err) {
          if (window.UI && window.UI.showBanner) window.UI.showBanner('error', err.message || 'Error al eliminar', 4000);
        }
      });
    });

    const openEdBtn = document.getElementById('viewerOpenEditor');
    openEdBtn?.addEventListener('click', () => { closeViewer(); openEditor(roomId); });
  }

  function closeViewer(){ viewerModal.classList.remove('show'); }
  viewerClose?.addEventListener('click', closeViewer);

  function openEditor(roomId){
    const room = rooms.find(x=> String(x.id_salon)===String(roomId));
    editorRoomLabel.textContent = `${room?.nombre || roomId}`;
    editorModal.classList.add('show');

    // Día selector
    const daySel = WEEKDAY_KEYS.map((k,i)=> `<option value="${k}" ${k===currentSelectedWeekdayRooms?'selected':''}>${WEEKDAY_LABELS[i]}</option>`).join('');
    // Period strip
    periodStrip.innerHTML = PERIOD_STARTS.map(p => `<button class="period-btn" data-start="${p}">${p}</button>`).join('');
    let selectedStart = PERIOD_STARTS[0];
    let selectedDur = 1;
    const updateSelectedText = () => {
      const startIdx = PERIOD_STARTS.indexOf(selectedStart);
      const endIdx = Math.min(startIdx + selectedDur - 1, PERIOD_STARTS.length - 1);
      const fin = addMinutes(PERIOD_STARTS[endIdx], PERIOD_LEN_MIN);
      selectedBlockText.textContent = `${selectedStart} - ${fin}`;
    };
    updateSelectedText();
    periodStrip.querySelectorAll('.period-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        periodStrip.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedStart = btn.dataset.start;
        updateSelectedText();
      });
    });

    // Opciones del bloque
    blockOptions.innerHTML = `
      <div style="display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap;">
        <div>
          <label>Día</label>
          <select id="edDia">${daySel}</select>
        </div>
        <div>
          <label>Duración</label>
          <select id="edDur">
            <option value="1" selected>1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
          </select>
        </div>
        <div>
          <label>Grupo</label>
          <input id="edGrupo" type="text" placeholder="ej. 5IM3" />
        </div>
        <div>
          <label>Asignatura</label>
          <input id="edAsig" type="text" placeholder="ej. Física" />
        </div>
        <div>
          <label>Profesor</label>
          <input id="edProf" type="text" placeholder="Opcional" />
        </div>
        <div>
          <button id="edGuardar" class="mng-confirm">Guardar</button>
        </div>
      </div>
    `;
    const edDia = document.getElementById('edDia');
    const edDurEl = document.getElementById('edDur');
    const edGrupo = document.getElementById('edGrupo');
    const edAsig = document.getElementById('edAsig');
    const edProf = document.getElementById('edProf');
    const edGuardar = document.getElementById('edGuardar');
    edDurEl.addEventListener('change', () => { selectedDur = Math.max(1, Math.min(Number(edDurEl.value)||1, PERIOD_STARTS.length)); updateSelectedText(); });

    edGuardar.addEventListener('click', async () => {
      const key = edDia.value;
      const dia = keyToDiaEsp[key] || 'Lunes';
      const inicio = selectedStart;
      const dur = selectedDur;
      const startIdx = PERIOD_STARTS.indexOf(inicio);
      const endIdx = Math.min(startIdx + dur - 1, PERIOD_STARTS.length - 1);
      const fin = addMinutes(PERIOD_STARTS[endIdx], PERIOD_LEN_MIN);
      const grupo = edGrupo.value.trim();
      const asign = edAsig.value.trim();
      const profesor = edProf.value.trim();
      if (!grupo || !asign) { if (window.UI && window.UI.showBanner) window.UI.showBanner('error','Grupo y asignatura requeridos',3500); return; }
      try {
        const res = await fetch(`${API_BASE}/api/horarios`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ grupo_nombre: grupo, asignatura_nombre: asign, profesor_nombre: profesor, dia, hora_inicio: inicio, hora_fin: fin, id_salon: roomId })
        });
        const data = await res.json().catch(()=>({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        if (window.UI && window.UI.showBanner) window.UI.showBanner('success','Horario creado',2500);
        await fetchHorarios();
        openViewer(roomId, key);
        closeEditor();
      } catch (err) {
        if (window.UI && window.UI.showBanner) window.UI.showBanner('error', err.message || 'Error al crear horario', 4000);
      }
    });
  }

  function closeEditor(){ editorModal.classList.remove('show'); }
  editorClose?.addEventListener('click', closeEditor);

  async function fetchRooms(){
    try {
      const res = await fetch(`${API_BASE}/api/salones`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json().catch(()=>[]);
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      rooms = Array.isArray(data) ? data : [];
      // Cargar horarios antes de renderizar para poder mostrar el resumen actual
      await fetchHorarios();
      renderRooms();
    } catch (err) {
      console.error('Error cargando salones:', err);
      rooms = [];
      renderRooms();
      if (window.UI && window.UI.showBanner) window.UI.showBanner('error', 'No se pudieron cargar los salones', 4000);
    }
  }

  async function crearSalon(payload){
    const res = await fetch(`${API_BASE}/api/salones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data.salon;
  }

  async function actualizarSalon(id, payload){
    const res = await fetch(`${API_BASE}/api/salones/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data.salon;
  }

  async function eliminarSalon(id){
    const res = await fetch(`${API_BASE}/api/salones/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return true;
  }

  function renderRooms(){
    if (!roomsTableBody) return;

    roomsTableBody.innerHTML = "";
    rooms.forEach(r=>{
      const estado = String(r.estado || 'Disponible');
      // Construir resumen del horario actual para este salón
      let summaryText = '—';
      let summaryTitle = 'Sin horario activo';
      const current = findCurrentHorarioForRoom(r.id_salon);
      if (current){
        const g = current.h.grupo_nombre || '-';
        const a = current.h.asignatura || '-';
        const p = current.h.profesor || '-';
        // Texto compacto para la celda
        summaryText = `${abbrDia(current.h.dia)} ${current.hi}-${current.hf} | ${shorten(g,8)} | ${shorten(a,12)} | ${shorten(p,12)}`;
        // Tooltip con detalle completo
        summaryTitle = `${current.h.dia}: ${current.hi}-${current.hf} | ${g} • ${a} • ${p}`;
      }
      const tr = document.createElement("tr");
      const summaryHtml = `<span class="room-summary" title="${summaryTitle}">${summaryText}</span>`;
      tr.innerHTML = `
        <td>${r.nombre || r.id_salon}</td>
        <td>${r.piso}</td>
        <td><span class="status-badge ${estado === "Disponible" ? "status-available" : (estado === "Ocupado" ? "status-occupied" : "status-maint")}">${estado}</span></td>
        <td style="min-width:260px; max-width:360px;">${summaryHtml}</td>
        <td>
          <button class="icon-btn view-btn" data-room="${r.id_salon}" title="Ver horario">👁️</button>
          <button class="icon-btn edit-btn" data-room="${r.id_salon}" title="Editar horario">✏️</button>
          <button class="icon-btn maint-btn" data-room="${r.id_salon}" title="Marcar mantenimiento">🛠️</button>
          <button class="icon-btn delete-btn" data-room="${r.id_salon}" title="Eliminar salón">🗑️</button>
        </td>
      `;
      roomsTableBody.appendChild(tr);
    });

    // wire events
    document.querySelectorAll(".view-btn").forEach(b => b.addEventListener("click", async ()=> {
      const rid = b.dataset.room;
      await fetchHorarios();
      if (window.AdminMngGraphics && typeof window.AdminMngGraphics.openViewer === 'function') {
        window.AdminMngGraphics.openViewer(rid);
      } else {
        openViewer(rid);
      }
    }));
    document.querySelectorAll(".maint-btn").forEach(b => b.addEventListener("click", async ()=> {
      const rid = b.dataset.room;
      const room = rooms.find(x=>String(x.id_salon)===String(rid));
      if (!room) return;
      const nuevoEstado = room.estado === 'En Mantenimiento' ? 'Disponible' : 'En Mantenimiento';
      try {
        const updated = await actualizarSalon(rid, { estado: nuevoEstado });
        // update local
        rooms = rooms.map(x=> String(x.id_salon)===String(rid) ? { ...x, estado: updated?.estado || nuevoEstado } : x);
        renderRooms();
        if (window.UI && window.UI.showBanner) window.UI.showBanner('success', `Salón actualizado: ${nuevoEstado}`, 3000);
      } catch (err) {
        if (window.UI && window.UI.showBanner) window.UI.showBanner('error', err.message || 'Error al actualizar', 4000);
      }
    }));

    document.querySelectorAll(".edit-btn").forEach(b => b.addEventListener("click", ()=> {
      const rid = b.dataset.room;
      // Legacy room editor (derecha es el editor principal por grupos)
      if (window.AdminMngGraphics && typeof window.AdminMngGraphics.openEditor === 'function') {
        window.AdminMngGraphics.openEditor(rid);
      } else {
        openEditor(rid);
      }
    }));

    // (sin botón editar salón)

    document.querySelectorAll(".delete-btn").forEach(b => b.addEventListener("click", async ()=> {
      const rid = b.dataset.room;
      if (!confirm('¿Eliminar salón?')) return;
      try {
        await eliminarSalon(rid);
        rooms = rooms.filter(x=> String(x.id_salon) !== String(rid));
        renderRooms();
        if (window.UI && window.UI.showBanner) window.UI.showBanner('success', 'Salón eliminado', 2500);
      } catch (err) {
        if (window.UI && window.UI.showBanner) window.UI.showBanner('error', err.message || 'Error al eliminar', 4000);
      }
    }));
  }

  // Botón para nuevo salón
  const roomsWrap = document.getElementById('roomsTableWrap');
  if (roomsWrap && !roomsWrap.querySelector('.rooms-actions')){
    const actions = document.createElement('div');
    actions.className = 'rooms-actions';
    actions.style.display = 'flex'; actions.style.gap = '10px'; actions.style.justifyContent = 'flex-end'; actions.style.marginBottom = '8px';
    const addBtn = document.createElement('button'); addBtn.className = 'mng-btn'; addBtn.textContent = '+ Nuevo salón';
    actions.appendChild(addBtn);
    roomsWrap.insertBefore(actions, roomsWrap.firstChild);
    addBtn.addEventListener('click', async ()=>{
      const nombre = prompt('Nombre del salón (ej. 101)'); if (!nombre) return;
      const piso = prompt('Piso (1,2,3)'); if (!piso) return;
      const tipo = prompt('Tipo (Aula/Laboratorio)'); if (!tipo) return;
      try {
        const nuevo = await crearSalon({ nombre, piso, tipo });
        rooms.push(nuevo);
        renderRooms();
        if (window.UI && window.UI.showBanner) window.UI.showBanner('success', 'Salón creado', 2500);
      } catch (err) {
        if (window.UI && window.UI.showBanner) window.UI.showBanner('error', err.message || 'Error al crear salón', 4000);
      }
    });
  }

  fetchRooms();
  // Refrescar periódicamente salones + horarios para mantener el resumen actualizado
  setInterval(fetchRooms, 60_000);

  console.log("rooms-admin.js listo — gestión de salones con backend");
});
