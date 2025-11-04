import { db } from "../config/db.js";
import crypto from "crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

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

    // Verificar duplicado por correo
    const [existentes] = await db.query(
      "SELECT id_usuario FROM usuario WHERE correo_electronico = ? LIMIT 1",
      [correo]
    );
    if (existentes.length > 0) {
      return res.status(409).json({ error: "El correo ya está registrado" });
    }

    // Generar ID y tipo usuario
    const id = crypto.randomUUID();
    const tipo = "usuario";

    // desactivar hashing .env
    const disableHash = String(process.env.DISABLE_PASSWORD_HASH || "").toLowerCase() === "true";

    let passwordToStore = contrasena;
    if (!disableHash) {
      // Bcrypt costo configurable y pepper
      const cost = parseInt(process.env.BCRYPT_COST || "10", 10);
      const pepper = process.env.PASSWORD_PEPPER || "";
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

export const loginUsuario = async (req, res) => {
  try {
    const { correo, contrasena } = req.body || {};
    if (!correo || !contrasena) {
      return res.status(400).json({ error: "Faltan correo y/o contraseña" });
    }

    const [rows] = await db.query(
      `SELECT id_usuario, nombre, apmat, appat, correo_electronico, contrasena, tipo_user
       FROM usuario WHERE correo_electronico = ? LIMIT 1`,
      [correo]
    );

    if (!rows || rows.length === 0) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const user = rows[0];
    const stored = (user.contrasena || "").trim();

    const disableHash = String(process.env.DISABLE_PASSWORD_HASH || "").toLowerCase() === "true";

    let isValid = false;

    //bcrypt si parece un hash bcrypt ($2a/$2b/$2y)
    if (stored.startsWith("$2")) {
      const pepper = process.env.PASSWORD_PEPPER || "";
      isValid = await bcrypt.compare(`${contrasena}${pepper}`, stored);
    }

    //Texto plano (hashing deshabilitado)
    if (!isValid && disableHash) {
      if (stored === contrasena) {
        isValid = true;
      }
    }

    if (!isValid) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    // JWT hay secreto configurado
    const secret = process.env.JWT_SECRET;
    let token;
    if (secret) {
      token = jwt.sign(
        { sub: user.id_usuario, correo: user.correo_electronico, tipo: user.tipo_user },
        secret,
        { expiresIn: process.env.JWT_EXPIRES_IN || "2h" }
      );
    }

    return res.json({
      message: "Login exitoso",
      token,
      usuario: {
        id_usuario: user.id_usuario,
        nombre: user.nombre,
        apmat: user.apmat,
        appat: user.appat,
        correo_electronico: user.correo_electronico,
        tipo_user: user.tipo_user
      }
    });
  } catch (error) {
    console.error("Error en login:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};
