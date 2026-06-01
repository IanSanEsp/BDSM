import { db } from "../config/db.js";

function hoyMX() {
  const ahora = new Date();
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
}

function getBloqueActual() {
  const ahora = new Date();
  const totalMin = ahora.getHours() * 60 + ahora.getMinutes();
  const bloques = [
    [1,'07:00','07:50'],[2,'07:50','08:40'],[3,'08:40','09:30'],[4,'09:30','10:20'],
    [5,'10:20','10:30'],[6,'10:30','11:20'],[7,'11:20','12:10'],[8,'12:10','13:00'],
    [9,'13:00','13:50'],[10,'14:00','14:50'],[11,'14:50','15:40'],[12,'15:40','16:30'],
    [13,'16:30','17:20'],[14,'17:20','18:10'],[15,'18:10','19:00'],[16,'19:00','19:50'],
    [17,'19:50','20:40'],[18,'20:40','20:50']
  ];
  for (const b of bloques) {
    const [hI, mI] = b[1].split(':').map(Number);
    const [hF, mF] = b[2].split(':').map(Number);
    if (totalMin >= hI * 60 + mI && totalMin < hF * 60 + mF) return b[0];
  }
  return null;
}

export async function buildDatabaseContext() {
  const fecha = hoyMX();
  const d = new Date(fecha + 'T06:00:00');
  const dias = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
  const dia = dias[d.getDay()];
  const bloqueActual = getBloqueActual();
  const ahora = new Date();
  const horaActual = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;

  //Consexo catalogo
  const [grupos] = await db.query('SELECT id_grupo, nombre_grupo, semestre, area_estudio, turno FROM Grupos');
  const [materias] = await db.query('SELECT id_materia, nombre_materia, semestre, area_estudio FROM Materias');
  const [tipoSalon] = await db.query('SELECT id_tipo_salon, nombre_tipo_salon FROM tipo_salon');
  const tsMap = Object.fromEntries(tipoSalon.map(t => [t.id_tipo_salon, t.nombre_tipo_salon]));

  const [salones] = await db.query('SELECT id_salon, nombre_salon, piso, tipo_salon, estado FROM Salones');
  const salonesConTipo = salones.map(s => ({
    id_salon: s.id_salon, nombre: s.nombre_salon, piso: s.piso,
    tipo: tsMap[s.tipo_salon] || 'Desconocido', estado: s.estado
  }));

  //Consexo usuarios
  const [usuarios] = await db.query(`
    SELECT u.id_usuarios, u.nombre, u.correo, tu.nombre_tipo AS rol, u.turno, u.id_grupo
    FROM Usuarios u LEFT JOIN tipo_usuario tu ON u.tipo_usuario = tu.id_tipo_usuario
  `);

  //Consexo profesores
  const [profesores] = await db.query(`
    SELECT p.id_profesor, u.nombre AS nombre, u.correo, u.turno,
           p.area_educacion, p.estado_asistencia
    FROM Profesores p JOIN Usuarios u ON p.id_profesor = u.id_usuarios
  `);

  //Consexo prefectos
  const [prefectos] = await db.query(`
    SELECT p.id_prefecto, u.nombre AS nombre, u.correo,
           tp.nombre_tipo_prefecto AS tipo_prefecto, p.piso_asignado
    FROM Prefectos p
    JOIN Usuarios u ON p.id_prefecto = u.id_usuarios
    JOIN tipo_prefecto tp ON p.tipo_prefecto = tp.id_tipo_prefecto
  `);

  //Consexo horario fijo
  const [horarioCompleto] = await db.query(`
    SELECT hf.id_horario_fijo_detalle, hf.dia,
           CAST(hf.hora_inicio AS CHAR) AS hora_inicio,
           CAST(hf.hora_fin AS CHAR) AS hora_fin,
           hf.bloque_horario,
           g.nombre_grupo, g.semestre, g.turno AS turno_grupo,
           m.nombre_materia,
           s.nombre_salon, s.piso,
           u.nombre AS profesor, u2.nombre AS auxiliar
    FROM Horario_Fijo hf
    JOIN horarios h ON hf.id_horario_fijo = h.id_horario_fijo
    JOIN Grupos g ON h.id_grupo = g.id_grupo
    JOIN Materias m ON hf.id_materia = m.id_materia
    JOIN Salones s ON hf.id_salon = s.id_salon
    JOIN Profesores p ON hf.id_profesor = p.id_profesor
    JOIN Usuarios u ON p.id_profesor = u.id_usuarios
    LEFT JOIN Profesores p2 ON hf.id_auxiliar = p2.id_profesor
    LEFT JOIN Usuarios u2 ON p2.id_profesor = u2.id_usuarios
    ORDER BY FIELD(hf.dia,'Lunes','Martes','Miercoles','Jueves','Viernes'), hf.hora_inicio
  `);

  //Consexo horario dinamico
  const [horarioDinamico] = await db.query(`
    SELECT hd.id_horario_dinamico, hd.fecha, hd.dia,
           hd.hora_inicio, hd.hora_fin, hd.bloque_horario,
           hd.motivo_cambio, g.nombre_grupo, s.nombre_salon,
           u.nombre AS autorizado_por
    FROM Horario_Dinamico hd
    JOIN horarios h ON hd.id_horario_fijo = h.id_horario_fijo
    JOIN Grupos g ON h.id_grupo = g.id_grupo
    JOIN Salones s ON hd.id_salon_temporal = s.id_salon
    JOIN Prefectos p ON hd.persona_autoriza = p.id_prefecto
    JOIN Usuarios u ON p.id_prefecto = u.id_usuarios
    ORDER BY hd.fecha DESC
  `);

  //Consexo incidencias
  const [incidencias] = await db.query(`
    SELECT i.id_ausencia, i.fecha, CAST(i.hora AS CHAR) AS hora,
           u.nombre AS profesor, g.nombre_grupo, i.accion_tomada
    FROM Incidencias i
    JOIN Profesores p ON i.id_profesor = p.id_profesor
    JOIN Usuarios u ON p.id_profesor = u.id_usuarios
    JOIN Grupos g ON i.id_grupo = g.id_grupo
    ORDER BY i.fecha DESC, i.hora DESC
  `);

  //Consexo filtrado para el hoy
  const horarioHoy = horarioCompleto.filter(h => h.dia === dia);

  //Ocupacion
  const ocupadosAhora = horarioHoy.filter(h => h.bloque_horario === bloqueActual);
  const salonesOcupadosIds = new Set(ocupadosAhora.map(h => h.nombre_salon));
  const salonesOcupados = ocupadosAhora.map(h => ({
    salon: h.nombre_salon, grupo: h.nombre_grupo,
    materia: h.nombre_materia, profesor: h.profesor,
    horario: `${h.hora_inicio?.substring(0,5)}-${h.hora_fin?.substring(0,5)}`
  }));

  //Gpos sin salones
  const gruposConSalon = new Set(horarioCompleto.map(h => h.nombre_grupo));
  const gruposSinSalon = grupos.filter(g => !gruposConSalon.has(g.nombre_grupo));

  //Pisos sin prefecto
  const pisosConPrefecto = new Set(
    prefectos.filter(p => p.piso_asignado !== null).map(p => p.piso_asignado)
  );

  return {
    sistema: {
      nombre: "BDSM (Batiz Digital Space Manager)",
      institucion: "CECyT 9 'Juan de Dios Batiz'",
      descripcion: "Sistema de gestion de horarios, salones, grupos y profesores. "
        + "Los prefectos generales administran todo el plantel. "
        + "Los prefectos de piso gestionan un piso asignado. "
        + "El horario fijo (tabla robusta) son los horarios base del semestre. "
        + "El horario dinamico registra cambios en tiempo real (reasignaciones, adelantos). "
        + "Las incidencias registran ausencias de profesores y acciones tomadas.",
      pisos_disponibles: [0, 1, 2, 3],
      piso_0_nombre: "Planta Baja (L)",
    },
    ahora: {
      fecha: fecha, dia_semana: dia, hora: horaActual,
      bloque_actual: bloqueActual,
      es_fin_de_semana: dia === 'Sabado' || dia === 'Domingo'
    },
    resumen: {
      total_grupos: grupos.length,
      total_salones: salones.length,
      total_profesores: profesores.length,
      total_materias: materias.length,
      total_usuarios: usuarios.length,
      total_horarios_fijos: horarioCompleto.length,
      total_incidencias: incidencias.length,
      total_prefectos: prefectos.length,
      prefectos_de_piso_asignados: prefectos.filter(p => p.piso_asignado !== null).length,
      salones_ocupados_ahora: salonesOcupados.length,
      grupos_sin_salon_en_horario: gruposSinSalon.length
    },
    catalogos: {
      grupos: grupos.map(g => ({
        id: g.id_grupo, nombre: g.nombre_grupo,
        semestre: g.semestre, area: g.area_estudio, turno: g.turno
      })),
      salones: salonesConTipo,
      materias: materias.map(m => ({
        id: m.id_materia, nombre: m.nombre_materia,
        semestre: m.semestre, area: m.area_estudio
      })),
      profesores: profesores.map(p => ({
        id: p.id_profesor, nombre: p.nombre, turno: p.turno,
        area: p.area_educacion, estado: p.estado_asistencia
      })),
      usuarios: usuarios.map(u => ({
        id: u.id_usuarios, nombre: u.nombre, correo: u.correo,
        rol: u.rol, turno: u.turno
      })),
      prefectos: prefectos.map(p => ({
        nombre: p.nombre, tipo: p.tipo_prefecto, piso_asignado: p.piso_asignado
      }))
    },
    horarios: {
      horario_hoy: horarioHoy.map(h => ({
        dia: h.dia, hora_inicio: h.hora_inicio?.substring(0,5),
        hora_fin: h.hora_fin?.substring(0,5), bloque: h.bloque_horario,
        grupo: h.nombre_grupo, semestre: h.semestre,
        materia: h.nombre_materia,
        salon: h.nombre_salon, piso: h.piso,
        profesor: h.profesor, auxiliar: h.auxiliar
      })),
      horario_completo: horarioCompleto.map(h => ({
        dia: h.dia, hora_inicio: h.hora_inicio?.substring(0,5),
        hora_fin: h.hora_fin?.substring(0,5), bloque: h.bloque_horario,
        grupo: h.nombre_grupo, materia: h.nombre_materia,
        salon: h.nombre_salon, piso: h.piso,
        profesor: h.profesor
      })),
      cambios_dinamicos: horarioDinamico.map(h => ({
        fecha: h.fecha, dia: h.dia, grupo: h.nombre_grupo,
        salon_temporal: h.nombre_salon, motivo: h.motivo_cambio,
        autorizado_por: h.autorizado_por
      }))
    },
    ocupacion_actual: {
      salones_ocupados_ahora: salonesOcupados,
      cantidad_ocupados: salonesOcupados.length,
      cantidad_disponibles: salones.length - salonesOcupados.length,
      // agrupado piso
      por_piso: [0, 1, 2, 3].map(piso => {
        const salonesPiso = salonesConTipo.filter(s => s.piso === piso);
        const ocupados = salonesOcupados.filter(s => {
          const salon = salonesPiso.find(sp => sp.nombre === s.salon);
          return salon;
        });
        return {
          piso: piso,
          total_salones: salonesPiso.length,
          ocupados_ahora: ocupados.length,
          disponibles: salonesPiso.length - ocupados.length
        };
      })
    },
    incidencias: incidencias.map(i => ({
      fecha: i.fecha, hora: i.hora?.substring(0,5),
      profesor: i.profesor, grupo: i.nombre_grupo, accion: i.accion_tomada
    })),
    analisis: {
      grupos_sin_salon_en_horario: gruposSinSalon.map(g => ({
        nombre: g.nombre_grupo, semestre: g.semestre, area: g.area_estudio, turno: g.turno
      })),
      pisos_sin_prefecto_asignado: [0, 1, 2, 3]
        .filter(p => !pisosConPrefecto.has(p))
        .map(p => ({ piso: p, nombre: p === 0 ? 'Planta Baja' : `Piso ${p}` })),
    }
  };
}
