// backend/scripts/run_migration_v8.js
// Migration v8 — KM tracking en rutas + Programación de mantenimiento
const db = require('../db');

const steps = [

  /* ── 1. km_inicio en rutas ── */
  {
    name: 'rutas: ADD COLUMN km_inicio',
    sql: `ALTER TABLE rutas ADD COLUMN IF NOT EXISTS km_inicio INT NULL`,
  },

  /* ── 2. km_fin en rutas ── */
  {
    name: 'rutas: ADD COLUMN km_fin',
    sql: `ALTER TABLE rutas ADD COLUMN IF NOT EXISTS km_fin INT NULL`,
  },

  /* ── 3. Tabla programacion_mantenimiento ── */
  {
    name: 'CREATE TABLE programacion_mantenimiento',
    sql: `CREATE TABLE IF NOT EXISTS programacion_mantenimiento (
      id                       INT AUTO_INCREMENT PRIMARY KEY,
      vehiculo_id              INT NOT NULL,
      tipo_mantenimiento       VARCHAR(100) NOT NULL,
      cada_km                  INT NOT NULL,
      categoria                VARCHAR(50) DEFAULT 'general',
      descripcion              TEXT NULL,
      activo                   TINYINT(1) DEFAULT 1,
      ultimo_km_realizado      INT DEFAULT 0,
      ultimo_mantenimiento_id  INT NULL,
      creado_por               INT NOT NULL,
      creado_en                DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_vehiculo (vehiculo_id)
    )`,
  },

];

(async () => {
  console.log('=== Migration v8 ===\n');
  for (const step of steps) {
    try {
      await db.query(step.sql);
      console.log(`  ✔ ${step.name}`);
    } catch (err) {
      console.error(`  ✖ ${step.name}: ${err.message}`);
    }
  }
  console.log('\nDone.');
  process.exit(0);
})();
