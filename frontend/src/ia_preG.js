import { clearSession, paintSessionHeader } from './map_preG_shared.js';

// Reloj
function actualizarReloj() {
  const ahora = new Date();
  const h = String(ahora.getHours()).padStart(2, '0');
  const m = String(ahora.getMinutes()).padStart(2, '0');
  const dias = ['Domingo','Lunes','Martes','Miercoles','Jueves','Viernes','Sábado'];
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const relojEl = document.getElementById('reloj-tiempo');
  const fechaEl = document.getElementById('reloj-fecha');
  if (relojEl) relojEl.textContent = `${h} : ${m}`;
  if (fechaEl) fechaEl.textContent = `${dias[ahora.getDay()]} ${ahora.getDate()} de ${meses[ahora.getMonth()]}`;
}
actualizarReloj();
setInterval(actualizarReloj, 1000);

paintSessionHeader();

// Menú de perfil
const perfilBtn = document.getElementById('perfil-usuario-btn');
const menuPerfil = document.getElementById('menu-perfil-usuario');
if (perfilBtn && menuPerfil) {
  perfilBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menuPerfil.classList.toggle('visible');
  });
  document.addEventListener('click', () => menuPerfil.classList.remove('visible'));
}

const opcionPerfil = document.getElementById('opcion-perfil');
const opcionCerrarSesion = document.getElementById('opcion-cerrar-sesion');
if (opcionPerfil) opcionPerfil.addEventListener('click', () => { window.location.href = 'stt_preG.html'; });
if (opcionCerrarSesion) opcionCerrarSesion.addEventListener('click', () => {
  clearSession();
  window.location.href = 'index.html';
});

// Enviar con Enter
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('chat-send-btn');
if (chatInput && sendBtn) {
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendBtn.click();
    }
  });
}
