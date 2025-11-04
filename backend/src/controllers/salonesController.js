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
