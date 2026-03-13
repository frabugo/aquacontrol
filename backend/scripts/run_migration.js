// scripts/run_migration.js
require('dotenv').config();
const mysql2 = require('mysql2/promise');

const stmts = [];

/* ─── 1. presentaciones ─── */
stmts.push(`
CREATE TABLE IF NOT EXISTS presentaciones (
  id                  INT          NOT NULL AUTO_INCREMENT,
  nombre              VARCHAR(100) NOT NULL,
  descripcion         VARCHAR(200) NULL,
  es_retornable       TINYINT(1)   NOT NULL DEFAULT 0,
  precio_base         DECIMAL(8,2) NOT NULL DEFAULT 0.00,
  stock_llenos        INT          NOT NULL DEFAULT 0,
  stock_vacios        INT          NOT NULL DEFAULT 0,
  stock_rotos         INT          NOT NULL DEFAULT 0,
  stock_en_lavado     INT          NOT NULL DEFAULT 0,
  stock_en_reparacion INT          NOT NULL DEFAULT 0,
  stock_perdidos      INT          NOT NULL DEFAULT 0,
  stock_baja          INT          NOT NULL DEFAULT 0,
  activo              TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_pres_retornable (es_retornable),
  INDEX idx_pres_activo     (activo)
)`);

// Eliminar columnas viejas si existen (DROP COLUMN IF EXISTS — MariaDB 10.2+)
stmts.push(`ALTER TABLE presentaciones DROP COLUMN IF EXISTS stock_planta_llenos`);
stmts.push(`ALTER TABLE presentaciones DROP COLUMN IF EXISTS stock_planta_vacios`);
stmts.push(`ALTER TABLE presentaciones DROP COLUMN IF EXISTS lleva_stock_llenos`);
stmts.push(`ALTER TABLE presentaciones DROP COLUMN IF EXISTS lleva_stock_vacios`);

// Asegurar columnas nuevas (ADD COLUMN IF NOT EXISTS — MariaDB 10.3+)
for (const col of [
  'stock_llenos       INT NOT NULL DEFAULT 0',
  'stock_vacios       INT NOT NULL DEFAULT 0',
  'stock_rotos        INT NOT NULL DEFAULT 0',
  'stock_en_lavado    INT NOT NULL DEFAULT 0',
  'stock_en_reparacion INT NOT NULL DEFAULT 0',
  'stock_perdidos     INT NOT NULL DEFAULT 0',
  'stock_baja         INT NOT NULL DEFAULT 0',
]) {
  stmts.push(`ALTER TABLE presentaciones ADD COLUMN IF NOT EXISTS ${col}`);
}

/* ─── 2. cargas_reparto ─── */
stmts.push(`
CREATE TABLE IF NOT EXISTS cargas_reparto (
  id             INT          NOT NULL AUTO_INCREMENT,
  numero         VARCHAR(10)  NOT NULL DEFAULT '',
  repartidor_id  INT          NOT NULL,
  fecha          DATE         NOT NULL DEFAULT (CURRENT_DATE),
  estado         ENUM('preparando','en_ruta','finalizada','cancelada') NOT NULL DEFAULT 'preparando',
  observaciones  TEXT         NULL,
  creado_por     INT          NULL,
  creado_en      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_carga_numero (numero),
  INDEX idx_carga_repartidor (repartidor_id),
  INDEX idx_carga_fecha      (fecha),
  INDEX idx_carga_estado     (estado),
  FOREIGN KEY (repartidor_id) REFERENCES usuarios(id),
  FOREIGN KEY (creado_por)    REFERENCES usuarios(id)
)`);

/* ─── Trigger: número automático cargas_reparto ─── */
stmts.push(`DROP TRIGGER IF EXISTS trg_numero_carga`);
stmts.push(`
CREATE TRIGGER trg_numero_carga
BEFORE INSERT ON cargas_reparto
FOR EACH ROW
BEGIN
  DECLARE v_siguiente INT;
  IF NEW.numero IS NULL OR NEW.numero = '' THEN
    SELECT COALESCE(MAX(CAST(SUBSTRING(numero, 5) AS UNSIGNED)), 0) + 1
      INTO v_siguiente
      FROM cargas_reparto
     WHERE numero LIKE 'CRG-%';
    SET NEW.numero = CONCAT('CRG-', LPAD(v_siguiente, 6, '0'));
  END IF;
END`);

/* ─── 3. carga_detalle ─── */
stmts.push(`
CREATE TABLE IF NOT EXISTS carga_detalle (
  id                  INT NOT NULL AUTO_INCREMENT,
  carga_id            INT NOT NULL,
  presentacion_id     INT NOT NULL,
  cantidad_cargada    INT NOT NULL DEFAULT 0,
  llenos_en_vehiculo  INT NOT NULL DEFAULT 0,
  vacios_en_vehiculo  INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  INDEX idx_cdet_carga        (carga_id),
  INDEX idx_cdet_presentacion (presentacion_id),
  FOREIGN KEY (carga_id)        REFERENCES cargas_reparto(id),
  FOREIGN KEY (presentacion_id) REFERENCES presentaciones(id)
)`);

stmts.push(`ALTER TABLE carga_detalle ADD COLUMN IF NOT EXISTS llenos_en_vehiculo INT NOT NULL DEFAULT 0`);
stmts.push(`ALTER TABLE carga_detalle ADD COLUMN IF NOT EXISTS vacios_en_vehiculo  INT NOT NULL DEFAULT 0`);

/* ─── 4. stock_movimientos ─── */
stmts.push(`
CREATE TABLE IF NOT EXISTS stock_movimientos (
  id               INT          NOT NULL AUTO_INCREMENT,
  presentacion_id  INT          NOT NULL,
  tipo             ENUM(
    'compra_empresa','llenado','venta','prestamo',
    'devolucion_cliente','devolucion_ruta','recarga_ruta','devolucion_lleno',
    'rotura','baja','reparacion_inicio','reparacion_fin',
    'lavado_inicio','lavado_fin','perdida','ajuste'
  ) NOT NULL,
  estado_origen    ENUM('lleno','vacio','roto','en_lavado','en_reparacion','perdido','baja','en_ruta_lleno','en_ruta_vacio') NULL,
  estado_destino   ENUM('lleno','vacio','roto','en_lavado','en_reparacion','perdido','baja','en_ruta_lleno','en_ruta_vacio') NULL,
  cantidad         INT          NOT NULL,
  repartidor_id    INT          NULL,
  carga_id         INT          NULL,
  venta_id         INT          NULL,
  cliente_id       INT          NULL,
  registrado_por   INT          NULL,
  motivo           VARCHAR(200) NULL,
  fecha_hora       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_stockmov_presentacion (presentacion_id),
  INDEX idx_stockmov_tipo         (tipo),
  INDEX idx_stockmov_fecha        (fecha_hora),
  INDEX idx_stockmov_carga        (carga_id),
  INDEX idx_stockmov_cliente      (cliente_id),
  FOREIGN KEY (presentacion_id) REFERENCES presentaciones(id),
  FOREIGN KEY (repartidor_id)   REFERENCES usuarios(id),
  FOREIGN KEY (carga_id)        REFERENCES cargas_reparto(id),
  FOREIGN KEY (venta_id)        REFERENCES ventas(id),
  FOREIGN KEY (cliente_id)      REFERENCES clientes(id),
  FOREIGN KEY (registrado_por)  REFERENCES usuarios(id)
)`);

/* ─── 5. pedidos_repartidor ─── */
stmts.push(`
CREATE TABLE IF NOT EXISTS pedidos_repartidor (
  id               INT          NOT NULL AUTO_INCREMENT,
  numero           VARCHAR(10)  NOT NULL DEFAULT '',
  repartidor_id    INT          NOT NULL,
  carga_id         INT          NULL,
  cliente_id       INT          NOT NULL,
  asignado_por     INT          NOT NULL,
  fecha            DATE         NOT NULL DEFAULT (CURRENT_DATE),
  estado           ENUM('pendiente','en_camino','entregado','no_entregado','reasignado') NOT NULL DEFAULT 'pendiente',
  orden_entrega    SMALLINT     NOT NULL DEFAULT 1,
  notas_encargada  TEXT         NULL,
  notas_repartidor TEXT         NULL,
  asignado_en      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  entregado_en     DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pedrep_numero (numero),
  INDEX idx_pedido_rep    (repartidor_id),
  INDEX idx_pedido_fecha  (fecha),
  INDEX idx_pedido_estado (estado),
  INDEX idx_pedido_carga  (carga_id),
  FOREIGN KEY (repartidor_id) REFERENCES usuarios(id),
  FOREIGN KEY (carga_id)      REFERENCES cargas_reparto(id),
  FOREIGN KEY (cliente_id)    REFERENCES clientes(id),
  FOREIGN KEY (asignado_por)  REFERENCES usuarios(id)
)`);

/* ─── 6. Trigger: número automático pedidos_repartidor ─── */
stmts.push(`DROP TRIGGER IF EXISTS trg_numero_pedido_rep`);
stmts.push(`
CREATE TRIGGER trg_numero_pedido_rep
BEFORE INSERT ON pedidos_repartidor
FOR EACH ROW
BEGIN
  DECLARE v_siguiente INT;
  IF NEW.numero IS NULL OR NEW.numero = '' THEN
    SELECT COALESCE(MAX(CAST(SUBSTRING(numero, 5) AS UNSIGNED)), 0) + 1
      INTO v_siguiente
      FROM pedidos_repartidor
     WHERE numero LIKE 'PRD-%';
    SET NEW.numero = CONCAT('PRD-', LPAD(v_siguiente, 6, '0'));
  END IF;
END`);

/* ─── 7. pedido_detalle ─── */
stmts.push(`
CREATE TABLE IF NOT EXISTS pedido_detalle (
  id               INT          NOT NULL AUTO_INCREMENT,
  pedido_id        INT          NOT NULL,
  presentacion_id  INT          NOT NULL,
  cantidad         INT          NOT NULL DEFAULT 1,
  vacios_esperados INT          NOT NULL DEFAULT 0,
  precio_unitario  DECIMAL(8,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (id),
  INDEX idx_pdet_pedido       (pedido_id),
  INDEX idx_pdet_presentacion (presentacion_id),
  FOREIGN KEY (pedido_id)       REFERENCES pedidos_repartidor(id),
  FOREIGN KEY (presentacion_id) REFERENCES presentaciones(id)
)`);

/* ─── Ejecutar ─── */
async function main() {
  const db = await mysql2.createConnection({
    host:     process.env.DB_HOST     || '127.0.0.1',
    port:     process.env.DB_PORT     || 3306,
    database: process.env.DB_NAME     || 'aquacontrol',
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: false,
  });

  let ok = 0, fail = 0;
  for (const stmt of stmts) {
    const preview = stmt.trim().split('\n')[0].substring(0, 72);
    try {
      await db.query(stmt);
      console.log('✅', preview);
      ok++;
    } catch (e) {
      console.error('❌', preview);
      console.error('   └─', e.message);
      fail++;
    }
  }

  await db.end();
  console.log(`\n── Resultado: ${ok} OK, ${fail} errores ──`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
