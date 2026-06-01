import { usuarios as mockUsuarios, grupos as mockGrupos } from './mockData.js';
import { DEFAULT_API_URL, paintSessionHeader, resolveApiBase } from './map_preG_shared.js';

document.addEventListener('DOMContentLoaded', () => {
  const TOKEN_KEY = 'bdsm_token';
  const USER_KEY = 'bdsm_usuario';

  let apiBase = resolveApiBase();

  const getToken = () => {
    const t = localStorage.getItem(TOKEN_KEY);
    return t && String(t).trim() ? String(t).trim() : null;
  };

  const getUsuarioSesion = () => {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  async function fetchJson(path, { method = 'GET', body, auth = false } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth) {
      const token = getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    const doFetch = async (base) => {
      const res = await fetch(`${base}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
      const text = await res.text();
      let data;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }
      return { ok: res.ok, status: res.status, data };
    };

    try {
      const r1 = await doFetch(apiBase);
      if (r1.ok) return r1;

      if (apiBase !== DEFAULT_API_URL) {
        const r2 = await doFetch(DEFAULT_API_URL);
        if (r2.ok) {
          apiBase = DEFAULT_API_URL;
          return r2;
        }
      }

      return r1;
    } catch (e) {
      if (apiBase !== DEFAULT_API_URL) {
        try {
          const r2 = await doFetch(DEFAULT_API_URL);
          if (r2.ok) apiBase = DEFAULT_API_URL;
          return r2;
        } catch {
          return { ok: false, status: 0, data: e };
        }
      }
      return { ok: false, status: 0, data: e };
    }
  }

  function normalizarTipoUsuario(raw) {
    const v = String(raw || '').trim();
    if (!v) return '';
    if (v === 'Estudiante') return 'Alumno';
    return v;
  }

  function normalizarUsuario(row) {
    const id = row?.id_usuario ?? row?.id_usuarios ?? row?.boleta ?? row?.id;
    return {
      id_usuario: id !== undefined && id !== null && String(id).trim() !== '' ? Number(id) : null,
      nombre: String(row?.nombre || ''),
      correo: String(row?.correo || ''),
      tipo_usuario: normalizarTipoUsuario(row?.tipo_usuario || row?.tipo_user),
      turno: row?.turno ?? null,
      id_grupo: row?.id_grupo ?? null,
      nombre_grupo: row?.nombre_grupo ?? null,
      piso_asignado: row?.piso_asignado ?? row?.piso ?? null,
      area_educacion: row?.area_educacion ?? null,
      estado_asistencia: row?.estado_asistencia ?? null,
    };
  }

  const obtenerIniciales = (nombre) => {
    const limpio = String(nombre || '').replace(/^(Dr\.|M\.\s*en\s*C\.|Ing\.|Lic\.)\s*/i, '').trim();
    const partes = limpio.split(/\s+/).filter(Boolean);
    if (partes.length >= 2) return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
    return partes[0] ? partes[0][0].toUpperCase() : 'U';
  };

  const esPrefecto = (u) => u?.tipo_usuario === 'Prefecto de Piso' || u?.tipo_usuario === 'Prefecto General';

  const obtenerPisoAsignado = (u) => {
    if (u.tipo_usuario === 'Prefecto de Piso') {
      if (u.piso_asignado === null || u.piso_asignado === undefined || u.piso_asignado === '') return '—';
      const raw = u.piso_asignado;
      const s = String(raw).trim();
      const label = s.toUpperCase() === 'L' || Number(raw) === 0 ? 'L' : s;
      return `Piso ${label}`;
    }
    if (u.tipo_usuario === 'Prefecto General') return 'Todos';
    return null;
  };

  let usuariosData = [];
  let gruposData = [];
  let usuarioSeleccionado = null;
  let terminoBusqueda = '';
  let modoEdicion = false;

  // reloj
  const elementoReloj = document.getElementById('reloj-tiempo');
  const elementoFecha = document.getElementById('reloj-fecha');
  const actualizarTiempo = () => {
    const ahora = new Date();
    if (elementoReloj) {
      const h = String(ahora.getHours()).padStart(2, '0');
      const m = String(ahora.getMinutes()).padStart(2, '0');
      elementoReloj.textContent = `${h} : ${m}`;
    }
    if (elementoFecha) {
      const opciones = { weekday: 'long', day: 'numeric', month: 'long' };
      const texto = ahora.toLocaleDateString('es-ES', opciones);
      elementoFecha.textContent = texto.charAt(0).toUpperCase() + texto.slice(1);
    }
  };
  actualizarTiempo();
  setInterval(actualizarTiempo, 1000);

  // Menús (perfil + kebab)
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
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    window.location.href = 'index.html';
  });

  const botonKebab = document.getElementById('boton-kebab-usr');
  const menuKebab = document.getElementById('menu-kebab-usr');
  if (botonKebab && menuKebab) {
    botonKebab.addEventListener('click', (e) => {
      e.stopPropagation();
      menuKebab.classList.toggle('activo');
    });
  }

  document.addEventListener('click', () => {
    document.querySelectorAll('.menu-desplegable.activo').forEach(m => m.classList.remove('activo'));
  });

  // Buscar
  const campoBusqueda = document.getElementById('campo-busqueda');
  if (campoBusqueda) {
    campoBusqueda.addEventListener('input', (e) => {
      terminoBusqueda = String(e.target.value || '').trim().toLowerCase();
      renderizarLista();
    });
  }

  const tbody = document.getElementById('cuerpo-tabla-usuarios');
  const panelDetalle = document.getElementById('panel-detalle-usuario');

  const renderizarLista = () => {
    if (!tbody) return;
    tbody.innerHTML = '';

    const filtrados = terminoBusqueda
      ? usuariosData.filter(u =>
          String(u.nombre || '').toLowerCase().includes(terminoBusqueda) ||
          String(u.correo || '').toLowerCase().includes(terminoBusqueda) ||
          String(u.tipo_usuario || '').toLowerCase().includes(terminoBusqueda) ||
          String(u.id_usuario || '').includes(terminoBusqueda)
        )
      : usuariosData;

    const totalElement = document.getElementById('total-usuarios-numero');
    if (totalElement) totalElement.textContent = usuariosData.length.toLocaleString('es-MX');

    if (filtrados.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="3" style="text-align:center;padding:32px;color:#9ca3af;font-size:0.875rem;">Sin resultados</td>`;
      tbody.appendChild(tr);
      return;
    }

    filtrados.forEach(u => {
      const tr = document.createElement('tr');
      tr.className = 'fila-usuario';
      if (usuarioSeleccionado?.id_usuario === u.id_usuario) tr.classList.add('seleccionado');

      const iniciales = obtenerIniciales(u.nombre);
      tr.innerHTML = `
        <td>
          <div class="celda-usuario">
            <div class="avatar-lista">${iniciales}</div>
            <span class="nombre-lista">${u.nombre}</span>
          </div>
        </td>
        <td><span class="correo-lista">${u.correo}</span></td>
        <td><span class="rol-etiqueta">${String(u.tipo_usuario || '').toUpperCase()}</span></td>
      `;

      tr.addEventListener('click', () => {
        usuarioSeleccionado = u;
        modoEdicion = false;
        renderizarLista();
        renderizarDetalle(u);
      });

      tbody.appendChild(tr);
    });
  };

  const renderizarDetalle = (u) => {
    if (!panelDetalle) return;

    const iniciales = obtenerIniciales(u.nombre);
    const piso = obtenerPisoAsignado(u);
    const mostrarPiso = esPrefecto(u);
    const esPrefectoGeneral = u.tipo_usuario === 'Prefecto General';
    const esProfesor = u.tipo_usuario === 'Profesor' || u.tipo_usuario === 'Auxiliar';
    const esAlumno = u.tipo_usuario === 'Alumno';

    const pisoHtml = (mostrarPiso && piso)
      ? `
        <div class="campo-info">
          <span class="campo-info-label">Piso Asignado</span>
          <div class="campo-info-valor">${piso}</div>
        </div>
      `
      : '';

    const grupoNombre = esAlumno
      ? (u.nombre_grupo || (u.id_grupo ? (gruposData.find(g => String(g.id_grupo) === String(u.id_grupo))?.nombre_grupo || '—') : '—'))
      : null;

    const grupoHtml = esAlumno
      ? `
        <div class="campo-info">
          <span class="campo-info-label">Grupo</span>
          <div class="campo-info-valor">${grupoNombre}</div>
        </div>
      `
      : '';

    const profesorHtml = esProfesor
      ? `
        <div class="campo-info">
          <span class="campo-info-label">Área</span>
          <div class="campo-info-valor">${u.area_educacion || '—'}</div>
        </div>
      `
      : '';

    let contentHtml = `
      <div class="detalle-encabezado">
        <div class="avatar-detalle">${iniciales}</div>
        <p class="detalle-nombre">${u.nombre}</p>
        <p class="detalle-correo">${u.correo}</p>
      </div>

      <div class="detalle-info">
        <p class="info-etiqueta-seccion">Información</p>

        <div class="campo-info">
          <span class="campo-info-label">ID / Boleta</span>
          <div class="campo-info-valor">${u.id_usuario ?? '—'}</div>
        </div>

        <div class="campo-info">
          <span class="campo-info-label">Rol</span>
          <div class="campo-info-valor">${u.tipo_usuario || '—'}</div>
        </div>

        ${pisoHtml}
        ${grupoHtml}

        <div class="campo-info">
          <span class="campo-info-label">Turno</span>
          <div class="campo-info-valor">${u.turno || '—'}</div>
        </div>

        ${profesorHtml}

        <div class="campo-info">
          <span class="campo-info-label">Contraseña</span>
          <div class="campo-info-valor">••••••••••••</div>
        </div>
      </div>
    `;

    if (!esPrefectoGeneral) {
      contentHtml += `
        <div class="detalle-acciones">
          <button class="boton-editar" data-user-id="${u.id_usuario}">Editar</button>
          <button class="boton-eliminar" data-user-id="${u.id_usuario}">Eliminar</button>
        </div>
      `;
    }

    panelDetalle.innerHTML = contentHtml;

    if (!esPrefectoGeneral) {
      panelDetalle.querySelector('.boton-editar')?.addEventListener('click', () => {
        modoEdicion = true;
        renderizarDetalleEdicion(u);
      });

      panelDetalle.querySelector('.boton-eliminar')?.addEventListener('click', () => {
        const modalEliminar = document.getElementById('modal-eliminar-usuario');
        if (modalEliminar) {
          usuarioSeleccionado = u;
          modalEliminar.classList.add('activo');
        }
      });
    }
  };

  const renderizarDetalleEdicion = (u) => {
    if (!panelDetalle) return;

    const iniciales = obtenerIniciales(u.nombre);
    const esPrefectoPisoInicial = u.tipo_usuario === 'Prefecto de Piso';
    const esAlumnoInicial = u.tipo_usuario === 'Alumno';

    const pisoOptions = ['0', '1', '2', '3'];
    const rolOptions = ['Prefecto General', 'Prefecto de Piso', 'Alumno', 'Profesor', 'Auxiliar'];
    const turnoOptions = ['Matutino', 'Vespertino'];

    const pisoSelectedRaw = u.piso_asignado ?? '';
    const pisoSelected = String(pisoSelectedRaw).trim().toUpperCase() === 'L' ? '0' : String(pisoSelectedRaw);
    const pisoSelect = pisoOptions
      .map(p => `<option value="${p}" ${String(pisoSelected) === String(p) ? 'selected' : ''}>${p === '0' ? 'L' : p}</option>`)
      .join('');

    const rolSelect = rolOptions
      .map(r => `<option value="${r}" ${u.tipo_usuario === r ? 'selected' : ''}>${r}</option>`)
      .join('');

    const turnoSelect = turnoOptions
      .map(t => `<option value="${t}" ${u.turno === t ? 'selected' : ''}>${t}</option>`)
      .join('');

    const grupoSelect = gruposData
      .map(g => `<option value="${g.id_grupo}" ${String(u.id_grupo) === String(g.id_grupo) ? 'selected' : ''}>${g.nombre_grupo}</option>`)
      .join('');

    panelDetalle.innerHTML = `
      <div class="detalle-encabezado">
        <div class="avatar-detalle">${iniciales}</div>
        <p class="detalle-nombre">${u.nombre}</p>
      </div>

      <div class="detalle-info">
        <p class="info-etiqueta-seccion">Información Editable</p>

        <div class="campo-info-editable">
          <span class="campo-info-label">Nombre</span>
          <input type="text" id="edit-nombre" class="campo-editable" value="${u.nombre}" />
        </div>

        <div class="campo-info-editable">
          <span class="campo-info-label">ID / Boleta</span>
          <input type="text" id="edit-id" class="campo-editable" value="${u.id_usuario ?? ''}" disabled />
        </div>

        <div class="campo-info-editable">
          <span class="campo-info-label">Rol</span>
          <select id="edit-rol" class="campo-editable">${rolSelect}</select>
        </div>

        <div class="campo-info-editable ${esPrefectoPisoInicial ? '' : 'oculto'}" id="edit-piso-container">
          <span class="campo-info-label">Piso</span>
          <select id="edit-piso" class="campo-editable">${pisoSelect}</select>
        </div>

        <div class="campo-info-editable ${esAlumnoInicial ? '' : 'oculto'}" id="edit-grupo-container">
          <span class="campo-info-label">Grupo</span>
          <select id="edit-grupo" class="campo-editable">
            <option value="">Seleccionar Grupo</option>
            ${grupoSelect}
          </select>
        </div>

        <div class="campo-info-editable" id="edit-turno-container">
          <span class="campo-info-label">Turno</span>
          <select id="edit-turno" class="campo-editable">${turnoSelect}</select>
        </div>

        <div class="campo-info-editable">
          <span class="campo-info-label">Correo</span>
          <input type="email" id="edit-correo" class="campo-editable" value="${u.correo}" />
        </div>

        <div class="campo-info-editable">
          <span class="campo-info-label">Contraseña</span>
          <input type="password" id="edit-contrasena" class="campo-editable" value="" placeholder="(dejar vacío para no cambiar)" />
        </div>
      </div>

      <div class="detalle-acciones">
        <button class="boton-guardar" data-user-id="${u.id_usuario}">Guardar</button>
        <button class="boton-cancelar" data-user-id="${u.id_usuario}">Cancelar</button>
      </div>
    `;

    const editRol = panelDetalle.querySelector('#edit-rol');
    const editPisoContainer = panelDetalle.querySelector('#edit-piso-container');
    const editGrupoContainer = panelDetalle.querySelector('#edit-grupo-container');

    editRol?.addEventListener('change', () => {
      const rol = editRol.value;
      editPisoContainer?.classList.toggle('oculto', rol !== 'Prefecto de Piso');
      editGrupoContainer?.classList.toggle('oculto', rol !== 'Alumno');
    });

    panelDetalle.querySelector('.boton-cancelar')?.addEventListener('click', () => {
      modoEdicion = false;
      renderizarDetalle(u);
    });

    panelDetalle.querySelector('.boton-guardar')?.addEventListener('click', async () => {
      const token = getToken();
      if (!token) {
        alert('No hay sesión (token). Inicia sesión para guardar cambios.');
        return;
      }

      const nuevoNombre = panelDetalle.querySelector('#edit-nombre')?.value?.trim();
      const nuevoRol = panelDetalle.querySelector('#edit-rol')?.value;
      const nuevoPiso = panelDetalle.querySelector('#edit-piso')?.value;
      const nuevoTurno = panelDetalle.querySelector('#edit-turno')?.value;
      const nuevoCorreo = panelDetalle.querySelector('#edit-correo')?.value?.trim();
      const nuevoGrupoId = panelDetalle.querySelector('#edit-grupo')?.value;
      const nuevaContrasena = panelDetalle.querySelector('#edit-contrasena')?.value;

      const payload = {
        nombre: nuevoNombre,
        correo: nuevoCorreo,
        turno: nuevoTurno,
        tipo_usuario: nuevoRol,
        id_grupo: nuevoRol === 'Alumno' ? (nuevoGrupoId ? Number(nuevoGrupoId) : null) : null,
      };
      if (nuevaContrasena && String(nuevaContrasena).trim().length > 0) {
        payload.contrasena = String(nuevaContrasena);
      }

      const r = await fetchJson(`/usuarios/${encodeURIComponent(u.id_usuario)}`, {
        method: 'PUT',
        body: payload,
        auth: true
      });
      if (!r.ok) {
        alert(r?.data?.error || 'No se pudo actualizar el usuario');
        return;
      }

      if (nuevoRol === 'Prefecto de Piso' && nuevoPiso) {
        const pisoNum = Number(nuevoPiso);
        if (!Number.isFinite(pisoNum)) {
          alert('Selecciona un piso válido');
          return;
        }
        const r2 = await fetchJson(`/usuarios/${encodeURIComponent(u.id_usuario)}/asignar-piso`, {
          method: 'POST',
          body: { piso_asignado: pisoNum },
          auth: true
        });
        if (!r2.ok) console.warn('No se pudo asignar piso:', r2);
      }

      await cargarUsuarios();
      usuarioSeleccionado = usuariosData.find(x => x.id_usuario === u.id_usuario) || null;
      modoEdicion = false;
      renderizarLista();
      if (usuarioSeleccionado) renderizarDetalle(usuarioSeleccionado);
    });
  };

  // Modales eliminar
  const modalEliminarUsuario = document.getElementById('modal-eliminar-usuario');
  const botonCancelarEliminar = document.getElementById('cancelar-eliminar-usuario');
  const botonConfirmarEliminar = document.getElementById('confirmar-eliminar-usuario');

  botonCancelarEliminar?.addEventListener('click', () => {
    modalEliminarUsuario?.classList.remove('activo');
  });

  botonConfirmarEliminar?.addEventListener('click', async () => {
    try {
      if (!usuarioSeleccionado) return;
      const token = getToken();
      if (!token) {
        alert('No hay sesión (token). Inicia sesión para eliminar usuarios.');
        return;
      }

      const r = await fetchJson(`/usuarios/${encodeURIComponent(usuarioSeleccionado.id_usuario)}`, {
        method: 'DELETE',
        auth: true
      });
      if (!r.ok) {
        alert(r?.data?.error || 'No se pudo eliminar el usuario');
        return;
      }

      usuarioSeleccionado = null;
      modoEdicion = false;
      await cargarUsuarios();
      renderizarLista();
      if (panelDetalle) {
        panelDetalle.innerHTML = `
          <div class="panel-detalle-vacio">
            <span class="material-symbols-outlined" style="font-size:48px;color:#d1d5db;">person</span>
            <p>Selecciona un usuario</p>
          </div>
        `;
      }
    } finally {
      modalEliminarUsuario?.classList.remove('activo');
    }
  });

  window.addEventListener('click', (e) => {
    if (e.target === modalEliminarUsuario) modalEliminarUsuario.classList.remove('activo');
  });

  // Nuevo registro
  const botonNuevoRegistro = document.getElementById('boton-nuevo-registro');
  const menuNuevoRegistro = document.getElementById('menu-nuevo-registro');
  const opcionRegistroManualUsr = document.getElementById('opcion-registro-manual-usr');
  const opcionImportarExcelUsr = document.getElementById('opcion-importar-excel-usr');

  botonNuevoRegistro?.addEventListener('click', (e) => {
    e.stopPropagation();
    menuNuevoRegistro?.classList.toggle('activo');
  });

  document.addEventListener('click', (e) => {
    if (menuNuevoRegistro && !e.target.closest('#boton-nuevo-registro') && !e.target.closest('#menu-nuevo-registro')) {
      menuNuevoRegistro.classList.remove('activo');
    }
  });

  opcionImportarExcelUsr?.addEventListener('click', () => {
    menuNuevoRegistro?.classList.remove('activo');
    alert('Importar Excel (pendiente)');
  });

  // Registro manual modal
  const modalRegistroUsuario = document.getElementById('modal-registro-usuario');
  const btnCerrarModalReg = document.getElementById('cerrar-modal-registro-usuario');
  const formRegistroUsuario = document.getElementById('form-registro-usuario');
  const selectTipoReg = document.getElementById('reg-usr-tipo');
  const contTurno = document.getElementById('reg-usr-turno-container');
  const contPiso = document.getElementById('reg-usr-piso-container');
  const contGrupo = document.getElementById('reg-usr-grupo-container');
  const selectGrupoReg = document.getElementById('reg-usr-grupo');

  const poblarSelectGrupos = () => {
    if (!selectGrupoReg) return;
    selectGrupoReg.querySelectorAll('option:not(:first-child)').forEach(o => o.remove());
    gruposData.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.id_grupo;
      opt.textContent = g.nombre_grupo;
      selectGrupoReg.appendChild(opt);
    });
  };

  const abrirModalRegistro = () => {
    if (!modalRegistroUsuario) return;
    formRegistroUsuario?.reset();
    contTurno?.classList.remove('oculto');
    contPiso?.classList.add('oculto');
    contGrupo?.classList.add('oculto');
    // Asegura que el select tenga todos los grupos reales de la BD
    // (el endpoint devuelve { grupos: [...] }).
    Promise.resolve(cargarGrupos()).finally(() => poblarSelectGrupos());
    modalRegistroUsuario.classList.add('activo');
  };

  opcionRegistroManualUsr?.addEventListener('click', () => {
    menuNuevoRegistro?.classList.remove('activo');
    abrirModalRegistro();
  });

  btnCerrarModalReg?.addEventListener('click', () => {
    modalRegistroUsuario?.classList.remove('activo');
  });

  window.addEventListener('click', (e) => {
    if (e.target === modalRegistroUsuario) modalRegistroUsuario.classList.remove('activo');
  });

  selectTipoReg?.addEventListener('change', () => {
    const tipo = selectTipoReg.value;
    contTurno?.classList.toggle('oculto', false);
    contPiso?.classList.toggle('oculto', tipo !== 'Prefecto de Piso');
    contGrupo?.classList.toggle('oculto', tipo !== 'Alumno');
  });

  formRegistroUsuario?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const tipo = document.getElementById('reg-usr-tipo')?.value;
    const turnoVal = document.getElementById('reg-usr-turno')?.value;
    const pisoVal = document.getElementById('reg-usr-piso')?.value;
    const grupoVal = document.getElementById('reg-usr-grupo')?.value;

    const idVal = document.getElementById('reg-usr-id')?.value?.trim();
    const nombreVal = document.getElementById('reg-usr-nombre')?.value?.trim();
    const correoVal = document.getElementById('reg-usr-correo')?.value?.trim();
    const contrasenaVal = document.getElementById('reg-usr-contrasena')?.value;

    const token = getToken();
    if (token) {
      const payload = {
        id_usuarios: idVal,
        nombre: nombreVal,
        correo: correoVal,
        contrasena: contrasenaVal,
        tipo_usuario: tipo,
        turno: turnoVal,
        id_grupo: tipo === 'Alumno' ? (grupoVal ? Number(grupoVal) : null) : null,
      };

      const r = await fetchJson('/usuarios/registrar', {
        method: 'POST',
        body: payload,
        auth: true
      });

      if (!r.ok) {
        alert(r?.data?.error || 'No se pudo registrar el usuario');
        return;
      }

      const newId = r?.data?.usuario?.id_usuario;
      if (tipo === 'Prefecto de Piso' && pisoVal && newId) {
        const pisoNum = Number(pisoVal);
        if (!Number.isFinite(pisoNum)) {
          alert('Selecciona un piso válido');
          return;
        }
        const r2 = await fetchJson(`/usuarios/${encodeURIComponent(newId)}/asignar-piso`, {
          method: 'POST',
          body: { piso_asignado: pisoNum },
          auth: true
        });
        if (!r2.ok) console.warn('No se pudo asignar piso:', r2);
      }

      modalRegistroUsuario.classList.remove('activo');
      await cargarUsuarios();
      renderizarLista();
      return;
    }

    // fallback mock
    const nuevo = normalizarUsuario({
      id_usuarios: Number(idVal) || (usuariosData.length ? Math.max(...usuariosData.map(x => x.id_usuario || 0)) + 1 : 1),
      nombre: nombreVal,
      correo: correoVal,
      tipo_usuario: tipo,
      turno: turnoVal,
      piso_asignado: tipo === 'Prefecto de Piso' ? (pisoVal ? Number(pisoVal) : null) : null,
      id_grupo: tipo === 'Alumno' && grupoVal ? Number(grupoVal) : null,
    });
    usuariosData.push(nuevo);
    modalRegistroUsuario.classList.remove('activo');
    renderizarLista();
  });

  async function cargarGrupos() {
    const r = await fetchJson('/grupos', { method: 'GET', auth: false });
    const maybeArray = Array.isArray(r.data) ? r.data : (Array.isArray(r?.data?.grupos) ? r.data.grupos : null);
    if (r.ok && Array.isArray(maybeArray)) {
      gruposData = maybeArray;
      return;
    }
    gruposData = mockGrupos;
  }

  async function cargarUsuarios() {
    const token = getToken();
    if (!token) {
      usuariosData = mockUsuarios.map(normalizarUsuario);
      return;
    }

    const r = await fetchJson('/usuarios', { method: 'GET', auth: true });
    if (r.ok && Array.isArray(r.data)) {
      usuariosData = r.data.map(normalizarUsuario);
      return;
    }

    console.warn('No se pudieron cargar usuarios del backend; usando mock.', r);
    usuariosData = mockUsuarios.map(normalizarUsuario);
  }

  // Pintar sesión en header si existe
  paintSessionHeader();

  (async () => {
    await cargarGrupos();
    await cargarUsuarios();
    renderizarLista();
  })();
});
