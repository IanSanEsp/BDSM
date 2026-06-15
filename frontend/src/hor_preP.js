import { initSalonSelectorMap } from './sel_salon_map.js';
import { DEFAULT_API_URL, resolveApiBase, getSessionToken, paintSessionHeader, getSessionUser, getLocalDateISO } from './map_preG_shared.js';

document.addEventListener('DOMContentLoaded', async () => { // namas checa el dom (algo algo w3school)
  console.log('Panel de Control BDSM CECyT 9 cargado');

  const apiBase = resolveApiBase() || DEFAULT_API_URL;

  const usuarioActual = getSessionUser();
  const pisoActual = String(usuarioActual?.piso || '3');

  const pisoCoincide = (obj) => {
    const target = pisoActual === 'L' ? '0' : String(pisoActual);
    return String(obj?.piso) === target;
  };

  let grupos = [];
  let horario_fijo = [];
  let profesores = [];
  let usuarios = [];
  let materias = [];
  let salones = [];

  // Dinámica se conecta después
  let horario_dinamico = [];
  let ausencias_profesor = [];
  let ultimoErrorDinamica = null;

  const hhmm = (t) => {
    const s = String(t || '').trim();
    if (!s) return '';
    const m = s.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return s;
    return `${m[1].padStart(2, '0')}:${m[2]}`;
  };

  const normalizarTipoIncidencia = (raw) => {
    const t = String(raw || '').trim().toLowerCase();
    if (!t) return 'ausencia_profesor';
    if (t === 'ausencia_profesor' || t === 'junta' || t === 'excursion' || t === 'otro') return t;
    return 'otro';
  };

  const etiquetaTipoIncidencia = (tipo) => {
    const t = normalizarTipoIncidencia(tipo);
    if (t === 'ausencia_profesor') return 'Ausencia - Profesor';
    if (t === 'junta') return 'Junta Académica';
    if (t === 'excursion') return 'Excursión';
    return 'Otro';
  };

  const parseTipoDesdeAccion = (accion) => {
    const s = String(accion || '').trim();
    const m = s.match(/^\[([a-z_]+)\]\s*/i);
    if (!m) return null;
    return normalizarTipoIncidencia(m[1]);
  };

  const stripTipoPrefix = (accion) => String(accion || '').replace(/^\[[a-z_]+\]\s*/i, '').trim();

  const fechaHoyISO = () => getLocalDateISO();

  const fechaYYYYMMDD = (v, fallback = '') => {
    if (v === null || v === undefined || v === '') return fallback;
    if (v instanceof Date && Number.isFinite(v.getTime())) return getLocalDateISO(v);
    const s = String(v).trim();
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : (s || fallback);
  };

  const diaDesdeFecha = (fechaISO) => {
    const d = new Date(`${fechaISO}T00:00:00`);
    const dow = d.getDay();
    const map = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
    return map[dow] || null;
  };

  const timeToMinutes = (t) => {
    const s = String(t || '').trim();
    if (!s) return null;
    const m = s.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    return hh * 60 + mm;
  };

  const minutesToHHMM = (mins) => {
    if (!Number.isFinite(mins)) return '';
    const hh = Math.floor(mins / 60);
    const mm = mins % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  };

  const addHoursHHMM = (t, hours) => {
    const m = timeToMinutes(t);
    if (m === null) return '';
    return minutesToHHMM(m + (Number(hours) * 60));
  };

  const normalizarDia = (raw) => {
    const s = String(raw || '').trim();
    if (!s) return s;
    const lower = s.toLowerCase();

    if (lower.startsWith('lun')) return 'Lunes';
    if (lower.startsWith('mar')) return 'Martes';
    if (lower.startsWith('mié') || lower.startsWith('mie')) return 'Miercoles';
    if (lower.startsWith('jue')) return 'Jueves';
    if (lower.startsWith('vie')) return 'Viernes';
    if (lower.startsWith('sá') || lower.startsWith('sab')) return 'Sabado';

    // Fallback: capitalizar primera letra
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  const safeRows = (data, key) => {
    if (Array.isArray(data)) return data;
    if (key && Array.isArray(data?.[key])) return data[key];
    return [];
  };

  const fetchJson = async (pathOrUrl, { method = 'GET', body, auth = false } = {}) => {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth) {
      const token = getSessionToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    const url = /^https?:\/\//i.test(String(pathOrUrl))
      ? String(pathOrUrl)
      : `${apiBase}${String(pathOrUrl).startsWith('/') ? '' : '/'}${String(pathOrUrl)}`;

    const res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    const ct = res.headers.get('content-type') || '';
    const payload = ct.includes('application/json')
      ? await res.json().catch(() => null)
      : await res.text().catch(() => null);

    if (!res.ok) {
      const msg = payload?.error || payload?.message || (typeof payload === 'string' ? payload : null) || `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      err.payload = payload;
      throw err;
    }

    return payload;
  };

  const cargarDatosRobusta = async () => {
    try {
      const [gruposData, horariosData, salonesData, profesoresData, materiasData] = await Promise.all([
        fetchJson('/grupos'),
        fetchJson('/horarios'),
        fetchJson('/salones'),
        fetchJson('/horarios/profesores').catch(() => ({ profesores: [] })),
        fetchJson('/horarios/materias').catch(() => ({ materias: [] }))
      ]);

      grupos = safeRows(gruposData, 'grupos');

      const salonesRows = safeRows(salonesData);
      salones = salonesRows.map((s) => ({
        ...s,
        // compat front viejo
        numero_salon: s.numero_salon || s.nombre_salon
      }));

      const horariosRows = safeRows(horariosData, 'horarios');
      horario_fijo = horariosRows.map((h) => ({
        ...h,
        // compat con el front que usa estas llaves
        hora_inicio: hhmm(h.hora_inicio),
        hora_fin: hhmm(h.hora_fin),
        dia: normalizarDia(h.dia),
        nombre_materia: h.nombre_materia || h.materia,
        nombre_salon: h.nombre_salon,
        numero_salon: h.numero_salon || h.nombre_salon,
        id_profesor_aux: h.id_profesor_aux ?? h.id_auxiliar ?? null
      }));

      // Filtrar solo grupos que tengan clases en salones del piso del prefecto
      const idsSalonesPiso = new Set(salones.filter(s => pisoCoincide(s)).map(s => Number(s.id_salon)));
      grupos = grupos.filter(g =>
        horario_fijo.some(h => Number(h.id_grupo) === Number(g.id_grupo) && idsSalonesPiso.has(Number(h.id_salon)))
      );
      // Mostrar solo las clases que estén en salones del piso
      horario_fijo = horario_fijo.filter(h => idsSalonesPiso.has(Number(h.id_salon)));

      // Catálogo completo de materias (solo BD)
      const materiasMap = new Map();
      const usuariosMap = new Map();

      const materiasRows = safeRows(materiasData, 'materias');
      for (const m of materiasRows) {
        const id = Number(m?.id_materia ?? m?.id);
        if (!Number.isFinite(id)) continue;
        if (!materiasMap.has(id)) {
          materiasMap.set(id, {
            id_materia: id,
            nombre_materia: m?.nombre_materia || m?.materia || `Materia ${id}`,
            area_estudio: m?.area_estudio || null
          });
        }
      }

      // Cargar todos los profes
      const profesoresRows = safeRows(profesoresData, 'profesores');
      for (const p of profesoresRows) {
        const id = Number(p?.id_profesor ?? p?.id_usuarios ?? p?.id);
        if (!Number.isFinite(id)) continue;
        if (!usuariosMap.has(id)) {
          usuariosMap.set(id, {
            id_usuarios: id,
            nombre: p?.nombre || `Profesor ${id}`,
            tipo_usuario: 'Profesor'
          });
        }
      }

      for (const h of horario_fijo) {
        if (h.id_profesor && h.nombre_profesor) {
          if (!usuariosMap.has(h.id_profesor)) {
            usuariosMap.set(h.id_profesor, {
              id_usuarios: h.id_profesor,
              nombre: h.nombre_profesor,
              tipo_usuario: 'Profesor'
            });
          } else {
            const u = usuariosMap.get(h.id_profesor);
            if (u && (!u.nombre || String(u.nombre).startsWith('Profesor '))) {
              u.nombre = h.nombre_profesor;
            }
          }
        }

        if (h.id_auxiliar && h.nombre_auxiliar) {
          if (!usuariosMap.has(h.id_auxiliar)) {
            usuariosMap.set(h.id_auxiliar, {
              id_usuarios: h.id_auxiliar,
              nombre: h.nombre_auxiliar,
              tipo_usuario: 'Profesor'
            });
          } else {
            const u = usuariosMap.get(h.id_auxiliar);
            if (u && (!u.nombre || String(u.nombre).startsWith('Profesor '))) {
              u.nombre = h.nombre_auxiliar;
            }
          }
        }
      }

      materias = [...materiasMap.values()].sort((a, b) => String(a.nombre_materia).localeCompare(String(b.nombre_materia)));
      usuarios = [...usuariosMap.values()].sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));

      // Lista de profes
      const profSet = new Set();
      profesores = [];
      for (const u of usuarios) {
        if (u.tipo_usuario !== 'Profesor') continue;
        const id = Number(u.id_usuarios);
        if (!Number.isFinite(id) || profSet.has(id)) continue;
        profSet.add(id);
        profesores.push({ id_profesor: id, estado_asistencia: 'Presente' });
      }

      // Dinámica vacía porq q miedo chambear esto 
      horario_dinamico = [];
      ausencias_profesor = [];
    } catch (e) {
      console.error('Error cargando datos robustos:', e);
      // Dejar arrays vacíos para que la UI no se vaya al coño (tambien la bd)
      grupos = [];
      horario_fijo = [];
      profesores = [];
      usuarios = [];
      materias = [];
      salones = [];
      horario_dinamico = [];
      ausencias_profesor = [];
      mostrarTostada({ titulo: 'Error', mensaje: 'No se pudieron cargar los horarios desde el servidor.', tipo: 'error' });
    }
  };

  let fechaDinamica = fechaHoyISO();

  const cargarDatosDinamica = async (fechaISO = fechaDinamica) => {
    fechaDinamica = fechaISO || fechaHoyISO();
    try {
      ultimoErrorDinamica = null;

      // Cargar salones para filtrar por piso
      const [salonesData, ausenciasData, tablaData] = await Promise.all([
        fetchJson('/salones'),
        fetchJson(`/ausencias?fecha=${encodeURIComponent(fechaDinamica)}`, { auth: true }),
        fetchJson(`/horarios/tabla-dinamica?fecha=${encodeURIComponent(fechaDinamica)}`, { auth: true })
      ]);

      const salonesRows = safeRows(salonesData);
      salones = salonesRows.map((s) => ({
        ...s,
        numero_salon: s.numero_salon || s.nombre_salon
      }));
      const idsSalonesPiso = new Set(salones.filter(s => pisoCoincide(s)).map(s => Number(s.id_salon)));

      const ausRows = safeRows(ausenciasData, 'ausencias');
      ausencias_profesor = ausRows
        .filter((a) => String(a.accion_tomada || '').trim() !== 'reasignacion_salon')
        .map((a) => ({
          ...a,
          fecha: fechaDinamica,
          hora: hhmm(a.hora),
          tipo_incidencia: normalizarTipoIncidencia(a.tipo_incidencia ?? a.tipo ?? parseTipoDesdeAccion(a.accion_tomada) ?? 'ausencia_profesor'),
          accion_tomada: stripTipoPrefix(a.accion_tomada),
          id_profesor: Number(a.id_profesor),
          id_grupo: a.id_grupo != null ? Number(a.id_grupo) : null
        }));

      const tablaRows = safeRows(tablaData, 'tabla');
      horario_dinamico = tablaRows
        .filter((r) => r && r.id_horario_dinamico != null)
        .map((r) => ({
          ...r,
          id_horario_dinamico: Number(r.id_horario_dinamico),
          // Forzar a la fecha solicitada para evitar desfaces (DATE -> ISO con TZ)
          fecha: fechaDinamica,
          dia: normalizarDia(r.dia || diaDesdeFecha(fechaDinamica) || ''),
          hora_inicio: hhmm(r.hora_inicio_temp ?? r.hora_inicio),
          hora_fin: hhmm(r.hora_fin_temp ?? r.hora_fin),
          id_horario_fijo_detalle: r.id_horario_fijo_detalle != null ? Number(r.id_horario_fijo_detalle) : null,
          id_horario_fijo: r.id_horario_fijo != null ? Number(r.id_horario_fijo) : null,
          id_grupo: r.id_grupo != null ? Number(r.id_grupo) : null,
          id_profesor: r.id_profesor != null ? Number(r.id_profesor) : null,
          id_materia: r.id_materia != null ? Number(r.id_materia) : null
        }));
      horario_dinamico = horario_dinamico.filter(h => idsSalonesPiso.has(Number(h.id_salon)));
    } catch (err) {
      console.error('Error cargando dinámica:', err);
      ultimoErrorDinamica = err;
      // Mantener el último estado conocido (incluye UI optimista) para no “borrar” incidencias/colores
    }
  };
  
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

  // Crea mis tarjetas porfa 

  const franjasHorarias = [
    '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', 
    '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'
  ];

  const diaLaboralHoy = () => {
    const d = new Date();
    const dow = d.getDay();
    const map = [
      'Sabado',
      'Lunes',
      'Martes',
      'Miercoles',
      'Jueves',
      'Viernes',
      'Sabado'
    ];
    return map[dow] || 'Lunes';
  };

  let diaSeleccionadoTabla = diaLaboralHoy();

  let semestreSeleccionado = 6;
  let modoVista = 'dinamica'; // UI arranca en dinámica (ver hor_preG.html)
  let gruposFijados = [];
  let profesoresFijados = [];

  let salonModoSeleccion = 'registro';
  let adelantosPropuestos = [];
  let adelantoPendiente = null;
  let salonSeleccionadoAdelanto = null;

  const determinarSemestresDisponibles = () => {
    const ahora = new Date();
    const mes = ahora.getMonth();
    // QUIEN FUE EL HDP Q SE AVENTO ESTA CHAKETONA -wenazo
    // Enero (0) a Junio (5) -> Pares (2, 4, 6)
    // Julio (6) a Diciembre (11) -> Impares (1, 3, 5)
    return (mes >= 0 && mes <= 5) ? [2, 4, 6] : [1, 3, 5];
  }; // Checar mes -> mostrar semestres 

  const actualizarBotonesSemestre = () => {
    const semestres = determinarSemestresDisponibles();
    const contenedor = document.getElementById('selector-semestres');
    if (!contenedor) return;

    const botones = contenedor.querySelectorAll('button');
    botones.forEach((boton, index) => {
      const sem = semestres[index];
      boton.textContent = `${sem}do`; 
      if (sem === 1) boton.textContent = '1ero';
      if (sem === 2) boton.textContent = '2do';
      if (sem === 3) boton.textContent = '3ero';
      if (sem === 4) boton.textContent = '4to';
      if (sem === 5) boton.textContent = '5to';
      if (sem === 6) boton.textContent = '6to';
      
      boton.setAttribute('data-semestre', sem);
      
      if (index === 2) { 
        semestreSeleccionado = sem;
        botones.forEach(b => b.classList.remove('activo-primario'));
        boton.classList.add('activo-primario');
      }
    });
  };

  const renderizarTabla = () => { // Renderiza la tabla principal de horarios depende el semestre seleccionado y el modo
    const cuerpoTabla = document.getElementById('cuerpo-tabla-horarios');
    if (!cuerpoTabla) return;

    cuerpoTabla.innerHTML = '';

    let gruposFiltrados = grupos.filter(g => Number(g.semestre) === Number(semestreSeleccionado));
    // Solo mostrar grupos con clases el día seleccionado
    if (modoVista === 'dinamica') {
      gruposFiltrados = gruposFiltrados.filter(g =>
        horario_dinamico.some(d => Number(d.id_grupo) === Number(g.id_grupo)) ||
        horario_fijo.some(h => Number(h.id_grupo) === Number(g.id_grupo) && h.dia === diaSeleccionadoTabla)
      );
    } else {
      gruposFiltrados = gruposFiltrados.filter(g =>
        horario_fijo.some(h => Number(h.id_grupo) === Number(g.id_grupo) && h.dia === diaSeleccionadoTabla)
      );
    }

    const ausenteTitularEnHora = (h) => {
      if (modoVista !== 'dinamica') return false;
      const pid = Number(h?.id_profesor);
      const gid = Number(h?.id_grupo);
      const startMin = timeToMinutes(h?.hora_inicio);
      const endMin = timeToMinutes(h?.hora_fin);
      if (!Number.isFinite(pid) || !Number.isFinite(gid) || startMin === null) return false;
      return ausencias_profesor.some((a) =>
        (a.fecha || fechaDinamica) === fechaDinamica &&
        normalizarTipoIncidencia(a.tipo_incidencia ?? a.tipo) === 'ausencia_profesor' &&
        Number(a.id_profesor) === pid &&
        Number(a.id_grupo) === gid &&
        (() => {
          const aMin = timeToMinutes(a.hora);
          return aMin !== null && aMin >= startMin && (endMin === null || aMin < endMin);
        })()
      );
    };

    gruposFiltrados.forEach(grupo => {
      const fila = document.createElement('tr');
      
      // Columna de grupo
      const tdGrupo = document.createElement('td');
      tdGrupo.className = 'columna-grupo';
      tdGrupo.textContent = grupo.nombre_grupo;
      fila.appendChild(tdGrupo);

      const celdasCubiertas = new Set();

      // Columnas de horas
      franjasHorarias.forEach((hora, index) => {
        if (celdasCubiertas.has(index)) return;

        const tdHora = document.createElement('td');
        
        // Buscar clase
        let horario = null;
        let esDinamico = false;
        let infoDinamica = null;

        if (modoVista === 'dinamica') {
          // Premier buscar en dinamico
          infoDinamica = horario_dinamico.find(
            (d) =>
              Number(d.id_grupo) === Number(grupo.id_grupo) &&
              normalizarDia(d.dia) === diaSeleccionadoTabla &&
              hhmm(d.hora_inicio) === hhmm(hora)
          );

          if (infoDinamica) {
            const hf = horario_fijo.find(
              (f) => Number(f.id_horario_fijo_detalle) === Number(infoDinamica.id_horario_fijo_detalle)
            );
            horario = {
              ...hf,
              ...infoDinamica,
              id_salon: infoDinamica.id_salon_temporal || hf?.id_salon
            };
            esDinamico = true;
          } else {
            // Si no hay dinamico, buscar fijo
            horario = horario_fijo.find(h => h.id_grupo === grupo.id_grupo && h.dia === diaSeleccionadoTabla && h.hora_inicio === hora);

            // Si la clase fija existe y tiene adelantos, debe conservarse la parte no adelantada.
            // Regla: si se adelantó 1 de 2 horas, queda 1 hora original; si se adelantó toda, ya no se muestra.
            if (horario) {
              const dinamicosMismaClase = horario_dinamico.filter(
                (d) => Number(d.id_horario_fijo_detalle) === Number(horario.id_horario_fijo_detalle)
              );
              const adelantosMismaClase = dinamicosMismaClase.filter((d) =>
                String(d?.motivo || d?.motivo_cambio || '').toLowerCase().includes('adelanto')
              );
              const bloquesAdelantados = adelantosMismaClase.reduce((acc, d) => {
                const dHi = timeToMinutes(d.hora_inicio);
                const dHfRaw = timeToMinutes(d.hora_fin);
                if (dHi === null || dHfRaw === null) return acc + 1;
                const dHfBoundary = (dHfRaw % 60 === 0 && dHfRaw > dHi)
                  ? dHfRaw
                  : (Math.floor(dHfRaw / 60) * 60 + 60);
                const bloques = Math.max(1, Math.ceil((dHfBoundary - dHi) / 60));
                return acc + bloques;
              }, 0);
              if (bloquesAdelantados > 0) {
                const hi = timeToMinutes(horario.hora_inicio);
                const hfRaw = timeToMinutes(horario.hora_fin);
                if (hi !== null && hfRaw !== null) {
                  const hfBoundary = (hfRaw % 60 === 0 && hfRaw > hi)
                    ? hfRaw
                    : (Math.floor(hfRaw / 60) * 60 + 60);
                  const bloquesSesion = Math.max(1, Math.ceil((hfBoundary - hi) / 60));
                  const bloquesRestantes = bloquesSesion - bloquesAdelantados;

                  if (bloquesRestantes <= 0) {
                    horario = null;
                  } else {
                    const nuevoFin = hi + bloquesRestantes * 60;
                    horario = { ...horario, hora_fin: minutesToHHMM(nuevoFin) };
                  }
                }
              }
              // Si otra clase del mismo grupo se adelantó a un horario que cae dentro de esta clase,
              // truncar esta clase al inicio del adelanto (para que la clase adelantada ocupe su lugar)
              if (horario) {
                const horarioHi = timeToMinutes(horario.hora_inicio);
                const horarioHf = timeToMinutes(horario.hora_fin);
                if (horarioHi !== null && horarioHf !== null) {
                  const grupoAdelantos = horario_dinamico.filter((d) =>
                    Number(d.id_grupo) === Number(grupo.id_grupo) &&
                    Number(d.id_horario_fijo_detalle) !== Number(horario.id_horario_fijo_detalle) &&
                    String(d?.motivo || d?.motivo_cambio || '').toLowerCase().includes('adelanto') &&
                    !String(d?.motivo || d?.motivo_cambio || '').toLowerCase().includes('reemplazado')
                  );
                  const adelantoInicio = grupoAdelantos.reduce((min, d) => {
                    const t = timeToMinutes(d.hora_inicio);
                    return t !== null && t > horarioHi && t < horarioHf && t < min ? t : min;
                  }, Infinity);
                  if (Number.isFinite(adelantoInicio) && adelantoInicio > horarioHi && adelantoInicio < horarioHf) {
                    horario = { ...horario, hora_fin: minutesToHHMM(adelantoInicio) };
                  }
                }
              }
            }
          }
        } else {
          // en robusta mostrar solo el día seleccionado (el hoy y solo laboral porq nose como va la vaina los sabados)
          horario = horario_fijo.find(h =>
            h.id_grupo === grupo.id_grupo &&
            h.dia === diaSeleccionadoTabla &&
            h.hora_inicio === hora
          );
        }
        
        if (horario) {
          const materia = materias.find(m => m.id_materia === horario.id_materia);
          const profesorUsuario = usuarios.find(u => u.id_usuarios === horario.id_profesor);
          const salon = salones.find(s => s.id_salon === horario.id_salon);
          const esAusenteTitular = ausenteTitularEnHora(horario);

          // Tamaño del bloque (colSpan) según duración real.
          // Cada columna representa 1 hora: [HH:00, HH+1:00). `hora_fin` es límite superior (exclusivo).
          let numBloques = 1;
          const inicioMin = timeToMinutes(horario.hora_inicio);
          const finMin = timeToMinutes(horario.hora_fin);
          if (inicioMin !== null && finMin !== null && finMin > inicioMin) {
            numBloques = Math.max(1, Math.ceil((finMin - inicioMin) / 60));
          }

          if (numBloques > 1) {
            tdHora.colSpan = numBloques;
            for (let i = 1; i < numBloques; i++) {
              celdasCubiertas.add(index + i);
            }
          }

          let claseColor = 'celda-exito';

          if (modoVista === 'dinamica') {
            if (esAusenteTitular) claseColor = 'celda-error';
            else if (esDinamico) claseColor = 'celda-advertencia';
          }
          
          const divCelda = document.createElement('div');
          divCelda.className = `celda-horario ${claseColor}`;
          
          divCelda.innerHTML = `
            <p class="materia-nombre">${materia?.nombre_materia || 'Materia'}</p>
            <p class="profesor-nombre">${(modoVista === 'dinamica' && esAusenteTitular) ? 'INSASISTENCIA' : (profesorUsuario?.nombre || 'Profesor')}</p>
            <div class="info-salon">
              <span class="material-symbols-outlined md-18">location_on</span>
              <span>${salon?.numero_salon || horario?.numero_salon || horario?.nombre_salon || 'S/N'}</span>
            </div>
          `;

          divCelda.addEventListener('click', () => {
            // Abrir el widget de info para cualquier tarjeta
            abrirModalInfo(horario);
          });

          tdHora.appendChild(divCelda); // Agregar la tarjeta a la celda
        } else {
          const divVacia = document.createElement('div');
          divVacia.className = 'celda-vacia';
          divVacia.textContent = 'Sin Asignación';
          divVacia.style.display = 'flex';
          divVacia.style.alignItems = 'center';
          divVacia.style.justifyContent = 'center';
          divVacia.style.color = '#9ca3af';
          divVacia.style.fontSize = '0.75rem';
          tdHora.appendChild(divVacia);
        }
        
        fila.appendChild(tdHora);
      });

      cuerpoTabla.appendChild(fila);
    });
  };

  const renderizarListadoGrupos = () => {
    const contenedor = document.getElementById('lista-grupos-robusta');
    if (!contenedor) return;
    contenedor.innerHTML = '';

    const gruposFiltrados = grupos.filter(g => Number(g.semestre) === Number(semestreSeleccionado));
    
    const gruposOrdenados = [...gruposFiltrados].sort((a, b) => {
      const aFijado = gruposFijados.includes(a.id_grupo);
      const bFijado = gruposFijados.includes(b.id_grupo);
      if (aFijado && !bFijado) return -1;
      if (!aFijado && bFijado) return 1;
      return 0;
    });

    gruposOrdenados.forEach(grupo => {
      const item = document.createElement('div');
      item.className = 'item-lista-robusta';
      const esFijado = gruposFijados.includes(grupo.id_grupo);
      item.innerHTML = `
        <div class="item-info-principal">
          <p class="item-titulo">${grupo.nombre_grupo}</p>
          <p class="item-subtitulo">${grupo.area_estudio}</p>
        </div>
        <div class="contenedor-checkbox">
          <input type="checkbox" class="checkbox-fijar" title="Fijar grupo" ${esFijado ? 'checked' : ''}>
        </div>
      `;
      
      const checkbox = item.querySelector('.checkbox-fijar'); // fija
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          if (!gruposFijados.includes(grupo.id_grupo)) {
            gruposFijados.push(grupo.id_grupo);
          }
        } else {
          gruposFijados = gruposFijados.filter(id => id !== grupo.id_grupo);
        }
        renderizarListadoGrupos();
      });

      const infoPrincipal = item.querySelector('.item-info-principal');
      infoPrincipal.addEventListener('click', () => {
        abrirModalDetalleGrupo(grupo.id_grupo);
      });

      contenedor.appendChild(item);
    });
  };

  const renderizarListadoProfesores = () => {
    const contenedor = document.getElementById('lista-profesores-robusta');
    if (!contenedor) return;
    contenedor.innerHTML = '';

    // Ordenar: fijados primero
    const profesoresOrdenados = [...profesores].sort((a, b) => { // 
      const aFijado = profesoresFijados.includes(a.id_profesor);
      const bFijado = profesoresFijados.includes(b.id_profesor);
      if (aFijado && !bFijado) return -1; // Si a esta fijado y b no, a va antes
      if (!aFijado && bFijado) return 1;
      return 0;
    });

    profesoresOrdenados.forEach(p => { // muestra todos los profesores (vienen del horario fijo)
      const usuario = usuarios.find(u => u.id_usuarios === p.id_profesor);
      const item = document.createElement('div');
      item.className = 'item-lista-robusta';
      const esFijado = profesoresFijados.includes(p.id_profesor);
      item.innerHTML = `
        <div class="item-info-principal">
          <p class="item-titulo">${usuario?.nombre || 'Profesor'}</p>
          <p class="item-subtitulo">—</p>
        </div>
        <div class="contenedor-checkbox">
          <input type="checkbox" class="checkbox-fijar" title="Fijar profesor" ${esFijado ? 'checked' : ''}>
        </div>
      `;

      const checkbox = item.querySelector('.checkbox-fijar');
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          if (!profesoresFijados.includes(p.id_profesor)) {
            profesoresFijados.push(p.id_profesor);
          }
        } else {
          profesoresFijados = profesoresFijados.filter(id => id !== p.id_profesor);
        }
        renderizarListadoProfesores();
      });

      const infoPrincipal = item.querySelector('.item-info-principal');
      infoPrincipal.addEventListener('click', () => {
        abrirModalDetalleProfesor(p.id_profesor);
      });

      contenedor.appendChild(item);
    });
  };

  const renderizarAlertasFaltantes = () => {
    const contenedor = document.getElementById('lista-alertas-faltantes');
    if (!contenedor) return;
    
    contenedor.innerHTML = '';

    // Alertas de datos faltantes en Horario_Fijo (profesor/salón/materia/grupo o cosas de ese estilo)
    const grupoPorId = new Map(grupos.map(g => [Number(g.id_grupo), g]));
    const materiaPorId = new Map(materias.map(m => [Number(m.id_materia), m]));
    const usuarioPorId = new Map(usuarios.map(u => [Number(u.id_usuarios), u]));
    const salonPorId = new Map(salones.map(s => [Number(s.id_salon), s]));

    const faltantes = [];
    for (const h of horario_fijo) {
      const g = grupoPorId.get(Number(h.id_grupo));
      const m = materiaPorId.get(Number(h.id_materia));
      const p = usuarioPorId.get(Number(h.id_profesor));
      const s = salonPorId.get(Number(h.id_salon));

      const contexto = `${g?.nombre_grupo || h?.nombre_grupo || 'Grupo'} • ${h?.dia || 'Día'} • ${h?.hora_inicio || '--:--'}-${h?.hora_fin || '--:--'}`;

      if (!g || !g.nombre_grupo) faltantes.push({ tipo: 'Grupo', detalle: contexto, periodo: '—' });
      if (!m || !m.nombre_materia) faltantes.push({ tipo: 'Materia', detalle: contexto, periodo: '—' });
      if (!p || !p.nombre) faltantes.push({ tipo: 'Profesor', detalle: contexto, periodo: '—' });
      if (!s || !s.numero_salon) faltantes.push({ tipo: 'Salón', detalle: contexto, periodo: '—' });

      // Auxiliar es opcional (gracias copilot por acordarme)
      if (h.id_auxiliar && !usuarioPorId.get(Number(h.id_auxiliar))) {
        faltantes.push({ tipo: 'Prof. Aux.', detalle: contexto, periodo: '—' });
      }
    }

    if (faltantes.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'tarjeta-alerta';
      empty.innerHTML = `
        <div class="alerta-icono exito">
          <span class="material-symbols-outlined md-20">check_circle</span>
        </div>
        <div class="alerta-texto">
          <p>Sin datos faltantes</p>
          <p>Todo el horario robusto tiene asignaciones completas.</p>
        </div>
      `;
      contenedor.appendChild(empty);
      return;
    }

    faltantes.forEach(item => {
      const div = document.createElement('div');
      div.className = 'tarjeta-alerta';
      div.innerHTML = `
        <div class="alerta-icono error">
          <span class="material-symbols-outlined md-20">database_off</span>
        </div>
        <div class="alerta-texto">
          <p>Falta ${item.tipo}</p>
          <p>${item.detalle}</p>
        </div>
      `;
      contenedor.appendChild(div);
    });
  };

  // Switch dinamico/robusto (pero no usa un switch, usa botones c:)
  // yo creo q void a empezar a contar todos los ifs 👀👀👀👀
  const selectorModo = document.getElementById('selector-modo-vista');
  if (selectorModo) {
    selectorModo.addEventListener('click', async (e) => {
      const boton = e.target.closest('button');
      if (boton) {
        modoVista = boton.getAttribute('data-modo');
        
        selectorModo.querySelectorAll('button').forEach(b => b.classList.remove('activo'));
        boton.classList.add('activo');

        const widgetsDinamicos = document.getElementById('widgets-dinamicos');
        const widgetsRobustos = document.getElementById('widgets-robustos');
        const botonNuevo = document.getElementById('boton-nuevo-registro');

        if (modoVista === 'robusta') {
          widgetsDinamicos.classList.add('oculto');
          widgetsRobustos.classList.remove('oculto');
          if (botonNuevo) botonNuevo.classList.remove('oculto');
          renderizarListadoGrupos();
          renderizarListadoProfesores();
          renderizarAlertasFaltantes();
        } else {
          widgetsDinamicos.classList.remove('oculto');
          widgetsRobustos.classList.add('oculto');
          if (botonNuevo) botonNuevo.classList.add('oculto');

          await cargarDatosDinamica(fechaHoyISO());
          const dia = diaDesdeFecha(fechaDinamica);
          if (['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'].includes(dia)) {
            diaSeleccionadoTabla = dia;
          }
          renderizarAdelantos();
          renderizarAlertas();
        }

        renderizarTabla();
      }
    });
  }

  await cargarDatosRobusta();
  actualizarBotonesSemestre();

  // Aplicar el modo inicial real (evita mismatch: HTML marca Dinamica activo pero JS estaba en robusta)
  (async function aplicarModoInicial() {
    const selectorModoInit = document.getElementById('selector-modo-vista');
    if (selectorModoInit) {
      selectorModoInit.querySelectorAll('button').forEach((b) => {
        b.classList.toggle('activo', b.getAttribute('data-modo') === modoVista);
      });
    }

    const widgetsDinamicos = document.getElementById('widgets-dinamicos');
    const widgetsRobustos = document.getElementById('widgets-robustos');
    const botonNuevo = document.getElementById('boton-nuevo-registro');

    if (modoVista === 'robusta') {
      if (widgetsDinamicos) widgetsDinamicos.classList.add('oculto');
      if (widgetsRobustos) widgetsRobustos.classList.remove('oculto');
      if (botonNuevo) botonNuevo.classList.remove('oculto');
      renderizarListadoGrupos();
      renderizarListadoProfesores();
      renderizarAlertasFaltantes();
    } else {
      if (widgetsDinamicos) widgetsDinamicos.classList.remove('oculto');
      if (widgetsRobustos) widgetsRobustos.classList.add('oculto');
      if (botonNuevo) botonNuevo.classList.add('oculto');

      await cargarDatosDinamica(fechaHoyISO());
      const dia = diaDesdeFecha(fechaDinamica);
      if (['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'].includes(dia)) {
        diaSeleccionadoTabla = dia;
      }
      renderizarAdelantos();
      renderizarAlertas();
    }

    renderizarTabla();
  })();

  // Dolor de cabeza para visibilidad (boton de registro)
  (function asegurarVisibilidadBotonNuevo() { // NI PERRA IDEA COMO HACERLO MAS LIMPIO, PERO FUNCIONA
    const botonNuevo = document.getElementById('boton-nuevo-registro');
    const widgetsDinamicos = document.getElementById('widgets-dinamicos');
    const widgetsRobustos = document.getElementById('widgets-robustos');
    if (!botonNuevo) return;
    if (modoVista === 'robusta') {
      botonNuevo.classList.remove('oculto');
      if (widgetsDinamicos) widgetsDinamicos.classList.add('oculto');
      if (widgetsRobustos) widgetsRobustos.classList.remove('oculto');
    } else {
      botonNuevo.classList.add('oculto');
      if (widgetsDinamicos) widgetsDinamicos.classList.remove('oculto');
      if (widgetsRobustos) widgetsRobustos.classList.add('oculto');
    }
  })();

  // Render inicial de widgets robustos
  // (el modo inicial ahora lo aplica aplicarModoInicial)

  const contenedorSemestres = document.getElementById('selector-semestres');
  if (contenedorSemestres) {
    contenedorSemestres.addEventListener('click', (e) => {
      const boton = e.target.closest('button');
      if (boton && boton.hasAttribute('data-semestre')) {
        semestreSeleccionado = parseInt(boton.getAttribute('data-semestre'));
        
        contenedorSemestres.querySelectorAll('button').forEach(b => b.classList.remove('activo-primario'));
        boton.classList.add('activo-primario');
        
        if (modoVista === 'robusta') {
          renderizarListadoGrupos();
        }
        renderizarTabla();
      }
    });
  }

  const renderizarAdelantos = () => {
    const contenedor = document.getElementById('contenedor-adelantos');
    if (!contenedor) return;

    contenedor.innerHTML = '';

    if (modoVista !== 'dinamica') return;

    const dia = diaDesdeFecha(fechaDinamica);
    if (!dia || !['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'].includes(dia)) {
      const empty = document.createElement('div');
      empty.className = 'tarjeta-adelanto';
      empty.innerHTML = `
        <div class="adelanto-info">
          <div class="adelanto-texto">
            <p>Sin adelantos</p>
            <p>Selecciona un día hábil.</p>
          </div>
        </div>
      `;
      contenedor.appendChild(empty);
      return;
    }

    const agruparSesiones = (slotsOrdenados) => {
      const normId = (v) => {
        const n = Number(v);
        if (!Number.isFinite(n) || n <= 0) return null;
        return n;
      };
      const sesiones = [];
      let actual = null;
      for (const slot of slotsOrdenados) {
        const hi = timeToMinutes(slot.hora_inicio);
        if (!actual) {
          actual = {
            slots: [slot],
            id_profesor: normId(slot.id_profesor),
            id_profesor_aux: normId(slot.id_profesor_aux ?? slot.id_auxiliar),
            id_materia: normId(slot.id_materia),
            id_grupo: normId(slot.id_grupo)
          };
          continue;
        }
        const prev = actual.slots[actual.slots.length - 1];
        const prevHi = timeToMinutes(prev.hora_inicio);
        const esConsecutivo = hi !== null && prevHi !== null && hi === prevHi + 60;
        const mismoBloque =
          normId(slot.id_profesor) === actual.id_profesor &&
          normId(slot.id_profesor_aux ?? slot.id_auxiliar) === actual.id_profesor_aux &&
          normId(slot.id_materia) === actual.id_materia &&
          normId(slot.id_grupo) === actual.id_grupo;

        if (esConsecutivo && mismoBloque) {
          actual.slots.push(slot);
        } else {
          sesiones.push(actual);
          actual = {
            slots: [slot],
            id_profesor: normId(slot.id_profesor),
            id_profesor_aux: normId(slot.id_profesor_aux ?? slot.id_auxiliar),
            id_materia: normId(slot.id_materia),
            id_grupo: normId(slot.id_grupo)
          };
        }
      }
      if (actual) sesiones.push(actual);
      return sesiones;
    };

    const expandirSlotsPorHora = (slots) => {
      const out = [];
      for (const slot of slots) {
        const hi = timeToMinutes(slot.hora_inicio);
        const hfRaw = timeToMinutes(slot.hora_fin);
        if (hi === null || hfRaw === null || hfRaw <= hi) {
          out.push(slot);
          continue;
        }

        const hfBoundary = (hfRaw % 60 === 0 && hfRaw > hi)
          ? hfRaw
          : (Math.floor(hfRaw / 60) * 60 + 60);
        const bloques = Math.max(1, Math.ceil((hfBoundary - hi) / 60));

        if (bloques <= 1) {
          out.push(slot);
          continue;
        }

        const durBase = Math.min(50, Math.max(1, hfRaw - hi));
        for (let i = 0; i < bloques; i++) {
          const ini = hi + i * 60;
          const fin = ini + durBase;
          out.push({
            ...slot,
            hora_inicio: minutesToHHMM(ini),
            hora_fin: minutesToHHMM(fin)
          });
        }
      }
      return out;
    };

    const slotsExpandidoPorGrupo = new Map();
    const getSlotsGrupoExpandido = (idGrupo) => {
      const gid = Number(idGrupo);
      if (!Number.isFinite(gid)) return [];
      if (slotsExpandidoPorGrupo.has(gid)) return slotsExpandidoPorGrupo.get(gid);
      const slots = horario_fijo
        .filter((h) => h.dia === dia && Number(h.id_grupo) === gid)
        .slice()
        .sort((a, b) => (timeToMinutes(a.hora_inicio) ?? 0) - (timeToMinutes(b.hora_inicio) ?? 0));
      const expanded = expandirSlotsPorHora(slots);
      slotsExpandidoPorGrupo.set(gid, expanded);
      return expanded;
    };

    const staffIds = (h) => {
      const ids = [h?.id_profesor, h?.id_profesor_aux ?? h?.id_auxiliar ?? null]
        .map((x) => (x === null || x === undefined || x === '' ? null : Number(x)))
        .filter((x) => Number.isFinite(x) && x > 0);
      return [...new Set(ids)];
    };

    const ocupaEnMinuto = (h, tMin) => {
      const hi = timeToMinutes(h?.hora_inicio);
      const hfRaw = timeToMinutes(h?.hora_fin);
      if (hi === null || hfRaw === null) return false;
      // Si está en la hora exacta (09:00), interpretarlo como 08:50 (regla -10 min)
      const hf = hfRaw % 60 === 0 && hfRaw > hi ? hfRaw - 10 : hfRaw;
      return tMin >= hi && tMin < hf;
    };

    const staffLibreEn = (ids, horaInicioHHMM) => {
      const tMin = timeToMinutes(horaInicioHHMM);
      if (!ids || ids.length === 0 || tMin === null) return false;
      return !horario_fijo.some((h) => {
        if (h.dia !== dia) return false;
        if (!ocupaEnMinuto(h, tMin)) return false;
        const hStaff = staffIds(h);
        return hStaff.some((pid) => ids.includes(pid));
      });
    };

    const staffLibreEnExcluyendo = (ids, horaInicioHHMM, excludeSlotIds = []) => {
      const tMin = timeToMinutes(horaInicioHHMM);
      if (!ids || ids.length === 0 || tMin === null) return false;
      const excludeSet = new Set(excludeSlotIds.map(id => Number(id)));
      return !horario_fijo.some((h) => {
        if (h.dia !== dia) return false;
        if (excludeSet.has(Number(h.id_horario_fijo_detalle))) return false; // Excluir slots de la sesión actual
        if (!ocupaEnMinuto(h, tMin)) return false;
        const hStaff = staffIds(h);
        if (!hStaff.some((pid) => ids.includes(pid))) return false;
        // Si esa clase está cancelada por incidencia, no bloquea disponibilidad
        const hGrupo = Number(h.id_grupo);
        if (horaLibrePorIncidencia(hGrupo, tMin)) return false;
        return true;
      });
    };

    const claseGrupoEnHora = (idGrupo, horaInicioHHMM) => {
      const slots = getSlotsGrupoExpandido(idGrupo);
      return slots.find((h) => hhmm(h.hora_inicio) === hhmm(horaInicioHHMM));
    };

    const ausenciasDia = ausencias_profesor
      .filter((a) => (a.fecha || fechaDinamica) === fechaDinamica)
      .filter((a) => normalizarTipoIncidencia(a.tipo_incidencia ?? a.tipo) === 'ausencia_profesor');
    const ausenciasPorGrupoTiempo = new Map();
    for (const a of ausenciasDia) {
      const gid = Number(a.id_grupo);
      const mins = timeToMinutes(a.hora);
      const pid = Number(a.id_profesor);
      if (!Number.isFinite(gid) || mins === null || !Number.isFinite(pid)) continue;
      if (!ausenciasPorGrupoTiempo.has(gid)) ausenciasPorGrupoTiempo.set(gid, new Map());
      const map = ausenciasPorGrupoTiempo.get(gid);
      if (!map.has(mins)) map.set(mins, new Set());
      map.get(mins).add(pid);
    }

    const ausenciaHorasPorGrupo = new Map();
    for (const idGrupo of ausenciasPorGrupoTiempo.keys()) {
      const slotsGrupoExpandido = getSlotsGrupoExpandido(idGrupo);
      if (slotsGrupoExpandido.length === 0) continue;

      const sesiones = agruparSesiones(slotsGrupoExpandido);
      const horasAusentes = new Set();

      for (const sesion of sesiones) {
        const primerSlot = sesion.slots[0];
        const startMins = timeToMinutes(primerSlot?.hora_inicio);
        if (startMins === null) continue;
        const req = staffIds(primerSlot);
        if (req.length === 0) continue;
        const grupoAusencias = ausenciasPorGrupoTiempo.get(Number(idGrupo));
        if (!grupoAusencias) continue;

        for (let i = 0; i < sesion.slots.length; i++) {
          const blockMins = startMins + i * 60;
          const absentSet = grupoAusencias.get(blockMins);
          if (!absentSet) continue;
          const cubreSesion = req.every((pid) => absentSet.has(pid));
          if (!cubreSesion) continue;
          for (let j = i; j < sesion.slots.length; j++) {
            horasAusentes.add(startMins + j * 60);
          }
          break;
        }
      }

      if (horasAusentes.size > 0) ausenciaHorasPorGrupo.set(Number(idGrupo), horasAusentes);
    }

    const horaLibrePorIncidencia = (idGrupo, startMins) => {
      const set = ausenciaHorasPorGrupo.get(Number(idGrupo));
      return set ? set.has(startMins) : false;
    };

    const propuestas = [];
    const visto = new Set();

    for (const [idGrupo, timeMap] of ausenciasPorGrupoTiempo.entries()) {
      const slotsGrupoExpandido = getSlotsGrupoExpandido(idGrupo);

      if (slotsGrupoExpandido.length === 0) continue;

      const sesiones = agruparSesiones(slotsGrupoExpandido);
      const ultimaSesion = sesiones[sesiones.length - 1];
      if (!ultimaSesion || ultimaSesion.slots.length === 0) continue;

      const slotFinal = ultimaSesion.slots[ultimaSesion.slots.length - 1];
      const primerSlot = ultimaSesion.slots[0];
      const origenStartMins = timeToMinutes(slotFinal.hora_inicio);
      if (origenStartMins === null) continue;
      const sesionStartMins = timeToMinutes(primerSlot.hora_inicio);
      if (sesionStartMins === null) continue;

      const durSlot = (() => {
        const hi = timeToMinutes(slotFinal.hora_inicio);
        const hf = timeToMinutes(slotFinal.hora_fin);
        if (hi === null || hf === null) return 50;
        return Math.max(1, hf - hi);
      })();

      const sesionLen = ultimaSesion.slots.length;
      const titularIdSesion = Number(ultimaSesion.id_profesor);
      if (!Number.isFinite(titularIdSesion)) continue;

      const ausenciaStarts = [...timeMap.keys()].sort((a, b) => a - b);
      for (const ausenciaStartMins of ausenciaStarts) {
        // la hora libre debe ser antes del inicio de la sesión final
        if (ausenciaStartMins >= sesionStartMins) continue;

        // Si en esa hora no esta libre por incidencia no cuenta.
        if (!horaLibrePorIncidencia(idGrupo, ausenciaStartMins)) continue;

        // Calcular cuantas horas consecutivas están libres
        // Cada hora debe estar libre por ausencia y con porfe disponible
        // Excluir de check de disponibilidad los slots de la sesión actual (nos esta follando el dinamico a copilot y a mi D:)
        const excludeSlotIds = ultimaSesion.slots.map(s => Number(s.id_horario_fijo_detalle));
        let maxConsec = 0;
        for (let i = 0; i < sesionLen; i++) {
          const t = ausenciaStartMins + i * 60;
          if (!horaLibrePorIncidencia(idGrupo, t)) break;
          if (!staffLibreEnExcluyendo([titularIdSesion], minutesToHHMM(t), excludeSlotIds)) break;
          maxConsec++;
        }
        if (maxConsec <= 0) continue;

        const grupo = grupos.find((g) => Number(g.id_grupo) === Number(idGrupo));
        const materia = materias.find((m) => Number(m.id_materia) === Number(slotFinal.id_materia));
        const durBloque = 50;

        // Calcular el maximo de bloques de horas que se pueden adelantar (hasta la polla)
        // Se crea la sola propuesta tarjetita con el maximo, no duplicados coño
        const maxParcial = Math.min(maxConsec, sesionLen);
        if (maxParcial > 0) {
          const slotsOrigen = ultimaSesion.slots.slice(sesionLen - maxParcial);
          const key = `${slotsOrigen.map((s) => s.id_horario_fijo_detalle).join('-')}-${ausenciaStartMins}`;
          if (!visto.has(key)) {
            visto.add(key);

            propuestas.push({
              id_grupo: idGrupo,
              dia,
              fecha: fechaDinamica,
              id_profesor: titularIdSesion,
              id_materia: Number(slotFinal.id_materia),
              grupo_nombre: grupo?.nombre_grupo || String(idGrupo),
              materia_nombre: materia?.nombre_materia || 'Materia',
              slots_origen: slotsOrigen,
              destino_start_mins: ausenciaStartMins,
              bloques_a_mover: maxParcial,
              dur_mins: durBloque,
              motivo: 'Adelanto por incidencia'
            });
          }
        }
      }
    }

    // excluir aquellas bloques ya fueron completamente adelantados
    const propuestasNoAdelantadas = propuestas.filter((prop) => {
      const slotIds = new Set((prop.slots_origen || []).map((s) => Number(s.id_horario_fijo_detalle)));
      if (slotIds.size === 0) return true; // Sin info de origen, mantener

      const adelantosParaEstaClase = horario_dinamico.filter((d) =>
        Number(d.id_horario_fijo_detalle) && slotIds.has(Number(d.id_horario_fijo_detalle))
      );

      // Todos los slots deben tener al menos un adelanto
      const slotsConAdelanto = new Set(adelantosParaEstaClase.map((d) => Number(d.id_horario_fijo_detalle)));
      const todosAdelantados = Array.from(slotIds).every((id) => slotsConAdelanto.has(id));

      // Mantener solo si NO está completamente adelantada (nah ni copilot ni yo sabemos q fumada paso aqui)
      return !todosAdelantados;
    });

    adelantosPropuestos = propuestasNoAdelantadas;

    if (adelantosPropuestos.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'tarjeta-adelanto';
      empty.innerHTML = `
        <div class="adelanto-info">
          <div class="adelanto-texto">
            <p>Sin adelantos</p>
            <p>No hay incidencias con condiciones para adelantar.</p>
          </div>
        </div>
      `;
      contenedor.appendChild(empty);
      return;
    }

    const adelantosOrdenados = adelantosPropuestos
      .map((p, originalIdx) => ({ p, originalIdx }))
      .sort((a, b) => {
        const da = a.p?.destino_start_mins ?? 0;
        const db = b.p?.destino_start_mins ?? 0;
        if (da !== db) return da - db;
        const la = Array.isArray(a.p?.slots_origen) ? a.p.slots_origen.length : 1;
        const lb = Array.isArray(b.p?.slots_origen) ? b.p.slots_origen.length : 1;
        // Mostrar primero las propuestas mas cortas
        return la - lb;
      });

    adelantosOrdenados.forEach(({ p, originalIdx }) => {
        const slots = Array.isArray(p.slots_origen) ? p.slots_origen : [];
        const slotOrigIni = slots[0] || null;
        const slotOrigFin = slots[slots.length - 1] || null;

        const origenText = slotOrigIni && slotOrigFin
          ? `${hhmm(slotOrigIni.hora_inicio)} - ${hhmm(slotOrigFin.hora_fin)}`
          : '-';

        const destinoInicio = minutesToHHMM(p.destino_start_mins);
        const destinoFin = minutesToHHMM(p.destino_start_mins + (Math.max(1, slots.length) - 1) * 60 + p.dur_mins);

        const div = document.createElement('div');
        div.className = 'tarjeta-adelanto';
        // usar el indice real del arreglo
        div.dataset.idx = String(originalIdx);
        div.innerHTML = `
          <div class="adelanto-info">
            <div class="etiqueta-grupo">${p.grupo_nombre}</div>
            <div class="adelanto-texto">
              <p>${p.materia_nombre} · ${p.bloques_a_mover || slots.length} bloque(s)</p>
              <p>${origenText}</p>
            </div>
          </div>
          <span class="material-symbols-outlined md-24">trending_flat</span>
          <p class="adelanto-hora">${destinoInicio} - ${destinoFin}</p>
        `;
        contenedor.appendChild(div);
      });
  };

  // Modal adelanto con selectores de hora y seleccion de salon
  const modalConfirmarAdelanto = document.getElementById('modal-confirmar-adelanto');
  const btnCancelarAdelanto = document.getElementById('cancelar-adelanto');
  const btnConfirmarAdelanto = document.getElementById('confirmar-adelanto');
  const cerrarModalConfirmarAdelanto = document.getElementById('cerrar-modal-confirmar-adelanto');
  const infoAdelantoClase = document.getElementById('info-adelanto-clase');
  const adelantoHoraInicio = document.getElementById('adelanto-hora-inicio');
  const adelantoHoraFin = document.getElementById('adelanto-hora-fin');
  const adelantoSalonBtn = document.getElementById('adelanto-salon-btn');
  let adelantoRangoInicio = null;
  let adelantoRangoFin = null;

  const iniciarFlujoAdelanto = (propuesta) => {
    adelantoPendiente = propuesta;
    salonSeleccionadoAdelanto = null;
    salonModoSeleccion = 'adelanto';
    adelantoRangoInicio = null;
    adelantoRangoFin = null;
    if (btnConfirmarAdelanto) btnConfirmarAdelanto.disabled = true;
    if (adelantoSalonBtn) adelantoSalonBtn.disabled = true;
    if (adelantoSalonBtn) adelantoSalonBtn.querySelector('span:last-child').textContent = 'Seleccionar salón';

    const slots = propuesta.slots_origen || [];
    const primerSlot = slots[0] || {};
    const ultimoSlot = slots[slots.length - 1] || {};
    const origInicio = hhmm(primerSlot.hora_inicio);
    const origFin = hhmm(ultimoSlot.hora_fin);
    if (infoAdelantoClase) {
      infoAdelantoClase.innerHTML = `
        <div style="display:flex;justify-content:space-between;">
          <div><strong>${propuesta.materia_nombre || 'Materia'}</strong> · ${propuesta.grupo_nombre || ''}</div>
          <div style="color:#6b7280;">Original: ${origInicio} - ${origFin}</div>
        </div>`;
    }

    const rangeStart = propuesta.destino_start_mins;
    const totalBlocks = propuesta.bloques_a_mover;
    const rangeEnd = rangeStart + totalBlocks * 60;
    const step = 60;
    if (adelantoHoraInicio) {
      adelantoHoraInicio.innerHTML = '<option value="">-- Hora inicio --</option>';
      for (let m = rangeStart; m < rangeEnd; m += step) {
        const opt = document.createElement('option');
        opt.value = String(m);
        opt.textContent = minutesToHHMM(m);
        adelantoHoraInicio.appendChild(opt);
      }
    }
    if (adelantoHoraFin) {
      adelantoHoraFin.innerHTML = '<option value="">-- Hora fin --</option>';
    }
    if (modalConfirmarAdelanto) modalConfirmarAdelanto.classList.add('activo');
  };

  if (adelantoHoraInicio) {
    adelantoHoraInicio.addEventListener('change', () => {
      const val = adelantoHoraInicio.value;
      adelantoRangoInicio = val ? Number(val) : null;
      if (adelantoHoraFin) {
        adelantoHoraFin.innerHTML = '<option value="">-- Hora fin --</option>';
        if (adelantoRangoInicio !== null) {
          const propuesta = adelantoPendiente;
          const rangeStart = propuesta?.destino_start_mins ?? 0;
          const totalBlocks = propuesta?.bloques_a_mover ?? 0;
          const rangeEnd = rangeStart + totalBlocks * 60;
          const step = 60;
          for (let m = adelantoRangoInicio + step; m <= rangeEnd; m += step) {
            const opt = document.createElement('option');
            opt.value = String(m);
            opt.textContent = minutesToHHMM(m);
            adelantoHoraFin.appendChild(opt);
          }
        }
      }
      adelantoRangoFin = null;
      if (adelantoSalonBtn) adelantoSalonBtn.disabled = true;
      if (btnConfirmarAdelanto) btnConfirmarAdelanto.disabled = true;
      if (adelantoSalonBtn) adelantoSalonBtn.querySelector('span:last-child').textContent = 'Seleccionar salón';
    });
  }

  if (adelantoHoraFin) {
    adelantoHoraFin.addEventListener('change', () => {
      adelantoRangoFin = adelantoHoraFin.value ? Number(adelantoHoraFin.value) : null;
      if (adelantoRangoInicio !== null && adelantoRangoFin !== null) {
        if (adelantoSalonBtn) {
          adelantoSalonBtn.disabled = false;
          if (salonSeleccionadoAdelanto?.id_salon) {
            const sn = salonSeleccionadoAdelanto.numero_salon || salonSeleccionadoAdelanto.nombre_salon || 'Seleccionar salón';
            adelantoSalonBtn.querySelector('span:last-child').textContent = `Salón: ${sn}`;
          }
        }
      }
    });
  }

  if (adelantoSalonBtn) {
    adelantoSalonBtn.addEventListener('click', () => {
      if (adelantoRangoInicio === null || adelantoRangoFin === null || !adelantoPendiente) return;
      abrirModalSalonConContexto({
        fecha: fechaDinamica,
        dia: adelantoPendiente.dia,
        hora_inicio: minutesToHHMM(adelantoRangoInicio),
        hora_fin: minutesToHHMM(adelantoRangoFin)
      });
    });
  }

  const contenedorAdelantos = document.getElementById('contenedor-adelantos');
  if (contenedorAdelantos) {
    contenedorAdelantos.addEventListener('click', (e) => {
      const tarjeta = e.target.closest('.tarjeta-adelanto');
      if (tarjeta) {
        const idx = Number(tarjeta.dataset.idx);
        const propuesta = adelantosPropuestos[idx];
        if (!propuesta) return;
        iniciarFlujoAdelanto(propuesta);
      }
    });
  }

  if (btnCancelarAdelanto) {
    btnCancelarAdelanto.addEventListener('click', () => {
      if (modalConfirmarAdelanto) modalConfirmarAdelanto.classList.remove('activo');
    });
  }
  if (cerrarModalConfirmarAdelanto) {
    cerrarModalConfirmarAdelanto.addEventListener('click', () => {
      if (modalConfirmarAdelanto) modalConfirmarAdelanto.classList.remove('activo');
    });
  }
  if (btnConfirmarAdelanto) {
    btnConfirmarAdelanto.addEventListener('click', async () => {
      if (!adelantoPendiente) {
        mostrarTostada({ titulo: 'Aviso', mensaje: 'No hay adelanto seleccionado.', tipo: 'advertencia' });
        return;
      }
      if (!salonSeleccionadoAdelanto?.id_salon) {
        mostrarTostada({ titulo: 'Aviso', mensaje: 'Selecciona un salón para el adelanto.', tipo: 'advertencia' });
        return;
      }

      if (adelantoRangoInicio === null || adelantoRangoFin === null) {
        mostrarTostada({ titulo: 'Aviso', mensaje: 'Selecciona el horario del adelanto.', tipo: 'advertencia' });
        return;
      }

      const idSalon = Number(salonSeleccionadoAdelanto.id_salon);
      const fecha = adelantoPendiente.fecha || fechaDinamica;
      const hi = minutesToHHMM(adelantoRangoInicio);
      const hf = minutesToHHMM(adelantoRangoFin);

      btnConfirmarAdelanto.disabled = true;
      try {
        const slotBase = Array.isArray(adelantoPendiente.slots_origen) && adelantoPendiente.slots_origen.length > 0
          ? adelantoPendiente.slots_origen[0]
          : null;
        const idDetalle = Number(slotBase?.id_horario_fijo_detalle);
        if (!idDetalle) throw new Error('No se pudo identificar el horario a adelantar.');

        await fetchJson(`/horarios/${idDetalle}/adelantar-clase`, {
          method: 'POST',
          auth: true,
          body: {
            fecha,
            hora_inicio: hi,
            hora_fin: hf,
            id_salon_temporal: idSalon,
            motivo: adelantoPendiente.motivo || 'Adelanto de clase'
          }
        });

        if (modalConfirmarAdelanto) modalConfirmarAdelanto.classList.remove('activo');
        await cargarDatosDinamica(fecha);
        renderizarTabla();
        renderizarAdelantos();
        renderizarAlertas();
      } catch (err) {
        console.error(err);
        mostrarTostada({ titulo: 'Error', mensaje: err?.message || 'Error registrando adelanto', tipo: 'error' });
      } finally {
        btnConfirmarAdelanto.disabled = false;
      }
    });
  }

  window.addEventListener('click', (e) => {
    if (e.target === modalConfirmarAdelanto) {
      modalConfirmarAdelanto.classList.remove('activo');
    }
  });

  const renderizarAlertas = () => {
    const contenedor = document.getElementById('contenedor-alertas');
    if (!contenedor) return;

    contenedor.innerHTML = '';

    if (modoVista !== 'dinamica') return;

    const alerts = [];
    for (const a of ausencias_profesor) {
      if ((a.fecha || fechaDinamica) !== fechaDinamica) continue;
      const tipoInc = normalizarTipoIncidencia(a.tipo_incidencia ?? a.tipo);
      alerts.push({
        tipo: (tipoInc === 'ausencia_profesor') ? 'ausencia' : 'incidencia',
        subtipo: tipoInc,
        fecha: a.fecha || fechaDinamica,
        hora: a.hora,
        id_profesor: a.id_profesor,
        id_grupo: a.id_grupo,
        accion_tomada: a.accion_tomada
      });
    }

    for (const h of horario_dinamico) {
      if ((h.fecha || fechaDinamica) !== fechaDinamica) continue;
      const motivo = String(h.motivo || h.motivo_cambio || '').toLowerCase();
      if (!motivo.includes('adelanto')) continue;
      alerts.push({
        tipo: 'adelanto',
        fecha: h.fecha || fechaDinamica,
        hora: h.hora_inicio,
        id_grupo: h.id_grupo,
        motivo: h.motivo || h.motivo_cambio || 'Adelanto'
      });
    }

    alerts.sort((a, b) => (timeToMinutes(b.hora) ?? 0) - (timeToMinutes(a.hora) ?? 0));

    if (alerts.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'tarjeta-alerta';
      empty.innerHTML = `
        <div class="alerta-icono exito">
          <span class="material-symbols-outlined md-20">check_circle</span>
        </div>
        <div class="alerta-texto">
          <p>Sin alertas</p>
          <p>No hay incidencias ni adelantamientos hoy.</p>
        </div>
      `;
      contenedor.appendChild(empty);
      return;
    }

    alerts.slice(0, 6).forEach((al) => {
      const div = document.createElement('div');
      div.className = 'tarjeta-alerta';
      if (al.tipo === 'ausencia') {
        const profesor = usuarios.find((u) => Number(u.id_usuarios) === Number(al.id_profesor));
        const grupo = grupos.find((g) => Number(g.id_grupo) === Number(al.id_grupo));
        div.innerHTML = `
          <div class="alerta-icono error">
            <span class="material-symbols-outlined md-20">person_off</span>
          </div>
          <div class="alerta-texto">
            <p>Ausencia: ${profesor?.nombre || 'Profesor'}</p>
            <p>Grupo ${grupo?.nombre_grupo || 'G'} • ${al.hora || 'S/H'}</p>
          </div>
        `;
      } else if (al.tipo === 'incidencia') {
        const grupo = grupos.find((g) => Number(g.id_grupo) === Number(al.id_grupo));
        div.innerHTML = `
          <div class="alerta-icono advertencia">
            <span class="material-symbols-outlined md-20">notifications_active</span>
          </div>
          <div class="alerta-texto">
            <p>Incidencia: ${etiquetaTipoIncidencia(al.subtipo)}</p>
            <p>Grupo ${grupo?.nombre_grupo || 'G'} • ${al.hora || 'S/H'}</p>
          </div>
        `;
      } else {
        const grupo = grupos.find((g) => Number(g.id_grupo) === Number(al.id_grupo));
        div.innerHTML = `
          <div class="alerta-icono advertencia">
            <span class="material-symbols-outlined md-20">warning</span>
          </div>
          <div class="alerta-texto">
            <p>Adelanto</p>
            <p>Grupo ${grupo?.nombre_grupo || 'G'} • ${al.hora || 'S/H'}</p>
          </div>
        `;
      }
      contenedor.appendChild(div);
    });
  };

  // infodal
  const modalDetalle = document.getElementById('modal-detalle');
  const cerrarModalDetalle = document.getElementById('cerrar-modal-detalle');
  const tituloModalDetalle = document.getElementById('titulo-modal-detalle');
  const infoEntidad = document.getElementById('info-entidad');
  const cabeceraTablaDetalle = document.getElementById('cabecera-tabla-detalle');
  const cuerpoTablaDetalle = document.getElementById('cuerpo-tabla-detalle');
  const selectorDiaModal = document.getElementById('selector-dia-modal');

  let entidadActual = null;
  let diaSeleccionadoModal = diaSeleccionadoTabla;

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

  const horarioSolapaBloque = (h, bloque) => {
    const [ini, fin] = String(bloque?.hora || '')
      .split('-')
      .map((s) => s.trim());
    const bStart = timeToMinutes(ini);
    const bEnd = timeToMinutes(fin);
    const hStart = timeToMinutes(h?.hora_inicio);
    const hEnd = timeToMinutes(h?.hora_fin);
    if (bStart === null || bEnd === null || hStart === null || hEnd === null) return false;
    // [hStart,hEnd) con [bStart,bEnd) una vergona esto
    return hStart < bEnd && hEnd > bStart;
  };

  const actualizarTablaDetalle = () => {
    if (!entidadActual) return;

    cuerpoTablaDetalle.innerHTML = '';
    
    if (entidadActual.tipo === 'grupo') {
      cabeceraTablaDetalle.innerHTML = `
        <tr>
          <th>Periodo</th>
          <th>Materia</th>
          <th>Profesor</th>
          <th>Salón</th>
        </tr>
      `;

      bloquesHorarios.forEach(bloque => {
        const h = horario_fijo.find(h =>
          h.id_grupo === entidadActual.id &&
          h.dia === diaSeleccionadoModal &&
          horarioSolapaBloque(h, bloque)
        );

        const fila = document.createElement('tr');
        if (h) {
          const materia = materias.find(m => m.id_materia === h.id_materia);
          const profesor = usuarios.find(u => u.id_usuarios === h.id_profesor);
          const salon = salones.find(s => s.id_salon === h.id_salon);
          
          fila.innerHTML = `
            <td><strong>${bloque.hora}</strong></td>
            <td>${materia?.nombre_materia || '-'}</td>
            <td>${profesor?.nombre || '-'}</td>
            <td>${salon?.numero_salon || '-'}</td>
          `;
        } else {
          fila.innerHTML = `
            <td><strong>${bloque.hora}</strong></td>
            <td colspan="3" style="color: #9ca3af; font-style: italic;">Sin clase</td>
          `;
        }
        cuerpoTablaDetalle.appendChild(fila);
      });

    } else if (entidadActual.tipo === 'profesor') {
      cabeceraTablaDetalle.innerHTML = `
        <tr>
          <th>Periodo</th>
          <th>Grupo</th>
          <th>Materia</th>
          <th>Tipo</th>
        </tr>
      `;

      bloquesHorarios.forEach(bloque => {
        const h = horario_fijo.find(h =>
          (h.id_profesor === entidadActual.id || h.id_profesor_aux === entidadActual.id || h.id_auxiliar === entidadActual.id) &&
          h.dia === diaSeleccionadoModal &&
          horarioSolapaBloque(h, bloque)
        );

        const fila = document.createElement('tr');
        if (h) {
          const grupo = grupos.find(g => g.id_grupo === h.id_grupo);
          const materia = materias.find(m => m.id_materia === h.id_materia);
          const profData = profesores.find(p => p.id_profesor === entidadActual.id);

          // Determinar si el profesor es titular o auxiliar en este horario
          let tipoTexto = '-';
          if (h.id_profesor === entidadActual.id) tipoTexto = 'Titular';
          else if (h.id_profesor_aux === entidadActual.id || h.id_auxiliar === entidadActual.id) tipoTexto = 'Auxiliar';

          fila.innerHTML = `
            <td><strong>${bloque.hora}</strong></td>
            <td>${grupo?.nombre_grupo || '-'}</td>
            <td>${materia?.nombre_materia || '-'}</td>
            <td>${tipoTexto}</td>
          `;
        } else {
          fila.innerHTML = `
            <td><strong>${bloque.hora}</strong></td>
            <td colspan="3" style="color: #9ca3af; font-style: italic;">Libre</td>
          `;
        }
        cuerpoTablaDetalle.appendChild(fila);
      });
    }
  };

  const abrirModalDetalleGrupo = (idGrupo) => {
    const grupo = grupos.find(g => g.id_grupo === idGrupo);
    if (!grupo || !modalDetalle) return;

    entidadActual = { tipo: 'grupo', id: idGrupo };
    tituloModalDetalle.textContent = `Horario del Grupo ${grupo.nombre_grupo}`;
  
    infoEntidad.innerHTML = `
      <div class="dato-entidad">
        <span class="etiqueta">Turno</span>
        <span class="valor">${grupo.turno}</span>
      </div>
      <div class="dato-entidad">
        <span class="etiqueta">Semestre</span>
        <span class="valor">${grupo.semestre}°</span>
      </div>
      <div class="dato-entidad">
        <span class="etiqueta">Carrera</span>
        <span class="valor">${grupo.area_estudio}</span>
      </div>
    `;

    actualizarTablaDetalle();
    modalDetalle.classList.add('activo');
  };

  const abrirModalDetalleProfesor = (idProfesor) => {
    const profesor = profesores.find(p => p.id_profesor === idProfesor);
    const usuario = usuarios.find(u => u.id_usuarios === idProfesor);
    if (!usuario || !modalDetalle) return;

    entidadActual = { tipo: 'profesor', id: idProfesor };
    tituloModalDetalle.textContent = `Horario del Profesor ${usuario.nombre}`;

    infoEntidad.innerHTML = `
      <div class="dato-entidad">
        <span class="etiqueta">Nombre</span>
        <span class="valor">${usuario.nombre}</span>
      </div>
    `;

    actualizarTablaDetalle();
    modalDetalle.classList.add('activo');
  };

  // Cambia el dia en modal
  if (selectorDiaModal) {
    selectorDiaModal.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        diaSeleccionadoModal = btn.getAttribute('data-dia');
        selectorDiaModal.querySelectorAll('button').forEach(b => b.classList.remove('activo-primario'));
        btn.classList.add('activo-primario');
        actualizarTablaDetalle();
      });
    });

    // Día inicial el mismo que se muestra en la tabla
    const btnInit = selectorDiaModal.querySelector(`[data-dia="${diaSeleccionadoModal}"]`);
    if (btnInit) btnInit.classList.add('activo-primario');
  }

  if (cerrarModalDetalle) {
    cerrarModalDetalle.addEventListener('click', () => {
      modalDetalle.classList.remove('activo');
    });
  }

  window.addEventListener('click', (e) => {
    if (e.target === modalDetalle) {
      modalDetalle.classList.remove('activo');
    }
  });

  // alertas Modal (no se como hacer un switch!!) (checa los datos wenaz) (no -wenaz)

  const modalAlertas = document.getElementById('modal-alertas');
  const cerrarModalAlertas = document.getElementById('cerrar-modal-alertas');
  const cuerpoModalAlertas = document.getElementById('cuerpo-modal-alertas');
  const botonesVerTodas = document.querySelectorAll('.boton-ver-todas, .btn-ver-todas');

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
    let todasLasAlertas = [];

    if (modoVista === 'dinamica') {
      // Alertas dinámicas: Incidencias + Adelantos
      ausencias_profesor
        .filter((a) => (a.fecha || fechaDinamica) === fechaDinamica)
        .forEach((a) => {
          const subtipo = normalizarTipoIncidencia(a.tipo_incidencia ?? a.tipo);
          todasLasAlertas.push({
            ...a,
            tipo: (subtipo === 'ausencia_profesor') ? 'ausencia' : 'incidencia',
            subtipo
          });
        });

      horario_dinamico
        .filter((h) => (h.fecha || fechaDinamica) === fechaDinamica)
        .filter((h) => String(h.motivo || h.motivo_cambio || '').toLowerCase().includes('adelanto'))
        .forEach((h) => todasLasAlertas.push({ ...h, tipo: 'adelanto' }));
    } else {
      // Alertas robustas: datos faltantes en Horario_Fijo
      const grupoPorId = new Map(grupos.map(g => [Number(g.id_grupo), g]));
      const materiaPorId = new Map(materias.map(m => [Number(m.id_materia), m]));
      const usuarioPorId = new Map(usuarios.map(u => [Number(u.id_usuarios), u]));
      const salonPorId = new Map(salones.map(s => [Number(s.id_salon), s]));
      const hoy = fechaHoyISO();

      for (const h of horario_fijo) {
        const g = grupoPorId.get(Number(h.id_grupo));
        const m = materiaPorId.get(Number(h.id_materia));
        const p = usuarioPorId.get(Number(h.id_profesor));
        const s = salonPorId.get(Number(h.id_salon));
        const contexto = `${g?.nombre_grupo || h?.nombre_grupo || 'Grupo'} • ${h?.dia || 'Día'} • ${h?.hora_inicio || '--:--'}-${h?.hora_fin || '--:--'}`;

        if (!g || !g.nombre_grupo) todasLasAlertas.push({ tipo: 'faltante', fecha: hoy, detalle: `Falta Grupo • ${contexto}` });
        if (!m || !m.nombre_materia) todasLasAlertas.push({ tipo: 'faltante', fecha: hoy, detalle: `Falta Materia • ${contexto}` });
        if (!p || !p.nombre) todasLasAlertas.push({ tipo: 'faltante', fecha: hoy, detalle: `Falta Profesor • ${contexto}` });
        if (!s || !s.numero_salon) todasLasAlertas.push({ tipo: 'faltante', fecha: hoy, detalle: `Falta Salón • ${contexto}` });
        if (h.id_auxiliar && !usuarioPorId.get(Number(h.id_auxiliar))) {
          todasLasAlertas.push({ tipo: 'faltante', fecha: hoy, detalle: `Falta Prof. Aux. • ${contexto}` });
        }
      }
    }

    // Descendente, arriba -> abajo, ya cayo?
    todasLasAlertas.sort((a, b) => b.fecha.localeCompare(a.fecha));

    // Agrupar por fecha
    const gruposPorFecha = {};
    todasLasAlertas.forEach(alerta => {
      if (!gruposPorFecha[alerta.fecha]) {
        gruposPorFecha[alerta.fecha] = [];
      }
      gruposPorFecha[alerta.fecha].push(alerta);
    });

    // Jala la fecha de los objetos como propiedad, y luego ordena esas fechas de forma descendente
    Object.keys(gruposPorFecha).sort((a, b) => b.localeCompare(a)).forEach(fecha => {
      
        // Separador de fecha (toma el formatear y lo separa)
      const separador = document.createElement('div');
      separador.className = 'separador-fecha';
      separador.innerHTML = `<span class="fecha-etiqueta">${formatearFecha(fecha)}</span>`;
      cuerpoModalAlertas.appendChild(separador);

      gruposPorFecha[fecha].forEach(alerta => {
        const div = document.createElement('div');
        div.className = 'tarjeta-alerta';
        
        if (alerta.tipo === 'ausencia') {
          const profesor = usuarios.find(u => u.id_usuarios === alerta.id_profesor);
          const grupo = grupos.find(g => g.id_grupo === alerta.id_grupo);
          div.innerHTML = `
            <div class="alerta-icono error">
              <span class="material-symbols-outlined md-20">person_off</span>
            </div>
            <div class="alerta-texto">
              <p>Ausencia: ${profesor?.nombre || 'Profesor'}</p>
              <p>Grupo ${grupo?.nombre_grupo || 'G'} • ${alerta.hora || 'S/H'}</p>
              <p>${alerta.accion_tomada || 'Sin acción registrada'}</p>
            </div>
          `;
        } else if (alerta.tipo === 'incidencia') {
          const grupo = grupos.find(g => g.id_grupo === alerta.id_grupo);
          div.innerHTML = `
            <div class="alerta-icono advertencia">
              <span class="material-symbols-outlined md-20">notifications_active</span>
            </div>
            <div class="alerta-texto">
              <p>Incidencia: ${etiquetaTipoIncidencia(alerta.subtipo)}</p>
              <p>Grupo ${grupo?.nombre_grupo || 'G'} • ${alerta.hora || 'S/H'}</p>
              <p>${alerta.accion_tomada || 'Sin acción registrada'}</p>
            </div>
          `;
        } else if (alerta.tipo === 'faltante') {
          div.innerHTML = `
            <div class="alerta-icono error">
              <span class="material-symbols-outlined md-20">database_off</span>
            </div>
            <div class="alerta-texto">
              <p>Dato faltante</p>
              <p>${alerta.detalle || '—'}</p>
            </div>
          `;
        } else if (alerta.tipo === 'adelanto') {
          const hf = horario_fijo.find(
            (h) => Number(h.id_horario_fijo_detalle) === Number(alerta.id_horario_fijo_detalle)
          );
          const grupo = grupos.find(g => g.id_grupo === (alerta.id_grupo ?? hf?.id_grupo));
          div.innerHTML = `
            <div class="alerta-icono advertencia">
              <span class="material-symbols-outlined md-20">warning</span>
            </div>
            <div class="alerta-texto">
              <p>Cambio/Adelanto: ${alerta.motivo || alerta.motivo_cambio || 'Adelanto'}</p>
              <p>Grupo ${grupo?.nombre_grupo || 'G'} • ${alerta.hora_inicio}</p>
            </div>
          `;
        }
        
        cuerpoModalAlertas.appendChild(div);
      });
    });

    modalAlertas.classList.add('activo');
  };

  botonesVerTodas.forEach(boton => {
    boton.addEventListener('click', abrirModalAlertas);
  });

  if (cerrarModalAlertas) {
    cerrarModalAlertas.addEventListener('click', () => {
      modalAlertas.classList.remove('activo');
    });
  }

  // Cerrar modal si click (pq no viene por defecto qn sabe, pero ce la vie)
  // lo peor es que si los medio junte luego, pero ya que paja
  window.addEventListener('click', (e) => {
    if (e.target === modalAlertas) {
      modalAlertas.classList.remove('activo');
    }
  });

  // advertencia + kebab (ifs c:) -> 5/11/2026 se añadio lo de historial (MALA MIA)
  // Mas que nada es para lo de borrar (que ni sirve) - 3/5/2026 -> ya no, ora tmb pal historial (tampoco sirve)

  const botonKebab = document.getElementById('boton-kebab');
  const menuKebab = document.getElementById('menu-kebab');
  const modalConfirmacion = document.getElementById('modal-confirmacion');
  const botonBorrar = document.getElementById('opcion-borrar');
  const botonCancelarModal = document.getElementById('cancelar-borrado');
  const opcionHistorial = document.getElementById('opcion-historial');
  const modalHistorial = document.getElementById('modal-historial');
  const cerrarHistorial = document.getElementById('cerrar-modal-historial');
  const botonConfirmarModal = document.getElementById('confirmar-borrado');
  const opcionHorarios = document.getElementById('opcion-horarios');
  const modalHorarios = document.getElementById('modal-horarios');
  const cerrarModalHorarios = document.getElementById('cerrar-modal-horarios');
  const contenedorHorariosJerarquico = document.getElementById('contenedor-horarios-jerarquico');
  const historialCiclo = document.getElementById('historial-ciclo');
  const historialMes = document.getElementById('historial-mes');
  const historialDia = document.getElementById('historial-dia');
  const historialMostrar = document.getElementById('historial-mostrar');
  const historialContenido = document.getElementById('historial-contenido');

  const generarOpcionesCiclo = () => {
    if (!historialCiclo) return;
    const cy = new Date().getFullYear();
    historialCiclo.innerHTML = '<option value="">-- Seleccionar Ciclo --</option>';
    for (let y = cy - 2; y <= cy + 2; y++) {
      const opt1 = document.createElement('option');
      opt1.value = `${y}-2`;
      opt1.textContent = `Ciclo ${y}-2 (Ene-Jun ${y})`;
      historialCiclo.appendChild(opt1);
      const opt2 = document.createElement('option');
      opt2.value = `${y}-1`;
      opt2.textContent = `Ciclo ${y}-1 (Jul-Dic ${y})`;
      historialCiclo.appendChild(opt2);
    }
  };

  const actualizarMeses = () => {
    if (!historialMes) return;
    historialMes.innerHTML = '<option value="">-- Seleccionar Mes --</option>';
    historialDia.innerHTML = '<option value="">-- Seleccionar Día --</option>';
    const cicloValue = historialCiclo.value;
    if (!cicloValue) return;
    const [yearStr, periodo] = cicloValue.split('-');
    const year = Number(yearStr);
    const meses = periodo === '2'
      ? ['Enero','Febrero','Marzo','Abril','Mayo','Junio']
      : ['Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const offset = periodo === '2' ? 0 : 6;
    historialMes.disabled = true;
    meses.forEach((label, i) => {
      const opt = document.createElement('option');
      opt.value = `${year}-${String(i + 1 + offset).padStart(2,'0')}`;
      opt.textContent = label;
      historialMes.appendChild(opt);
    });
    historialMes.disabled = false;
  };

  const actualizarDias = () => {
    if (!historialDia) return;
    historialDia.innerHTML = '<option value="">-- Seleccionar Día --</option>';
    const mesValue = historialMes.value;
    if (!mesValue) return;
    const [yearStr, monthStr] = mesValue.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const daysInMonth = new Date(year, month, 0).getDate();
    historialDia.disabled = true;
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month - 1, d);
      const dow = date.getDay();
      const opt = document.createElement('option');
      opt.value = `${year}-${monthStr}-${String(d).padStart(2,'0')}`;
      const diaSemana = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][dow];
      opt.textContent = `${String(d).padStart(2,'0')} - ${diaSemana}`;
      if (dow === 0 || dow === 6) opt.style.color = '#94a3b8';
      historialDia.appendChild(opt);
    }
    historialDia.disabled = false;
  };

  const renderizarHistorialCompleto = (rows, ausencias, fecha) => {
    const ausenteEnHora = (clase) => {
      const pid = Number(clase?.id_profesor);
      const gid = Number(clase?.id_grupo);
      const horaIni = String(clase?.hora_inicio_temp || clase?.hora_inicio || '').slice(0,5);
      if (!Number.isFinite(pid) || !Number.isFinite(gid) || !horaIni) return false;
      return ausencias.some(a =>
        normalizarTipoIncidencia(a.tipo_incidencia ?? a.tipo) === 'ausencia_profesor' &&
        Number(a.id_profesor) === pid &&
        Number(a.id_grupo) === gid &&
        String(a.hora || '').slice(0,5) === horaIni
      );
    };
    if (!rows.length) {
      historialContenido.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:40px;">Sin datos para esta fecha</p>';
      return;
    }
    const gruposUnicos = [...new Set(rows.map(r => r.nombre_grupo))].filter(Boolean).sort();
    const mapa = {};
    rows.forEach(r => {
      const g = r.nombre_grupo;
      if (!g) return;
      if (!mapa[g]) mapa[g] = [];
      mapa[g].push(r);
    });
    const htmlFilas = gruposUnicos.map(grupo => {
      const items = mapa[grupo];
      return `<tr>
        <td class="columna-grupo">${grupo}</td>
        ${franjasHorarias.map((hora, idx) => {
          const clase = items.find(r => {
            const ini = r.hora_inicio_temp || r.hora_inicio;
            const fin = r.hora_fin_temp || r.hora_fin;
            return ini && fin && timeToMinutes(ini) <= timeToMinutes(hora) && timeToMinutes(fin) > timeToMinutes(hora);
          });
          if (!clase) {
            return '<td><div class="celda-vacia" style="min-height:36px;"></div></td>';
          }
          if (idx > 0) {
            const prev = items.find(r => {
              const ini = r.hora_inicio_temp || r.hora_inicio;
              const fin = r.hora_fin_temp || r.hora_fin;
              return ini && fin && timeToMinutes(ini) <= timeToMinutes(franjasHorarias[idx - 1]) && timeToMinutes(fin) > timeToMinutes(franjasHorarias[idx - 1]);
            });
            if (prev === clase) return '';
          }
          const hInicio = String(clase.hora_inicio_temp || clase.hora_inicio || '').slice(0,5);
          const hFin = String(clase.hora_fin_temp || clase.hora_fin || '').slice(0,5);
          let numBloques = 1;
          const iniMin = timeToMinutes(hInicio);
          const finMin = timeToMinutes(hFin);
          if (iniMin !== null && finMin !== null && finMin > iniMin) {
            numBloques = Math.max(1, Math.ceil((finMin - iniMin) / 60));
          }
          const tieneDinamico = !!clase.id_horario_dinamico;
          const esAusente = ausenteEnHora(clase);
          let claseColor = 'celda-exito';
          if (esAusente) claseColor = 'celda-error';
          else if (tieneDinamico) claseColor = 'celda-advertencia';
          const colSpan = numBloques > 1 ? ` colspan="${numBloques}"` : '';
          return `<td${colSpan}>
            <div class="celda-horario ${claseColor} historial-compacto">
              <p class="materia-nombre">${clase.materia || '-'}</p>
              <p class="profesor-nombre">${esAusente ? 'INSASISTENCIA' : (clase.nombre_profesor || '-')}</p>
              <div class="info-salon">
                <span class="material-symbols-outlined md-18">location_on</span>
                <span>${clase.nombre_salon_temporal || clase.nombre_salon || ''}</span>
              </div>
            </div>
          </td>`;
        }).filter(Boolean).join('')}
      </tr>`;
    }).join('');
    historialContenido.innerHTML = `
      <div class="tabla-scroll">
        <table>
          <thead>
            <tr>
              <th style="min-width:90px;">Grupo</th>
              ${franjasHorarias.map(h => `<th>${h.slice(0,5)} - ${String(Number(h.slice(0,2)) + 1).padStart(2,'0')}:50</th>`).join('')}
            </tr>
          </thead>
          <tbody>${htmlFilas}</tbody>
        </table>
      </div>`;
  };

  const cargarHistorial = async () => {
    const fecha = historialDia.value;
    if (!fecha) return;
    const cicloValue = historialCiclo.value;
    const periodo = cicloValue ? cicloValue.split('-')[1] : null;
    const semestresPermitidos = periodo === '2' ? [2, 4, 6] : periodo === '1' ? [1, 3, 5] : null;
    historialContenido.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:40px;">Cargando...</p>';
    try {
      const [res, ausRes] = await Promise.all([
        fetchJson(`/horarios/tabla-dinamica?fecha=${encodeURIComponent(fecha)}`, { auth: true }),
        fetchJson(`/ausencias?fecha=${encodeURIComponent(fecha)}`, { auth: true }).catch(() => ({ ausencias: [] }))
      ]);
      let rows = res?.tabla || [];
      const ausencias = ausRes?.ausencias || [];
      if (semestresPermitidos) {
        rows = rows.filter(r => !r.semestre || semestresPermitidos.includes(Number(r.semestre)));
      }
      renderizarHistorialCompleto(rows, ausencias, fecha);
    } catch {
      historialContenido.innerHTML = '<p style="text-align:center;color:#dc2626;padding:40px;">Error de conexión</p>';
    }
  };

  if (historialCiclo) {
    generarOpcionesCiclo();
    historialCiclo.addEventListener('change', actualizarMeses);
  }
  if (historialMes) historialMes.addEventListener('change', actualizarDias);
  if (historialMostrar) historialMostrar.addEventListener('click', cargarHistorial);

  const DIAS_ORDEN = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];

  // Renderizar
  const renderizarHorariosJerarquico = () => {
    if (!contenedorHorariosJerarquico) return;
    contenedorHorariosJerarquico.innerHTML = '';

    // Agrupar horarios por semestre
    const semestresUnicos = [...new Set(grupos.map(g => g.semestre))].sort((a, b) => b - a);

    semestresUnicos.forEach(semestre => {
      const divSemestre = document.createElement('div');
      divSemestre.className = 'item-semestre-jerarquico';
      
      const headerSemestre = document.createElement('div');
      headerSemestre.className = 'header-semestre';
      headerSemestre.innerHTML = `
        <span class="material-symbols-outlined">school</span>
        <span class="texto-semestre">${semestre}° Semestre</span>
        <span class="material-symbols-outlined icono-expandir">expand_more</span>
      `;
      headerSemestre.style.cursor = 'pointer';
      
      const contenedorDias = document.createElement('div');
      contenedorDias.className = 'contenedor-dias-jerarquico';
      contenedorDias.style.display = 'none';

      const gruposPorSemestre = grupos.filter(g => g.semestre === semestre).sort((a, b) => a.nombre_grupo.localeCompare(b.nombre_grupo));

      DIAS_ORDEN.forEach(dia => {
        let tieneHorarios = false;
        for (const g of gruposPorSemestre) {
          if (horario_fijo.some(h => h.id_grupo === g.id_grupo && h.dia === dia)) {
            tieneHorarios = true;
            break;
          }
        }
        if (!tieneHorarios) return;

        const divDia = document.createElement('div');
        divDia.className = 'item-dia-jerarquico';

        const headerDia = document.createElement('div');
        headerDia.className = 'header-dia';
        const etiquetaDia = dia === 'Sabado' ? 'Sábado' : dia;
        headerDia.innerHTML = `
          <span class="material-symbols-outlined">calendar_today</span>
          <span class="texto-dia">${etiquetaDia}</span>
          <span class="material-symbols-outlined icono-expandir">expand_more</span>
        `;
        headerDia.style.cursor = 'pointer';

        const contenedorGrupos = document.createElement('div');
        contenedorGrupos.className = 'contenedor-grupos-jerarquico';
        contenedorGrupos.style.display = 'none';

        gruposPorSemestre.forEach(grupo => {
          const horariosGrupo = horario_fijo.filter(h => h.id_grupo === grupo.id_grupo && h.dia === dia).sort((a, b) => {
            const horaA = parseInt(a.hora_inicio.split(':')[0]);
            const horaB = parseInt(b.hora_inicio.split(':')[0]);
            return horaA - horaB;
          });

          if (horariosGrupo.length === 0) return;

          const divGrupo = document.createElement('div');
          divGrupo.className = 'item-grupo-jerarquico';
          
          const headerGrupo = document.createElement('div');
          headerGrupo.className = 'header-grupo';
          headerGrupo.innerHTML = `
            <span class="material-symbols-outlined">group</span>
            <span class="texto-grupo">${grupo.nombre_grupo}</span>
            <span class="material-symbols-outlined icono-expandir">expand_more</span>
          `;
          headerGrupo.style.cursor = 'pointer';
          
          const contenedorHorarios = document.createElement('div');
          contenedorHorarios.className = 'contenedor-horarios-items';
          contenedorHorarios.style.display = 'none';

          horariosGrupo.forEach(horario => {
            const materia = materias.find(m => m.id_materia === horario.id_materia);
            const profesor = usuarios.find(u => u.id_usuarios === horario.id_profesor);
            const profesorAux = usuarios.find(u => u.id_usuarios === horario.id_profesor_aux);
            const salon = salones.find(s => s.id_salon === horario.id_salon);

            const divHorario = document.createElement('div');
            divHorario.className = 'item-horario-jerarquico';
            divHorario.style.cursor = 'pointer';
            divHorario.innerHTML = `
              <div class="horario-info">
                <span class="horario-tiempo">${horario.hora_inicio} - ${horario.hora_fin}</span>
                <span class="horario-materia">${materia?.nombre_materia || 'Sin materia'}</span>
                <span class="horario-profesor">${profesor?.nombre || 'Sin profesor'}</span>
                <span class="horario-salon">${salon?.numero_salon || 'S/N'}</span>
              </div>
              <span class="material-symbols-outlined">info</span>
            `;

            divHorario.addEventListener('click', () => {
              abrirModalInfo(horario);
            });

            contenedorHorarios.appendChild(divHorario);
          });

          headerGrupo.addEventListener('click', () => {
            const estaAbierto = contenedorHorarios.style.display !== 'none';
            contenedorHorarios.style.display = estaAbierto ? 'none' : 'block';
            headerGrupo.querySelector('.icono-expandir').style.transform = estaAbierto ? 'rotate(0deg)' : 'rotate(180deg)';
          });

          divGrupo.appendChild(headerGrupo);
          divGrupo.appendChild(contenedorHorarios);
          contenedorGrupos.appendChild(divGrupo);
        });

        headerDia.addEventListener('click', () => {
          const estaAbierto = contenedorGrupos.style.display !== 'none';
          contenedorGrupos.style.display = estaAbierto ? 'none' : 'block';
          headerDia.querySelector('.icono-expandir').style.transform = estaAbierto ? 'rotate(0deg)' : 'rotate(180deg)';
        });

        divDia.appendChild(headerDia);
        divDia.appendChild(contenedorGrupos);
        contenedorDias.appendChild(divDia);
      });

      headerSemestre.addEventListener('click', () => {
        const estaAbierto = contenedorDias.style.display !== 'none';
        contenedorDias.style.display = estaAbierto ? 'none' : 'block';
        headerSemestre.querySelector('.icono-expandir').style.transform = estaAbierto ? 'rotate(0deg)' : 'rotate(180deg)';
      });

      divSemestre.appendChild(headerSemestre);
      divSemestre.appendChild(contenedorDias);
      contenedorHorariosJerarquico.appendChild(divSemestre);
    });
  };

  // Modal para editar horario (COMPLETO - todos los campos editables)
  const modalEditarHorario = document.createElement('div');
  modalEditarHorario.id = 'modal-editar-horario';
  modalEditarHorario.className = 'modal-overlay';
  modalEditarHorario.innerHTML = `
    <div class="modal-contenido modal-grande" style="max-width: 500px;">
      <div class="modal-cabecera">
        <h2 id="titulo-editar-horario">Editar Horario</h2>
        <button id="cerrar-editar-horario" class="boton-icono">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div class="modal-cuerpo">
        <form class="formulario-registro" id="form-editar-horario">
          <div class="campo-formulario">
            <label>Grupo</label>
            <select id="editar-grupo" required>
              <option value="">Seleccionar Grupo</option>
            </select>
          </div>
          <div class="campo-formulario">
            <label>Materia</label>
            <select id="editar-materia" required>
              <option value="">Seleccionar Materia</option>
            </select>
          </div>
          <div class="fila-formulario">
            <div class="campo-formulario">
              <label>Profesor</label>
              <select id="editar-profesor" required>
                <option value="">Seleccionar Profesor</option>
              </select>
            </div>
            <div class="campo-formulario">
              <label>Prof. Aux.</label>
              <select id="editar-profesor-aux">
                <option value="">Seleccionar Prof. Aux. (Opcional)</option>
              </select>
            </div>              
          </div>
          <div class="campo-formulario">
            <label>Día</label>
            <select id="editar-dia" required>
              <option value="Lunes">Lunes</option>
              <option value="Martes">Martes</option>
              <option value="Miercoles">Miercoles</option>
              <option value="Jueves">Jueves</option>
              <option value="Viernes">Viernes</option>
            </select>
          </div>
          <div class="fila-formulario">
            <div class="campo-formulario">
              <label>Hora Inicio</label>
              <input type="time" id="editar-hora-inicio" required>
            </div>
            <div class="campo-formulario">
              <label>Hora Fin</label>
              <input type="time" id="editar-hora-fin" required>
            </div>
          </div>
          <div class="campo-formulario">
            <label>Salón</label>
            <button type="button" id="editar-salon-btn" class="salon-selector-btn">Salón: —</button>
          </div>
          <button type="submit" class="boton-registro">Guardar cambios</button>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(modalEditarHorario);

  // Modal selector de salón para edición (reutiliza el mapa visual como en registro)
  const modalEditarSalon = document.createElement('div');
  modalEditarSalon.id = 'modal-editar-salon';
  modalEditarSalon.className = 'modal-overlay';
  modalEditarSalon.innerHTML = `
    <div class="modal-contenido modal-grande">
      <div class="modal-cabecera">
        <h2>Seleccionar Salón</h2>
        <button id="editar-salon-close" class="boton-icono">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div class="modal-cuerpo">
        <div class="salon-container">
          <div class="salon-container-header">
            <div style="height:12px;"></div>
          </div>
          <div class="sel-salon-layout">
            <div id="editar-salon-map" class="sel-mapa-contenedor">
              <div class="sel-cargando">Cargando mapa…</div>
            </div>

            <div class="sel-salon-footer">
              <div class="sel-pisos">
                <button type="button" class="btn-piso" data-piso="L">Planta Baja</button>
                <button type="button" class="btn-piso" data-piso="1">Piso 1</button>
                <button type="button" class="btn-piso" data-piso="2">Piso 2</button>
                <button type="button" class="btn-piso" data-piso="3">Piso 3</button>
              </div>
              <p class="sel-instruccion">Haz clic en un salón para seleccionarlo</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modalEditarSalon);

  let salonSeleccionadoEditar = null;
  let salonSelectorMapEditarApi = null;
  let horarioEditando = null;

  const inferBloqueHorarioExacto = (horaInicio) => {
    const idx = franjasHorarias.indexOf(String(horaInicio || '').trim());
    return idx >= 0 ? idx + 1 : null;
  };

  const miniSVGSalonEditar = (layoutData, fillColor, strokeColor) => {
    if (!layoutData) return '';
    const PAD = 8;

    let vbX, vbY, vbW, vbH, shapeEl;

    if (layoutData.puntos) {
      const pts = layoutData.puntos
        .trim()
        .split(/\s+/)
        .map(p => p.split(',').map(Number));
      vbX = Math.min(...pts.map(p => p[0]));
      vbY = Math.min(...pts.map(p => p[1]));
      vbW = Math.max(...pts.map(p => p[0])) - vbX;
      vbH = Math.max(...pts.map(p => p[1])) - vbY;
      shapeEl = `<polygon points="${layoutData.puntos}" />`;
    } else {
      vbX = layoutData.x;
      vbY = layoutData.y;
      vbW = layoutData.w;
      vbH = layoutData.h;
      shapeEl = `<rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" rx="6" />`;
    }

    const sw = Math.max(vbW, vbH) * 0.035;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX - PAD} ${vbY - PAD} ${vbW + PAD * 2} ${vbH + PAD * 2}" style="width:100%;height:100%;display:block;" preserveAspectRatio="xMidYMid meet">
      ${shapeEl.replace('/>', `fill="${fillColor}" fill-opacity="0.30" stroke="${strokeColor}" stroke-width="${sw}" stroke-linejoin="round" />`)}
    </svg>`;
  };

  const actualizarBotonSalonEditar = (sel) => {
    const btn = document.getElementById('editar-salon-btn');
    if (!btn) return;
    const salon = sel?.raw;
    const layoutData = sel?.layout;
    if (!salon) {
      salonSeleccionadoEditar = null;
      btn.classList.remove('salon-elegido');
      btn.textContent = 'Salón: —';
      return;
    }

    const estadoNorm = String(salon.estado || '').toLowerCase();
    let badgeClass = 'sin-estado';
    let fillColor = '#60003E';
    let strokeColor = '#60003E';
    let dotColor = '#60003E';
    let estadoLabel = salon.estado || 'Sin estado';

    if (estadoNorm.includes('disp')) {
      badgeClass = 'disponible';
      fillColor = '#10b981';
      strokeColor = '#059669';
      dotColor = '#16a34a';
    } else if (estadoNorm.includes('ocup')) {
      badgeClass = 'ocupado';
      fillColor = '#ef4444';
      strokeColor = '#dc2626';
      dotColor = '#dc2626';
    } else if (estadoNorm.includes('provi')) {
      badgeClass = 'provisional';
      fillColor = '#f59e0b';
      strokeColor = '#d97706';
      dotColor = '#d97706';
    } else if (estadoNorm.includes('mante')) {
      badgeClass = 'mantenimiento';
      fillColor = '#94a3b8';
      strokeColor = '#64748b';
      dotColor = '#94a3b8';
    }

    const pisoLabel = salon.piso !== undefined && salon.piso !== null ? `Piso ${salon.piso}` : '';
    const tipoLabel = salon.tipo ? ` · ${salon.tipo}` : '';
    const miniSvg = miniSVGSalonEditar(layoutData, fillColor, strokeColor);

    salonSeleccionadoEditar = sel;
    btn.classList.add('salon-elegido');
    btn.innerHTML = `
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

  const poblarSelectsEditar = () => {
    const selGrupo = document.getElementById('editar-grupo');
    const selMateria = document.getElementById('editar-materia');
    const selProfesor = document.getElementById('editar-profesor');
    const selProfesorAux = document.getElementById('editar-profesor-aux');
    
    if (!selGrupo || !selMateria || !selProfesor || !selProfesorAux) return;

    // Grupos
    selGrupo.innerHTML = '<option value="">Seleccionar Grupo</option>';
    grupos.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.id_grupo;
      opt.textContent = g.nombre_grupo;
      selGrupo.appendChild(opt);
    });

    // Materias
    selMateria.innerHTML = '<option value="">Seleccionar Materia</option>';
    materias.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id_materia;
      opt.textContent = m.nombre_materia;
      selMateria.appendChild(opt);
    });

    // Profesores
    selProfesor.innerHTML = '<option value="">Seleccionar Profesor</option>';
    usuarios.filter(u => u.tipo_usuario === 'Profesor').forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id_usuarios;
      opt.textContent = p.nombre;
      selProfesor.appendChild(opt);
    });

    // Profesores Auxiliares
    selProfesorAux.innerHTML = '<option value="">Seleccionar Prof. Aux.</option>';
    usuarios.filter(u => u.tipo_usuario === 'Profesor').forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id_usuarios;
      opt.textContent = p.nombre;
      selProfesorAux.appendChild(opt);
    });
  };

  const getRangoContextEditar = () => ({
    dia: document.getElementById('editar-dia')?.value,
    hora_inicio: document.getElementById('editar-hora-inicio')?.value,
    hora_fin: document.getElementById('editar-hora-fin')?.value
  });

  const refrescarDisponibilidadMapaEditar = async () => {
    if (!salonSelectorMapEditarApi?.setAvailabilityContext) return;
    await salonSelectorMapEditarApi.setAvailabilityContext(getRangoContextEditar());
  };

  const abrirModalEditarHorario = (horario, grupo, materia, profesor, profesorAux, salon) => {
    const modal = document.getElementById('modal-editar-horario');
    horarioEditando = horario;
    
    poblarSelectsEditar();

    document.getElementById('titulo-editar-horario').textContent = `Editar: ${materia?.nombre_materia || 'Horario'}`;
    document.getElementById('editar-grupo').value = grupo?.id_grupo || '';
    document.getElementById('editar-materia').value = materia?.id_materia || '';
    document.getElementById('editar-profesor').value = profesor?.id_usuarios || '';
    document.getElementById('editar-profesor-aux').value = profesorAux?.id_usuarios || '';
    document.getElementById('editar-hora-inicio').value = horario.hora_inicio;
    document.getElementById('editar-hora-fin').value = horario.hora_fin;
    document.getElementById('editar-dia').value = horario.dia || '';

    salonSeleccionadoEditar = null;
    if (salon) {
      actualizarBotonSalonEditar({
        raw: salon,
        layout: salon,
        numero_salon: salon.numero_salon
      });
    } else {
      document.getElementById('editar-salon-btn').textContent = 'Salón: —';
    }

    modal.classList.add('activo');

    const cerrarBtn = document.getElementById('cerrar-editar-horario');
    if (cerrarBtn) {
      cerrarBtn.onclick = () => modal.classList.remove('activo');
    }
  };

  // Manejar selector de salón en edición
  const editarSalonBtn = document.getElementById('editar-salon-btn');

  if (editarSalonBtn) {
    editarSalonBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Si ya hay un salón elegido, solo abrir si el clic fue en "Cambiar salón"
      if (editarSalonBtn.classList.contains('salon-elegido') && !e.target.closest('.salon-elegido-cambiar')) return;
      modalEditarSalon.classList.add('activo');

      const mapEl = document.getElementById('editar-salon-map');
      if (mapEl && !salonSelectorMapEditarApi) {
        initSalonSelectorMap({
          rootEl: modalEditarSalon,
          mapEl,
          availabilityContext: getRangoContextEditar(),
          onSelect: (sel) => {
            actualizarBotonSalonEditar(sel);
            modalEditarSalon.classList.remove('activo');
          }
        }).then((api) => {
          salonSelectorMapEditarApi = api;
        }).catch((err) => {
          console.error('No se pudo inicializar el mapa de salones (edición)', err);
        });
      } else {
        refrescarDisponibilidadMapaEditar().catch(() => {});
      }
    });
  }

  const editarSalonCloseBtn = document.getElementById('editar-salon-close');
  if (editarSalonCloseBtn) {
    editarSalonCloseBtn.addEventListener('click', () => {
      modalEditarSalon.classList.remove('activo');
      const tt = document.querySelector('.sel-tooltip');
      if (tt) tt.style.display = 'none';
    });
  }

  // Refrescar ocupación cuando cambien día/horas en edición
  const onRangoChangeEditar = () => {
    refrescarDisponibilidadMapaEditar().catch(() => {});
  };
  document.getElementById('editar-dia')?.addEventListener('change', onRangoChangeEditar);
  document.getElementById('editar-hora-inicio')?.addEventListener('change', onRangoChangeEditar);
  document.getElementById('editar-hora-fin')?.addEventListener('change', onRangoChangeEditar);

  const formEditarHorario = document.getElementById('form-editar-horario');
  if (formEditarHorario) {
    formEditarHorario.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!horarioEditando?.id_horario_fijo_detalle) {
        mostrarTostada({ titulo: 'Error', mensaje: 'No se pudo identificar el horario a editar.', tipo: 'error' });
        return;
      }

      const idGrupo = Number(document.getElementById('editar-grupo')?.value);
      const idMateria = Number(document.getElementById('editar-materia')?.value);
      const idProfesor = Number(document.getElementById('editar-profesor')?.value);
      const idProfesorAux = Number(document.getElementById('editar-profesor-aux')?.value) || null;
      const horaInicio = document.getElementById('editar-hora-inicio')?.value;
      const horaFin = document.getElementById('editar-hora-fin')?.value;
      const dia = document.getElementById('editar-dia')?.value;

      if (!idGrupo || !idMateria || !idProfesor) {
        mostrarTostada({ titulo: 'Aviso', mensaje: 'Selecciona Grupo, Materia y Profesor antes de guardar.', tipo: 'advertencia' });
        return;
      }

      const bloque = inferBloqueHorarioExacto(horaInicio);
      if (!bloque) {
        mostrarTostada({ titulo: 'Aviso', mensaje: 'La hora de inicio debe ser exactamente una franja (07:00, 08:00, ... 20:00).', tipo: 'advertencia' });
        return;
      }

      if (!salonSeleccionadoEditar) {
        mostrarTostada({ titulo: 'Aviso', mensaje: 'Selecciona un salón antes de guardar.', tipo: 'advertencia' });
        return;
      }

      const idSalon = salonSeleccionadoEditar?.raw?.id_salon || salonSeleccionadoEditar?.id_salon;

      try {
        await fetchJson(`/horarios/${horarioEditando.id_horario_fijo_detalle}`, {
          method: 'PUT',
          auth: true,
          body: {
            id_grupo: idGrupo,
            id_materia: idMateria,
            id_profesor: idProfesor,
            id_profesor_aux: idProfesorAux,
            id_salon: Number(idSalon),
            hora_inicio: horaInicio,
            hora_fin: horaFin,
            dia,
            bloque_horario: bloque
          }
        });

        await cargarDatosRobusta();
        renderizarTabla();
        renderizarHorariosJerarquico();
        if (modoVista === 'robusta') {
          renderizarListadoGrupos();
          renderizarListadoProfesores();
          renderizarAlertasFaltantes();
        }

        modalEditarHorario.classList.remove('activo');
        mostrarTostada({ titulo: 'Éxito', mensaje: 'Horario actualizado correctamente', tipo: 'exito' });
      } catch (err) {
        const status = err?.status;
        const msg = err?.message || 'No se pudo actualizar el horario.';
        if (status === 401 || status === 403) {
          mostrarTostada({ titulo: 'Error', mensaje: `Sin permisos (necesitas sesión admin): ${msg}`, tipo: 'error' });
        } else {
          mostrarTostada({ titulo: 'Error', mensaje: msg, tipo: 'error' });
        }
      }
    });
  }

  window.addEventListener('click', (e) => {
    if (e.target === modalEditarHorario) {
      modalEditarHorario.classList.remove('activo');
    }
    if (e.target === modalEditarSalon) {
      modalEditarSalon.classList.remove('activo');
    }
  });

  // Abrir/Cerrar modal de horarios desde kebab
  if (opcionHorarios && modalHorarios) {
    opcionHorarios.addEventListener('click', () => {
      menuKebab.classList.remove('activo');
      renderizarHorariosJerarquico();
      modalHorarios.classList.add('activo');
    });
  }

  if (cerrarModalHorarios && modalHorarios) {
    cerrarModalHorarios.addEventListener('click', () => {
      modalHorarios.classList.remove('activo');
    });
  }

  window.addEventListener('click', (e) => {
    if (e.target === modalHorarios) {
      modalHorarios.classList.remove('activo');
    }
  });

  // Abrir/Cerrar
  if (botonKebab && menuKebab) {
    botonKebab.addEventListener('click', (e) => {
      e.stopPropagation();
      menuKebab.classList.toggle('activo');
    });

    document.addEventListener('click', () => {
      menuKebab.classList.remove('activo');
    });
  }

  if (botonBorrar && modalConfirmacion) {
    botonBorrar.addEventListener('click', () => {
      modalConfirmacion.classList.add('activo');
      menuKebab.classList.remove('activo');
    });
  }

  // Abrir Historial
  if (opcionHistorial && modalHistorial) {
    opcionHistorial.addEventListener('click', (e) => {
      e.stopPropagation();
      menuKebab.classList.remove('activo');
      modalHistorial.classList.add('activo');
    });
  }

  if (cerrarHistorial && modalHistorial) {
    cerrarHistorial.addEventListener('click', () => {
      modalHistorial.classList.remove('activo');
    });
  }

  if (botonCancelarModal && modalConfirmacion) {
    botonCancelarModal.addEventListener('click', () => {
      modalConfirmacion.classList.remove('activo');
    });
  }

  // Confirmar Borrado (Ian checa esto)
  if (botonConfirmarModal && modalConfirmacion) {
    botonConfirmarModal.addEventListener('click', () => {
      console.log('Borrando horarios del semestre:', semestreSeleccionado);
      
    // todo esto no sirve
      const cuerpoTabla = document.getElementById('cuerpo-tabla-horarios');
      if (cuerpoTabla) {
        cuerpoTabla.innerHTML = '<tr><td colspan="15" style="text-align:center; padding: 40px; color: #6b7280;">Horarios borrados correctamente.</td></tr>';
      }
      
      modalConfirmacion.classList.remove('activo');
      
      mostrarTostada({ titulo: 'Éxito', mensaje: 'Los horarios han sido eliminados.', tipo: 'exito' });
    });
  }
  renderizarTabla();
  renderizarAdelantos();
  renderizarAlertas();

  // registrar horario, el desmadrte

  const modalRegistro = document.getElementById('modal-registro');
  const btnNuevoRegistro = document.getElementById('boton-nuevo-registro');
  const menuNuevoRegistro = document.getElementById('menu-nuevo-registro');
  const opcionRegistroManual = document.getElementById('opcion-registro-manual');
  const opcionImportarExcel = document.getElementById('opcion-importar-excel');
  const btnCerrarRegistro = document.getElementById('cerrar-modal-registro');
  const formRegistro = document.getElementById('form-registro-horario');

  const selectGrupo = document.getElementById('reg-grupo');
  const selectMateria = document.getElementById('reg-materia');
  const selectProfesor = document.getElementById('reg-profesor');
  const selectProfesorAux = document.getElementById('reg-profesor-aux');
  const salonBtn = document.getElementById('reg-salon-btn');
  const modalSalon = document.getElementById('modal-salon');
  const salonListEl = document.getElementById('reg-salon-list');
  const salonCloseBtn = document.getElementById('reg-salon-close');
  const regDiaEl = document.getElementById('reg-dia');
  const regHoraInicioEl = document.getElementById('reg-hora-inicio');
  const regHoraFinEl = document.getElementById('reg-hora-fin');

  let salonSeleccionadoRegistro = null;
  let salonSelectorMapApi = null;

  const miniSVGSalon = (layoutData, fillColor, strokeColor) => {
    if (!layoutData) return '';
    const PAD = 8;

    let vbX;
    let vbY;
    let vbW;
    let vbH;
    let shapeEl;

    if (layoutData.puntos) {
      const pts = layoutData.puntos
        .trim()
        .split(/\s+/)
        .map(p => p.split(',').map(Number));
      vbX = Math.min(...pts.map(p => p[0]));
      vbY = Math.min(...pts.map(p => p[1]));
      vbW = Math.max(...pts.map(p => p[0])) - vbX;
      vbH = Math.max(...pts.map(p => p[1])) - vbY;
      shapeEl = `<polygon points="${layoutData.puntos}" />`;
    } else {
      vbX = layoutData.x;
      vbY = layoutData.y;
      vbW = layoutData.w;
      vbH = layoutData.h;
      shapeEl = `<rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" rx="6" />`;
    }

    const sw = Math.max(vbW, vbH) * 0.035;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX - PAD} ${vbY - PAD} ${vbW + PAD * 2} ${vbH + PAD * 2}" style="width:100%;height:100%;display:block;" preserveAspectRatio="xMidYMid meet">
      ${shapeEl.replace('/>', `fill="${fillColor}" fill-opacity="0.30" stroke="${strokeColor}" stroke-width="${sw}" stroke-linejoin="round" />`)}
    </svg>`;
  };

  const resetBotonSalon = () => {
    salonSeleccionadoRegistro = null;
    if (!salonBtn) return;
    salonBtn.classList.remove('salon-elegido');
    salonBtn.textContent = 'Salón: —';
  };

  const actualizarBotonSalon = (sel) => {
    if (!salonBtn) return;
    const salon = sel?.raw;
    const layoutData = sel?.layout;
    if (!salon) return resetBotonSalon();

    const estadoNorm = String(salon.estado || '').toLowerCase();
    let badgeClass = 'sin-estado';
    let fillColor = '#60003E';
    let strokeColor = '#60003E';
    let dotColor = '#60003E';
    let estadoLabel = salon.estado || 'Sin estado';

    if (estadoNorm.includes('disp')) {
      badgeClass = 'disponible';
      fillColor = '#10b981';
      strokeColor = '#059669';
      dotColor = '#16a34a';
    } else if (estadoNorm.includes('ocup')) {
      badgeClass = 'ocupado';
      fillColor = '#ef4444';
      strokeColor = '#dc2626';
      dotColor = '#dc2626';
    } else if (estadoNorm.includes('provi')) {
      badgeClass = 'provisional';
      fillColor = '#f59e0b';
      strokeColor = '#d97706';
      dotColor = '#d97706';
    } else if (estadoNorm.includes('mante')) {
      badgeClass = 'mantenimiento';
      fillColor = '#94a3b8';
      strokeColor = '#64748b';
      dotColor = '#94a3b8';
    }

    const pisoLabel = salon.piso !== undefined && salon.piso !== null ? `Piso ${salon.piso}` : '';
    const tipoLabel = salon.tipo ? ` · ${salon.tipo}` : '';
    const miniSvg = miniSVGSalon(layoutData, fillColor, strokeColor);

    salonBtn.classList.add('salon-elegido');
    salonBtn.innerHTML = `
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

  const getRangoContext = () => ({
    dia: regDiaEl?.value,
    hora_inicio: regHoraInicioEl?.value,
    hora_fin: regHoraFinEl?.value
  });

  const refrescarDisponibilidadMapa = async () => {
    if (!salonSelectorMapApi?.setAvailabilityContext) return;
    await salonSelectorMapApi.setAvailabilityContext(getRangoContext());
  };

  function abrirModalSalonConContexto(ctx) {
    if (!modalSalon) return;
    modalSalon.classList.add('activo');

    const mapEl = document.getElementById('reg-salon-map');
    if (mapEl && !salonSelectorMapApi) {
      initSalonSelectorMap({
        rootEl: modalSalon,
        mapEl,
        availabilityContext: ctx,
        onSelect: (sel) => {
          if (salonModoSeleccion === 'adelanto') {
            salonSeleccionadoAdelanto = sel;
            modalSalon.classList.remove('activo');
            if (adelantoSalonBtn) {
              const sn = sel.numero_salon || sel.nombre_salon || 'Seleccionar salón';
              adelantoSalonBtn.querySelector('span:last-child').textContent = `Salón: ${sn}`;
            }
            if (btnConfirmarAdelanto) btnConfirmarAdelanto.disabled = false;
          } else if (salonModoSeleccion === 'reasignacion') {
            salonSeleccionadoReasignacion = sel;
            modalSalon.classList.remove('activo');
            if (incSalonBtn) {
              const sn = sel.numero_salon || sel.nombre_salon || 'Seleccionar salón';
              incSalonBtn.textContent = `Salón: ${sn}`;
              incSalonBtn.classList.add('salon-elegido');
            }
          } else {
            salonSeleccionadoRegistro = sel;
            actualizarBotonSalon(sel);
            modalSalon.classList.remove('activo');
          }
        }
      })
        .then((api) => {
          salonSelectorMapApi = api;
        })
        .catch((err) => {
          console.error('No se pudo inicializar el mapa de salones', err);
        });
    } else {
      salonSelectorMapApi?.setAvailabilityContext?.(ctx).catch?.(() => {});
    }
  }

  const poblarSelects = () => {
    if (!selectGrupo || !selectMateria || !selectProfesor || !selectProfesorAux) return;

    // Grupos
    selectGrupo.innerHTML = '<option value="">Seleccionar Grupo</option>';
    grupos.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.id_grupo;
      opt.textContent = g.nombre_grupo;
      selectGrupo.appendChild(opt);
    });

    // Materias
    selectMateria.innerHTML = '<option value="">Seleccionar Materia</option>';
    materias.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id_materia;
      opt.textContent = m.nombre_materia;
      selectMateria.appendChild(opt);
    });

    // Profesores
    selectProfesor.innerHTML = '<option value="">Seleccionar Profesor</option>';
    usuarios.filter(u => u.tipo_usuario === 'Profesor').forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id_usuarios;
      opt.textContent = p.nombre;
      selectProfesor.appendChild(opt);
    });

    // Profesores Auxiliares (alch arregla esto tu Ian)
    selectProfesorAux.innerHTML = '<option value="">Seleccionar Prof. Aux.</option>';
    usuarios.filter(u => u.tipo_usuario === 'Profesor').forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id_usuarios;
      opt.textContent = p.nombre;
      selectProfesorAux.appendChild(opt);
    });

  };

  // Abrir/Cerrar selector (modal separado)
  if (salonBtn && modalSalon) {
    salonBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Si ya hay un salón elegido, solo abrir si el clic fue en "Cambiar salón"
      if (salonBtn.classList.contains('salon-elegido') && !e.target.closest('.salon-elegido-cambiar')) return;

      salonModoSeleccion = 'registro';
      salonSeleccionadoAdelanto = null;
      abrirModalSalonConContexto(getRangoContext());
    });
  }

  if (salonCloseBtn && modalSalon) {
    salonCloseBtn.addEventListener('click', () => {
      modalSalon.classList.remove('activo');
      const tt = document.querySelector('.sel-tooltip');
      if (tt) tt.style.display = 'none';
    });
  }

  // Refrescar ocupación cuando cambien día/horas
  const onRangoChange = () => {
    // Mantener el mapa al día incluso si el modal no está abierto,
    // para que cuando se abra ya tenga ocupación correcta.
    refrescarDisponibilidadMapa().catch(() => {});
  };
  regDiaEl?.addEventListener('change', onRangoChange);
  regHoraInicioEl?.addEventListener('change', onRangoChange);
  regHoraFinEl?.addEventListener('change', onRangoChange);

  if (btnNuevoRegistro) {
    btnNuevoRegistro.addEventListener('click', (e) => {
      e.stopPropagation();
      menuNuevoRegistro.classList.toggle('activo');
    });
  }

  if (opcionRegistroManual) {
    opcionRegistroManual.addEventListener('click', () => {
      menuNuevoRegistro.classList.remove('activo');
      poblarSelects();
      modalRegistro.classList.add('activo');
    });
  }

  if (opcionImportarExcel) { // wenazo, chamba
    opcionImportarExcel.addEventListener('click', () => {
      menuNuevoRegistro.classList.remove('activo');
      mostrarTostada({ titulo: 'Aviso', mensaje: 'Todavia no', tipo: 'advertencia' });
    });
  }

  if (btnCerrarRegistro) {
    btnCerrarRegistro.addEventListener('click', () => {
      modalRegistro.classList.remove('activo');
    });
  }

  const parseTimeToMinutes = (t) => {
    const raw = String(t || '').trim();
    if (!raw) return null;
    const parts = raw.split(':').map((x) => Number(x));
    const hh = parts[0];
    const mm = parts[1];
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    return hh * 60 + mm;
  };

  const inferBloqueHorario = (horaInicio) => {
    const startMin = parseTimeToMinutes(horaInicio);
    if (startMin === null) return null;
    for (const b of bloquesHorarios) {
      const [ini, fin] = String(b.hora)
        .split('-')
        .map((s) => s.trim());
      const bStart = parseTimeToMinutes(ini);
      const bEnd = parseTimeToMinutes(fin);
      if (bStart === null || bEnd === null) continue;
      if (startMin >= bStart && startMin < bEnd) return b.id;
    }
    return null;
  };

  if (formRegistro) {
    formRegistro.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (!salonSeleccionadoRegistro?.id_salon) {
        mostrarTostada({ titulo: 'Aviso', mensaje: 'Por favor selecciona un salón en el mapa antes de guardar.', tipo: 'advertencia' });
        return;
      }

      if (salonSelectorMapApi?.isSalonOcupadoEnRango?.(salonSeleccionadoRegistro?.numero_salon)) {
        mostrarTostada({ titulo: 'Aviso', mensaje: 'Ese salón está OCUPADO en el rango seleccionado. Elige otro salón.', tipo: 'advertencia' });
        return;
      }
      
      const horaInicio = regHoraInicioEl?.value;
      const horaFin = regHoraFinEl?.value;
      const bloque = inferBloqueHorario(horaInicio);
      if (!bloque) {
        mostrarTostada({ titulo: 'Aviso', mensaje: 'La hora de inicio no cae en ningún bloque válido. Usa una hora dentro de 07:00–20:50.', tipo: 'advertencia' });
        return;
      }

      const payload = {
        id_grupo: Number(selectGrupo.value),
        id_materia: Number(selectMateria.value),
        id_profesor: Number(selectProfesor.value),
        id_auxiliar: selectProfesorAux?.value ? Number(selectProfesorAux.value) : null,
        id_salon: Number(salonSeleccionadoRegistro?.id_salon),
        dia: regDiaEl?.value,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
        bloque_horario: bloque
      };

      try {
        await fetchJson('/horarios', { method: 'POST', body: payload, auth: true });
        await cargarDatosRobusta();

        renderizarTabla();
        if (modoVista === 'robusta') {
          renderizarListadoGrupos();
          renderizarListadoProfesores();
          renderizarAlertasFaltantes();
        }

        mostrarTostada({ titulo: 'Éxito', mensaje: 'Horario registrado correctamente', tipo: 'exito' });
        modalRegistro.classList.remove('activo');
        formRegistro.reset();
        resetBotonSalon();
      } catch (err) {
        const status = err?.status;
        const msg = err?.message || 'No se pudo registrar el horario.';
        if (status === 401 || status === 403) {
          mostrarTostada({ titulo: 'Error', mensaje: `Sin permisos (necesitas sesión admin): ${msg}`, tipo: 'error' });
        } else {
          mostrarTostada({ titulo: 'Error', mensaje: msg, tipo: 'error' });
        }
      }
    });
  }

  // --- Modal de info ---
  const modalInfo = document.getElementById('modal-info');
  const cerrarModalInfo = document.getElementById('cerrar-modal-info');
  const infoBotonCerrar = document.getElementById('info-boton-cerrar'); 
  const infoTitleEl = document.getElementById('info-title');
  const infoGrupoEl = document.getElementById('info-grupo');
  const infoProfesorEl = document.getElementById('info-profesor');
  const infoProfesorAuxEl = document.getElementById('info-profesor-aux');
  const infoMateriaEl = document.getElementById('info-materia');
  const infoBotonAccion = document.getElementById('info-boton-accion');
  let horarioActualEnWidget = null;

  // Modal registrar incidencia 
  const modalRegistrarIncidencia = document.getElementById('modal-registrar-incidencia');
  const cerrarModalRegistrar = document.getElementById('cerrar-modal-registrar-incidencia');
  const formRegistrarIncidencia = document.getElementById('form-registrar-incidencia');
  const incTipoEl = document.getElementById('inc-tipo');
  const incHoraContainer = document.getElementById('inc-hora-container');
  const incHoraEl = document.getElementById('inc-hora');
  const incProfesorContainer = document.getElementById('inc-profesor-container');
  const incProfesorEl = document.getElementById('inc-profesor');
  const incSalonContainer = document.getElementById('inc-salon-container');
  const incSalonBtn = document.getElementById('inc-salon-btn');

  let salonSeleccionadoReasignacion = null;

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

  const formatPeriodoWidget = (horaInicio, horaFin) => {
    const ini = String(horaInicio || '').trim();
    const fin = String(horaFin || '').trim();
    if (!ini || !fin) return `${ini || '-'} - ${fin || '-'}`;

    const iniMatch = ini.match(/^(\d{1,2}):(\d{2})/);
    const finMatch = fin.match(/^(\d{1,2}):(\d{2})/);
    if (!iniMatch || !finMatch) return `${ini} - ${fin}`;

    const iniMin = (parseInt(iniMatch[1], 10) * 60) + parseInt(iniMatch[2], 10);
    const finMinRaw = (parseInt(finMatch[1], 10) * 60) + parseInt(finMatch[2], 10);
    if (!Number.isFinite(iniMin) || !Number.isFinite(finMinRaw)) return `${ini} - ${fin}`;

    let finMin = finMinRaw;
    if (finMinRaw > iniMin && finMinRaw % 60 === 0) {
      finMin = finMinRaw - 10;
    }

    const hh = String(Math.floor(finMin / 60)).padStart(2, '0');
    const mm = String(finMin % 60).padStart(2, '0');
    return `${iniMatch[1].padStart(2, '0')}:${iniMatch[2]} - ${hh}:${mm}`;
  };

  const abrirModalInfo = (horario) => { // info de horario fijo o dinamico, dependiendo de donde se haya hecho click (pq ambos abren el mismo widget)
    if (!modalInfo) return;
    const grupo = grupos.find(g => g.id_grupo === horario.id_grupo);
    const materia = materias.find(m => m.id_materia === horario.id_materia);
    const profesor = usuarios.find(u => u.id_usuarios === horario.id_profesor);
    const profesorAux = usuarios.find(u => u.id_usuarios === horario.id_profesor_aux);
    const salon = salones.find(s => s.id_salon === horario.id_salon);

    // datos
    if (infoTitleEl) infoTitleEl.textContent = salon ? `Salón ${salon.numero_salon}` : 'Info';
    if (infoGrupoEl) infoGrupoEl.textContent = grupo?.nombre_grupo || '-';
    if (infoProfesorEl) infoProfesorEl.textContent = profesor?.nombre || '-';
    if (infoProfesorAuxEl) infoProfesorAuxEl.textContent = profesorAux?.nombre || '-';
    if (infoMateriaEl) infoMateriaEl.textContent = materia?.nombre_materia || '-';

    // Determinar bloque/periodo
    let bloque = null;
    if (horario?.bloque_horario) {
      bloque = bloquesHorarios.find(b => b.id === horario.bloque_horario);
    } else if (horario?.hora_inicio) {
      bloque = bloquesHorarios.find(b => b.hora.startsWith(horario.hora_inicio));
      if (!bloque) {
        // check de hora_inicio (por si no bloque)
        const inicio = horario.hora_inicio.split(':').slice(0,2).join(':');
        bloque = bloquesHorarios.find(b => b.hora.startsWith(inicio));
      }
    }

    const infoPeriodoEl = document.getElementById('info-periodo'); // si el bloque no se encuentra, mostrar horas en vez de periodo (stack overflow!!!)
    if (infoPeriodoEl) {
      if (horario?.hora_inicio && horario?.hora_fin) {
        infoPeriodoEl.textContent = formatPeriodoWidget(horario.hora_inicio, horario.hora_fin);
      } else if (bloque) {
        infoPeriodoEl.textContent = `${bloque.hora}`;
      } else {
        infoPeriodoEl.textContent = '-';
      }
    }
    // Mostrar/ocultar acciones según modo
    if (infoBotonAccion) {
      const esAdelanto = !!horario?.id_horario_dinamico;
      const tieneIncidencia = (ausencias_profesor || []).some(a =>
        (a.fecha || fechaDinamica) === fechaDinamica &&
        normalizarTipoIncidencia(a.tipo_incidencia ?? a.tipo) === 'ausencia_profesor' &&
        Number(a.id_profesor) === Number(horario?.id_profesor) &&
        Number(a.id_grupo) === Number(horario?.id_grupo) &&
        (() => {
          const aMin = timeToMinutes(a.hora);
          const startMin = timeToMinutes(horario?.hora_inicio);
          const endMin = timeToMinutes(horario?.hora_fin);
          return aMin !== null && startMin !== null && aMin >= startMin && (endMin === null || aMin < endMin);
        })()
      );
      infoBotonAccion.style.display = (modoVista === 'robusta' || esAdelanto || tieneIncidencia) ? 'none' : '';
    }

    horarioActualEnWidget = horario; // guarda horario actual (registrar incidencia)

    modalInfo.classList.add('activo');
  };

  if (cerrarModalInfo) {
    cerrarModalInfo.addEventListener('click', () => modalInfo.classList.remove('activo'));
  }

  if (infoBotonCerrar) { // este boton es el de cerrar del header, el otro es para registrar incidencia
    infoBotonCerrar.addEventListener('click', () => modalInfo.classList.remove('activo'));
  }

  // abrir modal de registrar incidencia desde el widget
  if (infoBotonAccion) {
    infoBotonAccion.addEventListener('click', () => {
      if (!horarioActualEnWidget) {
        mostrarTostada({ titulo: 'Error', mensaje: 'No hay horario seleccionado', tipo: 'error' });
        return;
      }
      if (!modalRegistrarIncidencia) return;
      // reset form
      if (formRegistrarIncidencia) formRegistrarIncidencia.reset();
      if (incHoraContainer) incHoraContainer.classList.add('oculto');
      if (incProfesorContainer) incProfesorContainer.classList.add('oculto');
      if (incSalonContainer) incSalonContainer.classList.add('oculto');
      salonSeleccionadoReasignacion = null;
      if (incSalonBtn) {
        incSalonBtn.textContent = 'Salón: —';
        incSalonBtn.classList.remove('salon-elegido');
      }
      // poblar el select
      if (incProfesorEl) {
        incProfesorEl.innerHTML = '<option value="">Seleccionar Profesor</option>';
        if (horarioActualEnWidget) { // cambien esto depende la base (orita namas jalo un profAux inexsistente)
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
      modalRegistrarIncidencia.classList.add('activo');
    });
  }

  if (cerrarModalRegistrar) { 
    cerrarModalRegistrar.addEventListener('click', () => {
      if (modalRegistrarIncidencia) modalRegistrarIncidencia.classList.remove('activo');
      salonSeleccionadoReasignacion = null;
    });
  }

  if (incTipoEl) {
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
        if (incSalonBtn) {
          incSalonBtn.textContent = 'Salón: —';
          incSalonBtn.classList.remove('salon-elegido');
        }
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
      if (!horarioActualEnWidget) {
        mostrarTostada({ titulo: 'Error', mensaje: 'No hay horario seleccionado', tipo: 'error' });
        return;
      }
      salonModoSeleccion = 'reasignacion';
      salonSeleccionadoRegistro = null;
      salonSeleccionadoAdelanto = null;
      const ctx = {
        dia: diaDesdeFecha(fechaDinamica),
        hora_inicio: horarioActualEnWidget.hora_inicio || '',
        hora_fin: horarioActualEnWidget.hora_fin || ''
      };
      abrirModalSalonConContexto(ctx);
    });
  }

  if (formRegistrarIncidencia) {
    formRegistrarIncidencia.addEventListener('submit', async (e) => {
      e.preventDefault();
      const tipoRaw = incTipoEl?.value || '';
      const tipo = normalizarTipoIncidencia(tipoRaw);
      const contexto = tipo;

      const horaRegistro = (tipo === 'ausencia_profesor')
        ? (incHoraEl?.value || null)
        : (horarioActualEnWidget?.hora_inicio || null);

      const profesorSeleccionado = (tipo === 'ausencia_profesor')
        ? (incProfesorEl?.value || null)
        : (horarioActualEnWidget?.id_profesor != null ? String(horarioActualEnWidget.id_profesor) : null);

      if (!tipo && tipoRaw !== 'reasignacion_salon') { mostrarTostada({ titulo: 'Aviso', mensaje: 'Selecciona un tipo de incidencia', tipo: 'advertencia' }); return; }

      if (tipoRaw === 'reasignacion_salon') {
        if (!salonSeleccionadoReasignacion) { mostrarTostada({ titulo: 'Aviso', mensaje: 'Selecciona un salón.', tipo: 'advertencia' }); return; }
        if (!horarioActualEnWidget?.id_horario_fijo_detalle) {
          mostrarTostada({ titulo: 'Error', mensaje: 'No se pudo identificar el detalle del horario.', tipo: 'error' });
          return;
        }
        try {
          await fetchJson(`/horarios/${horarioActualEnWidget.id_horario_fijo_detalle}/reasignar-salon`, {
            method: 'POST',
            auth: true,
            body: { fecha: fechaDinamica, id_salon_temporal: Number(salonSeleccionadoReasignacion.id_salon) }
          });
          ultimoErrorDinamica = null;
          await cargarDatosDinamica(fechaDinamica);
          renderizarAlertas();
          renderizarAdelantos();
          renderizarTabla();
          mostrarTostada({ titulo: 'Éxito', mensaje: 'Salón reasignado correctamente', tipo: 'exito' });
          modalRegistrarIncidencia.classList.remove('activo');
          formRegistrarIncidencia.reset();
          salonSeleccionadoReasignacion = null;
        } catch (err) {
          const status = err?.status;
          const msg = err?.message || 'No se pudo reasignar el salón.';
          if (status === 401 || status === 403) {
            mostrarTostada({ titulo: 'Error', mensaje: `Sin permisos (necesitas sesión prefecto/admin): ${msg}`, tipo: 'error' });
          } else {
            mostrarTostada({ titulo: 'Error', mensaje: msg, tipo: 'error' });
          }
        }
        return;
      }

      if (!horarioActualEnWidget?.id_grupo) {
        mostrarTostada({ titulo: 'Error', mensaje: 'No se pudo identificar el grupo del horario.', tipo: 'error' });
        return;
      }
      if (!horaRegistro) {
        mostrarTostada({ titulo: 'Aviso', mensaje: 'Selecciona la hora de la incidencia.', tipo: 'advertencia' });
        return;
      }
      if (!profesorSeleccionado) {
        mostrarTostada({ titulo: 'Aviso', mensaje: tipo === 'ausencia_profesor'
          ? 'Selecciona el profesor ausente.'
          : 'No se pudo identificar el profesor del horario.',
          tipo: 'advertencia'
        });
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
            fecha: fechaDinamica,
            hora: hhmm(horaRegistro),
            id_profesor: Number(profesorSeleccionado),
            id_grupo: Number(horarioActualEnWidget.id_grupo),
            accion_tomada: (contexto || '').trim() || tipo
          }
        });

        const nuevaAusencia = {
          fecha: fechaDinamica,
          hora: hhmm(horaRegistro),
          id_profesor: Number(profesorSeleccionado),
          id_grupo: Number(horarioActualEnWidget.id_grupo),
          accion_tomada: (contexto || '').trim() || tipo
        };
        ausencias_profesor = (ausencias_profesor || []).filter((a) => !(
          (a.fecha || fechaDinamica) === nuevaAusencia.fecha &&
          Number(a.id_profesor) === nuevaAusencia.id_profesor &&
          Number(a.id_grupo) === nuevaAusencia.id_grupo &&
          hhmm(a.hora) === nuevaAusencia.hora &&
          normalizarTipoIncidencia(a.tipo_incidencia ?? a.tipo ?? parseTipoDesdeAccion(a.accion_tomada) ?? a.accion_tomada) === normalizarTipoIncidencia(nuevaAusencia.accion_tomada)
        ));
        ausencias_profesor.push(nuevaAusencia);
        ultimoErrorDinamica = null;

        if (modoVista !== 'dinamica') {
          modoVista = 'dinamica';
          const selectorModo = document.getElementById('selector-modo-vista');
          if (selectorModo) {
            selectorModo.querySelectorAll('button').forEach((b) => {
              b.classList.toggle('activo', b.getAttribute('data-modo') === 'dinamica');
            });
          }
          const widgetsDinamicos = document.getElementById('widgets-dinamicos');
          const widgetsRobustos = document.getElementById('widgets-robustos');
          const botonNuevo = document.getElementById('boton-nuevo-registro');
          if (widgetsDinamicos) widgetsDinamicos.classList.remove('oculto');
          if (widgetsRobustos) widgetsRobustos.classList.add('oculto');
          if (botonNuevo) botonNuevo.classList.add('oculto');
        }

        renderizarAlertas();
        renderizarAdelantos();
        renderizarTabla();

        await cargarDatosDinamica(fechaDinamica);
        renderizarAlertas();
        renderizarAdelantos();
        renderizarTabla();

        mostrarTostada({ titulo: 'Éxito', mensaje: 'Incidencia registrada', tipo: 'exito' });
        modalRegistrarIncidencia.classList.remove('activo');
        formRegistrarIncidencia.reset();
      } catch (err) {
        const status = err?.status;
        const msg = err?.message || 'No se pudo registrar la incidencia.';
        if (status === 401 || status === 403) {
          mostrarTostada({ titulo: 'Error', mensaje: `Sin permisos (necesitas sesión prefecto/admin): ${msg}`, tipo: 'error' });
        } else {
          mostrarTostada({ titulo: 'Error', mensaje: msg, tipo: 'error' });
        }
      }
    });
  }

  // Cerrar cualquier modal abierto al hacer click en el overlay (yanderedev me decian)
  // luego
  window.addEventListener('click', (e) => {
    if (e.target === modalRegistro) modalRegistro.classList.remove('activo');
    if (e.target === modalInfo) modalInfo.classList.remove('activo');
    if (e.target === modalRegistrarIncidencia) modalRegistrarIncidencia.classList.remove('activo');
    if (e.target === modalSalon) modalSalon.classList.remove('activo');
    if (e.target === modalHistorial) modalHistorial.classList.remove('activo');
    if (!e.target.closest('#boton-nuevo-registro') && !e.target.closest('#menu-nuevo-registro')) {
      menuNuevoRegistro.classList.remove('activo');
    }
  });

  paintSessionHeader();
  
  const perfilBtn = document.getElementById('perfil-usuario-btn');
  const menuPerfilUsuario = document.getElementById('menu-perfil-usuario');
  if (perfilBtn && menuPerfilUsuario) {
    perfilBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      menuPerfilUsuario.classList.toggle('activo');
    });
  }
  document.getElementById('opcion-perfil')?.addEventListener('click', () => { window.location.href = 'stt_preP.html'; });
  document.getElementById('opcion-cerrar-sesion')?.addEventListener('click', () => { window.location.href = 'index.html'; });
  document.addEventListener('click', (e) => {
    if (menuPerfilUsuario && !e.target.closest('#perfil-usuario-btn') && !e.target.closest('#menu-perfil-usuario')) {
      menuPerfilUsuario.classList.remove('activo');
    }
  });

  const enlacesNav = document.querySelectorAll('.enlace-nav');
  enlacesNav.forEach(enlace => {
    enlace.addEventListener('click', (e) => {
      enlacesNav.forEach(l => {
        l.classList.remove('activo');
      });
      enlace.classList.add('activo');
    });
  });
});
