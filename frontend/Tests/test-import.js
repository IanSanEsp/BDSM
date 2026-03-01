const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:3000'
  : 'https://bdsm-production-8774.up.railway.app';

const fileInput = document.getElementById('file');
const btnFile = document.getElementById('btnImportFile');
const btnServer = document.getElementById('btnImportServer');
const out = document.getElementById('output');
const tokenInput = document.getElementById('token');

async function postJson(json) {
  const token = tokenInput.value && tokenInput.value.trim();
  if (!token) {
    out.textContent = 'Falta token admin. Ingresa JWT en el campo.';
    return;
  }
  out.textContent = 'Importando...';
  try {
    const res = await fetch(`${API_BASE}/api/data/import/horarios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify(json)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || JSON.stringify(data));
    out.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    out.textContent = 'Error: ' + err.message;
  }
}

btnFile.addEventListener('click', async () => {
  const f = fileInput.files && fileInput.files[0];
  if (!f) { out.textContent = 'Selecciona un archivo JSON primero'; return; }
  try {
    const text = await f.text();
    const json = JSON.parse(text);
    await postJson(json);
  } catch (err) {
    out.textContent = 'Error procesando archivo: ' + err.message;
  }
});

btnServer.addEventListener('click', async () => {
  // En este caso no enviamos body para que el servidor lea el archivo en Exportacion_datos
  const token = tokenInput.value && tokenInput.value.trim();
  if (!token) { out.textContent = 'Falta token admin. Ingresa JWT en el campo.'; return; }
  out.textContent = 'Importando desde servidor...';
  try {
    const res = await fetch(`${API_BASE}/api/data/import/horarios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: '{}' // body vacío para forzar lectura del archivo en servidor
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || JSON.stringify(data));
    out.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    out.textContent = 'Error: ' + err.message;
  }
});
