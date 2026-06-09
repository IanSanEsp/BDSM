import { db } from "../config/db.js";

const DIAS = new Set(["Lunes", "Martes", "Miercoles", "Jueves", "Viernes"]);

const DIAS_POR_NUMERO = [
  null,
  "Lunes",
  "Martes",
  "Miercoles",
  "Jueves",
  "Viernes",
  null
];

const _columnCache = new Map();
const _tableCache = new Map();

async function tableHasColumn(tableName, columnName) {
  const key = `${tableName}.${columnName}`;
  if (_columnCache.has(key)) return _columnCache.get(key);
  const [rows] = await db.query(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  const has = !!(rows && rows[0] && Number(rows[0].cnt) > 0);
  _columnCache.set(key, has);
  return has;
}

async function tableExists(tableName) {
  if (_tableCache.has(tableName)) return _tableCache.get(tableName);
  const [rows] = await db.query(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?`,
    [tableName]
  );
  const has = !!(rows && rows[0] && Number(rows[0].cnt) > 0);
  _tableCache.set(tableName, has);
  return has;
}

function diaDesdeFecha(fechaYYYYMMDD) {
  // Interpretar fecha como calendario local para evitar corrimientos (jodete railway y sus servers gringos)
  const parts = String(fechaYYYYMMDD).split("-").map(Number);
  if (parts.length !== 3) return null;
  const [y, m, d] = parts;
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  const dia = DIAS_POR_NUMERO[dt.getDay()];
  return dia && DIAS.has(dia) ? dia : null;
}

async function getOrCreateHorarioIdByGrupo(id_grupo, nombre_horario) {
  const [rows] = await db.query(
    "SELECT id_horario_fijo FROM horarios WHERE id_grupo = ? LIMIT 1",
    [id_grupo]
  );
  if (rows && rows[0]) return rows[0].id_horario_fijo;

  const nombre =
    nombre_horario && String(nombre_horario).trim().length > 0
      ? String(nombre_horario).trim()
      : `Horario Grupo ${id_grupo}`;

  const [maxRow] = await db.query("SELECT COALESCE(MAX(id_horario_fijo), 0) + 1 AS next_id FROM horarios");
  const nextId = maxRow[0].next_id;

  const hasGrupoHorario = await tableHasColumn("horarios", "grupo_horario");
  const [ins] = hasGrupoHorario
    ? await db.query(
        "INSERT INTO horarios (id_horario_fijo, id_grupo, grupo_horario, nombre_horario) VALUES (?, ?, ?, ?)",
        [nextId, id_grupo, id_grupo, nombre]
      )
    : await db.query(
        "INSERT INTO horarios (id_horario_fijo, id_grupo, nombre_horario) VALUES (?, ?, ?)",
        [nextId, id_grupo, nombre]
      );
  return nextId;
}

function validarHoraHHMM(h) {
  return /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(h));
}

function toTimeWithSeconds(h) {
  return h.length === 5 ? `${h}:00` : h;
}

// Registrar horario chido en horario fijo
export const crearHorario = async (req, res) => {
  try {
    const {
      id_grupo,
      id_profesor,
      id_auxiliar,
      id_profesor_aux,
      id_salon,
      dia,
      hora_inicio,
      hora_fin,
      id_materia,
      bloque_horario,
      nombre_horario
    } = req.body || {};

    const auxRaw = id_auxiliar ?? id_profesor_aux ?? null;
    const auxId = auxRaw === '' || auxRaw === undefined ? null : auxRaw;

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

    const [[gRows], [pRows], [sRows], [mRows], [auxRows]] = await Promise.all([
      db.query("SELECT id_grupo FROM Grupos WHERE id_grupo = ? LIMIT 1", [id_grupo]),
      db.query("SELECT id_profesor FROM Profesores WHERE id_profesor = ? LIMIT 1", [id_profesor]),
      db.query("SELECT id_salon FROM Salones WHERE id_salon = ? LIMIT 1", [id_salon]),
      db.query("SELECT id_materia FROM Materias WHERE id_materia = ? LIMIT 1", [id_materia]),
      auxId ? db.query("SELECT id_profesor FROM Profesores WHERE id_profesor = ? LIMIT 1", [auxId]) : Promise.resolve([[]])
    ]);
    if (!gRows || gRows.length === 0) return res.status(400).json({ error: "Grupo no encontrado" });
    if (!pRows || pRows.length === 0) return res.status(400).json({ error: "Profesor no encontrado" });
    if (!sRows || sRows.length === 0) return res.status(400).json({ error: "Salón no encontrado" });
    if (!mRows || mRows.length === 0) return res.status(400).json({ error: "Materia no encontrada" });
    if (auxId && (!auxRows || auxRows.length === 0)) return res.status(400).json({ error: "Profesor auxiliar no encontrado" });

    await db.beginTransaction();
    try {
      //obtener o crear el id compartido del catalogo ese
      const idHorarioFijo = await getOrCreateHorarioIdByGrupo(Number(id_grupo), nombre_horario);

      // Validar las colisiones dentro del horario del grupo
    const [colGrupo] = await db.query(
      `SELECT COUNT(*) AS cnt FROM Horario_Fijo
       WHERE id_horario_fijo = ? AND dia = ? AND NOT (hora_fin <= ? OR hora_inicio >= ?)`,
      [idHorarioFijo, dia, hiSQL, hfSQL]
    );
    if (colGrupo[0].cnt > 0) {
      await db.rollback();
      return res.status(409).json({ error: "Colisión: el grupo ya tiene horario en ese bloque" });
    }

    const [colProf] = await db.query(
      `SELECT COUNT(*) AS cnt FROM Horario_Fijo
       WHERE id_profesor = ? AND dia = ? AND NOT (hora_fin <= ? OR hora_inicio >= ?)`,
      [id_profesor, dia, hiSQL, hfSQL]
    );
    if (colProf[0].cnt > 0) {
      await db.rollback();
      return res.status(409).json({ error: "Colisión: el profesor ya tiene horario en ese bloque" });
    }

    if (auxId) {
      const [colAux] = await db.query(
        `SELECT COUNT(*) AS cnt FROM Horario_Fijo
         WHERE id_auxiliar = ? AND dia = ? AND NOT (hora_fin <= ? OR hora_inicio >= ?)`,
        [auxId, dia, hiSQL, hfSQL]
      );
      if (colAux[0].cnt > 0) {
        await db.rollback();
        return res.status(409).json({ error: "Colisión: el profesor auxiliar ya tiene horario en ese bloque" });
      }
    }

    const [colSalon] = await db.query(
      `SELECT COUNT(*) AS cnt FROM Horario_Fijo
       WHERE id_salon = ? AND dia = ? AND NOT (hora_fin <= ? OR hora_inicio >= ?)`,
      [id_salon, dia, hiSQL, hfSQL]
    );
    if (colSalon[0].cnt > 0) {
      await db.rollback();
      return res.status(409).json({ error: "Colisión: el salón ya tiene horario en ese bloque" });
    }

      const [insHF] = await db.query(
        `INSERT INTO Horario_Fijo (
           id_horario_fijo,
           id_materia,
           id_profesor,
           id_auxiliar,
           id_salon,
           dia,
           hora_inicio,
           hora_fin,
           bloque_horario
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [idHorarioFijo, id_materia, id_profesor, auxId ? Number(auxId) : null, id_salon, dia, hiSQL, hfSQL, bloqueNum]
      );

      await db.commit();
      return res.status(201).json({
        message: "Horario fijo creado",
        id_horario_fijo: idHorarioFijo,
        id_horario_fijo_detalle: insHF.insertId
      });
    } catch (txErr) {
      await db.rollback();
      throw txErr;
    }
  } catch (err) {
    console.error("Error al crear horario fijo:", err);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

// catalogo todos los profesores
export const listarProfesoresCatalogo = async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT p.id_profesor,
              u.nombre
       FROM Profesores p
       LEFT JOIN Usuarios u ON u.id_usuarios = p.id_profesor
       ORDER BY (u.nombre IS NULL) ASC, u.nombre ASC, p.id_profesor ASC`
    );

    const profesores = (rows || []).map((r) => ({
      id_profesor: r.id_profesor,
      nombre: r.nombre || null
    }));

    return res.json({ profesores });
  } catch (err) {
    console.error('Error al listar profesores:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// catalogo todas las materias
export const listarMateriasCatalogo = async (_req, res) => {
  try {
    const hasMaterias = await tableExists('Materias');
    const hasMateriaLegacy = await tableExists('materia');

    if (!hasMaterias && !hasMateriaLegacy) {
      return res.json({ materias: [] });
    }

    const [rows] = hasMaterias
      ? await db.query(
          `SELECT m.id_materia,
                  m.nombre_materia,
                  m.area_estudio
           FROM Materias m
           ORDER BY (m.nombre_materia IS NULL) ASC, m.nombre_materia ASC, m.id_materia ASC`
        )
      : await db.query(
          `SELECT m.id_materia,
                  m.sig_nombre AS nombre_materia
           FROM materia m
           ORDER BY (m.sig_nombre IS NULL) ASC, m.sig_nombre ASC, m.id_materia ASC`
        );

    const materias = (rows || []).map((r) => ({
      id_materia: r.id_materia,
      nombre_materia: r.nombre_materia || null,
      area_estudio: r.area_estudio || null
    }));

    return res.json({ materias });
  } catch (err) {
    console.error('Error al listar materias:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Consultas
export const listarHorarios = async (req, res) => {
  try {
        const { id_grupo, id_profesor, materia, id_salon } = req.query || {};
        let sql = `SELECT hf.id_horario_fijo_detalle,
           hf.id_horario_fijo,
           h.id_grupo,
           hf.id_materia,
           hf.id_profesor,
           hf.id_auxiliar,
           hf.id_salon,
           hf.dia,
           hf.hora_inicio,
           hf.hora_fin,
           hf.bloque_horario,
           g.nombre_grupo, g.semestre, g.turno AS turno_grupo,
           u.nombre AS nombre_profesor,
           uaux.nombre AS nombre_auxiliar,
           s.nombre_salon,
           m.nombre_materia AS materia, m.area_estudio
         FROM Horario_Fijo hf
         JOIN horarios h ON hf.id_horario_fijo = h.id_horario_fijo
         LEFT JOIN Grupos g ON h.id_grupo = g.id_grupo
         LEFT JOIN Materias m ON hf.id_materia = m.id_materia
         LEFT JOIN Salones s ON hf.id_salon = s.id_salon
         LEFT JOIN Profesores pr ON hf.id_profesor = pr.id_profesor
         LEFT JOIN Usuarios u ON pr.id_profesor = u.id_usuarios
         LEFT JOIN Profesores praux ON hf.id_auxiliar = praux.id_profesor
         LEFT JOIN Usuarios uaux ON praux.id_profesor = uaux.id_usuarios
         WHERE 1=1`;
    const params = [];

    if (id_grupo) { sql += " AND h.id_grupo = ?"; params.push(Number(id_grupo)); }
    if (id_profesor) { sql += " AND hf.id_profesor = ?"; params.push(Number(id_profesor)); }
    if (materia) { sql += " AND m.nombre_materia LIKE ?"; params.push(`%${materia}%`); }
    if (id_salon) { sql += " AND hf.id_salon = ?"; params.push(Number(id_salon)); }

    sql += " ORDER BY FIELD(hf.dia,'Lunes','Martes','Miercoles','Jueves','Viernes'), hf.hora_inicio";
    const [rows] = await db.query(sql, params);
    res.json({ horarios: rows });
  } catch (err) {
    console.error("Error al listar horarios fijos:", err);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

//sus
export const actualizarHorario = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Falta id" });

    const { id_grupo, id_profesor, id_profesor_aux, id_salon, dia, hora_inicio, hora_fin, id_materia, bloque_horario } = req.body || {};

    const fields = [];
    const values = [];

    if (id_profesor !== undefined) { fields.push("id_profesor = ?"); values.push(Number(id_profesor)); }
    if (id_profesor_aux !== undefined) { 
      const auxVal = id_profesor_aux === null || id_profesor_aux === '' ? null : Number(id_profesor_aux);
      fields.push("id_auxiliar = ?"); 
      values.push(auxVal); 
    }
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
    if (id_materia !== undefined) { fields.push("id_materia = ?"); values.push(Number(id_materia)); }
    if (bloque_horario !== undefined) { fields.push("bloque_horario = ?"); values.push(Number(bloque_horario)); }


    let idDetalle = id;
    const [foundDetalle] = await db.query(
      "SELECT id_horario_fijo_detalle FROM Horario_Fijo WHERE id_horario_fijo_detalle = ? LIMIT 1",
      [id]
    );
    if (!foundDetalle || foundDetalle.length === 0) {
      const diaTarget = dia !== undefined ? String(dia) : null;
      const bloqueTarget = bloque_horario !== undefined ? Number(bloque_horario) : null;
      if (!diaTarget || !bloqueTarget) {
        return res.status(400).json({
          error: "Cuando :id es id_horario_fijo (catálogo), debes enviar dia y bloque_horario para identificar el registro"
        });
      }
      const [row] = await db.query(
        "SELECT id_horario_fijo_detalle FROM Horario_Fijo WHERE id_horario_fijo = ? AND dia = ? AND bloque_horario = ? LIMIT 1",
        [id, diaTarget, bloqueTarget]
      );
      if (!row || row.length === 0) {
        return res.status(404).json({ error: "Horario no encontrado" });
      }
      idDetalle = row[0].id_horario_fijo_detalle;
    }


    if (id_grupo !== undefined && Number(id_grupo) > 0) {
      const [currRow] = await db.query(
        "SELECT id_horario_fijo FROM Horario_Fijo WHERE id_horario_fijo_detalle = ? LIMIT 1",
        [idDetalle]
      );
      if (currRow && currRow[0]) {
        const nuevoIdHorarioFijo = await getOrCreateHorarioIdByGrupo(Number(id_grupo));
        if (nuevoIdHorarioFijo !== currRow[0].id_horario_fijo) {
          fields.push("id_horario_fijo = ?");
          values.push(nuevoIdHorarioFijo);
        }
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: "No hay cambios a aplicar" });
    }

    values.push(idDetalle);
    const [result] = await db.query(
      `UPDATE Horario_Fijo SET ${fields.join(", ")} WHERE id_horario_fijo_detalle = ?`,
      values
    );
    if (!result || result.affectedRows === 0) {
      return res.status(404).json({ error: "Horario no encontrado" });
    }

    // Si cambio el profesor aplicar el mismo cambio a todos los horarios
    // del mismo grupo y la misma materia
    if (id_profesor !== undefined) {
      const materiaTarget = id_materia !== undefined ? Number(id_materia) : null;
      const [hfRow] = await db.query(
        "SELECT id_horario_fijo FROM Horario_Fijo WHERE id_horario_fijo_detalle = ? LIMIT 1",
        [idDetalle]
      );
      if (materiaTarget && hfRow && hfRow[0]) {
        await db.query(
          `UPDATE Horario_Fijo
           SET id_profesor = ?
           WHERE id_horario_fijo = ?
             AND id_materia = ?
             AND id_horario_fijo_detalle != ?`,
          [Number(id_profesor), hfRow[0].id_horario_fijo, materiaTarget, idDetalle]
        );
      }
    }

    const [rows] = await db.query("SELECT * FROM Horario_Fijo WHERE id_horario_fijo_detalle = ? LIMIT 1", [idDetalle]);
    return res.json({ message: "Horario actualizado", horario: rows && rows[0] ? rows[0] : null });
  } catch (err) {
    console.error("Error al actualizar horario fijo:", err);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};


export const eliminarHorario = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Falta id" });

    let idDetalle = id;
    const [foundDetalle] = await db.query(
      "SELECT id_horario_fijo_detalle FROM Horario_Fijo WHERE id_horario_fijo_detalle = ? LIMIT 1",
      [id]
    );
    if (!foundDetalle || foundDetalle.length === 0) {
      const diaTarget = req.body?.dia ?? req.query?.dia;
      const bloqueTarget = req.body?.bloque_horario ?? req.query?.bloque_horario;
      if (!diaTarget || !bloqueTarget) {
        return res.status(400).json({
          error: "Cuando :id es id_horario_fijo (catálogo), debes enviar dia y bloque_horario para identificar el registro"
        });
      }
      const [row] = await db.query(
        "SELECT id_horario_fijo_detalle FROM Horario_Fijo WHERE id_horario_fijo = ? AND dia = ? AND bloque_horario = ? LIMIT 1",
        [id, String(diaTarget), Number(bloqueTarget)]
      );
      if (!row || row.length === 0) {
        return res.status(404).json({ error: "Horario no encontrado" });
      }
      idDetalle = row[0].id_horario_fijo_detalle;
    }

    const [result] = await db.query("DELETE FROM Horario_Fijo WHERE id_horario_fijo_detalle = ?", [idDetalle]);
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
    const { dia, hora_inicio, hora_fin, fecha } = req.query || {};
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

    const fechaStr = String(fecha || '').trim();
    const usarDinamico = !!fechaStr;

    const [rows] = await db.query(
      `SELECT hf.id_horario_fijo_detalle,
              hf.id_horario_fijo,
              h.id_grupo,
              hf.dia,
              ${usarDinamico ? 'COALESCE(hd.hora_inicio, hf.hora_inicio) AS hora_inicio,' : 'hf.hora_inicio,'}
              ${usarDinamico ? 'COALESCE(hd.hora_fin, hf.hora_fin) AS hora_fin,' : 'hf.hora_fin,'}
              hf.bloque_horario,
              g.nombre_grupo, u.nombre AS nombre_profesor,
              ${usarDinamico ? 'COALESCE(s2.nombre_salon, s.nombre_salon) AS nombre_salon' : 's.nombre_salon'}
       FROM Horario_Fijo hf
       JOIN horarios h ON hf.id_horario_fijo = h.id_horario_fijo
       JOIN Grupos g ON h.id_grupo = g.id_grupo
       JOIN Profesores p ON hf.id_profesor = p.id_profesor
       JOIN Usuarios u ON p.id_profesor = u.id_usuarios
       JOIN Salones s ON hf.id_salon = s.id_salon
       ${usarDinamico ? 'LEFT JOIN Horario_Dinamico hd ON hd.id_horario_fijo_detalle = hf.id_horario_fijo_detalle AND hd.fecha = ?' : ''}
       ${usarDinamico ? 'LEFT JOIN Salones s2 ON hd.id_salon_temporal = s2.id_salon' : ''}
       WHERE hf.dia = ?
         AND NOT (${usarDinamico ? 'COALESCE(hd.hora_fin, hf.hora_fin)' : 'hf.hora_fin'} <= ? OR ${usarDinamico ? 'COALESCE(hd.hora_inicio, hf.hora_inicio)' : 'hf.hora_inicio'} >= ?)
       ORDER BY ${usarDinamico ? 'COALESCE(hd.hora_inicio, hf.hora_inicio)' : 'hf.hora_inicio'}`,
      usarDinamico ? [fechaStr, dia, hi, hf] : [dia, hi, hf]
    );

    return res.json({ horarios: rows });
  } catch (err) {
    console.error("Error en buscarPorBloque:", err);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

// Reasignar salon en horario dinámico
export const reasignarSalon = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { fecha, id_salon_temporal, hora_inicio, hora_fin, motivo } = req.body || {};
    if (!id || !fecha || !id_salon_temporal) {
      return res.status(400).json({ error: "Faltan id_horario_fijo, fecha o id_salon_temporal" });
    }

    const diaFecha = diaDesdeFecha(fecha);
    if (!diaFecha) {
      return res.status(400).json({ error: "fecha inválida o cae en fin de semana" });
    }

    let hf = null;
    const [hfByDetalle] = await db.query(
      "SELECT * FROM Horario_Fijo WHERE id_horario_fijo_detalle = ? LIMIT 1",
      [id]
    );
    if (hfByDetalle && hfByDetalle[0]) {
      hf = hfByDetalle[0];
    } else {
      // tratar como catálogo ubicar la clase del día por bloque o por hora
      const bloqueTarget = req.body?.bloque_horario !== undefined ? Number(req.body.bloque_horario) : null;
      const hiTarget = hora_inicio ? toTimeWithSeconds(hora_inicio) : null;
      const hfTarget = hora_fin ? toTimeWithSeconds(hora_fin) : null;

      let sql = "SELECT * FROM Horario_Fijo WHERE id_horario_fijo = ? AND dia = ?";
      const params = [id, diaFecha];
      if (bloqueTarget) {
        sql += " AND bloque_horario = ?";
        params.push(bloqueTarget);
      } else if (hiTarget && hfTarget) {
        sql += " AND NOT (hora_fin <= ? OR hora_inicio >= ?)";
        params.push(hiTarget, hfTarget);
      }
      sql += " ORDER BY hora_inicio";

      const [rows] = await db.query(sql, params);
      if (!rows || rows.length === 0) {
        return res.status(404).json({ error: "Horario fijo no encontrado para esa fecha" });
      }
      if (rows.length > 1 && !bloqueTarget && !(hiTarget && hfTarget)) {
        return res.status(400).json({ error: "Ambiguo: manda bloque_horario o hora_inicio/hora_fin para identificar la clase" });
      }
      hf = rows[0];
    }

    const hi = hora_inicio ? toTimeWithSeconds(hora_inicio) : hf.hora_inicio;
    const hfTime = hora_fin ? toTimeWithSeconds(hora_fin) : hf.hora_fin;
    if (!validarHoraHHMM(hi.slice(0,5)) || !validarHoraHHMM(hfTime.slice(0,5))) {
      return res.status(400).json({ error: "Formato de hora inválido" });
    }

    const diaDin = hf.dia || diaFecha;

    // Antes de crear un nuevo registro diamico eliminar cualquier registro previo
    await db.query(
      "DELETE FROM Horario_Dinamico WHERE id_horario_fijo_detalle = ? AND fecha = ?",
      [hf.id_horario_fijo_detalle, fecha]
    );

    // Validar que salon temporal exista
    const [sRows] = await db.query("SELECT id_salon FROM Salones WHERE id_salon = ? LIMIT 1", [id_salon_temporal]);
    if (!sRows || sRows.length === 0) return res.status(400).json({ error: "Salón temporal no encontrado" });

    // Verificar colisión real (considerando dinámicos como override del fijo) en el salón temporal
    const [col] = await db.query(
      `SELECT COUNT(*) AS cnt
       FROM Horario_Fijo hf2
       LEFT JOIN Horario_Dinamico hd2
         ON hd2.id_horario_fijo_detalle = hf2.id_horario_fijo_detalle
        AND hd2.fecha = ?
       WHERE hf2.dia = ?
         AND COALESCE(hd2.id_salon_temporal, hf2.id_salon) = ?
         AND NOT (COALESCE(hd2.hora_fin, hf2.hora_fin) <= ? OR COALESCE(hd2.hora_inicio, hf2.hora_inicio) >= ?)
         AND hf2.id_horario_fijo_detalle <> ?`,
      [fecha, diaDin, Number(id_salon_temporal), hi, hfTime, hf.id_horario_fijo_detalle]
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
      `INSERT INTO Horario_Dinamico (
         id_horario_fijo,
         id_horario_fijo_detalle,
         fecha,
         dia,
         id_salon_temporal,
         hora_inicio,
         hora_fin,
         motivo_cambio,
         bloque_horario,
         persona_autoriza
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        hf.id_horario_fijo,
        hf.id_horario_fijo_detalle,
        fecha,
        diaDin,
        id_salon_temporal,
        hi,
        hfTime,
        motivoFinal,
        bloque,
        autorizadoPor
      ]
    );

    // También registrar como incidencia
    const [gRows] = await db.query(
      "SELECT id_grupo FROM horarios WHERE id_horario_fijo = ? LIMIT 1",
      [hf.id_horario_fijo]
    );
    const idGrupo = gRows && gRows[0] ? gRows[0].id_grupo : null;
    await db.query(
      `INSERT INTO Incidencias (fecha, hora, id_profesor, id_grupo, accion_tomada)
       VALUES (?, ?, ?, ?, ?)`,
      [fecha, hi.slice(0,5), hf.id_profesor, idGrupo, "reasignacion_salon"]
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

    const diaFecha = diaDesdeFecha(fecha);
    if (!diaFecha) {
      return res.status(400).json({ error: "fecha inválida o cae en fin de semana" });
    }

    let hf = null;
    const [hfByDetalle] = await db.query(
      "SELECT * FROM Horario_Fijo WHERE id_horario_fijo_detalle = ? LIMIT 1",
      [id]
    );
    if (hfByDetalle && hfByDetalle[0]) {
      hf = hfByDetalle[0];
    } else {
      const bloqueTarget = req.body?.bloque_horario !== undefined ? Number(req.body.bloque_horario) : null;
      let sql = "SELECT * FROM Horario_Fijo WHERE id_horario_fijo = ? AND dia = ?";
      const params = [id, diaFecha];
      if (bloqueTarget) {
        sql += " AND bloque_horario = ?";
        params.push(bloqueTarget);
      }
      sql += " ORDER BY hora_inicio";
      const [rows] = await db.query(sql, params);
      if (!rows || rows.length === 0) return res.status(404).json({ error: "Horario fijo no encontrado para esa fecha" });
      if (rows.length > 1 && !bloqueTarget) {
        return res.status(400).json({ error: "Ambiguo: manda bloque_horario para identificar la clase" });
      }
      hf = rows[0];
    }

    const salonDestino = id_salon_temporal ? Number(id_salon_temporal) : Number(hf.id_salon);

    const diaDin = hf.dia || diaFecha;

    // DB tiene uq_hd_detalle_fecha: solo puede existir un registro por clase+fecha
    await db.query(
      `DELETE FROM Horario_Dinamico
       WHERE id_horario_fijo_detalle = ? AND fecha = ?`,
      [hf.id_horario_fijo_detalle, fecha]
    );

    const [sRows] = await db.query("SELECT id_salon FROM Salones WHERE id_salon = ? LIMIT 1", [salonDestino]);
    if (!sRows || sRows.length === 0) return res.status(400).json({ error: "Salón destino no encontrado" });

    const [col] = await db.query(
      `SELECT COUNT(*) AS cnt
       FROM Horario_Fijo hf2
       LEFT JOIN Horario_Dinamico hd2
         ON hd2.id_horario_fijo_detalle = hf2.id_horario_fijo_detalle
        AND hd2.fecha = ?
       WHERE hf2.dia = ?
         AND COALESCE(hd2.id_salon_temporal, hf2.id_salon) = ?
         AND NOT (COALESCE(hd2.hora_fin, hf2.hora_fin) <= ? OR COALESCE(hd2.hora_inicio, hf2.hora_inicio) >= ?)
         AND hf2.id_horario_fijo_detalle <> ?`,
      [fecha, diaDin, salonDestino, hi, hfTime, hf.id_horario_fijo_detalle]
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
      `INSERT INTO Horario_Dinamico (
         id_horario_fijo,
         id_horario_fijo_detalle,
         fecha,
         dia,
         id_salon_temporal,
         hora_inicio,
         hora_fin,
         motivo_cambio,
         bloque_horario,
         persona_autoriza
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        hf.id_horario_fijo,
        hf.id_horario_fijo_detalle,
        fecha,
        diaDin,
        salonDestino,
        hi,
        hfTime,
        motivoFinal,
        bloque,
        autorizadoPor
      ]
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

    const diaFecha = diaDesdeFecha(fecha);
    if (!diaFecha) {
      return res.status(400).json({ error: "fecha inválida o cae en fin de semana" });
    }

    let sql = `SELECT hf.id_horario_fijo_detalle,
              hf.id_horario_fijo,
              h.id_grupo,
              hf.id_profesor,
              hf.id_materia,
               hf.dia, hf.hora_inicio, hf.hora_fin, hf.bloque_horario,
               g.nombre_grupo, g.semestre, u.nombre AS nombre_profesor,
              m.nombre_materia AS materia, m.area_estudio,
              s.id_salon, s.nombre_salon, s.piso,
                      hd.id_horario_dinamico, hd.id_salon_temporal, s2.nombre_salon AS nombre_salon_temporal,
                      hd.hora_inicio AS hora_inicio_temp, hd.hora_fin AS hora_fin_temp, hd.motivo_cambio AS motivo
               FROM Horario_Fijo hf
               JOIN horarios h ON hf.id_horario_fijo = h.id_horario_fijo
               JOIN Grupos g ON h.id_grupo = g.id_grupo
               JOIN Profesores p ON hf.id_profesor = p.id_profesor
               JOIN Usuarios u ON p.id_profesor = u.id_usuarios
               JOIN Materias m ON hf.id_materia = m.id_materia
               JOIN Salones s ON hf.id_salon = s.id_salon
               LEFT JOIN Horario_Dinamico hd
                 ON hd.id_horario_fijo_detalle = hf.id_horario_fijo_detalle
                AND hd.fecha = ?
               LEFT JOIN Salones s2 ON hd.id_salon_temporal = s2.id_salon
               WHERE hf.dia = ?`;
    const params = [fecha, diaFecha];

    if (piso !== undefined) {
      sql += " AND s.piso = ?";
      params.push(Number(piso));
    }

    sql += " ORDER BY s.piso, s.nombre_salon, FIELD(hf.dia,'Lunes','Martes','Miercoles','Jueves','Viernes'), hf.hora_inicio";
    const [rows] = await db.query(sql, params);
    return res.json({ tabla: rows });
  } catch (err) {
    console.error("Error en tablaDinamicaPorFecha:", err);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};
