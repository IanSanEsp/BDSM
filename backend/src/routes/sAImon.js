import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  consultar,
  listarHistorial,
  listarSesiones,
  eliminarHistorial
} from "../controllers/sAImonController.js";

const router = Router();

router.post("/consulta", requireAuth, consultar);
router.get("/historial", requireAuth, listarHistorial);
router.get("/sesiones", requireAuth, listarSesiones);
router.delete("/historial/:sesion_id", requireAuth, eliminarHistorial);

export default router;
