(function(){
  const $ = (s)=> document.querySelector(s);
  const $$ = (s)=> Array.from(document.querySelectorAll(s));

  const SC = window.SCHEDULE_CONFIG || {};
  const PERIOD_LEN_MIN = SC.PERIOD_LEN_MIN || 50;
  const PERIOD_STARTS = SC.PERIOD_STARTS || ["06:00","07:00","08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00"];
  const addMinutes = SC.addMinutes || function(hm, mins){ const [h,m]=hm.split(":").map(Number); const d=new Date(2020,0,1,h,m); d.setMinutes(d.getMinutes()+mins); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };
  const toMinutes = SC.toMinutes || function(hm){ const [hh,mm] = (hm || '').split(':').map(Number); if (Number.isNaN(hh) || Number.isNaN(mm)) return null; return hh*60 + mm; };
  const overlaps = SC.overlaps || function(aStart,aEnd,bStart,bEnd){ return !( toMinutes(aEnd) <= toMinutes(bStart) || toMinutes(bEnd) <= toMinutes(aStart) ); };
  const LAST_END = SC.LAST_END || addMinutes(PERIOD_STARTS[PERIOD_STARTS.length-1], PERIOD_LEN_MIN);

  const rowContainer = document.getElementById('rowContainer');

  let hiddenFileInput = document.getElementById('__mng_hidden_excel');
  if (!hiddenFileInput){
    hiddenFileInput = document.createElement('input');
    hiddenFileInput.type = 'file';
    hiddenFileInput.id = '__mng_hidden_excel';
    hiddenFileInput.accept = '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';
    hiddenFileInput.style.display = 'none';
    document.body.appendChild(hiddenFileInput);
  }

  let selectedFile = null;

  function showFileName(area, file){ if (!area || !file) return; const inner = area.querySelector('.import-inner') || area.querySelector('.mng-import-text') || area; inner.innerHTML = `<strong>${file.name}</strong><br><small>${(file.size/1024).toFixed(1)} KB</small>`; }

  function handleFileSelected(file, originArea){ if (!file) return; selectedFile = file; showFileName(originArea, file); console.log('Selected file:', file); }

  hiddenFileInput.addEventListener('change', (ev)=>{ const f = ev.target.files && ev.target.files[0]; handleFileSelected(f, document.getElementById('excelTab')); hiddenFileInput.value = ''; });

  // Drag and drop para Excel
  const excelDropArea = document.getElementById('excelDropArea');
  if (excelDropArea) {
    excelDropArea.addEventListener('click', () => hiddenFileInput.click());
    excelDropArea.addEventListener('dragover', (e) => { e.preventDefault(); excelDropArea.classList.add('drag-over'); });
    excelDropArea.addEventListener('dragleave', () => excelDropArea.classList.remove('drag-over'));
    excelDropArea.addEventListener('drop', (e) => {
      e.preventDefault();
      excelDropArea.classList.remove('drag-over');
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const file = files[0];
        if (file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.type === 'application/vnd.ms-excel' || file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
          handleFileSelected(file, excelDropArea);
        } else {
          alert('Solo archivos Excel (.xlsx, .xls) son permitidos');
        }
      }
    });
  }

  function buildGroupOptionsHtml(){ let out = ''; for (let n = 1; n <= 6; n++){ for (let s = 1; s <= 7; s++) out += `<option>${n}IM${s}</option>`; } for (let n = 1; n <= 6; n++){ for (let s = 1; s <= 7; s++) out += `<option>${n}IV${s}</option>`; } return out; }

  function createManualRow(prefill = {}){
    const row = document.createElement('div'); row.className = 'mng-row';
    const startOpts = PERIOD_STARTS.map(s => `<option value="${s}" ${s===prefill.inicio? 'selected':''}>${s}</option>`).join('');
    const durationOpts = [1,2,3,4].map(n => `<option value="${n}" ${String(n)===String(prefill.duration||1)?'selected':''}>${n}</option>`).join('');
    row.innerHTML = `
      <select class="mng-input-group">
        <option value="">Grupo</option>
        ${buildGroupOptionsHtml()}
      </select>

      <input type="text" class="mng-input-subject" placeholder="Asignatura" value="${prefill.asignatura || ""}">

      <input type="text" class="mng-input-profesor" placeholder="Profesor" value="${prefill.profesor || ""}">

      <select class="mng-input-day">
        <option value="">Día</option>
        <option>Lunes</option><option>Martes</option><option>Miércoles</option><option>Jueves</option><option>Viernes</option>
      </select>

      <select class="mng-input-start">
        <option value="">Inicio</option>
        ${startOpts}
      </select>

      <select class="mng-input-duration">
        ${durationOpts}
      </select>

      <div class="row-controls">
        <button class="row-add" type="button">+</button>
        <button class="row-remove" type="button">−</button>
      </div>
    `;

    const addBtn = row.querySelector('.row-add');
    const remBtn = row.querySelector('.row-remove');

    addBtn && addBtn.addEventListener('click', ()=>{ const newRow = createManualRow(); if (rowContainer){ rowContainer.appendChild(newRow); rowContainer.scrollTop = rowContainer.scrollHeight; } });
    remBtn && remBtn.addEventListener('click', ()=>{
      if (!rowContainer) return; const total = rowContainer.querySelectorAll('.mng-row').length; if (total <= 1){ row.querySelector('.mng-input-group').selectedIndex = 0; row.querySelector('.mng-input-subject').value = ''; row.querySelector('.mng-input-profesor').value = ''; row.querySelector('.mng-input-day').selectedIndex = 0; const ssel = row.querySelector('.mng-input-start'); if (ssel) ssel.selectedIndex = 0; const dsel = row.querySelector('.mng-input-duration'); if (dsel) dsel.selectedIndex = 0; return; } row.remove();
    });

    try{
      const startSelect = row.querySelector('.mng-input-start');
      const durationSelect = row.querySelector('.mng-input-duration');
      function updateDurationOptions(){
        const start = startSelect.value; if (!start){ durationSelect.innerHTML = ''; for (let i=1;i<=4;i++){ const opt = document.createElement('option'); opt.value = String(i); opt.textContent = String(i); if (i=== (prefill.duration||1)) opt.selected = true; durationSelect.appendChild(opt); } return; }
        const startIndex = PERIOD_STARTS.indexOf(start); if (startIndex === -1) return; let remaining = PERIOD_STARTS.length - startIndex; const LAST_END_LOCAL = addMinutes(PERIOD_STARTS[PERIOD_STARTS.length-1], PERIOD_LEN_MIN);
        while (remaining > 0){ const lastPeriodIndex = startIndex + remaining - 1; if (lastPeriodIndex >= PERIOD_STARTS.length){ remaining--; continue; } const end = addMinutes(PERIOD_STARTS[lastPeriodIndex], PERIOD_LEN_MIN); if ((function(hm){ const [hh,mm]=String(hm).split(':').map(Number); return hh*60+mm; })(end) <= (function(hm){ const [hh,mm]=String(hm).split(':').map(Number); return hh*60+mm; })(LAST_END_LOCAL)) break; remaining--; }
        const maxBlocks = Math.min(4, Math.max(1, remaining)); durationSelect.innerHTML = ''; for (let i=1;i<=maxBlocks;i++){ const opt = document.createElement('option'); opt.value = String(i); opt.textContent = String(i); durationSelect.appendChild(opt); }
      }
      updateDurationOptions(); startSelect.addEventListener('change', ()=> updateDurationOptions());
    }catch(e){}

    return row;
  }

  function ensureManualRows(){ if (!rowContainer) return; if (rowContainer.children.length === 0) rowContainer.appendChild(createManualRow()); }

  try{ ensureManualRows(); }catch(e){}

  const API_BASE = (location.hostname === "localhost" || location.hostname === "127.0.0.1")
    ? "http://localhost:3000"
    : "https://bdsm-production-8774.up.railway.app";
  const token = localStorage.getItem('token') || '';

  async function crearHorarioBackend(entry){
    const body = {
      grupo_nombre: entry.grupo,
      asignatura_nombre: entry.asignatura,
      profesor_nombre: entry.profesor,
      dia: entry.dia,
      hora_inicio: entry.inicio,
      hora_fin: entry.fin,
      // id_salon opcional; el ingreso manual no asigna salón aquí
    };
    const res = await fetch(`${API_BASE}/api/horarios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return true;
  }

  $$('.mng-confirm').forEach(btn => btn.addEventListener('click', async ()=>{
    const manualActive = document.getElementById('manualTab')?.classList.contains('active');
    if (manualActive && rowContainer){
      const rows = Array.from(rowContainer.querySelectorAll('.mng-row'));
      const payload = rows.map(r => {
        const inicio = r.querySelector('.mng-input-start')?.value || '';
        const duration = Number(r.querySelector('.mng-input-duration')?.value || 1);
        let fin = '';
        if (inicio){ const startIndex = PERIOD_STARTS.indexOf(inicio); if (startIndex !== -1){ const lastIdx = startIndex + duration - 1; if (lastIdx < PERIOD_STARTS.length) fin = addMinutes(PERIOD_STARTS[lastIdx], PERIOD_LEN_MIN); } }
        return {
          grupo: r.querySelector('.mng-input-group')?.value || '',
          asignatura: r.querySelector('.mng-input-subject')?.value || '',
          profesor: r.querySelector('.mng-input-profesor')?.value || '',
          dia: r.querySelector('.mng-input-day')?.value || '',
          inicio: inicio,
          fin: fin,
          duration: duration
        };
      });

      const validEntries = payload.filter(p => p.grupo && p.dia && p.inicio && p.fin);
      for (const p of validEntries){
        const s = toMinutes(p.inicio), e = toMinutes(p.fin);
        if (s === null || e === null){ window.UI.showBanner('error', `Hora inválida en fila del grupo ${p.grupo}.`, 5000); return; }
        if (e <= s){ window.UI.showBanner('error', `El periodo de ${p.grupo} en ${p.dia} tiene fin anterior o igual al inicio (${p.inicio} - ${p.fin}).`, 5000); return; }
        if (!PERIOD_STARTS.includes(p.inicio)){ window.UI.showBanner('error', `Inicio inválido: ${p.inicio}. Debe coincidir con los inicios de periodo.`, 5000); return; }
        const startIndex = PERIOD_STARTS.indexOf(p.inicio); if (startIndex === -1){ window.UI.showBanner('error', `Inicio inválido para ${p.grupo}: ${p.inicio}.`, 5000); return; }
        const lastIdx = startIndex + (p.duration || 1) - 1; if (lastIdx >= PERIOD_STARTS.length){ window.UI.showBanner('error', `Duración excede el rango diario para ${p.grupo} (${p.inicio}).`, 5000); return; }
        const expectedEnd = addMinutes(PERIOD_STARTS[lastIdx], PERIOD_LEN_MIN);
        if (toMinutes(p.fin) !== toMinutes(expectedEnd)){ window.UI.showBanner('error', `Duración inválida para ${p.grupo} (${p.inicio} - ${p.fin}). Debe abarcar bloques enteros y terminar en ${expectedEnd}.`, 5000); return; }
        if (toMinutes(p.fin) > toMinutes(LAST_END)){ window.UI.showBanner('error', `Horario excede el final del día escolar (${LAST_END}).`, 5000); return; }
      }

      const byKey = {};
      validEntries.forEach((p) => { const key = `${p.grupo}||${p.dia}`; byKey[key] = byKey[key] || []; byKey[key].push(p); });
      for (const key in byKey){ const arr = byKey[key]; for (let i=0;i<arr.length;i++){ for (let j=i+1;j<arr.length;j++){ const a = arr[i], b = arr[j]; if (a.inicio === b.inicio && a.fin === b.fin){ window.UI.showBanner('error', `Periodo duplicado para ${a.grupo} (${a.dia}): ${a.inicio} - ${a.fin}`, 5000); return; } if (overlaps(a.inicio, a.fin, b.inicio, b.fin)){ window.UI.showBanner('error', `Periodos que se solapan para ${a.grupo} (${a.dia}): ${a.inicio}-${a.fin} y ${b.inicio}-${b.fin}`, 5000); return; } } } }

      const dayMap = { 'Lunes':'mon', 'Martes':'tue', 'Miércoles':'wed', 'Miercoles':'wed', 'Jueves':'thu', 'Viernes':'fri' };
      const db = window.AdminMngSchedule && window.AdminMngSchedule.scheduleDb ? window.AdminMngSchedule.scheduleDb : {};
      for (const p of validEntries){
        const weekday = dayMap[p.dia] || 'mon';
        const startIndex = PERIOD_STARTS.indexOf(p.inicio);
        const duration = p.duration || 1;
        
        for (const period in db){
          const weekdayMap = db[period];
          if (!weekdayMap || !weekdayMap[weekday]) continue;
          const periodEntries = weekdayMap[weekday] || [];
          
          for (const existing of periodEntries){
            if (existing.grupo === p.grupo){
              const existingStart = existing.inicio;
              const existingEnd = addMinutes(existingStart, PERIOD_LEN_MIN * (existing.duration || 1));
              if (overlaps(p.inicio, p.fin, existingStart, existingEnd)){
                if (window.UI && window.UI.showBanner) window.UI.showBanner('error', `El grupo ${p.grupo} ya tiene un periodo en ${p.dia} que se solapa: ${existingStart} - ${existingEnd}. No se puede añadir ${p.inicio} - ${p.fin}.`, 5000); return;
              }
            }
          }
        }
      }

      // Enviar al backend
      let okCount = 0, errCount = 0;
      for (const p of validEntries){
        try {
          await crearHorarioBackend(p);
          okCount++;
        } catch (err) {
          errCount++;
          console.error('Error creando horario:', err);
        }
      }

      if (window.UI && window.UI.showBanner) {
        if (okCount) window.UI.showBanner('success', `Guardado: ${okCount} horario(s) creado(s).`, 4000);
        if (errCount) window.UI.showBanner('error', `${errCount} horario(s) no se pudieron crear.`, 5000);
      }

      // Notificar al panel de grupos para refrescar desde backend
      try { if (window.GroupsAdmin && typeof window.GroupsAdmin.refresh === 'function') window.GroupsAdmin.refresh(); } catch(e) {}
    } else {
      // Importar Excel
      if (!selectedFile) {
        if (window.UI && window.UI.showBanner) window.UI.showBanner('error', 'Selecciona un archivo Excel primero.', 5000);
        return;
      }

      const formData = new FormData();
      formData.append('excel', selectedFile);

      try {
        const res = await fetch(`${API_BASE}/api/data/import/horarios`, {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token },
          body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || JSON.stringify(data));
        if (window.UI && window.UI.showBanner) window.UI.showBanner('success', 'Importación completada: ' + JSON.stringify(data), 5000);
        // Limpiar archivo seleccionado
        selectedFile = null;
        const excelDropArea = document.getElementById('excelDropArea');
        if (excelDropArea) excelDropArea.querySelector('.import-inner').innerHTML = '<strong>Seleccionar Archivo Excel</strong><br>Arrastra y suelta aquí o haz clic para seleccionar';
      } catch (err) {
        if (window.UI && window.UI.showBanner) window.UI.showBanner('error', 'Error en importación: ' + err.message, 5000);
      }
    }

    if (window.MNGModal && typeof window.MNGModal.hide === 'function') window.MNGModal.hide();
  }));

  // top buttons wiring
  try{
    const topExcelBtn = document.getElementById('mngExcelBtn');
    const topManualBtn = document.getElementById('mngManualBtn');
    const overlay = document.getElementById('mngModal');
    const switchLocalTab = (id)=>{
      const btns = Array.from(document.querySelectorAll('.modal-tab'));
      const contents = Array.from(document.querySelectorAll('.modal-tab-content'));
      btns.forEach(b => b.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));
      const btn = btns.find(b => b.dataset && b.dataset.tab === id);
      const content = document.getElementById(id);
      if (btn) btn.classList.add('active');
      if (content) content.classList.add('active');
      if (id === 'manualTab' && window.AdminMngSchedule && typeof window.AdminMngSchedule.ensureManualRows === 'function') window.AdminMngSchedule.ensureManualRows();
    };
    const showOverlay = (tabId)=>{
      try {
        // Cerrar cualquier otro modal abierto que pueda tapar
        document.querySelectorAll('.modal-overlay.show, .mng-modal-overlay.show').forEach(o=>{
          o.classList.remove('show');
          const c = o.querySelector('.modal-card, .mng-modal');
          if (c) { c.classList.remove('enter'); c.classList.add('leave'); setTimeout(()=>{ try{ c.classList.remove('leave'); }catch(e){} }, 360); }
        });
      } catch(e) {}

      if (window.MNGModal && typeof window.MNGModal.show === 'function') {
        window.MNGModal.show(tabId || 'manualTab');
        if (window.MNGModal.switchTab && tabId) {
          try { window.MNGModal.switchTab(tabId); } catch(e){}
        }
      } else if (overlay) {
        overlay.classList.add('show');
        const card = overlay.querySelector('.mng-modal');
        if (card) { card.classList.remove('leave'); requestAnimationFrame(()=> card.classList.add('enter')); }
        switchLocalTab(tabId || 'manualTab');
      }
      // Asegurar filas manuales disponibles
      try { window.AdminMngSchedule && window.AdminMngSchedule.ensureManualRows && window.AdminMngSchedule.ensureManualRows(); } catch(e){}
    };

    topExcelBtn && topExcelBtn.addEventListener('click', ()=>{
      topExcelBtn.classList.add('active');
      topManualBtn && topManualBtn.classList.remove('active');
      showOverlay('excelTab');
    });
    topManualBtn && topManualBtn.addEventListener('click', ()=>{
      topManualBtn.classList.add('active');
      topExcelBtn && topExcelBtn.classList.remove('active');
      showOverlay('manualTab');
    });
  }catch(e){ console.error('Error wiring manual/excel buttons:', e); }

  const scheduleDb = (window.SCHEDULE_CONFIG && window.SCHEDULE_CONFIG.scheduleDb) ? window.SCHEDULE_CONFIG.scheduleDb : {};
  PERIOD_STARTS.forEach(ps => {
    if (!scheduleDb[ps]) scheduleDb[ps] = {};
    ['mon','tue','wed','thu','fri'].forEach(wd => {
      if (!scheduleDb[ps][wd]) scheduleDb[ps][wd] = [];
    });
  });
  if (window.SCHEDULE_CONFIG) window.SCHEDULE_CONFIG.scheduleDb = scheduleDb;

  window.AdminMngSchedule = {
    PERIOD_STARTS,
    PERIOD_LEN_MIN,
    addMinutes,
    toMinutes,
    overlaps,
    LAST_END,
    scheduleDb,
    ensureManualRows
  };
})();
