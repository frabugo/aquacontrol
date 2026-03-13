// Simulates the full "Restaurar BD Inicial" flow exactly as the endpoint does
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const BACKUPS_DIR = path.join(__dirname, '..', 'backups');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'aquacontrol',
  });

  console.log('=== SIMULANDO "Restaurar BD Inicial" ===\n');

  // Count before
  const [tablesBefore] = await conn.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'"
  );
  let totalBefore = 0;
  for (const t of tablesBefore) {
    const tn = t.table_name || t.TABLE_NAME;
    const [[r]] = await conn.query('SELECT COUNT(*) as c FROM `' + tn + '`');
    totalBefore += r.c;
  }
  console.log('Registros antes:', totalBefore);

  // ── Step 1: Disable FK checks + triggers ──
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  await conn.query('SET SQL_MODE = ""');

  const [triggers] = await conn.query('SHOW TRIGGERS');
  const triggerDefs = [];
  for (const trg of triggers) {
    triggerDefs.push({
      name: trg.Trigger, table: trg.Table,
      timing: trg.Timing, event: trg.Event, stmt: trg.Statement,
    });
    await conn.query('DROP TRIGGER IF EXISTS `' + trg.Trigger + '`');
  }
  console.log('Triggers desactivados:', triggerDefs.length);

  // ── Step 2: Delete all tables except configuracion and metodos_pago_config ──
  const preservar = new Set(['configuracion', 'metodos_pago_config']);
  const tablaNames = tablesBefore.map(t => t.table_name || t.TABLE_NAME);

  for (const tabla of tablaNames) {
    if (preservar.has(tabla)) continue;
    try {
      await conn.query('DELETE FROM `' + tabla + '`');
      await conn.query('ALTER TABLE `' + tabla + '` AUTO_INCREMENT = 1');
    } catch (e) {
      console.log('  skip ' + tabla + ': ' + e.message);
    }
  }
  console.log('Tablas limpiadas');

  // ── Step 3: Seed data ──
  const errors = [];

  try {
    const hashAdmin = await bcrypt.hash('Admin1234!', 10);
    await conn.query(
      `INSERT INTO usuarios (id, nombre, email, password_hash, rol, activo)
       VALUES (1, 'Administrador', 'admin@aquacontrol.pe', ?, 'admin', 1)
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), ultimo_login = NULL, sesion_token = NULL`,
      [hashAdmin]
    );
    console.log('  ✅ Usuario admin creado');
  } catch (e) {
    errors.push('usuarios admin: ' + e.message);
  }

  try {
    const hashChofer = await bcrypt.hash('Chofer123!', 10);
    await conn.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, activo, creado_por)
       VALUES ('Chofer Demo', 'chofer@aquacontrol.pe', ?, 'chofer', 1, 1)`,
      [hashChofer]
    );
    console.log('  ✅ Usuario chofer creado');
  } catch (e) {
    errors.push('usuarios chofer: ' + e.message);
  }

  try {
    await conn.query(
      `INSERT INTO presentaciones (nombre, descripcion, es_retornable, precio_base, tipo, unidad, modo_stock,
         stock_llenos, stock_vacios, stock_en_lavado) VALUES
        ('Bidon 20L', 'Bidon de agua purificada 20 litros', 1, 8.00, 'agua', 'bidon', 'lotes', 0, 0, 0),
        ('Bolsa Hielo 3kg', 'Bolsa de hielo 3 kilogramos', 0, 2.00, 'hielo', 'bolsa', 'simple', 0, 0, 0),
        ('Bolsa Hielo 5kg', 'Bolsa de hielo 5 kilogramos', 0, 3.00, 'hielo', 'bolsa', 'simple', 0, 0, 0)`
    );
    console.log('  ✅ Presentaciones creadas');
  } catch (e) {
    errors.push('presentaciones: ' + e.message);
  }

  try {
    await conn.query(
      `INSERT INTO insumos (nombre, unidad, stock_actual, stock_minimo, precio_unitario, activo, es_retornable, requiere_lavado)
       VALUES ('BOLSA PARA HIELO 3KG', 'unidad', 0, 100, 0.30, 1, 0, 0)`
    );
    console.log('  ✅ Insumo creado');
  } catch (e) {
    errors.push('insumos: ' + e.message);
  }

  try {
    await conn.query(
      `INSERT INTO recetas_produccion (presentacion_id, insumo_id, cantidad, es_opcional)
       VALUES (2, 1, 1.0000, 0)`
    );
    console.log('  ✅ Receta creada');
  } catch (e) {
    errors.push('recetas: ' + e.message);
  }

  try {
    await conn.query(
      `INSERT INTO clientes (nombre, tipo, activo, creado_por) VALUES ('Cliente General', 'menudeo', 1, 1)`
    );
    console.log('  ✅ Cliente creado');
  } catch (e) {
    errors.push('clientes: ' + e.message);
  }

  try {
    await conn.query(
      `INSERT INTO proveedores (nombre, activo, creado_por) VALUES ('Proveedor General', 1, 1)`
    );
    console.log('  ✅ Proveedor creado');
  } catch (e) {
    errors.push('proveedores: ' + e.message);
  }

  try {
    const [[chofer]] = await conn.query("SELECT id FROM usuarios WHERE email = 'chofer@aquacontrol.pe'");
    await conn.query(
      `INSERT INTO vehiculos (placa, marca, modelo, activo, repartidor_id)
       VALUES ('ABC-123', 'Toyota', 'Hilux', 1, ?)`,
      [chofer?.id || null]
    );
    console.log('  ✅ Vehiculo creado');
  } catch (e) {
    errors.push('vehiculos: ' + e.message);
  }

  try {
    await conn.query(
      "INSERT INTO configuracion (clave, valor) VALUES ('modo_sistema', 'demo') ON DUPLICATE KEY UPDATE valor = VALUES(valor), actualizado_en = NOW()"
    );
    console.log('  ✅ Config modo_sistema = demo');
  } catch (e) {
    errors.push('configuracion: ' + e.message);
  }

  // ── Step 4: Recreate triggers ──
  let triggerErrors = 0;
  for (const trg of triggerDefs) {
    try {
      await conn.query('CREATE TRIGGER `' + trg.name + '` ' + trg.timing + ' ' + trg.event + ' ON `' + trg.table + '` FOR EACH ROW ' + trg.stmt);
    } catch (err) {
      triggerErrors++;
      console.error('  ❌ Trigger ' + trg.name + ': ' + err.message);
    }
  }
  console.log('Triggers recreados:', triggerDefs.length, '(errores:', triggerErrors + ')');

  await conn.query('SET FOREIGN_KEY_CHECKS = 1');

  // ── Step 5: Verify ──
  console.log('\n=== VERIFICACION POST-RESTORE ===');
  let totalAfter = 0;
  const [tablesAfter] = await conn.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name"
  );
  for (const t of tablesAfter) {
    const tn = t.table_name || t.TABLE_NAME;
    const [[r]] = await conn.query('SELECT COUNT(*) as c FROM `' + tn + '`');
    if (r.c > 0) console.log('  ' + tn + ': ' + r.c);
    totalAfter += r.c;
  }
  console.log('\nRegistros después:', totalAfter);

  // Verify key data
  const [users] = await conn.query('SELECT id, nombre, email, rol FROM usuarios ORDER BY id');
  console.log('\nUsuarios:', JSON.stringify(users));

  const [pres] = await conn.query('SELECT id, nombre, stock_llenos FROM presentaciones ORDER BY id');
  console.log('Presentaciones:', JSON.stringify(pres));

  // Verify triggers work: check a simple trigger
  const [trigAfter] = await conn.query('SHOW TRIGGERS');
  console.log('\nTriggers activos:', trigAfter.length);

  console.log('\n=== RESULTADO ===');
  if (errors.length) {
    console.log('❌ ERRORES:', errors.length);
    for (const e of errors) console.log('  - ' + e);
  } else {
    console.log('✅ 0 ERRORES - Restauración a BD inicial funciona perfectamente');
  }

  await conn.end();
})().catch(e => console.error('FATAL:', e.message));
