import express from "express";
import { listMarkers, upsertMarker, deleteMarker } from "../controllers/markersController.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

// List markers
router.get("/", requireAuth, listMarkers);
// Upsert marker solo admin
router.put("/", requireAuth, requireAdmin, upsertMarker);
// Delete marker solo admin
router.delete("/:piso/:id_salon", requireAuth, requireAdmin, deleteMarker);

export default router;
