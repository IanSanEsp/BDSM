import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { db } from "./config/db.js";
import usuarioRoutes from "./routes/usuarios.js";

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/usuarios", usuarioRoutes);

app.get("/", (req, res) => {
  res.send("API BTZMAP funcionando correctamente ඞ");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
