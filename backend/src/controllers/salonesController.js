import { db } from "../config/db.js";
import crypto from "crypto";

const PISO = new Set(["1","2","3"]);
const TIPO = new Set(["Aula","Laboratorio"]);
const ESTADO = new Set(["Disponible","En Mantenimiento","Ocupado"]);

export const crearSalon = async (req, res) => {
  try {
    const { id_salon, nombre, piso, tipo, estado } = req.body || {};

    // Validaciones
    if (!nombre || !piso || !tipo) {
      return res.status(400).json({ error: "Faltan campos requeridos: nombre, piso, tipo" });
    }
    if (!PISO.has(String(piso))) {
      return res.status(400).json({ error: "piso inválido (válidos: '1','2','3')" });
    }
    if (!TIPO.has(String(tipo))) {
      return res.status(400).json({ error: "tipo inválido (válidos: 'Aula','Laboratorio')" });
    }
    // Valor por defecto para estado
    const estadoFinal = estado ? String(estado) : "Disponible";
    if (!ESTADO.has(String(estadoFinal))) {
      return res.status(400).json({ error: "estado inválido (válidos: 'Disponible','En Mantenimiento','Ocupado')" });
    }

    // id uuid
    const id = id_salon && String(id_salon).trim().length > 0 ? String(id_salon).trim() : crypto.randomUUID();

    // Insertar
    await db.query(
      `INSERT INTO salon (id_salon, nombre, piso, tipo, estado) VALUES (?, ?, ?, ?, ?)`,
      [id, nombre, String(piso), String(tipo), estadoFinal]
    );

    return res.status(201).json({
      message: "Salón creado",
      salon: { id_salon: id, nombre, piso: String(piso), tipo: String(tipo), estado: String(estadoFinal) }
    });
  } catch (error) {
    console.error("Error al crear salón:", error);
    // Duplicado PK
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

export const listarSalones = async (_req, res) => {
  try {
    const [rows] = await db.query(`SELECT * FROM salon ORDER BY nombre`);
    res.json(rows);
  } catch (error) {
    console.error("Error al listar salones:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

export const actualizarSalon = async (req, res) => {
  try {
    const id = req.params.id;
    const { nombre, piso, tipo, estado } = req.body || {};
    if (!id) return res.status(400).json({ error: "Falta id del salón" });

    // Validar si se envían
    if (piso !== undefined && !PISO.has(String(piso))) {
      return res.status(400).json({ error: "piso inválido (válidos: '1','2','3')" });
    }
    if (tipo !== undefined && !TIPO.has(String(tipo))) {
      return res.status(400).json({ error: "tipo inválido (válidos: 'Aula','Laboratorio')" });
    }
    if (estado !== undefined && !ESTADO.has(String(estado))) {
      return res.status(400).json({ error: "estado inválido (válidos: 'Disponible','En Mantenimiento','Ocupado')" });
    }

    // Construir set dinámico
    const fields = [];
    const values = [];
    if (nombre !== undefined) { fields.push("nombre = ?"); values.push(nombre); }
    if (piso !== undefined) { fields.push("piso = ?"); values.push(String(piso)); }
    if (tipo !== undefined) { fields.push("tipo = ?"); values.push(String(tipo)); }
    if (estado !== undefined) { fields.push("estado = ?"); values.push(String(estado)); }

    if (fields.length === 0) {
      return res.status(400).json({ error: "No hay cambios a aplicar" });
    }

    values.push(id);
    const [result] = await db.query(`UPDATE salon SET ${fields.join(", ")} WHERE id_salon = ?`, values);
    if (result && result.affectedRows === 0) {
      return res.status(404).json({ error: "Salón no encontrado" });
    }

    // Si se quitó mantenimiento y se puso "Disponible", recalcular según horario actual
    if (estado !== undefined && String(estado) === "Disponible") {
      try {
        const dias = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
        const now = new Date();
        const diaHoy = dias[now.getDay()];
        const pad = (n) => String(n).padStart(2, '0');
        const horaActual = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

        const [activeRows] = await db.query(
          `SELECT COUNT(*) AS cnt FROM horario_grupo WHERE id_salon = ? AND dia = ? AND hora_inicio <= ? AND hora_fin > ?`,
          [id, diaHoy, horaActual, horaActual]
        );
        const ocupado = activeRows && activeRows[0] && activeRows[0].cnt > 0;
        if (ocupado) {
          await db.query('UPDATE salon SET estado = ? WHERE id_salon = ?', ["Ocupado", id]);
        }
      } catch (err2) {
        console.error("Error recalculando estado al quitar mantenimiento:", err2);
      }
    }

    const [rows] = await db.query(`SELECT * FROM salon WHERE id_salon = ? LIMIT 1`, [id]);
    return res.json({ message: "Salón actualizado", salon: rows && rows[0] ? rows[0] : null });
  } catch (error) {
    console.error("Error al actualizar salón:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

export const eliminarSalon = async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: "Falta id del salón" });
    const [result] = await db.query(`DELETE FROM salon WHERE id_salon = ?`, [id]);
    if (result && result.affectedRows === 0) {
      return res.status(404).json({ error: "Salón no encontrado" });
    }
    return res.json({ message: "Salón eliminado" });
  } catch (error) {
    console.error("Error al eliminar salón:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};
