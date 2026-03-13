// backend/scripts/run_migration_v4.js
// Migration v4 — Retornables & Lavado system
const db = require('../db');

const steps = [

  /* ── 1. presentaciones: add modo_stock, dias_vencimiento ── */
  {
    name: 'presentaciones: ADD modo_stock, dias_vencimiento',
    sql: `ALTER TABLE presentaciones
      ADD COLUMN IF NOT EXISTS modo_stock ENUM('simple','lotes') NOT NULL DEFAULT 'simple',
      ADD COLUMN IF NOT EXISTS dias_vencimiento INT NOT NULL DEFAULT 0`,
  },

  /* ── 2. presentaciones: DROP stock_vacios, stock_en_lavado ── */
  {
    name: 'presentaciones: DROP stock_vacios, stock_en_lavado',
    sql: `ALTER TABLE presentaciones
      DROP COLUMN IF EXISTS stock_vacios,
      DROP COLUMN IF EXISTS stock_en_lavado`,
  },

  /* ── 3. Set modo_stock per tipo ── */
  {
    name: "presentaciones: modo_stock='lotes' for bidones/botellas",
    sql: `UPDATE presentaciones SET modo_stock = 'lotes'
      WHERE nombre LIKE 'Bid%n%' OR nombre LIKE 'Botella%'`,
  },
  {
    name: "presentaciones: modo_stock='simple' for hielo",
    sql: `UPDATE presentaciones SET modo_stock = 'simple'
      WHERE nombre LIKE 'Hielo%'`,
  },

  /* ── 4. insumos: add es_retornable, presentacion_id, requiere_lavado ── */
  {
    name: 'insumos: ADD es_retornable, presentacion_id, requiere_lavado',
    sql: `ALTER TABLE insumos
      ADD COLUMN IF NOT EXISTS es_retornable  TINYINT(1) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS presentacion_id INT NULL,
      ADD COLUMN IF NOT EXISTS requiere_lavado TINYINT(1) NOT NULL DEFAULT 0`,
  },

  /* ── 5. insumos: FK presentacion_id ── */
  {
    name: 'insumos: ADD FK fk_insumos_presentacion',
    sql: `ALTER TABLE insumos
      ADD CONSTRAINT fk_insumos_presentacion
        FOREIGN KEY (presentacion_id) REFERENCES presentaciones(id)
        ON DELETE SET NULL ON UPDATE CASCADE`,
    ignoreCodes: [1826, 1050, 1061],
  },

  /* ── 6. lotes_produccion: add cantidad_disponible ── */
  {
    name: 'lotes_produccion: ADD cantidad_disponible',
    sql: `ALTER TABLE lotes_produccion
      ADD COLUMN IF NOT EXISTS cantidad_disponible INT NOT NULL DEFAULT 0`,
  },

  /* ── 7. Create lavados table ── */
  {
    name: 'CREATE TABLE lavados',
    sql: `CREATE TABLE IF NOT EXISTS lavados (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      insumo_id   INT NOT NULL,
      operario_id INT NULL,
      cantidad    INT NOT NULL,
      fecha_hora  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      notas       TEXT NULL,
      FOREIGN KEY (insumo_id)   REFERENCES insumos(id),
      FOREIGN KEY (operario_id) REFERENCES usuarios(id)
    )`,
  },

  /* ── 8. Insert retornable insumos ── */
  {
    name: "insumos: INSERT 'Bidón 20L vacío'",
    sql: `INSERT IGNORE INTO insumos (nombre, unidad, stock_actual, stock_minimo, es_retornable, requiere_lavado)
      VALUES ('Bidón 20L vacío', 'unidad', 0, 0, 1, 1)`,
  },
  {
    name: "insumos: INSERT 'Botella 600ml vacía'",
    sql: `INSERT IGNORE INTO insumos (nombre, unidad, stock_actual, stock_minimo, es_retornable, requiere_lavado)
      VALUES ('Botella 600ml vacía', 'unidad', 0, 0, 1, 1)`,
  },
  {
    name: "insumos: INSERT 'Botella 1.5L vacía'",
    sql: `INSERT IGNORE INTO insumos (nombre, unidad, stock_actual, stock_minimo, es_retornable, requiere_lavado)
      VALUES ('Botella 1.5L vacía', 'unidad', 0, 0, 1, 1)`,
  },

  /* ── 9. Link retornables to presentaciones ── */
  {
    name: "insumos: link 'Bidón 20L vacío' → presentacion",
    sql: `UPDATE insumos
      SET presentacion_id = (SELECT id FROM presentaciones WHERE nombre = 'Bidón 20L' LIMIT 1)
      WHERE nombre = 'Bidón 20L vacío'`,
  },
  {
    name: "insumos: link 'Botella 600ml vacía' → presentacion",
    sql: `UPDATE insumos
      SET presentacion_id = (SELECT id FROM presentaciones WHERE nombre = 'Botella 600ml' LIMIT 1)
      WHERE nombre = 'Botella 600ml vacía'`,
  },
  {
    name: "insumos: link 'Botella 1.5L vacía' → presentacion",
    sql: `UPDATE insumos
      SET presentacion_id = (SELECT id FROM presentaciones WHERE nombre LIKE 'Botella 1%' AND nombre NOT LIKE 'Botella 600%' LIMIT 1)
      WHERE nombre = 'Botella 1.5L vacía'`,
  },

  /* ── 10. Drop triggers that reference stock_vacios ── */
  { name: 'DROP trg_actualizar_stock_venta', sql: 'DROP TRIGGER IF EXISTS trg_actualizar_stock_venta' },
  { name: 'DROP trg_completar_lote',         sql: 'DROP TRIGGER IF EXISTS trg_completar_lote' },
  { name: 'DROP trg_devolucion_a_lavado',    sql: 'DROP TRIGGER IF EXISTS trg_devolucion_a_lavado' },
  { name: 'DROP trg_lavado_a_insumo',        sql: 'DROP TRIGGER IF EXISTS trg_lavado_a_insumo' },

  /* ── 11. CREATE trg_actualizar_stock_venta (stock_vacios removed) ── */
  {
    name: 'CREATE trg_actualizar_stock_venta (updated)',
    sql: `CREATE TRIGGER trg_actualizar_stock_venta
AFTER INSERT ON venta_detalle
FOR EACH ROW
BEGIN
  IF NEW.tipo_linea = 'compra_bidon' THEN
    UPDATE presentaciones
       SET stock_llenos = stock_llenos - NEW.cantidad
     WHERE id = NEW.presentacion_id;

  ELSEIF NEW.tipo_linea = 'recarga' THEN
    UPDATE presentaciones
       SET stock_llenos = stock_llenos - NEW.cantidad
     WHERE id = NEW.presentacion_id;
    -- vacíos recibidos son manejados por trg_devolucion_a_lavado

  ELSEIF NEW.tipo_linea = 'prestamo' THEN
    UPDATE presentaciones
       SET stock_llenos = stock_llenos - NEW.cantidad
     WHERE id = NEW.presentacion_id;
    UPDATE clientes
       SET bidones_prestados = bidones_prestados + NEW.cantidad
     WHERE id = (SELECT cliente_id FROM ventas WHERE id = NEW.venta_id);

  ELSEIF NEW.tipo_linea = 'producto' THEN
    UPDATE presentaciones
       SET stock_llenos = stock_llenos - NEW.cantidad
     WHERE id = NEW.presentacion_id;

  ELSEIF NEW.tipo_linea = 'devolucion' THEN
    -- vacíos manejados por trg_devolucion_a_lavado
    UPDATE clientes
       SET bidones_prestados = GREATEST(0, bidones_prestados - NEW.vacios_recibidos)
     WHERE id = (SELECT cliente_id FROM ventas WHERE id = NEW.venta_id);
  END IF;

  INSERT INTO stock_movimientos (
    presentacion_id, tipo, cantidad,
    venta_id, cliente_id, registrado_por,
    estado_origen, estado_destino
  )
  SELECT
    NEW.presentacion_id,
    CASE NEW.tipo_linea
      WHEN 'compra_bidon' THEN 'venta'
      WHEN 'recarga'      THEN 'venta'
      WHEN 'prestamo'     THEN 'prestamo'
      WHEN 'producto'     THEN 'venta'
      WHEN 'devolucion'   THEN 'devolucion_cliente'
    END,
    NEW.cantidad,
    NEW.venta_id,
    v.cliente_id,
    v.vendedor_id,
    CASE NEW.tipo_linea
      WHEN 'devolucion' THEN 'en_ruta_vacio'
      ELSE 'lleno'
    END,
    CASE NEW.tipo_linea
      WHEN 'devolucion' THEN 'vacio'
      ELSE 'en_ruta_lleno'
    END
  FROM ventas v WHERE v.id = NEW.venta_id;
END`,
  },

  /* ── 12. CREATE trg_completar_lote (modo_stock logic, no stock_vacios) ── */
  {
    name: 'CREATE trg_completar_lote (updated for modo_stock)',
    sql: `CREATE TRIGGER trg_completar_lote
AFTER UPDATE ON lotes_produccion
FOR EACH ROW
BEGIN
  DECLARE v_modo ENUM('simple','lotes');

  IF NEW.estado = 'completado' AND OLD.estado <> 'completado' THEN
    SELECT modo_stock INTO v_modo FROM presentaciones WHERE id = NEW.presentacion_id;

    -- Descontar insumos no opcionales por receta
    UPDATE insumos i
    JOIN recetas_produccion r
      ON r.insumo_id = i.id
     AND r.presentacion_id = NEW.presentacion_id
     AND r.es_opcional = 0
       SET i.stock_actual = i.stock_actual - (r.cantidad * NEW.cantidad_producida);

    INSERT INTO insumos_movimientos (insumo_id, tipo, cantidad, lote_id, motivo)
    SELECT
      r.insumo_id,
      'consumo_lote',
      -(r.cantidad * NEW.cantidad_producida),
      NEW.id,
      CONCAT('Lote ', NEW.numero, ' — ', NEW.cantidad_producida, ' unidades')
    FROM recetas_produccion r
    WHERE r.presentacion_id = NEW.presentacion_id
      AND r.es_opcional = 0;

    -- Actualizar stock según modo
    IF v_modo = 'simple' THEN
      UPDATE presentaciones
         SET stock_llenos = stock_llenos + NEW.cantidad_producida
       WHERE id = NEW.presentacion_id;
    END IF;
    -- Para modo 'lotes': cantidad_disponible ya fue seteada por el controlador

    INSERT INTO stock_movimientos (
      presentacion_id, tipo, cantidad,
      registrado_por, estado_origen, estado_destino
    ) VALUES (
      NEW.presentacion_id, 'llenado', NEW.cantidad_producida,
      NEW.operario_id, 'vacio', 'lleno'
    );

  END IF;
END`,
  },

  /* ── 13. CREATE trg_devolucion_a_lavado ── */
  {
    name: 'CREATE trg_devolucion_a_lavado',
    sql: `CREATE TRIGGER trg_devolucion_a_lavado
AFTER INSERT ON venta_detalle
FOR EACH ROW
BEGIN
  DECLARE v_insumo_id    INT;
  DECLARE v_req_lavado   TINYINT;
  DECLARE v_cliente_id   INT;

  IF NEW.tipo_linea IN ('recarga', 'devolucion') AND NEW.vacios_recibidos > 0 THEN
    SELECT id, requiere_lavado INTO v_insumo_id, v_req_lavado
    FROM insumos
    WHERE presentacion_id = NEW.presentacion_id
      AND es_retornable = 1
    LIMIT 1;

    IF v_insumo_id IS NOT NULL THEN
      IF v_req_lavado = 0 THEN
        -- Envase sin suciedad: entra directo al stock de insumos
        UPDATE insumos
           SET stock_actual = stock_actual + NEW.vacios_recibidos
         WHERE id = v_insumo_id;
        INSERT INTO insumos_movimientos (insumo_id, tipo, cantidad, motivo)
        VALUES (v_insumo_id, 'ajuste_entrada', NEW.vacios_recibidos,
          CONCAT('Devolución directa — venta #', NEW.venta_id));
      ELSE
        -- Envase sucio: va a cola de lavado
        SELECT cliente_id INTO v_cliente_id FROM ventas WHERE id = NEW.venta_id;
        INSERT INTO stock_movimientos (
          presentacion_id, tipo, cantidad,
          venta_id, cliente_id,
          estado_origen, estado_destino
        ) VALUES (
          NEW.presentacion_id,
          'devolucion_cliente',
          NEW.vacios_recibidos,
          NEW.venta_id,
          v_cliente_id,
          'en_ruta_vacio',
          'en_lavado'
        );
      END IF;
    END IF;
  END IF;
END`,
  },

  /* ── 14. CREATE trg_lavado_a_insumo ── */
  {
    name: 'CREATE trg_lavado_a_insumo',
    sql: `CREATE TRIGGER trg_lavado_a_insumo
AFTER INSERT ON lavados
FOR EACH ROW
BEGIN
  UPDATE insumos
     SET stock_actual = stock_actual + NEW.cantidad
   WHERE id = NEW.insumo_id;
  INSERT INTO insumos_movimientos (insumo_id, tipo, cantidad, motivo)
  VALUES (NEW.insumo_id, 'ajuste_entrada', NEW.cantidad,
    CONCAT('Lavado completado: ', NEW.cantidad, ' unidades'));
END`,
  },

  /* ── 15. Refresh recetas para Bidón 20L ── */
  {
    name: 'recetas: DELETE for all Bidón/Bidon 20L',
    sql: `DELETE FROM recetas_produccion
      WHERE presentacion_id IN (
        SELECT id FROM presentaciones WHERE nombre LIKE '%id%n 20L' OR nombre = 'Bidon 20L'
      )`,
  },
  {
    name: 'recetas: INSERT Tapa bidón',
    sql: `INSERT INTO recetas_produccion (presentacion_id, insumo_id, cantidad, es_opcional)
      SELECT p.id, i.id, 1, 0
      FROM presentaciones p, insumos i
      WHERE (p.nombre LIKE '%idón 20L' OR p.nombre = 'Bidon 20L')
        AND i.nombre = 'Tapa bidón'`,
  },
  {
    name: 'recetas: INSERT Cinta de seguridad',
    sql: `INSERT INTO recetas_produccion (presentacion_id, insumo_id, cantidad, es_opcional)
      SELECT p.id, i.id, 2, 0
      FROM presentaciones p, insumos i
      WHERE (p.nombre LIKE '%idón 20L' OR p.nombre = 'Bidon 20L')
        AND i.nombre = 'Cinta de seguridad'`,
  },
  {
    name: 'recetas: INSERT Etiqueta bidón',
    sql: `INSERT INTO recetas_produccion (presentacion_id, insumo_id, cantidad, es_opcional)
      SELECT p.id, i.id, 1, 0
      FROM presentaciones p, insumos i
      WHERE (p.nombre LIKE '%idón 20L' OR p.nombre = 'Bidon 20L')
        AND i.nombre = 'Etiqueta bidón'`,
  },
  {
    name: 'recetas: INSERT Caño / válvula (opcional)',
    sql: `INSERT INTO recetas_produccion (presentacion_id, insumo_id, cantidad, es_opcional)
      SELECT p.id, i.id, 1, 1
      FROM presentaciones p, insumos i
      WHERE (p.nombre LIKE '%idón 20L' OR p.nombre = 'Bidon 20L')
        AND i.nombre = 'Caño / válvula'`,
  },
  {
    name: 'recetas: INSERT Agua (m3)',
    sql: `INSERT INTO recetas_produccion (presentacion_id, insumo_id, cantidad, es_opcional)
      SELECT p.id, i.id, 20, 0
      FROM presentaciones p, insumos i
      WHERE (p.nombre LIKE '%idón 20L' OR p.nombre = 'Bidon 20L')
        AND i.nombre = 'Agua (m3)'`,
  },
  {
    name: "recetas: INSERT 'Bidón 20L vacío' (envase retornable)",
    sql: `INSERT INTO recetas_produccion (presentacion_id, insumo_id, cantidad, es_opcional)
      SELECT p.id, i.id, 1, 0
      FROM presentaciones p, insumos i
      WHERE (p.nombre LIKE '%idón 20L' OR p.nombre = 'Bidon 20L')
        AND i.nombre = 'Bidón 20L vacío'`,
  },

  /* ── 16. CREATE OR REPLACE VIEW v_insumos_stock ── */
  {
    name: 'CREATE OR REPLACE VIEW v_insumos_stock',
    sql: `CREATE OR REPLACE VIEW v_insumos_stock AS
SELECT
  i.id,
  i.nombre,
  i.unidad,
  i.stock_actual,
  i.stock_minimo,
  i.precio_unitario,
  i.es_retornable,
  i.requiere_lavado,
  i.presentacion_id,
  p.nombre AS presentacion_vinculada,
  i.activo,
  CASE
    WHEN i.stock_actual <= 0             THEN 'agotado'
    WHEN i.stock_actual <= i.stock_minimo THEN 'bajo'
    ELSE 'ok'
  END AS alerta
FROM insumos i
LEFT JOIN presentaciones p ON p.id = i.presentacion_id
WHERE i.activo = 1`,
  },

  /* ── 17. CREATE OR REPLACE VIEW v_pendientes_lavado ── */
  {
    name: 'CREATE OR REPLACE VIEW v_pendientes_lavado',
    sql: `CREATE OR REPLACE VIEW v_pendientes_lavado AS
SELECT
  p.id   AS presentacion_id,
  p.nombre AS presentacion_nombre,
  COALESCE(sm_in.total, 0) - COALESCE(lav_out.total, 0) AS pendientes_lavado
FROM presentaciones p
LEFT JOIN (
  SELECT presentacion_id, SUM(cantidad) AS total
  FROM stock_movimientos
  WHERE estado_destino = 'en_lavado'
  GROUP BY presentacion_id
) sm_in ON sm_in.presentacion_id = p.id
LEFT JOIN (
  SELECT i.presentacion_id, SUM(l.cantidad) AS total
  FROM lavados l
  JOIN insumos i ON i.id = l.insumo_id
  WHERE i.presentacion_id IS NOT NULL
  GROUP BY i.presentacion_id
) lav_out ON lav_out.presentacion_id = p.id
WHERE p.activo = 1
  AND (COALESCE(sm_in.total, 0) - COALESCE(lav_out.total, 0)) > 0`,
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
