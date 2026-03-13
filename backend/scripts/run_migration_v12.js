// backend/scripts/run_migration_v12.js
// Migration v12 — Renombrar columnas para consistencia código ↔ BD
const db = require('../db');

const steps = [

  // ── 1. clientes: dni → ruc_dni (almacena ambos) ──
  {
    name: 'ALTER clientes: RENAME dni → ruc_dni',
    sql: "ALTER TABLE clientes CHANGE COLUMN dni ruc_dni VARCHAR(15) NULL",
    ignoreCodes: [1054], // Unknown column (ya renombrada)
  },

  // ── 2. cajas: hora_cierre → cerrada_en ──
  {
    name: 'ALTER cajas: RENAME hora_cierre → cerrada_en',
    sql: "ALTER TABLE cajas CHANGE COLUMN hora_cierre cerrada_en DATETIME NULL",
    ignoreCodes: [1054],
  },

  // ── 3. caja_reaberturas: autorizado_por → reabierta_por ──
  {
    name: 'ALTER caja_reaberturas: RENAME autorizado_por → reabierta_por',
    sql: "ALTER TABLE caja_reaberturas CHANGE COLUMN autorizado_por reabierta_por INT NULL",
    ignoreCodes: [1054],
  },

  // ── 4. caja_reaberturas: motivo → razon ──
  {
    name: 'ALTER caja_reaberturas: RENAME motivo → razon',
    sql: "ALTER TABLE caja_reaberturas CHANGE COLUMN motivo razon TEXT NULL",
    ignoreCodes: [1054],
  },

  // ── 5. caja_reaberturas: agregar reabierta_en si no existe ──
  {
    name: 'ALTER caja_reaberturas: ADD reabierta_en',
    sql: "ALTER TABLE caja_reaberturas ADD COLUMN reabierta_en DATETIME NULL",
    ignoreCodes: [1060], // Duplicate column
  },
];

async function run() {
  console.log('=== Migration v12: Renombrar columnas ===\n');
  for (const step of steps) {
    try {
      await db.query(step.sql);
      console.log(`  ✓ ${step.name}`);
    } catch (err) {
      if (step.ignoreCodes?.includes(err.errno)) {
        console.log(`  ⊘ ${step.name} (already done)`);
      } else {
        console.error(`  ✗ ${step.name}: ${err.message}`);
      }
    }
  }
  console.log('\n=== Migration v12 complete ===');
  process.exit(0);
}

run();
