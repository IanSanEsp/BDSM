import express from "express";
import { crearSalon, listarSalones } from "../controllers/salonesController.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

// Solo admins (público para pruebas)
router.get("/", listarSalones);
router.post("/", requireAuth, requireAdmin, crearSalon);

export default router;
