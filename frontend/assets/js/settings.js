
document.addEventListener("DOMContentLoaded", () => {
  const menuItems = document.querySelectorAll(".menu-item");
  const cards = document.querySelectorAll(".settings-card");

  menuItems.forEach(btn => {
    btn.addEventListener("click", () => {
      
      menuItems.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      const target = btn.dataset.target;

      cards.forEach(card => {
        card.classList.remove("active");
        if (card.id === target) card.classList.add("active");
      });

    });
  });
});

document.addEventListener("DOMContentLoaded", () => {
  const username = document.getElementById('usernameInput');
  const email = document.getElementById('emailInput');
  const password = document.getElementById('currentPassword');
  const unlockBtn = document.getElementById('unlockBtn');
  const saveBtn = document.getElementById('saveChanges');

  if (!username || !email || !password || !unlockBtn || !saveBtn) return;

  const lockFields = () => {
    username.disabled = true;
    email.disabled = true;
    saveBtn.disabled = true;
  };

  const unlockFields = () => {
    username.disabled = false;
    email.disabled = false;
    saveBtn.disabled = false;
  };

  lockFields();

  password.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      unlockBtn.click();
    }
  });

  unlockBtn.addEventListener('click', () => {
    const val = password.value.trim();
    if (!val) {
      if (window.UI && window.UI.showBanner) {
        window.UI.showBanner('error', 'Introduce tu contraseña actual para habilitar los campos.', 4000);
      } else {
        alert('Introduce tu contraseña actual para habilitar los campos.');
      }
      return;
    }

    unlockFields();
    unlockBtn.disabled = true;
    password.disabled = true;
  });

});


document.addEventListener('DOMContentLoaded', () => {
  const changeBtn = document.getElementById('changeMaintPassBtn');
  const removeBtn = document.getElementById('removeMaintPassBtn');

  function getMaintPass(){ return localStorage.getItem('mantenimientoPass') || null; }
  function setMaintPass(p){ if (p===null) localStorage.removeItem('mantenimientoPass'); else localStorage.setItem('mantenimientoPass', p); }

  // Create modal structure
  function createPasswordModal(title, fields) {
    const modal = document.createElement('div');
    modal.className = 'password-modal-overlay';
    modal.innerHTML = `
      <div class="password-modal-card">
        <h3 class="password-modal-title">${title}</h3>
        <div class="password-modal-fields">
          ${fields.map((f, i) => `
            <div class="password-field-group">
              <label>${f.label}</label>
              <input type="password" placeholder="${f.placeholder}" data-field="${i}" class="password-input">
            </div>
          `).join('')}
        </div>
        <div class="password-modal-actions">
          <button class="password-btn confirm">Confirmar</button>
          <button class="password-btn cancel">Cancelar</button>
        </div>
      </div>
    `;
    return modal;
  }

  function showPasswordModal(title, fields) {
    return new Promise((resolve) => {
      const modal = createPasswordModal(title, fields);
      document.body.appendChild(modal);

      const overlay = modal;
      const inputs = modal.querySelectorAll('.password-input');
      const confirmBtn = modal.querySelector('.password-btn.confirm');
      const cancelBtn = modal.querySelector('.password-btn.cancel');
      const card = modal.querySelector('.password-modal-card');

      requestAnimationFrame(()=>{
        overlay.classList.add('show');
        card.classList.add('enter');
      });

      let closed = false;
      const cleanup = () => {
        closed = true;
        overlay.remove();
        document.removeEventListener('keydown', onKeyDown);
      };

      const doClose = (result) => {
        if (closed) return;
        card.classList.remove('enter');
        card.classList.add('leave');
        overlay.classList.remove('show');

        const finish = () => { cleanup(); resolve(result); };

        const onTrans = (ev) => {
          if (ev.target === card && (ev.propertyName === 'transform' || ev.propertyName === 'opacity')) {
            card.removeEventListener('transitionend', onTrans);
            finish();
          }
        };
        card.addEventListener('transitionend', onTrans);
        setTimeout(finish, 360);
      };

      confirmBtn.addEventListener('click', () => {
        const values = Array.from(inputs).map(i => i.value);
        doClose(values);
      });

      cancelBtn.addEventListener('click', () => {
        doClose(null);
      });

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          doClose(null);
        }
      });

      const onKeyDown = (e) => {
        if (e.key === 'Escape') doClose(null);
        if (e.key === 'Enter') {
          if (document.activeElement && document.activeElement.classList.contains('password-input')) {
            confirmBtn.click();
          }
        }
      };
      document.addEventListener('keydown', onKeyDown);

      inputs[0]?.focus();
    });
  }


    try { window.showPasswordModal = showPasswordModal; } catch(e) { /* ignore in strict contexts */ }

  if (changeBtn){
    changeBtn.addEventListener('click', async ()=>{
      const existing = getMaintPass();
      
      if (existing){
        const result = await showPasswordModal('Cambiar Clave de Mantenimiento', [
          { label: 'Clave Actual', placeholder: 'Introduce tu clave actual' }
        ]);
        if (!result) return;
        if (result[0] !== existing){ 
          if (window.UI && window.UI.showBanner) {
            window.UI.showBanner('error', 'Clave actual incorrecta.', 4000);
          } else {
            alert('Clave actual incorrecta.');
          }
          return; 
        }
      }

      const result = await showPasswordModal('Nueva Clave de Mantenimiento', [
        { label: 'Nueva Clave', placeholder: 'Mínimo 4 caracteres' },
        { label: 'Confirmar Clave', placeholder: 'Repite la nueva clave' }
      ]);
      
      if (!result) return;
      
      const [p1, p2] = result;
      if (!p1 || p1.length < 4){ 
        if (window.UI && window.UI.showBanner) {
          window.UI.showBanner('error', 'Clave inválida. Mínimo 4 caracteres.', 4000);
        } else {
          alert('Clave inválida. Mínimo 4 caracteres.');
        }
        return; 
      }
      if (p1 !== p2){ 
        if (window.UI && window.UI.showBanner) {
          window.UI.showBanner('error', 'Las claves no coinciden.', 4000);
        } else {
          alert('Las claves no coinciden.');
        }
        return; 
      }
      
      setMaintPass(p1);
      if (window.UI && window.UI.showBanner) {
        window.UI.showBanner('success', 'Clave de mantenimiento actualizada.', 4000);
      } else {
        alert('Clave de mantenimiento actualizada.');
      }
    });
  }

  if (removeBtn){
    removeBtn.addEventListener('click', async ()=>{
      const existing = getMaintPass();
      if (!existing){ 
        window.UI.showBanner('error', 'No existe clave registrada.', 4000);
        return; 
      }
      
      const result = await showPasswordModal('Eliminar Clave de Mantenimiento', [
        { label: 'Clave Actual', placeholder: 'Introduce tu clave para eliminarla' }
      ]);
      
      if (!result) return;
      if (result[0] !== existing){ 
        window.UI.showBanner('error', 'Clave incorrecta.', 4000);
        return; 
      }
      
      setMaintPass(null);
      window.UI.showBanner('success', 'Clave de mantenimiento eliminada.', 4000);
    });
  }

});

if (typeof window !== 'undefined') {
  try { if (typeof showPasswordModal === 'function') window.showPasswordModal = showPasswordModal; } catch(e) { /* ignore */ }
}

