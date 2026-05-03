import { db } from "../config/db.js";

// Registrar falta de profesor
export const registrarAusencia = async (req, res) => {
  try {
    const { fecha, hora, id_profesor, id_grupo, accion_tomada } = req.body || {};
    if (!fecha || !hora || !id_profesor || !id_grupo || !accion_tomada) {
      return res.status(400).json({ error: "Faltan campos requeridos: fecha, hora, id_profesor, id_grupo, accion_tomada" });
    }

    const [pRows] = await db.query("SELECT id_profesor FROM Profesores WHERE id_profesor = ? LIMIT 1", [id_profesor]);
    if (!pRows || pRows.length === 0) return res.status(400).json({ error: "Profesor no encontrado" });
    const [gRows] = await db.query("SELECT id_grupo FROM Grupos WHERE id_grupo = ? LIMIT 1", [id_grupo]);
    if (!gRows || gRows.length === 0) return res.status(400).json({ error: "Grupo no encontrado" });

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
    const { fecha, id_profesor, id_grupo } = req.query || {};

    let sql = `SELECT a.*, u.nombre AS nombre_profesor, g.nombre_grupo
           FROM Incidencias a
           JOIN Profesores p ON a.id_profesor = p.id_profesor
           JOIN Usuarios u ON p.id_profesor = u.id_usuarios
           JOIN Grupos g ON a.id_grupo = g.id_grupo
           WHERE 1=1`;
    const params = [];

    if (fecha) { sql += " AND a.fecha = ?"; params.push(fecha); }
    if (id_profesor) { sql += " AND a.id_profesor = ?"; params.push(Number(id_profesor)); }
    if (id_grupo) { sql += " AND a.id_grupo = ?"; params.push(Number(id_grupo)); }

    sql += " ORDER BY a.fecha DESC, a.hora DESC";
    const [rows] = await db.query(sql, params);
    return res.json({ ausencias: rows });
  } catch (err) {
    console.error("Error al listar ausencias:", err);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};
