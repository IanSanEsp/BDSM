import cors from "cors";
import express from "express";
import dotenv from "dotenv";
import path from "path";
import { db } from "./config/db.js";
import usuarioRoutes from "./routes/usuarios.js";
import salonRoutes from "./routes/salones.js";
import horarioRoutes from "./routes/horarios.js";
import markerRoutes from "./routes/markers.js";
import importExportRoutes from "./routes/importExport.js";

dotenv.config();
const app = express();

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Configuracion CORS
// CORS: permitir orígenes conocidos y file:// (Origin: null) para desarrollo local
const allowedOrigins = new Set([
  "https://bdsm-seven.vercel.app",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "null"
]);

app.use(cors({
  origin: (origin, callback) => {
    // Allow all if explicitly enabled (useful for quick testing)
    if (String(process.env.CORS_ALLOW_ALL || "").toLowerCase() === "true") {
      return callback(null, true);
    }
    // Same-origin or server-to-server (no origin), allow
    if (!origin) return callback(null, true);
    // Known dev/prod frontends and file:// (origin === 'null')
    if (allowedOrigins.has(origin)) return callback(null, true);
    return callback(null, false);
  },
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

app.use(express.json());
app.use((req, res, next) => { console.log('Request:', req.method, req.url); next(); });
app.use("/api/usuarios", usuarioRoutes);
app.use("/api/salones", salonRoutes);
app.use("/api/horarios", horarioRoutes);
app.use("/api/salon-markers", markerRoutes);
app.use("/api/data", importExportRoutes); // TEMP: commented out for testing

app.get("/", (req, res) => {
  res.send("API BDSM funcionando");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  console.log('Routes mounted:');
  console.log('- /api/usuarios');
  console.log('- /api/salones');
  console.log('- /api/horarios');
  console.log('- /api/salon-markers');
  console.log('- /api/data');
});
