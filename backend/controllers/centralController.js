// controllers/centralController.js — Gestión de tenants desde dominio principal
const bcrypt = require('bcryptjs');
const { getCentralPool, clearTenantCache } = require('../middleware/tenantMiddleware');
const { getPool, removePool } = require('../poolManager');

// ── Listar tenants ──
exports.list = async (req, res) => {
  try {
    const central = getCentralPool();
    const [tenants] = await central.query(
      `SELECT t.*,
              (SELECT COUNT(*) FROM tenant_modulos tm WHERE tm.tenant_id = t.id) AS total_modulos
         FROM tenants t ORDER BY t.creado_en DESC`
    );
    res.json(tenants);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Detalle de un tenant ──
exports.get = async (req, res) => {
  try {
    const central = getCentralPool();
    const [[tenant]] = await central.query('SELECT * FROM tenants WHERE id = ?', [req.params.id]);
    if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });

    const [modulos] = await central.query(
      'SELECT modulo FROM tenant_modulos WHERE tenant_id = ?', [tenant.id]
    );
    tenant.modulos = modulos.map(r => r.modulo);

    // Contar usuarios en la BD del tenant
    try {
      const tenantPool = getPool(tenant.database_name);
      const [[{ total }]] = await tenantPool.query('SELECT COUNT(*) AS total FROM usuarios WHERE activo = 1');
      tenant.usuarios_activos = total;
    } catch {
      tenant.usuarios_activos = 0;
    }

    res.json(tenant);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Crear tenant (empresa nueva) ──
exports.create = async (req, res) => {
  const { nombre_empresa, subdominio, plan, max_usuarios, modulos, admin } = req.body;

  if (!nombre_empresa || !subdominio) {
    return res.status(400).json({ error: 'nombre_empresa y subdominio son requeridos' });
  }
  if (!admin?.nombre || !admin?.email || !admin?.password) {
    return res.status(400).json({ error: 'Datos del admin son requeridos (nombre, email, password)' });
  }

  // Validar subdominio (solo letras, números, guiones)
  if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/i.test(subdominio)) {
    return res.status(400).json({ error: 'Subdominio inválido (3-50 chars, solo letras/números/guiones)' });
  }
  const reserved = ['www', 'api', 'admin', 'default', 'central', 'app', 'mail', 'ftp'];
  if (reserved.includes(subdominio.toLowerCase())) {
    return res.status(400).json({ error: 'Subdominio reservado' });
  }

  const dbName = `aquacontrol_${subdominio.toLowerCase().replace(/-/g, '_')}`;
  const central = getCentralPool();

  try {
    // Verificar duplicado
    const [[exists]] = await central.query(
      'SELECT id FROM tenants WHERE subdominio = ? OR database_name = ?',
      [subdominio.toLowerCase(), dbName]
    );
    if (exists) return res.status(409).json({ error: 'Subdominio ya existe' });

    // 1. Insertar tenant en central
    const [result] = await central.query(
      `INSERT INTO tenants (nombre_empresa, subdominio, database_name, plan, max_usuarios)
       VALUES (?, ?, ?, ?, ?)`,
      [nombre_empresa, subdominio.toLowerCase(), dbName, plan || 'basico', max_usuarios || 5]
    );
    const tenantId = result.insertId;

    // 2. Insertar módulos
    const modulosList = modulos || [
      'dashboard', 'clientes', 'ventas', 'pedidos', 'caja',
      'presentaciones', 'produccion', 'insumos', 'usuarios'
    ];
    for (const mod of modulosList) {
      await central.query(
        'INSERT INTO tenant_modulos (tenant_id, modulo) VALUES (?, ?)',
        [tenantId, mod]
      );
    }

    // 3. Crear BD clonando estructura desde template (usando mysql2, no shell)
    const mysql = require('mysql2/promise');
    const cloneConn = await mysql.createConnection({
      host: process.env.DB_HOST, port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    });

    await cloneConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    await cloneConn.query('SET FOREIGN_KEY_CHECKS = 0');

    // Determinar BD fuente (template si existe, sino principal)
    let sourceDb = process.env.DB_NAME;
    try {
      const [[tmpl]] = await cloneConn.query(
        `SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = 'aquacontrol_template'`
      );
      if (tmpl) sourceDb = 'aquacontrol_template';
    } catch { /* usar fallback */ }

    // Clonar tablas
    const [tables] = await cloneConn.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
      [sourceDb]
    );
    for (const { TABLE_NAME } of tables) {
      try {
        const [[row]] = await cloneConn.query(`SHOW CREATE TABLE \`${sourceDb}\`.\`${TABLE_NAME}\``);
        let createSql = row['Create Table'];
        createSql = createSql.replace(/CREATE TABLE `/, `CREATE TABLE IF NOT EXISTS \`${dbName}\`.\``);
        await cloneConn.query(createSql);
      } catch (err) {
        console.error(`Clone table ${TABLE_NAME}:`, err.message);
      }
    }

    // Clonar triggers
    const [triggers] = await cloneConn.query(
      `SELECT TRIGGER_NAME, EVENT_MANIPULATION, EVENT_OBJECT_TABLE, ACTION_STATEMENT, ACTION_TIMING
       FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ?`,
      [sourceDb]
    );
    for (const trg of triggers) {
      try {
        await cloneConn.query(`DROP TRIGGER IF EXISTS \`${dbName}\`.\`${trg.TRIGGER_NAME}\``);
        await cloneConn.query(
          `CREATE TRIGGER \`${dbName}\`.\`${trg.TRIGGER_NAME}\`
           ${trg.ACTION_TIMING} ${trg.EVENT_MANIPULATION} ON \`${dbName}\`.\`${trg.EVENT_OBJECT_TABLE}\`
           FOR EACH ROW ${trg.ACTION_STATEMENT}`
        );
      } catch (err) {
        console.error(`Clone trigger ${trg.TRIGGER_NAME}:`, err.message);
      }
    }

    // Clonar procedures
    const [procs] = await cloneConn.query(
      `SELECT ROUTINE_NAME, ROUTINE_TYPE FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ?`,
      [sourceDb]
    );
    for (const proc of procs) {
      try {
        const [[show]] = await cloneConn.query(`SHOW CREATE ${proc.ROUTINE_TYPE} \`${sourceDb}\`.\`${proc.ROUTINE_NAME}\``);
        const key = proc.ROUTINE_TYPE === 'PROCEDURE' ? 'Create Procedure' : 'Create Function';
        let createSql = show[key];
        if (createSql) {
          await cloneConn.query(`DROP ${proc.ROUTINE_TYPE} IF EXISTS \`${dbName}\`.\`${proc.ROUTINE_NAME}\``);
          createSql = createSql.replace(/DEFINER=`[^`]+`@`[^`]+`\s*/g, '');
          await cloneConn.query(`USE \`${dbName}\``);
          await cloneConn.query(createSql);
        }
      } catch (err) {
        console.error(`Clone ${proc.ROUTINE_TYPE} ${proc.ROUTINE_NAME}:`, err.message);
      }
    }

    await cloneConn.query('SET FOREIGN_KEY_CHECKS = 1');
    await cloneConn.end();

    // 4. Crear usuario admin en la nueva BD
    const newPool = getPool(dbName);
    const hash = await bcrypt.hash(admin.password, 10);
    const [adminResult] = await newPool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
       VALUES (?, ?, ?, 'admin', 1)`,
      [admin.nombre, admin.email, hash]
    );

    // Asignar todos los módulos al admin
    for (const mod of modulosList) {
      await newPool.query(
        'INSERT INTO usuario_modulos (usuario_id, modulo) VALUES (?, ?)',
        [adminResult.insertId, mod]
      );
    }

    // Seed configuración básica
    try {
      await newPool.query(`INSERT IGNORE INTO configuracion (clave, valor) VALUES
        ('vender_sin_stock', '1'), ('entregar_sin_stock', '1'), ('modo_sistema', 'produccion'),
        ('pin_maestro', '2024')`);
    } catch { /* tabla puede no existir si dump falló parcialmente */ }

    // Seed métodos de pago esenciales
    try {
      await newPool.query(`INSERT IGNORE INTO metodos_pago_config
        (nombre, etiqueta, tipo, color, activo, arrastra_saldo, orden, es_sistema) VALUES
        ('efectivo',      'Efectivo',            'fisico',  'emerald', 1, 1, 1, 1),
        ('yape',          'Yape',                'digital', 'purple',  1, 1, 2, 0),
        ('plin',          'Plin',                'digital', 'cyan',    0, 0, 3, 0),
        ('transferencia', 'Transferencia',       'digital', 'blue',    0, 0, 4, 0),
        ('credito',       'Crédito (fiado)',     'credito', 'red',     1, 0, 99, 1)`);
    } catch { /* tabla puede no existir */ }

    // Seed categorías de caja
    try {
      await newPool.query(`INSERT IGNORE INTO categorias_caja (nombre, tipo, es_sistema) VALUES
        ('Venta',          'ingreso', 1), ('Cobro deuda',    'ingreso', 1),
        ('Otro ingreso',   'ingreso', 1), ('Gasto operativo','egreso',  1),
        ('Pago proveedor', 'egreso',  1), ('Devolución',     'egreso',  1),
        ('Otro egreso',    'egreso',  1), ('Saldo inicial',  'ingreso', 1),
        ('Combustible',    'egreso',  1), ('Alimentación',   'egreso',  1)`);
    } catch { /* tabla puede no existir */ }

    // Seed condiciones de pago
    try {
      await newPool.query(`INSERT IGNORE INTO condiciones_pago (nombre, descripcion, tipo, num_cuotas, dias_entre_cuotas, es_sistema, activo, orden) VALUES
        ('Contado',          'Pago inmediato',        'contado',  1, 0,  1, 1, 0),
        ('Crédito 15 días',  'Pago a 15 días',        'credito',  1, 15, 1, 1, 1),
        ('Crédito 30 días',  'Pago a 30 días',        'credito',  1, 30, 1, 1, 2),
        ('2 cuotas',         '2 cuotas cada 30 días', 'credito',  2, 30, 1, 1, 3),
        ('3 cuotas',         '3 cuotas cada 30 días', 'credito',  3, 30, 1, 1, 4)`);
    } catch { /* tabla puede no existir */ }

    res.status(201).json({
      id: tenantId,
      nombre_empresa,
      subdominio: subdominio.toLowerCase(),
      database_name: dbName,
      admin_email: admin.email,
      modulos: modulosList,
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Subdominio ya existe' });
    }
    console.error('centralController.create:', err);
    res.status(500).json({ error: err.message });
  }
};

// ── Actualizar tenant ──
exports.update = async (req, res) => {
  const { nombre_empresa, plan, max_usuarios } = req.body;
  try {
    const central = getCentralPool();
    await central.query(
      `UPDATE tenants SET nombre_empresa = COALESCE(?, nombre_empresa),
              plan = COALESCE(?, plan), max_usuarios = COALESCE(?, max_usuarios)
       WHERE id = ?`,
      [nombre_empresa, plan, max_usuarios, req.params.id]
    );
    clearTenantCache();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Activar/Desactivar tenant ──
exports.toggle = async (req, res) => {
  try {
    const central = getCentralPool();
    const [[tenant]] = await central.query('SELECT id, activo, subdominio, database_name FROM tenants WHERE id = ?', [req.params.id]);
    if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });

    const nuevoEstado = tenant.activo ? 0 : 1;
    await central.query('UPDATE tenants SET activo = ? WHERE id = ?', [nuevoEstado, tenant.id]);

    // Si se desactiva, cerrar pool para liberar conexiones
    if (!nuevoEstado) {
      removePool(tenant.database_name);
    }

    clearTenantCache(tenant.subdominio);
    res.json({ ok: true, activo: nuevoEstado });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Módulos del tenant ──
exports.getModulos = async (req, res) => {
  try {
    const central = getCentralPool();
    const [rows] = await central.query(
      'SELECT modulo FROM tenant_modulos WHERE tenant_id = ?', [req.params.id]
    );
    res.json(rows.map(r => r.modulo));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.setModulos = async (req, res) => {
  const { modulos } = req.body;
  if (!Array.isArray(modulos)) {
    return res.status(400).json({ error: 'modulos debe ser un array' });
  }
  try {
    const central = getCentralPool();
    const [[tenant]] = await central.query('SELECT subdominio FROM tenants WHERE id = ?', [req.params.id]);
    if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });

    await central.query('DELETE FROM tenant_modulos WHERE tenant_id = ?', [req.params.id]);
    for (const mod of modulos) {
      await central.query(
        'INSERT INTO tenant_modulos (tenant_id, modulo) VALUES (?, ?)',
        [req.params.id, mod]
      );
    }

    clearTenantCache(tenant.subdominio);
    res.json({ ok: true, modulos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Crear admin en un tenant ──
exports.createAdmin = async (req, res) => {
  const { nombre, email, password } = req.body;
  if (!nombre || !email || !password) {
    return res.status(400).json({ error: 'nombre, email y password son requeridos' });
  }

  try {
    const central = getCentralPool();
    const [[tenant]] = await central.query(
      'SELECT database_name, max_usuarios FROM tenants WHERE id = ?', [req.params.id]
    );
    if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });

    const tenantPool = getPool(tenant.database_name);

    // Verificar límite de usuarios
    const [[{ total }]] = await tenantPool.query(
      'SELECT COUNT(*) AS total FROM usuarios WHERE activo = 1'
    );
    if (total >= tenant.max_usuarios) {
      return res.status(400).json({
        error: `Límite de usuarios alcanzado (${tenant.max_usuarios}). Actualice el plan.`,
      });
    }

    const hash = await bcrypt.hash(password, 10);
    const [result] = await tenantPool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
       VALUES (?, ?, ?, 'admin', 1)`,
      [nombre, email, hash]
    );

    // Asignar módulos del tenant al nuevo admin
    const [mods] = await central.query(
      'SELECT modulo FROM tenant_modulos WHERE tenant_id = ?', [req.params.id]
    );
    for (const m of mods) {
      await tenantPool.query(
        'INSERT INTO usuario_modulos (usuario_id, modulo) VALUES (?, ?)',
        [result.insertId, m.modulo]
      );
    }

    res.status(201).json({ id: result.insertId, nombre, email, rol: 'admin' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe un usuario con ese email' });
    }
    res.status(500).json({ error: err.message });
  }
};

// ── Listar usuarios de un tenant ──
exports.listUsers = async (req, res) => {
  try {
    const central = getCentralPool();
    const [[tenant]] = await central.query(
      'SELECT database_name FROM tenants WHERE id = ?', [req.params.id]
    );
    if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });

    const tenantPool = getPool(tenant.database_name);
    const [users] = await tenantPool.query(
      `SELECT id, nombre, email, rol, activo, ultimo_login, creado_en
         FROM usuarios ORDER BY creado_en DESC`
    );
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Suspender tenant en tiempo real ──
exports.suspendRealtime = async (req, res) => {
  try {
    const { mensaje_suspension } = req.body;
    const central = getCentralPool();
    const [[tenant]] = await central.query('SELECT id, subdominio, database_name FROM tenants WHERE id = ?', [req.params.id]);
    if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });

    await central.query(
      'UPDATE tenants SET activo = 0, mensaje_suspension = ? WHERE id = ?',
      [mensaje_suspension || 'Cuenta suspendida. Contacte al administrador.', tenant.id]
    );
    removePool(tenant.database_name);
    clearTenantCache(tenant.subdominio);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Reset rate limiter ──
exports.resetRateLimit = async (req, res) => {
  try {
    // Si hay rate limiter store, limpiarlo
    if (global.loginLimiter?.resetAll) {
      global.loginLimiter.resetAll();
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Stats del panel central ──
exports.stats = async (req, res) => {
  try {
    const central = getCentralPool();
    const [[totals]] = await central.query(
      `SELECT COUNT(*) AS total,
              SUM(activo = 1) AS activas,
              SUM(activo = 0) AS suspendidas
         FROM tenants`
    );

    // Contar usuarios activos en cada tenant
    const [tenants] = await central.query('SELECT database_name FROM tenants WHERE activo = 1');
    let totalUsuarios = 0;
    for (const t of tenants) {
      try {
        const pool = getPool(t.database_name);
        const [[{ cnt }]] = await pool.query('SELECT COUNT(*) AS cnt FROM usuarios WHERE activo = 1');
        totalUsuarios += cnt;
      } catch { /* BD puede no existir */ }
    }

    res.json({
      total_empresas: totals.total || 0,
      activas: totals.activas || 0,
      suspendidas: totals.suspendidas || 0,
      total_usuarios: totalUsuarios,
      servidor: {
        uptime: process.uptime(),
        version: require('../package.json').version || '1.0.0',
        node: process.version,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        hora: new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' }),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Lista de módulos disponibles en el sistema ──
exports.availableModulos = (req, res) => {
  res.json([
    'dashboard', 'clientes', 'ventas', 'pedidos', 'caja',
    'presentaciones', 'produccion', 'insumos', 'compras',
    'proveedores', 'recetas', 'lavados', 'devoluciones', 'deudas',
    'usuarios', 'vehiculos', 'rutas', 'reparto', 'repartidor',
    'reportes', 'metas', 'mantenimientos', 'calidad', 'auditoria',
    'facturacion', 'configuracion',
  ]);
};
