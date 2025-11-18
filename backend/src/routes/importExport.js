import express from "express";
import { exportHorarios, importHorarios } from "../controllers/importExportController.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

// Exportar horarios (público)
router.get("/export/horarios", exportHorarios);

// Importar horarios (protegido - admin)
router.post("/import/horarios", requireAuth, requireAdmin, importHorarios);

export default router;
