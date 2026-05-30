import {
  DEFAULT_API_URL, resolveApiBase, getSessionToken, getSessionUser, clearSession, paintSessionHeader, getInitials,
  LAYOUT_PISOS, COLORES, keySalonName, stripSalonPrefix, normalizarEstado, getLocalDateISO
} from './map_preG_shared.js';

const apiBase = resolveApiBase() || DEFAULT_API_URL;

const fetchJson = async (pathOrUrl, { method = 'GET', body, auth = false } = {}) => {
  const isFullUrl = pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://');
  const baseUrl = isFullUrl ? '' : apiBase;
  const url = baseUrl + pathOrUrl;
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers['Authorization'] = `Bearer ${getSessionToken()}`;
  const res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody?.error || `Error ${res.status}`);
  }
  return res.json();
};

document.addEventListener('DOMContentLoaded', () => {
  const relojTiempo = document.getElementById('reloj-tiempo');
  const relojFecha = document.getElementById('reloj-fecha');
  let bloqueActualIdCache = null;

  const usuarioActual = getSessionUser();
  const pisoActual = usuarioActual?.piso || '3';

  paintSessionHeader(usuarioActual);

  const nombreHeader = document.getElementById('nombre-usuario-header');
  const avatarHeader = document.getElementById('avatar-header');
  if (nombreHeader && usuarioActual) {
    nombreHeader.textContent = usuarioActual.nombre;
  }
  if (avatarHeader && usuarioActual) {
    const partes = usuarioActual.nombre.split(' ');
    avatarHeader.textContent = (partes[0]?.[0] || '') + (partes[1]?.[0] || '');
  }

  const labelPiso = document.getElementById('label-piso-actual');
  const tituloMapaPiso = document.getElementById('titulo-mapa-piso');
  if (labelPiso) labelPiso.textContent = `PISO ${pisoActual}`;
  if (tituloMapaPiso) tituloMapaPiso.textContent = `MAPA PISO ${pisoActual}`;

  let salonesData = [];
  let horariosData = [];
  let gruposData = [];
  let ausenciasData = [];
  let dinamicaData = [];

  const pisoCoincide = (obj) => {
    const target = pisoActual === 'L' ? '0' : String(pisoActual);
    return String(obj.piso) === target;
  };

  const actualizarReloj = () => {
    const ahora = new Date();
    const horas = String(ahora.getHours()).padStart(2, '0');
    const minutos = String(ahora.getMinutes()).padStart(2, '0');
    if (relojTiempo) relojTiempo.textContent = `${horas} : ${minutos}`;
    const opciones = { weekday: 'long', day: 'numeric', month: 'long' };
    if (relojFecha) relojFecha.textContent = ahora.toLocaleDateString('es-ES', opciones);

    const nuevoBloqueId = obtenerBloqueActualId();
    if (nuevoBloqueId !== bloqueActualIdCache) {
      bloqueActualIdCache = nuevoBloqueId;
      renderizarSalones();
    }
  };

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

  const obtenerBloqueActualId = () => {
    const ahora = new Date();
    const horaMinutos = ahora.getHours() * 60 + ahora.getMinutes();
    for (const bloque of bloquesHorarios) {
      const [hIni, mIni] = bloque.inicio.split(':').map(Number);
      const [hFin, mFin] = bloque.fin.split(':').map(Number);
      if (horaMinutos >= (hIni * 60 + mIni) && horaMinutos <= (hFin * 60 + mFin)) return bloque.id;
    }
    return null;
  };

  const obtenerDiaActual = () => {
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
    return dias[new Date().getDay()];
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
    return row?.nombre_salon || row?.numero_salon || row?.nombre || row?.salon || '';
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

  const buscarDinamicoEnBloque = (idSalon, dia, bloqueId) => {
    if (!idSalon || bloqueId == null) return null;
    const diaLower = String(dia || '').toLowerCase();
    return dinamicaData.find((d) => {
      const salonId = Number(d?.id_salon_temporal || d?.id_salon);
      if (salonId !== Number(idSalon)) return false;
      if (String(d?.dia || '').toLowerCase() !== diaLower) return false;
      const h = { hora_inicio: dynHoraInicio(d), hora_fin: dynHoraFin(d) };
      return claseEnBloque(h, bloqueId);
    }) || null;
  };

  const buildAusenciasMap = () => {
    const map = new Map();
    const hoy = hoyISO();
    for (const a of ausenciasData) {
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

  async function renderizarOverlayMapaPreview() {
    const overlay = document.getElementById('mapa-preview-overlay');
    if (!overlay) return;

    const layout = LAYOUT_PISOS[pisoActual] || LAYOUT_PISOS['1'];
    if (!layout) { overlay.innerHTML = ''; return; }

    overlay.setAttribute('viewBox', layout.viewBox);
    overlay.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    overlay.innerHTML = '';

    const rows = salonesData.filter(s => pisoCoincide(s));
    const ausMap = buildAusenciasMap();
    const diaActual = obtenerDiaActual();
    const bloqueActualId = obtenerBloqueActualId();
    const ocupadosPorHorario = new Set();
    const provisionales = new Set();

    if (bloqueActualId != null) {
      for (const s of rows) {
        const dyn = buscarDinamicoEnBloque(s.id_salon, diaActual, bloqueActualId);
        const motivo = String(dyn?.motivo || dyn?.motivo_cambio || '').toLowerCase();
        const dynCancelada = dyn ? claseCancelada(horarioDesdeDinamico(dyn), ausMap) : false;
        if (dyn && !dynCancelada && motivo.includes('adelanto')) {
          for (const k of nameKeysForMatch(obtenerNombreSalon(s))) provisionales.add(k);
        }
        if (dyn && !dynCancelada) {
          for (const k of nameKeysForMatch(obtenerNombreSalon(s))) ocupadosPorHorario.add(k);
          continue;
        }
      }

      for (const h of horariosData) {
        if (String(h.dia).toLowerCase() !== String(diaActual).toLowerCase()) continue;
        if (!claseEnBloque(h, bloqueActualId)) continue;
        if (claseCancelada(h, ausMap)) continue;
        const nombreSalon = obtenerNombreSalon(h);
        for (const k of nameKeysForMatch(nombreSalon)) ocupadosPorHorario.add(k);
      }
    }

    const estadoPorKey = new Map();
    for (const row of rows) {
      const nombre = obtenerNombreSalon(row);
      const estado = normalizarEstado(row?.estado);
      for (const k of nameKeysForMatch(nombre)) estadoPorKey.set(k, estado);
    }

    const grupo = svgEl('g', { opacity: '1' });
    for (const s of layout.salones) {
      const keyMatch = nameKeysForMatch(s.nombre);
      const ocupado = keyMatch.some(k => ocupadosPorHorario.has(k));
      const esProvisional = keyMatch.some(k => provisionales.has(k));
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

      const label = svgEl('text', {
        x: String(s.x + (s.w || 0) / 2),
        y: String(s.y + (s.h || 0) / 2),
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-size': '11',
        'font-family': 'Inter, sans-serif',
        fill: '#1e293b',
        'font-weight': '500',
        'pointer-events': 'none'
      });
      label.textContent = s.nombre;

      grupo.appendChild(shape);
      grupo.appendChild(label);
    }
    overlay.appendChild(grupo);
  }

  const totalAulasNum = document.getElementById('total-aulas-num');
  const resumenDisponibles = document.getElementById('resumen-disponibles');
  const resumenOcupadas = document.getElementById('resumen-ocupadas');
  const resumenProvisionales = document.getElementById('resumen-provisionales');
  const resumenMantenimiento = document.getElementById('resumen-mantenimiento');

  const renderizarEstadisticas = () => {
    const salonesPiso = salonesData.filter(s => pisoCoincide(s));
    const total = salonesPiso.length;

    const diaActual = obtenerDiaActual();
    const bloqueActualId = obtenerBloqueActualId();
    const ausMap = buildAusenciasMap();

    const estadosActuales = salonesPiso.map((salon) => {
      let estado = String(salon.estado || '').trim();
      if (bloqueActualId != null) {
        const dyn = buscarDinamicoEnBloque(salon.id_salon, diaActual, bloqueActualId);
        const motivo = String(dyn?.motivo || dyn?.motivo_cambio || '').toLowerCase();
        const dynCancelada = dyn ? claseCancelada(horarioDesdeDinamico(dyn), ausMap) : false;
        if (dyn && !dynCancelada && motivo.includes('adelanto')) return 'Provisional';
        if (dyn && !dynCancelada) return 'Ocupado';

        const hRaw = horariosData.find(h =>
          Number(h.id_salon) === Number(salon.id_salon) &&
          String(h.dia).toLowerCase() === diaActual.toLowerCase() &&
          claseEnBloque(h, bloqueActualId)
        );
        const h = hRaw && !claseCancelada(hRaw, ausMap) ? hRaw : null;
        if (h && estado.toLowerCase() === 'disponible') return 'Ocupado';
        if (!h && estado.toLowerCase() === 'ocupado') return 'Disponible';
      }
      return estado || 'Disponible';
    });

    const stats = {
      disponibles: estadosActuales.filter(s => s === 'Disponible').length,
      ocupadas: estadosActuales.filter(s => s === 'Ocupado').length,
      provisionales: estadosActuales.filter(s => s === 'Provisional').length,
      mantenimiento: estadosActuales.filter(s => s === 'Mantenimiento' || s === 'En Mantenimiento').length
    };

    if (totalAulasNum) totalAulasNum.textContent = total;
    if (resumenDisponibles) resumenDisponibles.textContent = stats.disponibles;
    if (resumenOcupadas) resumenOcupadas.textContent = stats.ocupadas;
    if (resumenProvisionales) resumenProvisionales.textContent = stats.provisionales;
    if (resumenMantenimiento) resumenMantenimiento.textContent = stats.mantenimiento;

    const totalLength = 125.6;

    const L_mantenimiento = total > 0 ? (stats.mantenimiento / total) * totalLength : 0;
    const L_provisionales = total > 0 ? (stats.provisionales / total) * totalLength : 0;
    const L_ocupadas = total > 0 ? (stats.ocupadas / total) * totalLength : 0;
    const L_disponibles = total > 0 ? (stats.disponibles / total) * totalLength : 0;

    const gMantenimiento = document.getElementById('gauge-mantenimiento');
    const gProvisionales = document.getElementById('gauge-provisionales');
    const gOcupadas = document.getElementById('gauge-ocupadas');
    const gDisponibles = document.getElementById('gauge-disponibles');

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

  const listaSalonesContenedor = document.getElementById('lista-salones-dashboard');
  const conteoSalonesPiso = document.getElementById('conteo-salones-piso');
  const paginacionDiv = document.querySelector('.paginacion');
  const PAGE_SIZE = 7;
  let paginaActual = 1;

  const renderizarPaginacion = (totalPaginas) => {
    if (!paginacionDiv) return;
    paginacionDiv.innerHTML = '';

    const btnAnt = document.createElement('button');
    btnAnt.className = 'btn-pag';
    btnAnt.textContent = 'Anterior';
    btnAnt.disabled = paginaActual <= 1;
    btnAnt.addEventListener('click', () => { if (paginaActual > 1) { paginaActual--; renderizarSalones(); } });
    paginacionDiv.appendChild(btnAnt);

    for (let i = 1; i <= totalPaginas; i++) {
      const btn = document.createElement('button');
      btn.className = 'btn-pag' + (i === paginaActual ? ' activo' : '');
      btn.textContent = String(i);
      btn.addEventListener('click', () => { paginaActual = i; renderizarSalones(); });
      paginacionDiv.appendChild(btn);
    }

    const btnSig = document.createElement('button');
    btnSig.className = 'btn-pag';
    btnSig.textContent = 'Siguiente';
    btnSig.disabled = paginaActual >= totalPaginas;
    btnSig.addEventListener('click', () => { if (paginaActual < totalPaginas) { paginaActual++; renderizarSalones(); } });
    paginacionDiv.appendChild(btnSig);
  };

  const renderizarSalones = () => {
    if (!listaSalonesContenedor) return;

    const salonesPiso = salonesData.filter(s => pisoCoincide(s));
    const diaActual = obtenerDiaActual();
    const bloqueActualId = obtenerBloqueActualId();

    const totalPaginas = Math.max(1, Math.ceil(salonesPiso.length / PAGE_SIZE));
    if (paginaActual > totalPaginas) paginaActual = totalPaginas;

    const inicio = (paginaActual - 1) * PAGE_SIZE;
    const paginaSalones = salonesPiso.slice(inicio, inicio + PAGE_SIZE);

    listaSalonesContenedor.innerHTML = '';

    const ausMap = buildAusenciasMap();

    paginaSalones.forEach(salon => {
      const dyn = buscarDinamicoEnBloque(salon.id_salon, diaActual, bloqueActualId);
      const motivoDyn = String(dyn?.motivo || dyn?.motivo_cambio || '').toLowerCase();
      const dynHorario = dyn ? horarioDesdeDinamico(dyn) : null;
      const dynCancelada = dynHorario ? claseCancelada(dynHorario, ausMap) : false;
      const horarioRaw = horariosData.find(h =>
        Number(h.id_salon) === Number(salon.id_salon) &&
        String(h.dia).toLowerCase() === diaActual.toLowerCase() &&
        claseEnBloque(h, bloqueActualId)
      );
      const horarioBase = horarioRaw && !claseCancelada(horarioRaw, ausMap)
        ? horarioRaw
        : null;
      const horarioActual = dyn && !dynCancelada
        ? { ...dyn, hora_inicio: dynHoraInicio(dyn), hora_fin: dynHoraFin(dyn) }
        : horarioBase;

      const nombreSalon = obtenerNombreSalon(salon);

      let estadoVisual = String(salon.estado || '').toLowerCase();
      if (!dynCancelada && dyn && motivoDyn.includes('adelanto')) {
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
            <button class="boton-kebab" style="background:none;border:none;cursor:pointer;color:#94a3b8;display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;transition:background 0.2s;">
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
        if (!e.target.closest('.contenedor-menu-kebab')) abrirModalHorario(salon);
      });

      const btnKebab = tr.querySelector('.boton-kebab');
      const menuKebab = tr.querySelector('.menu-desplegable');
      const btnIncidencia = tr.querySelector('.btn-incidencia');
      const btnMantenimiento = tr.querySelector('.btn-mantenimiento');

      btnKebab.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.menu-desplegable.activo').forEach(m => { if (m !== menuKebab) m.classList.remove('activo'); });
        menuKebab.classList.toggle('activo');
      });

      btnIncidencia.addEventListener('click', (e) => {
        e.stopPropagation();
        menuKebab.classList.remove('activo');
        abrirModalIncidencia(salon, horarioActual);
      });

      btnMantenimiento.addEventListener('click', (e) => {
        e.stopPropagation();
        menuKebab.classList.remove('activo');
        alert(`Cambiando salón ${nombreSalon} a estado de mantenimiento (Simulación)`);
      });

      listaSalonesContenedor.appendChild(tr);
    });

    if (conteoSalonesPiso) {
      const desde = (paginaActual - 1) * PAGE_SIZE + 1;
      const hasta = Math.min(paginaActual * PAGE_SIZE, salonesPiso.length);
      conteoSalonesPiso.textContent = `Mostrando ${desde}–${hasta} de ${salonesPiso.length} salones en este piso.`;
    }
    renderizarPaginacion(totalPaginas);
  };

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
      const dynCancelada = dyn ? claseCancelada(horarioDesdeDinamico(dyn), ausMap) : false;
      const h = (dyn && !dynCancelada) ? { ...dyn, hora_inicio: dynHoraInicio(dyn), hora_fin: dynHoraFin(dyn) }
        : horariosData.find(h =>
            Number(h.id_salon) === Number(salonSeleccionado.id_salon) &&
            String(h.dia).toLowerCase() === String(diaSeleccionadoModal).toLowerCase() &&
            claseEnBloque(h, bloque.id)
          );
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
    tituloModal.textContent = `Horario de Salón ${salon.nombre_salon}`;
    actualizarTablaHorarioModal();
    modalHorario.classList.add('activo');
  };

  if (selectorDiaModal) {
    selectorDiaModal.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        diaSeleccionadoModal = btn.getAttribute('data-dia');
        selectorDiaModal.querySelectorAll('button').forEach(b => b.classList.remove('activo-primario'));
        btn.classList.add('activo-primario');
        actualizarTablaHorarioModal();
      });
    });
    const btnLunes = selectorDiaModal.querySelector('[data-dia="Lunes"]');
    if (btnLunes) btnLunes.classList.add('activo-primario');
  }

  if (cerrarModalBtn) cerrarModalBtn.addEventListener('click', () => modalHorario.classList.remove('activo'));

  const modalRegistrarIncidencia = document.getElementById('modal-registrar-incidencia');
  const cerrarModalRegistrar = document.getElementById('cerrar-modal-registrar-incidencia');
  const formRegistrarIncidencia = document.getElementById('form-registrar-incidencia');
  const incTipoEl = document.getElementById('inc-tipo');
  const incHoraContainer = document.getElementById('inc-hora-container');
  const incHoraEl = document.getElementById('inc-hora');
  const incContextoEl = document.getElementById('inc-contexto');
  const incProfesorContainer = document.getElementById('inc-profesor-container');
  const incProfesorEl = document.getElementById('inc-profesor');
  let horarioActualEnWidget = null;

  const abrirModalIncidencia = (salon, horario) => {
    if (!modalRegistrarIncidencia) return;
    horarioActualEnWidget = horario || null;
    if (formRegistrarIncidencia) formRegistrarIncidencia.reset();
    if (incHoraContainer) incHoraContainer.classList.add('oculto');
    if (incProfesorContainer) incProfesorContainer.classList.add('oculto');
    if (incProfesorEl) {
      incProfesorEl.innerHTML = '<option value="">Seleccionar Profesor</option>';
      if (horarioActualEnWidget && horarioActualEnWidget.nombre_profesor) {
        const o = document.createElement('option');
        o.value = horarioActualEnWidget.id_profesor;
        o.textContent = horarioActualEnWidget.nombre_profesor + ' (Titular)';
        incProfesorEl.appendChild(o);
      }
    }
    const btnQrInit = document.getElementById('btn-codigo-qr');
    if (btnQrInit) btnQrInit.classList.add('oculto');
    modalRegistrarIncidencia.classList.add('activo');
  };

  if (cerrarModalRegistrar) {
    cerrarModalRegistrar.addEventListener('click', () => { if (modalRegistrarIncidencia) modalRegistrarIncidencia.classList.remove('activo'); });
  }

  if (incTipoEl) {
    incTipoEl.addEventListener('change', () => {
      const v = incTipoEl.value;
      const btnQr = document.getElementById('btn-codigo-qr');
      if (v === 'ausencia_profesor') {
        if (incHoraContainer) incHoraContainer.classList.remove('oculto');
        if (incProfesorContainer) incProfesorContainer.classList.remove('oculto');
        if (btnQr) btnQr.classList.remove('oculto');
      } else {
        if (incHoraContainer) incHoraContainer.classList.add('oculto');
        if (incProfesorContainer) incProfesorContainer.classList.add('oculto');
        if (btnQr) btnQr.classList.add('oculto');
      }
    });
  }

  if (formRegistrarIncidencia) {
    formRegistrarIncidencia.addEventListener('submit', (e) => {
      e.preventDefault();
      const tipo = incTipoEl?.value || '';
      if (!tipo) { alert('Selecciona un tipo de incidencia'); return; }
      console.log('Incidencia registrada (sim):', { tipo, hora: incHoraEl?.value, contexto: incContextoEl?.value, creado_en: new Date().toISOString() });
      alert('Incidencia registrada (simulación)');
      if (modalRegistrarIncidencia) modalRegistrarIncidencia.classList.remove('activo');
      if (formRegistrarIncidencia) formRegistrarIncidencia.reset();
    });
  }

  const modalCodigoQr = document.getElementById('modal-codigo-qr');
  const btnCodigoQr = document.getElementById('btn-codigo-qr');
  const cerrarModalCodigoQr = document.getElementById('cerrar-modal-codigo-qr');
  if (btnCodigoQr && modalCodigoQr) btnCodigoQr.addEventListener('click', () => modalCodigoQr.classList.add('activo'));
  if (cerrarModalCodigoQr) cerrarModalCodigoQr.addEventListener('click', () => { if (modalCodigoQr) modalCodigoQr.classList.remove('activo'); });

  const btnIrMapa = document.getElementById('btn-ir-mapa');
  if (btnIrMapa) btnIrMapa.addEventListener('click', () => { window.location.href = 'map_preP.html'; });

  const btnDetalle = document.getElementById('btn-ver-detalle-estadisticas');
  if (btnDetalle) btnDetalle.addEventListener('click', () => { window.location.href = 'sal_preP.html'; });

  const obtenerPisoDeAlerta = (alerta) => {
    if (alerta.id_grupo) {
      const hf = horariosData.find(h => Number(h.id_grupo) === Number(alerta.id_grupo));
      if (hf) return String(salonesData.find(s => Number(s.id_salon) === Number(hf.id_salon))?.piso);
    } else if (alerta.id_horario_fijo) {
      const hf = horariosData.find(h => Number(h.id_horario_fijo) === Number(alerta.id_horario_fijo));
      if (hf) return String(salonesData.find(s => Number(s.id_salon) === Number(hf.id_salon))?.piso);
    }
    return null;
  };

  const crearTarjetaAlerta = (alerta, tipo) => {
    const div = document.createElement('div');
    div.className = 'tarjeta-alerta';
    if (tipo === 'ausencia') {
      div.innerHTML = `
        <div class="alerta-icono error"><span class="material-symbols-outlined md-20">person_off</span></div>
        <div class="alerta-texto">
          <p>Ausencia: ${alerta.nombre_profesor || 'Profesor'}</p>
          <p>Grupo ${alerta.nombre_grupo || 'G'} • ${alerta.hora}</p>
          <p>Acción: ${alerta.accion_tomada}</p>
        </div>`;
    } else {
      div.innerHTML = `
        <div class="alerta-icono advertencia"><span class="material-symbols-outlined md-20">warning</span></div>
        <div class="alerta-texto">
          <p>Cambio/Adelanto: ${alerta.motivo_cambio || alerta.motivo}</p>
          <p>${alerta.nombre_grupo ? `Grupo ${alerta.nombre_grupo}` : ''} • ${alerta.hora_inicio || alerta.hora_inicio_temp}</p>
        </div>`;
    }
    return div;
  };

  const renderizarAlertas = () => {
    const contenedor = document.getElementById('lista-reportes-dashboard');
    if (!contenedor) return;
    contenedor.innerHTML = '';
    const ausenciasFiltradas = ausenciasData.filter(a => obtenerPisoDeAlerta(a) === pisoActual);
    ausenciasFiltradas.forEach(a => contenedor.appendChild(crearTarjetaAlerta(a, 'ausencia')));
    const cambiosFiltrados = dinamicaData.filter(c => obtenerPisoDeAlerta(c) === pisoActual);
    cambiosFiltrados.forEach(c => contenedor.appendChild(crearTarjetaAlerta(c, 'cambio')));
    if (contenedor.innerHTML === '') {
      contenedor.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px;font-size:0.875rem;">No hay reportes en este piso.</p>';
    }
  };

  const modalAlertas = document.getElementById('modal-alertas');
  const cerrarModalAlertas = document.getElementById('cerrar-modal-alertas');
  const cuerpoModalAlertas = document.getElementById('cuerpo-modal-alertas');
  const btnVerTodasAlertas = document.getElementById('btn-ver-todas-alertas');

  const formatearFecha = (fechaStr) => {
    const ahora = new Date();
    const y = ahora.getFullYear();
    const m = String(ahora.getMonth() + 1).padStart(2, '0');
    const d = String(ahora.getDate()).padStart(2, '0');
    const hoy = `${y}-${m}-${d}`;
    if (fechaStr === hoy) return 'Hoy';
    const ayer = new Date(ahora);
    ayer.setDate(ayer.getDate() - 1);
    const ay = ayer.getFullYear();
    const am = String(ayer.getMonth() + 1).padStart(2, '0');
    const ad = String(ayer.getDate()).padStart(2, '0');
    if (fechaStr === `${ay}-${am}-${ad}`) return 'Ayer';
    return new Date(fechaStr + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  const abrirModalAlertas = () => {
    if (!modalAlertas || !cuerpoModalAlertas) return;
    cuerpoModalAlertas.innerHTML = '';
    const todasLasAlertas = [
      ...ausenciasData.filter(a => obtenerPisoDeAlerta(a) === pisoActual).map(a => ({ ...a, tipo: 'ausencia' })),
      ...dinamicaData.filter(c => obtenerPisoDeAlerta(c) === pisoActual).map(c => ({ ...c, tipo: 'cambio' }))
    ].sort((a, b) => b.fecha.localeCompare(a.fecha));

    const alertasPorFecha = {};
    todasLasAlertas.forEach(alerta => {
      if (!alertasPorFecha[alerta.fecha]) alertasPorFecha[alerta.fecha] = [];
      alertasPorFecha[alerta.fecha].push(alerta);
    });

    Object.keys(alertasPorFecha).forEach(fecha => {
      const sep = document.createElement('div'); sep.className = 'separador-fecha';
      sep.innerHTML = `<span class="fecha-etiqueta">${formatearFecha(fecha)}</span>`;
      cuerpoModalAlertas.appendChild(sep);
      alertasPorFecha[fecha].forEach(alerta => cuerpoModalAlertas.appendChild(crearTarjetaAlerta(alerta, alerta.tipo)));
    });

    if (todasLasAlertas.length === 0) {
      cuerpoModalAlertas.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:40px;">No hay historial de alertas para este piso.</p>';
    }
    modalAlertas.classList.add('activo');
  };

  if (btnVerTodasAlertas) btnVerTodasAlertas.addEventListener('click', abrirModalAlertas);
  if (cerrarModalAlertas) cerrarModalAlertas.addEventListener('click', () => modalAlertas.classList.remove('activo'));

  window.addEventListener('click', (e) => {
    if (e.target === modalHorario) modalHorario.classList.remove('activo');
    if (e.target === modalAlertas) modalAlertas.classList.remove('activo');
    if (e.target === modalRegistrarIncidencia) modalRegistrarIncidencia.classList.remove('activo');
    if (e.target === modalCodigoQr) modalCodigoQr.classList.remove('activo');
    if (!e.target.closest('.contenedor-menu-kebab')) {
      document.querySelectorAll('.menu-desplegable.activo').forEach(m => m.classList.remove('activo'));
    }
  });

  const perfilBtn = document.getElementById('perfil-usuario-btn');
  const menuPerfilUsuario = document.getElementById('menu-perfil-usuario');
  if (perfilBtn && menuPerfilUsuario) {
    perfilBtn.addEventListener('click', (e) => { e.stopPropagation(); menuPerfilUsuario.classList.toggle('activo'); });
  }
  document.getElementById('opcion-perfil')?.addEventListener('click', () => { window.location.href = 'stt_preP.html'; });
  document.getElementById('opcion-cerrar-sesion')?.addEventListener('click', () => { window.location.href = 'index.html'; });

  const hoyISO = () => getLocalDateISO();

  const timeToMinutes = (t) => {
    const s = String(t || '').trim();
    const m = s.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    const hh = Number(m[1]), mm = Number(m[2]);
    return Number.isFinite(hh) && Number.isFinite(mm) ? hh * 60 + mm : null;
  };

  const safeFetch = async (url, opts, fallback) => {
    try { return await fetchJson(url, opts); } catch (e) { console.warn(`Fallo ${url}:`, e?.message); return fallback; }
  };

  const inicializarDatos = async () => {
    const fecha = hoyISO();
    const [salonesRes, horariosRes, gruposRes, ausenciasRes, dinamicaRes] = await Promise.all([
      safeFetch('/salones', {}, []),
      safeFetch('/horarios', {}, { horarios: [] }),
      safeFetch('/grupos', {}, { grupos: [] }),
      safeFetch('/ausencias', { auth: true }, { ausencias: [] }),
      safeFetch(`/horarios/tabla-dinamica?fecha=${encodeURIComponent(fecha)}`, { auth: true }, { tabla: [] })
    ]);

    salonesData = Array.isArray(salonesRes) ? salonesRes : (salonesRes?.salones || []);
    horariosData = Array.isArray(horariosRes) ? horariosRes : (horariosRes?.horarios || []);
    gruposData = Array.isArray(gruposRes) ? gruposRes : (gruposRes?.grupos || []);
    ausenciasData = Array.isArray(ausenciasRes) ? ausenciasRes : (ausenciasRes?.ausencias || []);
    dinamicaData = Array.isArray(dinamicaRes) ? dinamicaRes : (dinamicaRes?.tabla || []);

    renderizarEstadisticas();
    renderizarSalones();
    renderizarAlertas();
    actualizarMapaPreview();
  };

  inicializarDatos();
  setInterval(actualizarReloj, 1000);
  actualizarReloj();
});
