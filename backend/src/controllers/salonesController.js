import { db } from "../config/db.js";

// Pisos
const PISOS_VALIDOS = new Set(["0", "1", "2", "3"]);
const ESTADOS_VALIDOS = new Set(["Disponible", "Ocupado", "Provisional", "En Mantenimiento"]);

async function resolveTipoSalonId(value) {
  if (value === undefined || value === null || value === "") return null;
  const asNumber = Number(value);
  if (!Number.isNaN(asNumber) && Number.isInteger(asNumber)) {
    const [rows] = await db.query(
      "SELECT id_tipo_salon AS id FROM tipo_salon WHERE id_tipo_salon = ? LIMIT 1",
      [asNumber]
    );
    return rows && rows[0] ? rows[0].id : null;
  }
  const [rows] = await db.query(
    "SELECT id_tipo_salon AS id FROM tipo_salon WHERE nombre_tipo_salon = ? LIMIT 1",
    [String(value)]
  );
  return rows && rows[0] ? rows[0].id : null;
}

export const crearSalon = async (req, res) => {
  try {
    const {
      nombre_salon,
      piso,
      tipo_salon,
      tipo,
      estado
    } = req.body || {};

    if (!nombre_salon || piso === undefined || (!tipo_salon && !tipo)) {
      return res.status(400).json({ error: "Faltan campos requeridos: nombre_salon, piso, tipo_salon" });
    }

    if (!PISOS_VALIDOS.has(String(piso))) {
      return res.status(400).json({ error: "piso inválido (válidos: 0,1,2,3)" });
    }
    const estadoFinal = estado ? String(estado) : "Disponible";
    if (!ESTADOS_VALIDOS.has(estadoFinal)) {
      return res.status(400).json({ error: "estado inválido (válidos: 'Disponible','Ocupado','Provisional','En Mantenimiento')" });
    }

    const tipoSalonId = await resolveTipoSalonId(tipo_salon ?? tipo);
    if (!tipoSalonId) {
      return res.status(400).json({ error: "tipo_salon inválido (no existe en catálogo tipo_salon)" });
    }

    const [result] = await db.query(
      `INSERT INTO Salones (nombre_salon, piso, tipo_salon, estado)
       VALUES (?, ?, ?, ?)`,
      [String(nombre_salon), Number(piso), tipoSalonId, estadoFinal]
    );

    const id = result.insertId;
    return res.status(201).json({
      message: "Salón creado",
      salon: { id_salon: id, nombre_salon: String(nombre_salon), piso: Number(piso), tipo_salon: tipoSalonId, estado: estadoFinal }
    });
  } catch (error) {
    console.error("Error al crear salón:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

// Buscar salones con estado calculado
export const listarSalones = async (req, res) => {
  try {
    const { nombre_salon, piso, tipo_salon, tipo, estado } = req.query || {};

    // Recalcular estados según Horario_Fijo / Horario_Dinamico
    await recalcularEstadosSalones();

    let sql = `SELECT s.*, ts.nombre_tipo_salon
               FROM Salones s
               JOIN tipo_salon ts ON s.tipo_salon = ts.id_tipo_salon
               WHERE 1=1`;
    const params = [];

    if (nombre_salon) { sql += " AND s.nombre_salon LIKE ?"; params.push(`%${nombre_salon}%`); }
    if (piso !== undefined) { sql += " AND s.piso = ?"; params.push(Number(piso)); }
    if (estado) { sql += " AND s.estado = ?"; params.push(estado); }
    if (tipo_salon !== undefined || tipo !== undefined) {
      const tipoSalonId = await resolveTipoSalonId(tipo_salon ?? tipo);
      if (!tipoSalonId) {
        return res.status(400).json({ error: "tipo_salon inválido (no existe en catálogo tipo_salon)" });
      }
      sql += " AND s.tipo_salon = ?";
      params.push(tipoSalonId);
    }

    sql += " ORDER BY s.piso, s.nombre_salon";
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (error) {
    console.error("Error al listar salones:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

// Recalcular el estado de los salones a partir de Horario_Fijo y Horario_Dinamico
async function recalcularEstadosSalones() {
  try {
    const diasEnum = [null, "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", null];

    const nowUTC = new Date();
    const mexicoOffset = -6 * 60;
    const nowMexico = new Date(nowUTC.getTime() + (mexicoOffset + nowUTC.getTimezoneOffset()) * 60000);

    const diaHoy = diasEnum[nowMexico.getDay()];
    const pad = (n) => String(n).padStart(2, "0");
    const horaActual = `${pad(nowMexico.getHours())}:${pad(nowMexico.getMinutes())}:00`;
    const fechaHoy = nowMexico.toISOString().slice(0, 10);

    // Fin de semana a la vrg todos disponibles (excepto mantenimiento)
    if (!diaHoy) {
      await db.query(`UPDATE Salones SET estado = 'Disponible' WHERE estado != 'En Mantenimiento'`);
      return;
    }

    // Primero se asume Disponible donde no haya mantenimiento
    await db.query(`UPDATE Salones SET estado = 'Disponible' WHERE estado != 'En Mantenimiento'`);

    // Ocupado por el horario fijo
    const [ocupadosFijos] = await db.query(
      `SELECT DISTINCT id_salon FROM Horario_Fijo
       WHERE dia = ? AND hora_inicio <= ? AND hora_fin > ?`,
      [diaHoy, horaActual, horaActual]
    );
    if (ocupadosFijos.length) {
      const ids = ocupadosFijos.map(r => r.id_salon);
      await db.query(
        `UPDATE Salones SET estado = 'Ocupado' WHERE id_salon IN (${ids.map(() => "?").join(",")}) AND estado != 'En Mantenimiento'`,
        ids
      );
    }

    // Provisional por horario dinámico asi q reasignaciones en la fecha actual (carajo fungus)
    const [provisionales] = await db.query(
      `SELECT DISTINCT id_salon_temporal AS id_salon
       FROM Horario_Dinamico
       WHERE fecha = ? AND hora_inicio <= ? AND hora_fin > ?`,
      [fechaHoy, horaActual, horaActual]
    );
    if (provisionales.length) {
      const idsP = provisionales.map(r => r.id_salon);
      await db.query(
        `UPDATE Salones SET estado = 'Provisional' WHERE id_salon IN (${idsP.map(() => "?").join(",")}) AND estado != 'En Mantenimiento'`,
        idsP
      );
    }
  } catch (err) {
    console.error("Error recalculando estados de salones:", err);
  }
}

export const actualizarSalon = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { nombre_salon, piso, tipo_salon, tipo, estado } = req.body || {};
    if (!id) return res.status(400).json({ error: "Falta id del salón" });

    if (piso !== undefined && !PISOS_VALIDOS.has(String(piso))) {
      return res.status(400).json({ error: "piso inválido (válidos: 0,1,2,3)" });
    }
    if (estado !== undefined && !ESTADOS_VALIDOS.has(String(estado))) {
      return res.status(400).json({ error: "estado inválido (válidos: 'Disponible','Ocupado','Provisional','En Mantenimiento')" });
    }

    const fields = [];
    const values = [];
    if (nombre_salon !== undefined) { fields.push("nombre_salon = ?"); values.push(String(nombre_salon)); }
    if (piso !== undefined) { fields.push("piso = ?"); values.push(Number(piso)); }
    if (tipo_salon !== undefined || tipo !== undefined) {
      const tipoSalonId = await resolveTipoSalonId(tipo_salon ?? tipo);
      if (!tipoSalonId) {
        return res.status(400).json({ error: "tipo_salon inválido (no existe en catálogo tipo_salon)" });
      }
      fields.push("tipo_salon = ?");
      values.push(tipoSalonId);
    }
    if (estado !== undefined) { fields.push("estado = ?"); values.push(String(estado)); }

    if (fields.length === 0) {
      return res.status(400).json({ error: "No hay cambios a aplicar" });
    }

    values.push(id);
    const [result] = await db.query(`UPDATE Salones SET ${fields.join(", ")} WHERE id_salon = ?`, values);
    if (result && result.affectedRows === 0) {
      return res.status(404).json({ error: "Salón no encontrado" });
    }

    const [rows] = await db.query(
      `SELECT s.*, ts.nombre_tipo_salon
       FROM Salones s
       JOIN tipo_salon ts ON s.tipo_salon = ts.id_tipo_salon
       WHERE s.id_salon = ? LIMIT 1`,
      [id]
    );
    return res.json({ message: "Salón actualizado", salon: rows && rows[0] ? rows[0] : null });
  } catch (error) {
    console.error("Error al actualizar salón:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

export const eliminarSalon = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Falta id del salón" });
    const [result] = await db.query(`DELETE FROM Salones WHERE id_salon = ?`, [id]);
    if (result && result.affectedRows === 0) {
      return res.status(404).json({ error: "Salón no encontrado" });
    }
    return res.json({ message: "Salón eliminado" });
  } catch (error) {
    console.error("Error al eliminar salón:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};
