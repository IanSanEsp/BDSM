import { DEFAULT_API_URL, resolveApiBase } from './map_preG_shared.js';

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const errorEl = document.getElementById('login-error');

  const setError = (msg) => {
    if (!errorEl) return;
    errorEl.textContent = msg ? String(msg) : '';
  };

  const clearError = () => setError('');

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      clearError();

      const email = String(document.getElementById('email').value || '').trim();
      const password = String(document.getElementById('password').value || '');

      const apiBase = resolveApiBase() || DEFAULT_API_URL;

      try {
        const res = await fetch(`${apiBase}/usuarios/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ correo: email, contrasena: password })
        });

        if (!res.ok) {
          let msg = '';
          try {
            const j = await res.json();
            msg = j?.error ? String(j.error) : '';
          } catch {
          }
          setError(msg || `HTTP ${res.status}`);
          return;
        }

        const data = await res.json();
        if (!data?.token || !data?.usuario) {
          setError('Login incompleto: falta token/usuario');
          return;
        }

        // tokens q se vaya a la vrg
        localStorage.setItem('bdsm_token', data.token);
        localStorage.setItem('bdsm_usuario', JSON.stringify(data.usuario));

        const tipo = data?.usuario?.tipo_usuario;
        if (tipo === 'Prefecto de Piso') {
          window.location.href = 'main_preP.html';
          return;
        }
        if (tipo !== 'Prefecto General') {
          localStorage.removeItem('bdsm_token');
          localStorage.removeItem('bdsm_usuario');
          setError('Acceso denegado: tipo de usuario no autorizado.');
          return;
        }
        window.location.href = 'main_preG.html';
        return;
      } catch {
        setError('No se pudo conectar al backend');
      }
    });
  }
});
