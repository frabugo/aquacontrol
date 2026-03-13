/**
 * Migration v2: Multi-line ventas schema
 *
 * Changes:
 *  1. Drop trg_procesar_venta (references columns being removed)
 *  2. ALTER ventas: drop rigid columns, add origen/carga_id/pedido_id
 *  3. Create venta_detalle table
 *  4. Create precios_cliente table
 *  5. Create trg_actualizar_stock_venta trigger
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:     process.env.DB_HOST     || '127.0.0.1',
  port:     process.env.DB_PORT     || 3306,
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'aquacontrol',
  multipleStatements: false,
});

const steps = [
  // ── Step 1: drop old trigger that references removed columns ─────────────
  {
    name: 'Drop trg_procesar_venta',
    sql: `DROP TRIGGER IF EXISTS trg_procesar_venta`,
  },

  // ── Step 2a: drop rigid columns from ventas ───────────────────────────────
  {
    name: 'ventas: drop tipo_venta',
    sql: `ALTER TABLE ventas DROP COLUMN IF EXISTS tipo_venta`,
  },
  {
    name: 'ventas: drop bidones_entregados',
    sql: `ALTER TABLE ventas DROP COLUMN IF EXISTS bidones_entregados`,
  },
  {
    name: 'ventas: drop bidones_devueltos',
    sql: `ALTER TABLE ventas DROP COLUMN IF EXISTS bidones_devueltos`,
  },
  {
    name: 'ventas: drop bidones_prestados',
    sql: `ALTER TABLE ventas DROP COLUMN IF EXISTS bidones_prestados`,
  },
  {
    name: 'ventas: drop bidon_comprado',
    sql: `ALTER TABLE ventas DROP COLUMN IF EXISTS bidon_comprado`,
  },
  {
    name: 'ventas: drop kg_hielo',
    sql: `ALTER TABLE ventas DROP COLUMN IF EXISTS kg_hielo`,
  },

  // ── Step 2b: add new columns to ventas ────────────────────────────────────
  {
    name: 'ventas: add origen',
    sql: `ALTER TABLE ventas
      ADD COLUMN IF NOT EXISTS origen
        ENUM('presencial','reparto') NOT NULL DEFAULT 'presencial'`,
  },
  {
    name: 'ventas: add carga_id',
    sql: `ALTER TABLE ventas
      ADD COLUMN IF NOT EXISTS carga_id INT NULL`,
  },
  {
    name: 'ventas: add pedido_id',
    sql: `ALTER TABLE ventas
      ADD COLUMN IF NOT EXISTS pedido_id INT NULL`,
  },

  // ── Step 2c: add FK constraints to ventas ─────────────────────────────────
  {
    name: 'ventas: FK fk_venta_carga',
    sql: `ALTER TABLE ventas
      ADD FOREIGN KEY fk_venta_carga (carga_id)
        REFERENCES cargas_reparto(id) ON DELETE SET NULL`,
    ignoreCodes: ['ER_DUP_KEYNAME', 'ER_FK_DUP_NAME'],
  },
  {
    name: 'ventas: FK fk_venta_pedido_rep',
    sql: `ALTER TABLE ventas
      ADD FOREIGN KEY fk_venta_pedido_rep (pedido_id)
        REFERENCES pedidos_repartidor(id) ON DELETE SET NULL`,
    ignoreCodes: ['ER_DUP_KEYNAME', 'ER_FK_DUP_NAME'],
  },

  // ── Step 3: create venta_detalle ──────────────────────────────────────────
  {
    name: 'Drop venta_detalle (if exists)',
    sql: `DROP TABLE IF EXISTS venta_detalle`,
  },
  {
    name: 'Create venta_detalle',
    sql: `CREATE TABLE venta_detalle (
  id                INT           NOT NULL AUTO_INCREMENT,
  venta_id          INT           NOT NULL,
  presentacion_id   INT           NOT NULL,

  tipo_linea        ENUM(
    'compra_bidon',
    'recarga',
    'prestamo',
    'producto',
    'devolucion'
  ) NOT NULL DEFAULT 'producto',

  cantidad          INT           NOT NULL DEFAULT 1,
  vacios_recibidos  INT           NOT NULL DEFAULT 0,

  precio_unitario   DECIMAL(8,2)  NOT NULL DEFAULT 0,
  descuento_linea   DECIMAL(8,2)  NOT NULL DEFAULT 0,
  subtotal          DECIMAL(10,2) NOT NULL DEFAULT 0,

  carga_id          INT           NULL,
  pedido_id         INT           NULL,

  PRIMARY KEY (id),
  INDEX idx_vdetalle_venta        (venta_id),
  INDEX idx_vdetalle_presentacion (presentacion_id),

  FOREIGN KEY (venta_id)        REFERENCES ventas(id)       ON DELETE CASCADE,
  FOREIGN KEY (presentacion_id) REFERENCES presentaciones(id),
  FOREIGN KEY (carga_id)        REFERENCES cargas_reparto(id)      ON DELETE SET NULL,
  FOREIGN KEY (pedido_id)       REFERENCES pedidos_repartidor(id)  ON DELETE SET NULL
)`,
  },

  // ── Step 4: create precios_cliente ────────────────────────────────────────
  {
    name: 'Drop precios_cliente (if exists)',
    sql: `DROP TABLE IF EXISTS precios_cliente`,
  },
  {
    name: 'Create precios_cliente',
    sql: `CREATE TABLE precios_cliente (
  id               INT           NOT NULL AUTO_INCREMENT,
  cliente_id       INT           NOT NULL,
  presentacion_id  INT           NOT NULL,
  tipo_linea       ENUM(
    'compra_bidon','recarga','prestamo','producto'
  ) NOT NULL,
  precio           DECIMAL(8,2)  NOT NULL,
  activo           TINYINT(1)    NOT NULL DEFAULT 1,
  creado_por       INT           NULL,
  creado_en        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_precio_cliente (cliente_id, presentacion_id, tipo_linea),
  INDEX idx_precio_cliente (cliente_id),
  FOREIGN KEY (cliente_id)      REFERENCES clientes(id)       ON DELETE CASCADE,
  FOREIGN KEY (presentacion_id) REFERENCES presentaciones(id),
  FOREIGN KEY (creado_por)      REFERENCES usuarios(id)       ON DELETE SET NULL
)`,
  },

  // ── Step 5: create stock trigger on venta_detalle ─────────────────────────
  {
    name: 'Drop trg_actualizar_stock_venta (if exists)',
    sql: `DROP TRIGGER IF EXISTS trg_actualizar_stock_venta`,
  },
  {
    name: 'Create trg_actualizar_stock_venta',
    sql: `CREATE TRIGGER trg_actualizar_stock_venta
AFTER INSERT ON venta_detalle
FOR EACH ROW
BEGIN
  IF NEW.tipo_linea = 'compra_bidon' THEN
    UPDATE presentaciones
       SET stock_llenos = stock_llenos - NEW.cantidad
     WHERE id = NEW.presentacion_id;

  ELSEIF NEW.tipo_linea = 'recarga' THEN
    UPDATE presentaciones
       SET stock_llenos = stock_llenos - NEW.cantidad,
           stock_vacios = stock_vacios + NEW.vacios_recibidos
     WHERE id = NEW.presentacion_id;

  ELSEIF NEW.tipo_linea = 'prestamo' THEN
    UPDATE presentaciones
       SET stock_llenos = stock_llenos - NEW.cantidad
     WHERE id = NEW.presentacion_id;
    UPDATE clientes
       SET bidones_prestados = bidones_prestados + NEW.cantidad
     WHERE id = (SELECT cliente_id FROM ventas WHERE id = NEW.venta_id);

  ELSEIF NEW.tipo_linea = 'producto' THEN
    UPDATE presentaciones
       SET stock_llenos = stock_llenos - NEW.cantidad
     WHERE id = NEW.presentacion_id;

  ELSEIF NEW.tipo_linea = 'devolucion' THEN
    UPDATE presentaciones
       SET stock_vacios = stock_vacios + NEW.vacios_recibidos
     WHERE id = NEW.presentacion_id;
    UPDATE clientes
       SET bidones_prestados = GREATEST(0, bidones_prestados - NEW.vacios_recibidos)
     WHERE id = (SELECT cliente_id FROM ventas WHERE id = NEW.venta_id);
  END IF;

  INSERT INTO stock_movimientos (
    presentacion_id, tipo, cantidad,
    venta_id, cliente_id, registrado_por,
    estado_origen, estado_destino
  )
  SELECT
    NEW.presentacion_id,
    CASE NEW.tipo_linea
      WHEN 'compra_bidon' THEN 'venta'
      WHEN 'recarga'      THEN 'venta'
      WHEN 'prestamo'     THEN 'prestamo'
      WHEN 'producto'     THEN 'venta'
      WHEN 'devolucion'   THEN 'devolucion_cliente'
    END,
    NEW.cantidad,
    NEW.venta_id,
    v.cliente_id,
    v.vendedor_id,
    CASE NEW.tipo_linea
      WHEN 'devolucion' THEN 'en_ruta_vacio'
      ELSE 'lleno'
    END,
    CASE NEW.tipo_linea
      WHEN 'devolucion' THEN 'vacio'
      ELSE 'en_ruta_lleno'
    END
  FROM ventas v WHERE v.id = NEW.venta_id;
END`,
  },
];

async function run() {
  const conn = await pool.getConnection();
  let ok = 0;
  let fail = 0;

  try {
    for (const step of steps) {
      try {
        await conn.query(step.sql);
        console.log(`✅  ${step.name}`);
        ok++;
      } catch (err) {
        console.error(`❌  ${step.name}: ${err.message}`);
        fail++;
        // Only abort on serious errors (not "already exists" or "doesn't exist")
        const ignorable = [
          'ER_CANT_DROP_FIELD_OR_KEY',   // DROP COLUMN on non-existent col
          'ER_DUP_FIELDNAME',            // ADD COLUMN already exists
          'ER_DUP_KEYNAME',              // constraint already exists
          ...(step.ignoreCodes || []),
        ];
        if (!ignorable.includes(err.code)) {
          console.error('   → Fatal error, aborting migration.');
          break;
        }
        console.log('   → Ignorable, continuing…');
      }
    }
  } finally {
    conn.release();
    await pool.end();
  }

  console.log(`\nMigration finished: ${ok} ok, ${fail} failed.`);
  process.exit(fail > 0 ? 1 : 0);
}

run();
