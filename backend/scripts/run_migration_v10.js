// backend/scripts/run_migration_v10.js
// Migration v10 — Métodos de pago dinámicos + arrastra saldo
const db = require('../db');

const steps = [

  /* ── 1. metodos_pago_config — add missing columns to existing table ── */
  {
    name: 'ALTER metodos_pago_config: add tipo',
    sql: "ALTER TABLE metodos_pago_config ADD COLUMN tipo ENUM('fisico','digital','credito') NOT NULL DEFAULT 'digital' AFTER etiqueta",
    ignoreCodes: [1060], // Duplicate column
  },
  {
    name: 'ALTER metodos_pago_config: add color',
    sql: "ALTER TABLE metodos_pago_config ADD COLUMN color VARCHAR(20) DEFAULT 'slate' AFTER tipo",
    ignoreCodes: [1060],
  },
  {
    name: 'ALTER metodos_pago_config: add orden',
    sql: "ALTER TABLE metodos_pago_config ADD COLUMN orden INT DEFAULT 0 AFTER arrastra_saldo",
    ignoreCodes: [1060],
  },
  {
    name: 'ALTER metodos_pago_config: add es_sistema',
    sql: "ALTER TABLE metodos_pago_config ADD COLUMN es_sistema TINYINT DEFAULT 0 AFTER orden",
    ignoreCodes: [1060],
  },
  {
    name: 'ALTER metodos_pago_config: add creado_en',
    sql: "ALTER TABLE metodos_pago_config ADD COLUMN creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER es_sistema",
    ignoreCodes: [1060],
  },
  {
    name: 'ALTER metodos_pago_config: widen etiqueta to 100',
    sql: "ALTER TABLE metodos_pago_config MODIFY COLUMN etiqueta VARCHAR(100) NOT NULL",
    ignoreCodes: [],
  },
  {
    name: 'SEED metodos_pago_config',
    sql: `INSERT IGNORE INTO metodos_pago_config (nombre, etiqueta, tipo, color, activo, arrastra_saldo, orden, es_sistema) VALUES
      ('efectivo',      'Efectivo',              'fisico',  'emerald', 1, 1, 1,  1),
      ('yape',          'Yape',                  'digital', 'purple',  1, 0, 2,  0),
      ('plin',          'Plin',                  'digital', 'cyan',    1, 0, 3,  0),
      ('transferencia', 'Transferencia bancaria', 'digital', 'blue',   1, 0, 4,  0),
      ('bcp',           'BCP',                   'digital', 'orange',  1, 0, 5,  0),
      ('interbank',     'Interbank',             'digital', 'green',   1, 0, 6,  0),
      ('bbva',          'BBVA',                  'digital', 'blue',    1, 0, 7,  0),
      ('tarjeta',       'Tarjeta POS',           'digital', 'pink',    1, 0, 8,  0),
      ('credito',       'Crédito (fiado)',        'credito', 'red',    1, 0, 99, 1)`,
  },

  /* ── 2. venta_pagos ── */
  {
    name: 'CREATE TABLE venta_pagos',
    sql: `CREATE TABLE IF NOT EXISTS venta_pagos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      venta_id INT NOT NULL,
      metodo_pago VARCHAR(50) NOT NULL,
      monto DECIMAL(10,2) NOT NULL DEFAULT 0,
      FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE,
      INDEX idx_venta (venta_id)
    )`,
  },
  {
    name: 'MIGRATE data to venta_pagos',
    sql: `INSERT INTO venta_pagos (venta_id, metodo_pago, monto)
      SELECT id, 'efectivo', pagado_efectivo FROM ventas WHERE pagado_efectivo > 0
      UNION ALL SELECT id, 'transferencia', pagado_transferencia FROM ventas WHERE pagado_transferencia > 0
      UNION ALL SELECT id, 'tarjeta', pagado_tarjeta FROM ventas WHERE pagado_tarjeta > 0
      UNION ALL SELECT id, 'credito', pagado_credito FROM ventas WHERE pagado_credito > 0`,
    ignoreCodes: [1062], // Ignore duplicate on re-run
  },

  /* ── 3. caja_saldos ── */
  {
    name: 'CREATE TABLE caja_saldos',
    sql: `CREATE TABLE IF NOT EXISTS caja_saldos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      caja_id INT NOT NULL,
      metodo_pago VARCHAR(50) NOT NULL,
      saldo_ini DECIMAL(10,2) DEFAULT 0,
      saldo_fin DECIMAL(10,2) DEFAULT NULL,
      FOREIGN KEY (caja_id) REFERENCES cajas(id) ON DELETE CASCADE,
      UNIQUE KEY uq_caja_metodo (caja_id, metodo_pago)
    )`,
  },
  {
    name: 'MIGRATE data to caja_saldos',
    sql: `INSERT INTO caja_saldos (caja_id, metodo_pago, saldo_ini, saldo_fin)
      SELECT id, 'efectivo', saldo_ini_efectivo, saldo_fin_efectivo FROM cajas WHERE saldo_ini_efectivo > 0 OR saldo_fin_efectivo > 0
      UNION ALL SELECT id, 'transferencia', saldo_ini_transferencia, saldo_fin_transferencia FROM cajas WHERE saldo_ini_transferencia > 0 OR saldo_fin_transferencia > 0
      UNION ALL SELECT id, 'tarjeta', saldo_ini_tarjeta, saldo_fin_tarjeta FROM cajas WHERE saldo_ini_tarjeta > 0 OR saldo_fin_tarjeta > 0
      UNION ALL SELECT id, 'credito', saldo_ini_credito, saldo_fin_credito FROM cajas WHERE saldo_ini_credito > 0 OR saldo_fin_credito > 0`,
    ignoreCodes: [1062],
  },

  /* ── 4. Drop trigger trg_venta_a_caja — now handled in app code ── */
  {
    name: 'DROP TRIGGER trg_venta_a_caja',
    sql: 'DROP TRIGGER IF EXISTS trg_venta_a_caja',
  },

  /* ── 5. Drop trigger trg_calcular_cierre_caja — now handled in app code ── */
  {
    name: 'DROP TRIGGER trg_calcular_cierre_caja',
    sql: 'DROP TRIGGER IF EXISTS trg_calcular_cierre_caja',
  },
];

(async () => {
  const conn = await db.getConnection();
  let ok = 0, skipped = 0, failed = 0;
  try {
    for (const step of steps) {
      try {
        await conn.query(step.sql);
        console.log(`✅ [${++ok}] ${step.name}`);
      } catch (err) {
        if (step.ignoreCodes?.includes(err.errno)) {
          console.log(`⏭  [skip] ${step.name} — ${err.message}`);
          skipped++;
        } else {
          console.error(`❌ [FAIL] ${step.name}`);
          console.error(`   ${err.message}`);
          failed++;
        }
      }
    }
  } finally {
    conn.release();
    console.log(`\nDone: ${ok} ok, ${skipped} skipped, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  }
})();
