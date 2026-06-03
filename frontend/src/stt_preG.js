import {
  DEFAULT_API_URL,
  clearSession,
  getInitials,
  getSessionToken,
  getSessionUser,
  paintSessionHeader,
  resolveApiBase,
  setSessionUser
} from './map_preG_shared.js';

document.addEventListener('DOMContentLoaded', () => {
  // Reloj
  const relojTiempo = document.getElementById('reloj-tiempo');
  const relojFecha = document.getElementById('reloj-fecha');

  const actualizarReloj = () => {
    const ahora = new Date();
    const horas = String(ahora.getHours()).padStart(2, '0');
    const minutos = String(ahora.getMinutes()).padStart(2, '0');
    if (relojTiempo) relojTiempo.textContent = `${horas} : ${minutos}`;
    const opciones = { weekday: 'long', day: 'numeric', month: 'long' };
    if (relojFecha) relojFecha.textContent = ahora.toLocaleDateString('es-ES', opciones);
  };

  setInterval(actualizarReloj, 1000);
  actualizarReloj();

  let apiBase = resolveApiBase() || DEFAULT_API_URL;

  // Pos too lo perfil
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

  const sesion = getSessionUser();
  if (sesion) {
    paintSessionHeader(sesion);
  }

  const avatarGrandeEl = document.querySelector('.avatar-grande');
  const nombreGrandeEl = document.querySelector('.nombre-perfil-grande');
  const rolGrandeEl = document.querySelector('.rol-perfil-grande');
  const correoGrandeEl = document.querySelector('.correo-perfil-grande');

  const vistaNombreEl = document.getElementById('vista-nombre');
  const vistaBoletaEl = document.getElementById('vista-boleta');
  const vistaCorreoEl = document.getElementById('vista-correo');
  const vistaTurnoEl = document.getElementById('vista-turno');

  const editNombreEl = document.getElementById('edit-nombre');
  const editBoletaEl = document.getElementById('edit-boleta');
  const editCorreoEl = document.getElementById('edit-correo');
  const editTurnoEl = document.getElementById('edit-turno');

  const pintarPerfilDesdeSesion = (u) => {
    if (!u) return;

    const nombre = u.nombre ?? '';
    const rol = u.tipo_usuario ?? '';
    const correo = u.correo ?? '';
    const turno = u.turno ?? '';
    const boleta = u.id_usuario ?? u.id_usuarios ?? '';

    if (avatarGrandeEl) avatarGrandeEl.textContent = getInitials(nombre);
    if (nombreGrandeEl) nombreGrandeEl.textContent = nombre || '—';
    if (rolGrandeEl) rolGrandeEl.textContent = rol || '—';
    if (correoGrandeEl) correoGrandeEl.textContent = correo || '—';

    if (vistaNombreEl) vistaNombreEl.textContent = nombre || '—';
    if (vistaBoletaEl) vistaBoletaEl.textContent = boleta ? String(boleta) : '—';
    if (vistaCorreoEl) vistaCorreoEl.textContent = correo || '—';
    if (vistaTurnoEl) vistaTurnoEl.textContent = turno || '—';

    if (editNombreEl) editNombreEl.value = nombre;
    if (editBoletaEl) editBoletaEl.value = boleta ? String(boleta) : '';
    if (editCorreoEl) editCorreoEl.value = correo;
    if (editTurnoEl && turno) editTurnoEl.value = turno;
  };

  pintarPerfilDesdeSesion(sesion);

  const fetchJson = async (path, { method = 'GET', body, auth = false } = {}) => {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth) {
      const token = getSessionToken();
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
  };

  // Edicion de información de perfil (solo vista, no guarda cambios en mockData)
  const vistaInfo = document.getElementById('vista-info');
  const edicionInfo = document.getElementById('edicion-info');
  const btnEditar = document.getElementById('btn-editar-info');
  const btnGuardar = document.getElementById('btn-guardar-info');

  let modoEdicion = false;

  btnEditar?.addEventListener('click', () => {
    if (modoEdicion) {
      vistaInfo.classList.remove('oculto');
      edicionInfo.classList.add('oculto');
      btnEditar.textContent = 'Editar Información';
      modoEdicion = false;
    } else {
      vistaInfo.classList.add('oculto');
      edicionInfo.classList.remove('oculto');
      btnEditar.textContent = 'Cancelar';
      modoEdicion = true;
    }
  });

  btnGuardar?.addEventListener('click', async () => { // agregar validaciones antes de guardar
    if (!modoEdicion) return;

    const token = getSessionToken();
    const u = getSessionUser();
    if (!token || !u?.id_usuario) {
      mostrarTostada({ titulo: 'Error', mensaje: 'No hay sesión activa. Inicia sesión otra vez.', tipo: 'error' });
      clearSession();
      window.location.href = 'index.html';
      return;
    }

    const nombre = String(editNombreEl?.value || '').trim();
    const correo = String(editCorreoEl?.value || '').trim();
    const turno = String(editTurnoEl?.value || '').trim();
    if (!nombre || !correo || !turno) {
      mostrarTostada({ titulo: 'Aviso', mensaje: 'Completa nombre, correo y turno', tipo: 'advertencia' });
      return;
    }

    try {
      const r = await fetchJson(`/usuarios/me`, {
        method: 'PUT',
        body: { nombre, correo, turno },
        auth: true
      });
      if (!r.ok) {
        mostrarTostada({ titulo: 'Error', mensaje: r?.data?.error || `No se pudo guardar (HTTP ${r.status})`, tipo: 'error' });
        return;
      }

      const updated = { ...u, nombre, correo, turno };
      setSessionUser(updated);
      paintSessionHeader(updated);
      pintarPerfilDesdeSesion(updated);

      vistaInfo.classList.remove('oculto');
      edicionInfo.classList.add('oculto');
      btnEditar.textContent = 'Editar Información';
      modoEdicion = false;
    } catch {
      mostrarTostada({ titulo: 'Error', mensaje: 'No se pudo conectar al backend', tipo: 'error' });
    }
  });

  // Cambio de contraseña
  document.getElementById('btn-guardar-contrasena')?.addEventListener('click', async () => {
    const actual = document.getElementById('edit-contrasena-actual')?.value || '';
    const nueva = document.getElementById('edit-contrasena-nueva')?.value || '';
    const confirmar = document.getElementById('edit-contrasena-confirmar')?.value || '';

    if (!actual || !nueva || !confirmar) {
      mostrarTostada({ titulo: 'Aviso', mensaje: 'Completa todos los campos de contraseña', tipo: 'advertencia' });
      return;
    }
    if (nueva !== confirmar) {
      mostrarTostada({ titulo: 'Error', mensaje: 'La nueva contraseña y la confirmación no coinciden', tipo: 'error' });
      return;
    }
    if (nueva.length < 8) {
      mostrarTostada({ titulo: 'Error', mensaje: 'La nueva contraseña debe tener al menos 8 caracteres', tipo: 'error' });
      return;
    }

    try {
      const r = await fetchJson('/usuarios/me', {
        method: 'PUT',
        body: { contrasena_actual: actual, contrasena_nueva: nueva },
        auth: true
      });
      if (!r.ok) {
        mostrarTostada({ titulo: 'Error', mensaje: r?.data?.error || 'No se pudo cambiar la contraseña', tipo: 'error' });
        return;
      }
      mostrarTostada({ titulo: 'Éxito', mensaje: 'Contraseña actualizada correctamente', tipo: 'exito' });
      document.getElementById('edit-contrasena-actual').value = '';
      document.getElementById('edit-contrasena-nueva').value = '';
      document.getElementById('edit-contrasena-confirmar').value = '';
    } catch {
      mostrarTostada({ titulo: 'Error', mensaje: 'No se pudo conectar al backend', tipo: 'error' });
    }
  });
});
