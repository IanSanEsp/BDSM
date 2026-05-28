export const DEFAULT_API_URL = 'https://bdsm-production-8774.up.railway.app/api'; // Cambiar cuando ya este en railway
//http://localhost:3000/api
//https://bdsm-production-8774.up.railway.app/api
export const TOKEN_KEY = 'bdsm_token';
export const USER_KEY = 'bdsm_usuario';

export function getSessionToken() {
  const t = localStorage.getItem(TOKEN_KEY);
  return t && String(t).trim() ? String(t).trim() : null;
}

export function getSessionUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setSessionUser(user) {
  if (!user) return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getInitials(nombre) {
  const limpio = String(nombre || '').trim();
  if (!limpio) return 'U';
  const partes = limpio.split(/\s+/).filter(Boolean);
  if (partes.length >= 2) return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
  return partes[0] ? partes[0][0].toUpperCase() : 'U';
}

export function paintSessionHeader(user = getSessionUser()) {
  if (!user) return null;

  const nombreEl = document.querySelector('.nombre-usuario');
  const rolEl = document.querySelector('.rol-usuario');
  const avatarEl = document.querySelector('.avatar');

  if (nombreEl && user.nombre) nombreEl.textContent = String(user.nombre);
  if (rolEl && user.tipo_usuario) rolEl.textContent = String(user.tipo_usuario);
  if (avatarEl) avatarEl.textContent = getInitials(user.nombre);

  return user;
}

// ps me confundi y estaba apuntando al front :D
export function resolveApiBase() {
  const raw = localStorage.getItem('API_URL') || DEFAULT_API_URL;
  return String(raw).replace(/\/+$/, '');
}

export const LAYOUT_PISOS = {
  L: {
    imagen: 'src/img/maps/PB09.png',
    viewBox: '0 0 9689 7592',
    label: 'Planta Baja',
    salones: [
      { nombre: 'Aula de Usos Multiples', x: 395, y: 1110, w: 1260, h: 815, tipo: 'Aula' },
      { nombre: 'Laboratorio de Herramientas Computacionales', x: 100, y: 3150, w: 1020, h: 920, tipo: 'Laboratorio' },
      { nombre: 'Laboratorio de Aplicaciones de los Circuitos Digitales', x: 1120, y: 3150, w: 1020, h: 980, tipo: 'Laboratorio' },
      { nombre: 'Taller de Microprocesadores y Microcontroladores', x: 100, y: 4410, w: 1170, h: 1115, tipo: 'Laboratorio' },
      { nombre: 'Taller de Electronica', x: 1570, y: 4410, w: 1540, h: 490, tipo: 'Laboratorio' },
      { nombre: 'Taller de Electronica Digital', puntos: '1270,4410  1560,4410  1560,4900  2335,4900  2335,5855  1270,5855', tipo: 'Laboratorio' },
      { nombre: 'Taller de Circuitos Digitales', x: 2335, y: 4900, w: 775, h: 1560, tipo: 'Laboratorio' },
      { nombre: 'Laboratorio de Robotica', x: 3400, y: 5758, w: 843, h: 700, tipo: 'Laboratorio' },
      { nombre: 'Laboratorio CNC', x: 5920, y: 3150, w: 1075, h: 975, tipo: 'Laboratorio' },
      { nombre: 'Autodesk', x: 4895, y: 5800, w: 895, h: 665, tipo: 'Laboratorio' },
      { nombre: 'Taller Electrico', puntos: '6995,4840  6065,4840  6065,4420  6220,4420  6220,4125  6995,4125', tipo: 'Laboratorio' },
      { nombre: 'Taller de Metrologia', x: 6065, y: 4840, w: 930, h: 920, tipo: 'Laboratorio' },
      { nombre: 'Taller de Electro-Hidroneumatica', x: 6065, y: 5755, w: 930, h: 710, tipo: 'Laboratorio' },
      { nombre: 'Gallinero 1', x: 7400, y: 4415, w: 910, h: 713, tipo: 'Aula' },
      { nombre: 'Gallinero 2', x: 8655, y: 4415, w: 910, h: 713, tipo: 'Aula' },
      { nombre: 'Gallinero 3', x: 7420, y: 5515, w: 713, h: 910, tipo: 'Aula' },
      { nombre: 'Gallinero 4', x: 8865, y: 5515, w: 713, h: 910, tipo: 'Aula' }
    ]
  },
  1: {
    imagen: 'src/img/maps/P109.png',
    viewBox: '0 0 6851 3314',
    label: 'Piso 1',
    salones: [
      { nombre: 'Salón 21', x: 28, y: 40, w: 770, h: 1055, tipo: 'Aula' },
      { nombre: 'Salón 20', x: 805, y: 40, w: 755, h: 765, tipo: 'Aula' },
      { nombre: 'Salón 19', x: 1565, y: 40, w: 755, h: 765, tipo: 'Aula' },
      { nombre: 'Salón 18', x: 2325, y: 40, w: 755, h: 765, tipo: 'Aula' },
      { nombre: 'Salón 17', x: 3085, y: 40, w: 765, h: 765, tipo: 'Aula' },
      { nombre: 'Salón 16', x: 4140, y: 40, w: 685, h: 765, tipo: 'Aula' },
      { nombre: 'Salón 15', x: 4830, y: 40, w: 825, h: 765, tipo: 'Aula' },
      {
        nombre: 'Salón 24',
        puntos: '5660,40  6815,40  6815,860  5943,860  5943,1095  5660,1095',
        tipo: 'Aula'
      },
      { nombre: 'Laboratorio de Computacion Basica I', x: 28, y: 2040, w: 865, h: 1250, tipo: 'Laboratorio' },
      { nombre: 'Laboratorio de Computacion Basica II', x: 900, y: 2040, w: 835, h: 970, tipo: 'Laboratorio' },
      { nombre: 'Salón 23', x: 1740, y: 2040, w: 865, h: 970, tipo: 'Aula' },
      { nombre: 'Salón 22', x: 2610, y: 2040, w: 953, h: 970, tipo: 'Aula' },
      { nombre: 'Aula Interactiva', x: 3845, y: 2040, w: 1425, h: 970, tipo: 'Laboratorio' },
      { nombre: 'Aula 4.0', x: 5280, y: 2040, w: 1540, h: 1250, tipo: 'Aula' }
    ]
  },
  2: {
    imagen: 'src/img/maps/P209.png',
    viewBox: '0 0 4607 2224',
    label: 'Piso 2',
    salones: [
      { nombre: 'Salón 14', x: 11, y: 13, w: 518, h: 714, tipo: 'Aula' },
      { nombre: 'Salón 13', x: 530, y: 13, w: 513, h: 517, tipo: 'Aula' },
      { nombre: 'Salón 12', x: 1045, y: 13, w: 513, h: 517, tipo: 'Aula' },
      { nombre: 'Salón 11', x: 1560, y: 13, w: 513, h: 517, tipo: 'Aula' },
      { nombre: 'Salón 10', x: 2075, y: 13, w: 514, h: 517, tipo: 'Aula' },
      { nombre: 'Salón 9', x: 2783, y: 13, w: 465, h: 517, tipo: 'Aula' },
      { nombre: 'Salón 8', x: 3250, y: 13, w: 560, h: 517, tipo: 'Aula' },
      {
        nombre: 'Salon de Dibujo Tecnico I',
        puntos: '3813,13  4588,13  4588,565  4005,565  4005,727  3813,727',
        tipo: 'Aula'
      },
      { nombre: 'Laboratorio de Base de Datos', x: 11, y: 1363, w: 595, h: 595, tipo: 'Laboratorio' },
      { nombre: 'Laboratorio de Nuevas Tecnologias', x: 610, y: 1363, w: 575, h: 460, tipo: 'Laboratorio' },
      {
        nombre: 'Laboratorio de Desarrollo de Software',
        x: 1440,
        y: 1363,
        w: 955,
        h: 650,
        tipo: 'Laboratorio'
      },
      { nombre: 'Laboratorio de Biologia', x: 2585, y: 1365, w: 710, h: 650, tipo: 'Laboratorio' },
      { nombre: 'Aula Samsung', puntos: '3680,1365  4588,1365  4588,2015  3870,2015  3870,1885  3680,1885', tipo: 'Aula' }
    ]
  },
  3: {
    imagen: 'src/img/maps/P309.png',
    viewBox: '0 0 4620 2229',
    label: 'Piso 3',
    salones: [
      { nombre: 'Salón 7', x: 25, y: 20, w: 512, h: 518, tipo: 'Aula' },
      { nombre: 'Salón 6', x: 542, y: 20, w: 512, h: 518, tipo: 'Aula' },
      { nombre: 'Salón 5', x: 1060, y: 20, w: 512, h: 518, tipo: 'Aula' },
      { nombre: 'Salón 4', x: 1572, y: 20, w: 512, h: 518, tipo: 'Aula' },
      { nombre: 'Salón 3', x: 2085, y: 20, w: 517, h: 518, tipo: 'Aula' },
      { nombre: 'Salón 2', x: 2795, y: 20, w: 505, h: 518, tipo: 'Aula' },
      { nombre: 'Salón 1', x: 3305, y: 20, w: 514, h: 518, tipo: 'Aula' },
      {
        nombre: 'Salon de Dibujo Tecnico II',
        puntos: '3825,20  4600,20  4600,575  4015,575  4015,735  3825,735',
        tipo: 'Aula'
      },
      { nombre: 'Laboratorio de Quimica I-II', x: 23, y: 1370, w: 712, h: 651, tipo: 'Laboratorio' },
      { nombre: 'Laboratorio de Quimica III-IV', x: 1700, y: 1370, w: 708, h: 651, tipo: 'Laboratorio' },
      { nombre: 'Laboratorio de Fisica I-II', x: 2860, y: 1374, w: 640, h: 646, tipo: 'Laboratorio' },
      { nombre: 'Laboratorio de Fisica III-IV', x: 3760, y: 1374, w: 637, h: 646, tipo: 'Laboratorio' }
    ]
  }
};

export const COLORES = {
  Disponible: { fill: '#10b981', fillOpacity: 0.25, stroke: '#059669', strokeWidth: 2 },
  Ocupado: { fill: '#ef4444', fillOpacity: 0.25, stroke: '#dc2626', strokeWidth: 2 },
  Provisional: { fill: '#f59e0b', fillOpacity: 0.25, stroke: '#d97706', strokeWidth: 2 },
  Mantenimiento: { fill: '#94a3b8', fillOpacity: 0.25, stroke: '#64748b', strokeWidth: 2 },
  default: { fill: '#e2e8f0', fillOpacity: 0.15, stroke: '#cbd5e1', strokeWidth: 1.5 },
  resaltado: { fill: '#60003E', fillOpacity: 0.35, stroke: '#60003E', strokeWidth: 3 }
};

export function normalizarEstado(raw) {
  const v = String(raw || '').trim();
  if (v === 'En Mantenimiento') return 'Mantenimiento';
  if (v === 'Disponible' || v === 'Ocupado' || v === 'Provisional' || v === 'Mantenimiento') return v;
  return 'default';
}

export function normalizeText(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

export function keySalonName(name) {
  return normalizeText(name).replace(/[^a-z0-9]/g, '');
}

export function stripSalonPrefix(name) {
  return String(name || '')
    .replace(/^(Sal[oó]n|Aula|Lab\.?|Laboratorio|Taller)\s+/i, '')
    .trim();
}
