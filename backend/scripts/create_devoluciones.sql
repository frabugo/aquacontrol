-- Tabla standalone para devoluciones de bidones
CREATE TABLE IF NOT EXISTS devoluciones (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  cliente_id      INT NOT NULL,
  presentacion_id INT NOT NULL,
  cantidad        INT NOT NULL DEFAULT 1,
  origen          ENUM('manual','venta') NOT NULL DEFAULT 'manual',
  venta_id        INT NULL,
  estado          ENUM('activa','anulada') NOT NULL DEFAULT 'activa',
  fecha           DATE NOT NULL,
  notas           TEXT NULL,
  registrado_por  INT NOT NULL,
  creado_en       DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  FOREIGN KEY (presentacion_id) REFERENCES presentaciones(id),
  FOREIGN KEY (venta_id) REFERENCES ventas(id),
  FOREIGN KEY (registrado_por) REFERENCES usuarios(id)
);
