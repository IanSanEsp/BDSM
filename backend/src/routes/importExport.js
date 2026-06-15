import express from "express";
import multer from "multer";
import { exportHorarios, importHorarios, importFullDb, importarExcelHorarios } from "../controllers/importExportController.js";
import { requireAuth, requireAdmin, requirePrefecto } from "../middleware/auth.js";

const router = express.Router();

// Multer en memoria para el import de horarios por Excel
const uploadMem = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const upload = multer({
  dest: 'uploads/', // directorio temporal
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.mimetype === 'application/vnd.ms-excel') {
      cb(null, true);
    } else {
      cb(new Error('Solo archivos Excel (.xlsx, .xls) son permitidos'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 }
});

router.get("/export/horarios", exportHorarios);

// Importar toda la base
router.post("/import/horarios", requireAuth, requireAdmin, upload.single('excel'), importFullDb);

// Alias explícito por si pruebas
router.post("/import/full", requireAuth, requireAdmin, upload.single('excel'), importFullDb);

// Importar horarios desde Excel (esquema Horario_Fijo + horarios) — para prefectos
router.post("/import/horarios-excel", requireAuth, requirePrefecto, uploadMem.single('archivo'), importarExcelHorarios);

export default router;
