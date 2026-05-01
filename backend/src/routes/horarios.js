import express from "express";
import {
	crearHorario,
	listarHorarios,
	actualizarHorario,
	eliminarHorario,
	buscarPorBloque,
	reasignarSalon,
	adelantarClase,
	tablaDinamicaPorFecha
} from "../controllers/horariosController.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

// Horarios base tabla robusta
router.get("/", listarHorarios);
router.post("/", requireAuth, requireAdmin, crearHorario);
router.put("/:id", requireAuth, requireAdmin, actualizarHorario); 
router.delete("/:id", requireAuth, requireAdmin, eliminarHorario);


router.get("/por-bloque", buscarPorBloque);

// Operación del horario dinámico
router.post("/:id/reasignar-salon", requireAuth, requireAdmin, reasignarSalon);
router.post("/:id/adelantar-clase", requireAuth, requireAdmin, adelantarClase);
router.get("/tabla-dinamica", requireAuth, tablaDinamicaPorFecha);

export default router;
