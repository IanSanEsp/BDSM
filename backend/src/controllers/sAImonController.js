import { db } from "../config/db.js";
import { classifyIntent } from "../services/intentClassifier.js";
import { consultarGemini } from "../services/geminiService.js";
import { buildDatabaseContext } from "../services/databaseContext.js";
import {
  getHorarioGrupo,
  getHorarioProfesor,
  getHorarioSalon,
  getDisponibilidadSalones,
  getBloqueHorario,
  getOcupacionPiso,
  getIncidencias,
  sugerirSalones
} from "../services/dataRetrieval.js";
import { formatResponse } from "../services/responseFormatter.js";

const SYSTEM_PROMPT = `Eres sIAmon, el asistente oficial del sistema BDSM (Batiz Digital Space Manager) del CECyT 9.

Tienes acceso COMPLETO a TODOS los datos de la base de datos en tiempo real:
- Grupos, salones, materias, profesores, usuarios y prefectos
- Horario fijo COMPLETO (todos los dias de la semana)
- Horario dinamico (cambios en tiempo real como reasignaciones y adelantos)
- Incidencias (ausencias de profesores y acciones tomadas)
- Ocupacion actual de salones por piso
- Analisis de grupos sin salon y pisos sin prefecto

REGLAS IMPORTANTES:
1. Los datos que te doy en el contexto son REALES y COMPLETOS de la BD.
2. Busca en los datos y responde basandote en lo que encuentres.
3. NO digas que no tienes acceso a algo que SI esta en los datos.
4. NO inventes informacion. Si no encuentras la respuesta, dilo honestamente.
5. Usa los campos "analisis" y "catalogos" para responder preguntas especificas.
6. Responde en español, claro y conciso. Usa *asteriscos* para negritas.`;

let contextCache = null;
let contextCacheTime = 0;
const CACHE_TTL = 30000; // 30 segundazos

async function getCachedContext() {
  const now = Date.now();
  if (contextCache && (now - contextCacheTime) < CACHE_TTL) {
    return contextCache;
  }
  contextCache = await buildDatabaseContext();
  contextCacheTime = now;
  return contextCache;
}

function generateSessionId() {
  return 'ses_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
}

export const consultar = async (req, res) => {
  try {
    const { mensaje, sesion_id: sid } = req.body || {};
    if (!mensaje || !String(mensaje).trim()) {
      return res.status(400).json({ error: 'El mensaje es requerido' });
    }

    const sesionId = sid || generateSessionId();
    const userId = req.user?.sub || null;
    const mensajeTrim = mensaje.trim();

    let respuesta = '';
    let resSource = 'template';
    let intent = 'desconocido';

    const tryGemini = process.env.GEMINI_FALLBACK !== 'false' && process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'test';

    if (tryGemini) {
      try {
        const context = await getCachedContext();
        const contextStr = JSON.stringify(context);
        const maxLen = 80000;
        const trimmedContext = contextStr.length > maxLen ? contextStr.substring(0, maxLen) : contextStr;

        const prompt = `Contexto COMPLETO del sistema BDSM:\n${trimmedContext}\n\nPregunta del usuario: "${mensajeTrim}"\n\nRevisa TODA la informacion en el contexto (catalogos, horarios, ocupacion_actual, analisis, incidencias) para responder. Busca en los arrays y objetos. Usa SOLO los datos proporcionados.`;

        respuesta = await consultarGemini(prompt, SYSTEM_PROMPT);
        resSource = 'gemini';
        intent = 'contexto_completo';
      } catch (err) {
        console.log(`[sIAmon] Gemini fallback: ${err.message}`);
      }
    }

    if (!respuesta) {
      const { intent: clsIntent, entities, source } = await classifyIntent(mensajeTrim);
      intent = clsIntent;
      let data = null;

      switch (intent) {
        case 'horario_grupo': {
          const grupo = entities?.grupo || mensajeTrim;
          data = await getHorarioGrupo(grupo);
          break;
        }
        case 'horario_profesor': {
          const profesor = entities?.profesor || mensajeTrim;
          data = await getHorarioProfesor(profesor);
          break;
        }
        case 'horario_salon': {
          const salon = entities?.salon || mensajeTrim;
          data = await getHorarioSalon(salon);
          break;
        }
        case 'disponibilidad_salones': {
          const piso = entities?.piso || null;
          data = await getDisponibilidadSalones(piso);
          break;
        }
        case 'bloque_horario': {
          const bloque = parseInt(entities?.bloque, 10) || null;
          const dia = entities?.dia || null;
          const clases = bloque ? await getBloqueHorario(bloque, dia) : [];
          data = { clases, bloque, dia };
          break;
        }
        case 'ocupacion_piso': {
          const piso = entities?.piso;
          data = piso ? await getOcupacionPiso(piso) : null;
          break;
        }
        case 'incidencias': {
          const hoy = new Date();
          const fecha = entities?.fecha || hoy.toISOString().split('T')[0];
          const incidencias = await getIncidencias(fecha);
          data = { incidencias, fecha };
          break;
        }
        case 'sugerir_salones': {
          const grupo = entities?.grupo || null;
          const disponibles = await sugerirSalones(grupo);
          data = { ...disponibles, grupo };
          break;
        }
        default: {
          data = { mensaje_original: mensajeTrim, mensaje: 'No entendi la consulta. Pregunta sobre horarios, salones, grupos, profesores o incidencias.' };
          break;
        }
      }

      const fmt = await formatResponse(intent, data, mensajeTrim, source);
      respuesta = fmt.text;
      resSource = fmt.source;
    }

    try {
      await db.query(
        `INSERT INTO Consultas_IA (id_usuario, sesion_id, pregunta, respuesta, intento)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, sesionId, mensajeTrim, respuesta, intent]
      );
    } catch (err) {
      console.warn('No se pudo guardar historial de IA:', err.message);
    }

    return res.json({ respuesta, intent, sesion_id: sesionId, source: resSource });
  } catch (err) {
    console.error('Error en sAImon consulta:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

export const listarHistorial = async (req, res) => {
  try {
    const userId = req.user?.sub;
    const { sesion_id } = req.query || {};

    let sql = `SELECT id_consulta, sesion_id, pregunta, respuesta, intento, created_at
      FROM Consultas_IA WHERE id_usuario = ?`;
    const params = [userId];

    if (sesion_id) {
      sql += ' AND sesion_id = ?';
      params.push(sesion_id);
    }

    sql += ' ORDER BY created_at DESC LIMIT 50';
    const [rows] = await db.query(sql, params);
    return res.json({ historial: rows });
  } catch (err) {
    console.error('Error al listar historial IA:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

export const listarSesiones = async (req, res) => {
  try {
    const userId = req.user?.sub;
    const [rows] = await db.query(`
      SELECT sesion_id, MIN(pregunta) AS primer_mensaje,
             MAX(created_at) AS ultimo_mensaje,
             COUNT(*) AS total_mensajes
      FROM Consultas_IA
      WHERE id_usuario = ?
      GROUP BY sesion_id
      ORDER BY ultimo_mensaje DESC LIMIT 20
    `, [userId]);

    return res.json({ sesiones: rows });
  } catch (err) {
    console.error('Error al listar sesiones IA:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

export const eliminarHistorial = async (req, res) => {
  try {
    const userId = req.user?.sub;
    const { sesion_id } = req.params || {};

    if (sesion_id) {
      await db.query('DELETE FROM Consultas_IA WHERE sesion_id = ? AND id_usuario = ?', [sesion_id, userId]);
    } else {
      await db.query('DELETE FROM Consultas_IA WHERE id_usuario = ?', [userId]);
    }

    return res.json({ message: 'Historial eliminado' });
  } catch (err) {
    console.error('Error al eliminar historial IA:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};
