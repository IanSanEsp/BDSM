import express from "express";
import { listMarkers, upsertMarker, deleteMarker } from "../controllers/markersController.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

// List markers (auth required, both admin and user can view)
router.get("/", requireAuth, listMarkers);
// Upsert marker (admin only)
router.put("/", requireAuth, requireAdmin, upsertMarker);
// Delete marker (admin only)
router.delete("/:piso/:id_salon", requireAuth, requireAdmin, deleteMarker);

export default router;
