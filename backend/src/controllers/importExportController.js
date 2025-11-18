import fs from "fs";
import path from "path";
import crypto from "crypto";
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

async function ensureProfesor(nombreCompleto) {
  // nombreCompleto puede ser 'Ramírez' o 'Juan Ramírez'
  if (!nombreCompleto) {
    const [rows] = await db.query('SELECT id_profesor FROM profesor LIMIT 1');
    if (rows && rows.length > 0) return rows[0].id_profesor;
    const [ins] = await db.query('INSERT INTO profesor (prof_nombre, prof_appat, prof_apmat) VALUES (?, ?, ?)', ['Desconocido', '-', '-']);
    return ins.insertId;
  }
  const parts = String(nombreCompleto).trim().split(/\s+/);
  let nombre = 'Desconocido', appat = '-', apmat = '-';
  if (parts.length === 1) {
    appat = parts[0];
  } else if (parts.length >= 2) {
    nombre = parts[0];
    appat = parts[parts.length - 1];
    if (parts.length > 2) apmat = parts.slice(1, parts.length - 1).join(' ');
  }

  // Intentar buscar un profesor por apellido
  const [found] = await db.query('SELECT id_profesor FROM profesor WHERE prof_appat = ? LIMIT 1', [appat]);
  if (found && found.length > 0) return found[0].id_profesor;

  const [ins] = await db.query('INSERT INTO profesor (prof_nombre, prof_appat, prof_apmat) VALUES (?, ?, ?)', [nombre, appat, apmat]);
  return ins.insertId;
}

export const importHorarios = async (req, res) => {
  try {
    // El JSON puede venir en el body como { salones: {...} } o si no se envia, intentar leer el archivo de Exportacion_datos
    let data = req.body;
    if (!data || Object.keys(data).length === 0) {
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
      // Buscar o crear salón por nombre
      const [sRows] = await db.query('SELECT id_salon FROM salon WHERE nombre = ? LIMIT 1', [salonNombre]);
      let id_salon;
      if (sRows && sRows.length > 0) {
        id_salon = sRows[0].id_salon;
      } else {
        // crear salón con valores por defecto
        const idGen = crypto.randomUUID();
        await db.query('INSERT INTO salon (id_salon, nombre, piso, tipo, estado) VALUES (?, ?, ?, ?, ?)', [idGen, salonNombre, '1', 'Aula', 'Disponible']);
        id_salon = idGen;
        salonesCreated.push(salonNombre);
      }

      if (!Array.isArray(entradas)) continue;

      for (const e of entradas) {
        const materiaNombre = e.materia || 'SinAsignar';
        const profesorNombre = e.profesor || e.profesor || null;
        const hora = e.hora || null; // ejemplo "8:00 - 9:00"

        // asegurar profesor
        const id_profesor = await ensureProfesor(profesorNombre);

        // buscar o crear materia
        const [mRows] = await db.query('SELECT id_materia FROM materia WHERE sig_nombre = ? LIMIT 1', [materiaNombre]);
        let id_materia;
        if (mRows && mRows.length > 0) {
          id_materia = mRows[0].id_materia;
        } else {
          const [insM] = await db.query('INSERT INTO materia (sig_nombre, id_profesor) VALUES (?, ?)', [materiaNombre, id_profesor]);
          id_materia = insM.insertId;
        }

        // buscar o crear grupo (usamos nombre de materia como nombre de grupo si no hay otro dato)
        const grupoNombre = materiaNombre;
        const [gRows] = await db.query('SELECT id_grupo FROM grupo WHERE grupo_nombre = ? LIMIT 1', [grupoNombre]);
        let id_grupo;
        if (gRows && gRows.length > 0) {
          id_grupo = gRows[0].id_grupo;
        } else {
          const [insG] = await db.query('INSERT INTO grupo (grupo_nombre, id_materia) VALUES (?, ?)', [grupoNombre, id_materia]);
          id_grupo = insG.insertId;
        }

        // asegurar mapping grupo_materia
        const [mapRows] = await db.query('SELECT 1 FROM grupo_materia WHERE id_grupo = ? AND id_materia = ? LIMIT 1', [id_grupo, id_materia]);
        if (!mapRows || mapRows.length === 0) {
          await db.query('INSERT INTO grupo_materia (id_grupo, id_materia) VALUES (?, ?)', [id_grupo, id_materia]);
        }

        // parse hora
        let hora_inicio = null;
        let hora_fin = null;
        if (hora && typeof hora === 'string' && hora.includes('-')) {
          const parts = hora.split('-').map(s => s.trim());
          const pad = (t) => {
            if (!t) return null;
            const p = t.split(':');
            return `${String(p[0]).padStart(2,'0')}:${String(p[1]||'00').padStart(2,'0')}:00`;
          };
          hora_inicio = pad(parts[0]);
          hora_fin = pad(parts[1]);
        }

        // por defecto dia Lunes si no se proporciona a nivel global
        const dia = e.dia || 'Lunes';

        // Insertar horario (si existe colisión se omite)
        const [collision] = await db.query(
          `SELECT COUNT(*) AS cnt FROM horario_grupo WHERE id_salon = ? AND dia = ? AND NOT (hora_fin <= ? OR hora_inicio >= ?)`,
          [id_salon, dia, hora_inicio || '00:00:00', hora_fin || '00:00:00']
        );
        if (collision && collision[0] && collision[0].cnt > 0) {
          // saltar si colisión
          continue;
        }

        const [insH] = await db.query(
          `INSERT INTO horario_grupo (id_grupo, id_materia, id_salon, dia, hora_inicio, hora_fin) VALUES (?, ?, ?, ?, ?, ?)`,
          [id_grupo, id_materia, id_salon, dia, hora_inicio, hora_fin]
        );
        horariosInserted.push({ id: insH.insertId, salon: salonNombre, materia: materiaNombre });
      }
    }

    return res.json({ message: 'Importación completada', salonesCreated, horariosInserted });
  } catch (err) {
    console.error('Error importando horarios:', err);
    return res.status(500).json({ error: 'Error interno al importar horarios' });
  }
};
