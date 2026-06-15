import { db } from "../config/db.js";

const _columnCache = new Map();

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

function normalizarTipo(raw) {
  const t = String(raw || '').trim().toLowerCase();
  if (!t) return 'ausencia_profesor';
  if (t === 'ausencia_profesor' || t === 'junta' || t === 'excursion' || t === 'otro') return t;
  return 'otro';
}

function prefijarAccion(tipo, accion) {
  const a = String(accion || '').trim();
  if (!a) return `[${tipo}]`;

  if (/^\[[a-z_]+\]/i.test(a)) return a;
  return `[${tipo}] ${a}`;
}

// Registrar falta de profesor
export const registrarAusencia = async (req, res) => {
  try {
    const { fecha, hora, id_profesor, id_grupo, accion_tomada, tipo } = req.body || {};
    if (!fecha || !hora || !id_grupo || !accion_tomada) {
      return res.status(400).json({ error: "Faltan campos requeridos: fecha, hora, id_grupo, accion_tomada" });
    }

    if (!id_profesor) {
      return res.status(400).json({ error: "Falta id_profesor (requerido por el esquema actual)" });
    }

    const [pRows] = await db.query("SELECT id_profesor FROM Profesores WHERE id_profesor = ? LIMIT 1", [id_profesor]);
    if (!pRows || pRows.length === 0) return res.status(400).json({ error: "Profesor no encontrado" });
    const [gRows] = await db.query("SELECT id_grupo FROM Grupos WHERE id_grupo = ? LIMIT 1", [id_grupo]);
    if (!gRows || gRows.length === 0) return res.status(400).json({ error: "Grupo no encontrado" });

    // Verificar duplicado
    const [dupRows] = await db.query(
      `SELECT COUNT(*) AS cnt FROM Incidencias WHERE fecha = ? AND hora = ? AND id_profesor = ? AND id_grupo = ?`,
      [fecha, hora, id_profesor, id_grupo]
    );
    if (dupRows && dupRows[0] && Number(dupRows[0].cnt) > 0) {
      return res.status(409).json({ error: "Ya existe una incidencia registrada para esta clase en esa hora." });
    }

    await db.query(
      `INSERT INTO Incidencias (fecha, hora, id_profesor, id_grupo, accion_tomada)
       VALUES (?, ?, ?, ?, ?)`,
      [fecha, hora, id_profesor, id_grupo, accion_tomada]
    );

    return res.status(201).json({ message: "Ausencia registrada" });
  } catch (err) {
    console.error("Error al registrar ausencia:", err);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

// Ver incidencias
export const listarAusencias = async (req, res) => {
  try {
    const { fecha, id_profesor, id_grupo, tipo } = req.query || {};
        let sql = `SELECT a.*,
            u.nombre AS nombre_profesor,
            g.nombre_grupo
          FROM Incidencias a
          JOIN Profesores p ON a.id_profesor = p.id_profesor
          JOIN Usuarios u ON p.id_profesor = u.id_usuarios
          JOIN Grupos g ON a.id_grupo = g.id_grupo
          WHERE 1=1`;
    const params = [];

    if (fecha) { sql += " AND a.fecha = ?"; params.push(fecha); }
    if (id_profesor) { sql += " AND a.id_profesor = ?"; params.push(Number(id_profesor)); }
    if (id_grupo) { sql += " AND a.id_grupo = ?"; params.push(Number(id_grupo)); }
        if (tipo) { sql += " AND a.accion_tomada = ?"; params.push(String(tipo)); }

    sql += " ORDER BY a.fecha DESC, a.hora DESC";
    const [rows] = await db.query(sql, params);
    return res.json({ ausencias: rows });
  } catch (err) {
    console.error("Error al listar ausencias:", err);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};
