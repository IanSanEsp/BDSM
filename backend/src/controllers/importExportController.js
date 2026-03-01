import fs from "fs";
import path from "path";
import crypto from "crypto";
import xlsx from "xlsx";
import { db } from "../config/db.js";

const EXPORT_FILE_RELATIVE = path.join('..', '..', 'Exportacion_datos', 'Exportacion_datos', 'horarios.json');

// Utilidades para nombres de profesor, replicando la lógica de horariosController
function splitProfesor(name) {
  const n = String(name || '').trim();
  if (!n) return { nombre: 'Desconocido', appat: '-', apmat: '-' };
  const parts = n.split(/\s+/);
  const nombre = parts[0] || 'Desconocido';
  const appat = parts[1] || '-';
  const apmat = parts.length > 2 ? parts.slice(2).join(' ') : '-';
  return { nombre, appat, apmat };
}

async function ensureProfesor(nombreCompleto) {
  const full = String(nombreCompleto || '').trim();

  // Caso especial: usar siempre un único profesor 'Desconocido'
  if (!full || full.toLowerCase() === 'desconocido') {
    const [profRows] = await db.query(
      "SELECT id_profesor FROM profesor WHERE prof_nombre = ? LIMIT 1",
      ["Desconocido"]
    );
    if (profRows && profRows.length > 0) {
      return profRows[0].id_profesor;
    }
    const [insProf] = await db.query(
      "INSERT INTO profesor (prof_nombre, prof_appat, prof_apmat) VALUES (?, ?, ?)",
      ["Desconocido", "-", "-"]
    );
    return insProf.insertId;
  }

  // Buscar por nombre completo
  const [profRows] = await db.query(
    "SELECT id_profesor FROM profesor WHERE CONCAT_WS(' ', prof_nombre, prof_appat, prof_apmat) = ? LIMIT 1",
    [full]
  );
  if (profRows && profRows.length > 0) {
    return profRows[0].id_profesor;
  }

  const { nombre, appat, apmat } = splitProfesor(full);
  const [insProf] = await db.query(
    "INSERT INTO profesor (prof_nombre, prof_appat, prof_apmat) VALUES (?, ?, ?)",
    [nombre, appat, apmat]
  );
  return insProf.insertId;
}

function formatTimeRange(hInicio, hFin) {
  // hInicio/hFin are time strings like "08:00:00" or "08:00"
  const fmt = (t) => {
    if (!t) return t;
    const parts = t.split(':');
    return `${Number(parts[0])}:${String(parts[1]).padStart(2, '0')}`;
  };
  return `${fmt(hInicio)} - ${fmt(hFin)}`;
}

function excelTimeToString(excelTime) {
  // Excel time is fraction of day, e.g. 0.5 = 12:00
  const totalMinutes = Math.round(excelTime * 24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
}

function sheetToJson(workbook, name) {
  if (!workbook.SheetNames.includes(name)) return [];
  const ws = workbook.Sheets[name];
  if (!ws) return [];
  return xlsx.utils.sheet_to_json(ws);
}

export const exportHorarios = async (_req, res) => {
  try {
    // Obtener horarios junto con salón, materia y profesor
    const [rows] = await db.query(
      `SELECT s.nombre AS salon_nombre, m.sig_nombre AS materia, p.prof_nombre, p.prof_appat, hg.hora_inicio, hg.hora_fin
       FROM horario_grupo hg
       LEFT JOIN salon s ON hg.id_salon = s.id_salon
       LEFT JOIN materia m ON hg.id_materia = m.id_materia
       LEFT JOIN profesor p ON m.id_profesor = p.id_profesor
       ORDER BY s.nombre, hg.hora_inicio`);

    const out = { salones: {} };
    for (const r of rows) {
      const salonName = r.salon_nombre || 'SinAsignar';
      if (!out.salones[salonName]) out.salones[salonName] = [];
      const profesor = r.prof_appat ? String(r.prof_appat).trim() : (r.prof_nombre ? String(r.prof_nombre).trim() : 'Desconocido');
      out.salones[salonName].push({
        materia: r.materia || 'SinAsignar',
        hora: formatTimeRange(r.hora_inicio, r.hora_fin),
        profesor
      });
    }

    return res.json(out);
  } catch (err) {
    console.error('Error exportando horarios:', err);
    return res.status(500).json({ error: 'Error interno al exportar horarios' });
  }
};

// Importar toda la BD desde un Excel con varias hojas (usuario, salon, profesor, materia, grupo, grupo_materia, horario_grupo)
export const importFullDb = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió archivo Excel' });
    }

    const workbook = xlsx.readFile(req.file.path);

    const usuarios = sheetToJson(workbook, 'usuario');
    const salones = sheetToJson(workbook, 'salon');
    const profesores = sheetToJson(workbook, 'profesor');
    const materias = sheetToJson(workbook, 'materia');
    const grupos = sheetToJson(workbook, 'grupo');
    const gruposMateria = sheetToJson(workbook, 'grupo_materia');
    const horarios = sheetToJson(workbook, 'horario_grupo');
    const markers = sheetToJson(workbook, 'salon_maker');

    const summary = {
      usuarios: 0,
      salones: 0,
      profesores: 0,
      materias: 0,
      grupos: 0,
      grupo_materia: 0,
      horarios: 0,
      salon_markers: 0
    };

    // Usuarios
    for (const u of usuarios) {
      const id_usuario = String(u.id_usuario || '').trim();
      if (!id_usuario) continue;
      const nombre = String(u.nombre || '').trim();
      const apmat = String(u.apmat || '').trim();
      const appat = String(u.appat || '').trim();
      const correo = String(u.correo_electronico || '').trim();
      const contrasena = String(u.contrasena || '').trim();
      let tipo = String(u.tipo_user || '').trim().toLowerCase();
      if (tipo.startsWith('admin')) tipo = 'adminisrtrador';
      else if (!tipo) tipo = 'usuario';

      try {
        await db.query(
          `INSERT INTO usuario (id_usuario, nombre, apmat, appat, correo_electronico, contrasena, tipo_user)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE nombre=VALUES(nombre), apmat=VALUES(apmat), appat=VALUES(appat), correo_electronico=VALUES(correo_electronico), contrasena=VALUES(contrasena), tipo_user=VALUES(tipo_user)`,
          [id_usuario, nombre, apmat, appat, correo, contrasena, tipo]
        );
        summary.usuarios++;
      } catch (e) {
        console.error('Error importando usuario', id_usuario, e.message);
      }
    }

    // Profesores
    for (const p of profesores) {
      const id_profesor = Number(p.id_profesor) || null;
      const prof_nombre = String(p.prof_nombre || '').trim();
      const prof_appat = String(p.prof_appat || '').trim();
      const prof_apmat = String(p.prof_apmat || '').trim();
      if (!prof_nombre) continue;

      try {
        if (id_profesor) {
          await db.query(
            `INSERT INTO profesor (id_profesor, prof_nombre, prof_appat, prof_apmat)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE prof_nombre=VALUES(prof_nombre), prof_appat=VALUES(prof_appat), prof_apmat=VALUES(prof_apmat)`,
            [id_profesor, prof_nombre, prof_appat, prof_apmat]
          );
        } else {
          await db.query(
            `INSERT INTO profesor (prof_nombre, prof_appat, prof_apmat)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE prof_appat=VALUES(prof_appat), prof_apmat=VALUES(prof_apmat)`,
            [prof_nombre, prof_appat, prof_apmat]
          );
        }
        summary.profesores++;
      } catch (e) {
        console.error('Error importando profesor', id_profesor || prof_nombre, e.message);
      }
    }

    // Salones
    for (const s of salones) {
      const id_salon = String(s.id_salon || '').trim();
      const nombre = String(s.nombre || '').trim() || id_salon;
      if (!id_salon) continue;

      const pisoRaw = String(s.piso ?? '').trim();
      const pisoMatch = pisoRaw.match(/[123]/);
      const piso = pisoMatch ? pisoMatch[0] : '1';

      const tipoRaw = String(s.tipo || '').toLowerCase();
      const tipo = tipoRaw.includes('lab') ? 'Laboratorio' : 'Aula';

      const estadoRaw = String(s.estado || '').toLowerCase();
      let estado = 'Disponible';
      if (estadoRaw.includes('mant')) estado = 'En Mantenimiento';
      else if (estadoRaw.startsWith('ocup')) estado = 'Ocupado';

      try {
        await db.query(
          `INSERT INTO salon (id_salon, nombre, piso, tipo, estado)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE nombre=VALUES(nombre), piso=VALUES(piso), tipo=VALUES(tipo), estado=VALUES(estado)`,
          [id_salon, nombre, piso, tipo, estado]
        );
        summary.salones++;
      } catch (e) {
        console.error('Error importando salon', id_salon, e.message);
      }
    }

    // Materias
    // En final2.xlsx la hoja "materia" solo trae id_materia y sig_nombre.
    // Si no viene id_profesor usamos/creamos un profesor "Desconocido".
    for (const m of materias) {
      const id_materia = Number(m.id_materia) || null;
      const sig_nombre = String(m.sig_nombre || '').trim();
      let id_profesor = Number(m.id_profesor) || null;
      if (!sig_nombre) continue;

      try {
        if (!id_profesor) {
          id_profesor = await ensureProfesor('Desconocido');
        }

        if (id_materia) {
          await db.query(
            `INSERT INTO materia (id_materia, sig_nombre, id_profesor)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE sig_nombre=VALUES(sig_nombre), id_profesor=VALUES(id_profesor)`,
            [id_materia, sig_nombre, id_profesor]
          );
        } else {
          await db.query(
            `INSERT INTO materia (sig_nombre, id_profesor)
             VALUES (?, ?)
             ON DUPLICATE KEY UPDATE id_profesor=VALUES(id_profesor)`,
            [sig_nombre, id_profesor]
          );
        }
        summary.materias++;
      } catch (e) {
        console.error('Error importando materia', id_materia || sig_nombre, e.message);
      }
    }

    // Grupos
    // En final2.xlsx la hoja "grupo" trae id_grupo y grupo_nombre pero no id_materia.
    // Asignamos una materia genérica "SinAsignar" para cumplir la FK.
    for (const g of grupos) {
      const id_grupo = Number(g.id_grupo) || null;
      const grupo_nombre = String(g.grupo_nombre || g.grupo_nombr || '').trim();
      if (!grupo_nombre) continue;

      try {
        const profId = await ensureProfesor('Desconocido');
        const defaultMateriaId = await ensureMateria('SinAsignar', profId);

        if (id_grupo) {
          await db.query(
            `INSERT INTO grupo (id_grupo, grupo_nombre, id_materia)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE grupo_nombre=VALUES(grupo_nombre), id_materia=VALUES(id_materia)`,
            [id_grupo, grupo_nombre, defaultMateriaId]
          );
        } else {
          await db.query(
            `INSERT INTO grupo (grupo_nombre, id_materia)
             VALUES (?, ?)
             ON DUPLICATE KEY UPDATE id_materia=VALUES(id_materia)`,
            [grupo_nombre, defaultMateriaId]
          );
        }
        summary.grupos++;
      } catch (e) {
        console.error('Error importando grupo', id_grupo || grupo_nombre, e.message);
      }
    }

    // Grupo-materia (tabla puente)
    // En final2.xlsx la hoja "grupo_materia" sólo tiene id e id_grupo.
    // Si no hay id_materia, usamos el id_materia del grupo ya insertado.
    for (const gm of gruposMateria) {
      const id_grupo = Number(gm.id_grupo) || null;
      let id_materia = Number(gm.id_materia) || null;
      if (!id_grupo) continue;

      try {
        if (!id_materia) {
          const [gRows] = await db.query('SELECT id_materia FROM grupo WHERE id_grupo = ? LIMIT 1', [id_grupo]);
          if (!gRows || gRows.length === 0) continue;
          id_materia = gRows[0].id_materia;
        }

        await db.query(
          `INSERT INTO grupo_materia (id_grupo, id_materia)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE id_materia=VALUES(id_materia)`,
          [id_grupo, id_materia]
        );
        summary.grupo_materia++;
      } catch (e) {
        console.error('Error importando grupo_materia', id_grupo, id_materia, e.message);
      }
    }

    // Horarios (adaptado a final2.xlsx: requiere id_grupo y dia)
    for (const h of horarios) {
      const rawSalon = (h.Id_salon !== undefined ? h.Id_salon : h.id_salon);
      const id_salon = rawSalon ? String(rawSalon).trim() : null;
      const id_grupo = Number(h.Id_grupo !== undefined ? h.Id_grupo : h.id_grupo) || null;
      const diaFuente = (h.horario_dia !== undefined ? h.horario_dia : h.dia);
      const dia = String(diaFuente || '').trim();
      if (!id_grupo || !dia) continue;

      const normalizeTime = (val) => {
        if (val == null) return null;
        if (typeof val === 'number') return excelTimeToString(val);
        const s = String(val).trim();
        if (!s) return null;
        const parts = s.split(':');
        if (parts.length === 2) return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:00`;
        if (parts.length === 3) return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:${parts[2].padStart(2, '0')}`;
        return s;
      };

      const hora_inicio = normalizeTime(h.hora_inicio);
      const hora_fin = normalizeTime(h.hora_final ?? h.hora_fin);
      if (!hora_inicio || !hora_fin) continue;

      try {
        // Si el Excel ya trae id_materia en la hoja horario_grupo, usarlo directamente
        let id_materia = Number(h.id_materia !== undefined ? h.id_materia : h.Id_materia) || null;

        if (!id_materia) {
          const [materiaRows] = await db.query('SELECT id_materia FROM grupo_materia WHERE id_grupo = ? LIMIT 1', [id_grupo]);
          id_materia = materiaRows && materiaRows.length > 0 ? materiaRows[0].id_materia : null;
          if (!id_materia) {
            const [gRows] = await db.query('SELECT id_materia FROM grupo WHERE id_grupo = ? LIMIT 1', [id_grupo]);
            if (gRows && gRows.length > 0) id_materia = gRows[0].id_materia;
          }

          // Si tampoco se encuentra, crear una materia automática para este grupo
          if (!id_materia) {
            const profId = await ensureProfesor('Desconocido');
            const sigla = `Auto_${id_grupo}`;
            id_materia = await ensureMateria(sigla, profId);
            await db.query(
              `INSERT IGNORE INTO grupo_materia (id_grupo, id_materia) VALUES (?, ?)`,
              [id_grupo, id_materia]
            );
            summary.grupo_materia++;
          }
        }

        if (id_salon) {
          const [collision] = await db.query(
            `SELECT COUNT(*) AS cnt FROM horario_grupo WHERE id_salon = ? AND dia = ? AND NOT (hora_fin <= ? OR hora_inicio >= ?)`,
            [id_salon, dia, hora_inicio, hora_fin]
          );
          if (collision && collision[0] && collision[0].cnt > 0) {
            continue;
          }
        }

        await db.query(
          `INSERT INTO horario_grupo (id_grupo, id_materia, id_salon, dia, hora_inicio, hora_fin)
           VALUES (?, ?, ?, ?, ?, ?)` ,
          [id_grupo, id_materia, id_salon, dia, hora_inicio, hora_fin]
        );
        summary.horarios++;
      } catch (e) {
        console.error('Error importando horario', id_grupo, id_salon, e.message);
      }
    }

    // Salon markers (opcional)
    for (const m of markers) {
      const id_salon = String(m.id_salon || '').trim();
      if (!id_salon) continue;
      const pisoRaw = String(m.piso ?? '').trim();
      const pisoMatch = pisoRaw.match(/[123]/);
      const piso = pisoMatch ? pisoMatch[0] : '1';
      const x = Number(m.x);
      const y = Number(m.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

      try {
        await db.query(
          `INSERT INTO salon_markers (piso, id_salon, x, y)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE x=VALUES(x), y=VALUES(y)` ,
          [piso, id_salon, x, y]
        );
        summary.salon_markers++;
      } catch (e) {
        console.error('Error importando salon_marker', id_salon, e.message);
      }
    }

    console.log('IMPORTACION COMPLETA RESUMEN:', summary);
    return res.json({ message: 'Importación completa realizada', summary });
  } catch (err) {
    console.error('Error en importación completa:', err);
    return res.status(500).json({ error: 'Error interno al importar base completa' });
  }
};

async function ensureSalon(nombre) {
  if (!nombre) return null;
  const [found] = await db.query('SELECT id_salon FROM salon WHERE nombre = ? LIMIT 1', [nombre]);
  if (found && found.length > 0) return found[0].id_salon;

  // Crear salon con valores por defecto
  const id_salon = crypto.randomUUID();
  await db.query('INSERT INTO salon (id_salon, nombre, piso, tipo, estado) VALUES (?, ?, ?, ?, ?)', [id_salon, nombre, '1', 'Aula', 'Disponible']);
  return id_salon;
}

async function ensureMateria(sigla, id_profesor) {
  if (!sigla || !id_profesor) return null;
  const [found] = await db.query('SELECT id_materia FROM materia WHERE sig_nombre = ? AND id_profesor = ? LIMIT 1', [sigla, id_profesor]);
  if (found && found.length > 0) return found[0].id_materia;

  const [ins] = await db.query('INSERT INTO materia (sig_nombre, id_profesor) VALUES (?, ?)', [sigla, id_profesor]);
  return ins.insertId;
}

async function ensureGrupo(id_materia, grupo_nombre = null) {
  if (!id_materia) return null;
  if (!grupo_nombre) grupo_nombre = `Grupo_${id_materia}`;
  const [found] = await db.query('SELECT id_grupo FROM grupo WHERE grupo_nombre = ? AND id_materia = ? LIMIT 1', [grupo_nombre, id_materia]);
  if (found && found.length > 0) return found[0].id_grupo;

  const [ins] = await db.query('INSERT INTO grupo (grupo_nombre, id_materia) VALUES (?, ?)', [grupo_nombre, id_materia]);
  const id_grupo = ins.insertId;
  // Insertar en grupo_materia
  await db.query('INSERT INTO grupo_materia (id_grupo, id_materia) VALUES (?, ?)', [id_grupo, id_materia]);
  return id_grupo;
}

export const importHorarios = async (req, res) => {
  try {
    console.log('Import request received');
    console.log('req.body:', req.body);
    console.log('req.file:', req.file);
    let data = req.body;
    let fromExcel = false;

    // Si hay archivo Excel, parsearlo
    if (req.file) {
      const workbook = xlsx.readFile(req.file.path);
      const sheetName = workbook.SheetNames.includes('Horarios') ? 'Horarios' : workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = xlsx.utils.sheet_to_json(worksheet);

      // Convertir a formato esperado: { salones: { salonNombre: [ { materia, profesor, hora, dia? } ] } }
      data = { salones: {} };
      for (const row of jsonData) {
        const salon = String(row.salon || row.Salon || row.Salón || '').trim();
        const materia = String(row.materia || row.Materia || row.Asignatura || '').trim();
        const profesor = String(row.profesor || row.Profesor || '').trim();
        const hora = String(row.hora || row.Hora || '').trim();
        const dia = String(row.dia || row.Dia || row.Día || 'Lunes').trim();

        if (!salon || !materia) continue; // saltar filas incompletas

        if (!data.salones[salon]) data.salones[salon] = [];
        data.salones[salon].push({ materia, profesor, hora, dia });
      }

      fromExcel = true;
      // If the data is in database format (with IDs), insert directly
      if (jsonData.length > 0 && jsonData[0].Id_salon) {
        const inserted = [];
        for (const row of jsonData) {
          const id_salon = row.Id_salon;
          const id_grupo = row.Id_grupo;
          const dia = row.horario_dia;
          const hora_inicio = excelTimeToString(row.hora_inicio);
          const hora_fin = excelTimeToString(row.hora_final);

          // Get id_materia
          const [materiaRows] = await db.query('SELECT id_materia FROM grupo_materia WHERE id_grupo = ? LIMIT 1', [id_grupo]);
          if (!materiaRows || materiaRows.length === 0) continue; // skip if no materia
          const id_materia = materiaRows[0].id_materia;

          // Check collision
          const [collision] = await db.query(
            `SELECT COUNT(*) AS cnt FROM horario_grupo WHERE id_salon = ? AND dia = ? AND NOT (hora_fin <= ? OR hora_inicio >= ?)`,
            [id_salon, dia, hora_inicio, hora_fin]
          );
          if (collision && collision[0] && collision[0].cnt > 0) {
            continue; // skip
          }

          console.log('Inserting (direct)', id_grupo, id_materia, id_salon, dia, hora_inicio, hora_fin);
          const [ins] = await db.query(
            `INSERT INTO horario_grupo (id_grupo, id_materia, id_salon, dia, hora_inicio, hora_fin) VALUES (?, ?, ?, ?, ?, ?)`,
            [id_grupo, id_materia, id_salon, dia, hora_inicio, hora_fin]
          );
          inserted.push({ id: ins.insertId, salon: id_salon, grupo: id_grupo });
        }
        return res.json({ message: 'Importación directa completada', inserted });
      }

      // Else, convert to expected format
    } else if (!data || Object.keys(data).length === 0) {
      // intentar leer fichero
      const filePath = path.join(process.cwd(), EXPORT_FILE_RELATIVE);
      if (!fs.existsSync(filePath)) {
        return res.status(400).json({ error: 'No se recibió datos y no se encontró el archivo de exportación en el servidor' });
      }
      const content = fs.readFileSync(filePath, 'utf8');
      data = JSON.parse(content);
    }

    if (!data || !data.salones) return res.status(400).json({ error: 'JSON inválido: falta clave "salones"' });

    // Procesar cada salón
    const salonesCreated = [];
    const horariosInserted = [];
    for (const [salonNombre, entradas] of Object.entries(data.salones)) {
      console.log('Processing salon:', salonNombre, 'with', entradas.length, 'entries');
      const id_salon = await ensureSalon(salonNombre);
      if (!id_salon) continue;
      salonesCreated.push(salonNombre);

      for (const entrada of entradas) {
        const { materia, profesor, hora, dia = 'Lunes' } = entrada;
        if (!materia || !hora) continue;

        // Parsear hora: asumir formato "08:00 - 10:00"
        const horaMatch = hora.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
        if (!horaMatch) continue;
        const hora_inicio = horaMatch[1] + ':00';
        const hora_fin = horaMatch[2] + ':00';

        const id_profesor = await ensureProfesor(profesor);
        const id_materia = await ensureMateria(materia, id_profesor);
        const id_grupo = await ensureGrupo(id_materia);

        // Verificar colisión
        const [collision] = await db.query(
          `SELECT COUNT(*) AS cnt FROM horario_grupo WHERE id_salon = ? AND dia = ? AND NOT (hora_fin <= ? OR hora_inicio >= ?)`,
          [id_salon, dia, hora_inicio, hora_fin]
        );
        if (collision && collision[0] && collision[0].cnt > 0) {
          console.log('Collision detected, skipping');
          continue;
        }

        // Insertar horario
        const [ins] = await db.query(
          `INSERT INTO horario_grupo (id_grupo, id_materia, id_salon, dia, hora_inicio, hora_fin) VALUES (?, ?, ?, ?, ?, ?)`,
          [id_grupo, id_materia, id_salon, dia, hora_inicio, hora_fin]
        );
        horariosInserted.push({ id: ins.insertId, salon: salonNombre, materia, profesor, hora, dia });
      }
    }

    return res.json({ message: 'Importación completada', salonesCreated, horariosInserted });
  } catch (err) {
    console.error('Error importando horarios:', err);
    return res.status(500).json({ error: 'Error interno al importar horarios' });
  }
};
