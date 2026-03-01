document.addEventListener('DOMContentLoaded', ()=>{
  const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://localhost:3000'
    : 'https://bdsm-production-8774.up.railway.app';

  const usersListEl = document.getElementById('usersList');
  const userDetailEl = document.getElementById('userDetail');
  const searchInput = document.getElementById('usersSearch');
  const addUserBtn = document.getElementById('addUserBtn');

  const state = { users: [] };

  const show = (type, msg, ms=3000)=>{
    if (window.UI && window.UI.showBanner) return window.UI.showBanner(type, msg, ms);
    alert(msg);
  };

  function getToken(){
    return (localStorage.getItem('token') || '').trim();
  }

  function initials(name=''){
    return name.split(' ').filter(Boolean).map(s=>s[0]).slice(0,2).join('') || '?';
  }

  function renderList(filter){
    usersListEl.innerHTML = '';
    const list = filter ? state.users.filter(u=> (u.name||'').toLowerCase().includes(filter.toLowerCase())) : state.users;
    list.forEach(u=>{
      const row = document.createElement('div');
      row.className = 'user-row';
      row.dataset.id = u.id_usuario;
      row.innerHTML = `
        <div class="user-avatar">${initials(u.name)}</div>
        <div class="user-meta">
          <div class="user-name">${u.name}</div>
          <div class="user-role small-muted">${u.mail || ''}</div>
        </div>
        <div class="user-status active">${u.tipo || ''}</div>
      `;
      row.addEventListener('click', ()=> showDetail(u.id_usuario));
      usersListEl.appendChild(row);
    });
    if (list.length === 0) usersListEl.innerHTML = '<div class="small-muted">No hay usuarios.</div>';
  }

  function showDetail(id){
    const u = state.users.find(x=> String(x.id_usuario) === String(id));
    if (!u) return;
    userDetailEl.innerHTML = '';
    const card = document.createElement('div'); card.className = 'user-detail-card';
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div style="display:flex; gap:12px; align-items:center;">
          <div class="user-avatar" style="width:64px; height:64px; border-radius:10px; font-size:20px;">${initials(u.name)}</div>
          <div>
            <div style="font-weight:800; font-size:18px; color:#333">${u.name}</div>
            <div style="color:#777">${u.mail || ''}</div>
          </div>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="mng-btn" id="editUserBtn">Editar</button>
          <button class="mng-btn danger" id="deleteUserBtn">Eliminar</button>
        </div>
      </div>
      <div class="user-detail-row"><div class="user-detail-label">Mail</div><div class="user-detail-value">${u.mail || ''}</div></div>
      <div class="user-detail-row"><div class="user-detail-label">Rol</div><div class="user-detail-value">${u.tipo || ''}</div></div>
    `;
    userDetailEl.appendChild(card);

    document.querySelectorAll('.user-row.selected').forEach(r=> r.classList.remove('selected'));
    const sel = usersListEl.querySelector(`.user-row[data-id="${u.id_usuario}"]`);
    if (sel) { sel.classList.add('selected'); sel.scrollIntoView({ block: 'nearest' }); }

    // acciones
    const editBtn = card.querySelector('#editUserBtn');
    const delBtn = card.querySelector('#deleteUserBtn');
    editBtn && editBtn.addEventListener('click', ()=> openEditUserModal(u));
    delBtn && delBtn.addEventListener('click', ()=> confirmDeleteUser(u));
  }

  async function fetchUsers(){
    usersListEl.innerHTML = '<div class="small-muted">Cargando usuarios...</div>';
    try {
      const token = getToken();
      if (!token) throw new Error('Falta token. Inicia sesión como admin.');
      const res = await fetch(`${API_BASE}/api/usuarios`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      state.users = (data || []).map(u=>({
        id_usuario: u.id_usuario,
        name: `${u.nombre || ''} ${u.appat || ''} ${u.apmat || ''}`.replace(/\s+/g,' ').trim(),
        mail: u.correo_electronico,
        tipo: u.tipo_user || ''
      }));
      renderList(searchInput?.value || '');
      if (state.users.length > 0) showDetail(state.users[0].id_usuario);
    } catch (err) {
      usersListEl.innerHTML = `<div class="small-muted">Error: ${err.message}</div>`;
    }
  }

  function openFormModal(title, fields){
    return new Promise((resolve)=>{
      const overlay = document.createElement('div'); overlay.className = 'password-modal-overlay';
      const card = document.createElement('div'); card.className = 'password-modal-card';
      const inner = document.createElement('div');
      inner.style.padding = '6px 18px 12px 18px';
      inner.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;"><h3 class=\"password-modal-title\">${title}</h3><button class=\"modal-close\">✕</button></div>`;
      const form = document.createElement('div'); form.className = 'password-modal-fields';

      fields.forEach(f=>{
        const row = document.createElement('div'); row.style.display='flex'; row.style.flexDirection='column';
        const label = document.createElement('label'); label.textContent = f.label; label.className = 'password-field-group';
        let input;
        if (f.type === 'select'){
          input = document.createElement('select');
          (f.options||[]).forEach(o=>{ const opt=document.createElement('option'); opt.value=o.value; opt.textContent=o.label; if (f.value==o.value) opt.selected=true; input.appendChild(opt); });
        } else {
          input = document.createElement('input'); input.type = f.type || 'text'; input.placeholder = f.placeholder || '';
          if (f.value) input.value = f.value;
        }
        input.dataset.field = f.name;
        input.className = 'password-input';
        row.appendChild(label); row.appendChild(input); form.appendChild(row);
      });

      const actions = document.createElement('div'); actions.className = 'password-modal-actions';
      const cancelBtn = document.createElement('button'); cancelBtn.className='password-btn cancel'; cancelBtn.textContent='Cancelar';
      const saveBtn = document.createElement('button'); saveBtn.className='password-btn confirm'; saveBtn.textContent='Confirmar';
      actions.appendChild(cancelBtn); actions.appendChild(saveBtn);

      inner.appendChild(form); inner.appendChild(actions); card.appendChild(inner); overlay.appendChild(card); document.body.appendChild(overlay);

      requestAnimationFrame(()=>{ overlay.classList.add('show'); card.classList.add('enter'); });

      const cleanup = (res)=>{
        card.classList.remove('enter'); card.classList.add('leave'); overlay.classList.remove('show');
        const finish = ()=>{ try{ overlay.remove(); }catch(e){} resolve(res); };
        card.addEventListener('transitionend', function onT(ev){ if (ev.target===card){ card.removeEventListener('transitionend', onT); finish(); } });
        setTimeout(finish, 360);
      };

      cancelBtn.addEventListener('click', ()=> cleanup(null));
      overlay.addEventListener('click', (e)=>{ if (e.target === overlay) cleanup(null); });
      document.addEventListener('keydown', function onKey(e){ if (e.key==='Escape'){ document.removeEventListener('keydown', onKey); cleanup(null); } });
      saveBtn.addEventListener('click', ()=>{
        const inputs = overlay.querySelectorAll('[data-field]');
        const out = {};
        inputs.forEach(i=> out[i.dataset.field] = i.value);
        cleanup(out);
      });
    });
  }

  function openNewUserModal(){
    openFormModal('Nuevo Admin', [
      { name:'nombre', label:'Nombre', type:'text' },
      { name:'appat', label:'Apellido paterno', type:'text' },
      { name:'apmat', label:'Apellido materno', type:'text' },
      { name:'correo', label:'Correo', type:'email' },
      { name:'contrasena', label:'Contraseña', type:'password', placeholder:'Mínimo 8 caracteres' }
    ]).then(async values=>{
      if (!values) return;
      if (!values.nombre || !values.appat || !values.apmat || !values.correo || !values.contrasena){
        show('error','Completa todos los campos');
        return;
      }
      if ((values.contrasena || '').length < 8){
        show('error','La contraseña debe tener al menos 8 caracteres');
        return;
      }
      try {
        const token = getToken();
        if (!token) throw new Error('Falta token. Inicia sesión como admin.');
        const res = await fetch(`${API_BASE}/api/usuarios/admin/registrar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(values)
        });
        const data = await res.json().catch(()=>({}));
        if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
        show('success','Admin creado.');
        fetchUsers();
      } catch (err) {
        show('error', err.message || 'Error al crear admin');
      }
    });
  }

  function parseNameParts(fullName=''){
    const parts = String(fullName).trim().split(/\s+/);
    const nombre = parts.shift() || '';
    const appat = parts.shift() || '';
    const apmat = parts.join(' ') || '';
    return { nombre, appat, apmat };
  }

  function openEditUserModal(user){
    const parts = parseNameParts(user.name);
    openFormModal('Editar Usuario', [
      { name:'nombre', label:'Nombre', type:'text', value: parts.nombre },
      { name:'appat', label:'Apellido paterno', type:'text', value: parts.appat },
      { name:'apmat', label:'Apellido materno', type:'text', value: parts.apmat },
      { name:'correo', label:'Correo', type:'email', value: user.mail || '' },
      { name:'tipo_user', label:'Rol', type:'select', value: (user.tipo || '').toLowerCase().startsWith('admin') ? 'administrador' : 'usuario', options:[
        { value:'usuario', label:'Usuario' },
        { value:'administrador', label:'Administrador' }
      ]},
      { name:'contrasena', label:'Contraseña (opcional)', type:'password', placeholder:'Dejar en blanco para no cambiar' }
    ]).then(async values=>{
      if (!values) return;
      const payload = {};
      if (values.nombre !== undefined) payload.nombre = values.nombre.trim();
      if (values.appat !== undefined) payload.appat = values.appat.trim();
      if (values.apmat !== undefined) payload.apmat = values.apmat.trim();
      if (values.correo !== undefined) payload.correo = values.correo.trim();
      if (values.tipo_user !== undefined) payload.tipo_user = values.tipo_user;
      if (values.contrasena && values.contrasena.trim().length > 0) payload.contrasena = values.contrasena.trim();

      try {
        const token = getToken();
        if (!token) throw new Error('Falta token. Inicia sesión como admin.');
        const res = await fetch(`${API_BASE}/api/usuarios/${encodeURIComponent(user.id_usuario)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(payload)
        });
        const data = await res.json().catch(()=>({}));
        if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
        show('success','Usuario actualizado.');
        await fetchUsers();
        showDetail(user.id_usuario);
      } catch (err) {
        show('error', err.message || 'Error al actualizar usuario');
      }
    });
  }

  async function confirmDeleteUser(user){
    if (!confirm(`¿Eliminar al usuario "${user.name}"? Esta acción no se puede deshacer.`)) return;
    try {
      const token = getToken();
      if (!token) throw new Error('Falta token. Inicia sesión como admin.');
      const res = await fetch(`${API_BASE}/api/usuarios/${encodeURIComponent(user.id_usuario)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
      show('success','Usuario eliminado.');
      state.users = state.users.filter(u => String(u.id_usuario) !== String(user.id_usuario));
      renderList(searchInput?.value || '');
      userDetailEl.innerHTML = '<div class="user-detail-empty"><div class="placeholder-icon">👤</div><div class="placeholder-text">Selecciona un usuario para ver los detalles</div></div>';
    } catch (err) {
      show('error', err.message || 'Error al eliminar usuario');
    }
  }

  searchInput && searchInput.addEventListener('input', (e)=> renderList(e.target.value));
  addUserBtn && addUserBtn.addEventListener('click', openNewUserModal);

  fetchUsers();

  // El botón de editar ahora abre el modal; no bloqueamos
});
