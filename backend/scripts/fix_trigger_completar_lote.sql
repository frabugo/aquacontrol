-- Fix: trg_completar_lote no actualizaba stock_llenos en modo 'lotes'
-- El trigger original solo sumaba stock_llenos cuando modo_stock = 'simple'
-- Ahora actualiza stock_llenos para ambos modos (simple y lotes)

DROP TRIGGER IF EXISTS trg_completar_lote;

DELIMITER $$
CREATE TRIGGER trg_completar_lote
AFTER UPDATE ON lotes_produccion
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

    -- Actualizar stock_llenos para AMBOS modos (simple y lotes)
    UPDATE presentaciones
       SET stock_llenos = stock_llenos + NEW.cantidad_producida
     WHERE id = NEW.presentacion_id;

    -- Registrar movimiento de stock
    INSERT INTO stock_movimientos (
      presentacion_id, tipo, cantidad,
      registrado_por, estado_origen, estado_destino
    ) VALUES (
      NEW.presentacion_id, 'llenado', NEW.cantidad_producida,
      NEW.operario_id, 'vacio', 'lleno'
    );

  END IF;
END$$
DELIMITER ;
