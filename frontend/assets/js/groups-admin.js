document.addEventListener("DOMContentLoaded", () => {

  const API_BASE = (location.hostname === "localhost" || location.hostname === "127.0.0.1")
    ? "http://localhost:3000"
    : "https://bdsm-production-0032.up.railway.app";

  let groups = [];
  let horariosCache = [];
  const token = localStorage.getItem('token') || '';

  /* --------------------
     DOM refs
     -------------------- */
  const list12 = document.getElementById("list-seg-12");
  const list34 = document.getElementById("list-seg-34");
  const list56 = document.getElementById("list-seg-56");

  const shiftButtons = document.querySelectorAll(".shift-btn");

  const viewModal = document.getElementById("groupViewModal");
  const viewClose = document.getElementById("groupViewClose");
  const viewTitle = document.getElementById("groupViewTitle");
  const viewContent = document.getElementById("groupViewContent");
  const openEditorBtn = document.getElementById("openGroupEditor");

  const editModal = document.getElementById("groupEditModal");
  const editClose = document.getElementById("groupEditClose");
  const editLabel = document.getElementById("groupEditLabel");
  const editTableBody = document.querySelector("#groupEditTable tbody");
  const addEditRowBtn = document.getElementById("addEditRow");
  const saveEditBtn = document.getElementById("saveGroupSchedule");

  let activeShift = "matutino";
  let currentViewingGroup = null;
  let currentEditingGroup = null;

  const SCHED = window.AdminMngSchedule || {};
  const toMinutes = SCHED.toMinutes || function(hm){ const [h,m]=hm.split(":").map(Number); return h*60 + m; };
  const addMinutes = SCHED.addMinutes || function(hm, mins){ const [h,m] = hm.split(":").map(Number); const d = new Date(2020,0,1,h,m); d.setMinutes(d.getMinutes() + mins); return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; };
  const overlaps = SCHED.overlaps || function(aStart,aEnd,bStart,bEnd){ return !( toMinutes(aEnd) <= toMinutes(bStart) || toMinutes(bEnd) <= toMinutes(aStart) ); };
  const PERIOD_LEN_MIN = SCHED.PERIOD_LEN_MIN || 50;
  const PERIOD_STARTS = SCHED.PERIOD_STARTS || [
    "06:00","07:00","08:00","09:00","10:00",
    "11:00","12:00","13:00","14:00","15:00",
    "16:00","17:00","18:00","19:00","20:00"
  ];
  const LAST_END = SCHED.LAST_END || addMinutes(PERIOD_STARTS[PERIOD_STARTS.length-1], PERIOD_LEN_MIN);

  // Period grid (SCHEDULE_CONFIG)

  const keyToDiaEsp = { mon: 'Lunes', tue: 'Martes', wed: 'Miércoles', thu: 'Jueves', fri: 'Viernes' };

  async function fetchHorarios(){
    try {
      const res = await fetch(`${API_BASE}/api/horarios`);
      const data = await res.json().catch(()=>({ horarios: [] }));
      horariosCache = Array.isArray(data.horarios) ? data.horarios : [];
      buildGroupsFromHorarios();
      renderAllLists();
    } catch (err) {
      console.error('Error cargando horarios:', err);
      horariosCache = [];
      groups = [];
      renderAllLists();
      if (window.UI && window.UI.showBanner) window.UI.showBanner('error','No se pudieron cargar horarios desde la base de datos',4000);
    }
  }

  function buildGroupsFromHorarios(){
    const map = new Map();
    horariosCache.forEach(h => {
      const nombre = String(h.grupo_nombre || '').trim();
      if (!nombre) return;
      if (!map.has(nombre)){
        const sem = Number(nombre[0]) || 0;
        const seg = sem <= 2 ? '12' : (sem <= 4 ? '34' : '56');
        const shift = /IM/i.test(nombre) ? 'matutino' : (/IV/i.test(nombre) ? 'vespertino' : 'matutino');
        map.set(nombre, { id: map.size + 1, name: nombre, seg, shift });
      }
    });
    groups = Array.from(map.values());
  }

  function getSchedulesForGroup(groupName, weekday){
    const diaEsp = keyToDiaEsp[weekday] || 'Lunes';
    const list = horariosCache.filter(h => String(h.grupo_nombre) === String(groupName) && String(h.dia) === diaEsp);
    const schedules = list.map(h => ({
      asignatura: h.asignatura || '',
      profesor: h.profesor || '',
      inicio: (h.hora_inicio || '').slice(0,5),
      fin: (h.hora_fin || '').slice(0,5)
    }));
    return schedules.sort((a,b) => toMinutes(a.inicio) - toMinutes(b.inicio));
  }

  const WEEKDAY_KEYS = ['mon','tue','wed','thu','fri'];
  const WEEKDAY_LABELS = ['Lun','Mar','Mié','Jue','Vie'];
  function weekdayFromDateISO(iso){ if(!iso) return null; const d = new Date(iso + 'T00:00:00'); const k = d.getDay(); // 0 Sun .. 6 Sat
    const map = {1:'mon',2:'tue',3:'wed',4:'thu',5:'fri'}; return map[k] || null; }
  function todayWeekdayKey(){ const k = new Date().getDay(); return ({1:'mon',2:'tue',3:'wed',4:'thu',5:'fri'})[k] || 'mon'; }
  let currentSelectedWeekdayGroups = todayWeekdayKey();

  /* --------------------
     Render lists
     -------------------- */
  function renderAllLists(){
    renderListForSegment("12", list12);
    renderListForSegment("34", list34);
    renderListForSegment("56", list56);
  }

  (function injectGroupsWeekdaySelector(){
    const top = document.querySelector('.groups-top');
    if (!top) return;
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex'; wrapper.style.alignItems = 'center'; wrapper.style.gap = '8px';
    const lbl = document.createElement('label'); lbl.textContent = 'Día:'; lbl.style.fontWeight = '600';
    const sel = document.createElement('select'); sel.style.height = '34px'; sel.style.padding = '4px';
    WEEKDAY_KEYS.forEach((k,i)=>{ const o = document.createElement('option'); o.value = k; o.textContent = WEEKDAY_LABELS[i]; if(k===currentSelectedWeekdayGroups) o.selected = true; sel.appendChild(o); });
    sel.addEventListener('change', ()=>{
      currentSelectedWeekdayGroups = sel.value;
      renderAllLists();
      syncGroupListHeights();
    });
    wrapper.appendChild(lbl); wrapper.appendChild(sel);
    top.insertBefore(wrapper, top.firstChild);
  })();

  function renderListForSegment(seg, container){
    if (!container) return;
    container.innerHTML = "";

    const filtered = groups.filter(g => {
      if (g.seg !== seg) return false;
      if (typeof g.shift === 'string') return g.shift === activeShift;
      // 'IM' -> matutino, 'IV' -> vespertino
      if (activeShift === 'matutino') return /IM/i.test(g.name);
      return /IV/i.test(g.name);
    });

    if (filtered.length === 0) {
      container.innerHTML = `<div class="small-muted">No hay grupos.</div>`;
      return;
    }

    filtered.forEach(g => {
      const row = document.createElement("div");
      row.className = "group-row";
      const horarios = getSchedulesForGroup(g.name, currentSelectedWeekdayGroups);
      
      let summary = "—";
      if (horarios.length){
        const starts = horarios.map(h=>h.inicio).sort((a,b)=> toMinutes(a) - toMinutes(b));
        const ends = horarios.map(h=>h.fin).sort((a,b)=> toMinutes(b) - toMinutes(a));
        const earliest = starts[0];
        const latest = ends[0];
        summary = `${earliest} — ${latest}`;
      }

      row.innerHTML = `
        <div class="info">
          <div class="group-name">${g.name}</div>
          <div class="group-hours">${summary}</div>
        </div>
        <div class="group-actions">
          <button class="icon-btn view-group" data-id="${g.id}" title="Ver horario">👁️</button>
        </div>
      `;
      container.appendChild(row);
    });

    container.querySelectorAll(".view-group").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const gid = Number(btn.dataset.id);
        openGroupView(gid);
      });
    });
  }

  shiftButtons.forEach(b => {
    b.addEventListener("click", () => {
      shiftButtons.forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      activeShift = b.dataset.shift;
      renderAllLists();
    });
  });

  /* --------------------
     View modal
     -------------------- */
  function openGroupView(groupId){
    currentViewingGroup = groupId;
    const g = groups.find(x=>x.id===groupId);
    const groupName = g ? g.name : '';
    viewTitle.textContent = `Horario ${groupName}`;
    
    // Get schedules db
    const arr = getSchedulesForGroup(groupName, currentSelectedWeekdayGroups);
    
    const wkIdx = WEEKDAY_KEYS.indexOf(currentSelectedWeekdayGroups);
    const wkLabel = wkIdx !== -1 ? WEEKDAY_LABELS[wkIdx] : currentSelectedWeekdayGroups;
    
    if (arr.length === 0){
      viewContent.innerHTML = `<div class="small-muted">Este grupo no tiene horario asignado para ${wkLabel}.</div>`;
    } else {
      const table = document.createElement("table");
      table.className = "viewer-table";
      table.innerHTML = `<thead><tr><th>Asignatura</th><th>Profesor</th><th>Horario</th></tr></thead>`;
      const tb = document.createElement("tbody");
      arr.forEach(r => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${r.asignatura}</td><td>${r.profesor}</td><td style="text-align:center">${r.inicio} - ${r.fin}</td>`;
        tb.appendChild(tr);
      });
      table.appendChild(tb);
      viewContent.innerHTML = "";
      viewContent.appendChild(table);
    }
    // show modal
    if (viewModal) viewModal.classList.add("show");
  }

  if (viewClose) viewClose.addEventListener("click", ()=> { if (viewModal) viewModal.classList.remove("show"); currentViewingGroup = null; });
  if (viewModal) viewModal.addEventListener("click", (e)=> { if (e.target === viewModal) { viewModal.classList.remove("show"); currentViewingGroup = null; } });

  if (openEditorBtn) {
    openEditorBtn.addEventListener("click", ()=> {
      if (!currentViewingGroup) return;
      if (viewModal) viewModal.classList.remove("show");
      openGroupEditor(currentViewingGroup);
    });
  }

  /* --------------------
     Editor modal - abrir y manejar
     -------------------- */
  function openGroupEditor(groupId){
    currentEditingGroup = groupId;
    const g = groups.find(x=>x.id===groupId);
    if (editLabel) editLabel.textContent = ` ${g ? g.name : groupId}`;
    rebuildEditTable();
    if (editModal) editModal.classList.add("show");
  }

  if (editClose) editClose.addEventListener("click", ()=> { if (editModal) editModal.classList.remove("show"); currentEditingGroup = null; });
  if (editModal) editModal.addEventListener("click", (e)=> { if (e.target === editModal) { editModal.classList.remove("show"); currentEditingGroup = null; } });

  function rebuildEditTable(){
    if (!editTableBody) return;
    editTableBody.innerHTML = "";
    
    const g = groups.find(x=>x.id===currentEditingGroup);
    const groupName = g ? g.name : '';
    
    const rows = getSchedulesForGroup(groupName, currentSelectedWeekdayGroups);
    
    if (rows.length === 0){
      addEditRow({ asignatura: "", profesor: "", inicio: "", fin: "", duration: 1, weekday: currentSelectedWeekdayGroups });
    } else {
      rows.forEach(r => addEditRow(r));
    }
  }

  function addEditRow(data){
    if (!editTableBody) return;
    const tr = document.createElement("tr");
    const startVal = data.inicio || '';
    const durationVal = data.duration || 1;
    const startOptions = PERIOD_STARTS.map(s => `<option value="${s}" ${s===startVal? 'selected' : ''}>${s}</option>`).join('');
    const salonText = data.salon ? String(data.salon) : '';
    tr.innerHTML = `
      <td class="salon-cell">${salonText ? `<span class="salon-label">${salonText}</span>` : `<span class="salon-label small-muted">—</span>`}</td>
      <td><input type="text" class="inp asignatura" value="${data.asignatura || ''}" placeholder="Asignatura"></td>
      <td><input type="text" class="inp profesor" value="${data.profesor || ''}" placeholder="Profesor"></td>
      <td>
        <select class="inp inicio">${startOptions}</select>
      </td>
      <td>
        <select class="inp duration">
          <option value="1" ${durationVal==1? 'selected':''}>1</option>
          <option value="2" ${durationVal==2? 'selected':''}>2</option>
          <option value="3" ${durationVal==3? 'selected':''}>3</option>
          <option value="4" ${durationVal==4? 'selected':''}>4</option>
        </select>
      </td>
      <td><button class="del-row">−</button></td>
    `;
    tr.querySelector(".del-row").addEventListener("click", ()=> { tr.remove(); });
    editTableBody.appendChild(tr);
    // limit duration 
    try {
      const inicioSelect = tr.querySelector('.inicio');
      const durationSelect = tr.querySelector('.duration');
      function updateDurationOptions(){
        const start = inicioSelect.value;
        const startIndex = PERIOD_STARTS.indexOf(start);
        if (startIndex === -1) return;
        const remaining = PERIOD_STARTS.length - startIndex;
        const maxBlocks = Math.min(4, remaining);
        durationSelect.innerHTML = '';
        for (let i=1;i<=maxBlocks;i++){
          const opt = document.createElement('option'); opt.value = String(i); opt.textContent = String(i);
          if (i === durationVal) opt.selected = true;
          durationSelect.appendChild(opt);
        }
      }
      updateDurationOptions();
      inicioSelect.addEventListener('change', updateDurationOptions);
    }catch(e){}
  }

  if (addEditRowBtn) addEditRowBtn.addEventListener("click", ()=> addEditRow({ asignatura: "", profesor: "", inicio: "", duration: 1 }));

  function collectRowsFromTable(){
    if (!editTableBody) return [];
    const trs = Array.from(editTableBody.querySelectorAll("tr"));
    const collected = trs.map(tr => {
      const asignatura = tr.querySelector(".asignatura").value.trim();
      const profesor = tr.querySelector(".profesor").value.trim();
      const weekday = currentSelectedWeekdayGroups;
      const inicio = tr.querySelector(".inicio").value;
      const duration = Number(tr.querySelector(".duration").value || 1);
      const startIndex = PERIOD_STARTS.indexOf(inicio);
      let fin = '';
      if (startIndex !== -1){
        const lastIdx = startIndex + duration - 1;
        if (lastIdx < PERIOD_STARTS.length) fin = addMinutes(PERIOD_STARTS[lastIdx], PERIOD_LEN_MIN);
      }
      return { asignatura, profesor, weekday, inicio, fin, duration };
    }).filter(r => r.inicio && r.fin); 
    return collected;
  }

  function saveEditForCurrentEditingGroup(){
    const newList = collectRowsFromTable();
    const ok = validateScheduleList(newList);
    if (!ok.ok){
      window.UI.showBanner('error', ok.msg, 6000);
      return false;
    }
    
    const groupName = groups.find(g=>g.id===currentEditingGroup)?.name || '';
    const SCHED_GLOBAL = window.AdminMngSchedule || {};
    const schedDb = SCHED_GLOBAL.scheduleDb || {};
    
    try {
      for (const period in schedDb) {
        if (!schedDb[period][currentSelectedWeekdayGroups]) continue;
        schedDb[period][currentSelectedWeekdayGroups] = 
          schedDb[period][currentSelectedWeekdayGroups].filter(e => e.grupo !== groupName);
      }
      
      newList.forEach(entry => {
        if (!entry.inicio || !entry.fin || !entry.duration) return;
        
        const startIndex = PERIOD_STARTS.indexOf(entry.inicio);
        if (startIndex === -1) return;
        
        // perido -> + scheduleDb
        for (let i = 0; i < entry.duration; i++) {
          const periodIndex = startIndex + i;
          const period = `per${periodIndex + 1}`;
          
          if (!schedDb[period]) schedDb[period] = {};
          if (!schedDb[period][currentSelectedWeekdayGroups]) {
            schedDb[period][currentSelectedWeekdayGroups] = [];
          }
          
          schedDb[period][currentSelectedWeekdayGroups].push({
            grupo: groupName,
            asignatura: entry.asignatura,
            profesor: entry.profesor,
            room_assigned: null,
            duration: entry.duration,
            inicio: entry.inicio
          });
        }
      });
      
      if (window.AdminMngSchedule) {
        window.AdminMngSchedule.scheduleDb = schedDb;
      }
      
      renderAllLists();
      return true;
    } catch(e) {
      console.error('Failed to save to scheduleDb:', e);
      return false;
    }
  }

  function validateScheduleList(list){
    for (const r of list){
      if (!r.inicio || !r.fin || !r.weekday) return { ok:false, msg:"Todas las filas deben tener día, hora de inicio y fin." };
      // ensure inicio en grid
      if (!PERIOD_STARTS.includes(r.inicio)) return { ok:false, msg:`Inicio inválido: ${r.inicio}. Debe coincidir con los inicios de periodo (ej. 07:00).` };
      if (toMinutes(r.fin) <= toMinutes(r.inicio)) return { ok:false, msg:`Periodo inválido: ${r.inicio} >= ${r.fin}` };
      // ensure duration 
      const startIndex = PERIOD_STARTS.indexOf(r.inicio);
      if (startIndex === -1) return { ok:false, msg:`Inicio inválido: ${r.inicio}. Debe coincidir con los inicios de periodo (ej. 07:00).` };
      const lastIdx = startIndex + (r.duration || 1) - 1;
      if (lastIdx >= PERIOD_STARTS.length) return { ok:false, msg:`Duración excede el rango diario para ${r.inicio}.` };
      const expectedEnd = addMinutes(PERIOD_STARTS[lastIdx], PERIOD_LEN_MIN);
      if (toMinutes(r.fin) !== toMinutes(expectedEnd)) return { ok:false, msg:`Duración inválida para ${r.inicio} - ${r.fin}. Debe terminar en ${expectedEnd} (fin del último bloque).` };
      // ensure fin does not go past last allowed end
      if (toMinutes(r.fin) > toMinutes(LAST_END)) return { ok:false, msg:`Horario excede el final del día escolar (${LAST_END}).` };
    }
    for (let i=0;i<list.length;i++){
      for (let j=i+1;j<list.length;j++){
        if (list[i].weekday !== list[j].weekday) continue;
        if (list[i].inicio === list[j].inicio && list[i].fin === list[j].fin) {
          return { ok:false, msg:`Existen periodos duplicados: ${list[i].weekday} ${list[i].inicio} - ${list[i].fin}` };
        }
        if (overlaps(list[i].inicio, list[i].fin, list[j].inicio, list[j].fin)) {
          return { ok:false, msg:`Existen periodos que se solapan (${list[i].weekday}): ${list[i].inicio}-${list[i].fin} y ${list[j].inicio}-${list[j].fin}` };
        }
      }
    }
    return { ok:true };
  }

  if (saveEditBtn) saveEditBtn.addEventListener("click", async ()=>{
    const newList = collectRowsFromTable();
    const ok = validateScheduleList(newList);
    if (!ok.ok){
      window.UI && window.UI.showBanner && window.UI.showBanner('error', ok.msg, 6000);
      return;
    }

    const groupName = groups.find(g=>g.id===currentEditingGroup)?.name || '';
    const diaMap = { mon:'Lunes', tue:'Martes', wed:'Miércoles', thu:'Jueves', fri:'Viernes' };
    const diaEsp = diaMap[currentSelectedWeekdayGroups] || 'Lunes';

    // Eliminar horarios existentes de ese grupo y día, luego crear los nuevos
    try {
      // 1) Cargar horarios actuales si no están
      if (!horariosCache || !horariosCache.length) await fetchHorarios();

      const actuales = horariosCache.filter(h => String(h.grupo_nombre)===String(groupName) && String(h.dia)===diaEsp);

      // 2) Borrar los existentes
      for (const h of actuales){
        try{
          const resDel = await fetch(`${API_BASE}/api/horarios/${encodeURIComponent(h.id_horario)}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (!resDel.ok){
            const d = await resDel.json().catch(()=>({}));
            throw new Error(d.error || `Error HTTP ${resDel.status}`);
          }
        }catch(err){ console.error('Delete failed:', err); }
      }

      // 3) Crear los nuevos
      for (const entry of newList){
        try{
          const payload = {
            grupo_nombre: groupName,
            asignatura_nombre: entry.asignatura,
            profesor_nombre: entry.profesor,
            dia: diaEsp,
            hora_inicio: entry.inicio,
            hora_fin: entry.fin
          };
          const res = await fetch(`${API_BASE}/api/horarios`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
          });
          if (!res.ok){
            const d = await res.json().catch(()=>({}));
            throw new Error(d.error || `Error HTTP ${res.status}`);
          }
        }catch(err){ console.error('Create failed:', err); }
      }

      await fetchHorarios();
      renderAllLists();
      editModal && editModal.classList.remove('show');
      currentEditingGroup = null;
      window.UI && window.UI.showBanner && window.UI.showBanner('success', 'Horario guardado correctamente.', 4000);
    } catch(e) {
      console.error('Error guardando horario por grupo:', e);
      window.UI && window.UI.showBanner && window.UI.showBanner('error', 'Error al guardar en el servidor.', 6000);
    }
  });


  function renderAssignmentPreview(){
  }

  fetchHorarios();
  // Exponer refresh para otros módulos (ej. ingreso manual)
  window.GroupsAdmin = { refresh: fetchHorarios };

  function syncGroupListHeights(){
    const roomsWrap = document.getElementById('roomsTableWrap');
    const lists = document.querySelectorAll('.groups-segment .groups-list');
    if (!roomsWrap || !lists.length) return;
    const h = roomsWrap.clientHeight;
    lists.forEach(l => {
      l.style.maxHeight = h + 'px';
    });
  }

  syncGroupListHeights();

  const roomsWrapEl = document.getElementById('roomsTableWrap');
  if (roomsWrapEl && window.ResizeObserver){
    const ro = new ResizeObserver(()=> syncGroupListHeights());
    ro.observe(roomsWrapEl);
    ro.observe(document.body);
  }

  window.addEventListener('resize', () => syncGroupListHeights());

  window._groups_admin = { groups, currentSelectedWeekdayGroups };

});
