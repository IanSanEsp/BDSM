import fs from "fs";
import path from "path";
import crypto from "crypto";
import xlsx from "xlsx";
import { db } from "../config/db.js";

const EXPORT_FILE_RELATIVE = path.join('..', '..', 'Exportacion_datos', 'Exportacion_datos', 'horarios.json');

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

          console.log('Inserting', id_grupo, id_materia, id_salon, dia, hora_inicio, hora_fin);
          // const [ins] = await db.query(
          //   `INSERT INTO horario_grupo (id_grupo, id_materia, id_salon, dia, hora_inicio, hora_fin) VALUES (?, ?, ?, ?, ?, ?)`,
          //   [id_grupo, id_materia, id_salon, dia, hora_inicio, hora_fin]
          // );
          // inserted.push({ id: ins.insertId, salon: id_salon, grupo: id_grupo });
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
