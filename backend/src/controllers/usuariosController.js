import { db } from "../config/db.js";

export const obtenerUsuarios = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM usuario");
    res.json(rows);
  } catch (error) {
    console.error("Error al obtener usuarios:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};
