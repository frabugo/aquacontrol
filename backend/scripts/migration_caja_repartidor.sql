-- ============================================================
-- MIGRACIÓN: Integrar flujo de dinero de repartidores en Caja principal
-- ============================================================

-- ── 1a. Columnas nuevas en caja_movimientos ──
ALTER TABLE caja_movimientos
  ADD COLUMN IF NOT EXISTS origen ENUM('directo','repartidor') NOT NULL DEFAULT 'directo',
  ADD COLUMN IF NOT EXISTS caja_ruta_id INT NULL,
  ADD COLUMN IF NOT EXISTS estado_entrega ENUM('entregado','pendiente') NULL;

ALTER TABLE caja_movimientos
  ADD INDEX IF NOT EXISTS idx_cm_origen (origen),
  ADD INDEX IF NOT EXISTS idx_cm_caja_ruta (caja_ruta_id),
  ADD INDEX IF NOT EXISTS idx_cm_estado_entrega (estado_entrega);

-- FK caja_ruta_id → caja_ruta
-- (IF NOT EXISTS no funciona con FK en MariaDB, usamos handler)
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'caja_movimientos'
    AND CONSTRAINT_NAME = 'fk_cm_caja_ruta');

SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE caja_movimientos ADD CONSTRAINT fk_cm_caja_ruta FOREIGN KEY (caja_ruta_id) REFERENCES caja_ruta(id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ── 1b. Trigger: al entregar caja_ruta → marcar movimientos como entregados ──
DROP TRIGGER IF EXISTS trg_entrega_caja_ruta;
DELIMITER $
CREATE TRIGGER trg_entrega_caja_ruta
AFTER UPDATE ON caja_ruta
FOR EACH ROW
BEGIN
  IF OLD.estado = 'abierta' AND NEW.estado = 'entregada' THEN
    UPDATE caja_movimientos
       SET estado_entrega = 'entregado'
     WHERE caja_ruta_id = NEW.id
       AND estado_entrega = 'pendiente';
  END IF;
END$
DELIMITER ;

-- ── 1c. Reemplazar trigger ventas reparto → ahora también inserta en caja principal ──
DROP TRIGGER IF EXISTS trg_venta_reparto_a_caja;
DELIMITER $
CREATE TRIGGER trg_venta_reparto_a_caja
AFTER INSERT ON ventas
FOR EACH ROW
BEGIN
  DECLARE v_caja_ruta_id INT DEFAULT NULL;
  DECLARE v_caja_principal INT DEFAULT NULL;

  IF NEW.ruta_id IS NOT NULL THEN
    SELECT id INTO v_caja_ruta_id
      FROM caja_ruta
     WHERE ruta_id = NEW.ruta_id AND estado = 'abierta'
     LIMIT 1;

    SELECT id INTO v_caja_principal
      FROM cajas WHERE estado IN ('abierta','reabierta')
     ORDER BY fecha DESC LIMIT 1;

    IF v_caja_ruta_id IS NOT NULL THEN
      -- Registrar en caja_ruta_movimientos (como antes)
      IF NEW.pagado_efectivo > 0 THEN
        INSERT INTO caja_ruta_movimientos
          (caja_ruta_id, venta_id, tipo, metodo_pago, monto, descripcion, registrado_por)
        VALUES (v_caja_ruta_id, NEW.id, 'cobro_venta', 'efectivo',
          NEW.pagado_efectivo, CONCAT('Venta ', COALESCE(NEW.folio, CONCAT('#',NEW.id))), NEW.vendedor_id);
      END IF;
      IF NEW.pagado_transferencia > 0 THEN
        INSERT INTO caja_ruta_movimientos
          (caja_ruta_id, venta_id, tipo, metodo_pago, monto, descripcion, registrado_por)
        VALUES (v_caja_ruta_id, NEW.id, 'cobro_venta', 'transferencia',
          NEW.pagado_transferencia, CONCAT('Venta ', COALESCE(NEW.folio, CONCAT('#',NEW.id))), NEW.vendedor_id);
      END IF;
      IF NEW.pagado_tarjeta > 0 THEN
        INSERT INTO caja_ruta_movimientos
          (caja_ruta_id, venta_id, tipo, metodo_pago, monto, descripcion, registrado_por)
        VALUES (v_caja_ruta_id, NEW.id, 'cobro_venta', 'tarjeta',
          NEW.pagado_tarjeta, CONCAT('Venta ', COALESCE(NEW.folio, CONCAT('#',NEW.id))), NEW.vendedor_id);
      END IF;
      IF NEW.pagado_credito > 0 THEN
        INSERT INTO caja_ruta_movimientos
          (caja_ruta_id, venta_id, tipo, metodo_pago, monto, descripcion, registrado_por)
        VALUES (v_caja_ruta_id, NEW.id, 'cobro_venta', 'credito',
          NEW.pagado_credito, CONCAT('Venta al fiado ', COALESCE(NEW.folio, CONCAT('#',NEW.id))), NEW.vendedor_id);
      END IF;

      -- Actualizar totales caja_ruta
      UPDATE caja_ruta
         SET cobrado_efectivo      = cobrado_efectivo      + NEW.pagado_efectivo,
             cobrado_transferencia = cobrado_transferencia + NEW.pagado_transferencia,
             cobrado_tarjeta       = cobrado_tarjeta       + NEW.pagado_tarjeta,
             cobrado_credito       = cobrado_credito       + NEW.pagado_credito,
             total_cobrado = total_cobrado
                           + NEW.pagado_efectivo + NEW.pagado_transferencia
                           + NEW.pagado_tarjeta  + NEW.pagado_credito,
             neto_a_entregar = total_cobrado
                             + NEW.pagado_efectivo + NEW.pagado_transferencia
                             + NEW.pagado_tarjeta  + NEW.pagado_credito
                             - total_gastos
       WHERE id = v_caja_ruta_id;

      -- ── NUEVO: También insertar en caja_movimientos principal (como pendiente) ──
      IF v_caja_principal IS NOT NULL THEN
        IF NEW.pagado_efectivo > 0 THEN
          INSERT INTO caja_movimientos
            (caja_id, tipo, metodo_pago, monto, descripcion, registrado_por, venta_id,
             origen, caja_ruta_id, estado_entrega)
          VALUES (v_caja_principal, 'ingreso', 'efectivo', NEW.pagado_efectivo,
            CONCAT('Reparto: Venta ', COALESCE(NEW.folio, CONCAT('#',NEW.id))), NEW.vendedor_id, NEW.id,
            'repartidor', v_caja_ruta_id, 'pendiente');
        END IF;
        IF NEW.pagado_transferencia > 0 THEN
          INSERT INTO caja_movimientos
            (caja_id, tipo, metodo_pago, monto, descripcion, registrado_por, venta_id,
             origen, caja_ruta_id, estado_entrega)
          VALUES (v_caja_principal, 'ingreso', 'transferencia', NEW.pagado_transferencia,
            CONCAT('Reparto: Venta ', COALESCE(NEW.folio, CONCAT('#',NEW.id))), NEW.vendedor_id, NEW.id,
            'repartidor', v_caja_ruta_id, 'pendiente');
        END IF;
        IF NEW.pagado_tarjeta > 0 THEN
          INSERT INTO caja_movimientos
            (caja_id, tipo, metodo_pago, monto, descripcion, registrado_por, venta_id,
             origen, caja_ruta_id, estado_entrega)
          VALUES (v_caja_principal, 'ingreso', 'tarjeta', NEW.pagado_tarjeta,
            CONCAT('Reparto: Venta ', COALESCE(NEW.folio, CONCAT('#',NEW.id))), NEW.vendedor_id, NEW.id,
            'repartidor', v_caja_ruta_id, 'pendiente');
        END IF;
        IF NEW.pagado_credito > 0 THEN
          INSERT INTO caja_movimientos
            (caja_id, tipo, metodo_pago, monto, descripcion, registrado_por, venta_id,
             origen, caja_ruta_id, estado_entrega)
          VALUES (v_caja_principal, 'ingreso', 'credito', NEW.pagado_credito,
            CONCAT('Reparto: Venta fiado ', COALESCE(NEW.folio, CONCAT('#',NEW.id))), NEW.vendedor_id, NEW.id,
            'repartidor', v_caja_ruta_id, 'pendiente');
        END IF;
      END IF;
    END IF;
  END IF;
END$
DELIMITER ;

-- ── 1d. Trigger: gastos de repartidor también van a caja principal ──
DROP TRIGGER IF EXISTS trg_gasto_repartidor_a_caja;
DELIMITER $
CREATE TRIGGER trg_gasto_repartidor_a_caja
AFTER INSERT ON caja_ruta_movimientos
FOR EACH ROW
BEGIN
  DECLARE v_caja_principal INT DEFAULT NULL;

  IF NEW.tipo = 'gasto' THEN
    SELECT id INTO v_caja_principal
      FROM cajas WHERE estado IN ('abierta','reabierta')
     ORDER BY fecha DESC LIMIT 1;

    IF v_caja_principal IS NOT NULL THEN
      INSERT INTO caja_movimientos
        (caja_id, tipo, metodo_pago, monto, descripcion, registrado_por,
         origen, caja_ruta_id, estado_entrega)
      VALUES (v_caja_principal, 'egreso', NEW.metodo_pago, NEW.monto,
        CONCAT('Gasto reparto: ', COALESCE(NEW.descripcion, '')), NEW.registrado_por,
        'repartidor', NEW.caja_ruta_id, 'pendiente');
    END IF;
  END IF;
END$
DELIMITER ;

-- ── 1e. Vista: cajas de repartidores hoy ──
DROP VIEW IF EXISTS v_cajas_repartidores;
CREATE VIEW v_cajas_repartidores AS
SELECT
  cr.id AS caja_ruta_id,
  cr.ruta_id,
  r.numero AS ruta_numero,
  r.fecha,
  r.estado AS ruta_estado,
  cr.repartidor_id,
  u.nombre AS repartidor_nombre,
  v.placa AS vehiculo_placa,
  v.marca AS vehiculo_marca,
  cr.cobrado_efectivo,
  cr.cobrado_transferencia,
  cr.cobrado_tarjeta,
  cr.cobrado_credito,
  cr.total_cobrado,
  cr.gasto_combustible,
  cr.gasto_alimentacion,
  cr.gasto_otros,
  cr.total_gastos,
  cr.neto_a_entregar,
  cr.estado AS caja_estado,
  cr.entregada_a,
  cr.entregada_en,
  ue.nombre AS entregada_a_nombre,
  (SELECT COUNT(*) FROM pedidos p WHERE p.ruta_id = r.id) AS total_pedidos,
  (SELECT COUNT(*) FROM pedidos p WHERE p.ruta_id = r.id AND p.estado = 'entregado') AS pedidos_entregados
FROM caja_ruta cr
JOIN rutas r ON r.id = cr.ruta_id
JOIN usuarios u ON u.id = cr.repartidor_id
LEFT JOIN vehiculos v ON v.id = r.vehiculo_id
LEFT JOIN usuarios ue ON ue.id = cr.entregada_a;

-- ── 1f. Reemplazar SP entregar caja ruta ──
-- Ya no necesita INSERT en caja_movimientos (los triggers 1c y 1d lo hicieron como pendientes).
-- Solo UPDATE caja_ruta → el trigger 1b marca todo como 'entregado'.
DROP PROCEDURE IF EXISTS sp_entregar_caja_ruta;
DELIMITER $
CREATE PROCEDURE sp_entregar_caja_ruta(
  IN p_ruta_id       INT,
  IN p_cajero_id     INT
)
BEGIN
  DECLARE v_caja_ruta_id INT;

  SELECT id INTO v_caja_ruta_id
    FROM caja_ruta
   WHERE ruta_id = p_ruta_id AND estado = 'abierta'
   LIMIT 1;

  IF v_caja_ruta_id IS NOT NULL THEN
    -- El UPDATE dispara trg_entrega_caja_ruta que marca pendientes → entregados
    UPDATE caja_ruta
       SET estado = 'entregada',
           entregada_a = p_cajero_id,
           entregada_en = NOW()
     WHERE id = v_caja_ruta_id;
  END IF;
END$
DELIMITER ;
