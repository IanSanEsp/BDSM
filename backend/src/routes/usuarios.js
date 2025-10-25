import express from "express";
import { obtenerUsuarios } from "../controllers/usuariosController.js";

const router = express.Router();

router.get("/", obtenerUsuarios);

export default router;
