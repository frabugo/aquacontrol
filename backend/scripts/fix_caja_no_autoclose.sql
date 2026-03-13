-- Fix: La caja NO debe cerrarse automáticamente a medianoche.
-- Todos los triggers y SP que buscan la caja abierta ahora usan:
--   WHERE estado = 'abierta' ORDER BY fecha DESC LIMIT 1
-- en lugar de: WHERE fecha = CURDATE() AND estado = 'abierta'

-- ═══════════════════════════════════════════════════
-- 1. trg_venta_a_caja — registra movimientos de caja al insertar venta
-- ═══════════════════════════════════════════════════
DROP TRIGGER IF EXISTS trg_venta_a_caja;

DELIMITER $
CREATE TRIGGER trg_venta_a_caja
AFTER INSERT ON ventas
FOR EACH ROW
BEGIN
  DECLARE v_caja_id INT DEFAULT NULL;

  SELECT id INTO v_caja_id
    FROM cajas
   WHERE estado IN ('abierta','reabierta')
   ORDER BY fecha DESC
   LIMIT 1;

  IF v_caja_id IS NOT NULL THEN
    IF NEW.pagado_efectivo > 0 THEN
      INSERT INTO caja_movimientos
        (caja_id, tipo, metodo_pago, monto,
         descripcion, venta_id, registrado_por)
      VALUES
        (v_caja_id, 'ingreso', 'efectivo',
         NEW.pagado_efectivo,
         CONCAT('Venta ', COALESCE(NEW.folio, CONCAT('#', NEW.id))),
         NEW.id, NEW.vendedor_id);
    END IF;

    IF NEW.pagado_transferencia > 0 THEN
      INSERT INTO caja_movimientos
        (caja_id, tipo, metodo_pago, monto,
         descripcion, venta_id, registrado_por)
      VALUES
        (v_caja_id, 'ingreso', 'transferencia',
         NEW.pagado_transferencia,
         CONCAT('Venta ', COALESCE(NEW.folio, CONCAT('#', NEW.id))),
         NEW.id, NEW.vendedor_id);
    END IF;

    IF NEW.pagado_tarjeta > 0 THEN
      INSERT INTO caja_movimientos
        (caja_id, tipo, metodo_pago, monto,
         descripcion, venta_id, registrado_por)
      VALUES
        (v_caja_id, 'ingreso', 'tarjeta',
         NEW.pagado_tarjeta,
         CONCAT('Venta ', COALESCE(NEW.folio, CONCAT('#', NEW.id))),
         NEW.id, NEW.vendedor_id);
    END IF;

    IF NEW.pagado_credito > 0 THEN
      INSERT INTO caja_movimientos
        (caja_id, tipo, metodo_pago, monto,
         descripcion, venta_id, registrado_por)
      VALUES
        (v_caja_id, 'ingreso', 'credito',
         NEW.pagado_credito,
         CONCAT('Venta al fiado ', COALESCE(NEW.folio, CONCAT('#', NEW.id))),
         NEW.id, NEW.vendedor_id);
    END IF;
  END IF;
END$
DELIMITER ;

-- ═══════════════════════════════════════════════════
-- 2. trg_gasto_a_caja — registra egreso al insertar gasto
-- ═══════════════════════════════════════════════════
DROP TRIGGER IF EXISTS trg_gasto_a_caja;

DELIMITER $
CREATE TRIGGER trg_gasto_a_caja
AFTER INSERT ON gastos
FOR EACH ROW
BEGIN
  DECLARE v_caja_id INT DEFAULT NULL;

  SELECT id INTO v_caja_id
    FROM cajas
   WHERE estado IN ('abierta','reabierta')
   ORDER BY fecha DESC
   LIMIT 1;

  IF v_caja_id IS NOT NULL THEN
    INSERT INTO caja_movimientos
      (caja_id, tipo, metodo_pago, monto,
       descripcion, registrado_por)
    VALUES
      (v_caja_id, 'egreso', NEW.metodo_pago,
       NEW.monto,
       CONCAT(NEW.categoria, ': ', NEW.descripcion),
       NEW.registrado_por);
  END IF;
END$
DELIMITER ;

-- ═══════════════════════════════════════════════════
-- 3. trg_abono_cliente — registra abono y actualiza saldo
-- ═══════════════════════════════════════════════════
DROP TRIGGER IF EXISTS trg_abono_cliente;

DELIMITER $
CREATE TRIGGER trg_abono_cliente
AFTER INSERT ON pagos_clientes
FOR EACH ROW
BEGIN
  DECLARE v_caja_id INT DEFAULT NULL;

  UPDATE clientes
     SET saldo_dinero = GREATEST(0, saldo_dinero - NEW.monto)
   WHERE id = NEW.cliente_id;

  SELECT id INTO v_caja_id
    FROM cajas
   WHERE estado IN ('abierta','reabierta')
   ORDER BY fecha DESC
   LIMIT 1;

  IF v_caja_id IS NOT NULL THEN
    INSERT INTO caja_movimientos
      (caja_id, tipo, metodo_pago, monto,
       descripcion, cliente_id, registrado_por)
    VALUES
      (v_caja_id, 'abono_cliente',
       NEW.metodo_pago, NEW.monto,
       CONCAT('Abono cliente ID ', NEW.cliente_id),
       NEW.cliente_id, NEW.registrado_por);
  END IF;
END$
DELIMITER ;

-- ═══════════════════════════════════════════════════
-- 4. sp_abrir_caja — verifica que no haya caja abierta (sin importar fecha)
-- ═══════════════════════════════════════════════════
DROP PROCEDURE IF EXISTS sp_abrir_caja;

DELIMITER $
CREATE PROCEDURE sp_abrir_caja(IN p_usuario_id INT)
BEGIN
  DECLARE v_ini_ef  DECIMAL(10,2) DEFAULT 0;
  DECLARE v_ini_tr  DECIMAL(10,2) DEFAULT 0;
  DECLARE v_ini_ta  DECIMAL(10,2) DEFAULT 0;
  DECLARE v_ini_cr  DECIMAL(10,2) DEFAULT 0;
  DECLARE v_arr_ef  TINYINT DEFAULT 0;
  DECLARE v_arr_tr  TINYINT DEFAULT 0;
  DECLARE v_arr_ta  TINYINT DEFAULT 0;
  DECLARE v_arr_cr  TINYINT DEFAULT 0;
  DECLARE v_fin_ef  DECIMAL(10,2) DEFAULT 0;
  DECLARE v_fin_tr  DECIMAL(10,2) DEFAULT 0;
  DECLARE v_fin_ta  DECIMAL(10,2) DEFAULT 0;
  DECLARE v_fin_cr  DECIMAL(10,2) DEFAULT 0;
  DECLARE v_nueva_id INT;

  -- No permitir si ya hay una caja abierta (sin importar fecha)
  IF EXISTS (SELECT 1 FROM cajas WHERE estado IN ('abierta','reabierta')) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Ya hay una caja abierta. Ciérrala antes de abrir una nueva.';
  END IF;

  -- Leer configuración de arrastre de saldos
  SELECT arrastra_saldo INTO v_arr_ef
    FROM metodos_pago_config WHERE nombre = 'efectivo' LIMIT 1;
  SELECT arrastra_saldo INTO v_arr_tr
    FROM metodos_pago_config WHERE nombre = 'transferencia' LIMIT 1;
  SELECT arrastra_saldo INTO v_arr_ta
    FROM metodos_pago_config WHERE nombre = 'tarjeta' LIMIT 1;
  SELECT arrastra_saldo INTO v_arr_cr
    FROM metodos_pago_config WHERE nombre = 'credito' LIMIT 1;

  -- Obtener saldos finales de la última caja cerrada
  SELECT
    COALESCE(saldo_fin_efectivo, 0),
    COALESCE(saldo_fin_transferencia, 0),
    COALESCE(saldo_fin_tarjeta, 0),
    COALESCE(saldo_fin_credito, 0)
  INTO v_fin_ef, v_fin_tr, v_fin_ta, v_fin_cr
  FROM cajas
  WHERE estado = 'cerrada'
  ORDER BY fecha DESC
  LIMIT 1;

  SET v_ini_ef = IF(v_arr_ef = 1, v_fin_ef, 0);
  SET v_ini_tr = IF(v_arr_tr = 1, v_fin_tr, 0);
  SET v_ini_ta = IF(v_arr_ta = 1, v_fin_ta, 0);
  SET v_ini_cr = IF(v_arr_cr = 1, v_fin_cr, 0);

  INSERT INTO cajas (
    fecha, abierta_por,
    saldo_ini_efectivo, saldo_ini_transferencia,
    saldo_ini_tarjeta, saldo_ini_credito
  ) VALUES (
    CURDATE(), p_usuario_id,
    v_ini_ef, v_ini_tr, v_ini_ta, v_ini_cr
  );

  SET v_nueva_id = LAST_INSERT_ID();

  IF v_ini_ef > 0 THEN
    INSERT INTO caja_movimientos
      (caja_id, tipo, metodo_pago, monto, descripcion, registrado_por)
    VALUES (v_nueva_id, 'apertura', 'efectivo',
      v_ini_ef, 'Apertura - arrastre efectivo', p_usuario_id);
  END IF;
  IF v_ini_tr > 0 THEN
    INSERT INTO caja_movimientos
      (caja_id, tipo, metodo_pago, monto, descripcion, registrado_por)
    VALUES (v_nueva_id, 'apertura', 'transferencia',
      v_ini_tr, 'Apertura - arrastre transferencia', p_usuario_id);
  END IF;
  IF v_ini_ta > 0 THEN
    INSERT INTO caja_movimientos
      (caja_id, tipo, metodo_pago, monto, descripcion, registrado_por)
    VALUES (v_nueva_id, 'apertura', 'tarjeta',
      v_ini_ta, 'Apertura - arrastre tarjeta', p_usuario_id);
  END IF;
  IF v_ini_cr > 0 THEN
    INSERT INTO caja_movimientos
      (caja_id, tipo, metodo_pago, monto, descripcion, registrado_por)
    VALUES (v_nueva_id, 'apertura', 'credito',
      v_ini_cr, 'Apertura - arrastre credito', p_usuario_id);
  END IF;

  SELECT v_nueva_id AS id;
END$
DELIMITER ;
