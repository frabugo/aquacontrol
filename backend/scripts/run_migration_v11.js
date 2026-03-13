// backend/scripts/run_migration_v11.js
// Migration v11 — Columnas faltantes usadas en el código pero sin migración previa
const db = require('../db');

const steps = [

  // ── 1. clientes: columnas de deuda y precios ──
  {
    name: 'ALTER clientes: add saldo_dinero',
    sql: "ALTER TABLE clientes ADD COLUMN saldo_dinero DECIMAL(12,2) NOT NULL DEFAULT 0",
    ignoreCodes: [1060],
  },
  {
    name: 'ALTER clientes: add credito_maximo',
    sql: "ALTER TABLE clientes ADD COLUMN credito_maximo DECIMAL(12,2) NOT NULL DEFAULT 0",
    ignoreCodes: [1060],
  },
  {
    name: 'ALTER clientes: add precio_recarga_con_bidon',
    sql: "ALTER TABLE clientes ADD COLUMN precio_recarga_con_bidon DECIMAL(8,2) NOT NULL DEFAULT 0",
    ignoreCodes: [1060],
  },
  {
    name: 'ALTER clientes: add precio_recarga_sin_bidon',
    sql: "ALTER TABLE clientes ADD COLUMN precio_recarga_sin_bidon DECIMAL(8,2) NOT NULL DEFAULT 0",
    ignoreCodes: [1060],
  },
  {
    name: 'ALTER clientes: add precio_bidon_lleno',
    sql: "ALTER TABLE clientes ADD COLUMN precio_bidon_lleno DECIMAL(8,2) NOT NULL DEFAULT 0",
    ignoreCodes: [1060],
  },
  {
    name: 'ALTER clientes: add notas',
    sql: "ALTER TABLE clientes ADD COLUMN notas TEXT NULL",
    ignoreCodes: [1060],
  },
  {
    name: 'ALTER clientes: add creado_por',
    sql: "ALTER TABLE clientes ADD COLUMN creado_por INT NULL",
    ignoreCodes: [1060],
  },

  // ── 2. usuarios: config por usuario + sesión ──
  {
    name: 'ALTER usuarios: add sesion_unica',
    sql: "ALTER TABLE usuarios ADD COLUMN sesion_unica TINYINT(1) NOT NULL DEFAULT 1",
    ignoreCodes: [1060],
  },
  {
    name: 'ALTER usuarios: add sesion_token',
    sql: "ALTER TABLE usuarios ADD COLUMN sesion_token TEXT NULL",
    ignoreCodes: [1060],
  },
  {
    name: 'ALTER usuarios: add gps_obligatorio',
    sql: "ALTER TABLE usuarios ADD COLUMN gps_obligatorio TINYINT(1) NOT NULL DEFAULT 0",
    ignoreCodes: [1060],
  },
  {
    name: 'ALTER usuarios: add notif_pedidos',
    sql: "ALTER TABLE usuarios ADD COLUMN notif_pedidos TINYINT(1) NOT NULL DEFAULT 0",
    ignoreCodes: [1060],
  },

  // ── 3. ventas: columnas de detalle y deuda ──
  {
    name: 'ALTER ventas: add subtotal',
    sql: "ALTER TABLE ventas ADD COLUMN subtotal DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER total",
    ignoreCodes: [1060],
  },
  {
    name: 'ALTER ventas: add descuento',
    sql: "ALTER TABLE ventas ADD COLUMN descuento DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER subtotal",
    ignoreCodes: [1060],
  },
  {
    name: 'ALTER ventas: add deuda_generada',
    sql: "ALTER TABLE ventas ADD COLUMN deuda_generada DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER descuento",
    ignoreCodes: [1060],
  },
  {
    name: 'ALTER ventas: add notas',
    sql: "ALTER TABLE ventas ADD COLUMN notas TEXT NULL",
    ignoreCodes: [1060],
  },
  {
    name: 'ALTER ventas: modify estado enum',
    sql: "ALTER TABLE ventas MODIFY COLUMN estado ENUM('completada','cancelada','pendiente','pagada') NOT NULL DEFAULT 'completada'",
    ignoreCodes: [1265],
  },

  // ── 4. vehiculos: tipo_vehiculo ──
  {
    name: 'ALTER vehiculos: add tipo_vehiculo',
    sql: "ALTER TABLE vehiculos ADD COLUMN tipo_vehiculo VARCHAR(50) NULL AFTER modelo",
    ignoreCodes: [1060],
  },

  // ── 5. cajas: observaciones ──
  {
    name: 'ALTER cajas: add observaciones',
    sql: "ALTER TABLE cajas ADD COLUMN observaciones TEXT NULL",
    ignoreCodes: [1060],
  },

  // ── 6. devoluciones: modificar origen enum para incluir 'reparto' ──
  {
    name: 'ALTER devoluciones: modify origen enum',
    sql: "ALTER TABLE devoluciones MODIFY COLUMN origen ENUM('manual','venta','reparto') NOT NULL DEFAULT 'manual'",
    ignoreCodes: [1265],
  },

  // ── 7. visitas_planta y visita_detalle ──
  {
    name: 'CREATE TABLE visitas_planta',
    sql: `CREATE TABLE IF NOT EXISTS visitas_planta (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      ruta_id         INT NOT NULL,
      repartidor_id   INT NOT NULL,
      tipo            VARCHAR(50) NOT NULL DEFAULT 'visita',
      notas           TEXT NULL,
      registrado_por  INT NOT NULL,
      fecha_hora      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ruta_id) REFERENCES rutas(id) ON DELETE CASCADE,
      FOREIGN KEY (repartidor_id) REFERENCES usuarios(id),
      FOREIGN KEY (registrado_por) REFERENCES usuarios(id)
    )`,
    ignoreCodes: [1050], // Table already exists
  },
  {
    name: 'CREATE TABLE visita_detalle',
    sql: `CREATE TABLE IF NOT EXISTS visita_detalle (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      visita_id       INT NOT NULL,
      presentacion_id INT NOT NULL,
      vacios_devueltos INT NOT NULL DEFAULT 0,
      llenos_devueltos INT NOT NULL DEFAULT 0,
      llenos_cargados  INT NOT NULL DEFAULT 0,
      FOREIGN KEY (visita_id) REFERENCES visitas_planta(id) ON DELETE CASCADE,
      FOREIGN KEY (presentacion_id) REFERENCES presentaciones(id)
    )`,
    ignoreCodes: [1050],
  },

  // ── 8. caja_movimientos: ampliar tipo enum para incluir 'abono_cliente' ──
  {
    name: 'ALTER caja_movimientos: modify tipo enum',
    sql: "ALTER TABLE caja_movimientos MODIFY COLUMN tipo ENUM('ingreso','egreso','abono_cliente') NOT NULL",
    ignoreCodes: [1265],
  },

  // ── 9. caja_movimientos: ampliar metodo_pago a VARCHAR para métodos dinámicos ──
  {
    name: 'ALTER caja_movimientos: metodo_pago to VARCHAR',
    sql: "ALTER TABLE caja_movimientos MODIFY COLUMN metodo_pago VARCHAR(50) NOT NULL",
    ignoreCodes: [],
  },
];

async function run() {
  console.log('=== Migration v11: Columnas faltantes ===\n');
  for (const step of steps) {
    try {
      await db.query(step.sql);
      console.log(`  ✓ ${step.name}`);
    } catch (err) {
      if (step.ignoreCodes?.includes(err.errno)) {
        console.log(`  ⊘ ${step.name} (already exists)`);
      } else {
        console.error(`  ✗ ${step.name}: ${err.message}`);
      }
    }
  }
  console.log('\n=== Migration v11 complete ===');
  process.exit(0);
}

run();
