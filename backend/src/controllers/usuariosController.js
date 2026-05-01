import { db } from "../config/db.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

// Joder mi adminisrtrador reaction
const ADMIN_VALUES = ["admin", "administrador", "adminisrtrador"];

export const obtenerUsuarios = async (_req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id_usuarios AS id_usuario, nombre, tipo_usuario, correo, turno, activo, id_grupo FROM Usuarios"
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
      correo,
      turno,
      id_grupo,
      tipo_usuario: tipoUsuarioBody,
      // compatibilidad con front viejo porq fungus hdp
      tipo_user,
      contrasena
    } = req.body || {};

    if (!nombre || !correo || !turno || !contrasena) {
      return res.status(400).json({ error: "Faltan campos requeridos: nombre, correo, turno y contraseña" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(correo)) {
      return res.status(400).json({ error: "Correo electrónico inválido" });
    }

    // Verificar duplicados por correo
    const [existCorreo] = await db.query(
      "SELECT id_usuarios FROM Usuarios WHERE correo = ? LIMIT 1",
      [correo]
    );
    if (existCorreo.length > 0) {
      return res.status(409).json({ error: "El correo ya está registrado" });
    }

    // Determinar tipo_usuario
    let tipoUsuario = tipoUsuarioBody || tipo_user || "Estudiante";

    // Si petición autenticada como admin se permite crear Prefecto General
    const reqUser = req.user;
    const isAdminReq = reqUser && ADMIN_VALUES.includes(String(reqUser.tipo || "").toLowerCase());
    if (!isAdminReq && tipoUsuario === "Prefecto General") {
      // usuarios normales no pueden ponerse como Prefecto General
      tipoUsuario = "Estudiante";
    }

    // Validar grupo si viene
    let idGrupoFinal = null;
    if (id_grupo !== undefined && id_grupo !== null) {
      const idGrupoNum = Number(id_grupo);
      if (!Number.isNaN(idGrupoNum)) {
        const [gRows] = await db.query("SELECT id_grupo FROM Grupos WHERE id_grupo = ? LIMIT 1", [idGrupoNum]);
        if (!gRows || gRows.length === 0) {
          return res.status(400).json({ error: "Grupo no encontrado" });
        }
        idGrupoFinal = idGrupoNum;
      }
    }

    const saltRounds = 10;
    const hash = await bcrypt.hash(String(contrasena), saltRounds);

    const [result] = await db.query(
      `INSERT INTO Usuarios (nombre, tipo_usuario, correo, contrasena, turno, activo, id_grupo)
       VALUES (?, ?, ?, ?, ?, TRUE, ?)`,
      [nombre, tipoUsuario, correo, hash, turno, idGrupoFinal]
    );

    const newId = result.insertId;

    // Crear registros relacionados según rol
    if (tipoUsuario === "Profesor") {
      await db.query(
        `INSERT INTO Profesores (id_profesor, tipo_profesor, materia)
         VALUES (?, ?, ?)` ,
        [newId, "Profesor", "Sin asignar"]
      );
    } else if (tipoUsuario === "Prefecto General" || tipoUsuario === "Prefecto de Piso") {
      await db.query(
        `INSERT INTO Prefectos (id_prefecto, tipo_prefecto, piso_asignado)
         VALUES (?, ?, NULL)` ,
        [newId, tipoUsuario]
      );
    }

    return res.status(201).json({
      message: "Usuario registrado correctamente",
      usuario: {
        id_usuario: newId,
        nombre,
        tipo_usuario: tipoUsuario,
        correo,
        turno,
        activo: true,
        id_grupo: idGrupoFinal
      }
    });
  } catch (error) {
    console.error("Error al registrar usuario:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

// Registrar usuario Prefecto General
export const registrarAdmin = async (req, res) => {
  try {
    req.body = req.body || {};
    req.body.tipo_usuario = "Prefecto General";
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
      `SELECT id_usuarios AS id_usuario, nombre, tipo_usuario, correo, contrasena, turno, activo, id_grupo
       FROM Usuarios WHERE correo = ? LIMIT 1`,
      [correo]
    );

    if (!rows || rows.length === 0) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const user = rows[0];
    if (!user.activo) {
      return res.status(403).json({ error: "Usuario inactivo" });
    }

    const okPass = await bcrypt.compare(String(contrasena), String(user.contrasena));
    if (!okPass) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const secret = process.env.JWT_SECRET;
    let token;
    if (secret) {
      // Mapear tipo_usuario a un valor de tipo compatible con requireAdmin
      let tipoToken = "usuario";
      if (user.tipo_usuario === "Prefecto General") tipoToken = "administrador";
      const payload = {
        sub: user.id_usuario,
        correo: user.correo,
        tipo: tipoToken,
        tipoUsuario: user.tipo_usuario
      };
      token = jwt.sign(payload, secret, { expiresIn: process.env.JWT_EXPIRES_IN || "2h" });
    }

    return res.json({
      message: "Login exitoso",
      token,
      usuario: {
        id_usuario: user.id_usuario,
        nombre: user.nombre,
        tipo_usuario: user.tipo_usuario,
        correo: user.correo,
        turno: user.turno,
        activo: user.activo,
        id_grupo: user.id_grupo
      }
    });
  } catch (error) {
    console.error("Error en login:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

export const actualizarUsuario = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Falta id_usuario" });

    const {
      nombre,
      correo,
      turno,
      tipo_usuario,
      activo,
      id_grupo
    } = req.body || {};

    const fields = [];
    const values = [];

    if (nombre !== undefined) { fields.push("nombre = ?"); values.push(nombre); }
    if (correo !== undefined) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(correo)) {
        return res.status(400).json({ error: "Correo electrónico inválido" });
      }
      fields.push("correo = ?"); values.push(correo);
    }
    if (turno !== undefined) { fields.push("turno = ?"); values.push(turno); }
    if (tipo_usuario !== undefined) { fields.push("tipo_usuario = ?"); values.push(tipo_usuario); }
    if (activo !== undefined) { fields.push("activo = ?"); values.push(!!activo); }
    if (id_grupo !== undefined) { fields.push("id_grupo = ?"); values.push(id_grupo === null ? null : Number(id_grupo)); }

    // Se usa boleta como secreto porq obviamente

    if (fields.length === 0) {
      return res.status(400).json({ error: "No hay cambios a aplicar" });
    }

    values.push(id);
    const [result] = await db.query(`UPDATE Usuarios SET ${fields.join(", ")} WHERE id_usuarios = ?`, values);
    if (!result || result.affectedRows === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const [rows] = await db.query(
      "SELECT id_usuarios AS id_usuario, nombre, tipo_usuario, correo, turno, activo, id_grupo FROM Usuarios WHERE id_usuarios = ? LIMIT 1",
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
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Falta id_usuario" });

    const [result] = await db.query("DELETE FROM Usuarios WHERE id_usuarios = ?", [id]);
    if (!result || result.affectedRows === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }
    return res.json({ message: "Usuario eliminado" });
  } catch (error) {
    console.error("Error al eliminar usuario:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

// Asignar prefecto de piso
export const asignarPrefectoPiso = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { piso_asignado } = req.body || {};
    if (!id || piso_asignado === undefined) {
      return res.status(400).json({ error: "Faltan id_usuario o piso_asignado" });
    }

    // Verificar que el usuario sea prefecto
    const [uRows] = await db.query(
      "SELECT tipo_usuario FROM Usuarios WHERE id_usuarios = ? LIMIT 1",
      [id]
    );
    if (!uRows || uRows.length === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }
    const tipoUsuario = uRows[0].tipo_usuario;
    if (tipoUsuario !== "Prefecto General" && tipoUsuario !== "Prefecto de Piso") {
      return res.status(400).json({ error: "El usuario no es prefecto" });
    }

    await db.query(
      `INSERT INTO Prefectos (id_prefecto, tipo_prefecto, piso_asignado)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE tipo_prefecto = VALUES(tipo_prefecto), piso_asignado = VALUES(piso_asignado)`,
      [id, tipoUsuario, piso_asignado]
    );

    return res.json({ message: "Prefecto de piso asignado" });
  } catch (error) {
    console.error("Error al asignar prefecto de piso:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};
