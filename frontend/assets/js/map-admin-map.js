function updateMapClock() {
    const clock = document.getElementById("mapClock");
    if (!clock) return;

    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");

    clock.textContent = `${hh}:${mm}:${ss}`;
}

setInterval(updateMapClock, 1000);
updateMapClock();


const floorItems = document.querySelectorAll(".floor-item");
const mapFrame = document.getElementById("mapContainer");
const mapLoading = document.getElementById("mapLoading");

let currentFloor = 0; 


/* == FLOOR CHANGE THINGY == */
function changeFloor(newFloor) {
    if (newFloor === currentFloor) return; 

    currentFloor = newFloor;

    document.querySelector(".floor-item.active")?.classList.remove("active");
    document.querySelector(`.floor-item[data-floor="${newFloor}"]`)
        .classList.add("active");

    mapLoading.classList.add("show");
    mapFrame.classList.add("fade-out");

    setTimeout(() => {
        mapFrame.classList.remove("fade-out");
        mapFrame.classList.add("fade-in");

        setTimeout(() => {
            mapFrame.classList.remove("fade-in");
            mapLoading.classList.remove("show");
        }, 350);

        console.log(`Loaded floor ${newFloor}`);
        
        if (window.loadDXFPlan) {
            loadDXFPlan(newFloor);
        }
        // actualizar opciones del selector de salones
        if (window._mapPlacementControls && typeof window._mapPlacementControls.refreshOptions === 'function') {
            window._mapPlacementControls.refreshOptions();
        }
    }, 550);
}

floorItems.forEach(btn => {
    btn.addEventListener("click", () => {
        changeFloor(Number(btn.dataset.floor));
    });
});

document.getElementById("floorUp").addEventListener("click", () => {
    const next = Math.max(0, currentFloor - 1);
    if (next !== currentFloor) {
        changeFloor(next);
    }
});

document.getElementById("floorDown").addEventListener("click", () => {
    const next = Math.min(3, currentFloor + 1);
    if (next !== currentFloor) {
        changeFloor(next);
    }
});

/* ---------------------------------------
   ZOOM BOTON
----------------------------------------*/

const mapInner = document.getElementById("mapInner");

let scale = 1;
let minScale = 0.6;
let maxScale = 3.5;

let posX = 0;
let posY = 0;

let isPanning = false;
let startX = 0;
let startY = 0;

function updateTransform() {
    mapInner.style.transform = `translate(${posX}px, ${posY}px) scale(${scale})`;
}

function zoomIn() {
    scale = Math.min(maxScale, scale + 0.15);
    updateTransform();
}

function zoomOut() {
    scale = Math.max(minScale, scale - 0.15);
    updateTransform();
}

function zoomReset() {
    scale = 1;
    posX = 0;
    posY = 0;
    updateTransform();
}

document.getElementById("zoomIn").addEventListener("click", zoomIn);
document.getElementById("zoomOut").addEventListener("click", zoomOut);
document.getElementById("zoomReset").addEventListener("click", zoomReset);

mapInner.addEventListener("wheel", (e) => {
    e.preventDefault();
    const delta = e.deltaY;

    if (delta > 0) zoomOut();
    else zoomIn();
});

mapInner.addEventListener("dblclick", (e) => {
    zoomIn();
});

mapInner.addEventListener("mousedown", (e) => {
    isPanning = true;
    startX = e.clientX - posX;
    startY = e.clientY - posY;
});

window.addEventListener("mousemove", (e) => {
    if (!isPanning) return;

    posX = e.clientX - startX;
    posY = e.clientY - startY;
    updateTransform();
});

window.addEventListener("mouseup", () => {
    isPanning = false;
});


mapInner.addEventListener("touchstart", (e) => {
    if (e.touches.length === 1) {
        isPanning = true;
        const touch = e.touches[0];
        startX = touch.clientX - posX;
        startY = touch.clientY - posY;
    }
});

mapInner.addEventListener("touchmove", (e) => {
    if (!isPanning) return;
    const touch = e.touches[0];

    posX = touch.clientX - startX;
    posY = touch.clientY - startY;
    updateTransform();
});

mapInner.addEventListener("touchend", () => {
    isPanning = false;
});


/* == FILTER MODAL == */
const openFilters = document.getElementById("openFilters");
const closeFilters = document.getElementById("closeFilters");
const filterModal = document.getElementById("filterModal");
const filterSalonSel = document.getElementById("filterSalon");
const filterGrupoSel = document.getElementById("filterGrupo");
const filterMateriaSel = document.getElementById("filterMateria");
const filterProfesorSel = document.getElementById("filterProfesor");
const filterStartInput = document.getElementById("filterStart");
const filterEndInput = document.getElementById("filterEnd");
const filterConfirmBtn = document.getElementById("filterConfirm");

openFilters.addEventListener("click", () => {
    if (!filterModal) return;
    filterModal.classList.add("show");
    populateFilterOptions();
});

closeFilters.addEventListener("click", () => {
    if (!filterModal) return;
    filterModal.classList.remove("show");
});

filterModal.addEventListener("click", (e) => {
    if (e.target === filterModal) {
        filterModal.classList.remove("show");
    }
});

function showFilterMessage(type, msg){
    if (window.UI && window.UI.showBanner){
        window.UI.showBanner(type, msg, 4000);
    } else {
        if (type === 'error') console.error(msg);
        alert(msg);
    }
}

function openNoRoomsDialog(){
    try {
        const existing = document.getElementById('noRoomsDialogOverlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'noRoomsDialogOverlay';
        overlay.style.position = 'fixed';
        overlay.style.inset = '0';
        overlay.style.background = 'rgba(0,0,0,0.35)';
        overlay.style.zIndex = '9998';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';

        const card = document.createElement('div');
        card.style.minWidth = '280px';
        card.style.maxWidth = '420px';
        card.style.background = '#ffffff';
        card.style.borderRadius = '10px';
        card.style.boxShadow = '0 12px 32px rgba(0,0,0,0.25)';
        card.style.padding = '18px 20px 16px 20px';
        card.style.fontFamily = '"Lexend", "Kanit", "Open Sans", "NATS", sans-serif';
        card.style.display = 'flex';
        card.style.flexDirection = 'column';
        card.style.gap = '10px';

        const title = document.createElement('div');
        title.textContent = 'Sin resultados';
        title.style.fontWeight = '700';
        title.style.fontSize = '16px';
        title.style.color = '#8A2041';

        const body = document.createElement('div');
        body.textContent = 'No se encontraron salones para esos filtros. Ajusta los criterios e inténtalo de nuevo.';
        body.style.fontSize = '14px';
        body.style.color = '#444';
        body.style.lineHeight = '1.5';

        const footer = document.createElement('div');
        footer.style.display = 'flex';
        footer.style.justifyContent = 'flex-end';
        footer.style.marginTop = '4px';

        const btn = document.createElement('button');
        btn.textContent = 'Aceptar';
        btn.style.padding = '6px 14px';
        btn.style.borderRadius = '8px';
        btn.style.border = 'none';
        btn.style.cursor = 'pointer';
        btn.style.background = '#8A2041';
        btn.style.color = '#ffffff';
        btn.style.fontWeight = '600';
        btn.style.fontSize = '13px';
        btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.18)';

        const close = () => {
            try { overlay.remove(); } catch(e){}
        };
        btn.addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        document.addEventListener('keydown', function onKey(e){ if (e.key === 'Escape'){ document.removeEventListener('keydown', onKey); close(); }});

        footer.appendChild(btn);
        card.appendChild(title);
        card.appendChild(body);
        card.appendChild(footer);
        overlay.appendChild(card);
        document.body.appendChild(overlay);
    } catch (e) {
        // fallback a banner si algo falla
        showFilterMessage('info', 'No se encontraron salones para esos filtros.');
    }
}

function getHoyNombre(){
    const dias = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
    return dias[new Date().getDay()] || "Lunes";
}

function getNowMinutes(){
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
}

function isHorarioActivoAhora(h){
    if (!h) return false;
    const diaRow = String(h.dia || "").toLowerCase();
    const hoy = getHoyNombre().toLowerCase();
    if (!diaRow.includes(hoy)) return false;
    const hi = timeToMinutes(h.hora_inicio || h.inicio || h.start || "");
    const hf = timeToMinutes(h.hora_fin || h.fin || h.end || "");
    if (hi == null || hf == null) return false;
    const nowMin = getNowMinutes();
    return nowMin >= hi && nowMin < hf;
}

let allHorariosCache = null;

async function ensureAllHorariosLoaded(){
    if (allHorariosCache) return allHorariosCache;
    try {
        const res = await fetch(`${API_BASE}/api/horarios`);
        const data = await res.json().catch(()=>({}));
        const arr = Array.isArray(data?.horarios) ? data.horarios : (Array.isArray(data) ? data : []);
        allHorariosCache = arr;
    } catch (e){
        console.error('No se pudieron cargar horarios completos:', e);
        allHorariosCache = [];
    }
    return allHorariosCache;
}

async function populateFilterOptions(){
    // salones (todos, indicando piso)
    if (filterSalonSel){
        if (!roomsCache.length){
            try { await fetchRooms(); } catch(_){ /* ignore */ }
        }
        filterSalonSel.innerHTML = '<option value="">Seleccionar salón</option>';
        roomsCache.forEach(r => {
            if (!r || r.id_salon == null) return;
            const opt = document.createElement('option');
            opt.value = String(r.id_salon);
            const pisoTxt = (r.piso != null) ? `P${r.piso}` : '';
            opt.textContent = `${r.nombre || r.id_salon}${pisoTxt ? ` (${pisoTxt})` : ''}`;
            filterSalonSel.appendChild(opt);
        });
    }

    const horarios = await ensureAllHorariosLoaded();
    const grupos = new Set();
    const materias = new Set();
    const profesores = new Set();

    horarios.forEach(h => {
        if (h.grupo_nombre) grupos.add(String(h.grupo_nombre));
        if (h.asignatura) materias.add(String(h.asignatura));
        if (h.profesor) profesores.add(String(h.profesor));
    });

    if (filterGrupoSel){
        filterGrupoSel.innerHTML = '<option value="">Seleccionar grupo</option>';
        Array.from(grupos).sort().forEach(g => {
            const opt = document.createElement('option');
            opt.value = g;
            opt.textContent = g;
            filterGrupoSel.appendChild(opt);
        });
    }

    if (filterMateriaSel){
        filterMateriaSel.innerHTML = '<option value="">Seleccionar materia</option>';
        Array.from(materias).sort().forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            filterMateriaSel.appendChild(opt);
        });
    }

    if (filterProfesorSel){
        filterProfesorSel.innerHTML = '<option value="">Seleccionar profesor</option>';
        Array.from(profesores).sort().forEach(p => {
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = p;
            filterProfesorSel.appendChild(opt);
        });
    }
}

async function fetchHorariosPorBloque(dia, horaInicio, horaFin){
    try {
        const params = new URLSearchParams({ dia, hora_inicio: horaInicio, hora_fin: horaFin });
        const res = await fetch(`${API_BASE}/api/horarios/por-bloque?${params.toString()}`);
        const data = await res.json().catch(()=>({}));
        const arr = Array.isArray(data?.horarios) ? data.horarios : (Array.isArray(data) ? data : []);
        return arr;
    } catch (e){
        console.error('Error en fetchHorariosPorBloque:', e);
        return [];
    }
}

async function focusOnSalonId(idSalon){
    const idStr = String(idSalon);
    const room = roomsCache.find(r => String(r.id_salon) === idStr);
    const piso = room && room.piso != null ? Number(room.piso) : null;
    if (piso != null && piso !== currentFloor){
        changeFloor(piso);
        // changeFloor llamará a loadDXFPlan y luego a renderMarkers, que respetará el filtro activo
    } else {
        await renderMarkers();
    }
}

if (filterConfirmBtn){
    filterConfirmBtn.addEventListener('click', async () => {
        const salonId = filterSalonSel ? String(filterSalonSel.value || '') : '';
        const grupo = filterGrupoSel ? String(filterGrupoSel.value || '') : '';
        const materia = filterMateriaSel ? String(filterMateriaSel.value || '') : '';
        const profesor = filterProfesorSel ? String(filterProfesorSel.value || '') : '';
        const hi = filterStartInput ? String(filterStartInput.value || '').trim() : '';
        const hf = filterEndInput ? String(filterEndInput.value || '').trim() : '';

        const hayFiltros = salonId || grupo || materia || profesor || (hi && hf);
        if (!hayFiltros){
            // Sin filtros => mostrar todos los salones
            activeFilterSalonIds = null;
            await renderMarkers();
            if (filterModal) filterModal.classList.remove('show');
            return;
        }

        const ids = new Set();

        if (salonId){
            ids.add(salonId);
        }

        if (grupo || materia || profesor){
            const horarios = await ensureAllHorariosLoaded();
            horarios.forEach(h => {
                if (!isHorarioActivoAhora(h)) return;
                if (grupo && String(h.grupo_nombre || '') !== grupo) return;
                if (materia && String(h.asignatura || '') !== materia) return;
                if (profesor && String(h.profesor || '') !== profesor) return;
                if (h.id_salon != null) ids.add(String(h.id_salon));
            });
        }

        if (hi && hf){
            const dia = getHoyNombre();
            const bloque = await fetchHorariosPorBloque(dia, hi, hf);
            bloque.forEach(h => {
                if (h.id_salon != null) ids.add(String(h.id_salon));
            });
        }

        if (ids.size === 0){
            activeFilterSalonIds = null;
            await renderMarkers();
            openNoRoomsDialog();
            if (filterModal) filterModal.classList.remove('show');
            return;
        }

        activeFilterSalonIds = ids;

        if (ids.size === 1){
            const onlyId = Array.from(ids)[0];
            await focusOnSalonId(onlyId);
        } else {
            await renderMarkers();
        }

        if (filterModal) filterModal.classList.remove('show');
    });
}


/* ============================================
   Mapa intetactivo
   ============================================ */

const DXF_FILES = {
    0: 'assets/dxf/Lobby.dxf',
    1: 'assets/dxf/Planta1.dxf',
    2: 'assets/dxf/Planta2.dxf', 
    3: 'assets/dxf/Planta3.dxf'
};

// configuracion de zoom por cada DXF
const DXF_ZOOM_CONFIG = {
    0: {
        padding: 0.02,
        multiplier: 0.8,
        minScale: 0.3,
        maxScale: 50,
        strongMultiplier: 2.0,
        strongPadding: 0.01
    },

    1: { 
        padding: 0.02, 
        multiplier: 0.8, 
        minScale: 0.25, 
        maxScale: 35, 
        strongMultiplier: 1.8, 
        strongPadding: 0.01 
    },

    2: { 
        padding: 0.02, 
        multiplier: 0.8, 
        minScale: 0.28, 
        maxScale: 38, 
        strongMultiplier: 2.0, 
        strongPadding: 0.01 
    },

    3: { 
        padding: 0.02, 
        multiplier: 0.8, 
        minScale: 0.22, 
        maxScale: 32, 
        strongMultiplier: 1.7, 
        strongPadding: 0.01 
    }
};
//odio demasiado los planos en dxf son una de las peores cosas que existen, puto fate 



console.log('🔧 Configuración DXF:', DXF_FILES);

let dxfScene, dxfCamera, dxfRenderer;
let dxfScale = 1;
let currentDxfObject = null;
// Marcadores de salones
let markerGroup = null;
let roomMarkersStore = null; // cache de posiciones (BD + fallback localStorage)
let roomsCache = [];
// Cachés locales para nombre y estado por salón (uso en vista usuario sin token)
let roomNamesStore = {};
let roomStatesStore = {};
// Caché de horarios por salón para evitar múltiples llamadas
const scheduleCache = new Map();
// Filtro activo de salones (null => todos los marcadores)
let activeFilterSalonIds = null;
const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://localhost:3000'
    : 'https://bdsm-production-0032.up.railway.app';
const token = (localStorage.getItem('token') || '').trim();

document.addEventListener('DOMContentLoaded', function() {
    console.log('Inicializando DXF...');
    // En vista de usuario, arrancar en Planta 1 para que se vean marcadores
    if (window.IS_USER_VIEW === true) {
        currentFloor = 1;
        document.querySelector('.floor-item.active')?.classList.remove('active');
        const p1 = document.querySelector('.floor-item[data-floor="1"]');
        p1 && p1.classList.add('active');
    }

    setTimeout(function() {
        initDXFVisualizer();
        listAvailableFiles();
        
        if (window.loadDXFPlan) {
            console.log('🔎 Cargando piso inicial...');
            loadDXFPlan(currentFloor);
        }
    }, 500);
    // Poll para refrescar colores de marcadores según estado
    setInterval(() => { (async () => { await fetchRooms(); await fetchMarkersForFloor(currentFloor); await renderMarkers(); })(); }, 60_000);
});

function listAvailableFiles() {
    fetch('./')
        .then(response => response.text())
        .then(html => {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const links = Array.from(doc.querySelectorAll('a'));
            const files = links
                .map(link => link.textContent)
                .filter(name => name && !name.endsWith('/') && name !== 'Parent Directory')
                .sort();
            
            console.log('ARCHIVOS DISPONIBLES en esta carpeta:');
            files.forEach(file => {
                const isDxf = file.toLowerCase().endsWith('.dxf');
                console.log(`  ${isDxf ? '✅' : '📄'} ${file} ${isDxf ? '(DXF)' : ''}`);
            });
            

            console.log('🔍 BUSCANDO ARCHIVOS CONFIGURADOS:');
            Object.values(DXF_FILES).forEach(fileName => {
                const exists = files.some(f => f === fileName);
                console.log(`  ${exists ? '✅' : '❌'} ${fileName} ${exists ? 'ENCONTRADO' : 'NO ENCONTRADO'}`);
            });
        })
        .catch(err => {
            console.error('❌ No se pudo listar archivos:', err);
        });
}

function initDXFVisualizer() {
    console.log('🔧 Inicializando visualizador DXF...');
    
    if (!mapInner) {
        console.error('❌ No se encontró #mapInner');
        return;
    }
    
    //todo esto deberia ir en el html pero que flojera sin esto no funcionan los dxf, es como codigo sagrado asi que no le muevan nada :V
    mapInner.style.background = 'transparent';
    mapInner.style.border = 'none';
    mapInner.style.boxShadow = 'none';
    
    mapInner.innerHTML = `
        <div id="dxfContainer" style="width:100%;height:100%;position:relative;">
            <canvas id="dxfCanvas" style="width:100%;height:100%;display:block;"></canvas>
            <div id="dxfInfo" style="position:absolute;top:10px;left:10px;background:rgba(255,255,255,0.9);padding:5px 10px;border-radius:4px;font-size:11px;z-index:10;border:1px solid #ccc;"></div>
            <div id="dxfError" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(255,0,0,0.1);padding:20px;border-radius:8px;display:none;"></div>
        </div>
    `;
    
    setupThreeJS();
    
    if (typeof loadDXFPlan === 'function') {
        loadDXFPlan(currentFloor);
    }
    // Preparar según vista: en usuario, solo marcadores sin controles
    const isUserView = (window.IS_USER_VIEW === true);
    fetchRooms().then(async () => {
        if (!isUserView) {
            setupPlacementControls();
        }
        await renderMarkers();
    });
}

function setupThreeJS() {
    const container = document.getElementById('dxfContainer');
    if (!container) {
        console.error('❌ No se encontró #dxfContainer');
        return;
    }
    
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    console.log(`📏 Tamaño del contenedor DXF: ${width}x${height}`);
    
    dxfScene = new THREE.Scene();
    dxfScene.background = new THREE.Color(0xffffff);
    
    const aspect = width / height;
    const viewSize = 100;
    dxfCamera = new THREE.OrthographicCamera(
        -viewSize * aspect / 2,
        viewSize * aspect / 2,
        viewSize / 2,
        -viewSize / 2,
        -1000,
        1000
    );
    dxfCamera.position.z = 100;
    
    const canvas = document.getElementById('dxfCanvas');
    if (!canvas) {
        console.error('❌ No se encontró #dxfCanvas');
        return;
    }
    
    dxfRenderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true,
        alpha: true
    });
    dxfRenderer.setSize(width, height);
    dxfRenderer.setPixelRatio(window.devicePixelRatio);
    
    console.log('✅ Three.js configurado correctamente');
    
    setupDXFControls();
    // Grupo para marcadores
    markerGroup = new THREE.Group();
    dxfScene.add(markerGroup);
    
    animateDXF();
    
    window.addEventListener('resize', function() {
        if (!container) return;
        const newWidth = container.clientWidth;
        const newHeight = container.clientHeight;
        dxfRenderer.setSize(newWidth, newHeight);
        
        const newAspect = newWidth / newHeight;
        dxfCamera.left = -viewSize * newAspect / 2;
        dxfCamera.right = viewSize * newAspect / 2;
        dxfCamera.updateProjectionMatrix();
    });
}

function setupDXFControls() {
    const canvas = document.getElementById('dxfCanvas');
    if (!canvas) return;
    
    canvas.addEventListener('wheel', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const zoomSpeed = 0.001;
        dxfScale -= e.deltaY * zoomSpeed;
        dxfScale = Math.max(0.1, Math.min(5, dxfScale));
        updateDXFCamera();
    });
    
    canvas.style.cursor = 'default';
}

function updateDXFCamera() {
    const container = document.getElementById('dxfContainer');
    if (!container || !dxfCamera) return;
    
    const width = container.clientWidth;
    const height = container.clientHeight;
    const aspect = width / height;
    
    const baseSize = 100;
    const viewSize = baseSize / dxfScale;
    
    dxfCamera.left = -viewSize * aspect / 2;
    dxfCamera.right = viewSize * aspect / 2;
    dxfCamera.top = viewSize / 2;
    dxfCamera.bottom = -viewSize / 2;
    dxfCamera.updateProjectionMatrix();
    
    dxfCamera.position.set(0, 0, 100);
    dxfCamera.lookAt(0, 0, 0);
}

// Utilidades para marcadores
function loadRoomMarkersStore(){
    try {
        const raw = localStorage.getItem('roomMarkers');
        roomMarkersStore = raw ? JSON.parse(raw) : { '1': {}, '2': {}, '3': {} };
    } catch(e){ roomMarkersStore = { '1': {}, '2': {}, '3': {} }; }
}
function saveRoomMarkersStore(){
    try { localStorage.setItem('roomMarkers', JSON.stringify(roomMarkersStore || {})); } catch(e){}
}
function loadRoomNamesStore(){
    try { const raw = localStorage.getItem('roomNames'); roomNamesStore = raw ? JSON.parse(raw) : {}; } catch(e){ roomNamesStore = {}; }
}
function saveRoomNamesStore(){
    try { localStorage.setItem('roomNames', JSON.stringify(roomNamesStore || {})); } catch(e){}
}
function loadRoomStatesStore(){
    try { const raw = localStorage.getItem('roomStates'); roomStatesStore = raw ? JSON.parse(raw) : {}; } catch(e){ roomStatesStore = {}; }
}
function saveRoomStatesStore(){
    try { localStorage.setItem('roomStates', JSON.stringify(roomStatesStore || {})); } catch(e){}
}
// Backend persistence helpers
async function fetchMarkersForFloor(piso){
    try {
        if (!token) {
            console.warn('Sin token JWT: inicia sesión para cargar marcadores desde BD. Usando cache local.');
            return;
        }
        const res = await fetch(`${API_BASE}/api/salon-markers?piso=${encodeURIComponent(piso)}`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) throw new Error(await res.text());
        const rows = await res.json();
        loadRoomMarkersStore();
        const pisoKey = String(piso);
        // Si BD devuelve vacio, no borrar los locales para evitar "desaparecer" marcadores
        if (Array.isArray(rows) && rows.length > 0) {
            const next = { ...(roomMarkersStore[pisoKey] || {}) };
            rows.forEach(r => {
                next[String(r.id_salon)] = { x: Number(r.x), y: Number(r.y) };
            });
            roomMarkersStore[pisoKey] = next;
        }
        saveRoomMarkersStore();
    } catch(e){
        console.warn('No se pudieron cargar marcadores de BD, usando cache local:', e.message);
    }
}
async function upsertMarkerBackend(piso, id_salon, pos){
    const body = { piso: String(piso), id_salon: String(id_salon), x: Number(pos.x), y: Number(pos.y) };
    const res = await fetch(`${API_BASE}/api/salon-markers`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body)
    });
    if (!res.ok) {
        const txt = await res.text().catch(()=>"Error");
        throw new Error(`HTTP ${res.status}: ${txt}`);
    }
}
async function deleteMarkerBackend(piso, id_salon){
    const res = await fetch(`${API_BASE}/api/salon-markers/${encodeURIComponent(piso)}/${encodeURIComponent(id_salon)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
        const txt = await res.text().catch(()=>"Error");
        throw new Error(`HTTP ${res.status}: ${txt}`);
    }
}
function statusColor(estado){
    const s = String(estado||'').toLowerCase();
    if (s.includes('manten')) return 0x9AA0A6; // gris mantenimiento (#9aa0a6)
    if (s.includes('ocupa')) return 0xD62839; // rojo ocupado (#d62839)
    if (s.includes('dispon')) return 0x4CAF50; // verde disponible (#4caf50)
    return 0x4CAF50; // por defecto, verde
}
async function fetchRooms(){
    try {
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        let res = await fetch(`${API_BASE}/api/salones`, { headers });
        if (!res.ok && !token) {
            try { res = await fetch(`${API_BASE}/api/salones`); } catch(_){ }
        }
        const data = await res.json().catch(()=>[]);
        const rawRooms = Array.isArray(data) ? data : [];
        roomsCache = rawRooms.map(r => ({
            id_salon: (r.id_salon != null) ? String(r.id_salon) : ((r.clave != null) ? String(r.clave) : ((r.id != null) ? String(r.id) : '')),
            nombre: r.nombre || r.name || r.salon || r.room_name || (r.clave ? String(r.clave) : (r.id_salon != null ? `Salón ${r.id_salon}` : 'Salón')),
            piso: (r.piso != null) ? String(r.piso) : (r.floor || r.nivel || 'Lobby'),
            estado: r.estado || r.status || r.room_status || 'Disponible'
        }));
        // Actualizar cachés locales
        loadRoomNamesStore(); loadRoomStatesStore();
        roomsCache.forEach(r => {
            if (r.id_salon) {
                roomNamesStore[r.id_salon] = r.nombre || roomNamesStore[r.id_salon] || r.id_salon;
                roomStatesStore[r.id_salon] = r.estado || roomStatesStore[r.id_salon] || 'Disponible';
            }
        });
        saveRoomNamesStore(); saveRoomStatesStore();
    } catch(e){ roomsCache = []; }
}

// ---- Horarios y ocupación actual ----
async function fetchScheduleFor(clave) {
    const key = String(clave);
    if (scheduleCache.has(key)) return scheduleCache.get(key);
    try {
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        let res = await fetch(`${API_BASE}/api/horarios?salon=${encodeURIComponent(key)}`, { headers });
        if (!res.ok) {
            // intento alterno: obtener todos y filtrar
            res = await fetch(`${API_BASE}/api/horarios`, { headers });
        }
        const data = await res.json();
        const arr = Array.isArray(data?.horarios) ? data.horarios : (Array.isArray(data) ? data : []);
        scheduleCache.set(key, arr);
        return arr;
    } catch (e) {
        scheduleCache.set(key, []);
        return [];
    }
}
function timeToMinutes(t) {
    if (!t) return null;
    const m = String(t).match(/(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
}
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
function floorToPiso(f){ return String(f); }
function getRoomsForCurrentFloor(){
    const piso = floorToPiso(currentFloor);
    return roomsCache.filter(r => String(r.piso) === piso);
}
function disposeObject(obj){
    if (!obj) return;
    // Dispose geometry
    if (obj.geometry && typeof obj.geometry.dispose === 'function') {
        obj.geometry.dispose();
    }
    // Dispose materials and textures
    const disposeMaterial = (m) => {
        if (!m) return;
        if (m.map && typeof m.map.dispose === 'function') m.map.dispose();
        if (typeof m.dispose === 'function') m.dispose();
    };
    if (Array.isArray(obj.material)) {
        obj.material.forEach(disposeMaterial);
    } else {
        disposeMaterial(obj.material);
    }
    // Traverse children
    if (obj.children && obj.children.length) {
        obj.children.forEach(child => disposeObject(child));
    }
}
function clearMarkers(){
    if (!markerGroup) return;
    while (markerGroup.children.length){
        const obj = markerGroup.children.pop();
        markerGroup.remove(obj);
        disposeObject(obj);
    }
}
function createLabelSprite(text, { inside = false } = {}){
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        // Fuente ligeramente mayor para evitar aliasing en usuario
        ctx.font = inside ? '700 9px Segoe UI, Arial, sans-serif' : '700 9px Segoe UI, Arial, sans-serif';
        const metrics = ctx.measureText(text || '');
        const textW = Math.ceil(metrics.width);
        const textH = 10;
        const paddingX = inside ? 0 : 0;
        const paddingY = inside ? 0 : 0;
        // Logical size (minimal box)
        const logicalW = Math.max(16, textW + paddingX * 2);
        const logicalH = Math.max(10, textH + paddingY * 2);
        // High DPI backing para texto más nítido
        const dpr = 2;
        canvas.width = Math.floor(logicalW * dpr);
        canvas.height = Math.floor(logicalH * dpr);
        ctx.scale(dpr, dpr);
        // Disable smoothing to reduce blur further
        ctx.imageSmoothingEnabled = false;
        // Optional background only when not inside marker
        if (!inside) {
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.strokeStyle = '#8A2041';
            ctx.lineWidth = 1;
            const w = logicalW, h = logicalH;
            const r = 2;
            ctx.beginPath();
            ctx.moveTo(r, 0);
            ctx.lineTo(w - r, 0);
            ctx.quadraticCurveTo(w, 0, w, r);
            ctx.lineTo(w, h - r);
            ctx.quadraticCurveTo(w, h, w - r, h);
            ctx.lineTo(r, h);
            ctx.quadraticCurveTo(0, h, 0, h - r);
            ctx.lineTo(0, r);
            ctx.quadraticCurveTo(0, 0, r, 0);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
        // text
        ctx.fillStyle = '#000';
        ctx.textBaseline = 'middle';
        ctx.font = inside ? '700 9px Segoe UI, Arial, sans-serif' : '700 9px Segoe UI, Arial, sans-serif';
        const tx = inside ? Math.round((logicalW - textW) / 2) : paddingX;
        const ty = Math.round(logicalH / 2);
        ctx.fillText(String(text || ''), tx, ty);
        const tex = new THREE.CanvasTexture(canvas);
        // Prefer nearest filters for small text to reduce blur
        tex.generateMipmaps = false;
        tex.minFilter = THREE.NearestFilter;
        tex.magFilter = THREE.NearestFilter;
        tex.needsUpdate = true;
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
        const spr = new THREE.Sprite(mat);
        // Escala proporcional al tamaño del texto para evitar compresión que deforma letras
        const conv = 0.01; // 1 unidad mundial por cada ~100 px lógicos
        spr.scale.set(logicalW * conv, logicalH * conv, 1);
        spr.center.set(0.5, 0.5);
        return spr;
    } catch(e){
        console.warn('No se pudo crear sprite de texto:', e);
        return null;
    }
}
function createMarkerMesh(color, labelText){
    // Ultra small marker (dot)
    const geom = new THREE.CircleGeometry(0.08, 24);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
    const mesh = new THREE.Mesh(geom, mat);
    // pequeño borde
    const edge = new THREE.Mesh(new THREE.RingGeometry(0.075, 0.095, 24), new THREE.MeshBasicMaterial({ color: 0x222222 }));
    mesh.add(edge);
    // label ABOVE (compact rounded box)
    const spr = createLabelSprite(labelText, { inside: false });
    if (spr) {
        spr.position.set(0, 0.24, 0.01);
        mesh.add(spr);
    }
    return mesh;
}
async function renderMarkers(){
    if (!dxfScene || !markerGroup) return;
    if (currentFloor === 0) { clearMarkers(); return; } // ignorar Lobby
    clearMarkers();
    loadRoomMarkersStore();
    const pisoKey = String(currentFloor);
    const store = (roomMarkersStore && roomMarkersStore[pisoKey]) ? roomMarkersStore[pisoKey] : {};
    const roomsById = {};
    getRoomsForCurrentFloor().forEach(r => { roomsById[String(r.id_salon)] = r; });
    const allIds = Object.keys(store);
    const ids = (activeFilterSalonIds && activeFilterSalonIds.size > 0)
        ? allIds.filter(id => activeFilterSalonIds.has(String(id)))
        : allIds;
    // formateador de etiquetas (abrevia IDs largas)
    const formatLabel = (txt) => {
        const s = String(txt || '').trim();
        if (s.length <= 18) return s;
        const uuidFirst = s.split('-')[0];
        if (uuidFirst && uuidFirst.length >= 8) return uuidFirst;
        return s.slice(0, 12) + '…';
    };
    // Construir marcadores y opcionalmente ajustar por ocupación actual
    for (const id of ids) {
        const pos = store[id];
        if (!pos) continue;
        const room = roomsById[id] || null;
        // Fallbacks desde caché local si no hay rooms disponibles en usuario
        loadRoomNamesStore(); loadRoomStatesStore();
        const cachedName = roomNamesStore[id];
        const cachedState = roomStatesStore[id];
        const label = (room && (room.nombre || room.name || room.salon || room.clave || room.id_salon)) || cachedName || formatLabel(id);
        let color = statusColor(room ? room.estado : (cachedState || 'Disponible'));
        // Detectar clase en curso y forzar rojo si aplica
        try {
            const sch = await fetchScheduleFor(id);
            const ce = findCurrentEvent(sch);
            if (ce) color = statusColor('Ocupado');
        } catch (_) { /* si falla, mantener color base */ }
        const m = createMarkerMesh(color, label);
        m.position.set(Number(pos.x)||0, Number(pos.y)||0, 0);
        m.userData = { id_salon: id };
        markerGroup.add(m);
    }
}
function canvasToWorldCoords(evt){
    const canvas = document.getElementById('dxfCanvas');
    if (!canvas || !dxfCamera) return null;
    const rect = canvas.getBoundingClientRect();
    const x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;
    const vec = new THREE.Vector3(x, y, 0);
    vec.unproject(dxfCamera);
    return { x: vec.x, y: vec.y };
}
function setupPlacementControls(){
    // Crear selector simple en el panel de filtros existente
    const info = document.getElementById('dxfInfo');
    if (!info) return;
    // Asegurar un elemento de estado que no borre los controles
    let statusEl = info.querySelector('#dxfStatusText');
    if (!statusEl) {
        statusEl = document.createElement('span');
        statusEl.id = 'dxfStatusText';
        statusEl.style.fontWeight = '500';
        statusEl.style.color = '#333';
        info.prepend(statusEl);
    }
    const wrap = document.createElement('div');
    wrap.style.marginTop = '6px';
    wrap.innerHTML = `
        <label style="font-weight:700;color:#8A2041;margin-right:6px;">Señalizar salón:</label>
        <select id="placeRoomSel" style="padding:3px 6px;border:1px solid #8A2041;border-radius:6px"></select>
        <label style="margin-left:8px;user-select:none;">
            <input type="checkbox" id="placeModeToggle" style="vertical-align:middle;margin-right:4px;">Modo señalizar
        </label>
        <button id="removeMarkerBtn" style="margin-left:8px;padding:3px 8px;border:1px solid #8A2041;border-radius:6px;background:#fff;color:#8A2041;cursor:pointer;">Quitar marcador</button>
        <span id="placeHelp" class="small-muted" style="margin-left:8px;color:#555;">Selecciona un salón y activa modo</span>
    `;
    info.appendChild(wrap);
    const sel = wrap.querySelector('#placeRoomSel');
    const modeToggle = wrap.querySelector('#placeModeToggle');
    const removeBtn = wrap.querySelector('#removeMarkerBtn');
    const helpSpan = wrap.querySelector('#placeHelp');
    function refreshOptions(){
        sel.innerHTML = '';
        loadRoomMarkersStore();
        const rooms = getRoomsForCurrentFloor();
        const def = document.createElement('option'); def.value=''; def.textContent='—'; sel.appendChild(def);
        rooms.forEach(r => { const o=document.createElement('option'); o.value=String(r.id_salon); o.textContent=r.nombre || r.id_salon; sel.appendChild(o); });

        const disabled = (currentFloor === 0) || rooms.length === 0;
        sel.disabled = disabled;
        modeToggle.disabled = disabled;
        removeBtn.disabled = disabled;

        if (currentFloor === 0) {
            helpSpan.textContent = 'Lobby no señalizable';
        } else if (rooms.length === 0) {
            helpSpan.textContent = 'No hay salones en este piso';
        } else {
            const pisoKey = String(currentFloor);
            const idSel = sel.value;
            if (idSel && roomMarkersStore && roomMarkersStore[pisoKey] && roomMarkersStore[pisoKey][String(idSel)]) {
                helpSpan.textContent = 'Marcador existente: puedes recolocar o quitar';
            } else {
                helpSpan.textContent = 'Selecciona un salón y activa modo';
            }
        }
    }
    refreshOptions();
    // Exponer para que otros eventos actualicen las opciones
    window._mapPlacementControls = { refreshOptions };
    // Actualizar ayuda al cambiar selección
    sel.addEventListener('change', () => {
        const pisoKey = String(currentFloor);
        const idSel = sel.value;
        if (!idSel) { helpSpan.textContent = 'Selecciona un salón y activa modo'; return; }
        if (roomMarkersStore && roomMarkersStore[pisoKey] && roomMarkersStore[pisoKey][String(idSel)]) {
            helpSpan.textContent = 'Marcador existente: puedes recolocar o quitar';
        } else {
            helpSpan.textContent = 'Sin marcador: activa modo y haz click en el plano';
        }
    });
    // Click para colocar
    const canvas = document.getElementById('dxfCanvas');
    canvas && canvas.addEventListener('click', (evt) => {
        if (currentFloor === 0) return; // ignorar lobby
        if (!modeToggle || !modeToggle.checked) return; // modo desactivado
        const idSel = sel.value;
        if (!idSel) return;
        const pos = canvasToWorldCoords(evt);
        if (!pos) return;
        (async () => {
            try {
                if (!token) {
                    // Sin sesión: guardar sólo local y avisar
                    loadRoomMarkersStore();
                    const pisoKey = String(currentFloor);
                    roomMarkersStore[pisoKey] = roomMarkersStore[pisoKey] || {};
                    roomMarkersStore[pisoKey][String(idSel)] = pos;
                    saveRoomMarkersStore();
                    renderMarkers();
                    helpSpan.textContent = 'Debes iniciar sesión (Admin) para guardar en BD';
                    return;
                }
                await upsertMarkerBackend(currentFloor, idSel, pos);
                loadRoomMarkersStore();
                const pisoKey = String(currentFloor);
                roomMarkersStore[pisoKey] = roomMarkersStore[pisoKey] || {};
                roomMarkersStore[pisoKey][String(idSel)] = pos;
                saveRoomMarkersStore();
                renderMarkers();
                helpSpan.textContent = 'Marcador colocado: puedes recolocar o quitar';
            } catch(e){
                console.error('Error guardando marcador en BD, guardando localmente:', e);
                loadRoomMarkersStore();
                const pisoKey = String(currentFloor);
                roomMarkersStore[pisoKey] = roomMarkersStore[pisoKey] || {};
                roomMarkersStore[pisoKey][String(idSel)] = pos;
                saveRoomMarkersStore();
                renderMarkers();
                const msg = String(e && e.message || '').toLowerCase();
                if (!token) {
                    helpSpan.textContent = 'Debes iniciar sesión (Admin) para guardar en BD';
                } else if (msg.includes('http 401') || msg.includes('http 403')) {
                    helpSpan.textContent = 'Requiere rol administrador para guardar en BD';
                } else {
                    helpSpan.textContent = 'Marcador colocado localmente (sin BD)';
                }
            }
        })();
    });
    // Quitar marcador
    removeBtn && removeBtn.addEventListener('click', () => {
        if (currentFloor === 0) return; // ignorar lobby
        const idSel = sel.value;
        if (!idSel) { helpSpan.textContent = 'Selecciona un salón primero'; return; }
        (async () => {
            try {
                if (!token) {
                    helpSpan.textContent = 'Debes iniciar sesión (Admin) para borrar en BD';
                } else {
                    await deleteMarkerBackend(currentFloor, idSel);
                }
            } catch(e){
                const msg = String(e && e.message || '').toLowerCase();
                if (msg.includes('http 401') || msg.includes('http 403')) {
                    helpSpan.textContent = 'Requiere rol administrador para borrar en BD';
                }
                console.warn('No se pudo eliminar en BD (continuando):', e.message);
            }
            loadRoomMarkersStore();
            const pisoKey = String(currentFloor);
            if (roomMarkersStore[pisoKey] && roomMarkersStore[pisoKey][String(idSel)]) {
                delete roomMarkersStore[pisoKey][String(idSel)];
                saveRoomMarkersStore();
                renderMarkers();
                helpSpan.textContent = 'Marcador eliminado';
            } else {
                helpSpan.textContent = 'Este salón no tiene marcador';
            }
        })();
    });
}

// Actualiza el estado del DXF sin borrar los controles
function setDxfStatus(text){
    const dxfInfo = document.getElementById('dxfInfo');
    if (!dxfInfo) return;
    const statusEl = dxfInfo.querySelector('#dxfStatusText');
    if (statusEl) statusEl.textContent = text;
    else dxfInfo.textContent = text; // fallback si aún no hay controles
}


window.loadDXFPlan = async function(floor) {
    console.log(`Intentando cargar piso ${floor}...`);
    
    if (!DXF_FILES[floor]) {
        const errorMsg = `❌ No hay archivo DXF configurado para piso ${floor}`;
        console.error(errorMsg);
        showDXFError(errorMsg);
        return;
    }
    
    const fileName = DXF_FILES[floor];
    console.log(`Buscando archivo: "${fileName}"`);
    
    const dxfInfo = document.getElementById('dxfInfo');
    if (dxfInfo) {
        setDxfStatus(`Buscando: ${fileName}...`);
    }
    
    try {
        console.log(`Haciendo fetch a: ${fileName}`);
        const response = await fetch(fileName);
        
        console.log(`Respuesta del servidor: ${response.status} ${response.statusText}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const dxfText = await response.text();
        console.log(`✅ Archivo cargado - Tamaño: ${dxfText.length} caracteres`);
        
        if (!dxfText || dxfText.length === 0) {
            throw new Error('El archivo está vacío (0 bytes)');
        }
        
        if (!dxfText.includes('SECTION') && !dxfText.includes('ENTITIES')) {
            console.warn('⚠️ El archivo no parece ser un DXF válido');
        }
        
        // Procesar DXF si hay integración disponible
        try {
            if (typeof window.processDXF === 'function') {
                window.processDXF(dxfText, floor);
            } else {
                console.warn('processDXF no definido; se omite render de plano DXF');
            }
        } catch (e) {
            console.error('Error en processDXF:', e);
        }
        // Después de cargar piso, refrescar marcadores del piso
        currentFloor = floor;
        await fetchRooms();
        await fetchMarkersForFloor(currentFloor);
        await renderMarkers();
        
    } catch (error) {
        console.error('❌ Error cargando DXF:', error);
        
        const errorMsg = `Error: ${error.message}<br>
                         Archivo: ${fileName}<br>
                         Piso: ${floor}<br>
                         <small>Verifica que el archivo exista en esta carpeta</small>`;
        
        showDXFError(errorMsg);
        
        const dxfInfo = document.getElementById('dxfInfo');
        if (dxfInfo) {
            setDxfStatus(`ERROR: ${error.message}`);
        }
    }
}

function showDXFError(message) {
    const errorDiv = document.getElementById('dxfError');
    if (errorDiv) {
        errorDiv.innerHTML = `<div style="color:#721c24;background-color:#f8d7da;border:1px solid #f5c6cb;padding:15px;border-radius:5px;">
            <strong>❌ Error cargando plano</strong><br>
            ${message}
        </div>`;
        errorDiv.style.display = 'block';
    }
}

function normalizeDXFCoordinates(entity) {
    
    const scale = entity.scale || 1;
    
    if (entity.position) {
        entity.position.x = (entity.position.x - 2700) * 0.1 * scale;
        entity.position.y = (entity.position.y - 1400) * 0.1 * scale;
    }

    if (entity.start) {
        entity.start.x = (entity.start.x - 2700) * 0.1 * scale;
        entity.start.y = (entity.start.y - 1400) * 0.1 * scale;
    }
    if (entity.end) {
        entity.end.x = (entity.end.x - 2700) * 0.1 * scale;
        entity.end.y = (entity.end.y - 1400) * 0.1 * scale;
    }

    if (entity.center) {
        entity.center.x = (entity.center.x - 2700) * 0.1 * scale;
        entity.center.y = (entity.center.y - 1400) * 0.1 * scale;
    }

    if (entity.vertices && Array.isArray(entity.vertices)) {
        entity.vertices.forEach(v => {
            if (v.x !== undefined) v.x = (v.x - 2700) * 0.1 * scale;
            if (v.y !== undefined) v.y = (v.y - 1400) * 0.1 * scale;
        });
    }
    return entity;
}

function processDXF(dxfContent, floor) {
    try {
        console.log('Parseando contenido DXF...');
        const parsed = dxf.parseString(dxfContent);
        
        console.log('DXF parseado - Entidades:', parsed.entities ? parsed.entities.length : 0);
        
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        let hasSmallCoords = false, hasLargeCoords = false;
        
        if (parsed.entities && Array.isArray(parsed.entities)) {
            parsed.entities.forEach(entity => {
                const getCoords = (obj) => {
                    const coords = [];
                    if (obj.start) { coords.push(obj.start.x, obj.start.y); }
                    if (obj.end) { coords.push(obj.end.x, obj.end.y); }
                    if (obj.center) { coords.push(obj.center.x, obj.center.y); }
                    if (obj.position) { coords.push(obj.position.x, obj.position.y); }
                    if (obj.vertices) {
                        obj.vertices.forEach(v => {
                            if (v.x !== undefined) coords.push(v.x);
                            if (v.y !== undefined) coords.push(v.y);
                        });
                    }
                    return coords;
                };
                
                const coords = getCoords(entity);
                coords.forEach(c => {
                    if (c !== undefined) {
                        minX = Math.min(minX, c);
                        maxX = Math.max(maxX, c);
                        if (Math.abs(c) < 100) hasSmallCoords = true;
                        if (Math.abs(c) > 100) hasLargeCoords = true;
                    }
                });
            });
        }
        
        console.log(`   Rango detectado - X: [${minX.toFixed(2)}, ${maxX.toFixed(2)}], Y: [${minY.toFixed(2)}, ${maxY.toFixed(2)}]`);
        console.log(`   hasSmallCoords: ${hasSmallCoords}, hasLargeCoords: ${hasLargeCoords}`);
        
        if (currentDxfObject) {
            dxfScene.remove(currentDxfObject);
            currentDxfObject = null;
        }
        
        const group = new THREE.Group();
        let entityCount = 0;
        
        if (parsed.entities && parsed.entities.length > 0) {
            console.log('Creando entidades 3D...');
            parsed.entities.forEach(entity => {
                const normalizedEntity = normalizeDXFCoordinates(entity);
                const mesh = createDXFEntity(normalizedEntity);
                if (mesh) {
                    mesh.position.z = 0;
                    group.add(mesh);
                    entityCount++;
                }
            });
        } else {
            console.warn('⚠️ No se encontraron entidades en el DXF');
        }
        
        group.position.set(0, 0, 0);
        group.rotation.set(0, 0, 0);
        
        dxfScene.add(group);
        currentDxfObject = group;
        
        const errorDiv = document.getElementById('dxfError');
        if (errorDiv) errorDiv.style.display = 'none';
        
        const floorNames = {
            0: 'Lobby',
            1: 'Planta 1er Nivel',
            2: 'Planta 2do Nivel',
            3: 'Planta 3er Nivel'
        };
        
        applyInitialZoom(group, floor);
        
        console.log(`✅ DXF cargado exitosamente: ${entityCount} entidades`);
        
    } catch (error) {
        console.error('❌ Error procesando DXF:', error);
        const errorMsg = `Error procesando DXF: ${error.message}<br>
                         <small>El archivo puede estar corrupto o no ser un DXF válido</small>`;
        showDXFError(errorMsg);
    }
}


function createDXFEntity(entity) {
    try {
        if (!entity || !entity.type) {
            console.warn('❌ Entidad DXF sin tipo definido:', entity);
            return null;
        }
        
        if (entity.type.toUpperCase() === 'INSERT' || entity.blockName === 'PTA90D') {
            console.log(`Saltando bloque INSERT: ${entity.blockName || 'desconocido'}`);
            return null;
        }
        
        console.log(`Creando entidad tipo: ${entity.type}`);
        
        switch (entity.type.toUpperCase()) {
            case 'LINE':
                return createDXFLine(entity);
            case 'LWPOLYLINE':
            case 'POLYLINE':
                return createDXFPolyline(entity);
            case 'CIRCLE':
                return createDXFCircle(entity);
            case 'ARC':
                return createDXFArc(entity);
            case 'TEXT':
                return createDXFText(entity);
            case 'POINT':
                return createDXFPoint(entity);
            case 'INSERT':
                return createDXFInsert(entity);
            default:
                console.log(`⚠️ Tipo de entidad no soportada: ${entity.type}`);
                return null;
        }
    } catch (error) {
        console.error(`❌ Error creando entidad ${entity.type}:`, error);
        return null;
    }
}

function createDXFLine(entity) {
    try {
        const startX = entity.start?.x || 0;
        const startY = entity.start?.y || 0;
        const endX = entity.end?.x || 0;
        const endY = entity.end?.y || 0;
        
        const points = [
            new THREE.Vector3(startX, startY, 0),
            new THREE.Vector3(endX, endY, 0)
        ];
        
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ 
            color: 0x000000,
            linewidth: 1
        });
        
        return new THREE.Line(geometry, material);
    } catch (error) {
        console.error('❌ Error creando línea:', error);
        return null;
    }
}

function createDXFPolyline(entity) {
    try {
        if (!entity.vertices || !Array.isArray(entity.vertices) || entity.vertices.length === 0) {
            console.warn('❌ Polilínea sin vértices');
            return null;
        }
        
        const points = entity.vertices.map(v => 
            new THREE.Vector3(v.x || 0, v.y || 0, v.z || 0)
        );
        
        if (entity.shape && points.length > 0) {
            points.push(points[0].clone());
        }
        
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ 
            color: 0x0000ff,
            linewidth: 1
        });
        
        return new THREE.Line(geometry, material);
    } catch (error) {
        console.error('❌ Error creando polilínea:', error);
        return null;
    }
}

function createDXFCircle(entity) {
    try {
        const radius = entity.radius || 1;
        const centerX = entity.center?.x || 0;
        const centerY = entity.center?.y || 0;
        const segments = 32;
        
        const points = [];
        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            points.push(new THREE.Vector3(
                centerX + Math.cos(angle) * radius,
                centerY + Math.sin(angle) * radius,
                0
            ));
        }
        
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ 
            color: 0xff0000,
            linewidth: 1
        });
        
        return new THREE.Line(geometry, material);
    } catch (error) {
        console.error('❌ Error creando círculo:', error);
        return null;
    }
}

function createDXFArc(entity) {
    try {
        const startAngle = THREE.MathUtils.degToRad(entity.startAngle || 0);
        const endAngle = THREE.MathUtils.degToRad(entity.endAngle || 360);
        const radius = entity.radius || 1;
        const centerX = entity.center?.x || 0;
        const centerY = entity.center?.y || 0;
        const segments = 32;
        
        const points = [];
        for (let i = 0; i <= segments; i++) {
            const angle = startAngle + (endAngle - startAngle) * (i / segments);
            points.push(new THREE.Vector3(
                centerX + Math.cos(angle) * radius,
                centerY + Math.sin(angle) * radius,
                0
            ));
        }
        
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ 
            color: 0x00aa00,
            linewidth: 1
        });
        
        return new THREE.Line(geometry, material);
    } catch (error) {
        console.error('❌ Error creando arco:', error);
        return null;
    }
}

function createDXFText(entity) {
    try {
        const posX = entity.position?.x || 0;
        const posY = entity.position?.y || 0;
        
        const points = [
            new THREE.Vector3(posX, posY, 0),
            new THREE.Vector3(posX + 3, posY, 0)
        ];
        
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ 
            color: 0xaa00aa,
            linewidth: 1
        });
        
        return new THREE.Line(geometry, material);
    } catch (error) {
        console.error('❌ Error creando texto:', error);
        return null;
    }
}

function createDXFPoint(entity) {
    try {
        const posX = entity.position?.x || 0;
        const posY = entity.position?.y || 0;
        const size = 0.2;
        
        const points = [
            new THREE.Vector3(posX - size, posY, 0),
            new THREE.Vector3(posX + size, posY, 0),
            new THREE.Vector3(posX, posY - size, 0),
            new THREE.Vector3(posX, posY + size, 0)
        ];
        
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ 
            color: 0xffff00,
            linewidth: 1
        });
        
        return new THREE.LineSegments(geometry, material);
    } catch (error) {
        console.error('❌ Error creando punto:', error);
        return null;
    }
}

function createDXFInsert(entity) {
    try {
        const posX = entity.position?.x || 0;
        const posY = entity.position?.y || 0;
        const size = 2;
        
        const points = [
            new THREE.Vector3(posX - size, posY - size, 0),
            new THREE.Vector3(posX + size, posY - size, 0),
            new THREE.Vector3(posX + size, posY + size, 0),
            new THREE.Vector3(posX - size, posY + size, 0),
            new THREE.Vector3(posX - size, posY - size, 0) // Cerrar
        ];
        
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ 
            color: 0x888888,
            linewidth: 1
        });
        
        return new THREE.Line(geometry, material);
    } catch (error) {
        console.error('❌ Error creando insert:', error);
        return null;
    }
}

function centerDXFView(object, floor = 1) {
    try {
        const box = new THREE.Box3().setFromObject(object);
        
        if (box.isEmpty()) {
            console.warn('⚠️ Objeto DXF vacío - no se puede centrar');
            return;
        }
        
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        
        console.log(`Piso ${floor} - Tamaño del plano: ${size.x.toFixed(2)}x${size.y.toFixed(2)}`);
        
        object.position.x = -center.x;
        object.position.y = -center.y;

        const cfg = DXF_ZOOM_CONFIG[floor] || { padding: 0.12, multiplier: 1.0, minScale: 0.25, maxScale: 40 };

        const container = document.getElementById('dxfContainer');
        const aspect = container ? (container.clientWidth / Math.max(1, container.clientHeight)) : 1;

        const requiredViewSize = Math.max(size.y, size.x / aspect);

        const desiredViewUnits = requiredViewSize * (1 + (cfg.padding || 0.12));

        const BASE_SIZE = 100;

        const rawScale = BASE_SIZE / Math.max(1e-6, desiredViewUnits);
        dxfScale = Math.max(cfg.minScale || 0.2, Math.min(cfg.maxScale || 40, rawScale * (cfg.multiplier || 1)));

        console.log(`   Zoom inicial por archivo/piso ${floor}:`);
        console.log(`   • Tamaño plano: ${size.x.toFixed(2)}x${size.y.toFixed(2)}`);
        console.log(`   • Aspect contenedor: ${aspect.toFixed(3)}`);
        console.log(`   • requiredViewSize: ${requiredViewSize.toFixed(2)}, desiredViewUnits: ${desiredViewUnits.toFixed(2)}`);
        console.log(`   • rawScale: ${rawScale.toFixed(4)}, multiplier: ${cfg.multiplier || 1}`);
        console.log(`   • Escala resultante: ${dxfScale.toFixed(3)} (min=${cfg.minScale}, max=${cfg.maxScale})`);

        updateDXFCamera();

        const dxfInfo = document.getElementById('dxfInfo');
        if (dxfInfo) {
            const currentText = dxfInfo.textContent;
            const zoomLevel = dxfScale >= 6 ? "MUY CERCA" :
                              dxfScale >= 2 ? "CERCA" :
                              dxfScale >= 0.8 ? "NORMAL" : "ALEJADO";
            dxfInfo.textContent = `${currentText} | Zoom: ${zoomLevel}`;
        }
        
    } catch (error) {
        console.error('❌ Error centrando vista DXF:', error);
    }
}

function applyInitialZoom(object, floor = 1) {
    try {
        const box = new THREE.Box3().setFromObject(object);
        
        if (box.isEmpty()) {
            console.warn('⚠️ Objeto DXF vacío - no se puede aplicar zoom');
            return;
        }
        
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        
        object.position.x = -center.x;
        object.position.y = -center.y;

        const cfg = DXF_ZOOM_CONFIG[floor];
        if (!cfg) {
            console.warn(`⚠️ No hay configuración de zoom para piso ${floor}, usando defaults`);
        }

        const config = cfg || { padding: 0.12, multiplier: 1.0, minScale: 0.25, maxScale: 40 };

        const container = document.getElementById('dxfContainer');
        if (!container) {
            console.error('❌ No hay contenedor DXF');
            return;
        }

        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        const aspect = containerWidth / Math.max(1, containerHeight);

        const requiredViewSize = Math.max(size.y, size.x / aspect);

        const desiredViewUnits = requiredViewSize * (1 + config.padding);

        const BASE_SIZE = 100;

        const rawScale = BASE_SIZE / Math.max(1e-6, desiredViewUnits);

        dxfScale = Math.max(config.minScale, Math.min(config.maxScale, rawScale * config.multiplier));

        console.log(`   ZOOM INICIAL PISO ${floor}:`);
        console.log(`   Plano: ${size.x.toFixed(2)}x${size.y.toFixed(2)}, Contenedor: ${containerWidth}x${containerHeight}, Aspect: ${aspect.toFixed(3)}`);
        console.log(`   requiredViewSize: ${requiredViewSize.toFixed(2)}, desiredViewUnits: ${desiredViewUnits.toFixed(2)}`);
        console.log(`   rawScale: ${rawScale.toFixed(4)}, multiplier: ${config.multiplier}, dxfScale: ${dxfScale.toFixed(3)}`);
        console.log(`   Limites: min=${config.minScale}, max=${config.maxScale}`);

        updateDXFCamera();

        const dxfInfo = document.getElementById('dxfInfo');
        if (dxfInfo) {
            const zoomLevel = dxfScale >= 6 ? "MUY CERCA" :
                              dxfScale >= 2 ? "CERCA" :
                              dxfScale >= 0.8 ? "NORMAL" : "ALEJADO";
            const statusEl = dxfInfo.querySelector('#dxfStatusText');
            const currentText = statusEl ? statusEl.textContent : dxfInfo.textContent;
            setDxfStatus(`${currentText} | Zoom: ${zoomLevel}`);
        }
        
    } catch (error) {
        console.error('❌ Error aplicando zoom inicial:', error); //javi perdoname por favor pero vas y chingas a tu madre :3
    }
}


function centerDXFViewStrongZoom(object, floor = 1) {
    try {
        const box = new THREE.Box3().setFromObject(object);
        if (box.isEmpty()) return;

        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        object.position.x = -center.x;
        object.position.y = -center.y;

        const cfg = DXF_ZOOM_CONFIG[floor] || { padding: 0.12, multiplier: 1.0, minScale: 0.25, maxScale: 40, strongMultiplier: 2.0, strongPadding: 0.06 };

        const container = document.getElementById('dxfContainer');
        const aspect = container ? (container.clientWidth / Math.max(1, container.clientHeight)) : 1;

        const requiredViewSize = Math.max(size.y, size.x / aspect);
        const desiredViewUnits = requiredViewSize * (1 + (cfg.strongPadding || 0.06));

        const BASE_SIZE = 100;
        const rawScale = BASE_SIZE / Math.max(1e-6, desiredViewUnits);
        const strongMultiplier = cfg.strongMultiplier || (cfg.multiplier ? cfg.multiplier * 2.0 : 2.0);

        dxfScale = Math.max(cfg.minScale || 0.2, Math.min(cfg.maxScale || 80, rawScale * strongMultiplier));
        console.log(`   Zoom IN FUERTE: desiredViewUnits=${desiredViewUnits.toFixed(2)}, rawScale=${rawScale.toFixed(4)}, strongMult=${strongMultiplier}, escala=${dxfScale.toFixed(3)}`);
        updateDXFCamera();
    } catch (error) {
        console.error('❌ Error centro zoom fuerte:', error);
    }
}

//javi se van a pasar de la 1000 lineas c: eso te pasa por decirme muy tarde sobre el lobby vete a la vrg

window.adjustDXFZoom = function(factor) {
    if (typeof factor !== 'number') {
        console.log('❌ Uso: adjustDXFZoom(150) - donde 150 es el factor (más alto = más cerca)');
        console.log('   Valores sugeridos:');
        console.log('   50-80  → Muy alejado');
        console.log('   90-120 → Alejado');
        console.log('   130-170 → Normal');
        console.log('   180-220 → Cerca');
        console.log('   230-300 → Muy cerca');
        return;
    }
    
    const container = document.getElementById('dxfContainer');
    if (!container) {
        console.error('❌ No hay contenedor DXF activo');
        return;
    }
    
    const width = container.clientWidth;
    const height = container.clientHeight;
    const aspect = width / height;
    
    const baseSize = 100;
    const viewSize = baseSize / dxfScale;
    
    dxfScale = Math.max(0.1, dxfScale * (150 / factor));
    
    console.log(`Ajustando zoom: factor=${factor}, nueva escala=${dxfScale.toFixed(3)}`);
    updateDXFCamera();
}

window.showLobbyPlan = function() {
    console.log('Mostrando plano del Lobby...');
    const floor = 0;
    currentFloor = floor;

    document.querySelector('.floor-item.active')?.classList.remove('active');

    if (mapLoading) mapLoading.classList.add('show');
    if (mapFrame) mapFrame.classList.add('fade-out');

    setTimeout(() => {
        if (mapFrame) {
            mapFrame.classList.remove('fade-out');
            mapFrame.classList.add('fade-in');
        }

        setTimeout(() => {
            if (mapFrame) mapFrame.classList.remove('fade-in');
            if (mapLoading) mapLoading.classList.remove('show');
        }, 350);

        if (typeof loadDXFPlan === 'function') {
            loadDXFPlan(floor);
        }
    }, 550);
};

function animateDXF() {
    requestAnimationFrame(animateDXF);
    if (dxfRenderer && dxfScene && dxfCamera) {
        try {
            dxfRenderer.render(dxfScene, dxfCamera);
        } catch (error) {
            console.error('❌ Error en animación DXF:', error);
        }
    }
}

window.inspectDXFGeometry = function() {
    if (!currentDxfObject) {
        console.error('❌ No hay objeto DXF cargado');
        return;
    }

    console.log('INSPECCIONANDO GEOMETRÍAS DXF:');
    console.log(`Total children: ${currentDxfObject.children.length}`);
    
    let i = 0;
    currentDxfObject.traverse(child => {
        if (child.geometry && child !== currentDxfObject) {
            const box = new THREE.Box3().setFromObject(child);
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());
            
            console.log(`[${i}] tipo=${child.type}`);
            console.log(`    posición: (${child.position.x.toFixed(2)}, ${child.position.y.toFixed(2)}, ${child.position.z.toFixed(2)})`);
            console.log(`    tamaño: ${size.x.toFixed(2)}x${size.y.toFixed(2)}x${size.z.toFixed(2)}`);
            console.log(`    center: (${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)})`);
            console.log(`    vertices: ${child.geometry.attributes?.position?.count || 'N/A'}`);
            console.log(`    visible: ${child.visible}`);
            console.log('---');
            i++;
        }
    });
};

window.removeFirstShape = function() {
    if (!currentDxfObject || currentDxfObject.children.length === 0) {
        console.error('❌ No hay formas para remover');
        return;
    }

    const firstChild = currentDxfObject.children[0];
    console.log(`Removiendo primer elemento:`, firstChild);
    currentDxfObject.remove(firstChild);
    console.log('✅ Removido');
};

window.removeExtraShapes = function() {
    if (!currentDxfObject) {
        console.error('❌ No hay objeto DXF cargado');
        return;
    }

    try {
        const toRemove = [];
        let removedCount = 0;

        currentDxfObject.traverse(child => {
            if (child.geometry) {
                const box = new THREE.Box3().setFromObject(child);
                const size = box.getSize(new THREE.Vector3());
                
                const aspect = size.x / size.y;
                if (aspect > 0.95 && aspect < 1.05 && size.x > 5 && size.y > 5) {
                    console.log(`Removiendo forma sospechosa: ${size.x.toFixed(2)}x${size.y.toFixed(2)}, aspecto=${aspect.toFixed(2)}`);
                    toRemove.push(child);
                    removedCount++;
                }
            }
        });

        toRemove.forEach(child => currentDxfObject.remove(child));
        console.log(`✅ Se removieron ${removedCount} formas sospechosas`);
    } catch (error) {
        console.error('❌ Error removiendo formas:', error);
    }
};

window.fixDXFVisibility = function() {
    if (!currentDxfObject) {
        console.error('❌ No hay objeto DXF cargado para ajustar visibilidad');
        return;
    }

    try {
        if (dxfScene) dxfScene.background = new THREE.Color(0xf0f0f0);

        const box = new THREE.Box3().setFromObject(currentDxfObject);
        if (box.isEmpty()) {
            console.warn('⚠️ Caja DXF vacía, nada que ajustar');
            return;
        }

        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y);

        const TARGET_DISPLAY_SIZE = 60;
        const scaleFactor = maxDim > 0 ? (TARGET_DISPLAY_SIZE / maxDim) : 1;

        currentDxfObject.scale.set(scaleFactor, scaleFactor, 1);

        const center = box.getCenter(new THREE.Vector3());
        currentDxfObject.position.x = -center.x * scaleFactor;
        currentDxfObject.position.y = -center.y * scaleFactor;

        currentDxfObject.traverse(child => {
            if (child.material) {
                try {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.color && (m.color.set(0x000000)));
                    } else {
                        child.material.color && child.material.color.set(0x000000);
                    }
                } catch (err) {
                }
            }
        });

        dxfScale = 1;
        updateDXFCamera();

        console.log('Visibilidad DXF ajustada. scaleFactor=', scaleFactor.toFixed(4));
    } catch (error) {
        console.error('Error ajustando visibilidad DXF:', error);
    }
};

