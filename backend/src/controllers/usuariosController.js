import { db } from "../config/db.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

// Joder mi adminisrtrador reaction
const ADMIN_VALUES = ["admin", "administrador", "adminisrtrador"];

async function resolveCatalogId({ table, idColumn, nameColumn, value }) {
  if (value === undefined || value === null || value === "") return null;

  const asNumber = Number(value);
  if (!Number.isNaN(asNumber) && Number.isInteger(asNumber)) {
    const [rows] = await db.query(
      `SELECT ${idColumn} AS id FROM ${table} WHERE ${idColumn} = ? LIMIT 1`,
      [asNumber]
    );
    return rows && rows[0] ? rows[0].id : null;
  }

  // Si es string resolver por nombre
  const [rows] = await db.query(
    `SELECT ${idColumn} AS id FROM ${table} WHERE ${nameColumn} = ? LIMIT 1`,
    [String(value)]
  );
  return rows && rows[0] ? rows[0].id : null;
}

async function getTipoUsuarioNombreById(idTipoUsuario) {
  const [rows] = await db.query(
    "SELECT nombre_tipo FROM tipo_usuario WHERE id_tipo_usuario = ? LIMIT 1",
    [idTipoUsuario]
  );
  return rows && rows[0] ? rows[0].nombre_tipo : null;
}

function mapTipoUsuarioToTipoPrefectoNombre(tipoUsuarioNombre) {
  if (tipoUsuarioNombre === "Prefecto General") return "General";
  if (tipoUsuarioNombre === "Prefecto de Piso") return "Piso";
  return null;
}

export const obtenerUsuarios = async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT u.id_usuarios AS id_usuario,
              u.nombre,
              tu.nombre_tipo AS tipo_usuario,
              u.correo,
              u.turno,
              u.id_grupo,
              g.nombre_grupo,
              p.piso_asignado,
              prof.area_educacion,
              prof.estado_asistencia
       FROM Usuarios u
       JOIN tipo_usuario tu ON u.tipo_usuario = tu.id_tipo_usuario
       LEFT JOIN Grupos g ON u.id_grupo = g.id_grupo
       LEFT JOIN Prefectos p ON p.id_prefecto = u.id_usuarios
       LEFT JOIN Profesores prof ON prof.id_profesor = u.id_usuarios`
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
      id_usuarios,
      boleta,
      nombre,
      correo,
      turno,
      id_grupo,
      tipo_usuario: tipoUsuarioBody,
      // compatibilidad con front viejo porq fungus hdp
      tipo_user,
      contrasena
    } = req.body || {};

    const idUsuario = id_usuarios ?? boleta;
    const idUsuarioNum = Number(idUsuario);

    if (!Number.isInteger(idUsuarioNum) || idUsuarioNum <= 0) {
      return res.status(400).json({ error: "Falta id_usuarios (o boleta) válido" });
    }

    if (!nombre || !correo || !turno || !contrasena) {
      return res
        .status(400)
        .json({ error: "Faltan campos requeridos: id_usuarios/boleta, nombre, correo, turno y contraseña" });
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

    // Verificar que el id no exista
    const [existId] = await db.query(
      "SELECT id_usuarios FROM Usuarios WHERE id_usuarios = ? LIMIT 1",
      [idUsuarioNum]
    );
    if (existId.length > 0) {
      return res.status(409).json({ error: "El id_usuarios (boleta) ya está registrado" });
    }

    // Determinar tipo_usuario (catálogo)
    const tipoUsuarioInput = tipoUsuarioBody || tipo_user || "Alumno";
    let tipoUsuarioId = await resolveCatalogId({
      table: "tipo_usuario",
      idColumn: "id_tipo_usuario",
      nameColumn: "nombre_tipo",
      value: tipoUsuarioInput
    });
    if (!tipoUsuarioId) {
      return res.status(400).json({ error: "tipo_usuario inválido (no existe en catálogo tipo_usuario)" });
    }

    let tipoUsuarioNombre = await getTipoUsuarioNombreById(tipoUsuarioId);
    if (!tipoUsuarioNombre) {
      return res.status(400).json({ error: "tipo_usuario inválido" });
    }

    // Si petición autenticada como admin se permite crear Prefecto General
    const reqUser = req.user;
    const isAdminReq = reqUser && ADMIN_VALUES.includes(String(reqUser.tipo || "").toLowerCase());
    if (!isAdminReq && tipoUsuarioNombre === "Prefecto General") {
      // usuarios normales no pueden ponerse como Prefecto General
      const fallbackId = await resolveCatalogId({
        table: "tipo_usuario",
        idColumn: "id_tipo_usuario",
        nameColumn: "nombre_tipo",
        value: "Alumno"
      });
      if (!fallbackId) {
        return res.status(500).json({ error: "Catálogo tipo_usuario incompleto (falta 'Alumno')" });
      }
      tipoUsuarioId = fallbackId;
      tipoUsuarioNombre = "Alumno";
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

    const saltRounds = Number(process.env.BCRYPT_COST || 10);
    const safeRounds = Number.isFinite(saltRounds) && saltRounds >= 4 ? saltRounds : 10;
    const hash = await bcrypt.hash(String(contrasena), safeRounds);

    const [result] = await db.query(
      `INSERT INTO Usuarios (id_usuarios, nombre, tipo_usuario, correo, \`contraseña\`, turno, id_grupo)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [idUsuarioNum, nombre, tipoUsuarioId, correo, hash, turno, idGrupoFinal]
    );

    // mysql2 devuelve affectedRows, no insertId (no autoincrement aquí :( )
    const newId = idUsuarioNum;

    // Crear registros relacionados según rol
    if (tipoUsuarioNombre === "Profesor" || tipoUsuarioNombre === "Auxiliar") {
      await db.query(
        `INSERT INTO Profesores (id_profesor, area_educacion)
         VALUES (?, ?)` ,
        [newId, String(req.body?.area_educacion || req.body?.area_estudio || "Sin asignar")]
      );
    } else if (tipoUsuarioNombre === "Prefecto General" || tipoUsuarioNombre === "Prefecto de Piso") {
      const tipoPrefectoNombre = mapTipoUsuarioToTipoPrefectoNombre(tipoUsuarioNombre);
      if (!tipoPrefectoNombre) {
        return res.status(500).json({ error: "No se pudo mapear tipo de prefecto" });
      }
      const tipoPrefectoId = await resolveCatalogId({
        table: "tipo_prefecto",
        idColumn: "id_tipo_prefecto",
        nameColumn: "nombre_tipo_prefecto",
        value: tipoPrefectoNombre
      });
      if (!tipoPrefectoId) {
        return res.status(500).json({ error: "Catálogo tipo_prefecto incompleto" });
      }

      await db.query(
        `INSERT INTO Prefectos (id_prefecto, tipo_prefecto, piso_asignado)
         VALUES (?, ?, NULL)`,
        [newId, tipoPrefectoId]
      );
    }

    return res.status(201).json({
      message: "Usuario registrado correctamente",
      usuario: {
        id_usuario: newId,
        nombre,
        tipo_usuario: tipoUsuarioNombre,
        correo,
        turno,
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
      `SELECT u.id_usuarios AS id_usuario,
              u.nombre,
              tu.nombre_tipo AS tipo_usuario,
              u.correo,
              u.\`contraseña\` AS contrasena_hash,
              u.turno,
              u.id_grupo,
              p.piso_asignado AS piso
       FROM Usuarios u
       JOIN tipo_usuario tu ON u.tipo_usuario = tu.id_tipo_usuario
       LEFT JOIN Prefectos p ON u.id_usuarios = p.id_prefecto
       WHERE u.correo = ? LIMIT 1`,
      [correo]
    );

    if (!rows || rows.length === 0) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const user = rows[0];

    // Solo bcrypt (la BD debe tener hashes)
    const okPass = await bcrypt.compare(String(contrasena), String(user.contrasena_hash));
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
        id_grupo: user.id_grupo,
        piso: user.piso
      }
    });
  } catch (error) {
    console.error("Error en login:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};


export const actualizarMiPerfil = async (req, res) => {
  try {
    const id = Number(req.user.sub);
    if (!id) return res.status(401).json({ error: "No autenticado" });

    const { nombre, correo, turno } = req.body || {};
    const fields = [];
    const values = [];

    if (nombre !== undefined) { fields.push("nombre = ?"); values.push(nombre); }
    if (correo !== undefined) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(correo)) return res.status(400).json({ error: "Correo electrónico inválido" });
      fields.push("correo = ?"); values.push(correo);
    }
    if (turno !== undefined) { fields.push("turno = ?"); values.push(turno); }

    if (fields.length === 0) return res.status(400).json({ error: "No hay campos a actualizar" });

    values.push(id);
    await db.query(`UPDATE Usuarios SET ${fields.join(", ")} WHERE id_usuarios = ?`, values);

    const [rows] = await db.query(
      `SELECT u.id_usuarios AS id_usuario, u.nombre, tu.nombre_tipo AS tipo_usuario, u.correo, u.turno, u.id_grupo, p.piso_asignado AS piso
       FROM Usuarios u JOIN tipo_usuario tu ON u.tipo_usuario = tu.id_tipo_usuario LEFT JOIN Prefectos p ON u.id_usuarios = p.id_prefecto WHERE u.id_usuarios = ? LIMIT 1`,
      [id]
    );
    const actualizado = rows && rows[0] ? rows[0] : null;
    return res.json({ message: "Perfil actualizado", usuario: actualizado });
  } catch (error) {
    console.error("Error actualizando perfil:", error);
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
      id_grupo,
      contrasena
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
    if (tipo_usuario !== undefined) {
      const tipoId = await resolveCatalogId({
        table: "tipo_usuario",
        idColumn: "id_tipo_usuario",
        nameColumn: "nombre_tipo",
        value: tipo_usuario
      });
      if (!tipoId) {
        return res.status(400).json({ error: "tipo_usuario inválido (no existe en catálogo tipo_usuario)" });
      }
      fields.push("tipo_usuario = ?");
      values.push(tipoId);
    }
    if (id_grupo !== undefined) { fields.push("id_grupo = ?"); values.push(id_grupo === null ? null : Number(id_grupo)); }

    if (contrasena !== undefined && String(contrasena).length > 0) {
      if (String(contrasena).length < 8) {
        return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres" });
      }
      const saltRounds = Number(process.env.BCRYPT_COST || 10);
      const safeRounds = Number.isFinite(saltRounds) && saltRounds >= 4 ? saltRounds : 10;
      const hash = await bcrypt.hash(String(contrasena), safeRounds);
      fields.push("`contraseña` = ?");
      values.push(hash);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: "No hay cambios a aplicar" });
    }

    values.push(id);
    const [result] = await db.query(`UPDATE Usuarios SET ${fields.join(", ")} WHERE id_usuarios = ?`, values);
    if (!result || result.affectedRows === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const [rows] = await db.query(
      `SELECT u.id_usuarios AS id_usuario,
              u.nombre,
              tu.nombre_tipo AS tipo_usuario,
              u.correo,
              u.turno,
              u.id_grupo
       FROM Usuarios u
       JOIN tipo_usuario tu ON u.tipo_usuario = tu.id_tipo_usuario
       WHERE u.id_usuarios = ? LIMIT 1`,
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

export const asignarPrefectoPiso = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { piso_asignado } = req.body || {};
    if (!id || piso_asignado === undefined) {
      return res.status(400).json({ error: "Faltan id_usuario o piso_asignado" });
    }

    const [rows] = await db.query(
      `SELECT u.id_usuarios AS id_usuario,
              tu.nombre_tipo AS tipo_usuario
       FROM Usuarios u
       JOIN tipo_usuario tu ON u.tipo_usuario = tu.id_tipo_usuario
       WHERE u.id_usuarios = ? LIMIT 1`,
      [id]
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const tipoUsuarioNombre = rows[0].tipo_usuario;
    if (tipoUsuarioNombre !== "Prefecto General" && tipoUsuarioNombre !== "Prefecto de Piso") {
      return res.status(400).json({ error: "El usuario no es prefecto" });
    }

    const tipoPrefectoNombre = mapTipoUsuarioToTipoPrefectoNombre(tipoUsuarioNombre);
    if (!tipoPrefectoNombre) {
      return res.status(500).json({ error: "No se pudo mapear tipo de prefecto" });
    }
    const tipoPrefectoId = await resolveCatalogId({
      table: "tipo_prefecto",
      idColumn: "id_tipo_prefecto",
      nameColumn: "nombre_tipo_prefecto",
      value: tipoPrefectoNombre
    });
    if (!tipoPrefectoId) {
      return res.status(500).json({ error: "Catálogo tipo_prefecto incompleto" });
    }

    await db.query(
      `INSERT INTO Prefectos (id_prefecto, tipo_prefecto, piso_asignado)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE tipo_prefecto = VALUES(tipo_prefecto), piso_asignado = VALUES(piso_asignado)`,
      [id, tipoPrefectoId, Number(piso_asignado)]
    );

    return res.json({ message: "Prefecto de piso asignado" });
  } catch (error) {
    console.error("Error al asignar prefecto de piso:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};
