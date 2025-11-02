'use strict';

// Cambia esta base si pruebas en local o en producción
const API_BASE = "http://localhost:3000";
//const API_BASE = "https://bdsm-production-0032.up.railway.app";

const btnUsuarios = document.getElementById('btnUsuarios');
const lista = document.getElementById('listaUsuarios');
const formRegistro = document.getElementById('formRegistro');
const msgRegistro = document.getElementById('msgRegistro');
const btnRegistrar = document.getElementById('btnRegistrar');

async function cargarUsuarios() {
  if (!lista) return;
  lista.innerHTML = 'Cargando...';
  try {
    const respuesta = await fetch(`${API_BASE}/api/usuarios`);
    if (!respuesta.ok) throw new Error(`Error ${respuesta.status}`);
    const usuarios = await respuesta.json();
    lista.innerHTML = '';
    usuarios.forEach(u => {
      const li = document.createElement('li');
      li.textContent = `${u.nombre ?? ''} ${u.appat ?? ''} ${u.apmat ?? ''} — ${u.correo_electronico ?? ''}`.trim();
      lista.appendChild(li);
    });
  } catch (e) {
    lista.innerHTML = 'No se pudieron cargar usuarios.';
    console.error(e);
  }
}

if (btnUsuarios) {
  btnUsuarios.addEventListener('click', cargarUsuarios);
}

if (formRegistro) {
  formRegistro.addEventListener('submit', async (e) => {
    e.preventDefault();
    msgRegistro.textContent = '';
    btnRegistrar.disabled = true;
    btnRegistrar.textContent = 'Registrando...';

    const payload = {
      nombre: document.getElementById('nombre').value.trim(),
      apellido_paterno: document.getElementById('apellido_paterno').value.trim(),
      apellido_materno: document.getElementById('apellido_materno').value.trim(),
      correo: document.getElementById('correo').value.trim(),
      contrasena: document.getElementById('contrasena').value
    };

    try {
      const resp = await fetch(`${API_BASE}/api/usuarios/registrar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        throw new Error(data.error || `Error ${resp.status}`);
      }

      msgRegistro.classList.remove('error');
      msgRegistro.classList.add('success');
      msgRegistro.textContent = 'Usuario registrado correctamente';
      formRegistro.reset();

      await cargarUsuarios();
    } catch (err) {
      msgRegistro.classList.remove('success');
      msgRegistro.classList.add('error');
      msgRegistro.textContent = err.message || 'No se pudo registrar';
      console.error(err);
    } finally {
      btnRegistrar.disabled = false;
      btnRegistrar.textContent = 'Registrar';
    }
  });
}
