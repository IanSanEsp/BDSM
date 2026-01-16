const DXF_FILES = {
    0: 'assets/dxf/Lobby.dxf',
    1: 'assets/dxf/Planta1.dxf',
    2: 'assets/dxf/Planta2.dxf',
    3: 'assets/dxf/Planta3.dxf'
};

// configuracion de zoom por cada DXF
const DXF_ZOOM_CONFIG = {
    0: {
        padding: 0.0,
        multiplier: 0.5,
        fitMode: 'cover',
        minScale: 0.3,
        maxScale: 50,
        strongMultiplier: 2.0,
        strongPadding: 0.01
    },
    1: { 
        padding: 0.0, 
        multiplier: 0.7, 
        fitMode: 'cover',
        minScale: 0.25, 
        maxScale: 35, 
        strongMultiplier: 1.8, 
        strongPadding: 0.01 
    },
    2: { 
        padding: 0.0, 
        multiplier: 0.7, 
        fitMode: 'cover',
        minScale: 0.28, 
        maxScale: 38, 
        strongMultiplier: 2.0, 
        strongPadding: 0.01 
    },
    3: { 
        padding: 0.0, 
        multiplier: 0.7, 
        fitMode: 'cover',
        minScale: 0.22, 
        maxScale: 32, 
        strongMultiplier: 1.7, 
        strongPadding: 0.01 
    }
};

let dxfScene, dxfCamera, dxfRenderer;
let dxfScale = 1;
let currentDxfObject = null;
let currentFloor = 0;

// Marcadores de salones (visualización en Admin Main)
let markerGroup = null;
let roomMarkersStore = { '1': {}, '2': {}, '3': {} };
let roomsCache = [];
const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://localhost:3000'
    : 'https://bdsm-production-0032.up.railway.app';
const TOKEN = (localStorage.getItem('token') || '').trim();

document.addEventListener('DOMContentLoaded', function() {
    console.log('Inicializando DXF en Admin Main...');
    
    setTimeout(function() {
        initDXFVisualizer();
        setupFloorNavigation();
        
        if (window.loadDXFPlan) {
            console.log('🔎 Cargando Lobby automáticamente...');
            loadDXFPlan(0);
        }
    }, 500);
});

function initDXFVisualizer() {
    console.log('🔧 Inicializando visualizador DXF Admin-Main...');
    
    const mapInner = document.getElementById('mapInner');
    if (!mapInner) {
        console.error('❌ No se encontró #mapInner');
        return;
    }
    
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
}

function setupThreeJS() {
    const container = document.getElementById('dxfContainer');
    if (!container) {
        console.error('❌ No se encontró #dxfContainer');
        return;
    }
    
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    console.log(`Tamaño del contenedor DXF: ${width}x${height}`);
    
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
    
    console.log('✅ Three.js configurado');
    
    setupDXFControls();
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

    // Refresco periódico de marcadores/estado cada 60s
    setInterval(async () => {
        await fetchRooms();
        if (currentFloor) await fetchMarkersForFloor(currentFloor);
        renderMarkers();
    }, 60_000);
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

// Cargar listado de salones (para colores y nombres)
async function fetchRooms(){
    try {
        const headers = TOKEN ? { 'Authorization': `Bearer ${TOKEN}` } : {};
        const res = await fetch(`${API_BASE}/api/salones`, { headers });
        const data = await res.json().catch(()=>[]);
        roomsCache = Array.isArray(data) ? data : [];
    } catch(e){ roomsCache = []; }
}
function getRoomsForCurrentFloor(){
    const piso = String(currentFloor);
    return roomsCache.filter(r => String(r.piso) === piso);
}
function statusColor(estado){
    const s = String(estado||'').toLowerCase();
    if (s.includes('manten')) return 0x9AA0A6; // gris mantenimiento (#9aa0a6)
    if (s.includes('ocupa')) return 0xD62839; // rojo ocupado (#d62839)
    return 0x4CAF50; // verde disponible (#4caf50)
}
function createLabelSprite(text){
    const DPR = Math.max(1, Math.min(2, window.devicePixelRatio||1));
    const pad = 2 * DPR;
    const fontSize = 9 * DPR;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `bold ${fontSize}px sans-serif`;
    const metrics = ctx.measureText(text);
    const w = Math.ceil(metrics.width) + pad*2;
    const h = fontSize + pad*2;
    canvas.width = w;
    canvas.height = h;
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = DPR;
    ctx.beginPath();
    const r = 4 * DPR;
    ctx.moveTo(r,0); ctx.lineTo(w-r,0); ctx.quadraticCurveTo(w,0,w,r);
    ctx.lineTo(w,h-r); ctx.quadraticCurveTo(w,h,w-r,h);
    ctx.lineTo(r,h); ctx.quadraticCurveTo(0,h,0,h-r);
    ctx.lineTo(0,r); ctx.quadraticCurveTo(0,0,r,0);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'top';
    ctx.fillText(text, pad, pad);
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    const mat = new THREE.SpriteMaterial({ map: tex });
    const spr = new THREE.Sprite(mat);
    spr.scale.set(w/100, h/100, 1);
    return spr;
}
function createMarkerMesh(color, labelText){
    const group = new THREE.Group();
    const geom = new THREE.CircleGeometry(0.12, 16);
    const mat = new THREE.MeshBasicMaterial({ color });
    const dot = new THREE.Mesh(geom, mat);
    dot.position.set(0, 0, 0.1);
    group.add(dot);
    const label = createLabelSprite(labelText);
    label.position.set(0, 0.35, 0.2);
    group.add(label);
    return group;
}
function disposeObject(obj){
    if (!obj) return;
    if (obj.geometry && typeof obj.geometry.dispose === 'function') obj.geometry.dispose();
    const disposeMaterial = (m) => { if (!m) return; if (m.map && m.map.dispose) m.map.dispose(); if (m.dispose) m.dispose(); };
    if (Array.isArray(obj.material)) obj.material.forEach(disposeMaterial); else disposeMaterial(obj.material);
    if (obj.children && obj.children.length) obj.children.forEach(ch => disposeObject(ch));
}
function clearMarkers(){
    if (markerGroup){
        disposeObject(markerGroup);
        dxfScene && dxfScene.remove(markerGroup);
        markerGroup = null;
    }
}
async function fetchMarkersForFloor(piso){
    try {
        if (!TOKEN) return;
        const res = await fetch(`${API_BASE}/api/salon-markers?piso=${encodeURIComponent(piso)}`, { headers: { 'Authorization': `Bearer ${TOKEN}` } });
        if (!res.ok) throw new Error(await res.text());
        const rows = await res.json();
        roomMarkersStore[String(piso)] = {};
        rows.forEach(r => { roomMarkersStore[String(piso)][String(r.id_salon)] = { x: Number(r.x), y: Number(r.y) }; });
    } catch(e){ /* mantener cache */ }
}
function renderMarkers(){
    try {
        clearMarkers();
        markerGroup = new THREE.Group();
        markerGroup.position.set(0,0,0.5);
        const pisoKey = String(currentFloor);
        const rooms = getRoomsForCurrentFloor();
        const byId = {};
        rooms.forEach(r => { byId[String(r.id_salon)] = r; });
        const store = roomMarkersStore[pisoKey] || {};
        Object.keys(store).forEach(id => {
            const pos = store[id];
            const r = byId[id] || {};
            const color = statusColor(r.estado || 'Disponible');
            const label = r.nombre || id;
            const m = createMarkerMesh(color, label);
            m.position.set(Number(pos.x)||0, Number(pos.y)||0, 0.5);
            markerGroup.add(m);
        });
        dxfScene && dxfScene.add(markerGroup);
    } catch(e){ console.warn('renderMarkers error', e); }
}

window.loadDXFPlan = async function(floor) {
    console.log(`Intentando cargar plano: ${floor}`);

    const nameToIndex = {
        'lobby': 0,
        'planta 1': 1,
        'planta1': 1,
        'planta 2': 2,
        'planta2': 2,
        'planta 3': 3,
        'planta3': 3
    };

    let floorIndex = floor;
    if (typeof floor === 'string') {
        const key = floor.trim().toLowerCase();
        if (key in nameToIndex) floorIndex = nameToIndex[key];
        else {
            const m = key.match(/(\d+)/);
            if (m) floorIndex = Number(m[1]);
        }
    }

    if (typeof floorIndex !== 'number' || !(floorIndex in DXF_FILES)) {
        const errorMsg = `❌ No hay archivo DXF configurado para piso ${floor} (resuelto como: ${floorIndex})`;
        console.error(errorMsg);
        showDXFError && showDXFError(errorMsg);
        return;
    }

    const fileName = DXF_FILES[floorIndex];

    const mapLoading = document.getElementById('mapLoading');
    const mapFrame = document.getElementById('mapContainer');
    if (mapLoading) mapLoading.classList.add('show');
    if (mapFrame) mapFrame.classList.add('fade-out');

    const dxfInfo = document.getElementById('dxfInfo');
    if (dxfInfo) dxfInfo.textContent = `Buscando: ${fileName}...`;

    try {
        console.log(`🔍 Haciendo fetch a: ${fileName}`);
        const response = await fetch(fileName);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const dxfText = await response.text();
        if (!dxfText) throw new Error('Archivo vacío');

        await processDXF(dxfText, floorIndex);

        // Después de cargar piso, refrescar salones y marcadores
        currentFloor = floorIndex;
        await fetchRooms();
        await fetchMarkersForFloor(currentFloor);
        renderMarkers();

        if (mapFrame) {
            mapFrame.classList.remove('fade-out');
            mapFrame.classList.add('fade-in');
        }
        if (mapLoading) {
            setTimeout(() => {
                mapLoading.classList.remove('show');
                if (mapFrame) mapFrame.classList.remove('fade-in');
            }, 350);
        }

    } catch (error) {
        console.error('❌ Error cargando DXF:', error);
        const errorMsg = `Error: ${error.message}<br>Archivo: ${fileName}<br>Piso: ${floorIndex}`;
        showDXFError && showDXFError(errorMsg);
        if (dxfInfo) dxfInfo.textContent = `ERROR: ${error.message}`;
        if (mapLoading) mapLoading.classList.remove('show');
        if (mapFrame) mapFrame.classList.remove('fade-out');
    }
}

function processDXF(dxfContent, floor) {
    try {
        const parsed = dxf.parseString(dxfContent);
        
        if (currentDxfObject) {
            dxfScene.remove(currentDxfObject);
            currentDxfObject = null;
        }
        
        const group = new THREE.Group();
        let entityCount = 0;
        
        if (parsed.entities && parsed.entities.length > 0) {
            parsed.entities.forEach(entity => {
                const normalizedEntity = normalizeDXFCoordinates(entity);
                const mesh = createDXFEntity(normalizedEntity);
                if (mesh) {
                    mesh.position.z = 0;
                    group.add(mesh);
                    entityCount++;
                }
            });
        }
        
        group.position.set(0, 0, 0);
        group.rotation.set(0, 0, 0);
        
        dxfScene.add(group);
        currentDxfObject = group;
        
        const floorNames = {
            0: 'Lobby',
            1: 'Planta 1',
            2: 'Planta 2',
            3: 'Planta 3'
        };
        
        const dxfInfo = document.getElementById('dxfInfo');
        if (dxfInfo) {
            dxfInfo.textContent = `${floorNames[floor] || `Piso ${floor}`} | ${entityCount} elementos`;
        }
        
        applyInitialZoom(group, floor);
        console.log(`✅ DXF cargado: ${entityCount} entidades`);
        
    } catch (error) {
        console.error('❌ Error procesando DXF:', error);
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

function createDXFEntity(entity) {
    if (!entity || !entity.type) return null;
    
    if (entity.type.toUpperCase() === 'INSERT' || entity.blockName === 'PTA90D') {
        return null;
    }
    
    switch (entity.type.toUpperCase()) {
        case 'LINE': return createDXFLine(entity);
        case 'LWPOLYLINE':
        case 'POLYLINE': return createDXFPolyline(entity);
        case 'CIRCLE': return createDXFCircle(entity);
        case 'ARC': return createDXFArc(entity);
        case 'TEXT': return createDXFText(entity);
        case 'POINT': return createDXFPoint(entity);
        case 'INSERT': return createDXFInsert(entity);
        default: return null;
    }
}

function createDXFLine(entity) {
    const points = [
        new THREE.Vector3(entity.start?.x || 0, entity.start?.y || 0, 0),
        new THREE.Vector3(entity.end?.x || 0, entity.end?.y || 0, 0)
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 1 });
    return new THREE.Line(geometry, material);
}

function createDXFPolyline(entity) {
    if (!entity.vertices || !Array.isArray(entity.vertices)) return null;
    const points = entity.vertices.map(v => new THREE.Vector3(v.x || 0, v.y || 0, v.z || 0));
    if (entity.shape && points.length > 0) points.push(points[0].clone());
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0x0000ff, linewidth: 1 });
    return new THREE.Line(geometry, material);
}

function createDXFCircle(entity) {
    const radius = entity.radius || 1;
    const centerX = entity.center?.x || 0;
    const centerY = entity.center?.y || 0;
    const points = [];
    for (let i = 0; i <= 32; i++) {
        const angle = (i / 32) * Math.PI * 2;
        points.push(new THREE.Vector3(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius, 0));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 1 });
    return new THREE.Line(geometry, material);
}

function createDXFArc(entity) {
    const startAngle = THREE.MathUtils.degToRad(entity.startAngle || 0);
    const endAngle = THREE.MathUtils.degToRad(entity.endAngle || 360);
    const radius = entity.radius || 1;
    const centerX = entity.center?.x || 0;
    const centerY = entity.center?.y || 0;
    const points = [];
    for (let i = 0; i <= 32; i++) {
        const angle = startAngle + (endAngle - startAngle) * (i / 32);
        points.push(new THREE.Vector3(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius, 0));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0x00aa00, linewidth: 1 });
    return new THREE.Line(geometry, material);
}

function createDXFText(entity) {
    const posX = entity.position?.x || 0;
    const posY = entity.position?.y || 0;
    const points = [new THREE.Vector3(posX, posY, 0), new THREE.Vector3(posX + 3, posY, 0)];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0xaa00aa, linewidth: 1 });
    return new THREE.Line(geometry, material);
}

function createDXFPoint(entity) {
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
    const material = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 1 });
    return new THREE.LineSegments(geometry, material);
}

function createDXFInsert(entity) {
    const posX = entity.position?.x || 0;
    const posY = entity.position?.y || 0;
    const size = 2;
    const points = [
        new THREE.Vector3(posX - size, posY - size, 0),
        new THREE.Vector3(posX + size, posY - size, 0),
        new THREE.Vector3(posX + size, posY + size, 0),
        new THREE.Vector3(posX - size, posY + size, 0),
        new THREE.Vector3(posX - size, posY - size, 0)
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0x888888, linewidth: 1 });
    return new THREE.Line(geometry, material);
}

function applyInitialZoom(object, floor = 0) {
    try {
        const box = new THREE.Box3().setFromObject(object);
        if (box.isEmpty()) return;
        
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        
        object.position.x = -center.x;
        object.position.y = -center.y;


        const config = DXF_ZOOM_CONFIG[floor] || { padding: 0.0, multiplier: 1.0, minScale: 0.25, maxScale: 40, fitMode: 'cover' };

        const container = document.getElementById('dxfContainer');
        if (!container) return;

        const aspect = container.clientWidth / Math.max(1, container.clientHeight);

        let requiredViewSize;
        if (config.fitMode === 'cover') {
            requiredViewSize = Math.min(size.y, size.x / aspect);
        } else {
            requiredViewSize = Math.max(size.y, size.x / aspect);
        }

        const desiredViewUnits = requiredViewSize * (1 + (config.padding || 0));

        const BASE_SIZE = 100;
        const rawScale = BASE_SIZE / Math.max(1e-6, desiredViewUnits);
        dxfScale = Math.max(config.minScale, Math.min(config.maxScale, rawScale * (config.multiplier || 1)));

        console.log(`🎯 ZOOM INICIAL PISO ${floor}: escala=${dxfScale.toFixed(3)}`);
        updateDXFCamera();
        
    } catch (error) {
        console.error('❌ Error aplicando zoom:', error);
    }
}

function setupFloorNavigation() {
    console.log('🔧 Configurando navegación de pisos...');
    
    const floorOptions = document.querySelectorAll('.floor-option');
    const btnFloorLeft = document.getElementById('btn-floor-left');
    const btnFloorRight = document.getElementById('btn-floor-right');
    
    console.log(`Encontrados ${floorOptions.length} opciones de piso`);
    
    floorOptions.forEach((opt, index) => {
        opt.addEventListener('click', () => {
            console.log(`Click en piso ${index}`);
            changeFloor(index);
        });
    });
    
    if (btnFloorLeft) {
        btnFloorLeft.addEventListener('click', () => {
            const next = Math.max(0, currentFloor - 1);
            console.log(`Left clicked: ${currentFloor} -> ${next}`);
            if (next !== currentFloor) changeFloor(next);
        });
    } else {
        console.warn('⚠️ No se encontró #btn-floor-left');
    }
    
    if (btnFloorRight) {
        btnFloorRight.addEventListener('click', () => {
            const next = Math.min(3, currentFloor + 1);
            console.log(`Right clicked: ${currentFloor} -> ${next}`);
            if (next !== currentFloor) changeFloor(next);
        });
    } else {
        console.warn('⚠️ No se encontró #btn-floor-right');
    }
}

function changeFloor(newFloor) {
    if (newFloor === currentFloor) return;
    
    currentFloor = newFloor;
    
    document.querySelectorAll('.floor-option').forEach((btn, idx) => {
        if (idx === newFloor) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    console.log(`Cambiando a piso ${newFloor}`);
    
    if (window.loadDXFPlan) {
        loadDXFPlan(newFloor);
    }
}

function animateDXF() {
    requestAnimationFrame(animateDXF);
    if (dxfRenderer && dxfScene && dxfCamera) {
        try {
            dxfRenderer.render(dxfScene, dxfCamera);
        } catch (error) {
            console.error('❌ Error animación:', error);
        }
    }
}
