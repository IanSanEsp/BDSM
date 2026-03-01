(function(){
  try{

    function getSched(){ return window.AdminMngSchedule || {}; }
    function getSC(){ return window.SCHEDULE_CONFIG || {}; }
    const API_BASE = (location.hostname === "localhost" || location.hostname === "127.0.0.1")
      ? "http://localhost:3000"
      : "https://bdsm-production-8774.up.railway.app";
    const token = localStorage.getItem('token') || '';
    
    function getPeriodData(){
      const sched = getSched();
      return {
        PERIOD_STARTS: sched.PERIOD_STARTS || [],
        PERIOD_LEN_MIN: sched.PERIOD_LEN_MIN || 50,
        addMinutes: sched.addMinutes || function(hm, mins){ const [h,m]=hm.split(":").map(Number); const d=new Date(2020,0,1,h,m); d.setMinutes(d.getMinutes()+mins); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; },
        toMinutes: sched.toMinutes || function(hm){ const [hh,mm] = (hm || '').split(':').map(Number); if (Number.isNaN(hh) || Number.isNaN(mm)) return null; return hh*60 + mm; },
        overlaps: sched.overlaps || function(aStart,aEnd,bStart,bEnd){ const toMin = function(hm){ const [hh,mm] = (hm || '').split(':').map(Number); if (Number.isNaN(hh) || Number.isNaN(mm)) return null; return hh*60 + mm; }; return !( toMin(aEnd) <= toMin(bStart) || toMin(bEnd) <= toMin(aStart) ); },
        scheduleDb: sched.scheduleDb || {}
      };
    }

    const viewerModal = document.getElementById('viewerModal');
    const viewerClose = document.getElementById('viewerClose');
    const viewerTitle = document.getElementById('viewerTitle');
    const viewerBody = document.getElementById('viewerBody');

    const editorModal = document.getElementById('editorModal');
    const editorClose = document.getElementById('editorClose');
    const editorRoomLabel = document.getElementById('editorRoomLabel');
    const periodStrip = document.getElementById('periodStrip');
    const blockOptions = document.getElementById('blockOptions');
    const blockInfo = document.getElementById('blockInfo');
    const selectedBlockText = document.getElementById('selectedBlockText');

    function openViewer(roomId){
      if (!viewerModal || !viewerBody || !viewerTitle) return;
      const p = getPeriodData();
      const { toMinutes } = p;
      const diaMap = { mon:'Lunes', tue:'Martes', wed:'Miércoles', thu:'Jueves', fri:'Viernes' };
      // Resolver nombre del salón desde backend
      async function getSalonName(id){
        try {
          const res = await fetch(`${API_BASE}/api/salones`, { headers: { 'Authorization': `Bearer ${token}` } });
          const data = await res.json().catch(()=>[]);
          const arr = Array.isArray(data) ? data : [];
          const s = arr.find(x => String(x.id_salon) === String(id));
          return s?.nombre || String(id);
        } catch(e){ return String(id); }
      }
      (async () => { viewerTitle.textContent = `Horario Salón ${await getSalonName(roomId)}`; })();
      viewerBody.innerHTML = '';

      // Day selector
      const dateWrap = document.createElement('div');
      dateWrap.style.display = 'flex'; dateWrap.style.gap = '8px'; dateWrap.style.alignItems = 'center'; dateWrap.style.marginBottom = '8px';
      const lbl = document.createElement('label'); lbl.textContent = 'Día:'; lbl.style.fontWeight = '600';
      const sel = document.createElement('select'); sel.style.height = '34px'; sel.style.padding = '4px';
      const dayOpts = [{ key: 'mon', label: 'Lun' }, { key: 'tue', label: 'Mar' }, { key: 'wed', label: 'Mié' }, { key: 'thu', label: 'Jue' }, { key: 'fri', label: 'Vie' }];
      dayOpts.forEach(d => { const o = document.createElement('option'); o.value = d.key; o.textContent = d.label; sel.appendChild(o); });

      dateWrap.appendChild(lbl); dateWrap.appendChild(sel); viewerBody.appendChild(dateWrap);

      function nowHM(){ const d=new Date(); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
      function diaHoyEsp(){ const m = {0:'Domingo',1:'Lunes',2:'Martes',3:'Miércoles',4:'Jueves',5:'Viernes',6:'Sábado'}; return m[new Date().getDay()] || 'Lunes'; }

      async function fetchHorarios(){
        try {
          const res = await fetch(`${API_BASE}/api/horarios`);
          const data = await res.json().catch(()=>({ horarios: [] }));
          const all = Array.isArray(data.horarios) ? data.horarios : [];
          return all.filter(h => String(h.id_salon)===String(roomId));
        } catch(e){ return []; }
      }

      function renderTableForDay(horarios, diaEsp){
        const existingTable = viewerBody.querySelector('table');
        if (existingTable) existingTable.remove();

        const table = document.createElement('table');
        table.className = 'viewer-table';
        table.innerHTML = `<thead><tr><th>Hora</th><th>Grupo</th><th>Asignatura</th><th>Profesor</th></tr></thead>`;
        const tbody = document.createElement('tbody');

        const list = horarios.filter(h => String(h.dia)===diaEsp);
        const esHoy = diaHoyEsp() === diaEsp;
        let currentId = null;
        if (esHoy){
          const nowMins = toMinutes(nowHM());
          for (const h of list){
            const hi = String(h.hora_inicio||'').slice(0,5);
            const hf = String(h.hora_fin||'').slice(0,5);
            const hiM = toMinutes(hi); const hfM = toMinutes(hf);
            if (hiM !== null && hfM !== null && hiM <= nowMins && nowMins < hfM){ currentId = h.id_horario; break; }
          }
        }

        if (!list.length){
          const tr = document.createElement('tr');
          tr.innerHTML = `<td colspan="4" class="schedule-empty">Sin horarios para ${diaEsp}</td>`;
          tbody.appendChild(tr);
        } else {
          list.sort((a,b) => String(a.hora_inicio).localeCompare(String(b.hora_inicio)));
          list.forEach(h => {
            const hi = String(h.hora_inicio||'').slice(0,5);
            const hf = String(h.hora_fin||'').slice(0,5);
            const g = h.grupo_nombre || '-';
            const a = h.asignatura || '-';
            const p = h.profesor || '-';
            const isCurrent = currentId && Number(h.id_horario) === Number(currentId);
            const tr = document.createElement('tr');
            if (isCurrent){ tr.style.background = '#fff3cd'; }
            tr.innerHTML = `<td>${hi} - ${hf}${isCurrent ? ' <span class="badge" style="margin-left:6px">Ahora</span>' : ''}</td><td>${g}</td><td>${a}</td><td>${p}</td>`;
            tbody.appendChild(tr);
          });
        }

        table.appendChild(tbody);
        viewerBody.appendChild(table);
      }

      // Initial render
      (async () => {
        const horarios = await fetchHorarios();
        const diaEsp = diaMap[sel.value || 'mon'] || 'Lunes';
        renderTableForDay(horarios, diaEsp);
        sel.addEventListener('change', async () => {
          const horarios2 = await fetchHorarios();
          const dEsp = diaMap[sel.value || 'mon'] || 'Lunes';
          renderTableForDay(horarios2, dEsp);
        });
      })();

      viewerModal.classList.add('show');
    }

    function openEditor(roomId){
      if (!editorModal || !periodStrip || !blockOptions || !blockInfo) return;
      if (editorRoomLabel) editorRoomLabel.textContent = ` #${roomId}`;
      
      const p = getPeriodData();
      const { PERIOD_STARTS, PERIOD_LEN_MIN, addMinutes, toMinutes, scheduleDb } = p;
      
      let selectedPeriodStart = null;
      let selectedDay = 'mon';
      let dayWrapCreated = false;
      
      if (!editorModal.classList.contains('show')) {
        periodStrip.innerHTML = ''; 
        blockOptions.innerHTML = ''; 
        if (selectedBlockText) selectedBlockText.textContent = '';
      }
      
      // Create day selector once
      if (!dayWrapCreated) {
        let dayWrap = blockInfo.querySelector('.day-selector-wrap');
        if (!dayWrap) {
          dayWrap = document.createElement('div');
          dayWrap.className = 'day-selector-wrap';
          dayWrap.style.display = 'flex';
          dayWrap.style.gap = '8px';
          dayWrap.style.alignItems = 'center';
          dayWrap.style.marginBottom = '12px';
          const dayLabel = document.createElement('label');
          dayLabel.textContent = 'Día:';
          dayLabel.style.fontWeight = '600';
          dayLabel.style.color = 'var(--guinda)';
          const daySel = document.createElement('select');
          daySel.className = 'day-selector';
          daySel.style.height = '34px';
          daySel.style.padding = '4px 8px';
          daySel.style.borderRadius = '6px';
          daySel.style.border = '1px solid rgba(0,0,0,0.06)';
          const dayOpts = [{ key: 'mon', label: 'Lunes' }, { key: 'tue', label: 'Martes' }, { key: 'wed', label: 'Miércoles' }, { key: 'thu', label: 'Jueves' }, { key: 'fri', label: 'Viernes' }];
          dayOpts.forEach(d => { const o = document.createElement('option'); o.value = d.key; o.textContent = d.label; daySel.appendChild(o); });
          dayWrap.appendChild(dayLabel);
          dayWrap.appendChild(daySel);
          blockInfo.insertBefore(dayWrap, blockInfo.firstChild);
          
          daySel.addEventListener('change', function() {
            selectedDay = this.value;
            // Solo actualizar las opciones, no reiniciar todo
            if (selectedPeriodStart) {
              updateBlockOptions(selectedDay, selectedPeriodStart);
            }
          });
          dayWrapCreated = true;
        }
      }
      
      const daySel = blockInfo.querySelector('.day-selector');
      if (daySel) selectedDay = daySel.value;
      
      // Function to update block options using backend
      async function updateBlockOptions(day, periodStart) {
        blockOptions.innerHTML = '';
        if (selectedBlockText) selectedBlockText.textContent = `Período seleccionado: ${periodStart}`;

        const diaMap = { mon:'Lunes', tue:'Martes', wed:'Miércoles', thu:'Jueves', fri:'Viernes' };
        const diaEsp = diaMap[day] || 'Lunes';
        const endTime = addMinutes(periodStart, PERIOD_LEN_MIN);

        let rows = [];
        try {
          const url = `${API_BASE}/api/horarios/por-bloque?dia=${encodeURIComponent(diaEsp)}&hora_inicio=${encodeURIComponent(periodStart)}&hora_fin=${encodeURIComponent(endTime)}`;
          const res = await fetch(url);
          const data = await res.json().catch(()=>({ horarios: [] }));
          rows = Array.isArray(data.horarios) ? data.horarios : [];
        } catch(e) { rows = []; }

        if (!rows.length){
          const empty = document.createElement('div');
          empty.style.color = '#999';
          empty.style.padding = '12px';
          empty.textContent = 'Sin horarios para este período';
          blockOptions.appendChild(empty);
          return;
        }

        rows.forEach(h => {
          const el = document.createElement('div');
          el.className = 'option-card';
          const inicio = (h.hora_inicio || '').slice(0,5);
          const fin = (h.hora_fin || '').slice(0,5);
          const salonText = h.id_salon ? `#${h.id_salon}` : 'sin asignar';
          el.innerHTML = `
            <div class="option-left">${h.grupo_nombre || ''} — ${h.asignatura || ''}</div>
            <div class="option-right">${h.profesor || ''} | ${inicio} - ${fin} (Salón: ${salonText})</div>
          `;

          // If already assigned to this room, show badge
          if (String(h.id_salon) === String(roomId)){
            const badge = document.createElement('span');
            badge.className = 'small-muted';
            badge.style.marginLeft = '8px';
            badge.textContent = 'Asignado a este salón';
            el.appendChild(badge);

            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-btn';
            removeBtn.type = 'button';
            removeBtn.title = 'Desasignar de este salón';
            removeBtn.textContent = '❌';
            removeBtn.style.marginLeft = '8px';
            removeBtn.addEventListener('click', async (ev) => {
              ev.stopPropagation();
              try {
                const res = await fetch(`${API_BASE}/api/horarios/${encodeURIComponent(h.id_horario)}/desasignar-salon`, {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${token}` }
                });
                const d = await res.json().catch(()=>({}));
                if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
                if (window.UI && window.UI.showBanner) window.UI.showBanner('success', 'Horario desasignado.', 3000);
                updateBlockOptions(day, periodStart);
              } catch(err) {
                if (window.UI && window.UI.showBanner) window.UI.showBanner('error', err.message || 'No se pudo desasignar.', 5000);
              }
            });
            el.appendChild(removeBtn);
          } else {
            el.style.cursor = 'pointer';
            el.title = h.id_salon ? `Asignado en salón ${h.id_salon}` : 'Asignar a este salón';
            el.addEventListener('click', async () => {
              try {
                const res = await fetch(`${API_BASE}/api/horarios/${encodeURIComponent(h.id_horario)}/asignar-salon`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                  body: JSON.stringify({ id_salon: roomId })
                });
                const d = await res.json().catch(()=>({}));
                if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
                if (window.UI && window.UI.showBanner) window.UI.showBanner('success', 'Horario asignado al salón.', 3000);
                // refresh options
                updateBlockOptions(day, periodStart);
              } catch(err) {
                if (window.UI && window.UI.showBanner) window.UI.showBanner('error', err.message || 'No se pudo asignar.', 5000);
              }
            });
          }

          blockOptions.appendChild(el);
        });
      }
      
      // Create period cards
      if (periodStrip.children.length === 0) {
        PERIOD_STARTS.forEach((ps, idx) => {
          const pEnd = addMinutes(ps, PERIOD_LEN_MIN);
          const card = document.createElement('div'); 
          card.className = 'period-card'; 
          card.dataset.timespan = `${ps}-${pEnd}`; 
          card.dataset.index = String(idx);
          card.dataset.start = ps;
          card.innerHTML = `<div class="period-time">${ps} - ${pEnd}</div><div class="period-meta small-muted">Seleccionar</div>`;
          
          card.addEventListener('click', function(e) {
            e.stopPropagation();
            periodStrip.querySelectorAll('.period-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            
            selectedPeriodStart = ps;
            const daySel = blockInfo.querySelector('.day-selector');
            const currentDay = daySel ? daySel.value : 'mon';
            updateBlockOptions(currentDay, ps);
          });
          
          periodStrip.appendChild(card);
        });
      }
      
      editorModal.classList.add('show');
    }

    viewerClose && viewerClose.addEventListener('click', () => { if (viewerModal) viewerModal.classList.remove('show'); });
    editorClose && editorClose.addEventListener('click', () => { if (editorModal) editorModal.classList.remove('show'); });

    let currentEditingRoomId = null;

    function onAssignmentChange(roomId){
      const ev = new CustomEvent('adminMng:assignmentsChanged', { detail: { roomId } });
      window.dispatchEvent(ev);
      if (window._rooms_admin_mock && window._rooms_admin_mock.renderRooms) try{ window._rooms_admin_mock.renderRooms(); }catch(e){}
    }

    window.AdminMngGraphics = { openViewer, openEditor, onAssignmentChange };
  }catch(e){ console.error(e); }
  console.log('graphics-mng.js loaded');
})();
