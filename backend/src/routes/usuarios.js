import express from "express";
import { obtenerUsuarios, registrarUsuario, loginUsuario } from "../controllers/usuariosController.js";

const router = express.Router();

router.get("/", obtenerUsuarios);
router.post("/registrar", registrarUsuario);
router.post("/login", loginUsuario);

export default router;
