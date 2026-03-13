// backend/scripts/run_migration_v5.js
// Migration v5 — Gestión de proveedores + historial de precios
const db = require('../db');

const steps = [

  /* ── 1. Tabla proveedores ── */
  {
    name: 'CREATE TABLE proveedores',
    sql: `CREATE TABLE IF NOT EXISTS proveedores (
      id          INT           NOT NULL AUTO_INCREMENT,
      nombre      VARCHAR(150)  NOT NULL,
      ruc         VARCHAR(15)   NULL UNIQUE,
      telefono    VARCHAR(20)   NULL,
      email       VARCHAR(100)  NULL,
      direccion   TEXT          NULL,
      contacto    VARCHAR(100)  NULL,
      activo      TINYINT(1)    NOT NULL DEFAULT 1,
      notas       TEXT          NULL,
      creado_en   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      creado_por  INT           NULL,
      PRIMARY KEY (id),
      INDEX idx_proveedor_nombre (nombre),
      FOREIGN KEY (creado_por) REFERENCES usuarios(id) ON DELETE SET NULL
    )`,
  },

  /* ── 2. Tabla precios_proveedor ──
     Usamos columnas generadas (insumo_key, pres_key) como centinelas
     para que el UNIQUE funcione correctamente con NULLs.          */
  {
    name: 'CREATE TABLE precios_proveedor',
    sql: `CREATE TABLE IF NOT EXISTS precios_proveedor (
      id                    INT          NOT NULL AUTO_INCREMENT,
      proveedor_id          INT          NOT NULL,
      insumo_id             INT          NULL,
      presentacion_id       INT          NULL,
      precio                DECIMAL(8,2) NOT NULL,
      fecha_ultima_compra   DATE         NOT NULL,
      compra_id             INT          NULL,
      -- Columnas centinela para UNIQUE con NULL-safe semantics
      insumo_key            INT GENERATED ALWAYS AS (IFNULL(insumo_id, 0)) STORED,
      pres_key              INT GENERATED ALWAYS AS (IFNULL(presentacion_id, 0)) STORED,
      PRIMARY KEY (id),
      UNIQUE KEY uq_precio_prov (proveedor_id, insumo_key, pres_key),
      INDEX idx_precio_prov_insumo (insumo_id),
      INDEX idx_precio_prov_pres   (presentacion_id),
      FOREIGN KEY (proveedor_id)    REFERENCES proveedores(id)    ON DELETE CASCADE,
      FOREIGN KEY (insumo_id)       REFERENCES insumos(id)        ON DELETE CASCADE,
      FOREIGN KEY (presentacion_id) REFERENCES presentaciones(id) ON DELETE CASCADE,
      FOREIGN KEY (compra_id)       REFERENCES compras(id)        ON DELETE SET NULL
    )`,
  },

  /* ── 3. ALTER compras: añadir proveedor_id ── */
  {
    name: 'compras: ADD COLUMN proveedor_id',
    sql: `ALTER TABLE compras
      ADD COLUMN IF NOT EXISTS proveedor_id INT NULL AFTER numero`,
  },
  {
    name: 'compras: ADD FK fk_compra_proveedor',
    sql: `ALTER TABLE compras
      ADD CONSTRAINT fk_compra_proveedor
        FOREIGN KEY (proveedor_id) REFERENCES proveedores(id)
        ON DELETE SET NULL`,
    ignoreCodes: [1826, 1061],
  },

  /* ── 4. Actualizar trg_compra_actualiza_stock
     Reemplaza la rama 'presentacion' que usaba stock_vacios
     (columna eliminada en v4) por stock en insumos retornables.   ── */
  { name: 'DROP trg_compra_actualiza_stock', sql: 'DROP TRIGGER IF EXISTS trg_compra_actualiza_stock' },
  {
    name: 'CREATE trg_compra_actualiza_stock (updated)',
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
    -- Envases comprados (nuevos): van al stock del insumo retornable vinculado
    UPDATE insumos
       SET stock_actual = stock_actual + NEW.cantidad
     WHERE presentacion_id = NEW.presentacion_id AND es_retornable = 1;
    INSERT INTO insumos_movimientos (insumo_id, tipo, cantidad, costo_unitario, compra_id, motivo)
    SELECT id, 'compra', NEW.cantidad, NEW.precio_unitario,
           NEW.compra_id, CONCAT('Compra envases #', NEW.compra_id)
    FROM insumos WHERE presentacion_id = NEW.presentacion_id AND es_retornable = 1;
  END IF;
END`,
  },

  /* ── 5. Trigger: actualiza historial de precios por proveedor ── */
  { name: 'DROP trg_actualiza_precio_proveedor', sql: 'DROP TRIGGER IF EXISTS trg_actualiza_precio_proveedor' },
  {
    name: 'CREATE trg_actualiza_precio_proveedor',
    sql: `CREATE TRIGGER trg_actualiza_precio_proveedor
AFTER INSERT ON compra_detalle
FOR EACH ROW
BEGIN
  DECLARE v_proveedor_id INT;
  DECLARE v_fecha        DATE;

  SELECT proveedor_id, fecha INTO v_proveedor_id, v_fecha
    FROM compras WHERE id = NEW.compra_id;

  IF v_proveedor_id IS NOT NULL THEN
    INSERT INTO precios_proveedor
      (proveedor_id, insumo_id, presentacion_id,
       precio, fecha_ultima_compra, compra_id)
    VALUES
      (v_proveedor_id,
       NEW.insumo_id,
       NEW.presentacion_id,
       NEW.precio_unitario,
       v_fecha,
       NEW.compra_id)
    ON DUPLICATE KEY UPDATE
      precio              = NEW.precio_unitario,
      fecha_ultima_compra = v_fecha,
      compra_id           = NEW.compra_id;
  END IF;
END`,
  },

  /* ── 6. Vista: comparación de precios por proveedor ── */
  {
    name: 'CREATE OR REPLACE VIEW v_comparacion_precios',
    sql: `CREATE OR REPLACE VIEW v_comparacion_precios AS
SELECT
  COALESCE(i.nombre, p.nombre)   AS producto,
  CASE WHEN i.id IS NOT NULL THEN 'insumo' ELSE 'presentacion' END AS tipo,
  pv.nombre                      AS proveedor,
  pv.telefono                    AS telefono_proveedor,
  pp.precio                      AS ultimo_precio,
  pp.fecha_ultima_compra,
  RANK() OVER (
    PARTITION BY pp.insumo_id, pp.presentacion_id
    ORDER BY pp.precio ASC
  ) AS ranking
FROM precios_proveedor pp
JOIN proveedores pv       ON pv.id = pp.proveedor_id
LEFT JOIN insumos i       ON i.id  = pp.insumo_id
LEFT JOIN presentaciones p ON p.id = pp.presentacion_id
WHERE pv.activo = 1`,
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
