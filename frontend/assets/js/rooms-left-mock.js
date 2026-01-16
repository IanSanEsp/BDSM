// esta esta mas decente, pero si hay jaladota
(function(){
  //esta parte tiene la mayor parte de la jalada-
  const mockRooms = [
    { id: 1, name: "1", piso: 1, estado: "Disponible" },
    { id: 2, name: "2", piso: 1, estado: "Disponible" },
    { id: 3, name: "3", piso: 1, estado: "Ocupado" },
    { id: 4, name: "4", piso: 1, estado: "Mantenimiento" },
    { id: 11, name: "11", piso: 2, estado: "Disponible" },
    { id: 12, name: "12", piso: 2, estado: "Disponible" }
  ];


  const SC = window.SCHEDULE_CONFIG || {};
  const PERIOD_STARTS = SC.PERIOD_STARTS || [
    "06:00","07:00","08:00","09:00","10:00",
    "11:00","12:00","13:00","14:00","15:00",
    "16:00","17:00","18:00","19:00","20:00"
  ];

  const PERIOD_LEN_MIN = SC.PERIOD_LEN_MIN || 50; 

  const mockSchedules = {
    11: [
      { start: "07:00", end: "07:50", grupo: "3IM1", materia:"Gemo. & Trig.", profesor: "Prof. A" },
      { start: "08:00", end: "08:50", grupo: "3IM1", materia:"Gemo. & Trig.", profesor: "Prof. A" },
      { start: "09:00", end: "10:50", grupo: "3IM1", materia:"Química I", profesor: "Prof. B" }, 
      { start: "11:00", end: "11:50", grupo: "3IM1", materia:"Inglés III", profesor: "Prof. C" },
      { start: "13:00", end: "14:50", grupo: "5IM3", materia:"Programación", profesor: "Prof. D" }
    ],
    3: [
      { start: "06:00", end: "07:50", grupo: "1IM2", materia:"Mate", profesor:"Prof X" },
      { start: "18:00", end: "19:50", grupo: "4IM1", materia:"Lab", profesor:"Prof Y" }
    ]
  };

  const opcionesHorario = SC.opcionesHorario || {};
  SC.opcionesHorario = opcionesHorario;

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

  const toMinutes = SC.toMinutes || function(hm){ const [h,m]=String(hm).split(":").map(Number); if(Number.isNaN(h)||Number.isNaN(m)) return null; return h*60+m; };
  const addMinutes = SC.addMinutes || function(hm, min){ const [h,m]=String(hm).split(":").map(Number); const d = new Date(2020,0,1,h,m); d.setMinutes(d.getMinutes()+min); return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; };
  const overlaps = SC.overlaps || function(aStart,aEnd,bStart,bEnd){ return !( toMinutes(aEnd) <= toMinutes(bStart) || toMinutes(bEnd) <= toMinutes(aStart) ); };

  function findAssignmentsForBlock(roomId, blockStart){
    const blockEnd = addMinutes(blockStart, PERIOD_LEN_MIN);
    const arr = mockSchedules[roomId] || [];
    return arr.filter(a=>{
      return !( toMinutes(a.end) <= toMinutes(blockStart) || toMinutes(a.start) >= toMinutes(blockEnd) );
    });
  }

  function buildPeriodMap(roomId){
    const map = {}; 
    PERIOD_STARTS.forEach(ps=> map[ps]=null);

    const arr = (mockSchedules[roomId] || []);
    arr.forEach(a=>{
      PERIOD_STARTS.forEach(ps=>{
        const pStart = toMinutes(ps), pEnd = toMinutes(addMinutes(ps, PERIOD_LEN_MIN));
        const aStart = toMinutes(a.start), aEnd = toMinutes(a.end);
        if (!(aEnd <= pStart || aStart >= pEnd)) {
          map[ps] = Object.assign({}, a);
        }
      });
    });

    return map;
  }

  function renderRooms(){
    roomsTableBody.innerHTML = "";
    mockRooms.forEach(r=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>#${r.name}</td>
        <td>${r.piso}</td>
        <td><span class="status-badge ${r.estado==="Disponible"?"status-available":(r.estado==="Ocupado"?"status-occupied":"status-maint")}">${r.estado}</span></td>
        <td>
          <button class="icon-btn view-btn" data-room="${r.id}" title="Ver horario">👁️</button>
          <button class="icon-btn edit-btn" data-room="${r.id}" title="Editar horario">✏️</button>
        </td>
      `;
      roomsTableBody.appendChild(tr);
    });

    document.querySelectorAll(".view-btn").forEach(b=> b.addEventListener("click", ()=> openViewer(Number(b.dataset.room)) ));
    document.querySelectorAll(".edit-btn").forEach(b=> b.addEventListener("click", ()=> openEditor(Number(b.dataset.room)) ));
  }

  function openViewer(roomId){
    const room = mockRooms.find(r=>r.id===roomId);
    viewerTitle.textContent = `Horario Salón ${room.name}`;
    viewerBody.innerHTML = "";

    const periodMap = buildPeriodMap(roomId);

    const table = document.createElement("table");
    table.className = "viewer-table";
    table.innerHTML = `<thead><tr><th>Período</th><th>Hora</th><th>Grupo</th><th>Asignatura</th><th>Profesor</th></tr></thead>`;
    const tbody = document.createElement("tbody");

    PERIOD_STARTS.forEach(ps=>{
      const a = periodMap[ps];
      const row = document.createElement("tr");
      if (a) {
        row.innerHTML = `<td>Per.</td><td>${ps} - ${addMinutes(ps, PERIOD_LEN_MIN)}</td><td>${a.grupo||"--"}</td><td>${a.materia||"--"}</td><td>${a.profesor||"--"}</td>`;
      } else {
        row.innerHTML = `<td>Per.</td><td>${ps} - ${addMinutes(ps, PERIOD_LEN_MIN)}</td><td colspan="3" class="small-muted">Disponible</td>`;
      }
      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    viewerBody.appendChild(table);
    viewerModal.classList.add("show");
  }

  viewerClose.addEventListener("click", ()=> viewerModal.classList.remove("show"));
  viewerModal.addEventListener("click", (e)=> { if (e.target === viewerModal) viewerModal.classList.remove("show"); });

  function openEditor(roomId){
    const room = mockRooms.find(r=>r.id===roomId);
    editorRoomLabel.textContent = ` #${room.name}`;
    periodStrip.innerHTML = "";
    blockOptions.innerHTML = "";
    blockInfo.querySelector("h4").textContent = "Seleccione un bloque horario";

    PERIOD_STARTS.forEach(ps=>{
      const label = `${ps} - ${addMinutes(ps, PERIOD_LEN_MIN)}`;
      const card = document.createElement("div");
      card.className = "period-card";
      card.dataset.timespan = `${ps}-${addMinutes(ps, PERIOD_LEN_MIN)}`;
      card.innerHTML = `<div class="period-time">${label}</div><div class="period-meta small-muted">Ver opciones</div>`;

      const matches = findAssignmentsForBlock(roomId, ps);
      if (matches.length) {
        const badge = document.createElement("div");
        badge.className = "period-meta";
        badge.textContent = `${matches.length} asignación(es)`;
        card.appendChild(badge);
      }

      card.addEventListener("click", ()=> {
        periodStrip.querySelectorAll(".period-card").forEach(c=>c.classList.remove("selected"));
        card.classList.add("selected");

        loadBlockOptions(card.dataset.timespan, roomId);
      });

      periodStrip.appendChild(card);
    });

    editorModal.classList.add("show");
  }

  editorClose.addEventListener("click", ()=> editorModal.classList.remove("show"));
  editorModal.addEventListener("click", (e)=> { if (e.target === editorModal) editorModal.classList.remove("show"); });

  function loadBlockOptions(blockTime, roomId){
    blockOptions.innerHTML = "";
    blockInfo.querySelector("h4").textContent = `Opciones para ${blockTime}`;

    const direct = opcionesHorario[blockTime];
    const list = direct ? direct.slice() : [];

    const [bs,be] = blockTime.split("-");
    const overlapping = findAssignmentsForBlock(roomId, bs);
    overlapping.forEach(o => list.push({ grupo: o.grupo, materia: o.materia, profesor: (o.profesor || "") + " (actual)" }));

    if (list.length === 0) {
      blockOptions.innerHTML = `<div class="small-muted">No hay opciones para este bloque.</div>`;
      return;
    }

    list.forEach(opt => {
      const el = document.createElement("div");
      el.className = "option-card";
      el.innerHTML = `<div class="option-left">${opt.grupo} — ${opt.materia}</div><div class="option-right">${opt.profesor||""}</div>`;
      el.addEventListener("click", ()=> {
        console.log("Asignar opción:", blockTime, opt);
        if (window.UI && window.UI.showBanner) window.UI.showBanner('info', `Seleccionaste: ${opt.grupo} — ${opt.materia}`, 3000); else alert(`Seleccionaste: ${opt.grupo} — ${opt.materia}`);
      });
      blockOptions.appendChild(el);
    });
  }

  renderRooms();
  window._btz_mock = { rooms: mockRooms, schedules: mockSchedules, opcionesHorario: opcionesHorario, PERIOD_STARTS };

})();
