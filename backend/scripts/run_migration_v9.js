// backend/scripts/run_migration_v9.js
// Migration v9 — Retornables siempre pasan por lavado
// Stock de retornables vive en presentaciones (stock_vacios/stock_llenos)
const db = require('../db');

const steps = [

  /* ── 1. trg_compra_actualiza_stock ──
     - Retornable → stock_movimientos (en_lavado) → lavar → stock_vacios
     - No retornable insumo → insumos.stock_actual                      ── */
  { name: 'DROP trg_compra_actualiza_stock', sql: 'DROP TRIGGER IF EXISTS trg_compra_actualiza_stock' },
  {
    name: 'CREATE trg_compra_actualiza_stock (v9 — retornables a lavado)',
    sql: `CREATE TRIGGER trg_compra_actualiza_stock
AFTER INSERT ON compra_detalle
FOR EACH ROW
BEGIN
  DECLARE v_es_ret TINYINT DEFAULT 0;

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
    SELECT es_retornable INTO v_es_ret
    FROM presentaciones WHERE id = NEW.presentacion_id;

    IF v_es_ret = 1 THEN
      -- Retornable: siempre va a cola de lavado
      INSERT INTO stock_movimientos
        (presentacion_id, tipo, cantidad, estado_origen, estado_destino, motivo)
      VALUES
        (NEW.presentacion_id, 'compra_empresa', NEW.cantidad, NULL, 'en_lavado',
         CONCAT('Compra envases #', NEW.compra_id, ' — pendiente lavado'));
      UPDATE presentaciones
         SET stock_en_lavado = stock_en_lavado + NEW.cantidad
       WHERE id = NEW.presentacion_id;
    END IF;
  END IF;
END`,
  },

  /* ── 2. trg_lavado_a_insumo ──
     - Non-retornable insumo: insumos.stock_actual
     - Siempre: presentaciones.stock_vacios                 ── */
  { name: 'DROP trg_lavado_a_insumo', sql: 'DROP TRIGGER IF EXISTS trg_lavado_a_insumo' },
  {
    name: 'CREATE trg_lavado_a_insumo (v9)',
    sql: `CREATE TRIGGER trg_lavado_a_insumo
AFTER INSERT ON lavados
FOR EACH ROW
BEGIN
  DECLARE v_pres_id INT DEFAULT NULL;
  DECLARE v_is_ret TINYINT DEFAULT 0;

  IF NEW.insumo_id IS NOT NULL THEN
    SELECT es_retornable INTO v_is_ret FROM insumos WHERE id = NEW.insumo_id;
    IF v_is_ret = 0 THEN
      UPDATE insumos
         SET stock_actual = stock_actual + NEW.cantidad
       WHERE id = NEW.insumo_id;
      INSERT INTO insumos_movimientos (insumo_id, tipo, cantidad, motivo)
      VALUES (NEW.insumo_id, 'ajuste_entrada', NEW.cantidad,
        CONCAT('Lavado completado: ', NEW.cantidad, ' unidades'));
    END IF;
  END IF;

  SET v_pres_id = NEW.presentacion_id;
  IF v_pres_id IS NULL AND NEW.insumo_id IS NOT NULL THEN
    SELECT presentacion_id INTO v_pres_id FROM insumos WHERE id = NEW.insumo_id;
  END IF;

  IF v_pres_id IS NOT NULL THEN
    UPDATE presentaciones
       SET stock_vacios = stock_vacios + NEW.cantidad,
           stock_en_lavado = GREATEST(0, stock_en_lavado - NEW.cantidad)
     WHERE id = v_pres_id;
  END IF;
END`,
  },

  /* ── 3. trg_completar_lote ──
     - Skip retornable insumos (stock vive en presentaciones)
     - stock_vacios se descuenta para retornables                ── */
  { name: 'DROP trg_completar_lote', sql: 'DROP TRIGGER IF EXISTS trg_completar_lote' },
  {
    name: 'CREATE trg_completar_lote (v9)',
    sql: `CREATE TRIGGER trg_completar_lote
BEFORE UPDATE ON lotes_produccion
FOR EACH ROW
BEGIN
  IF NEW.estado = 'completado' AND OLD.estado <> 'completado' THEN

    -- Descontar insumos NO retornables (agua, tapas, etiquetas, etc.)
    UPDATE insumos i
    JOIN recetas_produccion r
      ON r.insumo_id = i.id
     AND r.presentacion_id = NEW.presentacion_id
     AND r.es_opcional = 0
     AND i.es_retornable = 0
       SET i.stock_actual = i.stock_actual - (r.cantidad * NEW.cantidad_producida);

    INSERT INTO insumos_movimientos (insumo_id, tipo, cantidad, lote_id, motivo)
    SELECT
      r.insumo_id,
      'consumo_lote',
      -(r.cantidad * NEW.cantidad_producida),
      NEW.id,
      CONCAT('Lote ', NEW.numero, ' — ', NEW.cantidad_producida, ' unidades')
    FROM recetas_produccion r
    JOIN insumos i ON i.id = r.insumo_id AND i.es_retornable = 0
    WHERE r.presentacion_id = NEW.presentacion_id
      AND r.es_opcional = 0;

    -- Actualizar stock_llenos
    UPDATE presentaciones
       SET stock_llenos = stock_llenos + NEW.cantidad_producida
     WHERE id = NEW.presentacion_id;

    -- Descontar vacios usados en produccion (llenado consume envases limpios)
    UPDATE presentaciones
       SET stock_vacios = GREATEST(0, stock_vacios - NEW.cantidad_producida)
     WHERE id = NEW.presentacion_id AND es_retornable = 1;

    -- Registrar movimiento de stock
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

  /* ── 4. trg_devolucion_a_lavado ──
     - Retornable: siempre a cola de lavado
     - No retornable: no hace nada                            ── */
  { name: 'DROP trg_devolucion_a_lavado', sql: 'DROP TRIGGER IF EXISTS trg_devolucion_a_lavado' },
  {
    name: 'CREATE trg_devolucion_a_lavado (v9)',
    sql: `CREATE TRIGGER trg_devolucion_a_lavado
AFTER INSERT ON venta_detalle
FOR EACH ROW
BEGIN
  DECLARE v_es_ret TINYINT DEFAULT 0;
  DECLARE v_cliente_id INT;
  DECLARE v_ruta_id INT;

  IF NEW.tipo_linea IN ('recarga', 'devolucion') AND NEW.vacios_recibidos > 0 THEN
    SELECT ruta_id INTO v_ruta_id FROM ventas WHERE id = NEW.venta_id;

    IF v_ruta_id IS NULL THEN
      SELECT es_retornable INTO v_es_ret
      FROM presentaciones WHERE id = NEW.presentacion_id;

      IF v_es_ret = 1 THEN
        -- Retornable: siempre a cola de lavado
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

];

(async () => {
  const conn = await db.getConnection();
  let ok = 0, skipped = 0, failed = 0;
  try {
    for (const step of steps) {
      try {
        await conn.query(step.sql);
        console.log(`\u2705 [${++ok}] ${step.name}`);
      } catch (err) {
        if (step.ignoreCodes?.includes(err.errno)) {
          console.log(`\u23ED  [skip] ${step.name} \u2014 ${err.message}`);
          skipped++;
        } else {
          console.error(`\u274C [FAIL] ${step.name}`);
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
