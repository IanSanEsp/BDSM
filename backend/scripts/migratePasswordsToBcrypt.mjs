import { db } from '../src/config/db.js';
import bcrypt from 'bcrypt';

// Migra contraseñas NO-bcrypt a bcrypt, en el mismo campo `Usuarios`.`contraseña`.
// Uso:
//   node scripts/migratePasswordsToBcrypt.mjs
// Opcional:
//   DRY_RUN=true node scripts/migratePasswordsToBcrypt.mjs

const dryRun = String(process.env.DRY_RUN || '').toLowerCase() === 'true';

function isBcryptHash(value) {
  const v = String(value || '');
  return v.startsWith('$2a$') || v.startsWith('$2b$') || v.startsWith('$2y$');
}

const [rows] = await db.query(
  "SELECT id_usuarios, correo, `contraseña` AS pass FROM Usuarios"
);

let scanned = 0;
let already = 0;
let migrated = 0;
let skippedEmpty = 0;

for (const row of rows || []) {
  scanned++;
  const current = String(row.pass ?? '');
  if (!current) {
    skippedEmpty++;
    continue;
  }
  if (isBcryptHash(current)) {
    already++;
    continue;
  }

  const rounds = Number(process.env.BCRYPT_COST || 10);
  const safeRounds = Number.isFinite(rounds) && rounds >= 4 ? rounds : 10;
  const nextHash = await bcrypt.hash(current, safeRounds);
  if (!dryRun) {
    await db.query(
      'UPDATE Usuarios SET `contraseña` = ? WHERE id_usuarios = ?',
      [nextHash, row.id_usuarios]
    );
  }
  migrated++;
}

console.log({ dryRun, scanned, already, migrated, skippedEmpty });
process.exit(0);
