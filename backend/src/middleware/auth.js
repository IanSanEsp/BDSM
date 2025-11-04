import jwt from "jsonwebtoken";

// Verifica token JWT (Authorization: Bearer <token>) y req.user
export function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: "No autenticado" });

    const secret = process.env.JWT_SECRET;
    if (!secret) return res.status(500).json({ error: "JWT no configurado" });

    const payload = jwt.verify(token, secret);
    req.user = payload; // { sub, correo, tipo }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
}

// Solo permitir rol admin
export function requireAdmin(req, res, next) {
  const u = req.user;
  if (!u) return res.status(401).json({ error: "No autenticado" });

  // Soportar variantes BD
  const val = String(u.tipo || "").toLowerCase();
  const adminValues = ["admin", "administrador", "adminisrtrador"];
  if (!adminValues.includes(val)) {
    return res.status(403).json({ error: "Requiere rol administrador" });
  }
  next();
}
