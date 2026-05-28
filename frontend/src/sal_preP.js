import { DEFAULT_API_URL, resolveApiBase, getSessionToken, getSessionUser, clearSession, paintSessionHeader, getInitials } from './map_preG_shared.js';

document.addEventListener('DOMContentLoaded', () => {
  const usuarioActual = getSessionUser();
  const pisoActual = usuarioActual?.piso || '3';

  paintSessionHeader(usuarioActual);

  // Actualizar header y etiqueta de piso
  const nombreHeader = document.getElementById('nombre-usuario-header');
  const avatarHeader = document.getElementById('avatar-header');
  if (nombreHeader && usuarioActual) nombreHeader.textContent = usuarioActual.nombre;
  if (avatarHeader && usuarioActual) {
    const partes = usuarioActual.nombre.split(' ');
    avatarHeader.textContent = (partes[0]?.[0] || '') + (partes[1]?.[0] || '');
  }
  const labelPiso = document.getElementById('label-piso-actual');
  if (labelPiso) labelPiso.textContent = `PISO ${pisoActual}`;

  const elementoReloj = document.getElementById('reloj-tiempo');
  const elementoFecha = document.getElementById('reloj-fecha');
  if (elementoReloj || elementoFecha) {
    const actualizarTiempo = () => {
      const ahora = new Date();
      if (elementoReloj) elementoReloj.textContent = `${String(ahora.getHours()).padStart(2,'0')} : ${String(ahora.getMinutes()).padStart(2,'0')}`;
      if (elementoFecha) {
        let t = ahora.toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' });
        elementoFecha.textContent = t.charAt(0).toUpperCase() + t.slice(1);
      }
    };
    actualizarTiempo();
    setInterval(actualizarTiempo, 1000);
  }

  const apiBase = resolveApiBase() || DEFAULT_API_URL;

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

  let salonesData = [], horariosData = [], gruposData = [], ausenciasData = [], dinamicaData = [], materiasData = [];

  const safeFetch = async (url, opts, fallback) => {
    try { return await fetchJson(url, opts); } catch (e) { console.warn(url, e?.message); return fallback; }
  };

  const cargarDatos = async () => {
    const fechaHoy = new Date().toISOString().split('T')[0];
    const pisoDb = pisoActual === 'L' ? '0' : pisoActual;
    const [salonesRes, horariosRes, gruposRes, ausenciasRes, dinamicaRes, materiasRes] = await Promise.all([
      safeFetch('/salones', {}, []),
      safeFetch('/horarios', {}, { horarios: [] }),
      safeFetch('/grupos', {}, { grupos: [] }),
      safeFetch('/ausencias', { auth: true }, { ausencias: [] }),
      safeFetch('/horarios/tabla-dinamica?fecha=' + fechaHoy + '&piso=' + pisoDb, { auth: true }, { tabla: [] }),
      safeFetch('/horarios/materias', {}, { materias: [] })
    ]);

    salonesData = Array.isArray(salonesRes) ? salonesRes : (salonesRes?.salones || []);
    horariosData = Array.isArray(horariosRes) ? horariosRes : (horariosRes?.horarios || []);
    gruposData = Array.isArray(gruposRes) ? gruposRes : (gruposRes?.grupos || []);
    ausenciasData = Array.isArray(ausenciasRes) ? ausenciasRes : (ausenciasRes?.ausencias || []);
    dinamicaData = Array.isArray(dinamicaRes) ? dinamicaRes : (dinamicaRes?.tabla || []);
    materiasData = Array.isArray(materiasRes) ? materiasRes : (materiasRes?.materias || []);

    renderizarTabla();
    renderizarListaSalones();
    renderizarAlertas();
  };

  const pisoCoincide = (obj) => {
    if (!obj) return false;
    const target = pisoActual === 'L' ? '0' : String(pisoActual);
    return String(obj.piso) === target;
  };

  const normalizarDia = (raw) => {
    const s = String(raw || '').trim().toLowerCase();
    if (s.startsWith('lun')) return 'Lunes';
    if (s.startsWith('mar')) return 'Martes';
    if (s.startsWith('mié') || s.startsWith('mie')) return 'Miercoles';
    if (s.startsWith('jue')) return 'Jueves';
    if (s.startsWith('vie')) return 'Viernes';
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  const diaLaboralHoy = () => {
    const dias = ['Domingo','Lunes','Martes','Miercoles','Jueves','Viernes','Sabado'];
    return dias[new Date().getDay()];
  };

  const franjasHorarias = ['07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00'];

  const renderizarTabla = () => {
    const cuerpoTabla = document.getElementById('cuerpo-tabla-horarios');
    if (!cuerpoTabla) return;
    cuerpoTabla.innerHTML = '';

    const salonesFiltrados = salonesData.filter(s => pisoCoincide(s));
    const hhmm = (t) => String(t || '').slice(0, 5);

    // Construir eventos por salon desde dinamicaData (y yo q no queria hacer filtros y tengo q hacer esta mrd)
    const eventosPorSalon = new Map();
    for (const d of dinamicaData) {
      const idSalon = Number(d.id_salon_temporal ?? d.id_salon);
      if (!idSalon) continue;
      const horaInicio = hhmm(d.hora_inicio_temp ?? d.hora_inicio);
      const horaFin = hhmm(d.hora_fin_temp ?? d.hora_fin);
      const inicioH = parseInt(horaInicio.split(':')[0]);
      const finH = parseInt(horaFin.split(':')[0]);
      const numBloques = Math.max(1, finH - inicioH);
      if (!eventosPorSalon.has(idSalon)) eventosPorSalon.set(idSalon, []);
      eventosPorSalon.get(idSalon).push({
        horaInicio,
        numBloques,
        nombre_grupo: d.nombre_grupo || 'Grupo',
        nombre_profesor: d.nombre_profesor || 'Profesor',
        esDinamico: !!d.id_horario_dinamico
      });
    }

    salonesFiltrados.forEach(salon => {
      const fila = document.createElement('tr');
      const tdSalon = document.createElement('td');
      tdSalon.className = 'columna-grupo';
      tdSalon.textContent = salon.nombre_salon;
      fila.appendChild(tdSalon);

      const eventos = eventosPorSalon.get(Number(salon.id_salon)) || [];
      const eventoPorInicio = new Map(eventos.map(ev => [ev.horaInicio, ev]));
      const celdasCubiertas = new Set();

      franjasHorarias.forEach((hora, index) => {
        if (celdasCubiertas.has(index)) return;
        const tdHora = document.createElement('td');
        const ev = eventoPorInicio.get(hora);

        if (ev) {
          if (ev.numBloques > 1) {
            tdHora.colSpan = ev.numBloques;
            for (let i = 1; i < ev.numBloques; i++) celdasCubiertas.add(index + i);
          }
          const divCelda = document.createElement('div');
          divCelda.className = `celda-horario ${ev.esDinamico ? 'celda-advertencia' : 'celda-exito'}`;
          divCelda.innerHTML = `
            <p class="materia-nombre">${ev.nombre_grupo}</p>
            <p class="profesor-nombre">${ev.nombre_profesor}</p>`;
          tdHora.appendChild(divCelda);
        } else {
          const divVacia = document.createElement('div');
          divVacia.className = 'celda-vacia';
          divVacia.textContent = 'Sin Asignación';
          tdHora.appendChild(divVacia);
        }
        fila.appendChild(tdHora);
      });
      cuerpoTabla.appendChild(fila);
    });
  };

  // Kebab
  const botonKebab = document.getElementById('boton-kebab');
  const menuKebab = document.getElementById('menu-kebab');
  if (botonKebab && menuKebab) {
    botonKebab.addEventListener('click', (e) => { e.stopPropagation(); menuKebab.classList.toggle('activo'); });
    document.getElementById('opcion-filtros')?.addEventListener('click', (e) => { e.stopPropagation(); menuKebab.classList.remove('activo'); alert('Filtros (pendiente)'); });
  }
  document.addEventListener('click', () => document.querySelectorAll('.menu-desplegable.activo').forEach(m => m.classList.remove('activo')));

  // Menú perfil
  const perfilBtn = document.getElementById('perfil-usuario-btn');
  const menuPerfilUsuario = document.getElementById('menu-perfil-usuario');
  if (perfilBtn && menuPerfilUsuario) {
    perfilBtn.addEventListener('click', (e) => { e.stopPropagation(); menuPerfilUsuario.classList.toggle('activo'); });
  }
  document.getElementById('opcion-perfil')?.addEventListener('click', () => { window.location.href = 'stt_preP.html'; });
  document.getElementById('opcion-cerrar-sesion')?.addEventListener('click', () => { window.location.href = 'index.html'; });

  function renderizarListaSalones() {
    const tbody = document.getElementById('lista-salones-widget');
    if (!tbody) return;
    tbody.innerHTML = '';
    const salonesFiltrados = salonesData.filter(s => pisoCoincide(s));
    salonesFiltrados.forEach(s => {
      const tr = document.createElement('tr');
      const estadoNorm = (s.estado || '').toLowerCase();
      let claseEstado = 'disponible';
      if (estadoNorm.includes('ocup')) claseEstado = 'ocupado';
      if (estadoNorm.includes('provi')) claseEstado = 'provisional';
      if (estadoNorm.includes('mante')) claseEstado = 'mantenimiento';

      const tdSalon = document.createElement('td');
      tdSalon.innerHTML = `<div class="salon-id-celda ${claseEstado}"><span class="punto-estado ${claseEstado}"></span>${s.nombre_salon}</div>`;
      tr.appendChild(tdSalon);
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', (e) => { if (!e.target.closest('.contenedor-menu-kebab')) abrirModalHorario(s); });

      const tdPiso = document.createElement('td'); tdPiso.textContent = s.piso; tr.appendChild(tdPiso);
      const tdTipo = document.createElement('td'); tdTipo.textContent = s.tipo || ''; tr.appendChild(tdTipo);

      const tdAcc = document.createElement('td');
      tdAcc.className = 'acciones-celda';
      tdAcc.innerHTML = `
        <div class="contenedor-menu-kebab">
          <button class="boton-kebab" style="background:none;border:none;cursor:pointer;color:#94a3b8;display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;transition:background 0.2s;">
            <span class="material-symbols-outlined">more_vert</span>
          </button>
          <div class="menu-desplegable">
            <button class="opcion-menu btn-fijar"><span class="material-symbols-outlined md-18">push_pin</span><span>Fijar</span></button>
            <button class="opcion-menu btn-mantenimiento"><span class="material-symbols-outlined md-18">build</span><span>Estado mantenimiento</span></button>
          </div>
        </div>`;
      tr.appendChild(tdAcc);

      const btnK = tdAcc.querySelector('.boton-kebab');
      const menuK = tdAcc.querySelector('.menu-desplegable');
      btnK.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.menu-desplegable.activo').forEach(m => { if (m !== menuK) m.classList.remove('activo'); });
        menuK.classList.toggle('activo');
      });
      tdAcc.querySelector('.btn-fijar').addEventListener('click', (e) => {
        e.stopPropagation(); menuK.classList.remove('activo');
        const fijada = tr.classList.toggle('fila-fijada');
        tdAcc.querySelector('.btn-fijar span:last-child').textContent = fijada ? 'Fijado' : 'Fijar';
        if (fijada) tbody.insertBefore(tr, tbody.firstChild);
      });
      tdAcc.querySelector('.btn-mantenimiento').addEventListener('click', (e) => {
        e.stopPropagation(); menuK.classList.remove('activo');
        alert(`Cambiando salón ${s.nombre_salon} a estado de mantenimiento (Simulación)`);
      });
      tbody.appendChild(tr);
    });
  }

  function renderizarAlertas() {
    const cont = document.getElementById('lista-alertas-widget');
    if (!cont) return;
    cont.innerHTML = '';
    dinamicaData.forEach(d => {
      const hf = horariosData.find(h => h.id_horario_fijo === d.id_horario_fijo);
      const salonDest = salonesData.find(s => s.id_salon === d.id_salon_temporal);
      if (!pisoCoincide(salonDest)) return;
      const div = document.createElement('div'); div.className = 'tarjeta-alerta';
      div.innerHTML = `<div class="alerta-icono advertencia"><span class="material-symbols-outlined md-20">warning</span></div><div class="alerta-texto"><p>Cambio de salón: ${hf?.nombre_grupo||'Grupo'}</p><p>${d.motivo_cambio||''} • Nuevo: ${salonDest?.nombre_salon||'S/N'}</p></div>`;
      cont.appendChild(div);
    });
    ausenciasData.forEach(a => {
      const hf = horariosData.find(h => h.id_grupo === a.id_grupo);
      const salonA = salonesData.find(s => s.id_salon === hf?.id_salon);
      if (!pisoCoincide(salonA)) return;
      const div = document.createElement('div'); div.className = 'tarjeta-alerta';
      div.innerHTML = `<div class="alerta-icono error"><span class="material-symbols-outlined md-20">person_off</span></div><div class="alerta-texto"><p>Ausencia: ${a.nombre_profesor||'Profesor'}</p><p>Grupo ${a.nombre_grupo||'G'} • ${a.fecha} ${a.hora}</p><p>${a.accion_tomada||''}</p></div>`;
      cont.appendChild(div);
    });
  }

  // Modal historial alertas
  const modalHistorialAlertas = document.getElementById('modal-historial-alertas');
  const cerrarHistorialAlertas = document.getElementById('cerrar-historial-alertas');
  const cuerpoHistorialAlertas = document.getElementById('cuerpo-historial-alertas');
  const botonVerTodas = document.getElementById('btn-ver-todas-salones');

  const formatearFecha = (f) => {
    const hoy = new Date().toISOString().split('T')[0];
    const ayer = new Date(); ayer.setDate(ayer.getDate() - 1);
    if (f === hoy) return 'Hoy';
    if (f === ayer.toISOString().split('T')[0]) return 'Ayer';
    return new Date(f + 'T00:00:00').toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' });
  };

  const abrirHistorialAlertas = () => {
    if (!modalHistorialAlertas || !cuerpoHistorialAlertas) return;
    cuerpoHistorialAlertas.innerHTML = '';
    const alertas = [
      ...ausenciasData.filter(a => { const hf = horariosData.find(h => h.id_grupo === a.id_grupo); return pisoCoincide(salonesData.find(s => s.id_salon === hf?.id_salon)); }).map(a => ({ ...a, tipo:'ausencia' })),
      ...dinamicaData.filter(d => pisoCoincide(salonesData.find(s => s.id_salon === d.id_salon_temporal))).map(d => ({ ...d, tipo:'cambio' }))
    ].sort((a, b) => (b.fecha||'').localeCompare(a.fecha||''));

    const gruposPorFecha = {};
    alertas.forEach(a => { const k = a.fecha||'Sin fecha'; if (!gruposPorFecha[k]) gruposPorFecha[k] = []; gruposPorFecha[k].push(a); });
    Object.keys(gruposPorFecha).sort((a,b) => b.localeCompare(a)).forEach(fecha => {
      const sep = document.createElement('div'); sep.className = 'separador-fecha';
      sep.innerHTML = `<span class="fecha-etiqueta">${formatearFecha(fecha)}</span>`;
      cuerpoHistorialAlertas.appendChild(sep);
      gruposPorFecha[fecha].forEach(alerta => {
        const div = document.createElement('div'); div.className = 'tarjeta-alerta';
        if (alerta.tipo === 'ausencia') {
          div.innerHTML = `<div class="alerta-icono error"><span class="material-symbols-outlined md-20">person_off</span></div><div class="alerta-texto"><p>Ausencia: ${alerta.nombre_profesor||'Profesor'}</p><p>Grupo ${alerta.nombre_grupo||'G'} • ${alerta.hora||'S/H'}</p><p>${alerta.accion_tomada||'Sin acción'}</p></div>`;
        } else {
          const hf = horariosData.find(h => h.id_horario_fijo === alerta.id_horario_fijo);
          const sal = salonesData.find(s => s.id_salon === alerta.id_salon_temporal);
          div.innerHTML = `<div class="alerta-icono advertencia"><span class="material-symbols-outlined md-20">warning</span></div><div class="alerta-texto"><p>Cambio de salón: ${alerta.motivo_cambio||''}</p><p>Grupo ${hf?.nombre_grupo||'G'} • ${alerta.hora_inicio||''}</p><p>Nuevo salón: ${sal?.nombre_salon||'S/N'}</p></div>`;
        }
        cuerpoHistorialAlertas.appendChild(div);
      });
    });
    modalHistorialAlertas.classList.add('activo');
  };

  if (botonVerTodas) botonVerTodas.addEventListener('click', abrirHistorialAlertas);
  if (cerrarHistorialAlertas) cerrarHistorialAlertas.addEventListener('click', () => modalHistorialAlertas.classList.remove('activo'));

  // Modal horario salón
  const bloquesHorarios = [
    {id:1,hora:'07:00 - 07:50'},{id:2,hora:'08:00 - 08:50'},{id:3,hora:'09:00 - 09:50'},
    {id:4,hora:'10:00 - 10:50'},{id:5,hora:'11:00 - 11:50'},{id:6,hora:'12:00 - 12:50'},
    {id:7,hora:'13:00 - 13:50'},{id:8,hora:'14:00 - 14:50'},{id:9,hora:'15:00 - 15:50'},
    {id:10,hora:'16:00 - 16:50'},{id:11,hora:'17:00 - 17:50'},{id:12,hora:'18:00 - 18:50'},
    {id:13,hora:'19:00 - 19:50'},{id:14,hora:'20:00 - 20:50'}
  ];
  const modalHorarioSalon = document.getElementById('modal-horario-salon');
  const cerrarModalHorario = document.getElementById('cerrar-modal-horario');
  const tituloModalHorario = document.getElementById('titulo-modal-horario');
  const cuerpoTablaHorario = document.getElementById('cuerpo-tabla-horario-salon');
  const selectorDiaModal = document.getElementById('selector-dia-modal');
  let salonSeleccionado = null;
  let diaSeleccionadoModal = 'Lunes';

  const actualizarTablaHorarioModal = () => {
    if (!salonSeleccionado || !cuerpoTablaHorario) return;
    cuerpoTablaHorario.innerHTML = '';
    const hhmm = (t) => String(t || '').slice(0, 5);
    const toMins = (t) => {
      const p = hhmm(t).split(':').map(Number);
      return p.length === 2 ? p[0] * 60 + p[1] : null;
    };
    const idSalon = Number(salonSeleccionado.id_salon);
    const diaNorm = normalizarDia(diaSeleccionadoModal);
    // Usar dinamicaData para el hoy (carajo mas filtros qno queria lpm), horariosData para demas dias
    const esHoy = diaNorm === diaLaboralHoy();
    const fuente = esHoy ? dinamicaData : horariosData;
    // Filtrar horarios del salon+dia
    const horariosDelDia = fuente.filter(f =>
      Number(f.id_salon_temporal ?? f.id_salon) === idSalon &&
      normalizarDia(f.dia) === diaNorm
    );
    bloquesHorarios.forEach(bloque => {
      const blockStart = toMins(bloque.hora);
      const h = horariosDelDia.find(f => {
        const fInicio = toMins(f.hora_inicio_temp ?? f.hora_inicio);
        const fFin = toMins(f.hora_fin_temp ?? f.hora_fin);
        return fInicio !== null && fFin !== null && blockStart !== null &&
               fInicio <= blockStart && blockStart < fFin;
      });
      const fila = document.createElement('tr');
      if (h) {
        fila.innerHTML = `<td><strong>${bloque.hora}</strong></td><td>${h.nombre_grupo||'-'}</td><td>${h.materia||h.nombre_materia||'-'}</td><td>${h.nombre_profesor||'-'}</td>`;
      } else {
        fila.innerHTML = `<td><strong>${bloque.hora}</strong></td><td colspan="3" style="color:#9ca3af;font-style:italic;">Sin clase</td>`;
      }
      cuerpoTablaHorario.appendChild(fila);
    });
  };

  const abrirModalHorario = (salon) => {
    if (!modalHorarioSalon) return;
    salonSeleccionado = salon;
    if (tituloModalHorario) tituloModalHorario.textContent = `Horario de Salón ${salon.nombre_salon}`;
    actualizarTablaHorarioModal();
    modalHorarioSalon.classList.add('activo');
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
    selectorDiaModal.querySelector('[data-dia="Lunes"]')?.classList.add('activo-primario');
  }
  if (cerrarModalHorario) cerrarModalHorario.addEventListener('click', () => modalHorarioSalon.classList.remove('activo'));

  window.addEventListener('click', (e) => {
    if (e.target === modalHorarioSalon) modalHorarioSalon.classList.remove('activo');
    if (e.target === modalHistorialAlertas) modalHistorialAlertas.classList.remove('activo');
  });

  cargarDatos();
});
