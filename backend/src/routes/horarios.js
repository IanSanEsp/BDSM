import express from "express";
import {
	crearHorario,
	listarHorarios,
	listarProfesoresCatalogo,
	listarMateriasCatalogo,
	actualizarHorario,
	eliminarHorario,
	eliminarTodosHorarios,
	buscarPorBloque,
	reasignarSalon,
	adelantarClase,
	tablaDinamicaPorFecha
} from "../controllers/horariosController.js";
import { requireAuth, requireAdmin, requirePrefecto } from "../middleware/auth.js";

const router = express.Router();

// Horarios base tabla robusta
router.get("/", listarHorarios);
router.get("/profesores", listarProfesoresCatalogo);
router.get("/materias", listarMateriasCatalogo);
router.post("/", requireAuth, requireAdmin, crearHorario);
router.put("/:id", requireAuth, requireAdmin, actualizarHorario); 

// Eliminar TODOS los horarios (requiere prefecto) — DEBE ir antes de /:id
router.delete("/todos", requireAuth, requirePrefecto, eliminarTodosHorarios);
router.delete("/:id", requireAuth, requireAdmin, eliminarHorario);

router.get("/por-bloque", buscarPorBloque);

// Operación del horario dinámico
router.post("/:id/reasignar-salon", requireAuth, requirePrefecto, reasignarSalon);
router.post("/:id/adelantar-clase", requireAuth, requirePrefecto, adelantarClase);
router.get("/tabla-dinamica", requireAuth, tablaDinamicaPorFecha);

export default router;
