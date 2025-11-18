import cors from "cors";
import express from "express";
import dotenv from "dotenv";
import path from "path";
import { db } from "./config/db.js";
import usuarioRoutes from "./routes/usuarios.js";
import salonRoutes from "./routes/salones.js";
import horarioRoutes from "./routes/horarios.js";
import importExportRoutes from "./routes/importExport.js";

dotenv.config();
const app = express();

// Configuracion CORS
app.use(cors({
  origin: [
    "https://bdsm-seven.vercel.app",     // dominio vercel
    "http://localhost:5500",              // Live Server (localhost)
    "http://127.0.0.1:5500"               // Live Server (127.0.0.1)
  ],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

app.use(express.json());
app.use("/api/usuarios", usuarioRoutes);
app.use("/api/salones", salonRoutes);
app.use("/api/horarios", horarioRoutes);
app.use("/api/data", importExportRoutes);

app.get("/", (req, res) => {
  res.send("API BDSM funcionando");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
