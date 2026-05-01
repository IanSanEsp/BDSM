import express from "express";
import { registrarAusencia, listarAusencias } from "../controllers/ausenciasController.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

router.post("/", requireAuth, registrarAusencia);

// Listar incidencias
router.get("/", requireAuth, listarAusencias);

export default router;
