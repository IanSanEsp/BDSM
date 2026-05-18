import { 
  salones, 
  horario_fijo, 
  materias, 
  profesores, 
  grupos,
  usuarios,
  horario_dinamico,
  ausencias_profesor
} from './mockData.js';

import {
  COLORES,
  DEFAULT_API_URL,
  LAYOUT_PISOS,
  clearSession,
  paintSessionHeader,
  keySalonName,
  normalizarEstado,
  resolveApiBase,
  stripSalonPrefix
} from './map_preG_shared.js';

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

  const NS = 'http://www.w3.org/2000/svg';
  let apiBase = resolveApiBase();

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

  async function cargarSalonesPreview(piso) {
    const pisoDb = piso === 'L' ? '0' : String(piso);
    try {
      const res = await fetch(`${apiBase}/salones?piso=${encodeURIComponent(pisoDb)}`);
      const data = await res.json();
      const rows = Array.isArray(data) ? data : (data.salones || data.rows || []);
      return rows;
    } catch (e) {
      if (apiBase !== DEFAULT_API_URL) {
        try {
          const res2 = await fetch(`${DEFAULT_API_URL}/salones?piso=${encodeURIComponent(pisoDb)}`);
          const data2 = await res2.json();
          const rows2 = Array.isArray(data2) ? data2 : (data2.salones || data2.rows || []);
          apiBase = DEFAULT_API_URL;
          return rows2;
        } catch {
          // yano se q hize con tanto try catch (q no lo vea niño)
          return null;
        }
      }
    }

    // fallback: mock data (mantiene el dashboard útil sin backend)
    return salones.filter(s => String(s.piso) === String(piso));
  }

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

    const rows = await cargarSalonesPreview(pisoActual);

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
      const estado =
        nameKeysForMatch(s.nombre)
          .map(k => estadoPorKey.get(k))
          .find(Boolean) || 'default';
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
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sábado'];
    return dias[new Date().getDay()];
  };

  // Estadisticas del gauge (fumadota TOTAL)
  // Q mrd es un gauge -wenazo
  const totalAulasNum = document.getElementById('total-aulas-num');
  const resumenDisponibles = document.getElementById('resumen-disponibles');
  const resumenOcupadas = document.getElementById('resumen-ocupadas');
  const resumenProvisionales = document.getElementById('resumen-provisionales');
  const resumenMantenimiento = document.getElementById('resumen-mantenimiento');

  const renderizarEstadisticas = () => { // Filtrar salones por piso
    const salonesPiso = salones.filter(s => s.piso === pisoActual);
    const total = salonesPiso.length;
    
    const stats = { // Contar cada estado
      disponibles: salonesPiso.filter(s => s.estado === 'Disponible').length,
      ocupadas: salonesPiso.filter(s => s.estado === 'Ocupado').length,
      provisionales: salonesPiso.filter(s => s.estado === 'Provisional').length,
      mantenimiento: salonesPiso.filter(s => s.estado === 'Mantenimiento').length
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

  const renderizarSalones = () => { // Filtrar salones por piso
    if (!listaSalonesContenedor) return;

    const salonesPiso = salones.filter(s => s.piso === pisoActual);
    const diaActual = obtenerDiaActual();
    const bloqueActualId = obtenerBloqueActualId();
    
    listaSalonesContenedor.innerHTML = '';

    salonesPiso.forEach(salon => {
      // Buscar horario actual basado en tiempo real
      const horarioActual = horario_fijo.find(h => 
        h.id_salon === salon.id_salon && 
        h.dia === diaActual && 
        h.bloque_horario === bloqueActualId
      );

      const materia = horarioActual ? materias.find(m => m.id_materia === horarioActual.id_materia) : null;
      const profesor = horarioActual ? usuarios.find(u => u.id_usuarios === horarioActual.id_profesor) : null;
      const grupo = horarioActual ? grupos.find(g => g.id_grupo === horarioActual.id_grupo) : null;

      //  Determinar estado visual del salon (puede cambiar temporalmente si hay horario)
      let estadoVisual = salon.estado.toLowerCase();
      if (horarioActual && estadoVisual === 'disponible') {
        estadoVisual = 'ocupado';
      } else if (!horarioActual && estadoVisual === 'ocupado') {
        estadoVisual = 'disponible';
      }

      const tr = document.createElement('tr'); // Crear fila para el salón
      tr.innerHTML = `
        <td>
          <div class="salon-id-celda ${estadoVisual}">
            <span class="punto-estado ${estadoVisual}"></span>
            <span>${salon.numero_salon}</span>
          </div>
        </td>
        <td>
          <span class="grupo-celda">${grupo ? grupo.nombre_grupo : '----'}</span>
        </td>
        <td>
          <div class="materia-profesor-celda">
            <span class="materia-nombre">${materia ? materia.nombre_materia : '-- --'}</span>
            <span class="profesor-nombre">${profesor ? profesor.nombre : '----'}</span>
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

      // Click en la fila para ver horario completo
      tr.addEventListener('click', (e) => {
        if (!e.target.closest('.contenedor-menu-kebab')) {
          abrirModalHorario(salon);
        }
      });

      // Logica del menu kebab ñam
      const btnKebab = tr.querySelector('.boton-kebab');
      const menuKebab = tr.querySelector('.menu-desplegable');
      const btnIncidencia = tr.querySelector('.btn-incidencia');
      const btnMantenimiento = tr.querySelector('.btn-mantenimiento');

      btnKebab.addEventListener('click', (e) => {
        e.stopPropagation();
        // Cerrar otros menus abiertos
        document.querySelectorAll('.menu-desplegable.activo').forEach(m => {
          if (m !== menuKebab) m.classList.remove('activo');
        });
        menuKebab.classList.toggle('activo');
      });

      btnIncidencia.addEventListener('click', (e) => { // Abrir modal de incidencia con contexto del horario actual
        e.stopPropagation();
        menuKebab.classList.remove('activo');
        abrirModalIncidencia(salon, horarioActual);
      });

      btnMantenimiento.addEventListener('click', (e) => { // Esto lo tienes que cambiar ian (orita n hace nada)
        e.stopPropagation();
        menuKebab.classList.remove('activo');
        alert(`Cambiando salón ${salon.numero_salon} a estado de mantenimiento (Simulación)`);
      });

      listaSalonesContenedor.appendChild(tr); // Agregar la fila al contenedor de la tabla
    });

    if (conteoSalonesPiso) {
      conteoSalonesPiso.textContent = `Mostrando ${salonesPiso.length} de ${salonesPiso.length} salones en este piso.`; // Total de salones por piso (cambialo si ocupas)
    }
  };

  // Modal Horario de Salo
  const modalHorario = document.getElementById('modal-horario-salon');
  const cerrarModalBtn = document.getElementById('cerrar-modal-horario');
  const tituloModal = document.getElementById('titulo-modal-horario');
  const cuerpoTablaHorario = document.getElementById('cuerpo-tabla-horario-salon');
  const selectorDiaModal = document.getElementById('selector-dia-modal');

  let salonSeleccionado = null; 
  let diaSeleccionadoModal = 'Lunes';

  const actualizarTablaHorarioModal = () => { // Llena la tabla del modal de horario basado en el salon y dia seleccionado
    if (!salonSeleccionado || !cuerpoTablaHorario) return;

    cuerpoTablaHorario.innerHTML = '';

    bloquesHorarios.forEach(bloque => { // Para cada bloque horario, buscar si hay una clase programada en el horario fijo para salon
      const h = horario_fijo.find(h => 
        h.id_salon === salonSeleccionado.id_salon && 
        h.dia === diaSeleccionadoModal && 
        h.bloque_horario === bloque.id
      );

      const fila = document.createElement('tr'); // Crear fila para el bloque horario
      if (h) {
        const materia = materias.find(m => m.id_materia === h.id_materia);
        const profesor = usuarios.find(u => u.id_usuarios === h.id_profesor);
        const grupo = grupos.find(g => g.id_grupo === h.id_grupo);
        
        // Si hay clase programada, mostrar info de materia, profesor y grupo
        fila.innerHTML = `
          <td><strong>${bloque.hora}</strong></td>
          <td>${grupo?.nombre_grupo || '-'}</td>
          <td>${materia?.nombre_materia || '-'}</td>
          <td>${profesor?.nombre || '-'}</td>
        `;
      } else { // Si no hay clase programada, mostrar "Sin clase"
        fila.innerHTML = `
          <td><strong>${bloque.hora}</strong></td>
          <td colspan="3" style="color: #9ca3af; font-style: italic;">Sin clase</td>
        `;
      }
      cuerpoTablaHorario.appendChild(fila);
    });
  };

  const abrirModalHorario = (salon) => { // Abrir modal de horario para el salón seleccionado
    if (!modalHorario) return;
    
    salonSeleccionado = salon;
    tituloModal.textContent = `Horario de Salón ${salon.numero_salon}`;
    
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
  let horarioActualEnWidget = null;

  const abrirModalIncidencia = (salon, horario) => {
    if (!modalRegistrarIncidencia) return;
    horarioActualEnWidget = horario || null;
    // Resetear formulario y estados
    if (formRegistrarIncidencia) formRegistrarIncidencia.reset();
    if (incHoraContainer) incHoraContainer.classList.add('oculto');
    if (incProfesorContainer) incProfesorContainer.classList.add('oculto');
    if (incProfesorEl) {
      incProfesorEl.innerHTML = '<option value="">Seleccionar Profesor</option>';
      if (horarioActualEnWidget) {
        const prof = usuarios.find(u => u.id_usuarios === horarioActualEnWidget.id_profesor);
        const profAux = usuarios.find(u => u.id_usuarios === horarioActualEnWidget.id_profesor_aux);
        if (prof) {
          const o = document.createElement('option'); o.value = prof.id_usuarios; o.textContent = prof.nombre + ' (Titular)';
          incProfesorEl.appendChild(o);
        }
        if (profAux) {
          const o2 = document.createElement('option'); o2.value = profAux.id_usuarios; o2.textContent = profAux.nombre + ' (Auxiliar)';
          incProfesorEl.appendChild(o2);
        }
      }
    }
    const btnQrInit = document.getElementById('btn-codigo-qr');
    if (btnQrInit) btnQrInit.classList.add('oculto');
    modalRegistrarIncidencia.classList.add('activo');
  };

  if (cerrarModalRegistrar) {
    cerrarModalRegistrar.addEventListener('click', () => {
      if (modalRegistrarIncidencia) modalRegistrarIncidencia.classList.remove('activo');
    });
  }

  if (incTipoEl) { // Mostrar campos adicionales según tipo de incidencia
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

  if (formRegistrarIncidencia) { // Logica de registro de incidencia (tienes que cambiarlo pa que si furule el backen)
    formRegistrarIncidencia.addEventListener('submit', (e) => {
      e.preventDefault();
      const tipo = incTipoEl?.value || '';
      const horaRegistro = incHoraEl?.value || null;
      const contexto = incContextoEl?.value || '';
      const profesorSeleccionado = incProfesorEl?.value || null;

      if (!tipo) { alert('Selecciona un tipo de incidencia'); return; }

      const incObj = { // lo que se enviaria al backend para registrar la incidencia, orita solo lo loguea en consola
        tipo,
        hora: horaRegistro,
        contexto,
        profesor_ausente_id: profesorSeleccionado,
        horario: horarioActualEnWidget ? { id_grupo: horarioActualEnWidget.id_grupo, id_materia: horarioActualEnWidget.id_materia, id_profesor: horarioActualEnWidget.id_profesor, id_profesor_aux: horarioActualEnWidget.id_profesor_aux, bloque: horarioActualEnWidget.bloque_horario, hora_inicio: horarioActualEnWidget.hora_inicio } : null,
        creado_en: new Date().toISOString()
      };

      console.log('Incidencia registrada (sim):', incObj);
      alert('Incidencia registrada (simulación)');
      if (modalRegistrarIncidencia) modalRegistrarIncidencia.classList.remove('activo');
      if (formRegistrarIncidencia) formRegistrarIncidencia.reset();
    });
  }

  // Modal QR, solo controlers
  const modalCodigoQr = document.getElementById('modal-codigo-qr');
  const btnCodigoQr = document.getElementById('btn-codigo-qr');
  const cerrarModalCodigoQr = document.getElementById('cerrar-modal-codigo-qr');

  if (btnCodigoQr && modalCodigoQr) {
    btnCodigoQr.addEventListener('click', () => {
      modalCodigoQr.classList.add('activo');
    });
  }

  if (cerrarModalCodigoQr) {
    cerrarModalCodigoQr.addEventListener('click', () => {
      if (modalCodigoQr) modalCodigoQr.classList.remove('activo');
    });
  }

  // Cerrar modales al hacer click fuera de ellos
  window.addEventListener('click', (e) => {
    if (e.target === modalRegistrarIncidencia) modalRegistrarIncidencia.classList.remove('activo');
    if (e.target === modalCodigoQr) modalCodigoQr.classList.remove('activo');
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

  // Render de alertas (esto cambiale a lo que ocupes)
  const obtenerPisoDeAlerta = (alerta) => {
    if (alerta.id_grupo) { // Ausencia
      const hf = horario_fijo.find(h => h.id_grupo === alerta.id_grupo);
      if (hf) {
        const salon = salones.find(s => s.id_salon === hf.id_salon);
        return salon?.piso;
      }
    } else if (alerta.id_horario_fijo) { 
      const hf = horario_fijo.find(h => h.id_horario_fijo === alerta.id_horario_fijo);
      if (hf) {
        const salon = salones.find(s => s.id_salon === hf.id_salon);
        return salon?.piso;
      }
    }
    return null;
  };

  const crearTarjetaAlerta = (alerta, tipo) => { // Crea la tarjeta (cambialo para que se adapte)
    const div = document.createElement('div');
    div.className = 'tarjeta-alerta';
    
    if (tipo === 'ausencia') {
      const profesor = usuarios.find(u => u.id_usuarios === alerta.id_profesor);
      const grupo = grupos.find(g => g.id_grupo === alerta.id_grupo);
      div.innerHTML = `
        <div class="alerta-icono error">
          <span class="material-symbols-outlined md-20">person_off</span>
        </div>
        <div class="alerta-texto">
          <p>Ausencia: ${profesor?.nombre || 'Profesor'}</p>
          <p>Grupo ${grupo?.nombre_grupo || 'G'} • ${alerta.hora}</p>
          <p>Acción: ${alerta.accion_tomada}</p>
        </div>
      `;
    } else {
      const hf = horario_fijo.find(h => h.id_horario_fijo === alerta.id_horario_fijo); // Busca el horario fijo relacionado para mostrar info contextual
      const grupo = grupos.find(g => g.id_grupo === hf?.id_grupo);
      div.innerHTML = `
        <div class="alerta-icono advertencia">
          <span class="material-symbols-outlined md-20">warning</span>
        </div>
        <div class="alerta-texto">
          <p>Cambio/Adelanto: ${alerta.motivo_cambio}</p>
          <p>Grupo ${grupo?.nombre_grupo || 'G'} • ${alerta.hora_inicio}</p>
        </div>
      `;
    }
    return div;
  };


// Llena el widget de alertas, filtrando por piso
  const renderizarAlertas = () => {
    const contenedor = document.getElementById('lista-reportes-dashboard');
    if (!contenedor) return;

    contenedor.innerHTML = '';

    // Filtrar ausencias por piso
    const ausenciasFiltradas = ausencias_profesor.filter(a => obtenerPisoDeAlerta(a) === pisoActual);
    ausenciasFiltradas.forEach(ausencia => {
      contenedor.appendChild(crearTarjetaAlerta(ausencia, 'ausencia'));
    });

    // Filtrar cambios por piso
    const cambiosFiltrados = horario_dinamico.filter(c => obtenerPisoDeAlerta(c) === pisoActual);
    cambiosFiltrados.forEach(cambio => {
      contenedor.appendChild(crearTarjetaAlerta(cambio, 'cambio'));
    });

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
    const hoy = new Date().toISOString().split('T')[0];
    if (fechaStr === hoy) return 'Hoy';
    
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    if (fechaStr === ayer.toISOString().split('T')[0]) return 'Ayer';

    const opciones = { weekday: 'long', day: 'numeric', month: 'long' };
    const fecha = new Date(fechaStr + 'T00:00:00');
    return fecha.toLocaleDateString('es-ES', opciones);
  };

  const abrirModalAlertas = () => {
    if (!modalAlertas || !cuerpoModalAlertas) return;
    
    cuerpoModalAlertas.innerHTML = '';
    
    // En el historial mostramos todas las del piso seleccionado
    const ausenciasFiltradas = ausencias_profesor.filter(a => obtenerPisoDeAlerta(a) === pisoActual);
    const cambiosFiltrados = horario_dinamico.filter(c => obtenerPisoDeAlerta(c) === pisoActual);

    // Agrupar por fecha para el diseño del historial
    const todasLasAlertas = [
      ...ausenciasFiltradas.map(a => ({ ...a, tipo: 'ausencia' })),
      ...cambiosFiltrados.map(c => ({ ...c, tipo: 'cambio' }))
    ].sort((a, b) => b.fecha.localeCompare(a.fecha));

    const alertasPorFecha = {};
    todasLasAlertas.forEach(alerta => {
      if (!alertasPorFecha[alerta.fecha]) alertasPorFecha[alerta.fecha] = [];
      alertasPorFecha[alerta.fecha].push(alerta);
    });

    Object.keys(alertasPorFecha).forEach(fecha => {
      const separador = document.createElement('div');
      separador.className = 'separador-fecha';
      
      const hoy = new Date().toISOString().split('T')[0];
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

  // Renderizado inicial
  renderizarSalones();
  renderizarAlertas();
  renderizarEstadisticas();
  
  setInterval(actualizarReloj, 1000);
  actualizarReloj();
});
