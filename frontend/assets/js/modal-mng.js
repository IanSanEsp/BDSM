// mostrar modals y switching
(function(){
  const modalOverlay = document.getElementById("mngModal");
  const modalTabButtons = Array.from(document.querySelectorAll('.modal-tab'));
  const modalTabContents = Array.from(document.querySelectorAll('.modal-tab-content'));
  const modalCloseBtn = document.getElementById('closeMng');

  function switchTab(id){
    modalTabButtons.forEach(b => b.classList.remove('active'));
    modalTabContents.forEach(c => c.classList.remove('active'));
    const btn = modalTabButtons.find(b => b.dataset && b.dataset.tab === id);
    const content = document.getElementById(id);
    if (btn) btn.classList.add('active');
    if (content) content.classList.add('active');
    if (id === 'manualTab' && window.AdminMngSchedule && typeof window.AdminMngSchedule.ensureManualRows === 'function') window.AdminMngSchedule.ensureManualRows();
  }

  function show(tabId){
    if (!modalOverlay) return;
    modalOverlay.classList.add('show');
    // animar modal
    const card = modalOverlay.querySelector('.mng-modal');
    if (card) { requestAnimationFrame(()=> card.classList.add('enter')); }
    if (tabId) switchTab(tabId);
  }

  function hide(){ if (!modalOverlay) return; const card = modalOverlay.querySelector('.mng-modal'); if (card) { card.classList.remove('enter'); card.classList.add('leave'); modalOverlay.classList.remove('show'); // remove leave after animation
    setTimeout(()=>{ try{ card.classList.remove('leave'); }catch(e){} }, 360);
  } else { modalOverlay.classList.remove('show'); } }

  // wire buttons and global handlers
  try{ modalCloseBtn && modalCloseBtn.addEventListener('click', hide); }catch(e){}
  try{ window.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') {
      // close
      hide();
      document.querySelectorAll('.modal-overlay.show, .mng-modal-overlay.show').forEach(o=>{ o.classList.remove('show'); const c = o.querySelector('.modal-card, .mng-modal'); if (c) { c.classList.remove('enter'); c.classList.add('leave'); } });
    } }); }catch(e){}
  try{ window.addEventListener('click', (e)=>{ 
    const t = e.target;
    if (t && (t.classList && (t.classList.contains('mng-modal-overlay') || t.classList.contains('modal-overlay')))){
      t.classList.remove('show');
      const c = t.querySelector('.mng-modal, .modal-card'); if (c) { c.classList.remove('enter'); c.classList.add('leave'); }
    }
  }); }catch(e){}
  try{ modalTabButtons.forEach(b => b.addEventListener('click', ()=> switchTab(b.dataset.tab))); }catch(e){}

  try{
    document.querySelectorAll('.modal-overlay').forEach(ov => {
      const card = ov.querySelector('.modal-card');
      if (!card) return;
      const obs = new MutationObserver((list) => {
        list.forEach(m => {
          if (m.attributeName === 'class'){
            if (ov.classList.contains('show')) { card.classList.remove('leave'); requestAnimationFrame(()=> card.classList.add('enter')); }
            else { card.classList.remove('enter'); card.classList.add('leave'); // clear anim
              setTimeout(()=>{ try{ card.classList.remove('leave'); }catch(e){} }, 360);
            }
          }
        });
      });
      obs.observe(ov, { attributes: true, attributeFilter: ['class'] });
    });
  }catch(e){}

  window.AdminMngModal = { show, hide, switchTab };

  window.MNGModal = window.AdminMngModal;
  console.log('modal-mng.js loaded');
})();
