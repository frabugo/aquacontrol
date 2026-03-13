// Fix trigger: remove estado='abierta' filter on caja_ruta
const db = require('../db');

const TRIGGER_SQL = `
CREATE TRIGGER trg_venta_a_caja
AFTER INSERT ON ventas
FOR EACH ROW
BEGIN
  DECLARE v_caja_ruta_id   INT DEFAULT NULL;
  DECLARE v_caja_principal INT DEFAULT NULL;

  SELECT id INTO v_caja_principal
    FROM cajas
   WHERE estado IN ('abierta','reabierta')
   ORDER BY fecha DESC
   LIMIT 1;

  IF v_caja_principal IS NULL THEN
    SIGNAL SQLSTATE '01000' SET MESSAGE_TEXT = 'No hay caja abierta';
  END IF;

  IF v_caja_principal IS NOT NULL AND NEW.ruta_id IS NOT NULL THEN

    -- Buscar caja_ruta de esta ruta (sin filtrar por estado, para no perder datos)
    SELECT id INTO v_caja_ruta_id
      FROM caja_ruta
     WHERE ruta_id = NEW.ruta_id
     LIMIT 1;

    IF v_caja_ruta_id IS NOT NULL THEN

      UPDATE caja_ruta
         SET cobrado_efectivo      = cobrado_efectivo      + NEW.pagado_efectivo,
             cobrado_transferencia = cobrado_transferencia + NEW.pagado_transferencia,
             cobrado_tarjeta       = cobrado_tarjeta       + NEW.pagado_tarjeta,
             cobrado_credito       = cobrado_credito       + NEW.pagado_credito,
             total_cobrado = total_cobrado
                           + NEW.pagado_efectivo + NEW.pagado_transferencia
                           + NEW.pagado_tarjeta  + NEW.pagado_credito,
             neto_a_entregar = total_cobrado - total_gastos
       WHERE id = v_caja_ruta_id;

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
          NEW.pagado_credito, CONCAT('Venta ', COALESCE(NEW.folio, CONCAT('#',NEW.id))), NEW.vendedor_id);
      END IF;

      IF NEW.pagado_efectivo > 0 THEN
        INSERT INTO caja_movimientos
          (caja_id, tipo, metodo_pago, monto, descripcion, venta_id, registrado_por,
           origen, caja_ruta_id, estado_entrega)
        VALUES (v_caja_principal, 'ingreso', 'efectivo', NEW.pagado_efectivo,
          CONCAT('Reparto: ', COALESCE(NEW.folio, CONCAT('#',NEW.id))),
          NEW.id, NEW.vendedor_id, 'repartidor', v_caja_ruta_id, 'pendiente');
      END IF;
      IF NEW.pagado_transferencia > 0 THEN
        INSERT INTO caja_movimientos
          (caja_id, tipo, metodo_pago, monto, descripcion, venta_id, registrado_por,
           origen, caja_ruta_id, estado_entrega)
        VALUES (v_caja_principal, 'ingreso', 'transferencia', NEW.pagado_transferencia,
          CONCAT('Reparto: ', COALESCE(NEW.folio, CONCAT('#',NEW.id))),
          NEW.id, NEW.vendedor_id, 'repartidor', v_caja_ruta_id, 'pendiente');
      END IF;
      IF NEW.pagado_tarjeta > 0 THEN
        INSERT INTO caja_movimientos
          (caja_id, tipo, metodo_pago, monto, descripcion, venta_id, registrado_por,
           origen, caja_ruta_id, estado_entrega)
        VALUES (v_caja_principal, 'ingreso', 'tarjeta', NEW.pagado_tarjeta,
          CONCAT('Reparto: ', COALESCE(NEW.folio, CONCAT('#',NEW.id))),
          NEW.id, NEW.vendedor_id, 'repartidor', v_caja_ruta_id, 'pendiente');
      END IF;
      IF NEW.pagado_credito > 0 THEN
        INSERT INTO caja_movimientos
          (caja_id, tipo, metodo_pago, monto, descripcion, venta_id, registrado_por,
           origen, caja_ruta_id, estado_entrega)
        VALUES (v_caja_principal, 'ingreso', 'credito', NEW.pagado_credito,
          CONCAT('Credito reparto: ', COALESCE(NEW.folio, CONCAT('#',NEW.id))),
          NEW.id, NEW.vendedor_id, 'repartidor', v_caja_ruta_id, 'pendiente');
      END IF;

    END IF;

  ELSEIF v_caja_principal IS NOT NULL THEN
    IF NEW.pagado_efectivo > 0 THEN
      INSERT INTO caja_movimientos
        (caja_id, tipo, metodo_pago, monto, descripcion, venta_id, registrado_por, origen)
      VALUES (v_caja_principal, 'ingreso', 'efectivo', NEW.pagado_efectivo,
        CONCAT('Venta ', COALESCE(NEW.folio, CONCAT('#',NEW.id))),
        NEW.id, NEW.vendedor_id, 'directo');
    END IF;
    IF NEW.pagado_transferencia > 0 THEN
      INSERT INTO caja_movimientos
        (caja_id, tipo, metodo_pago, monto, descripcion, venta_id, registrado_por, origen)
      VALUES (v_caja_principal, 'ingreso', 'transferencia', NEW.pagado_transferencia,
        CONCAT('Venta ', COALESCE(NEW.folio, CONCAT('#',NEW.id))),
        NEW.id, NEW.vendedor_id, 'directo');
    END IF;
    IF NEW.pagado_tarjeta > 0 THEN
      INSERT INTO caja_movimientos
        (caja_id, tipo, metodo_pago, monto, descripcion, venta_id, registrado_por, origen)
      VALUES (v_caja_principal, 'ingreso', 'tarjeta', NEW.pagado_tarjeta,
        CONCAT('Venta ', COALESCE(NEW.folio, CONCAT('#',NEW.id))),
        NEW.id, NEW.vendedor_id, 'directo');
    END IF;
    IF NEW.pagado_credito > 0 THEN
      INSERT INTO caja_movimientos
        (caja_id, tipo, metodo_pago, monto, descripcion, venta_id, registrado_por, origen)
      VALUES (v_caja_principal, 'ingreso', 'credito', NEW.pagado_credito,
        CONCAT('Venta credito ', COALESCE(NEW.folio, CONCAT('#',NEW.id))),
        NEW.id, NEW.vendedor_id, 'directo');
    END IF;
  END IF;

END
`;

(async () => {
  try {
    await db.query('DROP TRIGGER IF EXISTS trg_venta_reparto_a_caja');
    await db.query('DROP TRIGGER IF EXISTS trg_venta_a_caja');
    await db.query(TRIGGER_SQL);
    console.log('OK: Trigger trg_venta_a_caja recreado (sin filtro estado abierta)');

    // Verify
    const [t] = await db.query('SHOW CREATE TRIGGER trg_venta_a_caja');
    const body = t[0]['SQL Original Statement'];
    console.log('Contiene filtro viejo "estado = \'abierta\'":', body.includes("estado = 'abierta'"));
    console.log('Contiene "WHERE ruta_id = NEW.ruta_id":', body.includes('WHERE ruta_id = NEW.ruta_id'));
  } catch (err) {
    console.error('ERROR:', err.message);
  }
  process.exit(0);
})();
