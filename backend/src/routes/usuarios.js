import express from "express";
import { obtenerUsuarios, registrarUsuario } from "../controllers/usuariosController.js";

const router = express.Router();

router.get("/", obtenerUsuarios);
router.post("/registrar", registrarUsuario);

export default router;
