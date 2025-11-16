const API_BASE = window.API_BASE || 'http://localhost:3000';

const $ = (s) => document.querySelector(s);
const tokenInput = $('#token');
const diaSel = $('#dia');
const bloqueSel = $('#bloque');
const salonSel = $('#salon');
const btnBuscar = $('#btnBuscar');
const lista = $('#lista');
const msg = $('#msg');

function getToken() {
  const t = localStorage.getItem('token');
  if (t && !tokenInput.value) tokenInput.value = t;
  return tokenInput.value?.trim();
}

async function cargarSalones() {
  try {
    const res = await fetch(`${API_BASE}/api/salones`);
    const data = await res.json();
    const items = data.salones || data || [];
    salonSel.innerHTML = '<option value="">Seleccione</option>';
    items.forEach(s => {
      const o = document.createElement('option'); o.value = s.id_salon; o.textContent = `${s.nombre} (${s.piso} - ${s.tipo})`;
      salonSel.appendChild(o);
    });
  } catch (err) {
    console.error(err);
  }
}

async function buscar() {
  lista.textContent = '';
  msg.textContent = '';
  const dia = diaSel.value;
  const bloque = bloqueSel.value;
  if (!dia || !bloque) { msg.textContent = 'Selecciona día y bloque'; return; }
  const [hi, hf] = bloque.split('|');
  try {
    const res = await fetch(`${API_BASE}/api/horarios/por-bloque?dia=${encodeURIComponent(dia)}&hora_inicio=${encodeURIComponent(hi)}&hora_fin=${encodeURIComponent(hf)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
    const items = data.horarios || [];
    if (items.length === 0) { lista.textContent = 'No hay horarios para ese bloque'; return; }
    lista.innerHTML = '';
    items.forEach(it => {
      const div = document.createElement('div');
      div.style.borderBottom = '1px solid #e6e6e6'; div.style.padding = '8px 0';
      const info = `#${it.id_horario} | Grupo: ${it.grupo_nombre || it.id_grupo} | Asig: ${it.asignatura || ''} | ${it.hora_inicio} - ${it.hora_fin} | Salón: ${it.id_salon || '-'} `;
      const p = document.createElement('div'); p.textContent = info;
      const btn = document.createElement('button'); btn.textContent = 'Asignar salón'; btn.style.marginLeft = '8px';
      btn.addEventListener('click', () => asignar(it.id_horario));
      div.appendChild(p); div.appendChild(btn); lista.appendChild(div);
    });
  } catch (err) {
    lista.textContent = 'Error: ' + err.message;
  }
}

async function asignar(idHorario) {
  const token = getToken();
  const idSalon = salonSel.value;
  if (!token) { alert('Falta token JWT'); return; }
  if (!idSalon) { alert('Selecciona un salón para asignar'); return; }
  if (!confirm(`Asignar salón ${idSalon} al horario #${idHorario}?`)) return;
  try {
    const res = await fetch(`${API_BASE}/api/horarios/${idHorario}/asignar-salon`, {
      method: 'POST', headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ id_salon: idSalon })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
    alert('Salón asignado correctamente');
    buscar();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// init
getToken();
cargarSalones();
btnBuscar.addEventListener('click', buscar);

