const db = require('../db');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const BACKUPS_DIR = path.join(__dirname, '..', 'backups');

/* ── Helper: crear backup completo de la BD ── */
async function crearBackup(conn, modo = 'manual') {
  // Asegurar que exista el directorio
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });

  // Obtener todas las tablas base (no views)
  const [tablas] = await conn.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name"
  );

  const data = {};
  let totalRegistros = 0;

  for (const { table_name } of tablas) {
    const [rows] = await conn.query(`SELECT * FROM \`${table_name}\``);
    data[table_name] = rows;
    totalRegistros += rows.length;
  }

  const ahora = new Date();
  const nombre = ahora.toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '_');
  const archivo = `${nombre}.json`;

  const backup = {
    meta: {
      fecha: ahora.toISOString(),
      tablas: tablas.length,
      registros_total: totalRegistros,
      modo,
      creado_antes_de: 'restaurar',
    },
    tablas: data,
  };

  fs.writeFileSync(path.join(BACKUPS_DIR, archivo), JSON.stringify(backup));
  console.log(`💾 Backup creado: ${archivo} (${tablas.length} tablas, ${totalRegistros} registros)`);
  return { archivo, tablas: tablas.length, registros: totalRegistros };
}

/* ── Helper: restaurar desde un archivo de backup ── */
async function cargarBackup(conn, archivo) {
  const ruta = path.join(BACKUPS_DIR, archivo);
  if (!fs.existsSync(ruta)) throw new Error('Archivo de backup no encontrado');

  const contenido = fs.readFileSync(ruta, 'utf-8');
  const backup = JSON.parse(contenido);

  if (!backup.tablas || typeof backup.tablas !== 'object') {
    throw new Error('Formato de backup invalido');
  }

  await conn.query('SET FOREIGN_KEY_CHECKS = 0');

  // Obtener columnas reales de cada tabla para filtrar campos obsoletos
  const colCache = {};
  async function getColumnas(tabla) {
    if (!colCache[tabla]) {
      const [cols] = await conn.query(
        'SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?',
        [tabla]
      );
      colCache[tabla] = new Set(cols.map(c => c.column_name || c.COLUMN_NAME));
    }
    return colCache[tabla];
  }

  // Verificar qué tablas del backup existen en la BD actual
  const [tablasActuales] = await conn.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'"
  );
  const tablasExistentes = new Set(tablasActuales.map(t => t.table_name || t.TABLE_NAME));

  // Truncar solo tablas que existen
  for (const tabla of Object.keys(backup.tablas)) {
    if (tablasExistentes.has(tabla)) {
      await conn.query(`TRUNCATE TABLE \`${tabla}\``);
    }
  }

  // Insertar datos filtrando columnas que ya no existen
  let totalInsertados = 0;
  for (const [tabla, rows] of Object.entries(backup.tablas)) {
    if (!rows.length || !tablasExistentes.has(tabla)) continue;

    const colsReales = await getColumnas(tabla);
    // Filtrar: solo columnas que existen en la tabla actual
    const columnas = Object.keys(rows[0]).filter(c => colsReales.has(c));
    if (!columnas.length) continue;

    const placeholders = columnas.map(() => '?').join(', ');
    const colNames = columnas.map(c => `\`${c}\``).join(', ');

    for (const row of rows) {
      const valores = columnas.map(c => row[c]);
      await conn.query(`INSERT INTO \`${tabla}\` (${colNames}) VALUES (${placeholders})`, valores);
      totalInsertados++;
    }
  }

  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  return { tablas: Object.keys(backup.tablas).length, registros: totalInsertados };
}

/* ── Helper: validar PIN maestro (texto plano en BD) ── */
async function validarPin(pin) {
  const [[row]] = await db.query("SELECT valor FROM configuracion WHERE clave = 'pin_maestro'");
  if (!row?.valor) return false;
  return pin === row.valor;
}

// GET /api/config — devuelve todas las configuraciones como objeto { clave: valor }
exports.getAll = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT clave, valor FROM configuracion');
    const config = {};
    for (const r of rows) config[r.clave] = r.valor;
    // Asegurar que modo_sistema exista (default demo)
    if (!config.modo_sistema) config.modo_sistema = 'demo';
    // Indicar si tiene PIN configurado (sin exponer el hash)
    config.tiene_pin = !!config.pin_maestro;
    delete config.pin_maestro;
    res.json(config);
  } catch (err) {
    console.error('configController.getAll:', err.message);
    res.status(500).json({ error: 'Error al obtener configuración' });
  }
};

// PUT /api/config — recibe { claves: { clave: valor, ... } }
exports.save = async (req, res) => {
  try {
    const { claves } = req.body;
    if (!claves || typeof claves !== 'object') {
      return res.status(400).json({ error: 'Se requiere un objeto "claves"' });
    }
    for (const [clave, valor] of Object.entries(claves)) {
      await db.query(
        'INSERT INTO configuracion (clave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor), actualizado_en = NOW()',
        [clave, valor ?? '']
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('configController.save:', err.message);
    res.status(500).json({ error: 'Error al guardar configuración' });
  }
};

// POST /api/config/dni — consulta DNI en API externa
exports.consultarDni = async (req, res) => {
  try {
    const { dni } = req.body;
    if (!dni || !/^\d{8}$/.test(dni)) {
      return res.status(400).json({ error: 'DNI debe tener 8 dígitos' });
    }

    const [rows] = await db.query(
      "SELECT clave, valor FROM configuracion WHERE clave IN ('api_dni_url', 'api_dni_token')"
    );
    const cfg = {};
    for (const r of rows) cfg[r.clave] = r.valor;

    if (!cfg.api_dni_url || !cfg.api_dni_token) {
      return res.status(400).json({ error: 'API DNI no configurada' });
    }

    const response = await fetch(cfg.api_dni_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${cfg.api_dni_token}`,
      },
      body: JSON.stringify({ dni }),
    });

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch {
      return res.status(502).json({ error: 'La API externa no devolvió JSON válido' });
    }

    if (!response.ok || !data.success) {
      return res.status(400).json({ error: data.message || 'Error al consultar DNI' });
    }

    res.json({ success: true, data: data.data });
  } catch (err) {
    console.error('configController.consultarDni:', err.message);
    res.status(500).json({ error: 'Error al consultar DNI' });
  }
};

// PUT /api/config/modo-sistema — cambiar entre demo y produccion
exports.cambiarModo = async (req, res) => {
  try {
    if (req.user.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo el administrador puede cambiar el modo del sistema' });
    }

    const { modo, pin, confirmacion } = req.body;
    if (!['demo', 'produccion'].includes(modo)) {
      return res.status(400).json({ error: 'Modo invalido. Use: demo o produccion' });
    }

    // Validar PIN maestro contra hash en BD
    if (!pin || !(await validarPin(pin))) {
      return res.status(403).json({ error: 'PIN maestro incorrecto' });
    }

    // Validar texto de confirmacion
    if (modo === 'produccion' && confirmacion !== 'PRODUCCION') {
      return res.status(400).json({ error: 'Debe escribir PRODUCCION para confirmar' });
    }
    if (modo === 'demo' && confirmacion !== 'VOLVER A DEMO') {
      return res.status(400).json({ error: 'Debe escribir VOLVER A DEMO para confirmar' });
    }

    await db.query(
      'INSERT INTO configuracion (clave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor), actualizado_en = NOW()',
      ['modo_sistema', modo]
    );

    const logAudit = require('../helpers/audit');
    logAudit(req, {
      modulo: 'config',
      accion: 'editar',
      tabla: 'configuracion',
      registro_id: null,
      detalle: { cambio: `modo_sistema → ${modo}` },
    });

    console.log(`⚙️  Modo del sistema cambiado a: ${modo.toUpperCase()}`);
    res.json({ ok: true, modo, mensaje: `Sistema cambiado a modo ${modo}` });
  } catch (err) {
    console.error('cambiarModo error:', err.message);
    res.status(500).json({ error: 'Error al cambiar modo' });
  }
};

// POST /api/config/restaurar-bd — restaurar BD a estado demo/inicial
exports.restaurarBd = async (req, res) => {
  const conn = await db.getConnection();
  try {
    if (req.user.rol !== 'admin') {
      conn.release();
      return res.status(403).json({ error: 'Solo el administrador puede restaurar la base de datos' });
    }

    const [[modoCfg]] = await conn.query("SELECT valor FROM configuracion WHERE clave = 'modo_sistema'");
    if ((modoCfg?.valor || 'demo') === 'produccion') {
      conn.release();
      return res.status(403).json({ error: 'No se puede restaurar en modo PRODUCCION. Cambie a modo DEMO primero.' });
    }

    const { confirmacion } = req.body;
    if (confirmacion !== 'RESTAURAR') {
      conn.release();
      return res.status(400).json({ error: 'Debe enviar confirmacion: "RESTAURAR"' });
    }

    // ── Backup automático antes de restaurar ──
    try {
      const infoBackup = await crearBackup(conn, 'auto_pre_restaurar');
      console.log(`Backup creado: ${infoBackup.archivo}`);
    } catch (e) {
      console.error('Backup pre-restaurar falló:', e.message);
    }

    // ── Obtener TODAS las tablas base que existen (excepto configuracion) ──
    const [allTables] = await conn.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'"
    );
    const tablaNames = allTables.map(t => t.table_name || t.TABLE_NAME);

    // Tablas que NO se tocan (configuración del sistema)
    const preservar = new Set(['configuracion', 'metodos_pago_config', 'categorias_caja', 'condiciones_pago']);

    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

    // ── 1. Vaciar todas las tablas excepto las preservadas ──
    for (const tabla of tablaNames) {
      if (preservar.has(tabla)) continue;
      try {
        await conn.query(`DELETE FROM \`${tabla}\``);
        await conn.query(`ALTER TABLE \`${tabla}\` AUTO_INCREMENT = 1`);
      } catch (e) {
        console.log(`  skip ${tabla}: ${e.message}`);
      }
    }

    // ── 2. Seed: Admin (reset password + sesion) ──
    const hashAdmin = await bcrypt.hash('Admin1234!', 10);
    await conn.query(
      `INSERT INTO usuarios (id, nombre, email, password_hash, rol, activo)
       VALUES (1, 'Administrador', 'admin@aquacontrol.pe', ?, 'admin', 1)
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), ultimo_login = NULL, sesion_token = NULL`,
      [hashAdmin]
    );

    // ── 3. Seed: Chofer de prueba ──
    const hashChofer = await bcrypt.hash('Chofer123!', 10);
    await conn.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, activo, creado_por)
       VALUES ('Chofer Demo', 'chofer@aquacontrol.pe', ?, 'chofer', 1, 1)`,
      [hashChofer]
    );
    const [[chofer]] = await conn.query("SELECT id FROM usuarios WHERE email = 'chofer@aquacontrol.pe'");

    // ── 4. Seed: Presentaciones (stocks en cero) ──
    await conn.query(
      `INSERT INTO presentaciones (nombre, descripcion, es_retornable, precio_base, tipo, unidad, modo_stock,
         stock_llenos, stock_vacios, stock_en_lavado) VALUES
        ('Bidon 20L',       'Bidon de agua purificada 20 litros', 1, 8.00, 'agua',  'bidon', 'lotes', 0, 0, 0),
        ('Bolsa Hielo 3kg', 'Bolsa de hielo 3 kilogramos',        0, 2.00, 'hielo', 'bolsa', 'simple', 0, 0, 0),
        ('Bolsa Hielo 5kg', 'Bolsa de hielo 5 kilogramos',        0, 3.00, 'hielo', 'bolsa', 'simple', 0, 0, 0)`
    );

    // ── 4b. Seed: Insumos ──
    await conn.query(
      `INSERT INTO insumos (nombre, unidad, stock_actual, stock_minimo, precio_unitario, activo, es_retornable, requiere_lavado)
       VALUES ('BOLSA PARA HIELO 3KG', 'unidad', 0, 100, 0.30, 1, 0, 0)`
    );

    // ── 4c. Seed: Recetas de producción ──
    await conn.query(
      `INSERT INTO recetas_produccion (presentacion_id, insumo_id, cantidad, es_opcional)
       VALUES (2, 1, 1.0000, 0)`
    );

    // ── 5. Seed: Cliente General ──
    await conn.query(
      `INSERT INTO clientes (nombre, tipo, activo, creado_por) VALUES ('Cliente General', 'menudeo', 1, 1)`
    );

    // ── 6. Seed: Proveedor General ──
    await conn.query(
      `INSERT INTO proveedores (nombre, activo, creado_por) VALUES ('Proveedor General', 1, 1)`
    );

    // ── 7. Seed: Vehiculo de prueba ──
    await conn.query(
      `INSERT INTO vehiculos (placa, marca, modelo, activo, repartidor_id)
       VALUES ('ABC-123', 'Toyota', 'Hilux', 1, ?)`,
      [chofer?.id || null]
    );

    // ── 8. Seed: Categorías de caja (si están vacías) ──
    const [[catCount]] = await conn.query('SELECT COUNT(*) AS n FROM categorias_caja');
    if (!catCount?.n) {
      await conn.query(
        `INSERT INTO categorias_caja (nombre, tipo, es_sistema) VALUES
          ('Venta',          'ingreso', 1),
          ('Cobro deuda',    'ingreso', 1),
          ('Otro ingreso',   'ingreso', 1),
          ('Gasto operativo','egreso',  1),
          ('Pago proveedor', 'egreso',  1),
          ('Devolución',     'egreso',  1),
          ('Otro egreso',    'egreso',  1),
          ('Saldo inicial',  'ingreso', 1),
          ('Combustible',    'egreso',  1),
          ('Alimentación',   'egreso',  1)`
      );
    }

    // ── 9. Seed: Condiciones de pago (si están vacías) ──
    const [[condCount]] = await conn.query('SELECT COUNT(*) AS n FROM condiciones_pago');
    if (!condCount?.n) {
      await conn.query(
        `INSERT INTO condiciones_pago (nombre, descripcion, tipo, num_cuotas, dias_entre_cuotas, es_sistema, activo, orden) VALUES
          ('Contado',          'Pago inmediato',          'contado',  1, 0,  1, 1, 0),
          ('Crédito 15 días',  'Pago a 15 días',          'credito',  1, 15, 1, 1, 1),
          ('Crédito 30 días',  'Pago a 30 días',          'credito',  1, 30, 1, 1, 2),
          ('2 cuotas',         '2 cuotas cada 30 días',   'credito',  2, 30, 1, 1, 3),
          ('3 cuotas',         '3 cuotas cada 30 días',   'credito',  3, 30, 1, 1, 4)`
      );
    }

    // ── 10. Seed: Módulos del chofer demo ──
    if (chofer?.id) {
      await conn.query(
        `INSERT INTO usuario_modulos (usuario_id, modulo, nivel_acceso) VALUES
          (?, 'repartidor_dashboard', 'total'),
          (?, 'mi_vehiculo',          'total'),
          (?, 'mi_caja',              'total'),
          (?, 'mis_pedidos',          'total'),
          (?, 'venta_al_paso',        'total'),
          (?, 'cobro_deuda',          'total')`,
        [chofer.id, chofer.id, chofer.id, chofer.id, chofer.id, chofer.id]
      );
    }

    // ── 11. Asegurar modo demo ──
    await conn.query(
      "INSERT INTO configuracion (clave, valor) VALUES ('modo_sistema', 'demo') ON DUPLICATE KEY UPDATE valor = VALUES(valor), actualizado_en = NOW()"
    );

    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    conn.release();

    console.log('Base de datos restaurada a estado demo');
    res.json({
      ok: true,
      mensaje: 'Base de datos restaurada exitosamente. Todos los datos operativos fueron eliminados.',
      conservado: {
        configuracion: 'Todas las claves de configuracion',
        metodos_pago: 'Todos los metodos de pago configurados',
        categorias_caja: 'Categorias de movimientos de caja',
        condiciones_pago: 'Condiciones de pago configuradas',
      },
      seed: {
        usuarios: ['admin@aquacontrol.pe (Admin1234!)', 'chofer@aquacontrol.pe (Chofer123!)'],
        presentaciones: ['Bidon 20L', 'Bolsa Hielo 3kg', 'Bolsa Hielo 5kg'],
        insumos: ['BOLSA PARA HIELO 3KG'],
        recetas: ['Bolsa Hielo 3kg ← 1x BOLSA PARA HIELO 3KG'],
        clientes: ['Cliente General'],
        proveedores: ['Proveedor General'],
        vehiculos: ['ABC-123 Toyota Hilux'],
      },
    });
  } catch (err) {
    await conn.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
    conn.release();
    console.error('restaurarBd error:', err.message);
    res.status(500).json({ error: 'Error al restaurar: ' + err.message });
  }
};

// POST /api/config/backups — crear backup manual
exports.crearBackupManual = async (req, res) => {
  const conn = await db.getConnection();
  try {
    if (req.user.rol !== 'admin') {
      conn.release();
      return res.status(403).json({ error: 'Solo el administrador puede crear backups' });
    }
    const info = await crearBackup(conn, 'manual');
    conn.release();
    res.json({ ok: true, mensaje: 'Copia de seguridad creada', ...info });
  } catch (err) {
    conn.release();
    console.error('crearBackupManual error:', err.message);
    res.status(500).json({ error: 'Error al crear backup: ' + err.message });
  }
};

// GET /api/config/backups — listar backups disponibles
exports.listarBackups = async (req, res) => {
  try {
    if (req.user.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo el administrador puede ver backups' });
    }

    if (!fs.existsSync(BACKUPS_DIR)) {
      return res.json([]);
    }

    const archivos = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse();

    const lista = archivos.map(archivo => {
      const ruta = path.join(BACKUPS_DIR, archivo);
      const stat = fs.statSync(ruta);
      let meta = {};
      try {
        const contenido = fs.readFileSync(ruta, 'utf-8');
        const parsed = JSON.parse(contenido);
        meta = parsed.meta || {};
      } catch { /* ignorar errores de lectura */ }

      return {
        nombre: archivo,
        fecha: meta.fecha || stat.mtime.toISOString(),
        tablas: meta.tablas || 0,
        registros: meta.registros_total || 0,
        modo: meta.modo || 'desconocido',
        peso: stat.size,
      };
    });

    res.json(lista);
  } catch (err) {
    console.error('listarBackups error:', err.message);
    res.status(500).json({ error: 'Error al listar backups' });
  }
};

// POST /api/config/backups/:nombre/restaurar — restaurar desde un backup
exports.restaurarBackup = async (req, res) => {
  const conn = await db.getConnection();
  try {
    if (req.user.rol !== 'admin') {
      conn.release();
      return res.status(403).json({ error: 'Solo el administrador puede restaurar backups' });
    }

    // Verificar modo demo
    const [[modoCfg]] = await conn.query("SELECT valor FROM configuracion WHERE clave = 'modo_sistema'");
    if ((modoCfg?.valor || 'demo') === 'produccion') {
      conn.release();
      return res.status(403).json({ error: 'No se puede restaurar en modo PRODUCCION' });
    }

    const { confirmacion } = req.body;
    if (confirmacion !== 'RESTAURAR') {
      conn.release();
      return res.status(400).json({ error: 'Debe enviar confirmacion: "RESTAURAR"' });
    }

    const { nombre } = req.params;
    if (!nombre || !nombre.endsWith('.json')) {
      conn.release();
      return res.status(400).json({ error: 'Nombre de backup invalido' });
    }

    await conn.beginTransaction();
    const result = await cargarBackup(conn, nombre);
    await conn.commit();
    conn.release();

    console.log(`🔄 BD restaurada desde backup: ${nombre}`);
    res.json({
      ok: true,
      mensaje: `Base de datos restaurada desde ${nombre}`,
      tablas: result.tablas,
      registros: result.registros,
    });
  } catch (err) {
    await conn.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
    await conn.rollback().catch(() => {});
    conn.release();
    console.error('restaurarBackup error:', err.message);
    res.status(500).json({ error: 'Error al restaurar backup: ' + err.message });
  }
};

// POST /api/config/ruc — consulta RUC en API externa
exports.consultarRuc = async (req, res) => {
  try {
    const { ruc } = req.body;
    if (!ruc || !/^\d{11}$/.test(ruc)) {
      return res.status(400).json({ error: 'RUC debe tener 11 dígitos' });
    }

    const [rows] = await db.query(
      "SELECT clave, valor FROM configuracion WHERE clave IN ('api_ruc_url', 'api_ruc_token')"
    );
    const cfg = {};
    for (const r of rows) cfg[r.clave] = r.valor;

    if (!cfg.api_ruc_url || !cfg.api_ruc_token) {
      return res.status(400).json({ error: 'API RUC no configurada' });
    }

    const response = await fetch(cfg.api_ruc_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${cfg.api_ruc_token}`,
      },
      body: JSON.stringify({ ruc }),
    });

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch {
      return res.status(502).json({ error: 'La API externa no devolvió JSON válido' });
    }

    if (!response.ok || !data.success) {
      return res.status(400).json({ error: data.message || 'Error al consultar RUC' });
    }

    res.json({ success: true, data: data.data });
  } catch (err) {
    console.error('configController.consultarRuc:', err.message);
    res.status(500).json({ error: 'Error al consultar RUC' });
  }
};
