-- Migration: Agregar repartidor_id directo a pedidos (sin depender de ruta)
-- Fecha: 2026-02-26

ALTER TABLE pedidos ADD COLUMN repartidor_id INT NULL AFTER ruta_id;

ALTER TABLE pedidos ADD CONSTRAINT fk_pedidos_repartidor
  FOREIGN KEY (repartidor_id) REFERENCES usuarios(id);

CREATE INDEX idx_pedidos_repartidor_fecha ON pedidos (repartidor_id, fecha, estado);

-- Backfill desde rutas existentes
UPDATE pedidos p JOIN rutas r ON r.id = p.ruta_id
  SET p.repartidor_id = r.repartidor_id
  WHERE p.repartidor_id IS NULL AND p.ruta_id IS NOT NULL;
