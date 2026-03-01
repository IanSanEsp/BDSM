const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:3000'
  : 'https://bdsm-production-8774.up.railway.app';

const btn = document.getElementById('btnExport');
const out = document.getElementById('output');

btn.addEventListener('click', async () => {
  out.textContent = 'Cargando...';
  try {
    const res = await fetch(`${API_BASE}/api/data/export/horarios`);
    if (!res.ok) throw new Error('Error HTTP ' + res.status);
    const data = await res.json();
    out.textContent = JSON.stringify(data, null, 2);

    // ofrecer descarga
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'horarios_export.json';
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    out.textContent = 'Error: ' + err.message;
  }
});
