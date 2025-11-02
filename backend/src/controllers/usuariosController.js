import { db } from "../config/db.js";
import crypto from "crypto";
import bcrypt from "bcrypt";

export const obtenerUsuarios = async (req, res) => {
  try {
    // No exponer contraseñas
    const [rows] = await db.query(
      "SELECT id_usuario, nombre, apmat, appat, correo_electronico, tipo_user FROM usuario"
    );
    res.json(rows);
  } catch (error) {
    console.error("Error al obtener usuarios:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

export const registrarUsuario = async (req, res) => {
  try {
    const {
      nombre,
      appat: appatBody,
      apmat: apmatBody,
      apellido_paterno,
      apellido_materno,
      correo,
      contrasena
    } = req.body || {};

    const appat = appatBody || apellido_paterno;
    const apmat = apmatBody || apellido_materno;

    if (!nombre || !appat || !apmat || !correo || !contrasena) {
      return res.status(400).json({ error: "Faltan campos requeridos: nombre, apellidos, correo y contraseña" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(correo)) {
      return res.status(400).json({ error: "Correo electrónico inválido" });
    }

    if (String(contrasena).length < 8) {
      return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres" });
    }

    // Verificar duplicado por correo (tabla no tiene UNIQUE)
    const [existentes] = await db.query(
      "SELECT id_usuario FROM usuario WHERE correo_electronico = ? LIMIT 1",
      [correo]
    );
    if (existentes.length > 0) {
      return res.status(409).json({ error: "El correo ya está registrado" });
    }

    // Generar ID y tipo fijo 'usuario' (no permitir elevar a admin)
    const id = crypto.randomUUID();
    const tipo = "usuario";

    // Interruptor para desactivar hashing desde .env
    const disableHash = String(process.env.DISABLE_PASSWORD_HASH || "").toLowerCase() === "true";

    let passwordToStore = contrasena;
    if (!disableHash) {
      // Bcrypt con costo configurable y pepper opcional
      const cost = parseInt(process.env.BCRYPT_COST || "10", 10);
      const pepper = process.env.PASSWORD_PEPPER || ""; // opcional, puede ser vacío
      const base = `${contrasena}${pepper}`;
      passwordToStore = await bcrypt.hash(base, isNaN(cost) ? 10 : cost);
    }

    await db.query(
      `INSERT INTO usuario (id_usuario, nombre, apmat, appat, correo_electronico, contrasena, tipo_user)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, nombre, apmat, appat, correo, passwordToStore, tipo]
    );

    return res.status(201).json({
      message: "Usuario registrado correctamente",
      usuario: {
        id_usuario: id,
        nombre,
        apmat,
        appat,
        correo_electronico: correo,
        tipo_user: tipo
      }
    });
  } catch (error) {
    console.error("Error al registrar usuario:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};
