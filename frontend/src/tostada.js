//pos alchile el js mas bonito de toda esta vaina
const TOSTADA_ICONOS = {
  exito: 'check_circle',
  error: 'error',
  advertencia: 'warning',
  info: 'info',
  primario: 'notifications'
};

function mostrarTostada({ titulo, mensaje = '', tipo = 'info', duracion = 4000 }) {
  const contenedor = document.getElementById('tostada-contenedor');
  if (!contenedor) return;

  const tostada = document.createElement('div');
  tostada.className = `tostada tostada-${tipo}`;
  tostada.innerHTML = `
    <div class="tostada-icono">
      <span class="material-symbols-outlined">${TOSTADA_ICONOS[tipo] || 'info'}</span>
    </div>
    <div class="tostada-cuerpo">
      <p class="tostada-titulo">${titulo}</p>
      ${mensaje ? `<p class="tostada-mensaje">${mensaje}</p>` : ''}
    </div>
    <button class="tostada-cerrar" aria-label="Cerrar">
      <span class="material-symbols-outlined">close</span>
    </button>
    <div class="tostada-progreso" style="animation-duration:${duracion}ms"></div>
  `;

  tostada.querySelector('.tostada-cerrar').addEventListener('click', () => cerrarTostada(tostada));
  contenedor.appendChild(tostada);

  const timer = setTimeout(() => cerrarTostada(tostada), duracion);
  tostada._timer = timer;
}

function cerrarTostada(tostada) {
  clearTimeout(tostada._timer);
  tostada.classList.add('saliendo');
  tostada.addEventListener('animationend', () => tostada.remove(), { once: true });
}
