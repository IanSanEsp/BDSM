import {
  COLORES,
  LAYOUT_PISOS,
  keySalonName,
  normalizarEstado,
  resolveApiBase,
  stripSalonPrefix
} from './map_preG_shared.js';

const NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function getSalonNombre(row) {
  return String(row?.numero_salon || row?.nombre_salon || '').trim();
}

function keyCandidates(nombre) {
  const n = String(nombre || '').trim();
  if (!n) return [];
  const a = keySalonName(n);
  const b = keySalonName(stripSalonPrefix(n));
  return a === b ? [a] : [a, b];
}

function safeRowsFromResponse(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.salones)) return data.salones;
  if (Array.isArray(data?.rows)) return data.rows;
  return [];
}

function setupPanZoom(svg, svgW, svgH) {
  let viewX = 0;
  let viewY = 0;
  let viewW = svgW;
  let viewH = svgH;

  let lastX;
  let lastY;
  let moved = false;
  let isPanning = false;

  svg.setAttribute('viewBox', `${viewX} ${viewY} ${viewW} ${viewH}`);

  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    moved = false;
    lastX = e.clientX;
    lastY = e.clientY;
    svg.style.cursor = 'grabbing';
    e.preventDefault();

    const onMove = (e2) => {
      const dx = e2.clientX - lastX;
      const dy = e2.clientY - lastY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        moved = true;
        isPanning = true;
      }
      lastX = e2.clientX;
      lastY = e2.clientY;
      const scale = viewW / svg.getBoundingClientRect().width;
      viewX = Math.max(0, Math.min(svgW - viewW, viewX - dx * scale));
      viewY = Math.max(0, Math.min(svgH - viewH, viewY - dy * scale));
      svg.setAttribute('viewBox', `${viewX} ${viewY} ${viewW} ${viewH}`);
    };

    const onUp = () => {
      svg.style.cursor = 'grab';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setTimeout(() => {
        isPanning = false;
      }, 60);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const onWheel = (e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.14 : 0.88;
    const rect = svg.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width;
    const my = (e.clientY - rect.top) / rect.height;
    const oldW = viewW;
    const oldH = viewH;

    viewW = Math.min(svgW, Math.max(svgW * 0.12, viewW * factor));
    viewH = Math.min(svgH, Math.max(svgH * 0.12, viewH * factor));

    viewX = Math.max(0, Math.min(svgW - viewW, viewX + (oldW - viewW) * mx));
    viewY = Math.max(0, Math.min(svgH - viewH, viewY + (oldH - viewH) * my));

    svg.setAttribute('viewBox', `${viewX} ${viewY} ${viewW} ${viewH}`);
  };

  svg.addEventListener('mousedown', onMouseDown);
  svg.addEventListener('wheel', onWheel, { passive: false });

  return {
    isPanning: () => isPanning,
    moved: () => moved,
    destroy: () => {
      svg.removeEventListener('mousedown', onMouseDown);
      svg.removeEventListener('wheel', onWheel);
    }
  };
}

function ensureTooltip() {
  let tooltip = document.querySelector('.sel-tooltip');
  if (tooltip) return tooltip;

  tooltip = document.createElement('div');
  tooltip.className = 'sel-tooltip';
  document.body.appendChild(tooltip);
  return tooltip;
}

function mapEstadoToColorKey(estadoRaw) {
  const estado = normalizarEstado(estadoRaw);
  if (estado === 'Disponible') return 'Disponible';
  if (estado === 'Ocupado') return 'Ocupado';
  if (estado === 'Provisional') return 'Provisional';
  if (estado === 'Mantenimiento') return 'Mantenimiento';
  return 'default';
}

function safeHorariosFromResponse(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.horarios)) return data.horarios;
  if (Array.isArray(data?.rows)) return data.rows;
  return [];
}

export async function initSalonSelectorMap({
  rootEl,
  mapEl,
  onSelect,
  initialFloor = '1',
  availabilityContext = null
} = {}) {
  if (!rootEl || !mapEl) throw new Error('initSalonSelectorMap: faltan rootEl/mapEl');

  // Idempotente
  if (rootEl.__salonSelectorMap) return rootEl.__salonSelectorMap;

  const apiBase = resolveApiBase();

  let pisoActual = String(initialFloor);
  let salones = [];
  let panZoom = null;

  let currentAvailability = availabilityContext;
  let occupiedKeys = new Set();

  // Cargar salones desde la API (sin fallbacks a mockData)
  try {
    const res = await fetch(`${apiBase}/salones`);
    const data = await res.json();
    salones = safeRowsFromResponse(data);
  } catch (e) {
    console.error('No se pudieron cargar salones para el mapa', e);
    salones = [];
  }

  // key(nombre) -> row
  const salonPorKey = {};
  for (const row of salones) {
    const nombre = getSalonNombre(row);
    for (const k of keyCandidates(nombre)) {
      if (!k) continue;
      if (!salonPorKey[k]) salonPorKey[k] = row;
    }
  }

  async function fetchOcupadosPorRango(ctx) {
    const dia = String(ctx?.dia || '').trim();
    const hora_inicio = String(ctx?.hora_inicio || '').trim();
    const hora_fin = String(ctx?.hora_fin || '').trim();

    if (!dia || !hora_inicio || !hora_fin) return new Set();

    try {
      const qs = new URLSearchParams({ dia, hora_inicio, hora_fin });
      const res = await fetch(`${apiBase}/horarios/por-bloque?${qs.toString()}`);
      const data = await res.json();
      const horarios = safeHorariosFromResponse(data);
      const set = new Set();
      for (const h of horarios) {
        const nombreSalon = String(h?.nombre_salon || h?.numero_salon || h?.salon || '').trim();
        for (const k of keyCandidates(nombreSalon)) {
          if (k) set.add(k);
        }
      }
      return set;
    } catch (e) {
      console.warn('No se pudo cargar ocupación por rango (por-bloque)', e);
      return new Set();
    }
  }

  // Cargar ocupación inicial si viene contexto
  occupiedKeys = await fetchOcupadosPorRango(currentAvailability);

  const tooltip = ensureTooltip();

  const renderizarMapa = (piso) => {
    const layout = LAYOUT_PISOS[piso];
    if (!layout) return;

    pisoActual = String(piso);
    mapEl.innerHTML = '';

    const vb = String(layout.viewBox || '0 0 100 100').split(' ').map(Number);
    const svgW = vb[2] || 100;
    const svgH = vb[3] || 100;

    const svg = svgEl('svg', {
      viewBox: `0 0 ${svgW} ${svgH}`,
      style: 'width:100%;height:100%;display:block;cursor:grab;user-select:none;'
    });

    // Fondo
    const imgEl = svgEl('image', {
      href: layout.imagen,
      width: svgW,
      height: svgH
    });
    svg.appendChild(imgEl);

    // Habitaciones
    layout.salones.forEach((s) => {
      const salonKey = keySalonName(s.nombre);
      const salonData = salonPorKey[salonKey] || salonPorKey[keySalonName(stripSalonPrefix(s.nombre))] || null;

      const estadoNorm = normalizarEstado(salonData?.estado);
      const ocupadoPorHorario = occupiedKeys.has(salonKey) || occupiedKeys.has(keySalonName(stripSalonPrefix(s.nombre)));

      // Regla de selección:
      // - Ocupado por horario: NO seleccionable y se pinta como Ocupado
      // - Estado Ocupado/Mantenimiento: NO seleccionable
      const estadoVisualKey = ocupadoPorHorario ? 'Ocupado' : mapEstadoToColorKey(estadoNorm);
      const c = COLORES[estadoVisualKey] || COLORES.default;

      const isSelectable =
        !!salonData &&
        !ocupadoPorHorario &&
        estadoNorm !== 'Ocupado' &&
        estadoNorm !== 'Mantenimiento';

      let shape;
      if (s.puntos) {
        shape = svgEl('polygon', { points: s.puntos });
      } else {
        shape = svgEl('rect', { x: s.x, y: s.y, width: s.w, height: s.h });
      }

      shape.setAttribute('fill', c.fill);
      shape.setAttribute('fill-opacity', c.fillOpacity);
      shape.setAttribute('stroke', c.stroke);
      shape.setAttribute('stroke-width', c.strokeWidth);
      shape.setAttribute('rx', '4');
      shape.style.cursor = isSelectable ? 'pointer' : 'default';
      shape.style.transition = 'fill-opacity 0.15s, stroke-width 0.15s';

      if (salonData) {
        shape.addEventListener('mouseenter', (e) => {
          if (panZoom?.isPanning()) return;
          shape.setAttribute('fill-opacity', '0.5');
          shape.setAttribute('stroke-width', String(c.strokeWidth * 2));
          const estadoLabel = ocupadoPorHorario
            ? 'Ocupado (horario)'
            : salonData.estado || 'Sin estado';
          tooltip.textContent = `${s.nombre} — ${estadoLabel}`;
          tooltip.style.display = 'block';
          tooltip.style.left = e.clientX + 'px';
          tooltip.style.top = e.clientY + 'px';
        });

        shape.addEventListener('mousemove', (e) => {
          tooltip.style.left = e.clientX + 'px';
          tooltip.style.top = e.clientY + 'px';
        });

        shape.addEventListener('mouseleave', () => {
          shape.setAttribute('fill-opacity', String(c.fillOpacity));
          shape.setAttribute('stroke-width', String(c.strokeWidth));
          tooltip.style.display = 'none';
        });

        if (isSelectable) {
          shape.addEventListener('click', (e) => {
            e.stopPropagation();
            // Evitar clicks fantasmas al panear
            if (panZoom?.isPanning()) return;
            if (panZoom?.moved()) return;
            tooltip.style.display = 'none';
            onSelect?.({
              id_salon: salonData.id_salon,
              numero_salon: getSalonNombre(salonData),
              piso: salonData.piso,
              raw: salonData,
              layout: s
            });
          });
        }
      }

      svg.appendChild(shape);
    });

    // Pan/zoom
    if (panZoom?.destroy) panZoom.destroy();
    panZoom = setupPanZoom(svg, svgW, svgH);

    mapEl.appendChild(svg);

    // Leyenda
    const leyenda = document.createElement('div');
    leyenda.className = 'leyenda-mapa';
    leyenda.innerHTML = `
      <div class="leyenda-item"><div class="leyenda-dot" style="background:${COLORES.Disponible.fill};"></div><span>Disponible</span></div>
      <div class="leyenda-item"><div class="leyenda-dot" style="background:${COLORES.Ocupado.fill};"></div><span>Ocupado</span></div>
      <div class="leyenda-item"><div class="leyenda-dot" style="background:${COLORES.Provisional.fill};"></div><span>Provisional</span></div>
      <div class="leyenda-item"><div class="leyenda-dot" style="background:${COLORES.Mantenimiento.fill};"></div><span>Mantenimiento</span></div>
    `;
    mapEl.appendChild(leyenda);
  };

  // Botones de piso
  const floorButtons = [...rootEl.querySelectorAll('.btn-piso')];
  const setActiveFloorButton = (piso) => {
    floorButtons.forEach((b) => b.classList.toggle('activo', b.getAttribute('data-piso') === String(piso)));
  };

  const onFloorClick = (e) => {
    const piso = e.currentTarget?.getAttribute('data-piso');
    if (!piso) return;
    setActiveFloorButton(piso);
    renderizarMapa(piso);
  };

  floorButtons.forEach((b) => b.addEventListener('click', onFloorClick));

  // Render inicial
  setActiveFloorButton(pisoActual);
  renderizarMapa(pisoActual);

  const api = {
    render: renderizarMapa,
    setAvailabilityContext: async (ctx) => {
      currentAvailability = ctx;
      occupiedKeys = await fetchOcupadosPorRango(currentAvailability);
      renderizarMapa(pisoActual);
    },
    isSalonOcupadoEnRango: (nombreSalon) => {
      const keys = keyCandidates(nombreSalon);
      return keys.some((k) => occupiedKeys.has(k));
    },
    destroy: () => {
      floorButtons.forEach((b) => b.removeEventListener('click', onFloorClick));
      if (panZoom?.destroy) panZoom.destroy();
      // Tooltip se deja como singleton
    }
  };

  rootEl.__salonSelectorMap = api;
  return api;
}
