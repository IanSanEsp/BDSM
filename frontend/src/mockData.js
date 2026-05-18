// Mock data based on the SQL schema provided
// super turbo obsolote, LITERAL ELIMINAR
export const grupos = [
  // 6to Semestre
  { id_grupo: 1, nombre_grupo: '6IV1', semestre: 6, area_estudio: 'Programación', turno: 'Vespertino' },
  { id_grupo: 2, nombre_grupo: '6IV2', semestre: 6, area_estudio: 'Programación', turno: 'Vespertino' },
  { id_grupo: 3, nombre_grupo: '6IV3', semestre: 6, area_estudio: 'Programación', turno: 'Vespertino' },
  // 4to Semestre
  { id_grupo: 10, nombre_grupo: '4IV1', semestre: 4, area_estudio: 'Programación', turno: 'Vespertino' },
  { id_grupo: 11, nombre_grupo: '4IV2', semestre: 4, area_estudio: 'Programación', turno: 'Vespertino' },
  // 2do Semestre
  { id_grupo: 20, nombre_grupo: '2IV1', semestre: 2, area_estudio: 'Tronco Común', turno: 'Vespertino' },
  { id_grupo: 21, nombre_grupo: '2IV2', semestre: 2, area_estudio: 'Tronco Común', turno: 'Vespertino' },
];

export const usuarios = [
  { id_usuarios: 1, nombre: 'Dr. Roberto García', tipo_usuario: 'Profesor', correo: 'roberto@cecyt9.mx', turno: 'Vespertino', piso: '3' },
  { id_usuarios: 2, nombre: 'M. en C. Laura Ruiz', tipo_usuario: 'Profesor', correo: 'laura@cecyt9.mx', turno: 'Vespertino', piso: '2' },
  { id_usuarios: 3, nombre: 'Ing. Carlos Méndez', tipo_usuario: 'Profesor', correo: 'carlos@cecyt9.mx', turno: 'Vespertino', piso: '1' },
  { id_usuarios: 4, nombre: 'Lic. Ana Martínez', tipo_usuario: 'Profesor', correo: 'ana@cecyt9.mx', turno: 'Vespertino', piso: 'L' },
  { id_usuarios: 5, nombre: 'Juan Pérez', tipo_usuario: 'Prefecto General', correo: 'juan@cecyt9.mx', turno: 'Vespertino' },
  { id_usuarios: 6, nombre: 'Pedro López', tipo_usuario: 'Prefecto de Piso', correo: 'pedro@cecyt9.mx', turno: 'Vespertino', piso: '3' },
  { id_usuarios: 7, nombre: 'María Ruiz', tipo_usuario: 'Estudiante', correo: 'maria@cecyt9.mx', turno: 'Vespertino', id_grupo: 1 },
];

export const profesores = [
  { id_profesor: 1, tipo_profesor: 'Titular', materia: 'Probabilidad', estado_asistencia: 'Presente' },
  { id_profesor: 2, tipo_profesor: 'Titular', materia: 'Física IV', estado_asistencia: 'Presente' },
  { id_profesor: 3, tipo_profesor: 'Titular', materia: 'Química IV', estado_asistencia: 'Ausente' },
  { id_profesor: 4, tipo_profesor: 'Titular', materia: 'Desarrollo IV', estado_asistencia: 'Presente' },
];

export const salones = [
  { id_salon: 1, numero_salon: '012', piso: '3', capacidad: 40, tipo: 'Aula', proyector: true, estado: 'Disponible' },
  { id_salon: 2, numero_salon: '013', piso: '3', capacidad: 40, tipo: 'Aula', proyector: true, estado: 'Ocupado' },
  { id_salon: 3, numero_salon: '014', piso: '3', capacidad: 40, tipo: 'Aula', proyector: false, estado: 'Ocupado' },
  { id_salon: 4, numero_salon: '015', piso: '3', capacidad: 30, tipo: 'Laboratorio', proyector: true, estado: 'Provisional' },
  { id_salon: 5, numero_salon: '016', piso: '3', capacidad: 30, tipo: 'Laboratorio', proyector: true, estado: 'Mantenimiento' },
  { id_salon: 6, numero_salon: '101', piso: '1', capacidad: 40, tipo: 'Aula', proyector: true, estado: 'Disponible' },
  { id_salon: 7, numero_salon: '102', piso: '1', capacidad: 40, tipo: 'Aula', proyector: true, estado: 'Ocupado' },
  { id_salon: 8, numero_salon: '201', piso: '2', capacidad: 40, tipo: 'Aula', proyector: true, estado: 'Disponible' },
  { id_salon: 9, numero_salon: 'L01', piso: 'L', capacidad: 40, tipo: 'Aula', proyector: true, estado: 'Disponible' },
];

export const materias = [
  { id_materia: 1, nombre_materia: 'Probabilidad & Estadística', semestre: 6, area_estudio: 'Básica' },
  { id_materia: 2, nombre_materia: 'Física IV', semestre: 6, area_estudio: 'Básica' },
  { id_materia: 3, nombre_materia: 'Química IV', semestre: 6, area_estudio: 'Básica' },
  { id_materia: 4, nombre_materia: 'Desarrollo de Aplicaciones IV', semestre: 6, area_estudio: 'Tecnológica' },
];

export const horario_fijo = [
  // 6IV1
  { id_horario_fijo: 1, id_grupo: 1, id_profesor: 1, id_salon: 1, dia: 'Lunes', hora_inicio: '07:00', hora_fin: '08:50', bloque_horario: 1, id_materia: 1 }, // 2 bloques
  { id_horario_fijo: 2, id_grupo: 1, id_profesor: 2, id_salon: 1, dia: 'Lunes', hora_inicio: '09:00', hora_fin: '09:50', bloque_horario: 3, id_materia: 2 },
  { id_horario_fijo: 8, id_grupo: 1, id_profesor: 3, id_salon: 1, dia: 'Lunes', hora_inicio: '11:00', hora_fin: '13:50', bloque_horario: 5, id_materia: 3 }, // 3 bloques
  
  // 6IV2
  { id_horario_fijo: 3, id_grupo: 2, id_profesor: 2, id_salon: 2, dia: 'Lunes', hora_inicio: '08:00', hora_fin: '09:50', bloque_horario: 2, id_materia: 2 }, // 2 bloques
  { id_horario_fijo: 4, id_grupo: 2, id_profesor: 3, id_salon: 2, dia: 'Lunes', hora_inicio: '11:00', hora_fin: '11:50', bloque_horario: 5, id_materia: 3 },
  
  // 6IV3
  { id_horario_fijo: 5, id_grupo: 3, id_profesor: 4, id_salon: 4, dia: 'Lunes', hora_inicio: '07:00', hora_fin: '07:50', bloque_horario: 1, id_materia: 4 },
  
  // 4IV1
  { id_horario_fijo: 6, id_grupo: 10, id_profesor: 1, id_salon: 3, dia: 'Lunes', hora_inicio: '07:00', hora_fin: '08:50', bloque_horario: 1, id_materia: 1 },
  
  // 2IV1
  { id_horario_fijo: 7, id_grupo: 20, id_profesor: 2, id_salon: 1, dia: 'Lunes', hora_inicio: '10:00', hora_fin: '11:50', bloque_horario: 4, id_materia: 2 },
];

export const horario_dinamico = [
  { 
    id_horario_dinamico: 1, 
    id_horario_fijo: 2, // Física IV 6IV1 (09:00 - 09:50)
    fecha: '2026-04-14', 
    id_salon_temporal: 1, 
    hora_inicio: '07:00', 
    hora_fin: '08:50', // Adelantado y extendido
    motivo_cambio: 'Adelanto de clase por junta académica', 
    bloque_horario: 1, 
    persona_autoriza: 5 
  },
  { 
    id_horario_dinamico: 2, 
    id_horario_fijo: 1, 
    fecha: '2026-04-13', 
    id_salon_temporal: 2, 
    hora_inicio: '08:00', 
    hora_fin: '09:50', 
    motivo_cambio: 'Cambio de salón por mantenimiento', 
    bloque_horario: 2, 
    persona_autoriza: 5 
  }
];

export const ausencias_profesor = [
  { 
    id_ausencia: 1, 
    fecha: '2026-04-14', 
    hora: '11:00', 
    id_profesor: 3, 
    id_grupo: 2, 
    accion_tomada: 'Alumnos en biblioteca' 
  },
  { 
    id_ausencia: 2, 
    fecha: '2026-04-13', 
    hora: '09:00', 
    id_profesor: 1, 
    id_grupo: 1, 
    accion_tomada: 'Clase suspendida' 
  },
  { 
    id_ausencia: 3, 
    fecha: '2026-04-12', 
    hora: '13:00', 
    id_profesor: 2, 
    id_grupo: 3, 
    accion_tomada: 'Trabajo en plataforma' 
  }
];
