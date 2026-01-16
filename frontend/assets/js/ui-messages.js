(function(){
  function ensureBannerEl(){
    let el = document.getElementById('__ui_banner');
    if (el) return el;
    el = document.createElement('div');
    el.id = '__ui_banner';
    el.style.position = 'fixed';
    el.style.top = '18px';
    el.style.left = '50%';
    el.style.transform = 'translateX(-50%)';
    el.style.zIndex = 9999;
    el.style.minWidth = '320px';
    el.style.maxWidth = '920px';
    el.style.boxSizing = 'border-box';
    el.style.pointerEvents = 'none';
    el.style.fontFamily = '"Lexend", "Kanit", "Open Sans", "NATS", sans-serif';
    document.body.appendChild(el);
    return el;
  }

  function showBanner(type, message, timeoutMs){
    const el = ensureBannerEl();
    el.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'ui-banner ui-' + (type || 'info');
   
    card.style.pointerEvents = 'auto';
    card.style.display = 'flex';
    card.style.gap = '12px';
    card.style.alignItems = 'center';
    card.style.padding = '14px 18px';
    card.style.borderRadius = '8px';
    card.style.boxShadow = '0 8px 28px rgba(0,0,0,0.15)';
    card.style.fontWeight = '500';
    card.style.fontSize = '14px';
    card.style.animation = 'slideDown 0.3s ease-out';
    card.style.fontFamily = '"Lexend", "Kanit", "Open Sans", "NATS", sans-serif';
    
    const typeStyles = {
      'info': { background: '#93315c', border: '1px solid #b54b77', color: '#ffffff' },
      'success': { background: '#2d7d32', border: '1px solid #388e3c', color: '#ffffff' },
      'error': { background: '#c62828', border: '1px solid #d32f2f', color: '#ffffff' },
      'warning': { background: '#f57f17', border: '1px solid #fbc02d', color: '#ffffff' }
    };
    const style = typeStyles[type] || typeStyles['info'];
    card.style.background = style.background;
    card.style.border = style.border;
    if (style.color) card.style.color = style.color;
    
    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'ui-banner-body';
    bodyDiv.style.flex = '1';
    bodyDiv.style.lineHeight = '1.4';
    bodyDiv.textContent = String(message);
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'ui-banner-close';
    closeBtn.setAttribute('aria-label', 'Cerrar');
    closeBtn.textContent = '✕';
    closeBtn.style.background = 'rgba(255,255,255,0.2)';
    closeBtn.style.border = 'none';
    closeBtn.style.fontSize = '18px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.color = '#ffffff';
    closeBtn.style.transition = 'all 0.2s ease';
    closeBtn.style.padding = '4px 8px';
    closeBtn.style.marginLeft = '8px';
    closeBtn.style.borderRadius = '4px';
    closeBtn.style.fontWeight = 'bold';
    
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.background = 'rgba(255,255,255,0.3)';
      closeBtn.style.transform = 'scale(1.1)';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.background = 'rgba(255,255,255,0.2)';
      closeBtn.style.transform = 'scale(1)';
    });
    
    card.appendChild(bodyDiv);
    card.appendChild(closeBtn);
    el.appendChild(card);
    
    const closeBanner = () => {
      card.style.animation = 'slideUp 0.3s ease-out forwards';
      setTimeout(() => { try { card.remove(); } catch(e){} }, 300);
    };
    closeBtn.addEventListener('click', closeBanner);
    if (timeoutMs && timeoutMs > 0){ setTimeout(closeBanner, timeoutMs); }
  }

  function clearBanner(){ const el = document.getElementById('__ui_banner'); if (el) el.innerHTML = ''; }

  function escapeHtml(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  window.UI = window.UI || {};
  window.UI.showBanner = showBanner;
  window.UI.clearBanner = clearBanner;
})();
