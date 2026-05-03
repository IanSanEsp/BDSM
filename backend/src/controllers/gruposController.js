import { db } from "../config/db.js";

// Crear grupo
export const crearGrupo = async (req, res) => {
  try {
    const { id_grupo, nombre_grupo, semestre, area_estudio, turno } = req.body || {};

    const idGrupoNum = Number(id_grupo);
    if (!Number.isInteger(idGrupoNum) || idGrupoNum <= 0) {
      return res.status(400).json({ error: "Falta id_grupo válido" });
    }

    if (!nombre_grupo || !area_estudio || semestre === undefined || !turno) {
      return res.status(400).json({ error: "Faltan campos requeridos: id_grupo, nombre_grupo, semestre, area_estudio, turno" });
    }

    const semestreNum = Number(semestre);
    if (!Number.isInteger(semestreNum) || semestreNum <= 0) {
      return res.status(400).json({ error: "semestre inválido" });
    }

    // Validar que no exista
    const [exist] = await db.query("SELECT id_grupo FROM Grupos WHERE id_grupo = ? LIMIT 1", [idGrupoNum]);
    if (exist && exist.length > 0) {
      return res.status(409).json({ error: "El id_grupo ya existe" });
    }

    await db.query(
      `INSERT INTO Grupos (id_grupo, nombre_grupo, semestre, area_estudio, turno)
       VALUES (?, ?, ?, ?, ?)`,
      [idGrupoNum, String(nombre_grupo), semestreNum, String(area_estudio), String(turno)]
    );

    const [rows] = await db.query("SELECT * FROM Grupos WHERE id_grupo = ? LIMIT 1", [idGrupoNum]);
    return res.status(201).json({ message: "Grupo creado", grupo: rows && rows[0] ? rows[0] : null });
  } catch (err) {
    console.error("Error al crear grupo:", err);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

// Listar grupos con filtros básicos
export const listarGrupos = async (req, res) => {
  try {
    const { semestre, turno, nombre } = req.query || {};
    let sql = "SELECT * FROM Grupos WHERE 1=1";
    const params = [];

    if (semestre !== undefined && semestre !== "") {
      sql += " AND semestre = ?";
      params.push(Number(semestre));
    }
    if (turno) {
      sql += " AND turno = ?";
      params.push(String(turno));
    }
    if (nombre) {
      sql += " AND nombre_grupo LIKE ?";
      params.push(`%${nombre}%`);
    }

    sql += " ORDER BY semestre, nombre_grupo";
    const [rows] = await db.query(sql, params);
    return res.json({ grupos: rows });
  } catch (err) {
    console.error("Error al listar grupos:", err);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

// Actualizar grupo
export const actualizarGrupo = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Falta id_grupo" });

    const { nombre_grupo, semestre, area_estudio, turno } = req.body || {};
    const fields = [];
    const values = [];

    if (nombre_grupo !== undefined) { fields.push("nombre_grupo = ?"); values.push(String(nombre_grupo)); }
    if (semestre !== undefined) { fields.push("semestre = ?"); values.push(Number(semestre)); }
    if (area_estudio !== undefined) { fields.push("area_estudio = ?"); values.push(String(area_estudio)); }
    if (turno !== undefined) { fields.push("turno = ?"); values.push(String(turno)); }

    if (fields.length === 0) {
      return res.status(400).json({ error: "No hay cambios a aplicar" });
    }

    values.push(id);
    const [result] = await db.query(`UPDATE Grupos SET ${fields.join(", ")} WHERE id_grupo = ?`, values);
    if (!result || result.affectedRows === 0) {
      return res.status(404).json({ error: "Grupo no encontrado" });
    }

    const [rows] = await db.query("SELECT * FROM Grupos WHERE id_grupo = ? LIMIT 1", [id]);
    return res.json({ message: "Grupo actualizado", grupo: rows && rows[0] ? rows[0] : null });
  } catch (err) {
    console.error("Error al actualizar grupo:", err);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

// Eliminar grupo
export const eliminarGrupo = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Falta id_grupo" });

    const [result] = await db.query("DELETE FROM Grupos WHERE id_grupo = ?", [id]);
    if (!result || result.affectedRows === 0) {
      return res.status(404).json({ error: "Grupo no encontrado" });
    }

    return res.json({ message: "Grupo eliminado" });
  } catch (err) {
    console.error("Error al eliminar grupo:", err);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};
