// Simple tester for salones endpoints
// Reads JWT token from localStorage (key: 'token') if available
// Requires CORS to allow your frontend origin. Ensure backend has 127.0.0.1:5500/localhost:5500 allowed.

//const API_BASE = window.API_BASE || 'http://localhost:3000';
const API_BASE = window.API_BASE || 'https://bdsm-production-0032.up.railway.app';

const $ = (sel) => document.querySelector(sel);
const msg = (el, text, cls) => { el.textContent = text; el.className = `message ${cls||''}`; };

const form = $('#formSalon');
const tokenInput = $('#token');
const msgSalon = $('#msgSalon');
const btnListar = $('#btnListar');
const salonesBox = $('#salonesBox');

function getToken() {
  // Prefer a token saved by test-login.js
  const t = localStorage.getItem('token');
  if (t && !tokenInput.value) tokenInput.value = t;
  return tokenInput.value?.trim();
}

async function crearSalon(ev) {
  ev.preventDefault();
  msg(msgSalon, '', '');

  const token = getToken();
  if (!token) {
    msg(msgSalon, 'Falta token JWT. Inicia sesión en test-login y vuelve.', 'error');
    return;
  }

  const payload = {
    nombre: $('#nombre').value.trim(),
    piso: $('#piso').value,
    tipo: $('#tipo').value,
  };

  try {
    const res = await fetch(`${API_BASE}/api/salones`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);

    msg(msgSalon, `Salón creado: ${data.salon?.id_salon || '(sin id)'} – ${data.message || 'OK'}`, 'success');
    // Refresh list automatically
    await listarSalones();
  } catch (err) {
    msg(msgSalon, `Error: ${err.message}`, 'error');
  }
}

async function listarSalones() {
  salonesBox.textContent = 'Cargando…';
  try {
    const res = await fetch(`${API_BASE}/api/salones`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
    salonesBox.textContent = JSON.stringify(data.salones || data, null, 2);
  } catch (err) {
    salonesBox.textContent = `Error: ${err.message}`;
  }
}

// Init
(function init() {
  // Pre-fill token from localStorage if found
  getToken();
  form?.addEventListener('submit', crearSalon);
  btnListar?.addEventListener('click', listarSalones);
  // Auto-load on open
  listarSalones();
})();
