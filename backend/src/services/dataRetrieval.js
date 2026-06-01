import { db } from "../config/db.js";

function diaDesdeFecha(fecha) {
  if (!fecha || fecha === 'hoy') {
    const ahora = new Date();

    const dias = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
    return dias[ahora.getDay()];
  }
  const d = new Date(fecha);
  const dias = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
  return dias[d.getDay()];
}

function hoyMX() {
  const ahora = new Date();
  return ahora.toISOString().split('T')[0];
}

function horaMX() {
  const ahora = new Date();
  return `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}:00`;
}

const BLOQUES = [
  { bloque: 1, inicio: '07:00', fin: '07:50' },
  { bloque: 2, inicio: '07:50', fin: '08:40' },
  { bloque: 3, inicio: '08:40', fin: '09:30' },
  { bloque: 4, inicio: '09:30', fin: '10:20' },
  { bloque: 5, inicio: '10:20', fin: '10:30' },
  { bloque: 6, inicio: '10:30', fin: '11:20' },
  { bloque: 7, inicio: '11:20', fin: '12:10' },
  { bloque: 8, inicio: '12:10', fin: '13:00' },
  { bloque: 9, inicio: '13:00', fin: '13:50' },
  { bloque: 10, inicio: '14:00', fin: '14:50' },
  { bloque: 11, inicio: '14:50', fin: '15:40' },
  { bloque: 12, inicio: '15:40', fin: '16:30' },
  { bloque: 13, inicio: '16:30', fin: '17:20' },
  { bloque: 14, inicio: '17:20', fin: '18:10' },
  { bloque: 15, inicio: '18:10', fin: '19:00' },
  { bloque: 16, inicio: '19:00', fin: '19:50' },
  { bloque: 17, inicio: '19:50', fin: '20:40' },
  { bloque: 18, inicio: '20:40', fin: '20:50' },
];

function getBloqueActual() {
  const ahora = new Date();
  const h = ahora.getHours();
  const m = ahora.getMinutes();
  const totalMin = h * 60 + m;

  for (const b of BLOQUES) {
    const [hI, mI] = b.inicio.split(':').map(Number);
    const [hF, mF] = b.fin.split(':').map(Number);
    const inicioMin = hI * 60 + mI;
    const finMin = hF * 60 + mF;
    if (totalMin >= inicioMin && totalMin < finMin) return b.bloque;
  }
  return null;
}

function normalizarPiso(valor) {
  if (!valor) return null;
  const v = String(valor).trim().toLowerCase();
  if (v === 'l' || v === 'planta baja' || v === 'baja' || v === '0') return 0;
  const n = parseInt(v, 10);
  if (!isNaN(n) && n >= 0 && n <= 3) return n;
  return null;
}

// Queries por intent

export async function getHorarioGrupo(grupo) {
  const [rows] = await db.query(`
    SELECT hf.id_horario_fijo_detalle, hf.dia, hf.hora_inicio, hf.hora_fin,
           hf.bloque_horario, g.nombre_grupo, g.semestre,
           m.nombre_materia, s.nombre_salon, s.piso,
           u.nombre AS nombre_profesor, u2.nombre AS nombre_auxiliar
    FROM Horario_Fijo hf
    JOIN horarios h ON hf.id_horario_fijo = h.id_horario_fijo
    JOIN Grupos g ON h.id_grupo = g.id_grupo
    JOIN Materias m ON hf.id_materia = m.id_materia
    JOIN Salones s ON hf.id_salon = s.id_salon
    JOIN Profesores p ON hf.id_profesor = p.id_profesor
    JOIN Usuarios u ON p.id_profesor = u.id_usuarios
    LEFT JOIN Profesores p2 ON hf.id_auxiliar = p2.id_profesor
    LEFT JOIN Usuarios u2 ON p2.id_profesor = u2.id_usuarios
    WHERE g.nombre_grupo LIKE ?
    ORDER BY FIELD(hf.dia, 'Lunes','Martes','Miercoles','Jueves','Viernes'), hf.hora_inicio
  `, [`%${grupo}%`]);
  return rows;
}

export async function getHorarioProfesor(profesor) {
  const [rows] = await db.query(`
    SELECT hf.*, g.nombre_grupo, m.nombre_materia, s.nombre_salon, s.piso,
           u.nombre AS nombre_profesor
    FROM Horario_Fijo hf
    JOIN horarios h ON hf.id_horario_fijo = h.id_horario_fijo
    JOIN Grupos g ON h.id_grupo = g.id_grupo
    JOIN Materias m ON hf.id_materia = m.id_materia
    JOIN Salones s ON hf.id_salon = s.id_salon
    JOIN Profesores p ON hf.id_profesor = p.id_profesor
    JOIN Usuarios u ON p.id_profesor = u.id_usuarios
    WHERE u.nombre LIKE ?
    ORDER BY FIELD(hf.dia, 'Lunes','Martes','Miercoles','Jueves','Viernes'), hf.hora_inicio
  `, [`%${profesor}%`]);
  return rows;
}

export async function getHorarioSalon(salon) {
  const [rows] = await db.query(`
    SELECT hf.*, g.nombre_grupo, m.nombre_materia, s.nombre_salon, s.piso,
           u.nombre AS nombre_profesor
    FROM Horario_Fijo hf
    JOIN horarios h ON hf.id_horario_fijo = h.id_horario_fijo
    JOIN Grupos g ON h.id_grupo = g.id_grupo
    JOIN Materias m ON hf.id_materia = m.id_materia
    JOIN Salones s ON hf.id_salon = s.id_salon
    JOIN Profesores p ON hf.id_profesor = p.id_profesor
    JOIN Usuarios u ON p.id_profesor = u.id_usuarios
    WHERE s.nombre_salon LIKE ?
    ORDER BY FIELD(hf.dia, 'Lunes','Martes','Miercoles','Jueves','Viernes'), hf.hora_inicio
  `, [`%${salon}%`]);
  return rows;
}

export async function getDisponibilidadSalones(piso = null) {
  const dia = diaDesdeFecha('hoy');
  const bloqueActual = getBloqueActual();

  let sql = `SELECT s.*, ts.nombre_tipo_salon
    FROM Salones s
    LEFT JOIN tipo_salon ts ON s.tipo_salon = ts.id_tipo_salon
    WHERE s.estado = 'Disponible'`;
  const params = [];

  if (piso !== null) {
    const p = normalizarPiso(piso);
    if (p !== null) {
      sql += ' AND s.piso = ?';
      params.push(p);
    }
  }

  const [salones] = await db.query(sql, params);

  const [ocupados] = await db.query(`
    SELECT DISTINCT hf.id_salon FROM Horario_Fijo hf
    WHERE hf.dia = ? AND hf.bloque_horario = ?
  `, [dia, bloqueActual]);

  const idsOcupados = new Set(ocupados.map(r => r.id_salon));
  const disponibles = salones.filter(s => !idsOcupados.has(s.id_salon));

  return { disponibles, total: salones.length, piso, dia, bloqueActual };
}

export async function getBloqueHorario(bloque, dia = null) {
  if (!dia) dia = diaDesdeFecha('hoy');

  const [rows] = await db.query(`
    SELECT hf.*, g.nombre_grupo, m.nombre_materia, s.nombre_salon, s.piso,
           u.nombre AS nombre_profesor
    FROM Horario_Fijo hf
    JOIN horarios h ON hf.id_horario_fijo = h.id_horario_fijo
    JOIN Grupos g ON h.id_grupo = g.id_grupo
    JOIN Materias m ON hf.id_materia = m.id_materia
    JOIN Salones s ON hf.id_salon = s.id_salon
    JOIN Profesores p ON hf.id_profesor = p.id_profesor
    JOIN Usuarios u ON p.id_profesor = u.id_usuarios
    WHERE hf.dia = ? AND hf.bloque_horario = ?
    ORDER BY s.nombre_salon
  `, [dia, bloque]);
  return rows;
}

export async function getOcupacionPiso(piso) {
  const p = normalizarPiso(piso);
  if (p === null) return null;

  const dia = diaDesdeFecha('hoy');
  const bloqueActual = getBloqueActual();

  const [salones] = await db.query(`
    SELECT s.*, ts.nombre_tipo_salon
    FROM Salones s
    LEFT JOIN tipo_salon ts ON s.tipo_salon = ts.id_tipo_salon
    WHERE s.piso = ?
  `, [p]);

  const [ocupados] = await db.query(`
    SELECT hf.id_salon, g.nombre_grupo, m.nombre_materia, u.nombre AS nombre_profesor,
           hf.hora_inicio, hf.hora_fin
    FROM Horario_Fijo hf
    JOIN horarios h ON hf.id_horario_fijo = h.id_horario_fijo
    JOIN Grupos g ON h.id_grupo = g.id_grupo
    JOIN Materias m ON hf.id_materia = m.id_materia
    JOIN Salones s ON hf.id_salon = s.id_salon
    JOIN Profesores p ON hf.id_profesor = p.id_profesor
    JOIN Usuarios u ON p.id_profesor = u.id_usuarios
    WHERE hf.dia = ? AND hf.bloque_horario = ? AND s.piso = ?
  `, [dia, bloqueActual, p]);

  const ocupadosMap = {};
  for (const o of ocupados) {
    ocupadosMap[o.id_salon] = o;
  }

  return {
    piso: p,
    total: salones.length,
    ocupados: ocupados.length,
    disponibles: salones.length - ocupados.length,
    dia,
    bloqueActual,
    detalle: salones.map(s => ({
      ...s,
      ocupadoPor: ocupadosMap[s.id_salon] || null
    }))
  };
}

export async function getIncidencias(fecha = null) {
  if (!fecha) fecha = hoyMX();

  const [rows] = await db.query(`
    SELECT i.*, u.nombre AS nombre_profesor, g.nombre_grupo
    FROM Incidencias i
    JOIN Profesores p ON i.id_profesor = p.id_profesor
    JOIN Usuarios u ON p.id_profesor = u.id_usuarios
    JOIN Grupos g ON i.id_grupo = g.id_grupo
    WHERE i.fecha = ?
    ORDER BY i.hora DESC
  `, [fecha]);
  return rows;
}

export async function sugerirSalones(grupo = null) {
  const dia = diaDesdeFecha('hoy');
  const bloqueActual = getBloqueActual();

  let sqlOcupados = `SELECT DISTINCT hf.id_salon FROM Horario_Fijo hf WHERE hf.dia = ? AND hf.bloque_horario = ?`;
  const paramsOcupados = [dia, bloqueActual];
  const [ocupados] = await db.query(sqlOcupados, paramsOcupados);
  const idsOcupados = new Set(ocupados.map(r => r.id_salon));

  let sqlSalones = `SELECT s.id_salon, s.nombre_salon, s.piso, s.capacidad,
    ts.nombre_tipo_salon FROM Salones s
    LEFT JOIN tipo_salon ts ON s.tipo_salon = ts.id_tipo_salon
    WHERE s.estado != 'En Mantenimiento'`;
  const paramsSalones = [];

  if (grupo) {
    sqlSalones += ` AND s.id_salon NOT IN (
      SELECT hf.id_salon FROM Horario_Fijo hf
      JOIN horarios h ON hf.id_horario_fijo = h.id_horario_fijo
      JOIN Grupos g ON h.id_grupo = g.id_grupo
      WHERE g.nombre_grupo LIKE ? AND hf.dia = ? AND hf.bloque_horario = ?
    )`;
    paramsSalones.push(`%${grupo}%`, dia, bloqueActual);
  }

  const [salones] = await db.query(sqlSalones, paramsSalones);
  const disponibles = salones.filter(s => !idsOcupados.has(s.id_salon));

  return { disponibles, total: disponibles.length, dia, bloqueActual };
}
