import { DEFAULT_API_URL, resolveApiBase, getSessionToken, getSessionUser, paintSessionHeader, clearSession } from './map_preG_shared.js';

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
  const usuarioActual = getSessionUser();
  const pisoActual = usuarioActual?.piso || '3';

  paintSessionHeader(usuarioActual);

  // Reloj
  const elementoReloj = document.getElementById('reloj-tiempo');
  const elementoFecha = document.getElementById('reloj-fecha');
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

  // Poblar datos del usuario actual en el perfil
  if (usuarioActual) {
    const partes = usuarioActual.nombre.split(' ');
    const iniciales = (partes[0]?.[0] || '') + (partes[1]?.[0] || '');

    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const setInput = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };

    // Header
    setVal('nombre-usuario-header', usuarioActual.nombre);
    const avatarHeader = document.getElementById('avatar-header');
    if (avatarHeader) avatarHeader.textContent = iniciales;

    // Tarjeta cabecera
    const avatarGrande = document.getElementById('avatar-grande-perfil');
    if (avatarGrande) avatarGrande.textContent = iniciales;
    setVal('nombre-perfil-grande', usuarioActual.nombre);
    setVal('correo-perfil-grande', usuarioActual.correo || '');

    // Vista
    setVal('vista-nombre', usuarioActual.nombre);
    setVal('vista-correo', usuarioActual.correo || '');
    setVal('vista-turno', usuarioActual.turno || 'Vespertino');
    setVal('vista-piso', pisoActual);

    // Ediciopn
    setInput('edit-nombre', usuarioActual.nombre);
    setInput('edit-correo', usuarioActual.correo || '');
    const editTurno = document.getElementById('edit-turno');
    if (editTurno) {
      Array.from(editTurno.options).forEach(opt => { opt.selected = opt.value === usuarioActual.turno; });
    }
    setInput('edit-piso', pisoActual);
  }

  // Toggle edicion/vista
  const vistaInfo = document.getElementById('vista-info');
  const edicionInfo = document.getElementById('edicion-info');
  const btnEditar = document.getElementById('btn-editar-info');
  const btnGuardar = document.getElementById('btn-guardar-info');

  if (btnEditar) {
    btnEditar.addEventListener('click', () => {
      vistaInfo?.classList.add('oculto');
      edicionInfo?.classList.remove('oculto');
      btnEditar.classList.add('oculto');
      btnGuardar?.classList.remove('oculto');
    });
  }

  if (btnGuardar) {
    btnGuardar.addEventListener('click', async () => {
      const nombre = document.getElementById('edit-nombre')?.value || '';
      const correo = document.getElementById('edit-correo')?.value || '';
      const turno = document.getElementById('edit-turno')?.value || '';

      try {
        await fetchJson(`/usuarios/me`, {
          method: 'PUT',
          auth: true,
          body: { nombre, correo, turno }
        });
      } catch (e) { console.warn('Error guardando perfil:', e); }

      const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      setVal('vista-nombre', nombre);
      setVal('vista-correo', correo);
      setVal('vista-turno', turno);
      setVal('nombre-perfil-grande', nombre);
      setVal('correo-perfil-grande', correo);

      vistaInfo?.classList.remove('oculto');
      edicionInfo?.classList.add('oculto');
      btnGuardar?.classList.add('oculto');
      btnEditar?.classList.remove('oculto');
    });
  }

  // Menu de perfil
  const perfilBtn = document.getElementById('perfil-usuario-btn');
  const menuPerfilUsuario = document.getElementById('menu-perfil-usuario');
  if (perfilBtn && menuPerfilUsuario) {
    perfilBtn.addEventListener('click', (e) => { e.stopPropagation(); menuPerfilUsuario.classList.toggle('activo'); });
  }
  document.addEventListener('click', (e) => {
    if (menuPerfilUsuario && !e.target.closest('#perfil-usuario-btn') && !e.target.closest('#menu-perfil-usuario')) {
      menuPerfilUsuario.classList.remove('activo');
    }
  });
  document.getElementById('opcion-perfil')?.addEventListener('click', () => { window.location.href = 'stt_preP.html'; });
  document.getElementById('opcion-cerrar-sesion')?.addEventListener('click', () => { clearSession(); window.location.href = 'index.html'; });
});
