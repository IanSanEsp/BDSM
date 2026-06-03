import {
  clearSession,
  paintSessionHeader,
  resolveApiBase,
  DEFAULT_API_URL,
  getSessionToken,
  getLocalDateISO
} from './map_preG_shared.js';

document.addEventListener('DOMContentLoaded', () => {
  paintSessionHeader();

  const apiBase = resolveApiBase() || DEFAULT_API_URL;

  const elementoReloj = document.getElementById('reloj-tiempo');
  const elementoFecha = document.getElementById('reloj-fecha');
  if (elementoReloj || elementoFecha) {
    const actualizarTiempo = () => {
      const ahora = new Date();
      if (elementoReloj) {
        const horas = String(ahora.getHours()).padStart(2, '0');
        const minutos = String(ahora.getMinutes()).padStart(2, '0');
        elementoReloj.textContent = `${horas} : ${minutos}`;
      }
      if (elementoFecha) {
        const opciones = { weekday: 'long', day: 'numeric', month: 'long' };
        let fechaTexto = ahora.toLocaleDateString('es-ES', opciones);
        fechaTexto = fechaTexto.charAt(0).toUpperCase() + fechaTexto.slice(1);
        elementoFecha.textContent = fechaTexto;
      }
    };
    actualizarTiempo();
    setInterval(actualizarTiempo, 1000);
  }

  const bloquesHorarios = [
    { id: 1, hora: '07:00 - 07:50' },
    { id: 2, hora: '08:00 - 08:50' },
    { id: 3, hora: '09:00 - 09:50' },
    { id: 4, hora: '10:00 - 10:50' },
    { id: 5, hora: '11:00 - 11:50' },
    { id: 6, hora: '12:00 - 12:50' },
    { id: 7, hora: '13:00 - 13:50' },
    { id: 8, hora: '14:00 - 14:50' },
    { id: 9, hora: '15:00 - 15:50' },
    { id: 10, hora: '16:00 - 16:50' },
    { id: 11, hora: '17:00 - 17:50' },
    { id: 12, hora: '18:00 - 18:50' },
    { id: 13, hora: '19:00 - 19:50' },
    { id: 14, hora: '20:00 - 20:50' }
  ];

  let salonesData = [];
  let tablaDinamicaRows = [];
  let incidenciasRows = [];
  const horariosFijosPorSalon = new Map();

  let pisoSeleccionado = null; // 'L','1','2','3'
  let salonSeleccionado = null;
  let diaSeleccionadoModal = 'Lunes';

  const pisosOrdenados = (pisos) =>
    [...pisos].sort((a, b) => {
      if (a === 'L') return -1;
      if (b === 'L') return 1;
      return Number(a) - Number(b);
    });

  const pisoLabelFromDb = (pisoDb) => (Number(pisoDb) === 0 ? 'L' : String(Number(pisoDb)));
  const pisoDbFromLabel = (pisoLabel) => (String(pisoLabel) === 'L' ? 0 : Number(pisoLabel));

  const yyyyMmDdHoyReal = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const fechaParaTablaDinamica = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const parseTimeToMinutes = (t) => {
    const raw = String(t || '').trim();
    if (!raw) return null;
    const parts = raw.split(':').map((x) => Number(x));
    const hh = parts[0];
    const mm = parts[1];
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    return hh * 60 + mm;
  };

  const BLOQUES_INTERVALOS = bloquesHorarios.map((b) => {
    const [ini, fin] = String(b.hora)
      .split('-')
      .map((s) => s.trim());
    return {
      id: b.id,
      startMin: parseTimeToMinutes(ini),
      endMin: parseTimeToMinutes(fin)
    };
  });

  function blocksCoveredByRange(horaInicio, horaFin) {
    const start = parseTimeToMinutes(horaInicio);
    const end = parseTimeToMinutes(horaFin);
    if (start === null || end === null) return [];
    // usar [start, end) para no “comerse” el bloque siguiente cuando termina exacto
    return BLOQUES_INTERVALOS.filter((b) => start < b.endMin && end > b.startMin).map((b) => b.id);
  }

  async function fetchJson(path, { method = 'GET', body, auth = false } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth) {
      const token = getSessionToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(`${apiBase}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    const ct = res.headers.get('content-type') || '';
    const payload = ct.includes('application/json') ? await res.json().catch(() => null) : await res.text().catch(() => null);
    if (!res.ok) {
      const msg = payload?.error || payload?.message || (typeof payload === 'string' ? payload : null) || `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      err.payload = payload;
      throw err;
    }
    return payload;
  }

  function normalizarSalonApi(row) {
    return {
      id_salon: row.id_salon,
      numero_salon: row.nombre_salon,
      piso: pisoLabelFromDb(row.piso),
      tipo: row.nombre_tipo_salon || '',
      estado: row.estado || 'Disponible'
    };
  }

  function estadoClaseCss(estadoRaw) {
    const estadoNorm = String(estadoRaw || '').toLowerCase();
    let claseEstado = 'disponible';
    if (estadoNorm.includes('ocup')) claseEstado = 'ocupado';
    if (estadoNorm.includes('provi')) claseEstado = 'provisional';
    if (estadoNorm.includes('mante')) claseEstado = 'mantenimiento';
    return claseEstado;
  }

  function normalizeDateKey(raw) {
    if (!raw) return null;
    if (raw instanceof Date) {
      if (Number.isNaN(raw.getTime())) return null;
      return getLocalDateISO(raw);
    }

    const s = String(raw).trim();
    if (!s) return null;

    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];

    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return getLocalDateISO(d);
    return s;
  }

  function clasificarEventoPorMotivo(motivo) {
    const m = String(motivo || '').toLowerCase();
    // Amarillo: adelanto de clase
    if (m.includes('adelant')) return 'advertencia';
    // Rojo: cancelación / suspensión
    if (m.includes('cancel') || m.includes('cancela') || m.includes('suspend') || m.includes('sin clase')) return 'error';
    // Vino: normal
    return 'exito';
  }

  function esAusenciaProfesor(accionTomada) {
    const a = String(accionTomada || '').trim().toLowerCase();
    return a === 'ausencia - profesor' || a.startsWith('ausencia');
  }

  function keyGrupo(grupo) {
    return String(grupo || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  function formatearFechaEtiqueta(cadenaFecha) {
    const norm = normalizeDateKey(cadenaFecha);
    if (!norm) return 'Sin fecha';

    const hoy = yyyyMmDdHoyReal();
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    const ayerStr = `${ayer.getFullYear()}-${String(ayer.getMonth() + 1).padStart(2, '0')}-${String(ayer.getDate()).padStart(2, '0')}`;
    if (norm === hoy) return 'Hoy';
    if (norm === ayerStr) return 'Ayer';
    const opciones = { weekday: 'long', day: 'numeric', month: 'long' };
    const fecha = new Date(`${norm}T00:00:00`);
    if (Number.isNaN(fecha.getTime())) return String(norm);
    return fecha.toLocaleDateString('es-ES', opciones);
  }

  function getSalonesFiltrados() {
    return salonesData.filter((s) => s.piso === pisoSeleccionado);
  }

  function construirEventosPorSalon() {
    const porSalon = new Map();

    const fechaKey = normalizeDateKey(fechaParaTablaDinamica());
    const ausenciasIndex = new Set(
      (incidenciasRows || [])
        .filter((a) => normalizeDateKey(a.fecha) === fechaKey)
        .filter((a) => esAusenciaProfesor(a.accion_tomada))
        .map((a) => `${keyGrupo(a.nombre_grupo)}|${String(a.hora || '').slice(0, 5)}`)
    );

    for (const r of tablaDinamicaRows || []) {
      const idSalonDestino = r.id_salon_temporal ?? r.id_salon;
      if (!idSalonDestino) continue;

      const horaInicio = r.hora_inicio_temp || r.hora_inicio;
      const horaFin = r.hora_fin_temp || r.hora_fin;
      const blocks = blocksCoveredByRange(horaInicio, horaFin);

      const horaInicioKey = String(horaInicio || '').slice(0, 5);
      const grupoKey = keyGrupo(r.nombre_grupo);
      const hayAusenciaProfesor = fechaKey && grupoKey && horaInicioKey && ausenciasIndex.has(`${grupoKey}|${horaInicioKey}`);

      const fallbackBloque = Number(r.bloque_horario);
      const blocksFinal = blocks.length ? blocks : fallbackBloque ? [fallbackBloque] : [];
      if (!blocksFinal.length) continue;

      const startBlock = Math.min(...blocksFinal.map(Number));
      const endBlock = Math.max(...blocksFinal.map(Number));
      const span = Math.max(1, endBlock - startBlock + 1);

      const ev = {
        startBlock,
        span,
        nombre_grupo: r.nombre_grupo,
        nombre_profesor: r.nombre_profesor,
        esDinamico: !!r.id_horario_dinamico,
        variante: hayAusenciaProfesor ? 'error' : r.id_horario_dinamico ? clasificarEventoPorMotivo(r.motivo) : 'exito'
      };

      if (!porSalon.has(idSalonDestino)) porSalon.set(idSalonDestino, []);
      porSalon.get(idSalonDestino).push(ev);
    }

    // ordenar y resolver colisiones por bloque inicio (preferir dinámico)
    for (const [id, arr] of porSalon.entries()) {
      arr.sort((a, b) => a.startBlock - b.startBlock);
      const byStart = new Map();
      for (const ev of arr) {
        const k = Number(ev.startBlock);
        if (!byStart.has(k)) {
          byStart.set(k, ev);
          continue;
        }
        const prev = byStart.get(k);
        if (!prev.esDinamico && ev.esDinamico) byStart.set(k, ev);
      }
      porSalon.set(id, [...byStart.values()].sort((a, b) => a.startBlock - b.startBlock));
    }

    return porSalon;
  }

  function getCambiosDeSalonDesdeTabla() {
    const fechaRaw = fechaParaTablaDinamica();
    const fecha = normalizeDateKey(fechaRaw) || fechaRaw;
    const cambios = [];
    for (const r of tablaDinamicaRows || []) {
      if (!r.id_horario_dinamico) continue;
      if (!r.id_salon_temporal) continue;
      if (Number(r.id_salon_temporal) === Number(r.id_salon)) continue;
      const salonTemp = salonesData.find((s) => Number(s.id_salon) === Number(r.id_salon_temporal));
      cambios.push({
        tipo: 'cambio',
        fecha,
        hora: String(r.hora_inicio_temp || r.hora_inicio || '').slice(0, 5),
        nombre_grupo: r.nombre_grupo,
        motivo: r.motivo || '',
        salon_temporal: salonTemp?.numero_salon || ''
      });
    }
    return cambios;
  }

  function getIncidenciasDesdeAusencias() {
    return (incidenciasRows || []).map((a) => ({
      tipo: 'incidencia',
      fecha: normalizeDateKey(a.fecha) || '',
      hora: String(a.hora || '').slice(0, 5),
      nombre_profesor: a.nombre_profesor || '',
      nombre_grupo: a.nombre_grupo || '',
      accion_tomada: a.accion_tomada || ''
    }));
  }

  function renderizarTabla() {
    const cuerpoTabla = document.getElementById('cuerpo-tabla-horarios');
    if (!cuerpoTabla) return;
    cuerpoTabla.innerHTML = '';

    const salonesFiltrados = getSalonesFiltrados();
    const eventosPorSalon = construirEventosPorSalon();

    salonesFiltrados.forEach((salon) => {
      const fila = document.createElement('tr');

      const tdSalon = document.createElement('td');
      tdSalon.className = 'columna-grupo';
      tdSalon.textContent = salon.numero_salon;
      fila.appendChild(tdSalon);

      const eventos = eventosPorSalon.get(salon.id_salon) || [];
      const eventoPorInicio = new Map(eventos.map((ev) => [Number(ev.startBlock), ev]));
      const celdasCubiertas = new Set();

      bloquesHorarios.forEach((bloque, index) => {
        if (celdasCubiertas.has(index)) return;

        const td = document.createElement('td');
        const ev = eventoPorInicio.get(Number(bloque.id));

        if (ev) {
          const span = Math.max(1, Math.min(Number(ev.span) || 1, bloquesHorarios.length - index));
          if (span > 1) {
            td.colSpan = span;
            for (let i = 1; i < span; i++) celdasCubiertas.add(index + i);
          }

          let claseColor = 'celda-exito';
          if (ev.variante === 'advertencia') claseColor = 'celda-advertencia';
          if (ev.variante === 'error') claseColor = 'celda-error';

          const divCelda = document.createElement('div');
          divCelda.className = `celda-horario ${claseColor}`;
          divCelda.innerHTML = `
            <p class="materia-nombre">${ev.nombre_grupo || 'Grupo'}</p>
            <p class="profesor-nombre">${ev.nombre_profesor || 'Profesor'}</p>
          `;
          td.appendChild(divCelda);
        } else {
          const divVacia = document.createElement('div');
          divVacia.className = 'celda-vacia';
          divVacia.textContent = 'Sin Asignación';
          td.appendChild(divVacia);
        }

        fila.appendChild(td);
      });

      cuerpoTabla.appendChild(fila);
    });
  }

  function renderizarListaSalones() {
    const tbody = document.getElementById('lista-salones-widget');
    if (!tbody) return;
    tbody.innerHTML = '';

    const salonesFiltrados = getSalonesFiltrados();
    salonesFiltrados.forEach((s) => {
      const tr = document.createElement('tr');

      const claseEstado = estadoClaseCss(s.estado);
      const tdSalon = document.createElement('td');
      tdSalon.innerHTML = `<div class="salon-id-celda ${claseEstado}"><span class="punto-estado ${claseEstado}"></span>${s.numero_salon}</div>`;
      tr.appendChild(tdSalon);

      tr.style.cursor = 'pointer';
      tr.addEventListener('click', (e) => {
        if (!e.target.closest('.contenedor-menu-kebab')) abrirModalHorario(s);
      });

      const tdPiso = document.createElement('td');
      tdPiso.textContent = s.piso;
      tr.appendChild(tdPiso);

      const tdTipo = document.createElement('td');
      tdTipo.textContent = s.tipo || '';
      tr.appendChild(tdTipo);

      const tdAcc = document.createElement('td');
      tdAcc.className = 'acciones-celda';
      tdAcc.innerHTML = `
        <div class="contenedor-menu-kebab">
          <button class="boton-kebab" style="background:none;border:none;cursor:pointer;color:#94a3b8;display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;transition:background 0.2s;">
            <span class="material-symbols-outlined">more_vert</span>
          </button>
          <div class="menu-desplegable">
            <button class="opcion-menu btn-fijar">
              <span class="material-symbols-outlined md-18">push_pin</span>
              <span>Fijar</span>
            </button>
            <button class="opcion-menu btn-mantenimiento">
              <span class="material-symbols-outlined md-18">build</span>
              <span>Estado mantenimiento</span>
            </button>
          </div>
        </div>
      `;
      tr.appendChild(tdAcc);

      const btnKebab = tdAcc.querySelector('.boton-kebab');
      const menuKebab = tdAcc.querySelector('.menu-desplegable');
      const btnFijar = tdAcc.querySelector('.btn-fijar');
      const btnMant = tdAcc.querySelector('.btn-mantenimiento');

      btnKebab.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.menu-desplegable.activo').forEach((m) => {
          if (m !== menuKebab) m.classList.remove('activo');
        });
        menuKebab.classList.toggle('activo');
      });

      btnFijar.addEventListener('click', (e) => {
        e.stopPropagation();
        menuKebab.classList.remove('activo');
        const estaFijada = tr.classList.toggle('fila-fijada');
        btnFijar.querySelector('span:last-child').textContent = estaFijada ? 'Fijado' : 'Fijar';
        if (estaFijada) tbody.insertBefore(tr, tbody.firstChild);
      });

      btnMant.addEventListener('click', async (e) => {
        e.stopPropagation();
        menuKebab.classList.remove('activo');

        const token = getSessionToken();
        if (!token) {
          mostrarTostada({ titulo: 'Error', mensaje: 'No hay sesión activa. Inicia sesión otra vez.', tipo: 'error' });
          return;
        }

        const actual = String(s.estado || 'Disponible');
        const nuevoEstado = actual === 'En Mantenimiento' ? 'Disponible' : 'En Mantenimiento';

        try {
          await fetchJson(`/salones/${s.id_salon}`, { method: 'PUT', body: { estado: nuevoEstado }, auth: true });
          await cargarSalones();
          actualizarBotonesPiso();
          await cargarTablaDinamica();
          renderizarTabla();
          renderizarListaSalones();
          renderizarIncidenciasWidget();
        } catch (err) {
          mostrarTostada({ titulo: 'Error', mensaje: err?.message || 'No se pudo actualizar el estado', tipo: 'error' });
        }
      });

      tbody.appendChild(tr);
    });
  }

  function renderizarIncidenciasWidget() {
    const cont = document.getElementById('lista-alertas-widget');
    if (!cont) return;
    cont.innerHTML = '';

    const cambios = getCambiosDeSalonDesdeTabla();
    const incidencias = getIncidenciasDesdeAusencias();

    cambios.forEach((c) => {
      const div = document.createElement('div');
      div.className = 'tarjeta-alerta';
      div.innerHTML = `
        <div class="alerta-icono advertencia">
          <span class="material-symbols-outlined md-20">warning</span>
        </div>
        <div class="alerta-texto">
          <p>Cambio de salón: ${c.nombre_grupo || 'Grupo'}</p>
          <p>${c.motivo || ''}${c.salon_temporal ? ` • Nuevo: ${c.salon_temporal}` : ''}</p>
        </div>`;
      cont.appendChild(div);
    });

    incidencias.forEach((a) => {
      const div = document.createElement('div');
      div.className = 'tarjeta-alerta';
      const esCancelada = esAusenciaProfesor(a.accion_tomada);
      div.innerHTML = `
        <div class="alerta-icono ${esCancelada ? 'error' : 'advertencia'}">
          <span class="material-symbols-outlined md-20">${esCancelada ? 'person_off' : 'warning'}</span>
        </div>
        <div class="alerta-texto">
          <p>Incidencia: ${a.nombre_profesor || 'Profesor'}</p>
          <p>Grupo ${a.nombre_grupo || 'G'} • ${(normalizeDateKey(a.fecha) || a.fecha || '')} ${a.hora || ''}</p>
          <p>${a.accion_tomada || ''}</p>
        </div>`;
      cont.appendChild(div);
    });
  }

  const modalHistorialAlertas = document.getElementById('modal-historial-alertas');
  const cerrarHistorialAlertas = document.getElementById('cerrar-historial-alertas');
  const cuerpoHistorialAlertas = document.getElementById('cuerpo-historial-alertas');
  const botonVerTodas = document.getElementById('btn-ver-todas-salones');

  const abrirHistorialIncidencias = () => {
    if (!modalHistorialAlertas || !cuerpoHistorialAlertas) return;
    cuerpoHistorialAlertas.innerHTML = '';

    const cambios = getCambiosDeSalonDesdeTabla();
    const incidencias = getIncidenciasDesdeAusencias();
    const todas = [...incidencias, ...cambios];

    todas.sort((a, b) => {
      const fa = normalizeDateKey(a.fecha) || '';
      const fb = normalizeDateKey(b.fecha) || '';
      if (fa !== fb) return fb.localeCompare(fa);
      return String(b.hora || '').localeCompare(String(a.hora || ''));
    });

    const gruposPorFecha = {};
    todas.forEach((it) => {
      const clave = normalizeDateKey(it.fecha) || 'Sin fecha';
      if (!gruposPorFecha[clave]) gruposPorFecha[clave] = [];
      gruposPorFecha[clave].push(it);
    });

    Object.keys(gruposPorFecha)
      .sort((a, b) => b.localeCompare(a))
      .forEach((fecha) => {
        const separador = document.createElement('div');
        separador.className = 'separador-fecha';
        separador.innerHTML = `<span class="fecha-etiqueta">${formatearFechaEtiqueta(fecha)}</span>`;
        cuerpoHistorialAlertas.appendChild(separador);

        gruposPorFecha[fecha].forEach((it) => {
          const div = document.createElement('div');
          div.className = 'tarjeta-alerta';
          if (it.tipo === 'incidencia') {
            const esCancelada = esAusenciaProfesor(it.accion_tomada);
            div.innerHTML = `
              <div class="alerta-icono ${esCancelada ? 'error' : 'advertencia'}">
                <span class="material-symbols-outlined md-20">${esCancelada ? 'person_off' : 'warning'}</span>
              </div>
              <div class="alerta-texto">
                <p>Incidencia: ${it.nombre_profesor || 'Profesor'}</p>
                <p>Grupo ${it.nombre_grupo || 'G'} • ${it.hora || 'S/H'}</p>
                <p>${it.accion_tomada || 'Sin acción registrada'}</p>
              </div>`;
          } else {
            div.innerHTML = `
              <div class="alerta-icono advertencia">
                <span class="material-symbols-outlined md-20">warning</span>
              </div>
              <div class="alerta-texto">
                <p>Cambio de salón: ${it.motivo || ''}</p>
                <p>Grupo ${it.nombre_grupo || 'G'} • ${it.hora || ''}</p>
                <p>${it.salon_temporal ? `Nuevo salón: ${it.salon_temporal}` : ''}</p>
              </div>`;
          }
          cuerpoHistorialAlertas.appendChild(div);
        });
      });

    modalHistorialAlertas.classList.add('activo');
  };

  if (botonVerTodas) botonVerTodas.addEventListener('click', abrirHistorialIncidencias);
  if (cerrarHistorialAlertas) cerrarHistorialAlertas.addEventListener('click', () => modalHistorialAlertas?.classList.remove('activo'));

  // Modal horario
  const modalHorarioSalon = document.getElementById('modal-horario-salon');
  const cerrarModalHorario = document.getElementById('cerrar-modal-horario');
  const tituloModalHorario = document.getElementById('titulo-modal-horario');
  const cuerpoTablaHorario = document.getElementById('cuerpo-tabla-horario-salon');
  const selectorDiaModal = document.getElementById('selector-dia-modal');

  async function cargarHorariosFijosSalon(idSalon) {
    if (!idSalon) return [];
    if (horariosFijosPorSalon.has(idSalon)) return horariosFijosPorSalon.get(idSalon);
    const data = await fetchJson(`/horarios?id_salon=${encodeURIComponent(idSalon)}`);
    const horarios = Array.isArray(data?.horarios) ? data.horarios : [];
    horariosFijosPorSalon.set(idSalon, horarios);
    return horarios;
  }

  async function actualizarTablaHorarioModal() {
    if (!salonSeleccionado || !cuerpoTablaHorario) return;
    cuerpoTablaHorario.innerHTML = '';

    let horarios = [];
    try {
      horarios = await cargarHorariosFijosSalon(salonSeleccionado.id_salon);
    } catch {
      horarios = [];
    }

    const mapaBloque = new Map();
    horarios
      .filter((hf) => String(hf.dia) === String(diaSeleccionadoModal))
      .forEach((hf) => {
        const blocks = blocksCoveredByRange(hf.hora_inicio, hf.hora_fin);
        const fallback = Number(hf.bloque_horario);
        const blocksFinal = blocks.length ? blocks : fallback ? [fallback] : [];
        blocksFinal.forEach((b) => {
          if (!mapaBloque.has(Number(b))) mapaBloque.set(Number(b), hf);
        });
      });

    bloquesHorarios.forEach((bloque) => {
      const h = mapaBloque.get(Number(bloque.id));
      const fila = document.createElement('tr');
      if (h) {
        fila.innerHTML = `
          <td><strong>${bloque.hora}</strong></td>
          <td>${h.nombre_grupo || '-'}</td>
          <td>${h.materia || '-'}</td>
          <td>${h.nombre_profesor || '-'}</td>
        `;
      } else {
        fila.innerHTML = `
          <td><strong>${bloque.hora}</strong></td>
          <td colspan="3" style="color:#9ca3af;font-style:italic;">Sin clase</td>
        `;
      }
      cuerpoTablaHorario.appendChild(fila);
    });
  }

  function abrirModalHorario(salon) {
    if (!modalHorarioSalon) return;
    salonSeleccionado = salon;
    if (tituloModalHorario) tituloModalHorario.textContent = `Horario de Salón ${salon.numero_salon}`;
    actualizarTablaHorarioModal();
    modalHorarioSalon.classList.add('activo');
  }

  if (selectorDiaModal) {
    selectorDiaModal.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        diaSeleccionadoModal = btn.getAttribute('data-dia');
        selectorDiaModal.querySelectorAll('button').forEach((b) => b.classList.remove('activo-primario'));
        btn.classList.add('activo-primario');
        actualizarTablaHorarioModal();
      });
    });
    const btnLunes = selectorDiaModal.querySelector('[data-dia="Lunes"]');
    if (btnLunes) btnLunes.classList.add('activo-primario');
  }
  if (cerrarModalHorario) cerrarModalHorario.addEventListener('click', () => modalHorarioSalon?.classList.remove('activo'));

  async function cargarSalones() {
    const data = await fetchJson('/salones');
    salonesData = Array.isArray(data) ? data.map(normalizarSalonApi) : [];
  }

  async function cargarTablaDinamica() {
    if (!pisoSeleccionado) {
      tablaDinamicaRows = [];
      return;
    }
    const fecha = fechaParaTablaDinamica();
    const pisoDb = pisoDbFromLabel(pisoSeleccionado);
    try {
      const data = await fetchJson(`/horarios/tabla-dinamica?fecha=${encodeURIComponent(fecha)}&piso=${encodeURIComponent(pisoDb)}`, { auth: true });
      tablaDinamicaRows = Array.isArray(data?.tabla) ? data.tabla : [];
    } catch (err) {
      const st = Number(err?.status);
      if (st === 401 || st === 403) {
        clearSession();
        window.location.href = 'index.html';
        return;
      }
      throw err;
    }
  }

  async function cargarIncidencias() {
    try {
      const data = await fetchJson('/ausencias', { auth: true });
      incidenciasRows = Array.isArray(data?.ausencias) ? data.ausencias : [];
    } catch {
      incidenciasRows = [];
    }
  }

  function actualizarBotonesPiso() {
    const contenedor = document.getElementById('selector-pisos');
    if (!contenedor) return;
    const pisos = pisosOrdenados(new Set(salonesData.map((s) => s.piso)));
    contenedor.innerHTML = '';
    pisos.forEach((piso, index) => {
      const boton = document.createElement('button');
      boton.className = 'boton-filtro';
      boton.setAttribute('data-piso', piso);
      boton.textContent = piso;
      if (index === 0 && !pisoSeleccionado) pisoSeleccionado = piso;
      if (piso === pisoSeleccionado) boton.classList.add('activo-primario');
      contenedor.appendChild(boton);
    });
  }

  const contenedorPisos = document.getElementById('selector-pisos');
  if (contenedorPisos) {
    contenedorPisos.addEventListener('click', async (e) => {
      const boton = e.target.closest('button');
      if (!boton || !boton.hasAttribute('data-piso')) return;
      pisoSeleccionado = boton.getAttribute('data-piso');
      contenedorPisos.querySelectorAll('button').forEach((b) => b.classList.remove('activo-primario'));
      boton.classList.add('activo-primario');

      try {
        await cargarTablaDinamica();
      } catch {
        tablaDinamicaRows = [];
      }
      renderizarTabla();
      renderizarListaSalones();
      renderizarIncidenciasWidget();
    });
  }

  document.addEventListener('click', () => {
    document.querySelectorAll('.menu-desplegable.activo').forEach((m) => m.classList.remove('activo'));
  });

  const perfilBtn = document.getElementById('perfil-usuario-btn');
  const menuPerfilUsuario = document.getElementById('menu-perfil-usuario');
  if (perfilBtn && menuPerfilUsuario) {
    perfilBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      menuPerfilUsuario.classList.toggle('activo');
    });
  }
  document.getElementById('opcion-perfil')?.addEventListener('click', () => {
    window.location.href = 'stt_preG.html';
  });
  document.getElementById('opcion-cerrar-sesion')?.addEventListener('click', () => {
    clearSession();
    window.location.href = 'index.html';
  });

  window.addEventListener('click', (e) => {
    if (e.target === modalHorarioSalon) modalHorarioSalon.classList.remove('activo');
    if (e.target === modalHistorialAlertas) modalHistorialAlertas.classList.remove('activo');
  });

  (async () => {
    try {
      await cargarSalones();
      actualizarBotonesPiso();
      if (!pisoSeleccionado) {
        const pisos = pisosOrdenados(new Set(salonesData.map((s) => s.piso)));
        pisoSeleccionado = pisos[0] || 'L';
      }
      await Promise.allSettled([cargarTablaDinamica(), cargarIncidencias()]);
    } catch {
      // noop
      // jder mas de mis hermosos try catch
    } finally {
      actualizarBotonesPiso();
      renderizarTabla();
      renderizarListaSalones();
      renderizarIncidenciasWidget();
    }
  })();
});
