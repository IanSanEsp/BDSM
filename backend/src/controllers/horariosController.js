import { db } from "../config/db.js";

const DIAS = new Set(["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]);

function validarHoraHHMM(h) {
  return /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(h));
}

function toTimeWithSeconds(h) {
  return h.length === 5 ? `${h}:00` : h;
}

// Registrar horario chido en horario fijo
export const crearHorario = async (req, res) => {
  try {
    const { id_grupo, id_profesor, id_salon, dia, hora_inicio, hora_fin, id_materia, bloque_horario } = req.body || {};

    if (!id_grupo || !id_profesor || !id_salon || !dia || !hora_inicio || !hora_fin || !id_materia || bloque_horario === undefined) {
      return res.status(400).json({ error: "Faltan campos requeridos: id_grupo, id_profesor, id_salon, dia, hora_inicio, hora_fin, id_materia, bloque_horario" });
    }

    if (!DIAS.has(String(dia))) {
      return res.status(400).json({ error: "día inválido" });
    }
    if (!validarHoraHHMM(hora_inicio) || !validarHoraHHMM(hora_fin)) {
      return res.status(400).json({ error: "Formato de hora inválido. Use HH:MM" });
    }

    const hiSQL = toTimeWithSeconds(hora_inicio);
    const hfSQL = toTimeWithSeconds(hora_fin);
    const [hiH, hiM] = hora_inicio.split(":").map(Number);
    const [hfH, hfM] = hora_fin.split(":").map(Number);
    if (hiH * 60 + hiM >= hfH * 60 + hfM) {
      return res.status(400).json({ error: "hora_fin debe ser posterior a hora_inicio" });
    }

    // Validar existencia de claves foráneas
    const bloqueNum = Number(bloque_horario);
    if (!Number.isInteger(bloqueNum) || bloqueNum <= 0) {
      return res.status(400).json({ error: "bloque_horario inválido" });
    }

    const [[gRows], [pRows], [sRows], [mRows]] = await Promise.all([
      db.query("SELECT id_grupo FROM Grupos WHERE id_grupo = ? LIMIT 1", [id_grupo]),
      db.query("SELECT id_profesor FROM Profesores WHERE id_profesor = ? LIMIT 1", [id_profesor]),
      db.query("SELECT id_salon FROM Salones WHERE id_salon = ? LIMIT 1", [id_salon]),
      db.query("SELECT id_materia FROM Materias WHERE id_materia = ? LIMIT 1", [id_materia])
    ]);
    if (!gRows || gRows.length === 0) return res.status(400).json({ error: "Grupo no encontrado" });
    if (!pRows || pRows.length === 0) return res.status(400).json({ error: "Profesor no encontrado" });
    if (!sRows || sRows.length === 0) return res.status(400).json({ error: "Salón no encontrado" });
    if (!mRows || mRows.length === 0) return res.status(400).json({ error: "Materia no encontrada" });

    // Validar las colisiones
    const [colGrupo] = await db.query(
      `SELECT COUNT(*) AS cnt FROM Horario_Fijo
       WHERE id_grupo = ? AND dia = ? AND NOT (hora_fin <= ? OR hora_inicio >= ?)`,
      [id_grupo, dia, hiSQL, hfSQL]
    );
    if (colGrupo[0].cnt > 0) {
      return res.status(409).json({ error: "Colisión: el grupo ya tiene horario en ese bloque" });
    }

    const [colProf] = await db.query(
      `SELECT COUNT(*) AS cnt FROM Horario_Fijo
       WHERE id_profesor = ? AND dia = ? AND NOT (hora_fin <= ? OR hora_inicio >= ?)`,
      [id_profesor, dia, hiSQL, hfSQL]
    );
    if (colProf[0].cnt > 0) {
      return res.status(409).json({ error: "Colisión: el profesor ya tiene horario en ese bloque" });
    }

    const [colSalon] = await db.query(
      `SELECT COUNT(*) AS cnt FROM Horario_Fijo
       WHERE id_salon = ? AND dia = ? AND NOT (hora_fin <= ? OR hora_inicio >= ?)`,
      [id_salon, dia, hiSQL, hfSQL]
    );
    if (colSalon[0].cnt > 0) {
      return res.status(409).json({ error: "Colisión: el salón ya tiene horario en ese bloque" });
    }

    await db.query(
      `INSERT INTO Horario_Fijo (id_grupo, id_profesor, id_salon, dia, hora_inicio, hora_fin, bloque_horario, id_materia)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id_grupo, id_profesor, id_salon, dia, hiSQL, hfSQL, bloqueNum, id_materia]
    );

    return res.status(201).json({ message: "Horario fijo creado" });
  } catch (err) {
    console.error("Error al crear horario fijo:", err);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

// Consultas
export const listarHorarios = async (req, res) => {
  try {
        const { id_grupo, id_profesor, materia, id_salon } = req.query || {};
        let sql = `SELECT hf.*, g.nombre_grupo, g.semestre, g.turno AS turno_grupo,
           u.nombre AS nombre_profesor,
           s.numero_salon,
           m.nombre_materia AS materia, m.area_estudio
         FROM Horario_Fijo hf
         JOIN Grupos g ON hf.id_grupo = g.id_grupo
         JOIN Profesores pr ON hf.id_profesor = pr.id_profesor
         JOIN Usuarios u ON pr.id_profesor = u.id_usuarios
         JOIN Salones s ON hf.id_salon = s.id_salon
         JOIN Materias m ON hf.id_materia = m.id_materia
         WHERE 1=1`;
    const params = [];

    if (id_grupo) { sql += " AND hf.id_grupo = ?"; params.push(Number(id_grupo)); }
    if (id_profesor) { sql += " AND hf.id_profesor = ?"; params.push(Number(id_profesor)); }
    if (materia) { sql += " AND m.nombre_materia LIKE ?"; params.push(`%${materia}%`); }
    if (id_salon) { sql += " AND hf.id_salon = ?"; params.push(Number(id_salon)); }

    sql += " ORDER BY FIELD(hf.dia,'Lunes','Martes','Miércoles','Jueves','Viernes'), hf.hora_inicio";
    const [rows] = await db.query(sql, params);
    res.json({ horarios: rows });
  } catch (err) {
    console.error("Error al listar horarios fijos:", err);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};


export const actualizarHorario = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Falta id_horario_fijo" });

    const { id_grupo, id_profesor, id_salon, dia, hora_inicio, hora_fin, materia, id_materia, bloque_horario } = req.body || {};

    const fields = [];
    const values = [];

    if (id_grupo !== undefined) { fields.push("id_grupo = ?"); values.push(Number(id_grupo)); }
    if (id_profesor !== undefined) { fields.push("id_profesor = ?"); values.push(Number(id_profesor)); }
    if (id_salon !== undefined) { fields.push("id_salon = ?"); values.push(Number(id_salon)); }
    if (dia !== undefined) {
      if (!DIAS.has(String(dia))) return res.status(400).json({ error: "día inválido" });
      fields.push("dia = ?"); values.push(String(dia));
    }
    if (hora_inicio !== undefined) {
      if (!validarHoraHHMM(hora_inicio)) return res.status(400).json({ error: "Formato de hora_inicio inválido" });
      fields.push("hora_inicio = ?"); values.push(toTimeWithSeconds(hora_inicio));
    }
    if (hora_fin !== undefined) {
      if (!validarHoraHHMM(hora_fin)) return res.status(400).json({ error: "Formato de hora_fin inválido" });
      fields.push("hora_fin = ?"); values.push(toTimeWithSeconds(hora_fin));
    }
    if (materia !== undefined) { fields.push("materia = ?"); values.push(String(materia)); }
    if (id_materia !== undefined) { fields.push("id_materia = ?"); values.push(Number(id_materia)); }
    if (bloque_horario !== undefined) { fields.push("bloque_horario = ?"); values.push(Number(bloque_horario)); }

    if (fields.length === 0) {
      return res.status(400).json({ error: "No hay cambios a aplicar" });
    }

    values.push(id);
    const [result] = await db.query(`UPDATE Horario_Fijo SET ${fields.join(", ")} WHERE id_horario_fijo = ?`, values);
    if (!result || result.affectedRows === 0) {
      return res.status(404).json({ error: "Horario no encontrado" });
    }

    const [rows] = await db.query("SELECT * FROM Horario_Fijo WHERE id_horario_fijo = ? LIMIT 1", [id]);
    return res.json({ message: "Horario actualizado", horario: rows && rows[0] ? rows[0] : null });
  } catch (err) {
    console.error("Error al actualizar horario fijo:", err);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};


export const eliminarHorario = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Falta id_horario_fijo" });

    const [result] = await db.query("DELETE FROM Horario_Fijo WHERE id_horario_fijo = ?", [id]);
    if (result && result.affectedRows === 0) {
      return res.status(404).json({ error: "Horario no encontrado" });
    }
    return res.json({ message: "Horario eliminado" });
  } catch (err) {
    console.error("Error al eliminar horario:", err);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

// Buscar por bloque de horario
export const buscarPorBloque = async (req, res) => {
  try {
    const { dia, hora_inicio, hora_fin } = req.query || {};
    if (!dia || !hora_inicio || !hora_fin) {
      return res.status(400).json({ error: "Faltan parámetros: dia, hora_inicio, hora_fin" });
    }
    if (!DIAS.has(String(dia))) {
      return res.status(400).json({ error: "día inválido" });
    }
    if (!validarHoraHHMM(hora_inicio) || !validarHoraHHMM(hora_fin)) {
      return res.status(400).json({ error: "Formato de hora inválido. Use HH:MM" });
    }
    const hi = toTimeWithSeconds(hora_inicio);
    const hf = toTimeWithSeconds(hora_fin);

    const [rows] = await db.query(
      `SELECT hf.*, g.nombre_grupo, u.nombre AS nombre_profesor, s.numero_salon
       FROM Horario_Fijo hf
       JOIN Grupos g ON hf.id_grupo = g.id_grupo
       JOIN Profesores p ON hf.id_profesor = p.id_profesor
       JOIN Usuarios u ON p.id_profesor = u.id_usuarios
       JOIN Salones s ON hf.id_salon = s.id_salon
       WHERE hf.dia = ? AND NOT (hf.hora_fin <= ? OR hf.hora_inicio >= ?)
       ORDER BY hf.hora_inicio`,
      [dia, hi, hf]
    );

    return res.json({ horarios: rows });
  } catch (err) {
    console.error("Error en buscarPorBloque:", err);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

// Reasignar salón en horario dinámico
export const reasignarSalon = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { fecha, id_salon_temporal, hora_inicio, hora_fin, motivo } = req.body || {};
    if (!id || !fecha || !id_salon_temporal) {
      return res.status(400).json({ error: "Faltan id_horario_fijo, fecha o id_salon_temporal" });
    }

    const [hfRows] = await db.query("SELECT * FROM Horario_Fijo WHERE id_horario_fijo = ? LIMIT 1", [id]);
    if (!hfRows || hfRows.length === 0) return res.status(404).json({ error: "Horario fijo no encontrado" });
    const hf = hfRows[0];

    const hi = hora_inicio ? toTimeWithSeconds(hora_inicio) : hf.hora_inicio;
    const hfTime = hora_fin ? toTimeWithSeconds(hora_fin) : hf.hora_fin;
    if (!validarHoraHHMM(hi.slice(0,5)) || !validarHoraHHMM(hfTime.slice(0,5))) {
      return res.status(400).json({ error: "Formato de hora inválido" });
    }

    // Antes de crear un nuevo registro dinámico, eliminar cualquier registro previo
    // para este mismo horario fijo y fecha, de modo que solo exista el último cambio.
    await db.query(
      "DELETE FROM Horario_Dinamico WHERE id_horario_fijo = ? AND fecha = ?",
      [id, fecha]
    );

    // Validar que salón temporal exista
    const [sRows] = await db.query("SELECT id_salon FROM Salones WHERE id_salon = ? LIMIT 1", [id_salon_temporal]);
    if (!sRows || sRows.length === 0) return res.status(400).json({ error: "Salón temporal no encontrado" });

    // Verificar colisión en el salón temporal
    const [col] = await db.query(
      `SELECT COUNT(*) AS cnt
       FROM Horario_Dinamico hd
       JOIN Horario_Fijo hf2 ON hd.id_horario_fijo = hf2.id_horario_fijo
       WHERE hd.id_salon_temporal = ? AND hd.fecha = ? AND NOT (hd.hora_fin <= ? OR hd.hora_inicio >= ?)` ,
      [id_salon_temporal, fecha, hi, hfTime]
    );
    if (col[0].cnt > 0) {
      return res.status(409).json({ error: "Colisión: el salón temporal ya tiene horario en ese bloque" });
    }

    const autorizadoPor = req.user && req.user.sub ? req.user.sub : null;
    if (!autorizadoPor) {
      return res.status(401).json({ error: "No autenticado" });
    }

    const motivoFinal = motivo || "Reasignación de salón";
    const bloque = Number(hf.bloque_horario) || null;

    const [ins] = await db.query(
      `INSERT INTO Horario_Dinamico (id_horario_fijo, fecha, id_salon_temporal, hora_inicio, hora_fin, motivo_cambio, bloque_horario, persona_autoriza)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, fecha, id_salon_temporal, hi, hfTime, motivoFinal, bloque, autorizadoPor]
    );

    const [nuevo] = await db.query("SELECT * FROM Horario_Dinamico WHERE id_horario_dinamico = ? LIMIT 1", [ins.insertId]);
    return res.status(201).json({ message: "Reasignación registrada", horario_dinamico: nuevo && nuevo[0] ? nuevo[0] : null });
  } catch (err) {
    console.error("Error en reasignarSalon:", err);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

// Adelantar clase: crear un bloque dinámico en otra fecha/horario
export const adelantarClase = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { fecha, hora_inicio, hora_fin, id_salon_temporal, motivo } = req.body || {};

    if (!id || !fecha || !hora_inicio || !hora_fin) {
      return res.status(400).json({ error: "Faltan id_horario_fijo, fecha, hora_inicio u hora_fin" });
    }

    if (!validarHoraHHMM(hora_inicio) || !validarHoraHHMM(hora_fin)) {
      return res.status(400).json({ error: "Formato de hora inválido. Use HH:MM" });
    }

    const hi = toTimeWithSeconds(hora_inicio);
    const hfTime = toTimeWithSeconds(hora_fin);
    const [hiH, hiM] = hora_inicio.split(":").map(Number);
    const [hfH, hfM] = hora_fin.split(":").map(Number);
    if (hiH * 60 + hiM >= hfH * 60 + hfM) {
      return res.status(400).json({ error: "hora_fin debe ser posterior a hora_inicio" });
    }

    const [hfRows] = await db.query("SELECT * FROM Horario_Fijo WHERE id_horario_fijo = ? LIMIT 1", [id]);
    if (!hfRows || hfRows.length === 0) return res.status(404).json({ error: "Horario fijo no encontrado" });
    const hf = hfRows[0];

    const salonDestino = id_salon_temporal ? Number(id_salon_temporal) : Number(hf.id_salon);

    // Igual que en reasignarSalon: si ya existe un dinámico para este horario fijo y fecha,
    // se elimina para reemplazarlo por el nuevo.
    await db.query(
      "DELETE FROM Horario_Dinamico WHERE id_horario_fijo = ? AND fecha = ?",
      [id, fecha]
    );

    const [sRows] = await db.query("SELECT id_salon FROM Salones WHERE id_salon = ? LIMIT 1", [salonDestino]);
    if (!sRows || sRows.length === 0) return res.status(400).json({ error: "Salón destino no encontrado" });

    const [col] = await db.query(
      `SELECT COUNT(*) AS cnt
       FROM Horario_Dinamico hd
       JOIN Horario_Fijo hf2 ON hd.id_horario_fijo = hf2.id_horario_fijo
       WHERE hd.id_salon_temporal = ? AND hd.fecha = ? AND NOT (hd.hora_fin <= ? OR hd.hora_inicio >= ?)`,
      [salonDestino, fecha, hi, hfTime]
    );
    if (col[0].cnt > 0) {
      return res.status(409).json({ error: "Colisión: el salón ya tiene horario dinámico en ese bloque" });
    }

    const autorizadoPor = req.user && req.user.sub ? req.user.sub : null;
    if (!autorizadoPor) {
      return res.status(401).json({ error: "No autenticado" });
    }

    const motivoFinal = motivo || "Adelanto de clase";
    const bloque = Number(hf.bloque_horario) || null;

    const [ins] = await db.query(
      `INSERT INTO Horario_Dinamico (id_horario_fijo, fecha, id_salon_temporal, hora_inicio, hora_fin, motivo_cambio, bloque_horario, persona_autoriza)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, fecha, salonDestino, hi, hfTime, motivoFinal, bloque, autorizadoPor]
    );

    const [nuevo] = await db.query("SELECT * FROM Horario_Dinamico WHERE id_horario_dinamico = ? LIMIT 1", [ins.insertId]);
    return res.status(201).json({ message: "Adelanto de clase registrado", horario_dinamico: nuevo && nuevo[0] ? nuevo[0] : null });
  } catch (err) {
    console.error("Error en adelantarClase:", err);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

// Mostrarvista del dinamico
export const tablaDinamicaPorFecha = async (req, res) => {
  try {
    const { fecha, piso } = req.query || {};
    if (!fecha) return res.status(400).json({ error: "Falta fecha" });

    let sql = `SELECT hf.id_horario_fijo, hf.dia, hf.hora_inicio, hf.hora_fin, hf.bloque_horario,
                      g.nombre_grupo, u.nombre AS nombre_profesor,
                      m.nombre_materia AS materia, m.area_estudio,
                      s.id_salon, s.numero_salon, s.piso,
                      hd.id_horario_dinamico, hd.id_salon_temporal, s2.numero_salon AS numero_salon_temporal,
                      hd.hora_inicio AS hora_inicio_temp, hd.hora_fin AS hora_fin_temp, hd.motivo_cambio AS motivo
               FROM Horario_Fijo hf
               JOIN Grupos g ON hf.id_grupo = g.id_grupo
               JOIN Profesores p ON hf.id_profesor = p.id_profesor
               JOIN Usuarios u ON p.id_profesor = u.id_usuarios
               JOIN Materias m ON hf.id_materia = m.id_materia
               JOIN Salones s ON hf.id_salon = s.id_salon
               LEFT JOIN Horario_Dinamico hd ON hd.id_horario_fijo = hf.id_horario_fijo AND hd.fecha = ?
               LEFT JOIN Salones s2 ON hd.id_salon_temporal = s2.id_salon
               WHERE 1=1`;
    const params = [fecha];

    if (piso !== undefined) {
      sql += " AND s.piso = ?";
      params.push(Number(piso));
    }

    sql += " ORDER BY s.piso, s.numero_salon, FIELD(hf.dia,'Lunes','Martes','Miércoles','Jueves','Viernes'), hf.hora_inicio";
    const [rows] = await db.query(sql, params);
    return res.json({ tabla: rows });
  } catch (err) {
    console.error("Error en tablaDinamicaPorFecha:", err);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};
