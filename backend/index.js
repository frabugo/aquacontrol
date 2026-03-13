process.env.TZ = 'America/Lima';
// index.js — Servidor principal AquaControl
const express     = require('express');
const cors        = require('cors');
const compression = require('compression');
const http        = require('http');
const helmet      = require('helmet');
const hpp         = require('hpp');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const { getPool } = require('./poolManager');
const db = require('./db'); // inicia la conexión

const app  = express();
const PORT = process.env.PORT || 3001;

// Tokens invalidados por desplazamiento de sesión
global.tokenBlacklist = new Set();

// Limpiar cada hora tokens ya expirados
setInterval(() => {
  global.tokenBlacklist.clear();
}, 3600000);

// ── Compression (gzip) ──
app.use(compression());

// ── Seguridad ──
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(helmet());
app.use(hpp());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // same-origin / server-to-server
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    // Permitir aquacontrol.duckdns.org y subdominios *.aquacontrol.*
    if (/^https?:\/\/(([a-z0-9-]+\.)?aquacontrol\.)/i.test(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

// ── Multi-tenant: detectar empresa por subdominio ──
const { tenantMiddleware } = require('./middleware/tenantMiddleware');
app.use(tenantMiddleware);

// Rate limit global: 100 req/min por IP
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Demasiadas peticiones, intente en un momento' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', globalLimiter);

// ── Log de seguridad: registrar 401/403/429 en audit_log ──
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = function (body) {
    const status = res.statusCode;
    if (status === 401 || status === 403 || status === 429) {
      const accionMap = { 401: 'login_fallido', 403: 'acceso_denegado', 429: 'rate_limit' };
      const user = req.user || {};
      db.query(
        `INSERT INTO audit_log (usuario_id, usuario_nombre, usuario_rol, modulo, accion, tabla, detalle, ip)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          user.id || 0,
          user.nombre || 'anónimo',
          user.rol || 'anónimo',
          'seguridad',
          accionMap[status],
          req.baseUrl + req.path,
          JSON.stringify({ method: req.method, status, mensaje: body?.error || null }),
          req.ip || req.connection?.remoteAddress || null,
        ]
      ).catch(err => console.error('security-log:', err.message));
    }
    return originalJson(body);
  };
  next();
});

// Rutas
const authRouter      = require('./routes/auth');
const dashboardRouter = require('./routes/dashboard');
const clientesRouter  = require('./routes/clientes');
const ventasRouter         = require('./routes/ventas');
const bidoinesRouter       = require('./routes/bidones');
const presentacionesRouter = require('./routes/presentaciones');
const cajaRouter           = require('./routes/caja');
const insumosRouter        = require('./routes/insumos');
const comprasRouter        = require('./routes/compras');
const produccionRouter     = require('./routes/produccion');
const proveedoresRouter    = require('./routes/proveedores');
const recetasRouter        = require('./routes/recetas');
const lavadosRouter        = require('./routes/lavados');
const devolucionesRouter   = require('./routes/devoluciones');
const deudasRouter         = require('./routes/deudas');
const usuariosRouter       = require('./routes/usuarios');
const pedidosRouter        = require('./routes/pedidos');
const vehiculosRouter      = require('./routes/vehiculos');
const rutasRouter          = require('./routes/rutas');
const configRouter              = require('./routes/config');
const reportesRouter            = require('./routes/reportes');
const metasRouter               = require('./routes/metas');
const mantenimientosRouter      = require('./routes/mantenimientos');
const programacionMantRouter    = require('./routes/programacionMant');
const calidadRouter             = require('./routes/calidad');
const auditRouter               = require('./routes/audit');
const buscarRouter              = require('./routes/buscar');
const pushRouter                = require('./routes/push');
const metodosPagoRouter         = require('./routes/metodosPago');
const utilsRouter               = require('./routes/utils');
const facturacionRouter         = require('./routes/facturacion');
const condicionesPagoRouter     = require('./routes/condicionesPago');
const centralRouter             = require('./routes/central');

app.use('/api/auth',           authRouter);
app.use('/api/dashboard',      dashboardRouter);
app.use('/api/clientes',       clientesRouter);
app.use('/api/ventas',         ventasRouter);
app.use('/api/bidones',        bidoinesRouter);
app.use('/api/presentaciones', presentacionesRouter);
app.use('/api/caja',           cajaRouter);
app.use('/api/insumos',        insumosRouter);
app.use('/api/compras',        comprasRouter);
app.use('/api/produccion',     produccionRouter);
app.use('/api/proveedores',    proveedoresRouter);
app.use('/api/recetas',        recetasRouter);
app.use('/api/lavados',        lavadosRouter);
app.use('/api/devoluciones',   devolucionesRouter);
app.use('/api/deudas',         deudasRouter);
app.use('/api/usuarios',       usuariosRouter);
app.use('/api/pedidos',        pedidosRouter);
app.use('/api/vehiculos',      vehiculosRouter);
app.use('/api/rutas',          rutasRouter);
app.use('/api/config',           configRouter);
app.use('/api/reportes',       reportesRouter);
app.use('/api/metas',          metasRouter);
app.use('/api/mantenimientos', mantenimientosRouter);
app.use('/api/programacion-mantenimiento', programacionMantRouter);
app.use('/api/calidad',        calidadRouter);
app.use('/api/audit',          auditRouter);
app.use('/api/buscar',         buscarRouter);
app.use('/api/push',           pushRouter);
app.use('/api/metodos-pago',   metodosPagoRouter);
app.use('/api/utils',          utilsRouter);
app.use('/api/facturacion',    facturacionRouter);
app.use('/api/condiciones-pago', condicionesPagoRouter);
app.use('/api/central',          centralRouter);

// Auto-migrate: BD central (multi-tenant)
const { getCentralPool } = require('./middleware/tenantMiddleware');
(async () => {
  try {
    const rootPool = getPool(process.env.DB_NAME);
    await rootPool.query('CREATE DATABASE IF NOT EXISTS aquacontrol_central');
    const centralDb = getCentralPool();
    await centralDb.query(`CREATE TABLE IF NOT EXISTS tenants (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre_empresa VARCHAR(200) NOT NULL,
      subdominio VARCHAR(50) NOT NULL UNIQUE,
      database_name VARCHAR(100) NOT NULL UNIQUE,
      activo TINYINT(1) NOT NULL DEFAULT 1,
      plan VARCHAR(50) NOT NULL DEFAULT 'basico',
      max_usuarios INT NOT NULL DEFAULT 5,
      creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_subdominio (subdominio)
    )`);
    await centralDb.query(`CREATE TABLE IF NOT EXISTS tenant_modulos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL,
      modulo VARCHAR(50) NOT NULL,
      UNIQUE KEY uk_tenant_modulo (tenant_id, modulo),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )`);
    await centralDb.query(`INSERT IGNORE INTO tenants (nombre_empresa, subdominio, database_name, activo, plan, max_usuarios)
      VALUES ('AquaControl Principal', 'default', 'aquacontrol', 1, 'enterprise', 999)`);
    console.log('✅ BD central multi-tenant lista');
  } catch (err) {
    console.error('Auto-migrate central:', err.message);
  }
})();

// Auto-migrate: tabla configuracion
db.query(`CREATE TABLE IF NOT EXISTS configuracion (
  clave VARCHAR(100) PRIMARY KEY,
  valor TEXT,
  actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
)`).then(() => {
  // Seed: configs de stock (permitido por defecto) + modo demo + PIN
  db.query(`INSERT IGNORE INTO configuracion (clave, valor) VALUES
    ('vender_sin_stock',  '1'),
    ('entregar_sin_stock','1'),
    ('modo_sistema',      'demo')`);
  // Seed PIN maestro si no existe (default: 2024, texto plano en BD)
  db.query("INSERT IGNORE INTO configuracion (clave, valor) VALUES ('pin_maestro', '2024')")
    .catch(err => console.error('Seed pin_maestro:', err.message));
}).catch(err => console.error('Auto-migrate configuracion:', err.message));

// Auto-migrate: ingresos_vacios + lavados.presentacion_id
db.query(`CREATE TABLE IF NOT EXISTS ingresos_vacios (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  presentacion_id  INT NOT NULL,
  cantidad         INT NOT NULL,
  origen           ENUM('visita_planta','finalizacion_ruta','devolucion_cliente') NOT NULL,
  ruta_id          INT NULL,
  visita_id        INT NULL,
  repartidor_id    INT NULL,
  registrado_por   INT NOT NULL,
  notas            TEXT NULL,
  fecha_hora       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_iv_fecha (fecha_hora),
  INDEX idx_iv_ruta (ruta_id)
)`).catch(err => console.error('Auto-migrate ingresos_vacios:', err.message));
db.query(`ALTER TABLE lavados ADD COLUMN IF NOT EXISTS presentacion_id INT NULL`)
  .catch(err => console.error('Auto-migrate lavados.presentacion_id:', err.message));
db.query(`ALTER TABLE lavados MODIFY COLUMN insumo_id INT NULL`)
  .catch(err => console.error('Auto-migrate lavados.insumo_id nullable:', err.message));

// Auto-migrate: pago_id en caja_movimientos (para DELETE exacto al anular pagos)
db.query(`ALTER TABLE caja_movimientos ADD COLUMN IF NOT EXISTS pago_id INT NULL`)
  .catch(err => console.error('Auto-migrate caja_movimientos.pago_id:', err.message));

// Auto-migrate: mantenimiento_id en caja_movimientos (para vincular egresos de mantenimiento)
db.query(`ALTER TABLE caja_movimientos ADD COLUMN IF NOT EXISTS mantenimiento_id INT NULL`)
  .catch(err => console.error('Auto-migrate caja_movimientos.mantenimiento_id:', err.message));

// Auto-migrate: anulado en caja_movimientos (para anular movimientos manuales)
db.query(`ALTER TABLE caja_movimientos ADD COLUMN IF NOT EXISTS anulado TINYINT(1) NOT NULL DEFAULT 0`)
  .catch(err => console.error('Auto-migrate caja_movimientos.anulado:', err.message));
db.query(`ALTER TABLE caja_movimientos ADD COLUMN IF NOT EXISTS anulado_por INT NULL`)
  .catch(err => console.error('Auto-migrate caja_movimientos.anulado_por:', err.message));
db.query(`ALTER TABLE caja_movimientos ADD COLUMN IF NOT EXISTS anulado_en DATETIME NULL`)
  .catch(err => console.error('Auto-migrate caja_movimientos.anulado_en:', err.message));

// Auto-migrate: km_diferencia_inicio en rutas (diferencia km si otro usó el vehículo)
db.query(`ALTER TABLE rutas ADD COLUMN IF NOT EXISTS km_diferencia_inicio INT NULL`)
  .catch(err => console.error('Auto-migrate rutas.km_diferencia_inicio:', err.message));

// Auto-migrate: ubigeo en clientes y proveedores
db.query(`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS ubigeo VARCHAR(10) NULL`)
  .catch(err => console.error('Auto-migrate clientes.ubigeo:', err.message));
db.query(`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS ubigeo VARCHAR(10) NULL`)
  .catch(err => console.error('Auto-migrate proveedores.ubigeo:', err.message));

// Auto-migrate: metas, mantenimientos, controles_calidad, calidad_parametros
db.query(`CREATE TABLE IF NOT EXISTS metas (
  id INT AUTO_INCREMENT PRIMARY KEY, usuario_id INT NOT NULL, mes DATE NOT NULL,
  meta_soles DECIMAL(10,2) NOT NULL, meta_bidones INT NULL,
  comision_pct DECIMAL(5,2) DEFAULT 0, bono_cumplido DECIMAL(10,2) DEFAULT 0,
  creado_por INT NOT NULL, creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_usuario_mes (usuario_id, mes), INDEX idx_mes (mes)
)`).catch(err => console.error('Auto-migrate metas:', err.message));

db.query(`CREATE TABLE IF NOT EXISTS mantenimientos (
  id INT AUTO_INCREMENT PRIMARY KEY, vehiculo_id INT NOT NULL,
  tipo ENUM('preventivo','correctivo','revision') NOT NULL, descripcion TEXT NOT NULL,
  kilometraje INT NULL, costo DECIMAL(10,2) DEFAULT 0, proveedor VARCHAR(200) NULL,
  fecha DATE NOT NULL, proximo_km INT NULL, proximo_fecha DATE NULL,
  estado ENUM('pendiente','completado','cancelado') DEFAULT 'completado',
  registrado_por INT NOT NULL, creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_vehiculo (vehiculo_id), INDEX idx_fecha (fecha)
)`).catch(err => console.error('Auto-migrate mantenimientos:', err.message));

db.query(`ALTER TABLE vehiculos ADD COLUMN IF NOT EXISTS kilometraje_actual INT DEFAULT 0`)
  .catch(err => console.error('Auto-migrate vehiculos.kilometraje_actual:', err.message));

db.query(`CREATE TABLE IF NOT EXISTS controles_calidad (
  id INT AUTO_INCREMENT PRIMARY KEY, fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  punto_muestreo ENUM('entrada','osmosis','post_uv','tanque','envasado') NOT NULL,
  ph DECIMAL(4,2) NULL, cloro_residual DECIMAL(5,3) NULL, tds INT NULL,
  turbidez DECIMAL(6,2) NULL, temperatura DECIMAL(4,1) NULL,
  observaciones TEXT NULL, cumple TINYINT(1) DEFAULT 1, registrado_por INT NOT NULL,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_fecha (fecha), INDEX idx_punto (punto_muestreo)
)`).catch(err => console.error('Auto-migrate controles_calidad:', err.message));

db.query(`CREATE TABLE IF NOT EXISTS calidad_parametros (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parametro ENUM('ph','cloro_residual','tds','turbidez','temperatura') NOT NULL,
  min_valor DECIMAL(10,3) NULL, max_valor DECIMAL(10,3) NULL, unidad VARCHAR(20) NOT NULL,
  UNIQUE KEY uk_parametro (parametro)
)`).then(() => {
  db.query(`INSERT IGNORE INTO calidad_parametros (parametro, min_valor, max_valor, unidad) VALUES
    ('ph', 6.500, 8.500, 'pH'), ('cloro_residual', 0.000, 0.500, 'mg/L'),
    ('tds', 0.000, 500.000, 'ppm'), ('turbidez', 0.000, 5.000, 'NTU'),
    ('temperatura', 10.000, 30.000, '°C')`);
}).catch(err => console.error('Auto-migrate calidad_parametros:', err.message));

// Auto-migrate v8: km tracking en rutas + programacion_mantenimiento
db.query(`ALTER TABLE rutas ADD COLUMN IF NOT EXISTS km_inicio INT NULL`)
  .catch(err => console.error('Auto-migrate rutas.km_inicio:', err.message));
db.query(`ALTER TABLE rutas ADD COLUMN IF NOT EXISTS km_fin INT NULL`)
  .catch(err => console.error('Auto-migrate rutas.km_fin:', err.message));
db.query(`CREATE TABLE IF NOT EXISTS programacion_mantenimiento (
  id                       INT AUTO_INCREMENT PRIMARY KEY,
  vehiculo_id              INT NOT NULL,
  tipo_mantenimiento       VARCHAR(100) NOT NULL,
  cada_km                  INT NOT NULL,
  categoria                VARCHAR(50) DEFAULT 'general',
  descripcion              TEXT NULL,
  activo                   TINYINT(1) DEFAULT 1,
  ultimo_km_realizado      INT DEFAULT 0,
  ultimo_mantenimiento_id  INT NULL,
  creado_por               INT NOT NULL,
  creado_en                DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_vehiculo (vehiculo_id)
)`).catch(err => console.error('Auto-migrate programacion_mantenimiento:', err.message));
db.query(`ALTER TABLE programacion_mantenimiento ADD COLUMN IF NOT EXISTS categoria VARCHAR(50) DEFAULT 'general'`)
  .catch(err => console.error('Auto-migrate programacion_mantenimiento.categoria:', err.message));

// Auto-migrate v9: columna para retornables → lavado
db.query(`ALTER TABLE presentaciones ADD COLUMN IF NOT EXISTS stock_en_lavado INT NOT NULL DEFAULT 0`)
  .catch(err => console.error('Auto-migrate stock_en_lavado:', err.message));

// Auto-migrate: es_producto_final — producto comprado listo para vender (no requiere producción)
db.query(`ALTER TABLE presentaciones ADD COLUMN IF NOT EXISTS es_producto_final TINYINT(1) NOT NULL DEFAULT 0`)
  .catch(err => console.error('Auto-migrate presentaciones.es_producto_final:', err.message));

// Trigger compra REMOVIDO — la lógica ahora está en comprasController.create (app code)
db.query('DROP TRIGGER IF EXISTS trg_compra_actualiza_stock')
  .catch(err => console.error('Drop trg_compra_actualiza_stock:', err.message));

// Trigger lavado: stock_en_lavado → stock_vacios
db.query('DROP TRIGGER IF EXISTS trg_lavado_a_insumo').then(() =>
  db.query(`CREATE TRIGGER trg_lavado_a_insumo
AFTER INSERT ON lavados
FOR EACH ROW
BEGIN
  DECLARE v_pres_id INT DEFAULT NULL;
  DECLARE v_is_ret TINYINT DEFAULT 0;

  IF NEW.insumo_id IS NOT NULL THEN
    SELECT es_retornable INTO v_is_ret FROM insumos WHERE id = NEW.insumo_id;
    IF v_is_ret = 0 THEN
      UPDATE insumos
         SET stock_actual = stock_actual + NEW.cantidad
       WHERE id = NEW.insumo_id;
      INSERT INTO insumos_movimientos (insumo_id, tipo, cantidad, motivo)
      VALUES (NEW.insumo_id, 'ajuste_entrada', NEW.cantidad,
        CONCAT('Lavado completado: ', NEW.cantidad, ' unidades'));
    END IF;
  END IF;

  SET v_pres_id = NEW.presentacion_id;
  IF v_pres_id IS NULL AND NEW.insumo_id IS NOT NULL THEN
    SELECT presentacion_id INTO v_pres_id FROM insumos WHERE id = NEW.insumo_id;
  END IF;

  IF v_pres_id IS NOT NULL THEN
    UPDATE presentaciones
       SET stock_vacios = stock_vacios + NEW.cantidad,
           stock_en_lavado = GREATEST(0, stock_en_lavado - NEW.cantidad)
     WHERE id = v_pres_id;

    INSERT INTO stock_movimientos (presentacion_id, tipo, cantidad, estado_origen, estado_destino, registrado_por, motivo)
    VALUES (v_pres_id, 'lavado_fin', NEW.cantidad, 'en_lavado', 'vacio', NEW.operario_id, CONCAT('Lavado completado: ', NEW.cantidad, ' unidades'));
  END IF;
END`)
).catch(err => console.error('Auto-migrate trg_lavado_a_insumo:', err.message));

// Auto-migrate: ventas.repartidor_id — asociar ventas de reparto con su repartidor
db.query(`ALTER TABLE ventas ADD COLUMN IF NOT EXISTS repartidor_id INT NULL`).then(() =>
  db.query(`CREATE OR REPLACE VIEW v_avance_metas AS
  SELECT m.*, u.nombre AS usuario_nombre, u.rol,
    COALESCE(SUM(v.total), 0) AS vendido_soles, COUNT(v.id) AS total_ventas,
    COALESCE(SUM(vd.cantidad), 0) AS vendido_bidones
  FROM metas m JOIN usuarios u ON u.id = m.usuario_id
  LEFT JOIN ventas v ON (v.vendedor_id = m.usuario_id OR v.repartidor_id = m.usuario_id)
    AND v.estado != 'cancelada' AND v.fecha_hora >= m.mes AND v.fecha_hora < DATE_ADD(m.mes, INTERVAL 1 MONTH)
  LEFT JOIN venta_detalle vd ON vd.venta_id = v.id GROUP BY m.id
`)
).catch(err => console.error('Auto-migrate ventas.repartidor_id + v_avance_metas:', err.message));

// Auto-migrate: caja_ruta — columnas para flujo solicitar/confirmar entrega
db.query(`ALTER TABLE caja_ruta ADD COLUMN IF NOT EXISTS solicitada_entrega TINYINT(1) NOT NULL DEFAULT 0`)
  .catch(err => console.error('Auto-migrate caja_ruta.solicitada_entrega:', err.message));
db.query(`ALTER TABLE caja_ruta ADD COLUMN IF NOT EXISTS solicitada_en DATETIME NULL`)
  .catch(err => console.error('Auto-migrate caja_ruta.solicitada_en:', err.message));
db.query(`ALTER TABLE caja_ruta ADD COLUMN IF NOT EXISTS confirmada_en DATETIME NULL`)
  .catch(err => console.error('Auto-migrate caja_ruta.confirmada_en:', err.message));

// Auto-migrate: caja_ruta_movimientos.metodo_pago ENUM → VARCHAR (métodos dinámicos)
db.query(`ALTER TABLE caja_ruta_movimientos MODIFY COLUMN metodo_pago VARCHAR(50) NOT NULL`)
  .catch(err => console.error('Auto-migrate caja_ruta_movimientos.metodo_pago:', err.message));

// Auto-migrate: trg_completar_lote — producción inserta stock_movimientos
db.query('DROP TRIGGER IF EXISTS trg_completar_lote').then(() =>
  db.query(`CREATE TRIGGER trg_completar_lote
AFTER UPDATE ON lotes_produccion
FOR EACH ROW
BEGIN
  IF NEW.estado = 'completado' AND OLD.estado <> 'completado' THEN
    UPDATE insumos i
    JOIN recetas_produccion r ON r.insumo_id = i.id AND r.presentacion_id = NEW.presentacion_id AND r.es_opcional = 0
    SET i.stock_actual = i.stock_actual - (r.cantidad * NEW.cantidad_producida);

    INSERT INTO insumos_movimientos (insumo_id, tipo, cantidad, lote_id, motivo)
    SELECT r.insumo_id, 'consumo_lote', -(r.cantidad * NEW.cantidad_producida), NEW.id,
           CONCAT('Lote ', NEW.numero, ' — ', NEW.cantidad_producida, ' unidades')
    FROM recetas_produccion r WHERE r.presentacion_id = NEW.presentacion_id AND r.es_opcional = 0;

    UPDATE presentaciones SET stock_llenos = stock_llenos + NEW.cantidad_producida WHERE id = NEW.presentacion_id;

    IF (SELECT es_retornable FROM presentaciones WHERE id = NEW.presentacion_id) = 1 THEN
      UPDATE presentaciones SET stock_vacios = GREATEST(0, stock_vacios - NEW.cantidad_producida) WHERE id = NEW.presentacion_id;
    END IF;

    INSERT INTO stock_movimientos (presentacion_id, tipo, cantidad, registrado_por, estado_origen, estado_destino)
    VALUES (NEW.presentacion_id, 'llenado', NEW.cantidad_producida, NEW.operario_id, 'vacio', 'lleno');
  END IF;
END`)
).catch(err => console.error('Auto-migrate trg_completar_lote:', err.message));

// Auto-migrate: drop dead SP sp_cargar_vehiculo (reemplazado por app code en rutasController.cargar)
db.query('DROP PROCEDURE IF EXISTS sp_cargar_vehiculo')
  .catch(err => console.error('Auto-migrate drop sp_cargar_vehiculo:', err.message));

// Auto-migrate: ampliar ENUM caja_movimientos.origen para incluir 'apertura'
db.query("ALTER TABLE caja_movimientos MODIFY COLUMN origen ENUM('directo','repartidor','apertura') NOT NULL DEFAULT 'directo'")
  .catch(err => console.error('Auto-migrate cm.origen:', err.message));

// Auto-migrate: drop trigger trg_venta_reparto_a_caja (reemplazado por app code en pedidosController.entregar)
db.query('DROP TRIGGER IF EXISTS trg_venta_reparto_a_caja')
  .then(() => {
    // Recalcular totales de caja_ruta abiertas (por si quedaron datos duplicados del trigger)
    return db.query(`
      UPDATE caja_ruta cr SET
        total_cobrado = (
          SELECT COALESCE(SUM(monto), 0) FROM caja_ruta_movimientos
          WHERE caja_ruta_id = cr.id AND tipo = 'cobro_venta'
        ),
        cobrado_efectivo = (
          SELECT COALESCE(SUM(monto), 0) FROM caja_ruta_movimientos
          WHERE caja_ruta_id = cr.id AND tipo = 'cobro_venta' AND metodo_pago = 'efectivo'
        ),
        cobrado_transferencia = (
          SELECT COALESCE(SUM(monto), 0) FROM caja_ruta_movimientos
          WHERE caja_ruta_id = cr.id AND tipo = 'cobro_venta' AND metodo_pago = 'transferencia'
        ),
        cobrado_tarjeta = (
          SELECT COALESCE(SUM(monto), 0) FROM caja_ruta_movimientos
          WHERE caja_ruta_id = cr.id AND tipo = 'cobro_venta' AND metodo_pago = 'tarjeta'
        ),
        cobrado_credito = (
          SELECT COALESCE(SUM(monto), 0) FROM caja_ruta_movimientos
          WHERE caja_ruta_id = cr.id AND tipo = 'cobro_venta' AND metodo_pago = 'credito'
        )
      WHERE cr.estado = 'abierta'
    `);
  })
  .then(() => {
    // Recalcular neto_a_entregar
    return db.query(`UPDATE caja_ruta SET neto_a_entregar = total_cobrado - total_gastos WHERE estado = 'abierta'`);
  })
  .then(() => {
    // Eliminar movimientos duplicados en caja_ruta_movimientos (dejar solo 1 por venta+metodo)
    return db.query(`
      DELETE crm FROM caja_ruta_movimientos crm
      INNER JOIN (
        SELECT MIN(id) AS keep_id, caja_ruta_id, venta_id, metodo_pago
        FROM caja_ruta_movimientos
        WHERE tipo = 'cobro_venta' AND venta_id IS NOT NULL
        GROUP BY caja_ruta_id, venta_id, metodo_pago
        HAVING COUNT(*) > 1
      ) dups ON crm.caja_ruta_id = dups.caja_ruta_id
           AND crm.venta_id = dups.venta_id
           AND crm.metodo_pago = dups.metodo_pago
           AND crm.tipo = 'cobro_venta'
           AND crm.id != dups.keep_id
    `);
  })
  .then(([result]) => {
    if (result.affectedRows > 0) console.log(`Auto-migrate: cleaned ${result.affectedRows} duplicate caja_ruta_movimientos`);
  })
  .then(() => {
    // Eliminar movimientos duplicados en caja_movimientos (dejar solo 1 por venta+metodo+origen repartidor)
    return db.query(`
      DELETE cm FROM caja_movimientos cm
      INNER JOIN (
        SELECT MIN(id) AS keep_id, venta_id, metodo_pago
        FROM caja_movimientos
        WHERE origen = 'repartidor' AND venta_id IS NOT NULL
        GROUP BY venta_id, metodo_pago
        HAVING COUNT(*) > 1
      ) dups ON cm.venta_id = dups.venta_id
           AND cm.metodo_pago = dups.metodo_pago
           AND cm.origen = 'repartidor'
           AND cm.id != dups.keep_id
    `);
  })
  .then(([result]) => {
    if (result.affectedRows > 0) console.log(`Auto-migrate: cleaned ${result.affectedRows} duplicate caja_movimientos`);
  })
  .catch(err => console.error('Auto-migrate drop trg_venta_reparto_a_caja:', err.message));

// Auto-migrate: actualizar vista v_cajas_repartidores con columnas de entrega
db.query(`CREATE OR REPLACE VIEW v_cajas_repartidores AS
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
  cr.solicitada_entrega,
  cr.solicitada_en,
  cr.confirmada_en,
  ue.nombre AS entregada_a_nombre,
  (SELECT COUNT(*) FROM pedidos p WHERE p.ruta_id = r.id AND p.estado NOT IN ('reasignado','cancelado')) AS total_pedidos,
  (SELECT COUNT(*) FROM pedidos p WHERE p.ruta_id = r.id AND p.estado = 'entregado') AS pedidos_entregados
FROM caja_ruta cr
JOIN rutas r ON r.id = cr.ruta_id
JOIN usuarios u ON u.id = cr.repartidor_id
LEFT JOIN vehiculos v ON v.id = r.vehiculo_id
LEFT JOIN usuarios ue ON ue.id = cr.entregada_a
`).catch(err => console.error('Auto-migrate v_cajas_repartidores:', err.message));

// Auto-migrate: push_subscriptions
db.query(`CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth VARCHAR(255) NOT NULL,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_push_usuario (usuario_id),
  UNIQUE KEY uk_endpoint (endpoint(500))
)`).catch(err => console.error('Auto-migrate push_subscriptions:', err.message));

// Auto-migrate: audit_log
db.query(`CREATE TABLE IF NOT EXISTS audit_log (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  usuario_id     INT NOT NULL,
  usuario_nombre VARCHAR(150) NOT NULL,
  usuario_rol    VARCHAR(20) NOT NULL,
  modulo         VARCHAR(50) NOT NULL,
  accion         ENUM('crear','editar','eliminar','cancelar','abrir','cerrar','reabrir') NOT NULL,
  tabla          VARCHAR(100) NOT NULL,
  registro_id    INT NULL,
  detalle        JSON NULL,
  ip             VARCHAR(45) NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_fecha (created_at),
  INDEX idx_audit_usuario (usuario_id),
  INDEX idx_audit_modulo (modulo)
)`).catch(err => console.error('Auto-migrate audit_log:', err.message));

// Auto-migrate: ampliar ENUM accion para eventos de seguridad
db.query(`ALTER TABLE audit_log MODIFY COLUMN accion
  ENUM('crear','editar','eliminar','cancelar','abrir','cerrar','reabrir',
       'login_fallido','acceso_denegado','rate_limit') NOT NULL`)
  .catch(err => console.error('Auto-migrate audit_log.accion ENUM:', err.message));

// Auto-migrate: ampliar ENUM estado_destino en stock_movimientos con 'vendido'
db.query(`ALTER TABLE stock_movimientos MODIFY COLUMN estado_destino
  ENUM('lleno','vacio','roto','en_lavado','en_reparacion','perdido','baja','en_ruta_lleno','en_ruta_vacio','vendido') NULL`)
  .catch(err => console.error('Auto-migrate stock_movimientos.estado_destino:', err.message));

// Auto-migrate v10: fix stock descuadrado en reparto
// Fix 1: Trigger trg_actualizar_stock_venta — solo descuenta stock_llenos en ventas de PLANTA (ruta_id IS NULL)
// Reparto ya fue descontado por sp_cargar_vehiculo al cargar.
// Bidones prestados siguen aplicando en todos los casos.
// stock_movimientos ya no se inserta aquí (lo hace app code con estados correctos).
db.query('DROP TRIGGER IF EXISTS trg_actualizar_stock_venta').then(() =>
  db.query(`CREATE TRIGGER trg_actualizar_stock_venta
AFTER INSERT ON venta_detalle
FOR EACH ROW
BEGIN
  DECLARE v_ruta_id INT DEFAULT NULL;
  DECLARE v_cliente_id INT DEFAULT NULL;

  SELECT ruta_id, cliente_id INTO v_ruta_id, v_cliente_id
  FROM ventas WHERE id = NEW.venta_id;

  -- bidones_prestados: siempre (planta y reparto)
  IF NEW.tipo_linea = 'prestamo' AND v_cliente_id IS NOT NULL THEN
    UPDATE clientes SET bidones_prestados = bidones_prestados + NEW.cantidad
    WHERE id = v_cliente_id;
  ELSEIF NEW.tipo_linea = 'devolucion' AND v_cliente_id IS NOT NULL THEN
    UPDATE clientes SET bidones_prestados = GREATEST(0, bidones_prestados - NEW.vacios_recibidos)
    WHERE id = v_cliente_id;
  END IF;

  -- stock_llenos: SOLO planta (ruta_id IS NULL)
  -- Reparto ya fue descontado al cargar vehiculo (sp_cargar_vehiculo)
  IF v_ruta_id IS NULL THEN
    IF NEW.tipo_linea IN ('compra_bidon', 'recarga', 'prestamo', 'producto') THEN
      UPDATE presentaciones SET stock_llenos = stock_llenos - NEW.cantidad
      WHERE id = NEW.presentacion_id;
    END IF;
  END IF;

  -- stock_movimientos: manejado por app code (no duplicar aqui)
END`)
).catch(err => console.error('Auto-migrate v10 trigger trg_actualizar_stock_venta:', err.message));

// Fix 2: SP sp_finalizar_ruta — vacios van a stock_en_lavado (no stock_vacios)
// Resta lo que ya se envió en visitas a planta para no duplicar.
db.query('DROP PROCEDURE IF EXISTS sp_finalizar_ruta').then(() =>
  db.query(`CREATE PROCEDURE sp_finalizar_ruta(IN p_ruta_id INT, IN p_usuario_id INT)
BEGIN
  -- Llenos sobrantes vuelven a stock de planta
  -- Restar los que ya se devolvieron en visitas a planta (ya sumados en ese momento)
  UPDATE presentaciones p
  JOIN stock_vehiculo sv ON sv.presentacion_id = p.id AND sv.ruta_id = p_ruta_id
  LEFT JOIN (
    SELECT presentacion_id, COALESCE(SUM(llenos_devueltos), 0) AS ya_devueltos
    FROM visita_detalle vd
    JOIN visitas_planta vp ON vp.id = vd.visita_id
    WHERE vp.ruta_id = p_ruta_id
    GROUP BY presentacion_id
  ) vd ON vd.presentacion_id = sv.presentacion_id
  SET p.stock_llenos = p.stock_llenos + GREATEST(0, sv.llenos_sobrantes - COALESCE(vd.ya_devueltos, 0));

  -- Vacios van a cola de lavado (sucios), no a stock_vacios (limpios)
  -- Restar lo que ya se envio a lavado desde visitas a planta
  UPDATE presentaciones p
  JOIN stock_vehiculo sv ON sv.presentacion_id = p.id AND sv.ruta_id = p_ruta_id
  LEFT JOIN (
    SELECT presentacion_id, COALESCE(SUM(cantidad), 0) AS ya_enviado
    FROM ingresos_vacios WHERE ruta_id = p_ruta_id AND origen = 'visita_planta'
    GROUP BY presentacion_id
  ) iv ON iv.presentacion_id = sv.presentacion_id
  SET p.stock_en_lavado = p.stock_en_lavado + GREATEST(0, sv.vacios_devueltos - COALESCE(iv.ya_enviado, 0));

  UPDATE rutas SET estado = 'finalizada', hora_regreso = NOW()
  WHERE id = p_ruta_id;
END`)
).catch(err => console.error('Auto-migrate v10 sp_finalizar_ruta:', err.message));

// Auto-migrate: pedidos.direccion_entrega (dirección de entrega separada de dirección fiscal del cliente)
db.query(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS direccion_entrega TEXT NULL AFTER longitud`)
  .catch(err => console.error('Auto-migrate pedidos.direccion_entrega:', err.message));

// Auto-migrate: devoluciones — agregar ruta_id y origen 'reparto'
db.query(`ALTER TABLE devoluciones ADD COLUMN IF NOT EXISTS ruta_id INT NULL`)
  .catch(err => console.error('Auto-migrate devoluciones.ruta_id:', err.message));
db.query(`ALTER TABLE devoluciones MODIFY COLUMN origen ENUM('manual','venta','reparto') NOT NULL DEFAULT 'manual'`)
  .catch(err => console.error('Auto-migrate devoluciones.origen:', err.message));

// Auto-migrate: pagos_proveedores — pagos a proveedores por compras
db.query(`CREATE TABLE IF NOT EXISTS pagos_proveedores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  compra_id INT NULL,
  proveedor_id INT NOT NULL,
  monto DECIMAL(12,2) NOT NULL,
  metodo_pago VARCHAR(50) NOT NULL,
  registrado_por INT NOT NULL,
  notas TEXT NULL,
  estado ENUM('activo','anulado') DEFAULT 'activo',
  fecha_hora DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pp_proveedor (proveedor_id),
  INDEX idx_pp_compra (compra_id),
  INDEX idx_pp_fecha (fecha_hora)
)`).catch(err => console.error('Auto-migrate pagos_proveedores:', err.message));

db.query(`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS saldo_deuda DECIMAL(12,2) NOT NULL DEFAULT 0`)
  .then(() => {
    // Recalcular saldo_deuda de proveedores existentes (compras no anuladas - pagos activos)
    return db.query(`
      UPDATE proveedores p SET saldo_deuda = GREATEST(0,
        COALESCE((SELECT SUM(c.total) FROM compras c WHERE c.proveedor_id = p.id AND c.estado != 'anulada'), 0)
        - COALESCE((SELECT SUM(pp.monto) FROM pagos_proveedores pp WHERE pp.proveedor_id = p.id AND pp.estado = 'activo'), 0)
      ) WHERE p.activo = 1
    `);
  })
  .catch(err => console.error('Auto-migrate proveedores.saldo_deuda:', err.message));

db.query(`ALTER TABLE caja_movimientos ADD COLUMN IF NOT EXISTS pago_proveedor_id INT NULL`)
  .catch(err => console.error('Auto-migrate caja_movimientos.pago_proveedor_id:', err.message));

// Auto-migrate: performance indexes
const perfIndexes = [
  'CREATE INDEX IF NOT EXISTS idx_ventas_fecha_estado ON ventas (fecha_hora, estado)',
  'CREATE INDEX IF NOT EXISTS idx_ventas_cliente ON ventas (cliente_id, estado)',
  'CREATE INDEX IF NOT EXISTS idx_pedidos_fecha_estado ON pedidos (fecha, estado)',
  'CREATE INDEX IF NOT EXISTS idx_pedidos_ruta ON pedidos (ruta_id, estado)',
  'CREATE INDEX IF NOT EXISTS idx_pedidos_repartidor ON pedidos (repartidor_id)',
  'CREATE INDEX IF NOT EXISTS idx_cajamov_caja_tipo ON caja_movimientos (caja_id, tipo)',
  'CREATE INDEX IF NOT EXISTS idx_clientes_activo_tipo ON clientes (activo, tipo)',
  'CREATE INDEX IF NOT EXISTS idx_rutas_rep_estado ON rutas (repartidor_id, estado)',
  'CREATE INDEX IF NOT EXISTS idx_devoluciones_estado_fecha ON devoluciones (estado, fecha)',
  'CREATE INDEX IF NOT EXISTS idx_stockveh_ruta ON stock_vehiculo (ruta_id, presentacion_id)',
];
Promise.all(perfIndexes.map(sql => db.query(sql).catch(e => console.error('Index:', e.message))))
  .catch(err => console.error('Auto-migrate perf indexes:', err.message));

// Auto-migrate: condiciones_pago
db.query(`CREATE TABLE IF NOT EXISTS condiciones_pago (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  descripcion VARCHAR(255) NULL,
  tipo ENUM('contado','credito') NOT NULL DEFAULT 'contado',
  num_cuotas INT NOT NULL DEFAULT 1,
  dias_entre_cuotas INT NOT NULL DEFAULT 30,
  es_sistema TINYINT(1) DEFAULT 0,
  activo TINYINT(1) DEFAULT 1,
  orden INT DEFAULT 0,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_condpago_nombre (nombre)
)`).then(() => {
  db.query(`INSERT IGNORE INTO condiciones_pago (nombre, descripcion, tipo, num_cuotas, dias_entre_cuotas, es_sistema, orden) VALUES
    ('Contado',           'Pago inmediato',          'contado', 1, 0,  1, 0),
    ('Crédito 15 días',   'Pago a 15 días',          'credito', 1, 15, 1, 1),
    ('Crédito 30 días',   'Pago a 30 días',          'credito', 1, 30, 1, 2),
    ('2 cuotas',          '2 cuotas cada 30 días',   'credito', 2, 30, 1, 3),
    ('3 cuotas',          '3 cuotas cada 30 días',   'credito', 3, 30, 1, 4)`);
}).catch(err => console.error('Auto-migrate condiciones_pago:', err.message));

// Auto-migrate: comprobantes (facturación electrónica)
db.query(`CREATE TABLE IF NOT EXISTS comprobantes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  venta_id INT NOT NULL,
  tipo_comprobante ENUM('boleta','factura') NOT NULL,
  tipo_documento VARCHAR(5) NOT NULL,
  numero_documento VARCHAR(20) NOT NULL,
  razon_social VARCHAR(255) NOT NULL,
  direccion VARCHAR(500) NULL,
  ubigeo VARCHAR(10) NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  igv DECIMAL(10,2) NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  porcentaje_igv DECIMAL(5,2) NOT NULL,
  serie VARCHAR(10) NULL,
  numero VARCHAR(20) NULL,
  pdf_url TEXT NULL,
  xml_url TEXT NULL,
  cdr_url TEXT NULL,
  hash_cpe VARCHAR(255) NULL,
  api_response JSON NULL,
  estado ENUM('emitido','error','anulado') DEFAULT 'emitido',
  error_mensaje TEXT NULL,
  emitido_por INT NOT NULL,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_comp_venta (venta_id),
  INDEX idx_comp_estado (estado)
)`).catch(err => console.error('Auto-migrate comprobantes:', err.message));

// Auto-migrate: condicion_pago_nombre en comprobantes
db.query(`ALTER TABLE comprobantes ADD COLUMN IF NOT EXISTS condicion_pago VARCHAR(100) NULL AFTER porcentaje_igv`)
  .catch(err => console.error('Auto-migrate comprobantes.condicion_pago:', err.message));

// Auto-migrate: ampliar ENUM tipo_comprobante para guia_remision
db.query(`ALTER TABLE comprobantes MODIFY COLUMN tipo_comprobante ENUM('boleta','factura','guia_remision') NOT NULL`)
  .catch(err => console.error('Auto-migrate comprobantes.tipo_comprobante ENUM:', err.message));

// Auto-migrate: estado_sunat en comprobantes (01=Registrado, 05=Aceptado, 07=Observado, 09=Rechazado, 11=Anulado)
db.query(`ALTER TABLE comprobantes ADD COLUMN IF NOT EXISTS estado_sunat VARCHAR(5) NULL`)
  .catch(err => console.error('Auto-migrate comprobantes.estado_sunat:', err.message));
db.query(`ALTER TABLE comprobantes ADD COLUMN IF NOT EXISTS voided_external_id VARCHAR(100) NULL`)
  .catch(err => console.error('Auto-migrate comprobantes.voided_external_id:', err.message));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', sistema: 'AquaControl', db: 'MariaDB' });
});

// Ping — para probar conexión desde Config
app.get('/api/ping', (req, res) => {
  res.json({ pong: true, ts: Date.now() });
});

// ── Socket.IO — Monitoreo en tiempo real ──
const { Server } = require('socket.io');

// Siempre HTTP — Safari iOS rechaza certificados autofirmados
const server = http.createServer(app);
console.log('Backend corriendo en HTTP');

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      if (/^https?:\/\/(([a-z0-9-]+\.)?aquacontrol\.)/i.test(origin)) return callback(null, true);
      callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Exponer io para usarlo en auth.js
app.set('io', io);

// Ubicaciones activas en memoria
const ubicacionesActivas = new Map();

io.on('connection', (socket) => {
  console.log('Socket conectado:', socket.id);

  // Repartidor envía su ubicación
  socket.on('ubicacion:update', async (data) => {
    try {
      const [rows] = await db.query(
        `SELECT u.nombre, v.placa, COALESCE(v.tipo_vehiculo, '') AS tipo_vehiculo, r.estado, r.id AS ruta_id
           FROM rutas r
           JOIN usuarios u ON u.id = r.repartidor_id
           JOIN vehiculos v ON v.id = r.vehiculo_id
          WHERE r.repartidor_id = ? AND r.estado IN ('en_ruta','regresando')
          LIMIT 1`,
        [data.repartidor_id]
      );
      if (rows.length === 0) return;

      // Persistir GPS en la ruta
      await db.query(
        `UPDATE rutas SET gps_activo = 1, ultima_ubicacion = NOW(),
                ultima_lat = ?, ultima_lng = ?
          WHERE id = ?`,
        [data.lat, data.lng, rows[0].ruta_id]
      );

      const info = {
        repartidor_id: data.repartidor_id,
        lat: data.lat,
        lng: data.lng,
        speed: data.speed || 0,
        nombre: rows[0].nombre,
        placa: rows[0].placa,
        tipo_vehiculo: rows[0].tipo_vehiculo,
        estado: rows[0].estado,
        ruta_id: rows[0].ruta_id,
        timestamp: Date.now(),
      };

      ubicacionesActivas.set(String(data.repartidor_id), info);
      io.to('central').emit('ubicacion:update', info);
    } catch (err) {
      console.error('Error ubicacion:update', err.message);
    }
  });

  // Central se une a su sala — solo enviar activos <15s
  socket.on('central:join', () => {
    socket.join('central');
    const ahora = Date.now();
    const activos = Array.from(ubicacionesActivas.values())
      .filter((u) => ahora - u.timestamp < 15000);
    socket.emit('ubicaciones:todas', activos);
  });

  // Repartidor se identifica
  socket.on('repartidor:join', (data) => {
    socket.join(`repartidor_${data.repartidor_id}`);
  });

  socket.on('disconnect', () => {
    console.log('Socket desconectado:', socket.id);
  });
});

// Limpiar ubicaciones inactivas (>15s sin señal)
setInterval(async () => {
  const ahora = Date.now();
  for (const [id, info] of ubicacionesActivas) {
    if (ahora - info.timestamp > 15000) {
      ubicacionesActivas.delete(id);
      io.to('central').emit('ubicacion:offline', { repartidor_id: id });
      // Marcar GPS inactivo en DB
      try {
        if (info.ruta_id) {
          await db.query('UPDATE rutas SET gps_activo = 0 WHERE id = ?', [info.ruta_id]);
        }
      } catch (err) {
        console.error('Error marcando gps_activo=0:', err.message);
      }
    }
  }
}, 10000);

// ── Error handler global — no filtrar stack traces en producción ──
app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  const isDev  = process.env.NODE_ENV !== 'production';

  if (status >= 500) {
    console.error(`[ERROR ${status}] ${req.method} ${req.originalUrl}:`, err.message);
    if (isDev) console.error(err.stack);
  }

  res.status(status).json({
    error: status >= 500 && !isDev
      ? 'Error interno del servidor'
      : err.message || 'Error interno del servidor',
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor en http://0.0.0.0:${PORT}`);
});
