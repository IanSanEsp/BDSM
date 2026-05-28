import express from "express";
import {
	obtenerUsuarios,
	registrarUsuario,
	loginUsuario,
	registrarAdmin,
	actualizarUsuario,
	actualizarMiPerfil,
	eliminarUsuario,
	asignarPrefectoPiso
} from "../controllers/usuariosController.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

// Listar usuarios: solo Prefecto General
router.get("/", requireAuth, requireAdmin, obtenerUsuarios);

// Registro general: SOLO Prefecto General (nadie sin token crea cuentas)
router.post("/registrar", requireAuth, requireAdmin, registrarUsuario);

// Registro explícito de Prefecto General (solo admin existente)
router.post("/admin/registrar", requireAuth, requireAdmin, registrarAdmin);

// Login
router.post("/login", loginUsuario);

// Perfil propio: cualquier autenticado puede editar su nombre/correo/turno
router.put("/me", requireAuth, actualizarMiPerfil);

// Actualizar y eliminar usuario solo Prefecto General
router.put("/:id", requireAuth, requireAdmin, actualizarUsuario);
router.delete("/:id", requireAuth, requireAdmin, eliminarUsuario);

// Asignar prefecto de piso
router.post("/:id/asignar-piso", requireAuth, requireAdmin, asignarPrefectoPiso);

export default router;
