import {
  COLORES,
  DEFAULT_API_URL,
  LAYOUT_PISOS,
  clearSession,
  paintSessionHeader,
  getSessionToken,
  keySalonName,
  normalizarEstado,
  normalizeText,
  resolveApiBase,
  stripSalonPrefix
} from './map_preG_shared.js';

let apiBase = resolveApiBase();

const NS = 'http://www.w3.org/2000/svg';

let pisoActual = '1';
let todosLosSalones = [];
let salonSeleccionado = null;
let filtrosActivos = { aulas: true, laboratorios: true };
let busquedaActual = '';

let zoom = 1;
let panX = 0, panY = 0;
let panning = false;
let panStartX = 0, panStartY = 0;
let touchDist0 = 0, zoom0 = 1;

let zoomPanAbort = null;

let mapaCanvas, mapaGrupo, mapaSvg;
let ocupadosHorarioKeys = new Set();

function normalizarTipoSalon(salon) {
  const nombreTipo = String(salon?.nombre_tipo_salon || '').trim();
  if (nombreTipo.toLowerCase() === 'laboratorio') return 'Laboratorio';
  // maldito fate los datos con nombre malos 
  return 'Aula';
}

function toHHMM(time) {
  const s = String(time || '');
  if (s.length >= 5) return s.slice(0, 5);
  return s;
}

function timeToMinutes(time) {
  const s = String(time || '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

function hoyISO() {
  return new Date().toLocaleDateString('sv-SE');
}

function obtenerDiaActual() {
  const dias = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
  return dias[new Date().getDay()];
}

const bloquesHorarios = [
  { inicio: '07:00', fin: '07:50' },
  { inicio: '08:00', fin: '08:50' },
  { inicio: '09:00', fin: '09:50' },
  { inicio: '10:00', fin: '10:50' },
  { inicio: '11:00', fin: '11:50' },
  { inicio: '12:00', fin: '12:50' },
  { inicio: '13:00', fin: '13:50' },
  { inicio: '14:00', fin: '14:50' },
  { inicio: '15:00', fin: '15:50' },
  { inicio: '16:00', fin: '16:50' },
  { inicio: '17:00', fin: '17:50' },
  { inicio: '18:00', fin: '18:50' },
  { inicio: '19:00', fin: '19:50' },
  { inicio: '20:00', fin: '20:50' }
];

function bloqueActual() {
  const ahora = new Date();
  const mins = ahora.getHours() * 60 + ahora.getMinutes();
  for (const b of bloquesHorarios) {
    const [hIni, mIni] = b.inicio.split(':').map(Number);
    const [hFin, mFin] = b.fin.split(':').map(Number);
    const ini = hIni * 60 + mIni;
    const fin = hFin * 60 + mFin;
    if (mins >= ini && mins <= fin) return b;
  }
  return null;
}

async function cargarOcupacionHorarioActual() {
  const dia = obtenerDiaActual();
  const bloque = bloqueActual();
  if (!dia || !bloque) {
    ocupadosHorarioKeys = new Set();
    return;
  }

  const fecha = hoyISO();
  const token = getSessionToken();

  const ausenciasPorGrupoHora = new Map();
  try {
    const resAus = await fetch(`${apiBase}/ausencias?fecha=${encodeURIComponent(fecha)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    });
    if (resAus.ok) {
      const dataAus = await resAus.json();
      const rows = Array.isArray(dataAus) ? dataAus : (dataAus.ausencias || dataAus.rows || []);
      for (const a of rows) {
        const tipo = String(a?.tipo_incidencia || a?.tipo || '').toLowerCase();
        if (tipo && tipo !== 'ausencia_profesor') continue;
        const gid = Number(a?.id_grupo);
        const horaMin = timeToMinutes(a?.hora);
        if (!Number.isFinite(gid) || horaMin == null) continue;
        if (!ausenciasPorGrupoHora.has(gid)) ausenciasPorGrupoHora.set(gid, new Set());
        ausenciasPorGrupoHora.get(gid).add(horaMin);
      }
    }
  } catch {
    // ignore
  }

  try {
    const qs = new URLSearchParams({
      dia,
      hora_inicio: bloque.inicio,
      hora_fin: bloque.fin,
      fecha
    });
    const res = await fetch(`${apiBase}/horarios/por-bloque?${qs.toString()}`);
    const data = await res.json();
    const rows = data && data.horarios ? data.horarios : (Array.isArray(data) ? data : []);
    const set = new Set();
    for (const h of rows) {
      const gid = Number(h?.id_grupo);
      const startMin = timeToMinutes(h?.hora_inicio);
      const endMin = timeToMinutes(h?.hora_fin);
      if (Number.isFinite(gid) && startMin != null) {
        const ausSet = ausenciasPorGrupoHora.get(gid);
        if (ausSet) {
          if (endMin == null || endMin <= startMin) {
            if (ausSet.has(startMin)) continue;
          } else {
            let cancelada = false;
            for (const t of ausSet.values()) {
              if (t >= startMin && t < endMin) { cancelada = true; break; }
            }
            if (cancelada) continue;
          }
        }
      }
      const nombre = String(h?.nombre_salon || '').trim();
      const base = stripSalonPrefix(nombre);
      const keys = [nombre, base];
      for (const k of keys) {
        const key = keySalonName(k);
        if (key) set.add(key);
      }
    }
    ocupadosHorarioKeys = set;
  } catch {
    ocupadosHorarioKeys = new Set();
  }
}

async function cargarSalones() {
  try {
    const res = await fetch(`${apiBase}/salones`);
    const data = await res.json();
    const rows = Array.isArray(data) ? data : (data.salones || data.rows || []);
    return rows.map(s => ({
      ...s,
      estado: normalizarEstado(s.estado),
      tipo: normalizarTipoSalon(s),
    }));
  } catch (e) {
    // Fallback si el frontend corre en otro puerto (neta q se joda CORS)
    if (apiBase !== DEFAULT_API_URL) {
      try {
        const res2 = await fetch(`${DEFAULT_API_URL}/salones`);
        const data2 = await res2.json();
        const rows2 = Array.isArray(data2) ? data2 : (data2.salones || data2.rows || []);
        apiBase = DEFAULT_API_URL;
        return rows2.map(s => ({
          ...s,
          estado: normalizarEstado(s.estado),
          tipo: normalizarTipoSalon(s),
        }));
      } catch (e2) {
        console.error('Error cargando salones (fallback):', e2);
      }
    }
    console.error('Error cargando salones:', e);
    return [];
  }
}

async function cargarHorarioSalon(id_salon) {
  try {
    const res = await fetch(`${apiBase}/horarios?id_salon=${encodeURIComponent(id_salon)}`);
    const data = await res.json();
    const rows = data && data.horarios ? data.horarios : (Array.isArray(data) ? data : []);
    return Array.isArray(rows) ? rows : [];
  } catch {
    if (apiBase !== DEFAULT_API_URL) {
      try {
        const res2 = await fetch(`${DEFAULT_API_URL}/horarios?id_salon=${encodeURIComponent(id_salon)}`);
        const data2 = await res2.json();
        const rows2 = data2 && data2.horarios ? data2.horarios : (Array.isArray(data2) ? data2 : []);
        apiBase = DEFAULT_API_URL;
        return Array.isArray(rows2) ? rows2 : [];
      } catch {
        // ignore
      }
    }
    return [];
  }
}

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function aplicarTransform() {
  if (mapaGrupo) {
    mapaGrupo.setAttribute('transform', `translate(${panX},${panY}) scale(${zoom})`);
  }
}

function resetTransform() {
  zoom = 1;
  panX = 0;
  panY = 0;
  aplicarTransform();
}

function crearTextoSVG(nombre, textX, textY, maxW, maxH, coordScale, fillColor) {
  const fs = Math.min(maxH / 2.5, 16 * coordScale);
  const charW = fs * 0.58;
  const maxCols = Math.max(4, Math.floor((maxW * 0.85) / charW));
  const lineH = fs * 1.25;
  const maxRows = Math.max(1, Math.floor((maxH * 0.85) / lineH));

  const words = String(nombre || '').split(' ');
  const lineas = [];
  let fila = '';
  for (const w of words) {
    const candidato = fila ? fila + ' ' + w : w;
    if (candidato.length <= maxCols) {
      fila = candidato;
    } else {
      if (fila) lineas.push(fila);
      fila = w.length > maxCols ? w.slice(0, maxCols - 1) + '…' : w;
    }
  }
  if (fila) lineas.push(fila);

  const visibles = lineas.slice(0, maxRows);
  const totalH = visibles.length * lineH;
  const startY = textY - totalH / 2 + lineH / 2;

  const el = svgEl('text', {
    'text-anchor': 'middle',
    fill: fillColor,
    'font-size': fs,
    'font-weight': '800',
    'font-family': 'Inter, sans-serif',
    'pointer-events': 'none'
  });

  visibles.forEach((linea, i) => {
    const ts = svgEl('tspan', { x: textX });
    ts.setAttribute('y', startY + i * lineH);
    ts.textContent = linea;
    el.appendChild(ts);
  });

  return el;
}

function renderMapa() {
  if (!mapaCanvas) return;

  const pisoData = LAYOUT_PISOS[pisoActual];
  if (!pisoData) return;

  const existing = document.getElementById('mapa-svg');
  if (existing) existing.remove();

  mapaSvg = svgEl('svg', {
    id: 'mapa-svg',
    viewBox: pisoData.viewBox,
    preserveAspectRatio: 'xMidYMid meet',
    style: 'width:100%;height:100%;position:absolute;top:0;left:0;cursor:grab;'
  });

  mapaGrupo = svgEl('g', { id: 'mapa-grupo' });

  const [_, __, w, h] = pisoData.viewBox.split(' ');
  const img = svgEl('image', {
    href: pisoData.imagen,
    x: 0,
    y: 0,
    width: w,
    height: h,
    preserveAspectRatio: 'xMidYMid meet'
  });
  mapaGrupo.appendChild(img);

  const estadoPorKey = new Map();
  for (const s of todosLosSalones) {
    const nombre = String(s.nombre_salon || '').trim();
    const val = { estado: s.estado, id_salon: s.id_salon, tipo: s.tipo };

    const base = stripSalonPrefix(nombre);
    const keys = [nombre, base];
    // Si es un salón tipo "Salón 21", agrega también el "21"
    const soloNumero = base.match(/^(\d{1,3})$/)?.[1];
    if (soloNumero) keys.push(soloNumero);

    for (const k of keys) {
      const key = keySalonName(k);
      if (key) estadoPorKey.set(key, val);
    }
  }

  const coordScale = parseInt(w) / 1224;

  for (const salon of pisoData.salones) {
    const esAula = salon.tipo === 'Aula';
    const esLab = salon.tipo !== 'Aula';

    if (esAula && !filtrosActivos.aulas) continue;
    if (esLab && !filtrosActivos.laboratorios) continue;

    const apiData = estadoPorKey.get(keySalonName(salon.nombre)) || null;
    const baseEstado = apiData?.estado || 'default';
    const isOcupadoHorario = ocupadosHorarioKeys.has(keySalonName(salon.nombre)) ||
      ocupadosHorarioKeys.has(keySalonName(stripSalonPrefix(salon.nombre)));
    let estado = isOcupadoHorario ? 'Ocupado' : baseEstado;
    if (!isOcupadoHorario && estado === 'Ocupado') estado = 'Disponible';
    const colorKey = COLORES[estado] ? estado : 'default';
    const color = COLORES[colorKey];

    const resaltado = busquedaActual &&
      salon.nombre.toLowerCase().includes(busquedaActual.toLowerCase());

    const c = resaltado ? COLORES.resaltado : color;

    const g = svgEl('g', { class: 'sala', 'data-nombre': salon.nombre, 'data-estado': estado });

    let forma;
    let textX, textY, approxW, approxH;

    if (salon.puntos) {
      forma = svgEl('polygon', {
        points: salon.puntos,
        fill: c.fill,
        'fill-opacity': c.fillOpacity,
        stroke: c.stroke,
        'stroke-width': c.strokeWidth * coordScale,
      });
      const coords = salon.puntos.trim().split(/\s+|,/).map(Number);
      const xs = [], ys = [];
      for (let i = 0; i < coords.length; i += 2) {
        xs.push(coords[i]);
        ys.push(coords[i + 1]);
      }
      textX = (Math.min(...xs) + Math.max(...xs)) / 2;
      textY = (Math.min(...ys) + Math.max(...ys)) / 2;
      approxW = Math.max(...xs) - Math.min(...xs);
      approxH = Math.max(...ys) - Math.min(...ys);
    } else {
      forma = svgEl('rect', {
        x: salon.x,
        y: salon.y,
        width: salon.w,
        height: salon.h,
        fill: c.fill,
        'fill-opacity': c.fillOpacity,
        stroke: c.stroke,
        'stroke-width': c.strokeWidth * coordScale,
        rx: 3 * coordScale
      });
      textX = salon.x + salon.w / 2;
      textY = salon.y + salon.h / 2;
      approxW = salon.w;
      approxH = salon.h;
    }

    const fillColor = resaltado ? '#3B0024' : c.stroke;
    const txt = crearTextoSVG(salon.nombre, textX, textY, approxW, approxH, coordScale, fillColor);

    g.appendChild(forma);
    g.appendChild(txt);

    g.addEventListener('click', (e) => {
      e.stopPropagation();
      const fullData = { ...salon, ...(apiData || {}), estado };
      mostrarWidget(fullData);
    });

    mapaGrupo.appendChild(g);
  }

  mapaSvg.appendChild(mapaGrupo);
  mapaCanvas.insertBefore(mapaSvg, mapaCanvas.firstChild);

  conectarZoomPan();
  aplicarTransform();
}

function actualizarConteos() {
  const pisoData = LAYOUT_PISOS[pisoActual];
  if (!pisoData) return;

  const estadoPorKey = new Map();
  for (const s of todosLosSalones) {
    const nombre = String(s.nombre_salon || '').trim();
    const base = stripSalonPrefix(nombre);
    const keys = [nombre, base];
    const soloNumero = base.match(/^(\d{1,3})$/)?.[1];
    if (soloNumero) keys.push(soloNumero);
    for (const k of keys) {
      const key = keySalonName(k);
      if (key) estadoPorKey.set(key, s.estado);
    }
  }

  const conteos = { Disponible: 0, Ocupado: 0, Provisional: 0, Mantenimiento: 0 };
  for (const s of pisoData.salones) {
    const est = estadoPorKey.get(keySalonName(s.nombre)) || null;
    if (est && Object.prototype.hasOwnProperty.call(conteos, est)) conteos[est]++;
  }

  const listaEstados = document.getElementById('lista-estados-salones');
  if (!listaEstados) return;

  listaEstados.innerHTML = `
    <div class="item-estado"><div class="estado-info"><span class="punto-estado disponible"></span><span>DISPONIBLE</span></div><span class="conteo-estado">${conteos.Disponible}</span></div>
    <div class="item-estado"><div class="estado-info"><span class="punto-estado ocupado"></span><span>OCUPADO</span></div><span class="conteo-estado">${conteos.Ocupado}</span></div>
    <div class="item-estado"><div class="estado-info"><span class="punto-estado provisional"></span><span>PROVISIONAL</span></div><span class="conteo-estado">${conteos.Provisional}</span></div>
    <div class="item-estado"><div class="estado-info"><span class="punto-estado mantenimiento"></span><span>MANTENIMIENTO</span></div><span class="conteo-estado">${conteos.Mantenimiento}</span></div>
  `;
}

function mostrarWidget(salon) {
  salonSeleccionado = salon;
  const widget = document.querySelector('.widget-detalle-salon');
  if (!widget) return;

  const estado = normalizarEstado(salon.estado);
  const badgeClass = {
    Disponible: 'disponible',
    Ocupado: 'ocupado',
    Provisional: 'provisional',
    Mantenimiento: 'mantenimiento',
    default: 'ocupado'
  }[estado] || 'ocupado';

  const tituloSpan = widget.querySelector('.widget-titulo span:last-child');
  if (tituloSpan) tituloSpan.textContent = salon.nombre;
  widget.style.display = 'block';

  const cuerpo = widget.querySelector('.widget-cuerpo');
  if (!cuerpo) return;
  cuerpo.innerHTML = `
    <div class="widget-fila-principal">
      <div>
        <p class="widget-label">SALÓN</p>
        <p class="widget-valor-grande">${salon.nombre}</p>
      </div>
      <span class="badge-estado ${badgeClass}">${estado === 'default' ? 'SIN DATOS' : estado.toUpperCase()}</span>
    </div>
    <div class="widget-info-secundaria">
      <div class="widget-dato">
        <span class="material-symbols-outlined md-18">meeting_room</span>
        <div>
          <p class="widget-label">TIPO</p>
          <p class="widget-valor">${salon.tipo || 'Aula'}</p>
        </div>
      </div>
      <div id="widget-ocupante">
        <p style="text-align:center; color:#94a3b8; font-size:0.8rem; padding:8px 0;">Cargando...</p>
      </div>
    </div>
    <button class="boton-widget-accion" id="btn-horario-salon">
      <span class="material-symbols-outlined md-18">history</span>
      <span>Horario del Salón</span>
    </button>
    <div id="widget-horario-lista" style="display:none; margin-top:12px;"></div>
  `;

  const ocupanteEl = document.getElementById('widget-ocupante');
  if (!salon.id_salon) {
    if (ocupanteEl) ocupanteEl.innerHTML = `<p style="color:#94a3b8;font-size:0.8rem;padding:4px 0;">Sin id_salon</p>`;
    return;
  }

  cargarHorarioSalon(salon.id_salon).then((horario) => {
    if (!ocupanteEl) return;
    if (!horario || horario.length === 0) {
      ocupanteEl.innerHTML = `<p style="color:#94a3b8;font-size:0.8rem;padding:4px 0;">Sin información de horario</p>`;
      return;
    }

    const now = new Date();
    const dias = ['Domingo','Lunes','Martes','Miercoles','Jueves','Viernes','Sábado'];
    const diaHoy = normalizeText(dias[now.getDay()]);
    const horaActual = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    const hoy = horario.filter(h => normalizeText(h.dia) === diaHoy);
    const claseActual = hoy.find(h => toHHMM(h.hora_inicio) <= horaActual && toHHMM(h.hora_fin) >= horaActual);

    if (!claseActual) {
      ocupanteEl.innerHTML = `<p style="color:#94a3b8;font-size:0.8rem;padding:4px 0;">Sin clase en este momento</p>`;
      return;
    }

    ocupanteEl.innerHTML = `
      <div class="widget-dato">
        <span class="material-symbols-outlined md-18">group</span>
        <div><p class="widget-label">GRUPO</p><p class="widget-valor">${claseActual.nombre_grupo || '-'}</p></div>
      </div>
      <div class="widget-dato">
        <span class="material-symbols-outlined md-18">person</span>
        <div><p class="widget-label">PROFESOR</p><p class="widget-valor">${claseActual.nombre_profesor || '-'}</p></div>
      </div>
      <div class="widget-dato">
        <span class="material-symbols-outlined md-18">book</span>
        <div><p class="widget-label">MATERIA</p><p class="widget-valor">${claseActual.materia || '-'}</p></div>
      </div>
      <div class="widget-dato">
        <span class="material-symbols-outlined md-18">schedule</span>
        <div><p class="widget-label">HORARIO</p><p class="widget-valor">${toHHMM(claseActual.hora_inicio)} – ${toHHMM(claseActual.hora_fin)}</p></div>
      </div>
    `;
  });

  document.getElementById('btn-horario-salon')?.addEventListener('click', async () => {
    const lista = document.getElementById('widget-horario-lista');
    if (!lista) return;
    if (lista.style.display !== 'none') { lista.style.display = 'none'; return; }

    lista.innerHTML = '<p style="text-align:center;color:#94a3b8;font-size:0.8rem;">Cargando...</p>';
    lista.style.display = 'block';

    const horario = await cargarHorarioSalon(salon.id_salon);
    if (!horario || horario.length === 0) {
      lista.innerHTML = '<p style="text-align:center;color:#94a3b8;font-size:0.8rem;">Sin horario registrado</p>';
      return;
    }

    const ordenDia = { lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5 };
    horario.sort((a, b) =>
      (ordenDia[normalizeText(a.dia)] || 99) - (ordenDia[normalizeText(b.dia)] || 99) ||
      String(a.hora_inicio).localeCompare(String(b.hora_inicio))
    );

    lista.innerHTML = horario.map(h => `
      <div style="padding:8px 0; border-bottom:1px solid #f1f5f9; font-size:0.8rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong style="color:#1e293b;">${h.dia || '-'} · ${h.nombre_grupo || '-'}</strong>
          <span style="color:#64748b;">${toHHMM(h.hora_inicio)} – ${toHHMM(h.hora_fin)}</span>
        </div>
        <div style="color:#475569;margin-top:2px;">${h.materia || '-'}</div>
        <div style="color:#94a3b8;">${h.nombre_profesor || '-'}</div>
      </div>
    `).join('');
  });
}

function ocultarWidget() {
  const widget = document.querySelector('.widget-detalle-salon');
  if (widget) widget.style.display = 'none';
  salonSeleccionado = null;
}

function conectarZoomPan() {
  if (!mapaSvg) return;

  if (zoomPanAbort) zoomPanAbort.abort();
  zoomPanAbort = new AbortController();
  const { signal } = zoomPanAbort;

  mapaSvg.addEventListener('mousedown', (e) => {
    if (e.target.closest('.sala')) return;
    panning = true;
    panStartX = e.clientX - panX;
    panStartY = e.clientY - panY;
    mapaSvg.style.cursor = 'grabbing';
  }, { signal });

  window.addEventListener('mousemove', (e) => {
    if (!panning) return;
    panX = e.clientX - panStartX;
    panY = e.clientY - panStartY;
    aplicarTransform();
  }, { signal });

  window.addEventListener('mouseup', () => {
    panning = false;
    if (mapaSvg) mapaSvg.style.cursor = 'grab';
  }, { signal });

  mapaSvg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    zoom = Math.min(4, Math.max(0.4, zoom + delta));
    aplicarTransform();
  }, { passive: false, signal });

  mapaSvg.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      panning = true;
      panStartX = e.touches[0].clientX - panX;
      panStartY = e.touches[0].clientY - panY;
    } else if (e.touches.length === 2) {
      panning = false;
      touchDist0 = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      zoom0 = zoom;
    }
  }, { passive: true, signal });

  mapaSvg.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length === 1 && panning) {
      panX = e.touches[0].clientX - panStartX;
      panY = e.touches[0].clientY - panStartY;
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      zoom = Math.min(4, Math.max(0.4, zoom0 * (dist / touchDist0)));
    }
    aplicarTransform();
  }, { passive: false, signal });

  mapaSvg.addEventListener('touchend', () => { panning = false; }, { signal });
}

function initMenuPerfil() {
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
  document.addEventListener('click', (e) => {
    if (menuPerfilUsuario && !e.target.closest('#perfil-usuario-btn') && !e.target.closest('#menu-perfil-usuario')) {
      menuPerfilUsuario.classList.remove('activo');
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  mapaCanvas = document.getElementById('mapa-canvas');

  paintSessionHeader();

  // Reloj
  const relojTiempo = document.getElementById('reloj-tiempo');
  const relojFecha = document.getElementById('reloj-fecha');
  const actualizarReloj = () => {
    const ahora = new Date();
    if (relojTiempo) relojTiempo.textContent =
      `${String(ahora.getHours()).padStart(2, '0')} : ${String(ahora.getMinutes()).padStart(2, '0')}`;
    if (relojFecha) relojFecha.textContent =
      ahora.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  };
  setInterval(actualizarReloj, 1000);
  actualizarReloj();

  initMenuPerfil();

  // Widget
  document.querySelector('.boton-cerrar-widget')?.addEventListener('click', ocultarWidget);
  document.querySelector('.widget-detalle-salon') && (document.querySelector('.widget-detalle-salon').style.display = 'none');

  // Datos
  todosLosSalones = await cargarSalones();
  await cargarOcupacionHorarioActual();

  // Pisos
  const botonesPiso = document.querySelectorAll('.selector-piso button');
  botonesPiso.forEach((btn) => {
    btn.addEventListener('click', () => {
      const piso = btn.textContent.trim();
      if (!LAYOUT_PISOS[piso]) return;
      pisoActual = piso;
      botonesPiso.forEach((b) => b.classList.remove('activo'));
      btn.classList.add('activo');
      resetTransform();
      ocultarWidget();
      renderMapa();
      actualizarConteos();
    });
  });

  const params = new URLSearchParams(window.location.search);
  const pisoParm = params.get('piso');
  if (pisoParm && LAYOUT_PISOS[pisoParm]) {
    pisoActual = pisoParm;
    botonesPiso.forEach((b) => {
      b.classList.toggle('activo', b.textContent.trim() === pisoParm);
    });
  } else {
    botonesPiso.forEach((b) => {
      b.classList.toggle('activo', b.textContent.trim() === pisoActual);
    });
  }

  // Zoom
  document.querySelectorAll('.controles-zoom button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const icon = btn.querySelector('.material-symbols-outlined')?.textContent?.trim();
      if (icon === 'add') zoom = Math.min(4, zoom + 0.2);
      else zoom = Math.max(0.4, zoom - 0.2);
      aplicarTransform();
    });
  });

  // Búsqueda
  const inputBusqueda = document.querySelector('.busqueda-mapa input');
  if (inputBusqueda) {
    inputBusqueda.addEventListener('input', () => {
      busquedaActual = inputBusqueda.value.trim();
      renderMapa();
    });
  }

  // Filtros
  const checkboxes = document.querySelectorAll('.checkbox-filtro input');
  checkboxes.forEach((cb, i) => {
    cb.addEventListener('change', () => {
      if (i === 0) filtrosActivos.aulas = cb.checked;
      if (i === 1) filtrosActivos.laboratorios = cb.checked;
      renderMapa();
    });
  });

  // Click fuera
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.widget-detalle-salon') && !e.target.closest('.sala')) {
      ocultarWidget();
    }
  });

  renderMapa();
  actualizarConteos();
});
