/**
 * Migration v3: Insumos & Producción
 *
 * - Redefine insumos, lotes_produccion
 * - Crea recetas_produccion, compras, compra_detalle, insumos_movimientos
 * - Triggers: trg_numero_compra, trg_compra_actualiza_stock,
 *             trg_numero_lote, trg_completar_lote
 * - Seed: 10 insumos + receta base para Bidón 20L
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:     process.env.DB_HOST     || '127.0.0.1',
  port:     process.env.DB_PORT     || 3306,
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'aquacontrol',
  multipleStatements: false,
});

const steps = [
  // ── Deshabilitar FK checks para drops seguros ─────────────────────────────
  { name: 'FK checks OFF', sql: `SET FOREIGN_KEY_CHECKS = 0` },

  // ── Drops de triggers que referencian tablas que vamos a borrar ───────────
  { name: 'Drop trg_consumir_insumos_insert', sql: `DROP TRIGGER IF EXISTS trg_consumir_insumos_insert` },
  { name: 'Drop trg_consumir_insumos_update', sql: `DROP TRIGGER IF EXISTS trg_consumir_insumos_update` },
  { name: 'Drop trg_numero_lote',             sql: `DROP TRIGGER IF EXISTS trg_numero_lote` },
  { name: 'Drop trg_completar_lote',          sql: `DROP TRIGGER IF EXISTS trg_completar_lote` },
  { name: 'Drop trg_numero_compra',           sql: `DROP TRIGGER IF EXISTS trg_numero_compra` },
  { name: 'Drop trg_compra_actualiza_stock',  sql: `DROP TRIGGER IF EXISTS trg_compra_actualiza_stock` },

  // ── Drops de tablas (orden: hijos antes que padres) ───────────────────────
  { name: 'Drop insumos_movimientos',  sql: `DROP TABLE IF EXISTS insumos_movimientos` },
  { name: 'Drop recetas_produccion',   sql: `DROP TABLE IF EXISTS recetas_produccion` },
  { name: 'Drop compra_detalle',       sql: `DROP TABLE IF EXISTS compra_detalle` },
  { name: 'Drop compras',              sql: `DROP TABLE IF EXISTS compras` },
  { name: 'Drop lotes_produccion',     sql: `DROP TABLE IF EXISTS lotes_produccion` },
  { name: 'Drop insumos',              sql: `DROP TABLE IF EXISTS insumos` },

  // ── FK checks ON ─────────────────────────────────────────────────────────
  { name: 'FK checks ON', sql: `SET FOREIGN_KEY_CHECKS = 1` },

  // ── 1. insumos ────────────────────────────────────────────────────────────
  {
    name: 'Create insumos',
    sql: `CREATE TABLE insumos (
  id              INT           NOT NULL AUTO_INCREMENT,
  nombre          VARCHAR(100)  NOT NULL,
  unidad          VARCHAR(20)   NOT NULL,
  stock_actual    DECIMAL(10,2) NOT NULL DEFAULT 0,
  stock_minimo    DECIMAL(10,2) NOT NULL DEFAULT 0,
  precio_unitario DECIMAL(8,2)  NOT NULL DEFAULT 0,
  activo          TINYINT(1)    NOT NULL DEFAULT 1,
  creado_en       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  },

  // ── 2. recetas_produccion ────────────────────────────────────────────────
  {
    name: 'Create recetas_produccion',
    sql: `CREATE TABLE recetas_produccion (
  id               INT           NOT NULL AUTO_INCREMENT,
  presentacion_id  INT           NOT NULL,
  insumo_id        INT           NOT NULL,
  cantidad         DECIMAL(10,4) NOT NULL DEFAULT 1,
  es_opcional      TINYINT(1)    NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_receta (presentacion_id, insumo_id),
  INDEX idx_receta_presentacion (presentacion_id),
  FOREIGN KEY (presentacion_id) REFERENCES presentaciones(id),
  FOREIGN KEY (insumo_id)       REFERENCES insumos(id)
)`,
  },

  // ── 3. insumos_movimientos ───────────────────────────────────────────────
  {
    name: 'Create insumos_movimientos',
    sql: `CREATE TABLE insumos_movimientos (
  id              INT           NOT NULL AUTO_INCREMENT,
  insumo_id       INT           NOT NULL,
  tipo            ENUM(
    'compra',
    'consumo_lote',
    'ajuste_entrada',
    'ajuste_salida',
    'merma'
  ) NOT NULL,
  cantidad        DECIMAL(10,2) NOT NULL,
  costo_unitario  DECIMAL(8,2)  NULL,
  lote_id         INT           NULL,
  compra_id       INT           NULL,
  registrado_por  INT           NULL,
  motivo          VARCHAR(200)  NULL,
  fecha_hora      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_insmov_insumo (insumo_id),
  INDEX idx_insmov_fecha  (fecha_hora),
  FOREIGN KEY (insumo_id)      REFERENCES insumos(id),
  FOREIGN KEY (registrado_por) REFERENCES usuarios(id)
)`,
  },

  // ── 4. compras ───────────────────────────────────────────────────────────
  {
    name: 'Create compras',
    sql: `CREATE TABLE compras (
  id              INT           NOT NULL AUTO_INCREMENT,
  numero          VARCHAR(10)   NOT NULL UNIQUE,
  proveedor       VARCHAR(150)  NULL,
  fecha           DATE          NOT NULL DEFAULT (CURRENT_DATE),
  total           DECIMAL(10,2) NOT NULL DEFAULT 0,
  estado          ENUM('pendiente','recibida','anulada') NOT NULL DEFAULT 'recibida',
  notas           TEXT          NULL,
  registrado_por  INT           NULL,
  creado_en       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_compra_fecha (fecha),
  FOREIGN KEY (registrado_por) REFERENCES usuarios(id)
)`,
  },

  // ── 5. compra_detalle ────────────────────────────────────────────────────
  {
    name: 'Create compra_detalle',
    sql: `CREATE TABLE compra_detalle (
  id              INT           NOT NULL AUTO_INCREMENT,
  compra_id       INT           NOT NULL,
  tipo_item       ENUM('insumo','presentacion') NOT NULL,
  insumo_id       INT           NULL,
  presentacion_id INT           NULL,
  cantidad        DECIMAL(10,2) NOT NULL,
  precio_unitario DECIMAL(8,2)  NOT NULL,
  subtotal        DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (id),
  FOREIGN KEY (compra_id)       REFERENCES compras(id)       ON DELETE CASCADE,
  FOREIGN KEY (insumo_id)       REFERENCES insumos(id),
  FOREIGN KEY (presentacion_id) REFERENCES presentaciones(id)
)`,
  },

  // ── 6. lotes_produccion ──────────────────────────────────────────────────
  {
    name: 'Create lotes_produccion',
    sql: `CREATE TABLE lotes_produccion (
  id                 INT           NOT NULL AUTO_INCREMENT,
  numero             VARCHAR(10)   NOT NULL UNIQUE,
  presentacion_id    INT           NOT NULL,
  operario_id        INT           NULL,
  fecha              DATE          NOT NULL DEFAULT (CURRENT_DATE),
  turno              ENUM('manana','tarde','noche') NOT NULL,
  cantidad_producida INT           NOT NULL DEFAULT 0,
  estado             ENUM('en_proceso','completado','rechazado') NOT NULL DEFAULT 'en_proceso',
  notas              TEXT          NULL,
  creado_en          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_lote_fecha        (fecha),
  INDEX idx_lote_presentacion (presentacion_id),
  INDEX idx_lote_estado       (estado),
  FOREIGN KEY (presentacion_id) REFERENCES presentaciones(id),
  FOREIGN KEY (operario_id)     REFERENCES usuarios(id) ON DELETE SET NULL
)`,
  },

  // ── Triggers ─────────────────────────────────────────────────────────────
  {
    name: 'Trigger trg_numero_compra',
    sql: `CREATE TRIGGER trg_numero_compra
BEFORE INSERT ON compras
FOR EACH ROW
BEGIN
  DECLARE v_sig INT;
  IF NEW.numero IS NULL OR NEW.numero = '' THEN
    SELECT COALESCE(MAX(CAST(SUBSTRING(numero,5) AS UNSIGNED)),0)+1
      INTO v_sig FROM compras WHERE numero LIKE 'COM-%';
    SET NEW.numero = CONCAT('COM-', LPAD(v_sig,4,'0'));
  END IF;
END`,
  },
  {
    name: 'Trigger trg_compra_actualiza_stock',
    sql: `CREATE TRIGGER trg_compra_actualiza_stock
AFTER INSERT ON compra_detalle
FOR EACH ROW
BEGIN
  IF NEW.tipo_item = 'insumo' AND NEW.insumo_id IS NOT NULL THEN
    UPDATE insumos
       SET stock_actual = stock_actual + NEW.cantidad
     WHERE id = NEW.insumo_id;

    INSERT INTO insumos_movimientos
      (insumo_id, tipo, cantidad, costo_unitario, compra_id, motivo)
    VALUES
      (NEW.insumo_id, 'compra', NEW.cantidad, NEW.precio_unitario,
       NEW.compra_id, CONCAT('Compra #', NEW.compra_id));

  ELSEIF NEW.tipo_item = 'presentacion' AND NEW.presentacion_id IS NOT NULL THEN
    UPDATE presentaciones
       SET stock_vacios = stock_vacios + NEW.cantidad
     WHERE id = NEW.presentacion_id;
  END IF;
END`,
  },
  {
    name: 'Trigger trg_numero_lote',
    sql: `CREATE TRIGGER trg_numero_lote
BEFORE INSERT ON lotes_produccion
FOR EACH ROW
BEGIN
  DECLARE v_sig INT;
  IF NEW.numero IS NULL OR NEW.numero = '' THEN
    SELECT COALESCE(MAX(CAST(SUBSTRING(numero,5) AS UNSIGNED)),0)+1
      INTO v_sig FROM lotes_produccion WHERE numero LIKE 'LOT-%';
    SET NEW.numero = CONCAT('LOT-', LPAD(v_sig,4,'0'));
  END IF;
END`,
  },
  {
    name: 'Trigger trg_completar_lote',
    sql: `CREATE TRIGGER trg_completar_lote
AFTER UPDATE ON lotes_produccion
FOR EACH ROW
BEGIN
  IF NEW.estado = 'completado' AND OLD.estado <> 'completado' THEN

    UPDATE insumos i
    JOIN recetas_produccion r
      ON r.insumo_id = i.id
     AND r.presentacion_id = NEW.presentacion_id
     AND r.es_opcional = 0
       SET i.stock_actual = i.stock_actual - (r.cantidad * NEW.cantidad_producida);

    INSERT INTO insumos_movimientos
      (insumo_id, tipo, cantidad, lote_id, motivo)
    SELECT
      r.insumo_id,
      'consumo_lote',
      -(r.cantidad * NEW.cantidad_producida),
      NEW.id,
      CONCAT('Lote ', NEW.numero, ' — ', NEW.cantidad_producida, ' unidades')
    FROM recetas_produccion r
    WHERE r.presentacion_id = NEW.presentacion_id
      AND r.es_opcional = 0;

    UPDATE presentaciones
       SET stock_vacios = stock_vacios - NEW.cantidad_producida,
           stock_llenos = stock_llenos + NEW.cantidad_producida
     WHERE id = NEW.presentacion_id;

  END IF;
END`,
  },

  // ── Seed: insumos ────────────────────────────────────────────────────────
  {
    name: 'Seed insumos',
    sql: `INSERT INTO insumos (nombre, unidad, stock_minimo, precio_unitario) VALUES
  ('Tapa bidón',         'unidad', 100,  0.30),
  ('Tapa botella',       'unidad', 200,  0.10),
  ('Cinta de seguridad', 'unidad', 200,  0.05),
  ('Etiqueta bidón',     'unidad', 100,  0.20),
  ('Etiqueta botella',   'unidad', 200,  0.10),
  ('Caño / válvula',     'unidad',  20,  2.50),
  ('Bolsa hielo 1kg',    'unidad', 100,  0.15),
  ('Bolsa hielo 3kg',    'unidad', 100,  0.20),
  ('Bolsa hielo 5kg',    'unidad', 100,  0.25),
  ('Agua (m3)',          'litro',  500,  0.01)`,
  },

  // ── Seed: recetas base para Bidón 20L (presentacion_id dinámica) ─────────
  {
    name: 'Seed recetas Bidón 20L',
    sql: `INSERT IGNORE INTO recetas_produccion
  (presentacion_id, insumo_id, cantidad, es_opcional)
SELECT
  p.id,
  i.id,
  CASE i.nombre
    WHEN 'Tapa bidón'         THEN 1
    WHEN 'Cinta de seguridad' THEN 2
    WHEN 'Etiqueta bidón'     THEN 1
    WHEN 'Agua (m3)'          THEN 20
    WHEN 'Caño / válvula'     THEN 1
  END,
  CASE i.nombre
    WHEN 'Caño / válvula' THEN 1
    ELSE 0
  END
FROM presentaciones p
CROSS JOIN insumos i
WHERE p.nombre LIKE '%Bidón 20%'
  AND i.nombre IN (
    'Tapa bidón', 'Cinta de seguridad',
    'Etiqueta bidón', 'Agua (m3)', 'Caño / válvula'
  )`,
  },

  // ── Seed: recetas para Botella 600ml / 1.5L ──────────────────────────────
  {
    name: 'Seed recetas Botellas',
    sql: `INSERT IGNORE INTO recetas_produccion
  (presentacion_id, insumo_id, cantidad, es_opcional)
SELECT
  p.id,
  i.id,
  CASE i.nombre
    WHEN 'Tapa botella'     THEN 1
    WHEN 'Etiqueta botella' THEN 1
    WHEN 'Agua (m3)'        THEN CASE WHEN p.nombre LIKE '%600%' THEN 0.6 ELSE 1.5 END
  END,
  0
FROM presentaciones p
CROSS JOIN insumos i
WHERE p.nombre LIKE '%Botella%'
  AND i.nombre IN ('Tapa botella', 'Etiqueta botella', 'Agua (m3)')`,
  },

  // ── Seed: recetas para Hielo (bolsas) ────────────────────────────────────
  {
    name: 'Seed recetas Hielo',
    sql: `INSERT IGNORE INTO recetas_produccion
  (presentacion_id, insumo_id, cantidad, es_opcional)
SELECT
  p.id,
  i.id,
  1,
  0
FROM presentaciones p
CROSS JOIN insumos i
WHERE p.nombre LIKE '%Hielo%'
  AND (
    (p.nombre LIKE '%5kg%'  AND i.nombre = 'Bolsa hielo 5kg') OR
    (p.nombre LIKE '%10kg%' AND i.nombre = 'Bolsa hielo 5kg') OR
    (p.nombre LIKE '%1kg%'  AND i.nombre = 'Bolsa hielo 1kg') OR
    (p.nombre LIKE '%3kg%'  AND i.nombre = 'Bolsa hielo 3kg')
  )`,
  },
];

async function run() {
  const conn = await pool.getConnection();
  let ok = 0, fail = 0;
  try {
    for (const step of steps) {
      try {
        await conn.query(step.sql);
        console.log(`✅  ${step.name}`);
        ok++;
      } catch (err) {
        console.error(`❌  ${step.name}: ${err.message}`);
        fail++;
        const ignorable = [
          'ER_CANT_DROP_FIELD_OR_KEY', 'ER_DUP_FIELDNAME',
          'ER_DUP_KEYNAME', 'ER_FK_DUP_NAME',
        ];
        if (!ignorable.includes(err.code)) {
          // re-enable FK checks before aborting
          try { await conn.query('SET FOREIGN_KEY_CHECKS = 1'); } catch {}
          console.error('   → Fatal, abortando.');
          break;
        }
        console.log('   → Ignorable, continuando…');
      }
    }
  } finally {
    conn.release();
    await pool.end();
  }
  console.log(`\nMigración terminada: ${ok} ok, ${fail} fallaron.`);
  process.exit(fail > 0 ? 1 : 0);
}

run();
