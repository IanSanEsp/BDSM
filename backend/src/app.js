import cors from "cors";
import express from "express";
import dotenv from "dotenv";
import { db } from "./config/db.js";
import usuarioRoutes from "./routes/usuarios.js";

dotenv.config();
const app = express();

// Configura CORS
app.use(cors({
  origin: [
    "https://bdsm-seven.vercel.app/",       // dominio en Vercel
    "http://localhost:5500"            // para pruebas locales
  ],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

app.use(express.json());
app.use("/api/usuarios", usuarioRoutes);

app.get("/", (req, res) => {
  res.send("API BDSM funcionando");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
