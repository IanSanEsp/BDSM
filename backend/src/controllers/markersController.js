import { db } from "../config/db.js";

export async function listMarkers(req, res) {
  try {
    const { piso } = req.query;
    let sql = "SELECT piso, id_salon, x, y, updated_at FROM salon_markers";
    const params = [];
    if (piso !== undefined) {
      sql += " WHERE piso = ?";
      params.push(String(piso));
    }
    const [rows] = await db.query(sql, params);
    return res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: "Error listando marcadores", details: e.message });
  }
}

export async function upsertMarker(req, res) {
  try {
    const { piso, id_salon, x, y } = req.body || {};
    if (piso === undefined || !id_salon || x === undefined || y === undefined) {
      return res.status(400).json({ error: "piso, id_salon, x, y requeridos" });
    }
    const p = String(piso);
    const id = String(id_salon);
    const px = Number(x);
    const py = Number(y);
    if (!Number.isFinite(px) || !Number.isFinite(py)) {
      return res.status(400).json({ error: "Datos inválidos" });
    }
    await db.query(
      `INSERT INTO salon_markers (piso, id_salon, x, y) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE x = VALUES(x), y = VALUES(y), updated_at = CURRENT_TIMESTAMP`,
      [p, id, px, py]
    );
    return res.json({ ok: true, piso: p, id_salon: id, x: px, y: py });
  } catch (e) {
    return res.status(500).json({ error: "Error guardando marcador", details: e.message });
  }
}

export async function deleteMarker(req, res) {
  try {
    const { piso, id_salon } = req.params;
    if (piso === undefined || !id_salon) {
      return res.status(400).json({ error: "piso y id_salon requeridos" });
    }
    const p = String(piso);
    const id = String(id_salon);
    await db.query("DELETE FROM salon_markers WHERE piso = ? AND id_salon = ?", [p, id]);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "Error eliminando marcador", details: e.message });
  }
}
