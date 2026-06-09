import { DEFAULT_API_URL, resolveApiBase, getSessionToken, getSessionUser, clearSession, paintSessionHeader } from './map_preG_shared.js';

const apiBase = resolveApiBase() || DEFAULT_API_URL;

let sesionActiva = null;
let enviando = false;

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

  const relojEl = document.getElementById('reloj-tiempo');
  const fechaEl = document.getElementById('reloj-fecha');
  const actualizarTiempo = () => {
    const ahora = new Date();
    if (relojEl) relojEl.textContent = `${String(ahora.getHours()).padStart(2, '0')} : ${String(ahora.getMinutes()).padStart(2, '0')}`;
    if (fechaEl) {
      let t = ahora.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
      fechaEl.textContent = t.charAt(0).toUpperCase() + t.slice(1);
    }
  };
  actualizarTiempo();
  setInterval(actualizarTiempo, 1000);

  const chatContainer = document.getElementById('chat-mensajes');
  const chatInput = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send-btn');

  function agregarMensaje(texto, tipo, source) {
    const div = document.createElement('div');
    div.className = `mensaje mensaje-${tipo}`;
    const contenido = document.createElement('div');
    contenido.className = 'mensaje-contenido';
    contenido.innerHTML = texto.replace(/\n/g, '<br>').replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
    div.appendChild(contenido);

    if (tipo === 'sIAmon' && source) {
      const badge = document.createElement('span');
      badge.className = `source-badge ${source === 'gemini' ? 'gemini' : 'fallback'}`;
      badge.textContent = source === 'gemini' ? '✨ IA' : '⚙️ Base de datos';
      contenido.appendChild(document.createElement('br'));
      contenido.appendChild(badge);
    }

    chatContainer.appendChild(div);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  function mostrarSpinner() {
    const spinner = document.createElement('div');
    spinner.className = 'mensaje mensaje-spinner';
    spinner.id = 'chat-spinner';
    spinner.innerHTML = '<div class="spinner"><div class="bounce1"></div><div class="bounce2"></div><div class="bounce3"></div></div>';
    chatContainer.appendChild(spinner);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  function quitarSpinner() {
    const s = document.getElementById('chat-spinner');
    if (s) s.remove();
  }

  function mostrarBienvenida() {
    chatContainer.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'mensaje mensaje-bienvenida';
    div.innerHTML = `
      <div class="bienvenida-contenido">
        <h2>👋 ¡Hola! Soy sIAmon</h2>
        <p>Puedes preguntarme sobre:</p>
        <ul>
          <li>📋 Horarios de grupos, profesores o salones</li>
          <li>✅ Salones disponibles ahora</li>
          <li>📊 Ocupación de pisos</li>
          <li>⚠️ Incidencias del día</li>
          <li>💡 Sugerencias para reasignar salones</li>
        </ul>
        <p class="bienvenida-ejemplo"><em>Ej: "¿Qué salones hay libres en el piso 3?"</em></p>
      </div>
    `;
    chatContainer.appendChild(div);
  }

  mostrarBienvenida();

  async function enviarMensaje() {
    const msg = chatInput.value.trim();
    if (!msg || enviando) return;

    chatInput.value = '';
    enviando = true;
    sendBtn.disabled = true;

    chatContainer.querySelector('.mensaje-bienvenida')?.remove();
    agregarMensaje(msg, 'usuario');
    mostrarSpinner();

    try {
      const res = await fetchJson('/sAImon/consulta', {
        method: 'POST',
        auth: true,
        body: { mensaje: msg, sesion_id: sesionActiva }
      });

      sesionActiva = res.sesion_id;
      quitarSpinner();

      if (res.intent === 'desconocido') {
        agregarMensaje('No entendí tu consulta. Intenta preguntar sobre horarios, salones disponibles, ocupación de pisos o incidencias.', 'sIAmon', 'template');
      } else {
        agregarMensaje(res.respuesta, 'sIAmon', res.source);
      }
    } catch (err) {
      quitarSpinner();
      agregarMensaje(`❌ Error: ${err.message}`, 'sIAmon', 'template');
    } finally {
      enviando = false;
      sendBtn.disabled = false;
      chatInput.focus();
    }
  }

  if (chatInput && sendBtn) {
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        enviarMensaje();
      }
    });
    sendBtn.addEventListener('click', enviarMensaje);
  }

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
