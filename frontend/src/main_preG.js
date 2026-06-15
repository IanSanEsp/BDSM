import {
  COLORES,
  LAYOUT_PISOS,
  clearSession,
  paintSessionHeader,
  keySalonName,
  normalizarEstado,
  resolveApiBase,
  stripSalonPrefix,
  getSessionToken,
  getLocalDateISO
} from './map_preG_shared.js';
import { initSalonSelectorMap } from './sel_salon_map.js';

document.addEventListener('DOMContentLoaded', () => {
  paintSessionHeader();

  // reloj y fecha
  const relojTiempo = document.getElementById('reloj-tiempo');
  const relojFecha = document.getElementById('reloj-fecha');
  let bloqueActualIdCache = null;

  const actualizarReloj = () => {
    const ahora = new Date();
    const horas = String(ahora.getHours()).padStart(2, '0');
    const minutos = String(ahora.getMinutes()).padStart(2, '0');
    
    if (relojTiempo) relojTiempo.textContent = `${horas} : ${minutos}`;

    const opciones = { weekday: 'long', day: 'numeric', month: 'long' };
    if (relojFecha) relojFecha.textContent = ahora.toLocaleDateString('es-ES', opciones);

    // Actualizar salones si cambia el bloque horario
    const nuevoBloqueId = obtenerBloqueActualId();
    if (nuevoBloqueId !== bloqueActualIdCache) {
      bloqueActualIdCache = nuevoBloqueId;
      renderizarSalones();
    }
  };

  let pisoActual = '3';
  let paginaActual = 1;
  let apiBase = resolveApiBase();

  // Datos cargados desde API
  let salonesData = [];
  let horariosData = [];
  let gruposData = [];
  let ausenciasData = [];
  let dinamicaData = [];

  const fetchJson = async (pathOrUrl, { method = 'GET', body, auth = false } = {}) => {
    const isFullUrl = pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://');
    const baseUrl = isFullUrl ? '' : apiBase;
    const url = baseUrl + pathOrUrl;
    const headers = { 'Content-Type': 'application/json' };
    if (auth) headers['Authorization'] = `Bearer ${getSessionToken()}`;
    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody?.error || `Error ${res.status}`);
    }
    return res.json();
  };

  const pisoCoincide = (obj) => {
    const target = pisoActual === 'L' ? '0' : String(pisoActual);
    return String(obj.piso) === target;
  };

  const hoyISO = () => new Date().toLocaleDateString('sv-SE');

  const toHHMM = (time) => {
    const s = String(time || '').trim();
    const m = s.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return s;
    return `${m[1].padStart(2, '0')}:${m[2]}`;
  };

  const timeToMinutes = (time) => {
    const s = String(time || '').trim();
    const m = s.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    return hh * 60 + mm;
  };

  const buildAusenciasMap = () => {
    const map = new Map();
    const hoy = hoyISO();
    for (const a of ausenciasData) {
      if (String(a?.accion_tomada || '').trim() === 'reasignacion_salon') continue;
      const fechaRaw = String(a?.fecha || '').slice(0, 10);
      const fecha = fechaRaw || hoy;
      if (fecha !== hoy) continue;
      const gid = Number(a?.id_grupo);
      const horaMin = timeToMinutes(a?.hora);
      if (!Number.isFinite(gid) || horaMin == null) continue;
      if (!map.has(gid)) map.set(gid, new Set());
      map.get(gid).add(horaMin);
    }
    return map;
  };

  const claseCancelada = (h, ausMap) => {
    if (!h) return false;
    const gid = Number(h.id_grupo);
    if (!Number.isFinite(gid)) return false;
    const byHora = ausMap.get(gid);
    if (!byHora) return false;
    const startMin = timeToMinutes(h.hora_inicio);
    const endMin = timeToMinutes(h.hora_fin);
    if (startMin == null) return false;
    if (endMin == null || endMin <= startMin) return byHora.has(startMin);
    for (const t of byHora.values()) {
      if (t >= startMin && t < endMin) return true;
    }
    return false;
  };

  const NS = 'http://www.w3.org/2000/svg';

  const MAPA_PREVIEW_SRC = {
    L: 'src/img/maps/PB09.png',
    1: 'src/img/maps/P109.png',
    2: 'src/img/maps/P209.png',
    3: 'src/img/maps/P309.png',
  };

  const actualizarMapaPreview = () => {
    const img = document.getElementById('mapa-preview-img');
    if (!img) return;

    const src = MAPA_PREVIEW_SRC[pisoActual] || MAPA_PREVIEW_SRC[1];
    img.src = src;

    renderizarOverlayMapaPreview();
  };

  function svgEl(tag, attrs = {}) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }

  function obtenerNombreSalon(row) {
    return (
      row?.nombre_salon ||
      row?.numero_salon ||
      row?.nombre ||
      row?.salon ||
      ''
    );
  }

  function nameKeysForMatch(nombre) {
    const keys = new Set();
    const raw = String(nombre || '').trim();
    if (!raw) return [];

    keys.add(keySalonName(raw));
    keys.add(keySalonName(stripSalonPrefix(raw)));

    const digits = raw.match(/\d+/g);
    if (digits && digits.length) {
      const n = String(Number(digits[0]));
      keys.add(keySalonName(`Salon ${n}`));
      keys.add(keySalonName(`Salón ${n}`));
      keys.add(keySalonName(`Aula ${n}`));
      keys.add(keySalonName(`Lab ${n}`));
      keys.add(keySalonName(n));
    }

    keys.delete('');
    return Array.from(keys);
  }

  const dynHoraInicio = (d) => d?.hora_inicio_temp || d?.hora_inicio || '';
  const dynHoraFin = (d) => d?.hora_fin_temp || d?.hora_fin || '';
  const horarioDesdeDinamico = (d) => ({
    id_grupo: d?.id_grupo,
    hora_inicio: dynHoraInicio(d),
    hora_fin: dynHoraFin(d)
  });

  const buscarDinamicoAdelantoSalon = (idSalon) => {
    const sid = Number(idSalon);
    if (!Number.isFinite(sid)) return null;
    return dinamicaData.find((d) => {
      const salonId = Number(d?.id_salon_temporal || d?.id_salon);
      if (salonId !== sid) return false;
      const motivo = String(d?.motivo || d?.motivo_cambio || '').toLowerCase();
      return motivo.includes('adelanto');
    }) || null;
  };

  const buscarDinamicoEnBloque = (idSalon, dia, bloqueId) => {
    if (!idSalon || bloqueId == null) return null;
    const diaLower = String(dia || '').toLowerCase();
    const candidatos = dinamicaData.filter((d) => {
      const salonId = Number(d?.id_salon_temporal || d?.id_salon);
      if (salonId !== Number(idSalon)) return false;
      if (String(d?.dia || '').toLowerCase() !== diaLower) return false;
      const h = {
        hora_inicio: dynHoraInicio(d),
        hora_fin: dynHoraFin(d)
      };
      return claseEnBloque(h, bloqueId);
    });
    return candidatos.find((d) => d.id_horario_dinamico) || candidatos[0] || null;
  };

  const buscarDinamicoEnCurso = (idSalon, dia) => {
    if (!idSalon) return null;
    const diaLower = String(dia || '').toLowerCase();
    const candidatos = dinamicaData.filter((d) => {
      const salonId = Number(d?.id_salon_temporal || d?.id_salon);
      if (salonId !== Number(idSalon)) return false;
      if (String(d?.dia || '').toLowerCase() !== diaLower) return false;
      const h = {
        hora_inicio: dynHoraInicio(d),
        hora_fin: dynHoraFin(d)
      };
      return claseEnCurso(h);
    });
    return candidatos.find((d) => d.id_horario_dinamico) || candidatos[0] || null;
  };

  async function renderizarOverlayMapaPreview() {
    const overlay = document.getElementById('mapa-preview-overlay');
    if (!overlay) return;

    const layout = LAYOUT_PISOS[pisoActual] || LAYOUT_PISOS['1'];
    if (!layout) {
      overlay.innerHTML = '';
      return;
    }

    overlay.setAttribute('viewBox', layout.viewBox);
    overlay.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    overlay.innerHTML = '';

    const rows = salonesData.filter(s => pisoCoincide(s));
    const ausMap = buildAusenciasMap();
    const diaActual = obtenerDiaActual();
    const ocupadosPorHorario = new Set();
    const provisionales = new Set();

    for (const s of rows) {
      const dyn = buscarDinamicoEnCurso(s.id_salon, diaActual);
      const motivo = String(dyn?.motivo || dyn?.motivo_cambio || '').toLowerCase();
      const dynCancelada = (dyn && dyn.id_horario_dinamico) ? false : (dyn ? claseCancelada(horarioDesdeDinamico(dyn), ausMap) : false);
      if (dyn && !dynCancelada && motivo.includes('reasignaci')) {
        for (const k of nameKeysForMatch(obtenerNombreSalon(s))) provisionales.add(k);
      } else if (dyn && !dynCancelada && motivo.includes('adelanto')) {
        for (const k of nameKeysForMatch(obtenerNombreSalon(s))) provisionales.add(k);
      }

      if (dyn && !dynCancelada) {
        for (const k of nameKeysForMatch(obtenerNombreSalon(s))) ocupadosPorHorario.add(k);
        continue;
      }
    }

    for (const h of horariosData) {
      if (String(h.dia).toLowerCase() !== String(diaActual).toLowerCase()) continue;
      if (!claseEnCurso(h)) continue;
      if (claseCancelada(h, ausMap)) continue;
      const claseReasignada = dinamicaData.some((d) =>
        Number(d.id_horario_fijo_detalle) === Number(h.id_horario_fijo_detalle) &&
        Number(d.id_salon_temporal) && Number(d.id_salon_temporal) !== Number(h.id_salon)
      );
      if (claseReasignada) continue;
      const nombreSalon = obtenerNombreSalon(h);
      for (const k of nameKeysForMatch(nombreSalon)) ocupadosPorHorario.add(k);
    }

    const estadoPorKey = new Map();
    for (const row of rows) {
      const nombre = obtenerNombreSalon(row);
      const estado = normalizarEstado(row?.estado);
      for (const k of nameKeysForMatch(nombre)) {
        estadoPorKey.set(k, estado);
      }
    }

    const grupo = svgEl('g', { opacity: '1' });
    for (const s of layout.salones) {
      const keyMatch = nameKeysForMatch(s.nombre);
      const ocupado = keyMatch.some((k) => ocupadosPorHorario.has(k));
      const esProvisional = keyMatch.some((k) => provisionales.has(k));
      const baseEstado = keyMatch.map(k => estadoPorKey.get(k)).find(Boolean) || 'default';
      let estado = ocupado ? 'Ocupado' : baseEstado;
      if (esProvisional) estado = 'Provisional';
      if (!ocupado && !esProvisional && estado === 'Ocupado') estado = 'Disponible';
      const color = COLORES[estado] || COLORES.default;

      const baseAttrs = {
        fill: color.fill,
        'fill-opacity': String(color.fillOpacity ?? 0.2),
        stroke: color.stroke,
        'stroke-width': String(color.strokeWidth ?? 1.5)
      };

      let shape;
      if (s.puntos) {
        shape = svgEl('polygon', { ...baseAttrs, points: s.puntos });
      } else {
        shape = svgEl('rect', { ...baseAttrs, x: String(s.x), y: String(s.y), width: String(s.w), height: String(s.h) });
      }

      grupo.appendChild(shape);
    }

    overlay.appendChild(grupo);
  }

  // Definición de bloques horarios (orita esta fijo, ya cambialo si queres)
  const bloquesHorarios = [
    { id: 1, hora: '07:00 - 07:50', inicio: '07:00', fin: '07:50' },
    { id: 2, hora: '08:00 - 08:50', inicio: '08:00', fin: '08:50' },
    { id: 3, hora: '09:00 - 09:50', inicio: '09:00', fin: '09:50' },
    { id: 4, hora: '10:00 - 10:50', inicio: '10:00', fin: '10:50' },
    { id: 5, hora: '11:00 - 11:50', inicio: '11:00', fin: '11:50' },
    { id: 6, hora: '12:00 - 12:50', inicio: '12:00', fin: '12:50' },
    { id: 7, hora: '13:00 - 13:50', inicio: '13:00', fin: '13:50' },
    { id: 8, hora: '14:00 - 14:50', inicio: '14:00', fin: '14:50' },
    { id: 9, hora: '15:00 - 15:50', inicio: '15:00', fin: '15:50' },
    { id: 10, hora: '16:00 - 16:50', inicio: '16:00', fin: '16:50' },
    { id: 11, hora: '17:00 - 17:50', inicio: '17:00', fin: '17:50' },
    { id: 12, hora: '18:00 - 18:50', inicio: '18:00', fin: '18:50' },
    { id: 13, hora: '19:00 - 19:50', inicio: '19:00', fin: '19:50' },
    { id: 14, hora: '20:00 - 20:50', inicio: '20:00', fin: '20:50' }
  ];

  const claseEnBloque = (clase, bloqueId) => {
    if (!clase || bloqueId == null) return false;
    const [cH, cM] = String(clase.hora_inicio).split(':').map(Number);
    const [cFH, cFM] = String(clase.hora_fin).split(':').map(Number);
    if (isNaN(cH) || isNaN(cM) || isNaN(cFH) || isNaN(cFM)) return false;
    const claseIni = cH * 60 + cM;
    const claseFin = cFH * 60 + cFM;
    const bloque = bloquesHorarios.find(b => b.id === bloqueId);
    if (!bloque) return false;
    const [bH, bM] = bloque.inicio.split(':').map(Number);
    const bloqueIni = bH * 60 + bM;
    return claseIni <= bloqueIni && claseFin > bloqueIni;
  };

  const obtenerMinutosActuales = () => {
    const ahora = new Date();
    return ahora.getHours() * 60 + ahora.getMinutes();
  };

  const claseEnCurso = (clase) => {
    if (!clase) return false;
    const [cH, cM] = String(clase.hora_inicio).split(':').map(Number);
    const [cFH, cFM] = String(clase.hora_fin).split(':').map(Number);
    if (isNaN(cH) || isNaN(cM) || isNaN(cFH) || isNaN(cFM)) return false;
    const ahora = obtenerMinutosActuales();
    const claseIni = cH * 60 + cM;
    const claseFin = cFH * 60 + cFM;
    return ahora >= claseIni && ahora < claseFin;
  };

  const obtenerBloqueActualId = () => { // Devuelve el ID del bloque horario actual basado en la hora real
    const ahora = new Date();
    const horaMinutos = ahora.getHours() * 60 + ahora.getMinutes();
    for (const bloque of bloquesHorarios) {
      const [hIni, mIni] = bloque.inicio.split(':').map(Number);
      const [hFin, mFin] = bloque.fin.split(':').map(Number);
      if (horaMinutos >= (hIni * 60 + mIni) && horaMinutos <= (hFin * 60 + mFin)) return bloque.id;
    }
    return null;
  };

  const obtenerDiaActual = () => { // Devuelve el dia de la semana actual en formato de texto
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
    return dias[new Date().getDay()];
  };

  // Estadisticas del gauge (fumadota TOTAL)
  // Q mrd es un gauge -wenazo
  const totalAulasNum = document.getElementById('total-aulas-num');
  const resumenDisponibles = document.getElementById('resumen-disponibles');
  const resumenOcupadas = document.getElementById('resumen-ocupadas');
  const resumenProvisionales = document.getElementById('resumen-provisionales');
  const resumenMantenimiento = document.getElementById('resumen-mantenimiento');

  const renderizarEstadisticas = () => {
    const salonesPiso = salonesData.filter(s => pisoCoincide(s));
    const total = salonesPiso.length;

    const diaActual = obtenerDiaActual();
    const ausMap = buildAusenciasMap();

    const estadosActuales = salonesPiso.map((salon) => {
      let estado = String(salon.estado || '').trim();
      const dyn = buscarDinamicoEnCurso(salon.id_salon, diaActual);
      const motivo = String(dyn?.motivo || dyn?.motivo_cambio || '').toLowerCase();
      const dynCancelada = (dyn && dyn.id_horario_dinamico) ? false : (dyn ? claseCancelada(horarioDesdeDinamico(dyn), ausMap) : false);
      if (dyn && !dynCancelada && (motivo.includes('adelanto') || motivo.includes('reasignaci'))) return 'Provisional';
      if (dyn && !dynCancelada) return 'Ocupado';

      const hRaw = horariosData.find(h =>
        Number(h.id_salon) === Number(salon.id_salon) &&
        String(h.dia).toLowerCase() === diaActual.toLowerCase() &&
        claseEnCurso(h)
      );
      const claseReasignada = hRaw && dinamicaData.some((d) =>
        Number(d.id_horario_fijo_detalle) === Number(hRaw.id_horario_fijo_detalle) &&
        Number(d.id_salon_temporal) && Number(d.id_salon_temporal) !== Number(salon.id_salon)
      );
      const h = hRaw && !claseCancelada(hRaw, ausMap) && !claseReasignada ? hRaw : null;
      if (h && estado.toLowerCase() === 'disponible') return 'Ocupado';
      if (!h && estado.toLowerCase() === 'ocupado') return 'Disponible';
      return estado || 'Disponible';
    });
    
    const stats = {
      disponibles: estadosActuales.filter(s => s === 'Disponible').length,
      ocupadas: estadosActuales.filter(s => s === 'Ocupado').length,
      provisionales: estadosActuales.filter(s => s === 'Provisional').length,
      mantenimiento: estadosActuales.filter(s => s === 'Mantenimiento' || s === 'En Mantenimiento').length
    };

    // Actualizar numeros
    if (totalAulasNum) totalAulasNum.textContent = total;
    if (resumenDisponibles) resumenDisponibles.textContent = stats.disponibles;
    if (resumenOcupadas) resumenOcupadas.textContent = stats.ocupadas;
    if (resumenProvisionales) resumenProvisionales.textContent = stats.provisionales;
    if (resumenMantenimiento) resumenMantenimiento.textContent = stats.mantenimiento;

    const totalLength = 125.6; // Longitud total del arco del gauge (2 * π * r * (angulo/360))
    
    // Calcular longitudes de cada segmento
    const L_mantenimiento = (stats.mantenimiento / total) * totalLength;
    const L_provisionales = (stats.provisionales / total) * totalLength;
    const L_ocupadas = (stats.ocupadas / total) * totalLength;
    const L_disponibles = (stats.disponibles / total) * totalLength;

    const gMantenimiento = document.getElementById('gauge-mantenimiento');
    const gProvisionales = document.getElementById('gauge-provisionales');
    const gOcupadas = document.getElementById('gauge-ocupadas');
    const gDisponibles = document.getElementById('gauge-disponibles');

    // Actualizar cada segmento del gauge usando stroke-dasharray y stroke-dashoffset 
    if (gMantenimiento) {
      gMantenimiento.setAttribute('stroke-dasharray', `${L_mantenimiento} ${totalLength}`);
      gMantenimiento.setAttribute('stroke-dashoffset', '0');
    }
    if (gProvisionales) {
      gProvisionales.setAttribute('stroke-dasharray', `${L_provisionales} ${totalLength}`);
      gProvisionales.setAttribute('stroke-dashoffset', `-${L_mantenimiento}`);
    }
    if (gOcupadas) {
      gOcupadas.setAttribute('stroke-dasharray', `${L_ocupadas} ${totalLength}`);
      gOcupadas.setAttribute('stroke-dashoffset', `-${L_mantenimiento + L_provisionales}`);
    }
    if (gDisponibles) {
      gDisponibles.setAttribute('stroke-dasharray', `${L_disponibles} ${totalLength}`);
      gDisponibles.setAttribute('stroke-dashoffset', `-${L_mantenimiento + L_provisionales + L_ocupadas}`);
    }
  };

  // Filtro de piso
  const tabsPiso = document.querySelectorAll('#selector-piso-tabs .boton-filtro');
  const tituloMapaPiso = document.getElementById('titulo-mapa-piso');

  tabsPiso.forEach(tab => {
    tab.addEventListener('click', () => {
      tabsPiso.forEach(t => t.classList.remove('activo-primario'));
      tab.classList.add('activo-primario');
      pisoActual = tab.dataset.piso;
      paginaActual = 1;

      if (tituloMapaPiso) tituloMapaPiso.textContent = `MAPA PISO ${pisoActual === 'L' ? 'L' : pisoActual}`; // Actualizar datos mostrados

      actualizarMapaPreview();
      
      renderizarSalones();
      renderizarAlertas();
      renderizarEstadisticas();
    });
  });

  // Renderizado de salones en el dashboard
  const listaSalonesContenedor = document.getElementById('lista-salones-dashboard');
  const conteoSalonesPiso = document.getElementById('conteo-salones-piso');

  const renderizarPaginacion = (totalPaginas) => {
    const paginacionDiv = document.querySelector('.paginacion');
    if (!paginacionDiv) return;

    paginacionDiv.innerHTML = '';

    const btnAnt = document.createElement('button');
    btnAnt.className = 'btn-pag';
    btnAnt.textContent = 'Anterior';
    btnAnt.disabled = paginaActual <= 1;
    btnAnt.addEventListener('click', () => {
      if (paginaActual > 1) { paginaActual--; renderizarSalones(); }
    });
    paginacionDiv.appendChild(btnAnt);

    for (let i = 1; i <= totalPaginas; i++) {
      const btn = document.createElement('button');
      btn.className = 'btn-pag' + (i === paginaActual ? ' activo' : '');
      btn.textContent = i;
      btn.addEventListener('click', () => { paginaActual = i; renderizarSalones(); });
      paginacionDiv.appendChild(btn);
    }

    const btnSig = document.createElement('button');
    btnSig.className = 'btn-pag';
    btnSig.textContent = 'Siguiente';
    btnSig.disabled = paginaActual >= totalPaginas;
    btnSig.addEventListener('click', () => {
      if (paginaActual < totalPaginas) { paginaActual++; renderizarSalones(); }
    });
    paginacionDiv.appendChild(btnSig);
  };

  const renderizarSalones = () => {
    if (!listaSalonesContenedor) return;

    const salonesPiso = salonesData.filter(s => pisoCoincide(s));
    const diaActual = obtenerDiaActual();
    const itemsPorPagina = 7;
    const totalPaginas = Math.max(1, Math.ceil(salonesPiso.length / itemsPorPagina));
    if (paginaActual > totalPaginas) paginaActual = totalPaginas;
    const inicio = (paginaActual - 1) * itemsPorPagina;
    const salonesPagina = salonesPiso.slice(inicio, inicio + itemsPorPagina);

    listaSalonesContenedor.innerHTML = '';

    const ausMap = buildAusenciasMap();

    salonesPagina.forEach(salon => {
      const dyn = buscarDinamicoEnCurso(salon.id_salon, diaActual);
      const motivoDyn = String(dyn?.motivo || dyn?.motivo_cambio || '').toLowerCase();
      const dynShow = dyn;
      const dynHorario = dynShow ? horarioDesdeDinamico(dynShow) : null;
      const dynCancelada = (dyn && dyn.id_horario_dinamico) ? false : (dynHorario ? claseCancelada(dynHorario, ausMap) : false);
      const horarioRaw = horariosData.find(h =>
        Number(h.id_salon) === Number(salon.id_salon) &&
        String(h.dia).toLowerCase() === diaActual.toLowerCase() &&
        claseEnCurso(h)
      );
      const claseReasignada = horarioRaw && dinamicaData.some((d) =>
        Number(d.id_horario_fijo_detalle) === Number(horarioRaw.id_horario_fijo_detalle) &&
        Number(d.id_salon_temporal) && Number(d.id_salon_temporal) !== Number(salon.id_salon)
      );
      const horarioBase = horarioRaw && !claseCancelada(horarioRaw, ausMap) && !claseReasignada
        ? horarioRaw
        : null;
      const horarioActual = dynShow && !dynCancelada
        ? {
            ...dynShow,
            hora_inicio: dynHoraInicio(dynShow),
            hora_fin: dynHoraFin(dynShow)
          }
        : horarioBase;

      const nombreSalon = obtenerNombreSalon(salon);

      let estadoVisual = String(salon.estado || '').toLowerCase();
      if (!dynCancelada && dyn && dyn.id_horario_dinamico) {
        estadoVisual = 'provisional';
      } else if (horarioActual && estadoVisual === 'disponible') {
        estadoVisual = 'ocupado';
      } else if (!horarioActual && estadoVisual === 'ocupado') {
        estadoVisual = 'disponible';
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div class="salon-id-celda ${estadoVisual}">
            <span class="punto-estado ${estadoVisual}"></span>
            <span>${nombreSalon}</span>
          </div>
        </td>
        <td>
          <span class="grupo-celda">${horarioActual?.nombre_grupo || '----'}</span>
        </td>
        <td>
          <div class="materia-profesor-celda">
            <span class="materia-nombre">${horarioActual?.materia || '-- --'}</span>
            <span class="profesor-nombre">${horarioActual?.nombre_profesor || '----'}</span>
          </div>
        </td>
        <td>
          <div class="horario-celda">
            <span class="material-symbols-outlined">schedule</span>
            <span>${horarioActual ? `${horarioActual.hora_inicio} - ${horarioActual.hora_fin}` : '--:-- - --:--'}</span>
          </div>
        </td>
        <td class="acciones-celda">
          <div class="contenedor-menu-kebab">
            <button class="boton-kebab" style="background: none; border: none; cursor: pointer; color: #94a3b8; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; transition: background 0.2s;">
              <span class="material-symbols-outlined">more_vert</span>
            </button>
            <div class="menu-desplegable">
              <button class="opcion-menu btn-incidencia">
                <span class="material-symbols-outlined">report_problem</span>
                <span>Registrar incidencia</span>
              </button>
              <button class="opcion-menu btn-mantenimiento">
                <span class="material-symbols-outlined">build</span>
                <span>Estado mantenimiento</span>
              </button>
            </div>
          </div>
        </td>
      `;

      tr.addEventListener('click', (e) => {
        if (!e.target.closest('.contenedor-menu-kebab')) {
          abrirModalHorario(salon);
        }
      });

      const btnKebab = tr.querySelector('.boton-kebab');
      const menuKebab = tr.querySelector('.menu-desplegable');
      const btnIncidencia = tr.querySelector('.btn-incidencia');
      const btnMantenimiento = tr.querySelector('.btn-mantenimiento');

      btnKebab.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.menu-desplegable.activo').forEach(m => {
          if (m !== menuKebab) m.classList.remove('activo');
        });
        menuKebab.classList.toggle('activo');
      });

      btnIncidencia.addEventListener('click', (e) => {
        e.stopPropagation();
        menuKebab.classList.remove('activo');
        abrirModalIncidencia(salon, horarioActual);
      });

      btnMantenimiento.addEventListener('click', async (e) => {
        e.stopPropagation();
        menuKebab.classList.remove('activo');
        const actual = String(salon.estado || 'Disponible');
        const nuevoEstado = actual === 'En Mantenimiento' ? 'Disponible' : 'En Mantenimiento';
        try {
          await fetchJson(`/salones/${salon.id_salon}`, {
            method: 'PUT',
            body: { estado: nuevoEstado },
            auth: true
          });
          salon.estado = nuevoEstado;
          renderizarSalones();
          renderizarEstadisticas();
          renderizarAlertas();
          actualizarMapaPreview();
          mostrarTostada({ titulo: 'Éxito', mensaje: `Salón ${nombreSalon} ahora está "${nuevoEstado}"`, tipo: 'exito' });
        } catch (err) {
          mostrarTostada({ titulo: 'Error', mensaje: err?.message || 'No se pudo actualizar el estado', tipo: 'error' });
        }
      });

      listaSalonesContenedor.appendChild(tr);
    });

    if (conteoSalonesPiso) {
      const desde = salonesPiso.length === 0 ? 0 : inicio + 1;
      const hasta = Math.min(inicio + itemsPorPagina, salonesPiso.length);
      conteoSalonesPiso.textContent = `Mostrando ${desde}-${hasta} de ${salonesPiso.length} salones en este piso.`;
    }

    renderizarPaginacion(totalPaginas);
  };

  // Modal Horario de Salo
  const modalHorario = document.getElementById('modal-horario-salon');
  const cerrarModalBtn = document.getElementById('cerrar-modal-horario');
  const tituloModal = document.getElementById('titulo-modal-horario');
  const cuerpoTablaHorario = document.getElementById('cuerpo-tabla-horario-salon');
  const selectorDiaModal = document.getElementById('selector-dia-modal');

  let salonSeleccionado = null; 
  let diaSeleccionadoModal = 'Lunes';

  const actualizarTablaHorarioModal = () => {
    if (!salonSeleccionado || !cuerpoTablaHorario) return;
    cuerpoTablaHorario.innerHTML = '';
    const ausMap = buildAusenciasMap();
    bloquesHorarios.forEach(bloque => {
      const dyn = buscarDinamicoEnBloque(salonSeleccionado.id_salon, diaSeleccionadoModal, bloque.id);
      const dynCancelada = (dyn && dyn.id_horario_dinamico) ? false : (dyn ? claseCancelada(horarioDesdeDinamico(dyn), ausMap) : false);
      const hRaw = (dyn && !dynCancelada) ? { ...dyn, hora_inicio: dynHoraInicio(dyn), hora_fin: dynHoraFin(dyn) }
        : horariosData.find(h =>
            Number(h.id_salon) === Number(salonSeleccionado.id_salon) &&
            String(h.dia).toLowerCase() === String(diaSeleccionadoModal).toLowerCase() &&
            claseEnBloque(h, bloque.id)
          );
      const claseReasignadaModal = hRaw && !(dyn && !dynCancelada) && dinamicaData.some((d) =>
        Number(d.id_horario_fijo_detalle) === Number(hRaw.id_horario_fijo_detalle) &&
        Number(d.id_salon_temporal) && Number(d.id_salon_temporal) !== Number(salonSeleccionado.id_salon)
      );
      const h = claseReasignadaModal ? null : hRaw;
      const hFinal = h && !(dyn && !dynCancelada) ? (claseCancelada(h, ausMap) ? null : h) : h;
      const fila = document.createElement('tr');
      if (hFinal) {
        fila.innerHTML = `
          <td><strong>${bloque.hora}</strong></td>
          <td>${hFinal.nombre_grupo || '-'}</td>
          <td>${hFinal.materia || '-'}</td>
          <td>${hFinal.nombre_profesor || '-'}</td>
        `;
      } else {
        fila.innerHTML = `<td><strong>${bloque.hora}</strong></td><td colspan="3" style="color:#9ca3af;font-style:italic;">Sin clase</td>`;
      }
      cuerpoTablaHorario.appendChild(fila);
    });
  };

  const abrirModalHorario = (salon) => {
    if (!modalHorario) return;

    salonSeleccionado = salon;
    tituloModal.textContent = `Horario de Salón ${obtenerNombreSalon(salon)}`;

    actualizarTablaHorarioModal();
    modalHorario.classList.add('activo');
  };

  if (selectorDiaModal) { // Selector de dia
    selectorDiaModal.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        diaSeleccionadoModal = btn.getAttribute('data-dia');
        selectorDiaModal.querySelectorAll('button').forEach(b => b.classList.remove('activo-primario'));
        btn.classList.add('activo-primario');
        actualizarTablaHorarioModal();
      });
    });

    // Creo que esto esta extra
    const btnLunes = selectorDiaModal.querySelector('[data-dia="Lunes"]');
    if (btnLunes) btnLunes.classList.add('activo-primario');
  }

  if (cerrarModalBtn) {
    cerrarModalBtn.addEventListener('click', () => {
      modalHorario.classList.remove('activo');
    });
  }

  // Modal Incidencia (ctrol c+v de hor_preG, ten cuidado con los estilos porque es un modal grande y puede romper el diseño)
  const modalRegistrarIncidencia = document.getElementById('modal-registrar-incidencia');
  const cerrarModalRegistrar = document.getElementById('cerrar-modal-registrar-incidencia');
  const formRegistrarIncidencia = document.getElementById('form-registrar-incidencia');
  const incTipoEl = document.getElementById('inc-tipo');
  const incHoraContainer = document.getElementById('inc-hora-container');
  const incHoraEl = document.getElementById('inc-hora');
  const incContextoEl = document.getElementById('inc-contexto');
  const incProfesorContainer = document.getElementById('inc-profesor-container');
  const incProfesorEl = document.getElementById('inc-profesor');
  const incSalonContainer = document.getElementById('inc-salon-container');
  const incSalonBtn = document.getElementById('inc-salon-btn');
  let horarioActualEnWidget = null;
  let salonModoSeleccion = 'registro';
  let salonSeleccionadoReasignacion = null;
  let salonSelectorMapApi = null;

  const minutesToHHMM = (mins) => {
    if (!Number.isFinite(mins)) return '';
    const hh = Math.floor(mins / 60);
    const mm = mins % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  };

  const hhmm = (t) => {
    const s = String(t || '').trim();
    if (!s) return '';
    const m = s.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return s;
    return `${m[1].padStart(2, '0')}:${m[2]}`;
  };

  const generarOpcionesHoraSelect = (selectEl, horaInicio, horaFin) => {
    if (!selectEl) return;
    selectEl.innerHTML = '<option value="">Seleccionar hora</option>';
    if (!horaInicio || !horaFin) return;
    const ini = timeToMinutes(horaInicio);
    const fin = timeToMinutes(horaFin);
    if (ini === null || fin === null || ini >= fin) return;
    for (let m = ini; m < fin; m += 60) {
      const opt = document.createElement('option');
      opt.value = minutesToHHMM(m);
      opt.textContent = minutesToHHMM(m);
      selectEl.appendChild(opt);
    }
  };

  const existeIncidenciaDuplicada = (fecha, hora, idProfesor, idGrupo) => {
    return (ausencias_profesor || []).some(a =>
      (a.fecha || fechaDinamica) === fecha &&
      Number(a.id_profesor) === Number(idProfesor) &&
      Number(a.id_grupo) === Number(idGrupo) &&
      hhmm(a.hora) === hhmm(hora)
    );
  };

  const modalSalon = document.getElementById('modal-salon');
  const salonCloseBtn = document.getElementById('reg-salon-close');

  const miniSVGSalon = (layoutData, fillColor, strokeColor) => {
    if (!layoutData) return '';
    const PAD = 8;
    let vbX, vbY, vbW, vbH, shapeEl;
    if (layoutData.puntos) {
      const pts = layoutData.puntos.trim().split(/\s+/).map(p => p.split(',').map(Number));
      vbX = Math.min(...pts.map(p => p[0]));
      vbY = Math.min(...pts.map(p => p[1]));
      vbW = Math.max(...pts.map(p => p[0])) - vbX;
      vbH = Math.max(...pts.map(p => p[1])) - vbY;
      shapeEl = `<polygon points="${layoutData.puntos}" />`;
    } else {
      vbX = layoutData.x; vbY = layoutData.y; vbW = layoutData.w; vbH = layoutData.h;
      shapeEl = `<rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" rx="6" />`;
    }
    const sw = Math.max(vbW, vbH) * 0.035;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX - PAD} ${vbY - PAD} ${vbW + PAD * 2} ${vbH + PAD * 2}" style="width:100%;height:100%;display:block;" preserveAspectRatio="xMidYMid meet">${shapeEl.replace('/>', `fill="${fillColor}" fill-opacity="0.30" stroke="${strokeColor}" stroke-width="${sw}" stroke-linejoin="round" />`)}</svg>`;
  };

  const diaDesdeFecha = (fechaISO) => {
    const d = new Date(`${fechaISO}T00:00:00`);
    const dow = d.getDay();
    const map = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
    return map[dow] || null;
  };

  const actualizarBotonSalonInc = (sel) => {
    if (!incSalonBtn) return;
    const salon = sel?.raw;
    const layoutData = sel?.layout;
    if (!salon) { incSalonBtn.textContent = 'Salón: —'; incSalonBtn.classList.remove('salon-elegido'); return; }
    const estadoNorm = String(salon.estado || '').toLowerCase();
    let badgeClass = 'sin-estado', fillColor = '#60003E', strokeColor = '#60003E', dotColor = '#60003E', estadoLabel = salon.estado || 'Sin estado';
    if (estadoNorm.includes('disp')) { badgeClass = 'disponible'; fillColor = '#10b981'; strokeColor = '#059669'; dotColor = '#16a34a'; }
    else if (estadoNorm.includes('ocup')) { badgeClass = 'ocupado'; fillColor = '#ef4444'; strokeColor = '#dc2626'; dotColor = '#dc2626'; }
    else if (estadoNorm.includes('mante')) { badgeClass = 'mantenimiento'; fillColor = '#94a3b8'; strokeColor = '#64748b'; dotColor = '#94a3b8'; }
    const pisoLabel = salon.piso !== undefined && salon.piso !== null ? `Piso ${salon.piso}` : '';
    const tipoLabel = salon.tipo ? ` · ${salon.tipo}` : '';
    const miniSvg = miniSVGSalon(layoutData, fillColor, strokeColor);
    incSalonBtn.classList.add('salon-elegido');
    incSalonBtn.innerHTML = `
      <div class="salon-elegido-contenido">
        <div class="salon-elegido-shape">${miniSvg}</div>
        <div class="salon-elegido-info">
          <span class="salon-elegido-nombre">${sel?.numero_salon || salon.numero_salon || 'Salón'}</span>
          <span class="salon-elegido-sub">${pisoLabel}${tipoLabel}</span>
        </div>
        <div class="salon-elegido-derecha">
          <span class="badge-estado ${badgeClass}">
            <span class="dot-estado" style="background:${dotColor};"></span>
            ${estadoLabel}
          </span>
          <span class="salon-elegido-cambiar">Cambiar salón</span>
        </div>
      </div>`;
  };

  const abrirModalSalonConContexto = (ctx) => {
    if (!modalSalon) return;
    modalSalon.classList.add('activo');
    const mapEl = document.getElementById('reg-salon-map');
    if (mapEl && !salonSelectorMapApi) {
      initSalonSelectorMap({
        rootEl: modalSalon,
        mapEl,
        availabilityContext: ctx,
        onSelect: (sel) => {
          if (salonModoSeleccion === 'reasignacion') {
            salonSeleccionadoReasignacion = sel;
            modalSalon.classList.remove('activo');
            actualizarBotonSalonInc(sel);
          }
        }
      }).then((api) => { salonSelectorMapApi = api; }).catch((err) => { console.error('No se pudo inicializar el mapa de salones', err); });
    } else {
      salonSelectorMapApi?.setAvailabilityContext?.(ctx).catch?.(() => {});
    }
  };

  const abrirModalIncidencia = (salon, horario) => {
    if (!modalRegistrarIncidencia) return;
    horarioActualEnWidget = horario || null;
    if (formRegistrarIncidencia) formRegistrarIncidencia.reset();
    if (incHoraContainer) incHoraContainer.classList.add('oculto');
    if (incProfesorContainer) incProfesorContainer.classList.add('oculto');
    if (incSalonContainer) incSalonContainer.classList.add('oculto');
    salonSeleccionadoReasignacion = null;
    if (incSalonBtn) { incSalonBtn.textContent = 'Salón: —'; incSalonBtn.classList.remove('salon-elegido'); }
    if (incProfesorEl) {
      incProfesorEl.innerHTML = '<option value="">Seleccionar Profesor</option>';
      if (horarioActualEnWidget) {
        if (horarioActualEnWidget.nombre_profesor) {
          const o = document.createElement('option');
          o.value = horarioActualEnWidget.id_profesor;
          o.textContent = horarioActualEnWidget.nombre_profesor + ' (Titular)';
          incProfesorEl.appendChild(o);
        }
      }
    }
    modalRegistrarIncidencia.classList.add('activo');
  };

  if (cerrarModalRegistrar) {
    cerrarModalRegistrar.addEventListener('click', () => {
      if (modalRegistrarIncidencia) modalRegistrarIncidencia.classList.remove('activo');
      salonSeleccionadoReasignacion = null;
    });
  }

  if (incTipoEl) { // Mostrar campos adicionales segun tipo de incidencia
    incTipoEl.addEventListener('change', () => {
      const v = incTipoEl.value;
      if (v === 'ausencia_profesor') {
        if (incHoraContainer) incHoraContainer.classList.remove('oculto');
        if (incProfesorContainer) incProfesorContainer.classList.remove('oculto');
        if (incSalonContainer) incSalonContainer.classList.add('oculto');
        if (horarioActualEnWidget) {
          generarOpcionesHoraSelect(incHoraEl, horarioActualEnWidget.hora_inicio, horarioActualEnWidget.hora_fin);
        }
      } else if (v === 'reasignacion_salon') {
        if (incHoraContainer) incHoraContainer.classList.add('oculto');
        if (incProfesorContainer) incProfesorContainer.classList.add('oculto');
        if (incSalonContainer) incSalonContainer.classList.remove('oculto');
        salonSeleccionadoReasignacion = null;
        if (incSalonBtn) { incSalonBtn.textContent = 'Salón: —'; incSalonBtn.classList.remove('salon-elegido'); }
      } else {
        if (incHoraContainer) incHoraContainer.classList.add('oculto');
        if (incProfesorContainer) incProfesorContainer.classList.add('oculto');
        if (incSalonContainer) incSalonContainer.classList.add('oculto');
      }
    });
  }

  if (incSalonBtn) {
    incSalonBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!horarioActualEnWidget) { mostrarTostada({ titulo: 'Error', mensaje: 'No hay horario seleccionado', tipo: 'error' }); return; }
      salonModoSeleccion = 'reasignacion';
      const ctx = {
        dia: diaDesdeFecha(hoyISO()),
        hora_inicio: horarioActualEnWidget.hora_inicio || '',
        hora_fin: horarioActualEnWidget.hora_fin || ''
      };
      abrirModalSalonConContexto(ctx);
    });
  }

  if (salonCloseBtn && modalSalon) {
    salonCloseBtn.addEventListener('click', () => {
      modalSalon.classList.remove('activo');
      const tt = document.querySelector('.sel-tooltip');
      if (tt) tt.style.display = 'none';
    });
  }

  if (formRegistrarIncidencia) {
    formRegistrarIncidencia.addEventListener('submit', async (e) => {
      e.preventDefault();
      const tipo = incTipoEl?.value || '';
      const horaRegistro = incHoraEl?.value || null;
      const profesorSeleccionado = incProfesorEl?.value || null;

      if (!tipo) { mostrarTostada({ titulo: 'Aviso', mensaje: 'Selecciona un tipo de incidencia', tipo: 'advertencia' }); return; }
      if (!horarioActualEnWidget?.id_grupo && tipo !== 'reasignacion_salon') {
        mostrarTostada({ titulo: 'Error', mensaje: 'No se pudo identificar el grupo del horario.', tipo: 'error' });
        return;
      }

      if (tipo === 'reasignacion_salon') {
        if (!salonSeleccionadoReasignacion || !horarioActualEnWidget?.id_horario_fijo_detalle) {
          mostrarTostada({ titulo: 'Aviso', mensaje: salonSeleccionadoReasignacion ? 'No se pudo identificar la clase.' : 'Selecciona un salón de destino.', tipo: 'advertencia' });
          return;
        }
        try {
          await fetchJson(`/horarios/${horarioActualEnWidget.id_horario_fijo_detalle}/reasignar-salon`, {
            method: 'POST',
            auth: true,
            body: { fecha: hoyISO(), id_salon_temporal: Number(salonSeleccionadoReasignacion.id_salon) }
          });
          const fecha = hoyISO();
          const [salonesRes, dinamicaRes] = await Promise.all([
            fetchJson('/salones', {}),
            fetchJson(`/horarios/tabla-dinamica?fecha=${encodeURIComponent(fecha)}`, { auth: true })
          ]);
          salonesData = Array.isArray(salonesRes) ? salonesRes : (salonesRes?.salones || []);
          dinamicaData = dinamicaRes?.tabla || [];
          renderizarSalones();
          renderizarAlertas();
          renderizarEstadisticas();
          actualizarMapaPreview();
          salonSeleccionadoReasignacion = null;
          mostrarTostada({ titulo: 'Éxito', mensaje: 'Salón reasignado correctamente.', tipo: 'exito' });
          modalRegistrarIncidencia.classList.remove('activo');
          formRegistrarIncidencia.reset();
        } catch (err) {
          const msg = err?.message || 'No se pudo reasignar el salón.';
          if (err?.status === 409) {
            mostrarTostada({ titulo: 'Conflicto', mensaje: 'El salón ya tiene horario en ese bloque.', tipo: 'error' });
          } else if (err?.status === 401 || err?.status === 403) {
            mostrarTostada({ titulo: 'Error', mensaje: `Sin permisos: ${msg}`, tipo: 'error' });
          } else {
            mostrarTostada({ titulo: 'Error', mensaje: msg, tipo: 'error' });
          }
        }
        return;
      }

      if (!horaRegistro) {
        mostrarTostada({ titulo: 'Aviso', mensaje: 'Selecciona la hora de la incidencia.', tipo: 'advertencia' });
        return;
      }
      if (!profesorSeleccionado) {
        mostrarTostada({ titulo: 'Aviso', mensaje: 'Selecciona el profesor ausente.', tipo: 'advertencia' });
        return;
      }

      if (existeIncidenciaDuplicada(fechaDinamica, hhmm(horaRegistro), profesorSeleccionado, horarioActualEnWidget.id_grupo)) {
        mostrarTostada({ titulo: 'Aviso', mensaje: 'Ya existe una incidencia registrada para esta clase en esa hora.', tipo: 'advertencia' });
        return;
      }

      try {
        await fetchJson('/ausencias', {
          method: 'POST',
          auth: true,
          body: {
            fecha: hoyISO(),
            hora: horaRegistro,
            id_profesor: Number(profesorSeleccionado),
            id_grupo: Number(horarioActualEnWidget.id_grupo),
            accion_tomada: tipo
          }
        });

        ausenciasData.push({
          fecha: hoyISO(),
          hora: horaRegistro,
          id_profesor: Number(profesorSeleccionado),
          id_grupo: Number(horarioActualEnWidget.id_grupo),
          accion_tomada: tipo
        });

        renderizarSalones();
        renderizarAlertas();
        renderizarEstadisticas();

        mostrarTostada({ titulo: 'Éxito', mensaje: 'Incidencia registrada', tipo: 'exito' });
        modalRegistrarIncidencia.classList.remove('activo');
        formRegistrarIncidencia.reset();
      } catch (err) {
        const msg = err?.message || 'No se pudo registrar la incidencia.';
        if (err?.status === 401 || err?.status === 403) {
          mostrarTostada({ titulo: 'Error', mensaje: `Sin permisos: ${msg}`, tipo: 'error' });
        } else {
          mostrarTostada({ titulo: 'Error', mensaje: msg, tipo: 'error' });
        }
      }
    });
  }

  // Cerrar modales al hacer click fuera de ellos
  window.addEventListener('click', (e) => {
    if (e.target === modalRegistrarIncidencia) modalRegistrarIncidencia.classList.remove('activo');
  });

  // Navegacion al mapa (solo controlers, cromo chamba)
  const btnIrMapa = document.getElementById('btn-ir-mapa');
  if (btnIrMapa) {
    btnIrMapa.addEventListener('click', () => {
      window.location.href = `map_preG.html?piso=${encodeURIComponent(pisoActual)}`;
    });
  }

  // Inicializar mini-mapa (según piso activo por defecto)
  if (tituloMapaPiso) tituloMapaPiso.textContent = `MAPA PISO ${pisoActual === 'L' ? 'L' : pisoActual}`;
  actualizarMapaPreview();

  const pisoDeHorario = (idGrupo) => {
    const hf = horariosData.find(h => h.id_grupo === idGrupo);
    if (hf) {
      const salon = salonesData.find(s => s.id_salon === hf.id_salon);
      return salon ? String(salon.piso) : null;
    }
    return null;
  };

  const obtenerPisoDeAlerta = (alerta) => {
    if (alerta.id_grupo) return pisoDeHorario(Number(alerta.id_grupo));
    const idHf = alerta.id_horario_fijo || alerta.id_horario_fijo_detalle;
    if (idHf) {
      const hf = horariosData.find(h => h.id_horario_fijo === Number(idHf) || h.id_horario_fijo_detalle === Number(idHf));
      if (hf) {
        const salon = salonesData.find(s => s.id_salon === hf.id_salon);
        return salon ? String(salon.piso) : null;
      }
    }
    return null;
  };

  const crearTarjetaAlerta = (alerta, tipo) => {
    const div = document.createElement('div');
    div.className = 'tarjeta-alerta';

    if (tipo === 'ausencia') {
      div.innerHTML = `
        <div class="alerta-icono error">
          <span class="material-symbols-outlined md-20">person_off</span>
        </div>
        <div class="alerta-texto">
          <p>Ausencia: ${alerta.nombre_profesor || 'Profesor'}</p>
          <p>Grupo ${alerta.nombre_grupo || 'G'} • ${alerta.hora}</p>
          <p>Acción: ${alerta.accion_tomada}</p>
        </div>
      `;
    } else {
      div.innerHTML = `
        <div class="alerta-icono advertencia">
          <span class="material-symbols-outlined md-20">warning</span>
        </div>
        <div class="alerta-texto">
          <p>Cambio/Adelanto: ${alerta.motivo || alerta.motivo_cambio}</p>
          <p>${alerta.nombre_grupo ? `Grupo ${alerta.nombre_grupo}` : ''} • ${alerta.hora_inicio || alerta.hora_inicio_temp}</p>
        </div>
      `;
    }
    return div;
  };

  const enPisoActual = (p) => {
    if (p == null) return false;
    const target = pisoActual === 'L' ? '0' : String(pisoActual);
    return String(p) === target;
  };

  const renderizarAlertas = () => {
    const contenedor = document.getElementById('lista-reportes-dashboard');
    if (!contenedor) return;

    contenedor.innerHTML = '';

    const ausenciasFiltradas = ausenciasData.filter(a => enPisoActual(obtenerPisoDeAlerta(a)));
    ausenciasFiltradas.forEach(a => contenedor.appendChild(crearTarjetaAlerta(a, 'ausencia')));

    const cambiosFiltrados = dinamicaData.filter(d => enPisoActual(d.piso));
    cambiosFiltrados.forEach(c => contenedor.appendChild(crearTarjetaAlerta(c, 'cambio')));

    if (contenedor.innerHTML === '') {
      contenedor.innerHTML = '<p style="text-align: center; color: #94a3b8; padding: 20px; font-size: 0.875rem;">No hay reportes en este piso.</p>';
    }
  };

  // Modal de alertas
  const modalAlertas = document.getElementById('modal-alertas');
  const cerrarModalAlertas = document.getElementById('cerrar-modal-alertas');
  const cuerpoModalAlertas = document.getElementById('cuerpo-modal-alertas');
  const btnVerTodasAlertas = document.getElementById('btn-ver-todas-alertas');

  const formatearFecha = (fechaStr) => {
    const hoy = getLocalDateISO();
    if (fechaStr === hoy) return 'Hoy';
    
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    if (fechaStr === getLocalDateISO(ayer)) return 'Ayer';

    const opciones = { weekday: 'long', day: 'numeric', month: 'long' };
    const fecha = new Date(fechaStr + 'T00:00:00');
    return fecha.toLocaleDateString('es-ES', opciones);
  };

  const abrirModalAlertas = () => {
    if (!modalAlertas || !cuerpoModalAlertas) return;

    cuerpoModalAlertas.innerHTML = '';

    const ausenciasFiltradas = ausenciasData.filter(a => enPisoActual(obtenerPisoDeAlerta(a)));
    const cambiosFiltrados = dinamicaData.filter(d => enPisoActual(d.piso));

    const todasLasAlertas = [
      ...ausenciasFiltradas.map(a => ({ ...a, tipo: 'ausencia' })),
      ...cambiosFiltrados.map(c => ({ ...c, tipo: 'cambio' }))
    ].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

    const alertasPorFecha = {};
    todasLasAlertas.forEach(alerta => {
      const f = alerta.fecha || '';
      if (!alertasPorFecha[f]) alertasPorFecha[f] = [];
      alertasPorFecha[f].push(alerta);
    });

    Object.keys(alertasPorFecha).forEach(fecha => {
      const separador = document.createElement('div');
      separador.className = 'separador-fecha';
      
      const hoy = getLocalDateISO();
      const fechaTexto = fecha === hoy ? 'HOY' : fecha;

      separador.innerHTML = `
        <span class="fecha-etiqueta">${formatearFecha(fecha)}</span>
      `;
      cuerpoModalAlertas.appendChild(separador);

      alertasPorFecha[fecha].forEach(alerta => {
        cuerpoModalAlertas.appendChild(crearTarjetaAlerta(alerta, alerta.tipo));
      });
    });

    if (todasLasAlertas.length === 0) { // Si no hay alertas, mostrar mensaje
      cuerpoModalAlertas.innerHTML = '<p style="text-align: center; color: #94a3b8; padding: 40px;">No hay historial de alertas para este piso.</p>';
    }

    modalAlertas.classList.add('activo');
  };

  if (btnVerTodasAlertas) {
    btnVerTodasAlertas.addEventListener('click', abrirModalAlertas);
  }

  if (cerrarModalAlertas) {
    cerrarModalAlertas.addEventListener('click', () => {
      modalAlertas.classList.remove('activo');
    });
  }

  window.addEventListener('click', (e) => {
    if (e.target === modalHorario) modalHorario.classList.remove('activo');
    if (e.target === modalAlertas) modalAlertas.classList.remove('activo');
    if (e.target === modalRegistrarIncidencia) modalRegistrarIncidencia.classList.remove('activo');
    
    if (!e.target.closest('.contenedor-menu-kebab')) {
      document.querySelectorAll('.menu-desplegable.activo').forEach(m => {
        m.classList.remove('activo');
      });
    }
  });


  const perfilBtn = document.getElementById('perfil-usuario-btn');
  const menuPerfilUsuario = document.getElementById('menu-perfil-usuario');
  if (perfilBtn && menuPerfilUsuario) {
    perfilBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      menuPerfilUsuario.classList.toggle('activo');
    });
  }
  document.getElementById('opcion-perfil')?.addEventListener('click', () => { window.location.href = 'stt_preG.html'; });
  document.getElementById('opcion-cerrar-sesion')?.addEventListener('click', () => {
    clearSession();
    window.location.href = 'index.html';
  });

  const btnCerrarSesion = document.getElementById('boton-cerrar-sesion');
  if (btnCerrarSesion) {
    btnCerrarSesion.addEventListener('click', () => {
      clearSession();
      window.location.href = 'index.html';
    });
  }

  const inicializarDatos = async () => {
    const fecha = hoyISO();

    const safeFetch = async (url, opts, fallback) => {
      try { return await fetchJson(url, opts); } catch (e) { console.warn(`Fallo ${url}:`, e?.message); return fallback; }
    };

    const [salonesRes, horariosRes, gruposRes, ausenciasRes, dinamicaRes] = await Promise.all([
      safeFetch('/salones', {}, []),
      safeFetch('/horarios', {}, { horarios: [] }),
      safeFetch('/grupos', {}, { grupos: [] }),
      safeFetch('/ausencias', { auth: true }, { ausencias: [] }),
      safeFetch(`/horarios/tabla-dinamica?fecha=${encodeURIComponent(fecha)}`, { auth: true }, { tabla: [] })
    ]);

    salonesData = Array.isArray(salonesRes) ? salonesRes : (salonesRes?.salones || []);
    horariosData = horariosRes?.horarios || [];
    gruposData = gruposRes?.grupos || [];
    ausenciasData = ausenciasRes?.ausencias || [];
    dinamicaData = dinamicaRes?.tabla || [];

    renderizarSalones();
    renderizarAlertas();
    renderizarEstadisticas();
    actualizarMapaPreview();
  };

  inicializarDatos();

  setInterval(actualizarReloj, 1000);
  actualizarReloj();
});
