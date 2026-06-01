import { consultarGemini } from './geminiService.js';

function formatTime(t) {
  if (!t) return '';
  return String(t).substring(0, 5);
}

function horarioGrupoTemplate(data) {
  if (!data || data.length === 0) return 'No encontré horarios para ese grupo.';

  const grupo = data[0].nombre_grupo;
  let res = `📋 *Horario del grupo ${grupo} (${data[0].semestre}° semestre):*\n\n`;

  const porDia = {};
  for (const h of data) {
    if (!porDia[h.dia]) porDia[h.dia] = [];
    porDia[h.dia].push(h);
  }

  const orden = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes'];
  for (const dia of orden) {
    if (!porDia[dia]) continue;
    res += `*${dia}:*\n`;
    for (const h of porDia[dia]) {
      res += `  ${formatTime(h.hora_inicio)}-${formatTime(h.hora_fin)} | ${h.nombre_materia} | ${h.nombre_profesor}`;
      if (h.nombre_salon) res += ` | Salón ${h.nombre_salon} (Piso ${h.piso})`;
      if (h.nombre_auxiliar) res += ` | Aux: ${h.nombre_auxiliar}`;
      res += '\n';
    }
    res += '\n';
  }

  return res;
}

function horarioProfesorTemplate(data) {
  if (!data || data.length === 0) return 'No encontré horarios para ese profesor.';

  const profesor = data[0].nombre_profesor;
  let res = `📋 *Horario del profesor ${profesor}:*\n\n`;

  const porDia = {};
  for (const h of data) {
    if (!porDia[h.dia]) porDia[h.dia] = [];
    porDia[h.dia].push(h);
  }

  const orden = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes'];
  for (const dia of orden) {
    if (!porDia[dia]) continue;
    res += `*${dia}:*\n`;
    for (const h of porDia[dia]) {
      res += `  ${formatTime(h.hora_inicio)}-${formatTime(h.hora_fin)} | ${h.nombre_materia} | ${h.nombre_grupo} | Salón ${h.nombre_salon} (Piso ${h.piso})\n`;
    }
    res += '\n';
  }

  return res;
}

function horarioSalonTemplate(data) {
  if (!data || data.length === 0) return 'No encontré ocupación para ese salón.';

  const salon = data[0].nombre_salon;
  let res = `📋 *Ocupación del ${salon}:*\n\n`;

  const orden = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes'];
  for (const dia of orden) {
    const clases = data.filter(h => h.dia === dia);
    if (clases.length === 0) continue;
    res += `*${dia}:*\n`;
    for (const h of clases) {
      res += `  ${formatTime(h.hora_inicio)}-${formatTime(h.hora_fin)} | ${h.nombre_grupo} | ${h.nombre_materia} | ${h.nombre_profesor}\n`;
    }
    res += '\n';
  }

  return res;
}

function disponibilidadTemplate(data) {
  if (!data.disponibles || data.disponibles.length === 0) {
    return 'No hay salones disponibles en este momento.';
  }

  let res = `Salones disponibles ahora (${data.dia}, bloque ${data.bloqueActual}):*\n\n`;

  const porPiso = {};
  for (const s of data.disponibles) {
    const p = s.piso !== undefined && s.piso !== null ? `Piso ${s.piso}` : 'Sin piso';
    if (!porPiso[p]) porPiso[p] = [];
    porPiso[p].push(s);
  }

  for (const [piso, salones] of Object.entries(porPiso)) {
    res += `*${piso}:* `;
    res += salones.map(s => s.nombre_salon).join(', ');
    res += '\n';
  }

  res += `\nTotal: ${data.disponibles.length} salones disponibles`;
  return res;
}

function bloqueHorarioTemplate(data, bloque, dia) {
  if (!data || data.length === 0) {
    return `En el bloque ${bloque} del ${dia} no hay clases registradas.`;
  }

  let res = `📋 *Bloque ${bloque} - ${dia}:*\n\n`;
  for (const h of data) {
    res += `• Salón ${h.nombre_salon}: ${h.nombre_grupo} - ${h.nombre_materia} (${h.nombre_profesor})\n`;
  }
  return res;
}

function ocupacionPisoTemplate(data) {
  if (!data) return 'Piso no válido.';

  let res = `📊 *Ocupación del Piso ${data.piso === 0 ? 'L (Planta Baja)' : data.piso}*\n`;
  res += `${data.dia}, bloque ${data.bloqueActual}\n\n`;
  res += `Total de salones: ${data.total}\n`;
  res += `Disponibles: ${data.disponibles}\n`;
  res += `Ocupados: ${data.ocupados}\n\n`;

  if (data.detalle) {
    const ocupadosNow = data.detalle.filter(d => d.ocupadoPor);
    if (ocupadosNow.length > 0) {
      res += '*Ocupados ahora:*\n';
      for (const d of ocupadosNow) {
        res += `  - ${d.nombre_salon}: ${d.ocupadoPor.nombre_grupo} - ${d.ocupadoPor.nombre_materia} (${d.ocupadoPor.nombre_profesor})\n`;
      }
    }

    const disponiblesList = data.detalle.filter(d => !d.ocupadoPor && d.estado === 'Disponible');
    if (disponiblesList.length > 0) {
      res += `\n*Disponibles:* ${disponiblesList.map(d => d.nombre_salon).join(', ')}\n`;
    }
  }

  return res;
}

function incidenciasTemplate(data, fecha) {
  if (!data || data.length === 0) {
    return `No hay incidencias registradas para el ${fecha || 'día de hoy'}.`;
  }

  let res = `Incidencias del ${fecha || 'día de hoy'}:*\n\n`;
  for (const inc of data) {
    res += `• ${formatTime(inc.hora)} | ${inc.nombre_profesor} | ${inc.nombre_grupo}\n`;
    res += `  Acción: ${inc.accion_tomada}\n\n`;
  }
  res += `Total: ${data.length} incidencia(s)`;
  return res;
}

function sugerirSalonesTemplate(data, grupo) {
  if (!data.disponibles || data.disponibles.length === 0) {
    return 'No hay salones disponibles para reasignación en este momento.';
  }

  let res = `Salones sugeridos para reasignación${grupo ? ` (grupo ${grupo})` : ''}:*\n\n`;

  const porPiso = {};
  for (const s of data.disponibles.slice(0, 15)) {
    const p = s.piso !== undefined && s.piso !== null ? `Piso ${s.piso}` : 'Sin piso';
    if (!porPiso[p]) porPiso[p] = [];
    porPiso[p].push(` ${s.nombre_salon}`);
  }

  for (const [piso, salones] of Object.entries(porPiso)) {
    res += `*${piso}:*${salones.join(',')}\n`;
  }

  res += `\n${data.disponibles.length} opciones disponibles`;
  return res;
}

const SYSTEM_INSTRUCTION = `Eres sIAmon, un asistente de IA especializado en el sistema BDSM (Batiz Digital Space Manager) del CECyT 9.
Tu funcion es ayudar a los prefectos a consultar informacion sobre horarios, salones, grupos y profesores.
Responde de forma clara y concisa, usando emojis cuando sea apropiado.
Los datos que te proporciono son reales y vienen de la base de datos. NO inventes informacion.
Si te preguntan algo que no esta en los datos, dilo honestamente.`;

export async function formatResponse(intent, data, mensaje, source = 'gemini') {
  const useGemini = process.env.GEMINI_FALLBACK !== 'false' && source !== 'regex';
  let finalSource = 'template';

  if (useGemini) {
    try {
      let dataStr = JSON.stringify(data, null, 2);
      if (dataStr.length > 6000) dataStr = dataStr.substring(0, 6000) + '...';

      const prompt = `Pregunta del usuario: "${mensaje}"

Datos obtenidos de la base de datos:
${dataStr}

Genera una respuesta clara y util para el prefecto basada en estos datos.`;
      const geminiResponse = await consultarGemini(prompt, SYSTEM_INSTRUCTION);
      if (geminiResponse) {
        finalSource = 'gemini';
        return { text: geminiResponse, source: finalSource };
      }
    } catch (err) {
      console.warn('Gemini formatting failed, using template:', err.message);
    }
  }

  const templates = {
    horario_grupo: () => horarioGrupoTemplate(data),
    horario_profesor: () => horarioProfesorTemplate(data),
    horario_salon: () => horarioSalonTemplate(data),
    disponibilidad_salones: () => disponibilidadTemplate(data),
    bloque_horario: () => bloqueHorarioTemplate(data.clases, data.bloque, data.dia),
    ocupacion_piso: () => ocupacionPisoTemplate(data),
    incidencias: () => incidenciasTemplate(data.incidencias, data.fecha),
    sugerir_salones: () => sugerirSalonesTemplate(data, data.grupo)
  };

  const fn = templates[intent];
  if (fn) return { text: fn(), source: finalSource };

  return { text: 'No entendí tu consulta. Intenta preguntar sobre horarios, salones disponibles, ocupación de pisos o incidencias.', source: 'template' };
}
