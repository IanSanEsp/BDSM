document.addEventListener('DOMContentLoaded', () => {
  const logo = document.querySelector('.header-logo');
  if (!logo) return;

  let clickCount = 0;
  let lastClickTime = 0;
  const CLICK_WINDOW_MS = 800; // tiempo máximo entre clics

  function ensureOverlay() {
    let overlay = document.getElementById('logoEasterEggOverlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'logoEasterEggOverlay';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(0,0,0,0.82)';
    overlay.style.zIndex = '9999';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';

    const inner = document.createElement('div');
    inner.style.position = 'relative';
    inner.style.maxWidth = '960px';
    inner.style.width = '90%';
    inner.style.aspectRatio = '16 / 9';
    inner.style.background = '#000';
    inner.style.borderRadius = '12px';
    inner.style.overflow = 'hidden';
    inner.style.boxShadow = '0 20px 60px rgba(0,0,0,0.6)';

    const video = document.createElement('video');
    video.id = 'logoEggVideo';
    video.src = 'assets/esoSimion.mp4';
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'cover';
    video.autoplay = true;
    video.muted = true; // sin audio de video
    // Loop manual para que reinicie luego luego sin quedarse en blanco
    video.addEventListener('ended', () => {
      try {
        video.currentTime = 0;
        video.play();
      } catch (e) {}
    });

    const audio = document.createElement('audio');
    audio.id = 'logoEggAudio';
    audio.src = 'assets/cumbiaPesada.mp3';
    audio.loop = true;

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Cerrar';
    closeBtn.style.position = 'absolute';
    closeBtn.style.top = '10px';
    closeBtn.style.right = '10px';
    closeBtn.style.padding = '6px 14px';
    closeBtn.style.borderRadius = '999px';
    closeBtn.style.border = 'none';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.background = '#ffffffee';
    closeBtn.style.color = '#8A2041';
    closeBtn.style.fontWeight = '700';
    closeBtn.style.fontFamily = '"Lexend", "Kanit", "Open Sans", sans-serif';
    closeBtn.style.boxShadow = '0 4px 14px rgba(0,0,0,0.4)';

    closeBtn.addEventListener('click', () => {
      try {
        const v = document.getElementById('logoEggVideo');
        const a = document.getElementById('logoEggAudio');
        if (v) { v.pause(); v.currentTime = 0; }
        if (a) { a.pause(); a.currentTime = 0; }
      } catch (e) {}
      overlay.remove();
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeBtn.click();
      }
    });

    document.addEventListener('keydown', function onKey(ev) {
      if (ev.key === 'Escape') {
        document.removeEventListener('keydown', onKey);
        closeBtn.click();
      }
    });

    inner.appendChild(video);
    inner.appendChild(closeBtn);
    overlay.appendChild(inner);
    overlay.appendChild(audio);
    document.body.appendChild(overlay);

    // intentar reproducir audio (puede requerir interacción previa del usuario)
    audio.play().catch(() => {
      // si el navegador bloquea autoplay, no hacemos nada especial
    });

    return overlay;
  }

  logo.addEventListener('click', () => {
    const now = Date.now();
    if (now - lastClickTime > CLICK_WINDOW_MS) {
      // reiniciar si pasó mucho tiempo entre clics
      clickCount = 0;
    }
    lastClickTime = now;
    clickCount++;

    if (clickCount >= 3) {
      clickCount = 0;
      ensureOverlay();
    }
  });
});
