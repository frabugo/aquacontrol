// scripts/seedAdmin.js
// Ejecutar una sola vez: node scripts/seedAdmin.js
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const bcrypt = require('bcryptjs');
const db     = require('../db');

async function seed() {
  const email    = 'admin@aquacontrol.pe';
  const password = 'Admin1234!';
  const nombre   = 'Administrador';
  const rol      = 'admin';

  const hash = await bcrypt.hash(password, 12);

  await db.query(
    `UPDATE usuarios SET password_hash = ? WHERE email = ?`,
    [hash, email]
  );

  console.log(`✅ Usuario admin creado: ${email}`);
  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Error en seed:', err.message);
  process.exit(1);
});
