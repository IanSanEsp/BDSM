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

  // Kebab menu de conversaciones
  const convDropdown = document.createElement('div');
  convDropdown.className = 'menu-desplegable conv-kebab-dropdown';
  convDropdown.innerHTML = `
    <button class="opcion-menu" id="kebab-renombrar">
      <span class="material-symbols-outlined md-18">edit</span>
      <span>Renombrar</span>
    </button>
    <button class="opcion-menu" id="kebab-eliminar">
      <span class="material-symbols-outlined md-18">delete</span>
      <span>Eliminar</span>
    </button>
  `;
  document.body.appendChild(convDropdown);

  let convItemActivo = null;

  document.getElementById('conv-lista')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.conv-menu-btn');
    if (!btn) return;
    e.stopPropagation();

    const item = btn.closest('.conv-item');
    if (convDropdown.classList.contains('activo') && convItemActivo === item) {
      convDropdown.classList.remove('activo');
      convItemActivo = null;
      return;
    }

    convItemActivo = item;
    const rect = btn.getBoundingClientRect();
    convDropdown.style.top = `${rect.bottom + window.scrollY + 4}px`;
    convDropdown.style.left = `${rect.right + window.scrollX - convDropdown.offsetWidth || rect.left}px`;
    convDropdown.classList.add('activo');

    requestAnimationFrame(() => {
      const dw = convDropdown.offsetWidth;
      convDropdown.style.left = `${rect.right + window.scrollX - dw}px`;
    });
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.conv-kebab-dropdown') && !e.target.closest('.conv-menu-btn')) {
      convDropdown.classList.remove('activo');
      convItemActivo = null;
    }
  });

  document.getElementById('kebab-renombrar')?.addEventListener('click', () => {
    if (!convItemActivo) return;
    const titulo = convItemActivo.querySelector('.conv-titulo');
    if (!titulo) return;
    const nuevoNombre = prompt('Nuevo nombre:', titulo.textContent);
    if (nuevoNombre?.trim()) titulo.textContent = nuevoNombre.trim();
    convDropdown.classList.remove('activo');
    convItemActivo = null;
  });

  document.getElementById('kebab-eliminar')?.addEventListener('click', () => {
    if (!convItemActivo) return;
    convItemActivo.remove();
    convDropdown.classList.remove('activo');
    convItemActivo = null;
  });

  // Chat input - enviar con Enter
  const chatInput = document.getElementById('chat-input');
  const chatSendBtn = document.getElementById('chat-send-btn');
  if (chatInput && chatSendBtn) {
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        chatSendBtn.click();
      }
    });
    chatSendBtn.addEventListener('click', () => {
      const msg = chatInput.value.trim();
      if (!msg) return;
      chatInput.value = '';
      // Placeholder: aquí iría la lógica de envío al backend
      console.log('Mensaje enviado:', msg);
    });
  }

  // Menú de perfil
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
