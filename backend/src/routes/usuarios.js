import express from "express";
import { obtenerUsuarios, registrarUsuario, loginUsuario, registrarAdmin, actualizarUsuario, eliminarUsuario } from "../controllers/usuariosController.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

router.get("/", requireAuth, requireAdmin, obtenerUsuarios);
router.post("/registrar", registrarUsuario);
router.post("/admin/registrar", requireAuth, requireAdmin, registrarAdmin);
router.post("/login", loginUsuario);
router.put("/:id", requireAuth, requireAdmin, actualizarUsuario);
router.delete("/:id", requireAuth, requireAdmin, eliminarUsuario);

export default router;
