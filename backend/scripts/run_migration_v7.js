// backend/scripts/run_migration_v7.js
// Migration v7 — Metas, Mantenimientos, Control de Calidad
const db = require('../db');

const steps = [

  /* ── 1. Tabla metas ── */
  {
    name: 'CREATE TABLE metas',
    sql: `CREATE TABLE IF NOT EXISTS metas (
      id             INT AUTO_INCREMENT PRIMARY KEY,
      usuario_id     INT NOT NULL,
      mes            DATE NOT NULL,
      meta_soles     DECIMAL(10,2) NOT NULL,
      meta_bidones   INT NULL,
      comision_pct   DECIMAL(5,2) DEFAULT 0,
      bono_cumplido  DECIMAL(10,2) DEFAULT 0,
      creado_por     INT NOT NULL,
      creado_en      DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_usuario_mes (usuario_id, mes),
      INDEX idx_mes (mes)
    )`,
  },

  /* ── 2. View v_avance_metas ── */
  {
    name: 'CREATE VIEW v_avance_metas',
    sql: `CREATE OR REPLACE VIEW v_avance_metas AS
      SELECT m.*,
             u.nombre AS usuario_nombre,
             u.rol,
             COALESCE(SUM(v.total), 0) AS vendido_soles,
             COUNT(v.id) AS total_ventas,
             COALESCE(SUM(vd.cantidad), 0) AS vendido_bidones
        FROM metas m
        JOIN usuarios u ON u.id = m.usuario_id
        LEFT JOIN ventas v ON (
          (v.vendedor_id = m.usuario_id OR v.repartidor_id = m.usuario_id)
          AND v.estado != 'cancelada'
          AND v.fecha_hora >= m.mes
          AND v.fecha_hora < DATE_ADD(m.mes, INTERVAL 1 MONTH)
        )
        LEFT JOIN venta_detalle vd ON vd.venta_id = v.id
       GROUP BY m.id`,
  },

  /* ── 3. Tabla mantenimientos ── */
  {
    name: 'CREATE TABLE mantenimientos',
    sql: `CREATE TABLE IF NOT EXISTS mantenimientos (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      vehiculo_id     INT NOT NULL,
      tipo            ENUM('preventivo','correctivo','revision') NOT NULL,
      descripcion     TEXT NOT NULL,
      kilometraje     INT NULL,
      costo           DECIMAL(10,2) DEFAULT 0,
      proveedor       VARCHAR(200) NULL,
      fecha           DATE NOT NULL,
      proximo_km      INT NULL,
      proximo_fecha   DATE NULL,
      estado          ENUM('pendiente','completado','cancelado') DEFAULT 'completado',
      registrado_por  INT NOT NULL,
      creado_en       DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_vehiculo (vehiculo_id),
      INDEX idx_fecha (fecha)
    )`,
  },

  /* ── 4. Columna kilometraje_actual en vehiculos ── */
  {
    name: 'vehiculos: ADD COLUMN kilometraje_actual',
    sql: `ALTER TABLE vehiculos ADD COLUMN IF NOT EXISTS kilometraje_actual INT DEFAULT 0`,
  },

  /* ── 5. Tabla controles_calidad ── */
  {
    name: 'CREATE TABLE controles_calidad',
    sql: `CREATE TABLE IF NOT EXISTS controles_calidad (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      fecha            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      punto_muestreo   ENUM('entrada','osmosis','post_uv','tanque','envasado') NOT NULL,
      ph               DECIMAL(4,2) NULL,
      cloro_residual   DECIMAL(5,3) NULL,
      tds              INT NULL,
      turbidez         DECIMAL(6,2) NULL,
      temperatura      DECIMAL(4,1) NULL,
      observaciones    TEXT NULL,
      cumple           TINYINT(1) DEFAULT 1,
      registrado_por   INT NOT NULL,
      creado_en        DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_fecha (fecha),
      INDEX idx_punto (punto_muestreo)
    )`,
  },

  /* ── 6. Tabla calidad_parametros ── */
  {
    name: 'CREATE TABLE calidad_parametros',
    sql: `CREATE TABLE IF NOT EXISTS calidad_parametros (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      parametro   ENUM('ph','cloro_residual','tds','turbidez','temperatura') NOT NULL,
      min_valor   DECIMAL(10,3) NULL,
      max_valor   DECIMAL(10,3) NULL,
      unidad      VARCHAR(20) NOT NULL,
      UNIQUE KEY uk_parametro (parametro)
    )`,
  },

  /* ── 7. Seed parámetros por defecto ── */
  {
    name: 'SEED calidad_parametros',
    sql: `INSERT IGNORE INTO calidad_parametros (parametro, min_valor, max_valor, unidad) VALUES
      ('ph', 6.500, 8.500, 'pH'),
      ('cloro_residual', 0.000, 0.500, 'mg/L'),
      ('tds', 0.000, 500.000, 'ppm'),
      ('turbidez', 0.000, 5.000, 'NTU'),
      ('temperatura', 10.000, 30.000, '°C')`,
  },

];

(async () => {
  console.log('=== Migration v7 ===\n');
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
