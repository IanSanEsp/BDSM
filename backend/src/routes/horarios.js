import express from "express";
import { crearHorario, listarHorarios, eliminarHorario, buscarPorBloque, asignarSalon, desasignarSalon } from "../controllers/horariosController.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

router.get("/", listarHorarios);
router.post("/", requireAuth, requireAdmin, crearHorario);
router.delete("/:id", requireAuth, requireAdmin, eliminarHorario);
router.get("/por-bloque", buscarPorBloque);
router.post("/:id/asignar-salon", requireAuth, requireAdmin, asignarSalon);
router.post("/:id/desasignar-salon", requireAuth, requireAdmin, desasignarSalon);

export default router;
