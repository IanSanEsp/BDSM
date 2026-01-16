import express from "express";
import { crearSalon, listarSalones, actualizarSalon, eliminarSalon } from "../controllers/salonesController.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

// Salones (admin)
router.get("/", listarSalones); // TEMP: sin auth para testing
router.post("/", requireAuth, requireAdmin, crearSalon);
router.put("/:id", requireAuth, requireAdmin, actualizarSalon);
router.delete("/:id", requireAuth, requireAdmin, eliminarSalon);

export default router;
