'use strict';

// Detección simple: si estás en localhost/127.0.0.1, usa API local; si no, usa el deploy
const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:3000'
  : 'https://bdsm-production-0032.up.railway.app';

const formLogin = document.getElementById('formLogin');
const btnLogin = document.getElementById('btnLogin');
const msgLogin = document.getElementById('msgLogin');
const tokenBox = document.getElementById('tokenBox');
const userBox = document.getElementById('userBox');

if (formLogin) {
  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    msgLogin.textContent = '';
    tokenBox.textContent = '';
    userBox.textContent = '';

    btnLogin.disabled = true;
    btnLogin.textContent = 'Verificando...';

    const payload = {
      correo: document.getElementById('correo').value.trim(),
      contrasena: document.getElementById('contrasena').value
    };

    try {
      const resp = await fetch(`${API_BASE}/api/usuarios/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        throw new Error(data.error || `Error ${resp.status}`);
      }

      msgLogin.classList.remove('error');
      msgLogin.classList.add('success');
      msgLogin.textContent = 'Login exitoso';

      if (data.token) {
        tokenBox.textContent = data.token;
        try {
          localStorage.setItem('token', data.token);
          // Añade una nota para el usuario
          msgLogin.textContent = 'Login exitoso (token guardado en localStorage)';
        } catch (_) {
          // Si falla localStorage (modo privado, etc.), simplemente lo ignoramos
        }
      }
      if (data.usuario) userBox.textContent = JSON.stringify(data.usuario, null, 2);
    } catch (err) {
      msgLogin.classList.remove('success');
      msgLogin.classList.add('error');
      msgLogin.textContent = err.message || 'No se pudo iniciar sesión';
      console.error(err);
    } finally {
      btnLogin.disabled = false;
      btnLogin.textContent = 'Iniciar sesión';
    }
  });
}
