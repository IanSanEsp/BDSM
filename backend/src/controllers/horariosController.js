import { db } from "../config/db.js";
function splitProfesor(name) {
  const n = String(name || '').trim();
  if (!n) return { nombre: 'Desconocido', appat: '-', apmat: '-' };
  const parts = n.split(/\s+/);
  const nombre = parts[0] || 'Desconocido';
  const appat = parts[1] || '-';
  const apmat = parts.length > 2 ? parts.slice(2).join(' ') : '-';
  return { nombre, appat, apmat };
}

const DIAS = new Set(["Lunes","Martes","Miércoles","Jueves","Viernes"]);

function validarHoraHHMM(h) {
  // Formato 24h HH:MM
  return /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(h));
}

function toTimeWithSeconds(h) {
  return h.length === 5 ? `${h}:00` : h; // si ya tiene segundos retornar
}

export const crearHorario = async (req, res) => {
  try {
    let { id_grupo, id_materia, dia, hora_inicio, hora_fin, id_salon, grupo_nombre, asignatura_nombre, profesor, profesor_nombre } = req.body || {};
    const profesorName = profesor_nombre || profesor || null;

    // Soportar enviar id_grupo/id_materia (antiguo) o enviar nombres (nuevo).
    if ((!id_grupo || !id_materia) && (!grupo_nombre || !asignatura_nombre)) {
      return res.status(400).json({ error: "Faltan campos requeridos: (id_grupo & id_materia) o (grupo_nombre & asignatura_nombre), dia, hora_inicio, hora_fin" });
    }

    if (!DIAS.has(String(dia))) {
      return res.status(400).json({ error: `día inválido (válidos: ${Array.from(DIAS).join(',')})` });
    }

    if (!validarHoraHHMM(hora_inicio) || !validarHoraHHMM(hora_fin)) {
      return res.status(400).json({ error: "Formato de hora inválido. Use HH:MM (ej. 09:00 o 14:30)" });
    }

    const hi = hora_inicio;
    const hf = hora_fin;
    // comprobar orden
    const [hiH, hiM] = hi.split(":").map(Number);
    const [hfH, hfM] = hf.split(":").map(Number);
    const minutosHi = hiH * 60 + hiM;
    const minutosHf = hfH * 60 + hfM;
    if (minutosHi >= minutosHf) {
      return res.status(400).json({ error: "hora_fin debe ser posterior a hora_inicio" });
    }

    // Verificar que el grupo existe y que pertenece a la materia indicada
    if ((!id_grupo || !id_materia) && (grupo_nombre && asignatura_nombre)) {
      // Buscar o crear materia
      const [matRows] = await db.query("SELECT id_materia, id_profesor FROM materia WHERE sig_nombre = ? LIMIT 1", [asignatura_nombre]);
      let materiaId;
      if (matRows && matRows.length > 0) {
        materiaId = matRows[0].id_materia;
        // Si se envía profesor, actualizar la materia con ese profesor (creándolo si no existe)
        if (profesorName) {
          // Buscar por nombre completo
          const [profRows2] = await db.query("SELECT id_profesor FROM profesor WHERE CONCAT_WS(' ', prof_nombre, prof_appat, prof_apmat) = ? LIMIT 1", [profesorName]);
          let profesorId2 = profRows2 && profRows2.length > 0 ? profRows2[0].id_profesor : null;
          if (!profesorId2) {
            const { nombre, appat, apmat } = splitProfesor(profesorName);
            const [insProf2] = await db.query("INSERT INTO profesor (prof_nombre, prof_appat, prof_apmat) VALUES (?, ?, ?)", [nombre, appat, apmat]);
            profesorId2 = insProf2.insertId;
          }
          await db.query("UPDATE materia SET id_profesor = ? WHERE id_materia = ?", [profesorId2, materiaId]);
        }
      } else {
        // Crear profesor según el nombre proporcionado o usar 'Desconocido'
        let profesorId;
        if (profesorName) {
          const [profRowsByFull] = await db.query("SELECT id_profesor FROM profesor WHERE CONCAT_WS(' ', prof_nombre, prof_appat, prof_apmat) = ? LIMIT 1", [profesorName]);
          if (profRowsByFull && profRowsByFull.length > 0) {
            profesorId = profRowsByFull[0].id_profesor;
          } else {
            const { nombre, appat, apmat } = splitProfesor(profesorName);
            const [insProf] = await db.query("INSERT INTO profesor (prof_nombre, prof_appat, prof_apmat) VALUES (?, ?, ?)", [nombre, appat, apmat]);
            profesorId = insProf.insertId;
          }
        } else {
          const [profRows] = await db.query("SELECT id_profesor FROM profesor WHERE prof_nombre = ? LIMIT 1", ["Desconocido"]);
          if (profRows && profRows.length > 0) {
            profesorId = profRows[0].id_profesor;
          } else {
            const [insProf] = await db.query("INSERT INTO profesor (prof_nombre, prof_appat, prof_apmat) VALUES (?, ?, ?)", ["Desconocido", "-", "-"]);
            profesorId = insProf.insertId;
          }
        }
        const [insMat] = await db.query("INSERT INTO materia (sig_nombre, id_profesor) VALUES (?, ?)", [asignatura_nombre, profesorId]);
        materiaId = insMat.insertId;
      }

      // Buscar o crear grupo con ese nombre.
      const [gRows] = await db.query("SELECT id_grupo FROM grupo WHERE grupo_nombre = ? LIMIT 1", [grupo_nombre]);
      if (gRows && gRows.length > 0) {
        id_grupo = gRows[0].id_grupo;
      } else {
        const [insG] = await db.query("INSERT INTO grupo (grupo_nombre, id_materia) VALUES (?, ?)", [grupo_nombre, materiaId]);
        id_grupo = insG.insertId;
      }

      // Asegurar relación grupo-materia en la tabla del mapeo
      const [mapRows] = await db.query("SELECT 1 FROM grupo_materia WHERE id_grupo = ? AND id_materia = ? LIMIT 1", [id_grupo, materiaId]);
      if (!mapRows || mapRows.length === 0) {
        await db.query("INSERT INTO grupo_materia (id_grupo, id_materia) VALUES (?, ?)", [id_grupo, materiaId]);
      }
      // Establecer id_materia que será registrada en el horario
      id_materia = materiaId;
      // Asegurar id_materia
      id_materia = materiaId;
    }

    // Verificar que el grupo existe
    const [grRows] = await db.query("SELECT id_materia FROM grupo WHERE id_grupo = ? LIMIT 1", [id_grupo]);
    if (!grRows || grRows.length === 0) {
      return res.status(400).json({ error: "Grupo no encontrado" });
    }
    const grupo = grRows[0];

    // Aceptar si
    // la materia coincide con la materia principal del grupo (grupo.id_materia)
    // existe la asociación en la tabla grupo_materia (many-to-many)
    if (Number(grupo.id_materia) !== Number(id_materia)) {
      const [mapCheck] = await db.query(
        "SELECT 1 FROM grupo_materia WHERE id_grupo = ? AND id_materia = ? LIMIT 1",
        [id_grupo, id_materia]
      );
      if (!mapCheck || mapCheck.length === 0) {
        return res.status(400).json({ error: "La asignatura indicada no corresponde al grupo" });
      }
    }

    // Si hay id_salon comprobar existencia
    if (id_salon) {
      const [sRows] = await db.query("SELECT id_salon FROM salon WHERE id_salon = ? LIMIT 1", [id_salon]);
      if (!sRows || sRows.length === 0) {
        return res.status(400).json({ error: "Salón no encontrado" });
      }
    }

    const hiSQL = toTimeWithSeconds(hi);
    const hfSQL = toTimeWithSeconds(hf);

    // Control de colisiones
    // Mismo grupo no puede tener dos horarios que se solapen el mismo día.
    const [collisionGroup] = await db.query(
      `SELECT COUNT(*) AS cnt FROM horario_grupo WHERE id_grupo = ? AND dia = ? AND NOT (hora_fin <= ? OR hora_inicio >= ?)`,
      [id_grupo, dia, hiSQL, hfSQL]
    );
    if (collisionGroup && collisionGroup[0] && collisionGroup[0].cnt > 0) {
      return res.status(409).json({ error: 'Colisión: el grupo ya tiene horario que se solapa en ese día' });
    }

    // Salón no puede tener otro horario que se solape el mismo día.
    if (id_salon) {
      const [collisionSalon] = await db.query(
        `SELECT COUNT(*) AS cnt FROM horario_grupo WHERE id_salon = ? AND dia = ? AND NOT (hora_fin <= ? OR hora_inicio >= ?)`,
        [id_salon, dia, hiSQL, hfSQL]
      );
      if (collisionSalon && collisionSalon[0] && collisionSalon[0].cnt > 0) {
        return res.status(409).json({ error: 'Colisión: el salón ya tiene un horario que se solapa en ese día' });
      }
    }

    // Insertar guardar id_materia
    await db.query(
      `INSERT INTO horario_grupo (id_grupo, id_materia, id_salon, dia, hora_inicio, hora_fin) VALUES (?, ?, ?, ?, ?, ?)`,
      [id_grupo, id_materia || null, id_salon || null, dia, hiSQL, hfSQL]
    );

    return res.status(201).json({ message: 'Horario creado' });
  } catch (err) {
    console.error('Error al crear horario:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

export const listarHorarios = async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT hg.*, g.grupo_nombre, m.sig_nombre AS asignatura,
              CONCAT_WS(' ', p.prof_nombre, p.prof_appat, p.prof_apmat) AS profesor
       FROM horario_grupo hg
       LEFT JOIN grupo g ON hg.id_grupo = g.id_grupo
       LEFT JOIN materia m ON hg.id_materia = m.id_materia
       LEFT JOIN profesor p ON m.id_profesor = p.id_profesor
       ORDER BY FIELD(hg.dia, 'Lunes','Martes','Miércoles','Jueves','Viernes'), hg.hora_inicio`
    );
    res.json({ horarios: rows });
  } catch (err) {
    console.error('Error al listar horarios:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

export const eliminarHorario = async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: 'Falta id del horario' });

    const [result] = await db.query('DELETE FROM horario_grupo WHERE id_horario = ?', [id]);

    if (result && result.affectedRows === 0) {
      return res.status(404).json({ error: 'Horario no encontrado' });
    }
    return res.json({ message: 'Horario eliminado' });
  } catch (err) {
    console.error('Error al eliminar horario:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

export const buscarPorBloque = async (req, res) => {
  try {
    const { dia, hora_inicio, hora_fin } = req.query || {};
    if (!dia || !hora_inicio || !hora_fin) {
      return res.status(400).json({ error: 'Faltan parámetros: dia, hora_inicio, hora_fin' });
    }
    if (!DIAS.has(String(dia))) {
      return res.status(400).json({ error: 'día inválido' });
    }
    if (!validarHoraHHMM(hora_inicio) || !validarHoraHHMM(hora_fin)) {
      return res.status(400).json({ error: 'Formato de hora inválido. Use HH:MM' });
    }
    const hi = hora_inicio.length === 5 ? `${hora_inicio}:00` : hora_inicio;
    const hf = hora_fin.length === 5 ? `${hora_fin}:00` : hora_fin;

    const [rows] = await db.query(
      `SELECT hg.*, g.grupo_nombre, m.sig_nombre AS asignatura,
              CONCAT_WS(' ', p.prof_nombre, p.prof_appat, p.prof_apmat) AS profesor
       FROM horario_grupo hg
       LEFT JOIN grupo g ON hg.id_grupo = g.id_grupo
       LEFT JOIN materia m ON hg.id_materia = m.id_materia
       LEFT JOIN profesor p ON m.id_profesor = p.id_profesor
       WHERE hg.dia = ? AND NOT (hg.hora_fin <= ? OR hg.hora_inicio >= ?)
       ORDER BY hg.hora_inicio`,
      [dia, hi, hf]
    );

    return res.json({ horarios: rows });
  } catch (err) {
    console.error('Error en buscarPorBloque:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

export const asignarSalon = async (req, res) => {
  try {
    const id = req.params.id;
    const { id_salon } = req.body || {};
    if (!id || !id_salon) return res.status(400).json({ error: 'Falta id horario o id_salon' });

    // comprobar horario
    const [hRows] = await db.query('SELECT * FROM horario_grupo WHERE id_horario = ? LIMIT 1', [id]);
    if (!hRows || hRows.length === 0) return res.status(404).json({ error: 'Horario no encontrado' });
    const h = hRows[0];

    // comprobar salon
    const [sRows] = await db.query('SELECT id_salon FROM salon WHERE id_salon = ? LIMIT 1', [id_salon]);
    if (!sRows || sRows.length === 0) return res.status(400).json({ error: 'Salón no encontrado' });

    // colisión en salón con horarios
    const [colRows] = await db.query(
      `SELECT COUNT(*) AS cnt FROM horario_grupo WHERE id_salon = ? AND dia = ? AND id_horario != ? AND NOT (hora_fin <= ? OR hora_inicio >= ?)`,
      [id_salon, h.dia, id, h.hora_inicio, h.hora_fin]
    );
    if (colRows && colRows[0] && colRows[0].cnt > 0) {
      return res.status(409).json({ error: 'Colisión: el salón ya tiene horario en ese bloque' });
    }

    // asignar
    await db.query('UPDATE horario_grupo SET id_salon = ? WHERE id_horario = ?', [id_salon, id]);

    // devolver horario actualizado
    const [updated] = await db.query(
      `SELECT hg.*, g.grupo_nombre, m.sig_nombre AS asignatura,
              CONCAT_WS(' ', p.prof_nombre, p.prof_appat, p.prof_apmat) AS profesor
       FROM horario_grupo hg
       LEFT JOIN grupo g ON hg.id_grupo = g.id_grupo
       LEFT JOIN materia m ON hg.id_materia = m.id_materia
       LEFT JOIN profesor p ON m.id_profesor = p.id_profesor
       WHERE hg.id_horario = ? LIMIT 1`,
      [id]
    );

    const horario = updated && updated[0] ? updated[0] : null;

    // Actualizar estado del salón por hora actual
    try {
      const dias = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
      const now = new Date();
      const diaHoy = dias[now.getDay()];
      const pad = (n) => String(n).padStart(2, '0');
      const horaActual = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

      // Verificar horario para salón
      const [activeRows] = await db.query(
        `SELECT COUNT(*) AS cnt FROM horario_grupo WHERE id_salon = ? AND dia = ? AND hora_inicio <= ? AND hora_fin > ?`,
        [id_salon, diaHoy, horaActual, horaActual]
      );
      const ocupado = activeRows && activeRows[0] && activeRows[0].cnt > 0;
      const nuevoEstado = ocupado ? 'Ocupado' : 'Disponible';

      await db.query('UPDATE salon SET estado = ? WHERE id_salon = ?', [nuevoEstado, id_salon]);

      // devolver el salón estado actualizado
      const [salRows] = await db.query('SELECT * FROM salon WHERE id_salon = ? LIMIT 1', [id_salon]);
      const salonActualizado = salRows && salRows[0] ? salRows[0] : null;

      return res.json({ message: 'Salón asignado', horario, salon: salonActualizado });
    } catch (err2) {
      console.error('Error actualizando estado de salón:', err2);
      return res.json({ message: 'Salón asignado', horario });
    }
  } catch (err) {
    console.error('Error en asignarSalon:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

export const desasignarSalon = async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: 'Falta id del horario' });

    // comprobar horario y salón actual
    const [hRows] = await db.query('SELECT * FROM horario_grupo WHERE id_horario = ? LIMIT 1', [id]);
    if (!hRows || hRows.length === 0) return res.status(404).json({ error: 'Horario no encontrado' });
    const h = hRows[0];
    const previousSalon = h.id_salon || null;

    // desasignar
    await db.query('UPDATE horario_grupo SET id_salon = NULL WHERE id_horario = ?', [id]);

    // devolver horario actualizado
    const [updated] = await db.query(
      `SELECT hg.*, g.grupo_nombre, m.sig_nombre AS asignatura,
              CONCAT_WS(' ', p.prof_nombre, p.prof_appat, p.prof_apmat) AS profesor
       FROM horario_grupo hg
       LEFT JOIN grupo g ON hg.id_grupo = g.id_grupo
       LEFT JOIN materia m ON hg.id_materia = m.id_materia
       LEFT JOIN profesor p ON m.id_profesor = p.id_profesor
       WHERE hg.id_horario = ? LIMIT 1`,
      [id]
    );
    const horario = updated && updated[0] ? updated[0] : null;

    // Si había salón asignado, recalcular su estado actual
    if (previousSalon) {
      try {
        const dias = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
        const now = new Date();
        const diaHoy = dias[now.getDay()];
        const pad = (n) => String(n).padStart(2, '0');
        const horaActual = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

        const [activeRows] = await db.query(
          `SELECT COUNT(*) AS cnt FROM horario_grupo WHERE id_salon = ? AND dia = ? AND hora_inicio <= ? AND hora_fin > ?`,
          [previousSalon, diaHoy, horaActual, horaActual]
        );
        const ocupado = activeRows && activeRows[0] && activeRows[0].cnt > 0;
        const nuevoEstado = ocupado ? 'Ocupado' : 'Disponible';

        await db.query('UPDATE salon SET estado = ? WHERE id_salon = ?', [nuevoEstado, previousSalon]);
        const [salRows] = await db.query('SELECT * FROM salon WHERE id_salon = ? LIMIT 1', [previousSalon]);
        const salonActualizado = salRows && salRows[0] ? salRows[0] : null;
        return res.json({ message: 'Salón desasignado', horario, salon: salonActualizado });
      } catch (err2) {
        console.error('Error actualizando estado de salón (desasignar):', err2);
        return res.json({ message: 'Salón desasignado', horario });
      }
    }

    return res.json({ message: 'Salón desasignado', horario });
  } catch (err) {
    console.error('Error en desasignarSalon:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};
