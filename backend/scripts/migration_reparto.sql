-- ============================================================
-- MIGRACIÓN: Módulo de Reparto Completo
-- ============================================================

-- ── Pre-migración ──

-- 1. DROP vieja pedido_detalle si referencia pedidos_repartidor
DROP TABLE IF EXISTS pedido_detalle;

-- 2. Agregar stock_vacios a presentaciones
ALTER TABLE presentaciones
  ADD COLUMN IF NOT EXISTS stock_vacios INT NOT NULL DEFAULT 0;

-- 3. Extender ENUM de stock_movimientos.tipo
ALTER TABLE stock_movimientos
  MODIFY COLUMN tipo ENUM(
    'produccion','venta','devolucion_cliente','ajuste','lavado_entrada',
    'lavado_salida','compra','merma','transferencia',
    'carga_salida','descarga_retorno'
  ) NOT NULL;

-- 4. Coordenadas en clientes
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS latitud DECIMAL(10,8) NULL,
  ADD COLUMN IF NOT EXISTS longitud DECIMAL(11,8) NULL,
  ADD COLUMN IF NOT EXISTS direccion_mapa TEXT NULL;

-- ============================================================
-- TABLA: vehiculos
-- ============================================================
CREATE TABLE IF NOT EXISTS vehiculos (
  id              INT          NOT NULL AUTO_INCREMENT,
  placa           VARCHAR(10)  NOT NULL UNIQUE,
  marca           VARCHAR(50)  NULL,
  modelo          VARCHAR(50)  NULL,
  color           VARCHAR(30)  NULL,
  capacidad_notas TEXT         NULL,
  repartidor_id   INT          NULL,
  activo          TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (repartidor_id) REFERENCES usuarios(id) ON DELETE SET NULL
);

-- ============================================================
-- TABLA: rutas
-- ============================================================
CREATE TABLE IF NOT EXISTS rutas (
  id              INT          NOT NULL AUTO_INCREMENT,
  numero          VARCHAR(10)  NOT NULL UNIQUE,
  repartidor_id   INT          NOT NULL,
  vehiculo_id     INT          NOT NULL,
  fecha           DATE         NOT NULL DEFAULT (CURRENT_DATE),
  estado          ENUM('preparando','en_ruta','regresando','finalizada')
                  NOT NULL DEFAULT 'preparando',
  hora_salida     DATETIME     NULL,
  hora_regreso    DATETIME     NULL,
  creado_por      INT          NULL,
  creado_en       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_ruta_fecha       (fecha),
  INDEX idx_ruta_repartidor  (repartidor_id),
  INDEX idx_ruta_estado      (estado),
  FOREIGN KEY (repartidor_id) REFERENCES usuarios(id),
  FOREIGN KEY (vehiculo_id)   REFERENCES vehiculos(id),
  FOREIGN KEY (creado_por)    REFERENCES usuarios(id) ON DELETE SET NULL
);

-- ── Trigger: auto-numerar rutas ──
DROP TRIGGER IF EXISTS trg_numero_ruta;
DELIMITER $
CREATE TRIGGER trg_numero_ruta
BEFORE INSERT ON rutas
FOR EACH ROW
BEGIN
  DECLARE v_sig INT;
  IF NEW.numero IS NULL OR NEW.numero = '' THEN
    SELECT COALESCE(MAX(CAST(SUBSTRING(numero,5) AS UNSIGNED)),0)+1
      INTO v_sig FROM rutas WHERE numero LIKE 'RUT-%';
    SET NEW.numero = CONCAT('RUT-', LPAD(v_sig,4,'0'));
  END IF;
END$
DELIMITER ;

-- ============================================================
-- TABLA: stock_vehiculo
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_vehiculo (
  id               INT NOT NULL AUTO_INCREMENT,
  ruta_id          INT NOT NULL,
  presentacion_id  INT NOT NULL,
  llenos_cargados      INT NOT NULL DEFAULT 0,
  llenos_entregados    INT NOT NULL DEFAULT 0,
  llenos_sobrantes     INT NOT NULL DEFAULT 0,
  vacios_recogidos     INT NOT NULL DEFAULT 0,
  vacios_devueltos     INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_stock_veh (ruta_id, presentacion_id),
  FOREIGN KEY (ruta_id)          REFERENCES rutas(id) ON DELETE CASCADE,
  FOREIGN KEY (presentacion_id)  REFERENCES presentaciones(id)
);

-- ============================================================
-- TABLA: pedidos (nueva, reemplaza pedidos_repartidor)
-- ============================================================
CREATE TABLE IF NOT EXISTS pedidos (
  id              INT          NOT NULL AUTO_INCREMENT,
  numero          VARCHAR(10)  NOT NULL UNIQUE,
  ruta_id         INT          NULL,
  cliente_id      INT          NOT NULL,
  asignado_por    INT          NULL,
  fecha           DATE         NOT NULL DEFAULT (CURRENT_DATE),
  orden_entrega   SMALLINT     NOT NULL DEFAULT 1,
  estado          ENUM('pendiente','en_camino','entregado','no_entregado','reasignado')
                  NOT NULL DEFAULT 'pendiente',
  venta_id        INT          NULL,
  notas_encargada TEXT         NULL,
  notas_repartidor TEXT        NULL,
  latitud         DECIMAL(10,8) NULL,
  longitud        DECIMAL(11,8) NULL,
  creado_en       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_pedido_ruta   (ruta_id),
  INDEX idx_pedido_fecha  (fecha),
  INDEX idx_pedido_estado (estado),
  FOREIGN KEY (ruta_id)      REFERENCES rutas(id) ON DELETE SET NULL,
  FOREIGN KEY (cliente_id)   REFERENCES clientes(id),
  FOREIGN KEY (asignado_por) REFERENCES usuarios(id) ON DELETE SET NULL,
  FOREIGN KEY (venta_id)     REFERENCES ventas(id) ON DELETE SET NULL
);

-- ── Trigger: auto-numerar pedidos ──
DROP TRIGGER IF EXISTS trg_numero_pedido;
DELIMITER $
CREATE TRIGGER trg_numero_pedido
BEFORE INSERT ON pedidos
FOR EACH ROW
BEGIN
  DECLARE v_sig INT;
  IF NEW.numero IS NULL OR NEW.numero = '' THEN
    SELECT COALESCE(MAX(CAST(SUBSTRING(numero,3) AS UNSIGNED)),0)+1
      INTO v_sig FROM pedidos WHERE numero LIKE 'P-%';
    SET NEW.numero = CONCAT('P-', LPAD(v_sig,4,'0'));
  END IF;
END$
DELIMITER ;

-- ============================================================
-- TABLA: pedido_detalle
-- ============================================================
CREATE TABLE IF NOT EXISTS pedido_detalle (
  id               INT          NOT NULL AUTO_INCREMENT,
  pedido_id        INT          NOT NULL,
  presentacion_id  INT          NOT NULL,
  tipo_linea       ENUM('compra_bidon','recarga','prestamo','producto')
                   NOT NULL DEFAULT 'producto',
  cantidad         INT          NOT NULL DEFAULT 1,
  vacios_esperados INT          NOT NULL DEFAULT 0,
  precio_unitario  DECIMAL(8,2) NOT NULL DEFAULT 0,
  subtotal         DECIMAL(10,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  FOREIGN KEY (pedido_id)       REFERENCES pedidos(id) ON DELETE CASCADE,
  FOREIGN KEY (presentacion_id) REFERENCES presentaciones(id)
);

-- ============================================================
-- TABLA: caja_ruta
-- ============================================================
CREATE TABLE IF NOT EXISTS caja_ruta (
  id                    INT          NOT NULL AUTO_INCREMENT,
  ruta_id               INT          NOT NULL UNIQUE,
  repartidor_id         INT          NOT NULL,
  cobrado_efectivo      DECIMAL(10,2) NOT NULL DEFAULT 0,
  cobrado_transferencia DECIMAL(10,2) NOT NULL DEFAULT 0,
  cobrado_tarjeta       DECIMAL(10,2) NOT NULL DEFAULT 0,
  cobrado_credito       DECIMAL(10,2) NOT NULL DEFAULT 0,
  gasto_combustible     DECIMAL(10,2) NOT NULL DEFAULT 0,
  gasto_alimentacion    DECIMAL(10,2) NOT NULL DEFAULT 0,
  gasto_otros           DECIMAL(10,2) NOT NULL DEFAULT 0,
  desc_gastos           TEXT          NULL,
  total_cobrado         DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_gastos          DECIMAL(10,2) NOT NULL DEFAULT 0,
  neto_a_entregar       DECIMAL(10,2) NOT NULL DEFAULT 0,
  estado                ENUM('abierta','entregada') NOT NULL DEFAULT 'abierta',
  entregada_a           INT          NULL,
  entregada_en          DATETIME     NULL,
  PRIMARY KEY (id),
  FOREIGN KEY (ruta_id)        REFERENCES rutas(id) ON DELETE CASCADE,
  FOREIGN KEY (repartidor_id)  REFERENCES usuarios(id),
  FOREIGN KEY (entregada_a)    REFERENCES usuarios(id) ON DELETE SET NULL
);

-- ============================================================
-- TABLA: caja_ruta_movimientos
-- ============================================================
CREATE TABLE IF NOT EXISTS caja_ruta_movimientos (
  id              INT          NOT NULL AUTO_INCREMENT,
  caja_ruta_id    INT          NOT NULL,
  venta_id        INT          NULL,
  tipo            ENUM('cobro_venta','gasto','ajuste') NOT NULL,
  metodo_pago     ENUM('efectivo','transferencia','tarjeta','credito') NOT NULL,
  monto           DECIMAL(10,2) NOT NULL,
  descripcion     VARCHAR(200)  NULL,
  registrado_por  INT           NULL,
  fecha_hora      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_cajamov_ruta  (caja_ruta_id),
  INDEX idx_cajamov_fecha (fecha_hora),
  FOREIGN KEY (caja_ruta_id)    REFERENCES caja_ruta(id) ON DELETE CASCADE,
  FOREIGN KEY (venta_id)        REFERENCES ventas(id) ON DELETE SET NULL,
  FOREIGN KEY (registrado_por)  REFERENCES usuarios(id) ON DELETE SET NULL
);

-- ============================================================
-- TRIGGER: Auto-crear caja_ruta al insertar ruta
-- ============================================================
DROP TRIGGER IF EXISTS trg_crear_caja_ruta;
DELIMITER $
CREATE TRIGGER trg_crear_caja_ruta
AFTER INSERT ON rutas
FOR EACH ROW
BEGIN
  INSERT INTO caja_ruta (ruta_id, repartidor_id)
  VALUES (NEW.id, NEW.repartidor_id);
END$
DELIMITER ;

-- ============================================================
-- ALTER ventas: vincular con ruta
-- ============================================================
ALTER TABLE ventas
  ADD COLUMN IF NOT EXISTS ruta_id INT NULL,
  ADD CONSTRAINT IF NOT EXISTS fk_venta_ruta
    FOREIGN KEY (ruta_id) REFERENCES rutas(id) ON DELETE SET NULL;

-- ============================================================
-- TRIGGER: Ventas de reparto van a caja_ruta (NO a caja principal)
-- ============================================================
DROP TRIGGER IF EXISTS trg_venta_reparto_a_caja;
DELIMITER $
CREATE TRIGGER trg_venta_reparto_a_caja
AFTER INSERT ON ventas
FOR EACH ROW
BEGIN
  DECLARE v_caja_ruta_id INT DEFAULT NULL;

  IF NEW.ruta_id IS NOT NULL THEN
    SELECT id INTO v_caja_ruta_id
      FROM caja_ruta
     WHERE ruta_id = NEW.ruta_id AND estado = 'abierta'
     LIMIT 1;

    IF v_caja_ruta_id IS NOT NULL THEN
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
    END IF;
  END IF;
END$
DELIMITER ;

-- ============================================================
-- SP: Cargar vehículo desde planta
-- ============================================================
DROP PROCEDURE IF EXISTS sp_cargar_vehiculo;
DELIMITER $
CREATE PROCEDURE sp_cargar_vehiculo(
  IN p_ruta_id        INT,
  IN p_presentacion_id INT,
  IN p_cantidad       INT,
  IN p_usuario_id     INT,
  OUT p_ok            TINYINT,
  OUT p_mensaje       VARCHAR(200)
)
BEGIN
  DECLARE v_stock_planta INT DEFAULT 0;

  SELECT stock_llenos INTO v_stock_planta
    FROM presentaciones WHERE id = p_presentacion_id;

  IF v_stock_planta < p_cantidad THEN
    SET p_ok = 0;
    SET p_mensaje = CONCAT('Stock insuficiente en planta. Disponible: ',
      v_stock_planta, ', Solicitado: ', p_cantidad);
  ELSE
    UPDATE presentaciones
       SET stock_llenos = stock_llenos - p_cantidad
     WHERE id = p_presentacion_id;

    INSERT INTO stock_vehiculo (ruta_id, presentacion_id, llenos_cargados)
    VALUES (p_ruta_id, p_presentacion_id, p_cantidad)
    ON DUPLICATE KEY UPDATE llenos_cargados = llenos_cargados + p_cantidad;

    INSERT INTO stock_movimientos
      (presentacion_id, tipo, cantidad, estado_origen, estado_destino, registrado_por, motivo)
    VALUES (p_presentacion_id, 'carga_salida', p_cantidad, 'lleno', 'en_ruta_lleno',
      p_usuario_id, CONCAT('Carga vehículo ruta #', p_ruta_id));

    SET p_ok = 1;
    SET p_mensaje = 'OK';
  END IF;
END$
DELIMITER ;

-- ============================================================
-- SP: Finalizar ruta (devolver stock a planta)
-- ============================================================
DROP PROCEDURE IF EXISTS sp_finalizar_ruta;
DELIMITER $
CREATE PROCEDURE sp_finalizar_ruta(
  IN p_ruta_id     INT,
  IN p_usuario_id  INT
)
BEGIN
  UPDATE presentaciones p
  JOIN stock_vehiculo sv ON sv.presentacion_id = p.id AND sv.ruta_id = p_ruta_id
     SET p.stock_llenos = p.stock_llenos + sv.llenos_sobrantes,
         sv.llenos_sobrantes = 0;

  UPDATE presentaciones p
  JOIN stock_vehiculo sv ON sv.presentacion_id = p.id AND sv.ruta_id = p_ruta_id
     SET p.stock_vacios = p.stock_vacios + sv.vacios_devueltos,
         sv.vacios_devueltos = 0;

  UPDATE rutas
     SET estado = 'finalizada', hora_regreso = NOW()
   WHERE id = p_ruta_id;
END$
DELIMITER ;

-- ============================================================
-- SP: Entregar caja ruta a caja principal
-- ============================================================
DROP PROCEDURE IF EXISTS sp_entregar_caja_ruta;
DELIMITER $
CREATE PROCEDURE sp_entregar_caja_ruta(
  IN p_ruta_id       INT,
  IN p_cajero_id     INT
)
BEGIN
  DECLARE v_caja_ruta_id    INT;
  DECLARE v_caja_principal  INT;
  DECLARE v_ef   DECIMAL(10,2);
  DECLARE v_tr   DECIMAL(10,2);
  DECLARE v_ta   DECIMAL(10,2);
  DECLARE v_cr   DECIMAL(10,2);

  SELECT id, cobrado_efectivo, cobrado_transferencia, cobrado_tarjeta, cobrado_credito
    INTO v_caja_ruta_id, v_ef, v_tr, v_ta, v_cr
    FROM caja_ruta
   WHERE ruta_id = p_ruta_id AND estado = 'abierta'
   LIMIT 1;

  SELECT id INTO v_caja_principal
    FROM cajas WHERE estado = 'abierta' ORDER BY fecha DESC LIMIT 1;

  IF v_caja_principal IS NOT NULL AND v_caja_ruta_id IS NOT NULL THEN
    IF v_ef > 0 THEN
      INSERT INTO caja_movimientos (caja_id, tipo, metodo_pago, monto, descripcion, registrado_por)
      VALUES (v_caja_principal, 'ingreso', 'efectivo', v_ef,
        CONCAT('Entrega caja repartidor - Ruta #', p_ruta_id), p_cajero_id);
    END IF;
    IF v_tr > 0 THEN
      INSERT INTO caja_movimientos (caja_id, tipo, metodo_pago, monto, descripcion, registrado_por)
      VALUES (v_caja_principal, 'ingreso', 'transferencia', v_tr,
        CONCAT('Entrega caja repartidor - Ruta #', p_ruta_id), p_cajero_id);
    END IF;
    IF v_ta > 0 THEN
      INSERT INTO caja_movimientos (caja_id, tipo, metodo_pago, monto, descripcion, registrado_por)
      VALUES (v_caja_principal, 'ingreso', 'tarjeta', v_ta,
        CONCAT('Entrega caja repartidor - Ruta #', p_ruta_id), p_cajero_id);
    END IF;
    IF v_cr > 0 THEN
      INSERT INTO caja_movimientos (caja_id, tipo, metodo_pago, monto, descripcion, registrado_por)
      VALUES (v_caja_principal, 'ingreso', 'credito', v_cr,
        CONCAT('Crédito repartidor - Ruta #', p_ruta_id), p_cajero_id);
    END IF;

    UPDATE caja_ruta
       SET estado = 'entregada', entregada_a = p_cajero_id, entregada_en = NOW()
     WHERE id = v_caja_ruta_id;
  END IF;
END$
DELIMITER ;

-- ============================================================
-- NOTA: Modificar trg_venta_a_caja existente para excluir ventas
-- con ruta_id (evitar doble conteo con trg_venta_reparto_a_caja).
-- Ejecutar manualmente:
--
-- En el trigger trg_venta_a_caja, agregar al inicio del body:
--   IF NEW.ruta_id IS NOT NULL THEN
--     -- Skip: ventas de reparto van a caja_ruta
--     LEAVE;  -- o usar RETURN si es BEFORE trigger
--   END IF;
-- ============================================================
