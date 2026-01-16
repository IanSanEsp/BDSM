import express from "express";
import multer from "multer";
import { exportHorarios, importHorarios } from "../controllers/importExportController.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

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

router.post("/import/horarios", requireAuth, requireAdmin, upload.single('excel'), importHorarios);
router.post("/import/horarios", importHorarios); // TEMP: sin multer para testing

export default router;
