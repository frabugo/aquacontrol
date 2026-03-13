// backend/scripts/run_migration_v6.js
// Migration v6 — Mejoras módulo lavado: ingresos_vacios, trigger fix, SP fix, view fix
const db = require('../db');

const steps = [

  /* ── 1. Tabla ingresos_vacios ── */
  {
    name: 'CREATE TABLE ingresos_vacios',
    sql: `CREATE TABLE IF NOT EXISTS ingresos_vacios (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      presentacion_id  INT NOT NULL,
      cantidad         INT NOT NULL,
      origen           ENUM('visita_planta','finalizacion_ruta','devolucion_cliente') NOT NULL,
      ruta_id          INT NULL,
      visita_id        INT NULL,
      repartidor_id    INT NULL,
      registrado_por   INT NOT NULL,
      notas            TEXT NULL,
      fecha_hora       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_iv_fecha (fecha_hora),
      INDEX idx_iv_ruta (ruta_id)
    )`,
  },

  /* ── 2. lavados.presentacion_id + insumo_id nullable ── */
  {
    name: 'lavados: ADD COLUMN presentacion_id',
    sql: `ALTER TABLE lavados ADD COLUMN IF NOT EXISTS presentacion_id INT NULL`,
  },
  {
    name: 'lavados: MODIFY insumo_id nullable',
    sql: `ALTER TABLE lavados MODIFY COLUMN insumo_id INT NULL`,
  },

  /* ── 3. Trigger: trg_devolucion_a_lavado — skip reparto + usar presentaciones.es_retornable ── */
  { name: 'DROP trg_devolucion_a_lavado', sql: 'DROP TRIGGER IF EXISTS trg_devolucion_a_lavado' },
  {
    name: 'CREATE trg_devolucion_a_lavado (v6 — skip reparto, all retornables)',
    sql: `CREATE TRIGGER trg_devolucion_a_lavado
AFTER INSERT ON venta_detalle
FOR EACH ROW
BEGIN
  DECLARE v_insumo_id     INT DEFAULT NULL;
  DECLARE v_req_lavado    TINYINT DEFAULT 1;
  DECLARE v_es_retornable TINYINT DEFAULT 0;
  DECLARE v_cliente_id    INT;
  DECLARE v_ruta_id       INT;

  IF NEW.tipo_linea IN ('recarga', 'devolucion') AND NEW.vacios_recibidos > 0 THEN

    -- Si la venta pertenece a una ruta de reparto, no hacer nada:
    -- los vacíos están en el vehículo, no en planta
    SELECT ruta_id INTO v_ruta_id FROM ventas WHERE id = NEW.venta_id;
    IF v_ruta_id IS NOT NULL THEN
      SET v_insumo_id = NULL;
    ELSE
      -- Verificar si la presentación es retornable (no depende de insumo vinculado)
      SELECT es_retornable INTO v_es_retornable
      FROM presentaciones WHERE id = NEW.presentacion_id;

      IF v_es_retornable = 1 THEN
        -- Intentar buscar insumo retornable vinculado (puede no existir)
        SELECT id, requiere_lavado INTO v_insumo_id, v_req_lavado
        FROM insumos
        WHERE presentacion_id = NEW.presentacion_id
          AND es_retornable = 1
        LIMIT 1;

        IF v_insumo_id IS NOT NULL AND v_req_lavado = 0 THEN
          -- Envase sin suciedad: entra directo al stock de insumos
          UPDATE insumos
             SET stock_actual = stock_actual + NEW.vacios_recibidos
           WHERE id = v_insumo_id;
          INSERT INTO insumos_movimientos (insumo_id, tipo, cantidad, motivo)
          VALUES (v_insumo_id, 'ajuste_entrada', NEW.vacios_recibidos,
            CONCAT('Devolucion directa — venta #', NEW.venta_id));
        ELSE
          -- Envase sucio o sin insumo vinculado: va a cola de lavado
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
  END IF;
END`,
  },

  /* ── 4. SP: sp_finalizar_ruta — ya NO toca stock_vacios ── */
  { name: 'DROP sp_finalizar_ruta', sql: 'DROP PROCEDURE IF EXISTS sp_finalizar_ruta' },
  {
    name: 'CREATE sp_finalizar_ruta (v6 — sin stock_vacios)',
    sql: `CREATE PROCEDURE sp_finalizar_ruta(
  IN p_ruta_id     INT,
  IN p_usuario_id  INT
)
BEGIN
  -- Devolver llenos sobrantes a planta
  UPDATE presentaciones p
  JOIN stock_vehiculo sv ON sv.presentacion_id = p.id AND sv.ruta_id = p_ruta_id
     SET p.stock_llenos = p.stock_llenos + sv.llenos_sobrantes;

  -- Marcar ruta como finalizada
  UPDATE rutas
     SET estado = 'finalizada', hora_regreso = NOW()
   WHERE id = p_ruta_id;
END`,
  },

  /* ── 5. Trigger: trg_lavado_a_insumo — handle NULL insumo_id + update presentaciones.stock_vacios ── */
  { name: 'DROP trg_lavado_a_insumo', sql: 'DROP TRIGGER IF EXISTS trg_lavado_a_insumo' },
  {
    name: 'CREATE trg_lavado_a_insumo (v6 — stock_vacios + nullable insumo_id)',
    sql: `CREATE TRIGGER trg_lavado_a_insumo
AFTER INSERT ON lavados
FOR EACH ROW
BEGIN
  DECLARE v_pres_id INT DEFAULT NULL;

  -- Si tiene insumo_id, actualizar stock de insumo
  IF NEW.insumo_id IS NOT NULL THEN
    UPDATE insumos
       SET stock_actual = stock_actual + NEW.cantidad
     WHERE id = NEW.insumo_id;
    INSERT INTO insumos_movimientos (insumo_id, tipo, cantidad, motivo)
    VALUES (NEW.insumo_id, 'ajuste_entrada', NEW.cantidad,
      CONCAT('Lavado completado: ', NEW.cantidad, ' unidades'));
  END IF;

  -- Resolver presentacion_id
  SET v_pres_id = NEW.presentacion_id;
  IF v_pres_id IS NULL AND NEW.insumo_id IS NOT NULL THEN
    SELECT presentacion_id INTO v_pres_id FROM insumos WHERE id = NEW.insumo_id;
  END IF;

  -- Incrementar stock_vacios en presentaciones (lavado convierte en_lavado -> vacio limpio)
  IF v_pres_id IS NOT NULL THEN
    UPDATE presentaciones
       SET stock_vacios = stock_vacios + NEW.cantidad
     WHERE id = v_pres_id;
  END IF;
END`,
  },

  /* ── 6. Trigger: trg_completar_lote — descontar stock_vacios en produccion ── */
  { name: 'DROP trg_completar_lote', sql: 'DROP TRIGGER IF EXISTS trg_completar_lote' },
  {
    name: 'CREATE trg_completar_lote (v6 — decrement stock_vacios)',
    sql: `CREATE TRIGGER trg_completar_lote
BEFORE UPDATE ON lotes_produccion
FOR EACH ROW
BEGIN
  IF NEW.estado = 'completado' AND OLD.estado <> 'completado' THEN

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

  /* ── 7. SP: sp_cargar_vehiculo — UPDATE atómico para evitar race condition ── */
  { name: 'DROP sp_cargar_vehiculo', sql: 'DROP PROCEDURE IF EXISTS sp_cargar_vehiculo' },
  {
    name: 'CREATE sp_cargar_vehiculo (v6 — atomic stock check)',
    sql: `CREATE PROCEDURE sp_cargar_vehiculo(
  IN p_ruta_id        INT,
  IN p_presentacion_id INT,
  IN p_cantidad       INT,
  IN p_usuario_id     INT,
  OUT p_ok            TINYINT,
  OUT p_mensaje       VARCHAR(200)
)
BEGIN
  DECLARE v_affected INT DEFAULT 0;
  DECLARE v_stock_planta INT DEFAULT 0;

  UPDATE presentaciones
     SET stock_llenos = stock_llenos - p_cantidad
   WHERE id = p_presentacion_id
     AND stock_llenos >= p_cantidad;

  SET v_affected = ROW_COUNT();

  IF v_affected = 0 THEN
    SELECT stock_llenos INTO v_stock_planta FROM presentaciones WHERE id = p_presentacion_id;
    SET p_ok = 0;
    SET p_mensaje = CONCAT('Stock insuficiente en planta. Disponible: ', v_stock_planta, ', Solicitado: ', p_cantidad);
  ELSE
    INSERT INTO stock_vehiculo (ruta_id, presentacion_id, llenos_cargados)
    VALUES (p_ruta_id, p_presentacion_id, p_cantidad)
    ON DUPLICATE KEY UPDATE llenos_cargados = llenos_cargados + p_cantidad;

    INSERT INTO stock_movimientos (presentacion_id, tipo, cantidad, estado_origen, estado_destino, registrado_por, motivo)
    VALUES (p_presentacion_id, 'carga_salida', p_cantidad, 'lleno', 'en_ruta_lleno', p_usuario_id, CONCAT('Carga vehiculo ruta #', p_ruta_id));

    SET p_ok = 1;
    SET p_mensaje = 'OK';
  END IF;
END`,
  },

  /* ── 8. View: v_pendientes_lavado — soportar lavados con presentacion_id directo ── */
  {
    name: 'CREATE OR REPLACE VIEW v_pendientes_lavado (v6)',
    sql: `CREATE OR REPLACE VIEW v_pendientes_lavado AS
SELECT
  p.id   AS presentacion_id,
  p.nombre AS presentacion_nombre,
  GREATEST(0, COALESCE(sm_in.total, 0) - COALESCE(lav_out.total, 0)) AS pendientes_lavado
FROM presentaciones p
LEFT JOIN (
  SELECT presentacion_id, SUM(cantidad) AS total
  FROM stock_movimientos
  WHERE estado_destino = 'en_lavado'
  GROUP BY presentacion_id
) sm_in ON sm_in.presentacion_id = p.id
LEFT JOIN (
  SELECT COALESCE(l.presentacion_id, i.presentacion_id) AS presentacion_id,
         SUM(l.cantidad) AS total
  FROM lavados l
  LEFT JOIN insumos i ON i.id = l.insumo_id
  WHERE COALESCE(l.presentacion_id, i.presentacion_id) IS NOT NULL
  GROUP BY COALESCE(l.presentacion_id, i.presentacion_id)
) lav_out ON lav_out.presentacion_id = p.id
WHERE p.activo = 1
  AND p.es_retornable = 1`,
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
