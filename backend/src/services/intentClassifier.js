import { consultarGemini } from './geminiService.js';

const INTENTS = [
  'horario_grupo',
  'horario_profesor',
  'horario_salon',
  'disponibilidad_salones',
  'bloque_horario',
  'sugerir_salones',
  'ocupacion_piso',
  'incidencias',
  'desconocido'
];

const SYSTEM_PROMPT = `Eres un clasificador de intenciones para el sistema BDSM (Batiz Digital Space Manager).
Debes responder ÚNICAMENTE con un JSON en este formato:
{"intent":"nombre_intent","entities":{...}}

Intents disponibles:
- horario_grupo: preguntar horario de un grupo (ej: "que horario tiene 6IV1?")
- horario_profesor: preguntar horario de un profesor
- horario_salon: preguntar que grupo esta en un salon
- disponibilidad_salones: preguntar salones disponibles/libres
- bloque_horario: preguntar que hay en un bloque horario especifico
- sugerir_salones: recomendar salon para reasignar una clase
- ocupacion_piso: estado general de ocupacion de un piso
- incidencias: preguntar por incidencias/faltas de profesores
- desconocido: no coincide con ninguno anterior

Entities posibles segun el intent:
- grupo: "6IV1", "4IV2", etc
- profesor: nombre del profesor
- salon: numero o nombre del salon
- piso: 1, 2, 3, "L" (planta baja)
- dia: "Lunes", "Martes", etc
- fecha: "2026-04-13" o "hoy"
- bloque: numero de bloque (1-14)
- tiempo: "presente" (ahora) o "futuro" (proximas horas)

NO agregues texto adicional, solo el JSON.`;

const REGEX_RULES = [
  {
    intent: 'horario_grupo',
    patterns: [
      /horario.*(?:del?|de|para)?\s*(?:grup[oó]|sal[oó]n)?\s*(\d+\s*[ivxIVX]+)/i,
      /(?:q[uéé]|que)\s*(?:clases|materias|horario).*(\d+\s*[ivxIVX]+)/i,
      /(\d+\s*[ivxIVX]+).*horario/i,
    ],
    extract: (m) => ({ grupo: m[1].trim() })
  },
  {
    intent: 'horario_profesor',
    patterns: [
      /horario.*(?:d[eu]el?|de)?\s*(?:profesor|profe|maestr[oó]|docente)\s*(?:\s+)?([a-záéíóúñ\s]+?)(?:\s+(?:en|de|del|hoy|mañana|ahora)|$)/i,
      /(?:q[uéé]|que)\s*(?:clases|horario).*(?:profesor|profe|maestr[oó]|docente)\s*(?:\s+)?([a-záéíóúñ\s]+?)(?:\s+(?:en|de|del|hoy|mañana|ahora)|$)/i,
    ],
    extract: (m) => ({ profesor: m[1].trim() })
  },
  {
    intent: 'horario_salon',
    patterns: [
      /(?:q[uéé]|que|qui[eé]n)\s*(?:hay|est[aá]|tiene|ocupa)\s*(?:en|en\s+el|en\s+la)?\s*(?:sal[oó]n)?\s*(\d{2,4}|L\d{2})/i,
      /(?:sal[oó]n|aula)\s*(\d{2,4}|L\d{2}).*(?:horario|qui[eé]n|qu[eé]|clase)/i,
    ],
    extract: (m) => ({ salon: m[1].trim() })
  },
  {
    intent: 'disponibilidad_salones',
    patterns: [
      /(?:salones|aulas|espacios)\s*(?:disponibles|libres|vac[ií]os|sin\s+ocupar)/i,
      /(?:q[uéé]|que)\s*(?:salones|aulas).*(?:disponibles|libres)/i,
      /(?:hay|existen)\s*(?:salones|aulas)\s*(?:disponibles|libres)/i,
    ],
    extract: (m, msg) => {
      const piso = msg.match(/piso\s*(\d+|l|planta\s*baja)/i);
      return { piso: piso ? piso[1].trim() : null };
    }
  },
  {
    intent: 'sugerir_salones',
    patterns: [
      /(?:sugiere|recomienda|qu[eé] salon|what salon|dime.*sal[oó]n).*(?:reasignar|cambiar|mover|asignar)/i,
      /reasignar.*(?:sal[oó]n|clase|grupo)/i,
      /adelantar.*(?:clase|horario|materia)/i,
    ],
    extract: (m, msg) => {
      const grupo = msg.match(/(\d+\s*[ivxIVX]+)/i);
      return { grupo: grupo ? grupo[1].trim() : null };
    }
  },
  {
    intent: 'bloque_horario',
    patterns: [
      /(?:bloque|horario|hora)\s*(\d{1,2})\s*(?:del?)?\s*(?:lunes|martes|mi[eé]rcoles|jueves|viernes)/i,
      /(?:q[uéé]|que)\s*(?:pasa|hay|ocurre|tienen).*(?:bloque|hora)\s*(\d{1,2})/i,
    ],
    extract: (m, msg) => {
      const dia = msg.match(/(lunes|martes|mi[eé]rcoles|jueves|viernes)/i);
      return { bloque: m[1], dia: dia ? dia[1].charAt(0).toUpperCase() + dia[1].slice(1).toLowerCase() : null };
    }
  },
  {
    intent: 'ocupacion_piso',
    patterns: [
      /(?:ocupaci[oó]n|estado|como est[aá])\s*(?:del?)?\s*(?:piso|planta)\s*(\d+|l|baja)/i,
      /(?:c[oó]mo|como)\s*(?:est[aá]|va|anda).*(?:piso|planta)\s*(\d+|l|baja)/i,
    ],
    extract: (m) => ({ piso: m[1].trim() })
  },
  {
    intent: 'incidencias',
    patterns: [
      /(?:incidencias|faltas|ausencias|problemas).*(?:hoy|de hoy|registradas|activas)/i,
      /(?:q[uéé]|que)\s*(?:incidencias|faltas|profesores\s+faltaron)/i,
      /(?:profesor|profe).*(?:ausente|falto|no lleg[oó]|falta)/i,
    ],
    extract: () => ({})
  }
];

function classifyWithRegex(message) {
  const msg = message.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

  for (const rule of REGEX_RULES) {
    for (const pattern of rule.patterns) {
      const match = msg.match(pattern);
      if (match) {
        const entities = rule.extract(match, msg);
        return { intent: rule.intent, entities, source: 'regex' };
      }
    }
  }

  return { intent: 'desconocido', entities: {}, source: 'regex' };
}

export async function classifyIntent(message) {
  const useGemini = process.env.GEMINI_FALLBACK !== 'false';

  if (useGemini) {
    try {
      const raw = await consultarGemini(
        `Mensaje del usuario: "${message}"\n\nClasifica la intencion y extrae entidades.`,
        SYSTEM_PROMPT
      );

      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.intent && INTENTS.includes(parsed.intent)) {
          return {
            intent: parsed.intent,
            entities: parsed.entities || {},
            source: 'gemini'
          };
        }
      }
    } catch (err) {
      console.warn('Gemini classification failed, falling back to regex:', err.message);
    }
  }

  return classifyWithRegex(message);
}
