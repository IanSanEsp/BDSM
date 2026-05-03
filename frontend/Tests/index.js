(function(){
  const $ = (id) => document.getElementById(id);
  const logGlobal = $("globalLog");

  function appendLog(prefix, data){
    const time = new Date().toISOString();
    logGlobal.textContent += `[#${time}] ${prefix}: ` + JSON.stringify(data, null, 2) + "\n\n";
    logGlobal.scrollTop = logGlobal.scrollHeight;
  }

  async function api(path, { method = "GET", body, auth = true } = {}){
    const base = $("baseUrl").value.replace(/\/$/, "");
    const url = base + path;
    const headers = { "Content-Type": "application/json" };
    const token = $("token").value.trim();
    if (auth && token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    let data;
    try { data = await res.json(); } catch { data = await res.text(); }
    return { status: res.status, ok: res.ok, data };
  }

  // Config
  $("clearLog").addEventListener("click", () => {
    ["outUsuarios","outGrupos","outSalones","outHorarios","outAusencias","globalLog"].forEach(id => {
      const el = $(id); if (el) el.textContent = "";
    });
  });

  // Usuarios
  $("btnCrearUsuario").addEventListener("click", async () => {
    const idUsuarios = Number($("u_id").value);
    if (!Number.isInteger(idUsuarios) || idUsuarios <= 0) {
      appendLog("WARN", "id_usuarios (boleta) inválido");
      return;
    }
    const body = {
      id_usuarios: idUsuarios,
      nombre: $("u_nombre").value,
      correo: $("u_correo").value,
      contrasena: $("u_contrasena").value,
      turno: $("u_turno").value,
    };
    const tipo = $("u_tipo").value;
    if (tipo) body.tipo_usuario = tipo;
    // auth:true para que, si estás logueado como Prefecto General,
    // el backend reciba req.user y respete tipo_usuario
    const res = await api("/usuarios/registrar", { method:"POST", body, auth:true });
    $("outUsuarios").textContent = JSON.stringify(res, null, 2);
    appendLog("POST /usuarios/registrar", res);
  });

  $("btnLogin").addEventListener("click", async () => {
    const body = { correo: $("l_correo").value, contrasena: $("l_pass").value };
    const res = await api("/usuarios/login", { method:"POST", body, auth:false });
    $("outUsuarios").textContent = JSON.stringify(res, null, 2);
    appendLog("POST /usuarios/login", res);
    if (res.ok && res.data && res.data.token) {
      $("token").value = res.data.token;
    }
  });

  $("btnListarUsuarios").addEventListener("click", async () => {
    const res = await api("/usuarios", { method:"GET", auth:true });
    $("outUsuarios").textContent = JSON.stringify(res, null, 2);
    appendLog("GET /usuarios", res);
  });

  // Asignar grupo a usuario (estudiante)
  $("btnAsignarGrupoUsuario").addEventListener("click", async () => {
    const idUsuario = Number($("ug_id_usuario").value);
    const idGrupo = $("ug_id_grupo").value;
    if (!idUsuario || idGrupo === "") {
      appendLog("WARN", "Llena id_usuario e id_grupo para asignar grupo");
      return;
    }
    const body = { id_grupo: Number(idGrupo) };
    const res = await api(`/usuarios/${idUsuario}`, { method:"PUT", body, auth:true });
    $("outUsuarios").textContent = JSON.stringify(res, null, 2);
    appendLog("PUT /usuarios/:id (id_grupo)", res);
  });

  // Grupos
  $("btnCrearGrupo").addEventListener("click", async () => {
    const idGrupo = Number($("g_id").value);
    if (!Number.isInteger(idGrupo) || idGrupo <= 0) {
      appendLog("WARN", "id_grupo inválido");
      return;
    }
    const body = {
      id_grupo: idGrupo,
      nombre_grupo: $("g_nombre").value,
      area_estudio: $("g_area").value,
      semestre: $("g_semestre").value,
      turno: $("g_turno").value,
    };
    const res = await api("/grupos", { method:"POST", body, auth:true });
    $("outGrupos").textContent = JSON.stringify(res, null, 2);
    appendLog("POST /grupos", res);
  });

  $("btnListarGrupos").addEventListener("click", async () => {
    const params = new URLSearchParams();
    const s = $("qg_semestre").value;
    const t = $("qg_turno").value;
    const n = $("qg_nombre").value;
    if (s !== "") params.set("semestre", s);
    if (t) params.set("turno", t);
    if (n) params.set("nombre", n);
    const res = await api("/grupos" + (params.toString() ? `?${params}` : ""), { method:"GET", auth:false });
    $("outGrupos").textContent = JSON.stringify(res, null, 2);
    appendLog("GET /grupos", res);
  });

  // Salones
  $("btnCrearSalon").addEventListener("click", async () => {
    const pisoVal = Number($("s_piso").value);
    if (!Number.isInteger(pisoVal) || pisoVal < 0 || pisoVal > 3) {
      appendLog("WARN", "piso inválido (0-3)");
      return;
    }
    const body = {
      nombre_salon: $("s_nombre").value,
      piso: pisoVal,
      tipo_salon: $("s_tipo_salon").value,
    };
    const estado = $("s_estado").value;
    if (estado) body.estado = estado;
    const res = await api("/salones", { method:"POST", body, auth:true });
    $("outSalones").textContent = JSON.stringify(res, null, 2);
    appendLog("POST /salones", res);
  });

  $("btnListarSalones").addEventListener("click", async () => {
    const params = new URLSearchParams();
    const piso = $("s_filtro_piso").value;
    if (piso !== "") params.set("piso", piso);
    const tipo = $("s_filtro_tipo").value;
    if (tipo) params.set("tipo_salon", tipo);
    const res = await api("/salones" + (params.toString() ? `?${params}` : ""), { method:"GET", auth:false });
    $("outSalones").textContent = JSON.stringify(res, null, 2);
    appendLog("GET /salones", res);
  });

  // Horarios
  $("btnCrearHorario").addEventListener("click", async () => {
    const body = {
      id_grupo: Number($("h_id_grupo").value),
      id_profesor: Number($("h_id_profesor").value),
      id_salon: Number($("h_id_salon").value),
      dia: $("h_dia").value,
      hora_inicio: $("h_hi").value,
      hora_fin: $("h_hf").value,
      id_materia: Number($("h_id_materia").value),
      bloque_horario: Number($("h_bloque").value),
    };
    const res = await api("/horarios", { method:"POST", body, auth:true });
    $("outHorarios").textContent = JSON.stringify(res, null, 2);
    appendLog("POST /horarios", res);
  });

  $("btnListarHorarios").addEventListener("click", async () => {
    const params = new URLSearchParams();
    const ig = $("qh_id_grupo").value;
    const ip = $("qh_id_profesor").value;
    const isalon = $("qh_id_salon").value;
    const mat = $("qh_materia").value;
    if (ig !== "") params.set("id_grupo", ig);
    if (ip !== "") params.set("id_profesor", ip);
    if (isalon !== "") params.set("id_salon", isalon);
    if (mat !== "") params.set("materia", mat);
    const res = await api("/horarios" + (params.toString() ? `?${params}` : ""), { method:"GET", auth:false });
    $("outHorarios").textContent = JSON.stringify(res, null, 2);
    appendLog("GET /horarios", res);
  });

  $("btnTablaDinamica").addEventListener("click", async () => {
    const params = new URLSearchParams();
    const fecha = $("td_fecha").value;
    const piso = $("td_piso").value;
    if (fecha) params.set("fecha", fecha);
    const hasFecha = !!fecha;
    if (piso !== "") params.set("piso", piso);
    const res = await api("/horarios/tabla-dinamica" + (params.toString() ? `?${params}` : ""), { method:"GET", auth:true });
    if (!hasFecha && res.status === 400) {
      appendLog("WARN", "Recuerda llenar la fecha para tabla dinámica");
    }
    $("outHorarios").textContent = JSON.stringify(res, null, 2);
    appendLog("GET /horarios/tabla-dinamica", res);
  });

  $("btnBuscarBloque").addEventListener("click", async () => {
    const params = new URLSearchParams();
    const dia = $("bb_dia").value;
    const hi = $("bb_hi").value;
    const hf = $("bb_hf").value;
    if (dia) params.set("dia", dia);
    if (hi) params.set("hora_inicio", hi);
    if (hf) params.set("hora_fin", hf);
    const res = await api("/horarios/por-bloque" + (params.toString() ? `?${params}` : ""), { method:"GET", auth:false });
    $("outHorarios").textContent = JSON.stringify(res, null, 2);
    appendLog("GET /horarios/por-bloque", res);
  });

  $("btnReasignarSalon").addEventListener("click", async () => {
    const idDetalle = Number($("rd_id_detalle").value);
    const idCatalogo = Number($("rd_id_horario").value);
    const id = idDetalle || idCatalogo;
    if (!Number.isInteger(id) || id <= 0) {
      appendLog("WARN", "id inválido: usa id_horario_fijo_detalle o id_horario_fijo");
      return;
    }
    const body = {
      fecha: $("rd_fecha").value,
      id_salon_temporal: Number($("rd_id_salon_temporal").value),
    };
    const hi = $("rd_hi").value;
    const hf = $("rd_hf").value;
    const motivo = $("rd_motivo").value;
    if (hi) body.hora_inicio = hi;
    if (hf) body.hora_fin = hf;
    if (motivo) body.motivo = motivo;
    const res = await api(`/horarios/${id}/reasignar-salon`, { method:"POST", body, auth:true });
    $("outHorarios").textContent = JSON.stringify(res, null, 2);
    appendLog("POST /horarios/:id/reasignar-salon", res);
  });

  $("btnAdelantarClase").addEventListener("click", async () => {
    const idDetalle = Number($("ac_id_detalle").value);
    const idCatalogo = Number($("ac_id_horario").value);
    const id = idDetalle || idCatalogo;
    if (!Number.isInteger(id) || id <= 0) {
      appendLog("WARN", "id inválido: usa id_horario_fijo_detalle o id_horario_fijo");
      return;
    }
    const body = {
      fecha: $("ac_fecha").value,
      hora_inicio: $("ac_hi").value,
      hora_fin: $("ac_hf").value,
    };
    const idSalonTmp = $("ac_id_salon_temporal").value;
    const motivo = $("ac_motivo").value;
    if (idSalonTmp !== "") body.id_salon_temporal = Number(idSalonTmp);
    if (motivo) body.motivo = motivo;
    const res = await api(`/horarios/${id}/adelantar-clase`, { method:"POST", body, auth:true });
    $("outHorarios").textContent = JSON.stringify(res, null, 2);
    appendLog("POST /horarios/:id/adelantar-clase", res);
  });

  // Ausencias
  $("btnCrearAusencia").addEventListener("click", async () => {
    const body = {
      fecha: $("a_fecha").value,
      hora: $("a_hora").value,
      id_profesor: Number($("a_id_profesor").value),
      id_grupo: Number($("a_id_grupo").value),
      accion_tomada: $("a_accion").value,
    };
    const res = await api("/ausencias", { method:"POST", body, auth:true });
    $("outAusencias").textContent = JSON.stringify(res, null, 2);
    appendLog("POST /ausencias", res);
  });

  $("btnListarAusencias").addEventListener("click", async () => {
    const params = new URLSearchParams();
    const fecha = $("qa_fecha").value;
    const ip = $("qa_id_profesor").value;
    const ig = $("qa_id_grupo").value;
    if (fecha) params.set("fecha", fecha);
    if (ip !== "") params.set("id_profesor", ip);
    if (ig !== "") params.set("id_grupo", ig);
    const res = await api("/ausencias" + (params.toString() ? `?${params}` : ""), { method:"GET", auth:true });
    $("outAusencias").textContent = JSON.stringify(res, null, 2);
    appendLog("GET /ausencias", res);
  });
})();
