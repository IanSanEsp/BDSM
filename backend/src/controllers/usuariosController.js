import { db } from "../config/db.js";
import crypto from "crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const ADMIN_VALUES = ["admin", "administrador", "adminisrtrador"];

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
    // tipo por defecto
    let tipo = "usuario";
    // permitir especificar tipo_user si viene autenticado como admin y la solicitud lo pide
    const bodyTipo = (req.body || {}).tipo_user;
    const reqUser = req.user; // estará definido si la ruta está protegida
    const isAdminReq = reqUser && ADMIN_VALUES.includes(String(reqUser.tipo || '').toLowerCase());
    if (isAdminReq && bodyTipo && ADMIN_VALUES.includes(String(bodyTipo).toLowerCase())) {
      tipo = "adminisrtrador";
    }

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

// Registrar usuario con rol admin (ruta protegida)
export const registrarAdmin = async (req, res) => {
  try {
    console.log('registrarAdmin - req.body:', JSON.stringify(req.body));
    console.log('registrarAdmin - req.user:', JSON.stringify(req.user));
    req.body = req.body || {};
    req.body.tipo_user = "administrador";
    return registrarUsuario(req, res);
  } catch (error) {
    console.error("Error al registrar admin:", error);
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

    //bcrypt si es hash bcrypt ($2a/$2b/$2y)
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

export const actualizarUsuario = async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: "Falta id_usuario" });

    const {
      nombre,
      appat,
      apmat,
      correo: correoBody,
      correo_electronico: correoAlt,
      tipo_user,
      contrasena
    } = req.body || {};

    const fields = [];
    const values = [];

    if (nombre !== undefined) { fields.push("nombre = ?"); values.push(nombre); }
    if (appat !== undefined) { fields.push("appat = ?"); values.push(appat); }
    if (apmat !== undefined) { fields.push("apmat = ?"); values.push(apmat); }

    const correo = correoBody !== undefined ? correoBody : (correoAlt !== undefined ? correoAlt : undefined);
    if (correo !== undefined) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(correo)) {
        return res.status(400).json({ error: "Correo electrónico inválido" });
      }
      fields.push("correo_electronico = ?"); values.push(correo);
    }

    if (tipo_user !== undefined) {
      fields.push("tipo_user = ?"); values.push(tipo_user);
    }

    if (contrasena !== undefined && String(contrasena).length > 0) {
      if (String(contrasena).length < 8) {
        return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres" });
      }
      const disableHash = String(process.env.DISABLE_PASSWORD_HASH || "").toLowerCase() === "true";
      let passwordToStore = contrasena;
      if (!disableHash) {
        const cost = parseInt(process.env.BCRYPT_COST || "10", 10);
        const pepper = process.env.PASSWORD_PEPPER || "";
        const base = `${contrasena}${pepper}`;
        passwordToStore = await bcrypt.hash(base, isNaN(cost) ? 10 : cost);
      }
      fields.push("contrasena = ?"); values.push(passwordToStore);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: "No hay cambios a aplicar" });
    }

    values.push(id);
    const [result] = await db.query(`UPDATE usuario SET ${fields.join(", ")} WHERE id_usuario = ?`, values);
    if (!result || result.affectedRows === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const [rows] = await db.query(
      "SELECT id_usuario, nombre, apmat, appat, correo_electronico, tipo_user FROM usuario WHERE id_usuario = ? LIMIT 1",
      [id]
    );
    return res.json({ message: "Usuario actualizado", usuario: rows && rows[0] ? rows[0] : null });
  } catch (error) {
    console.error("Error al actualizar usuario:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

export const eliminarUsuario = async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: "Falta id_usuario" });

    const [result] = await db.query("DELETE FROM usuario WHERE id_usuario = ?", [id]);
    if (!result || result.affectedRows === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }
    return res.json({ message: "Usuario eliminado" });
  } catch (error) {
    console.error("Error al eliminar usuario:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};
