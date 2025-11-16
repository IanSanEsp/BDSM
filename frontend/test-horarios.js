// Tester simple para horarios
const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:3000'
  : 'https://bdsm-production-0032.up.railway.app';

const $ = (s) => document.querySelector(s);
const form = $('#formHorario');
const tokenInput = $('#token');
const msg = $('#msg');
const btnListar = $('#btnListar');
const lista = $('#lista');

function getToken() {
  const t = localStorage.getItem('token');
  if (t && !tokenInput.value) tokenInput.value = t;
  return tokenInput.value?.trim();
}

async function crearHorario(e) {
  e.preventDefault();
  msg.textContent = '';
  const token = getToken();
  if (!token) { msg.textContent = 'Falta token JWT (logueate en test-login)'; return; }

  const payload = {
    grupo_nombre: $('#grupo_nombre').value.trim(),
    asignatura_nombre: $('#asignatura_nombre').value.trim(),
    dia: $('#dia').value,
    hora_inicio: $('#hora_inicio').value.trim(),
    hora_fin: $('#hora_fin').value.trim(),
  };

  try {
    const res = await fetch(`${API_BASE}/api/horarios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
    msg.textContent = 'Horario creado';
    listarHorarios();
  } catch (err) {
    msg.textContent = 'Error: ' + err.message;
  }
}

async function listarHorarios() {
  lista.textContent = 'Cargando...';
  try {
    const res = await fetch(`${API_BASE}/api/horarios`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    const items = data.horarios || [];
    if (items.length === 0) { lista.textContent = 'No hay horarios'; return; }

    // Construir lista con botones borrar
    lista.innerHTML = '';
    items.forEach(it => {
      const div = document.createElement('div');
      div.style.borderBottom = '1px solid #e6e6e6';
      div.style.padding = '8px 0';
      const info = `#${it.id_horario} | Grupo:${it.id_grupo} (${it.grupo_nombre||''}) | Asig:${it.asignatura||''} | Día:${it.dia} | ${it.hora_inicio} - ${it.hora_fin} | Salón:${it.id_salon||'-'}`;
      const p = document.createElement('div'); p.textContent = info;
      const btn = document.createElement('button'); btn.textContent = 'Borrar'; btn.style.marginLeft = '8px';
      btn.addEventListener('click', () => eliminarHorario(it.id_horario));
      div.appendChild(p);
      div.appendChild(btn);
      lista.appendChild(div);
    });
  } catch (err) {
    lista.textContent = 'Error: ' + err.message;
  }
}

async function eliminarHorario(id) {
  const token = getToken();
  if (!token) { alert('Falta token JWT'); return; }
  if (!confirm('Confirmar borrar horario #' + id)) return;
  try {
    const res = await fetch(`${API_BASE}/api/horarios/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
    listarHorarios();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// init
form?.addEventListener('submit', crearHorario);
btnListar?.addEventListener('click', listarHorarios);
getToken();
listarHorarios();
