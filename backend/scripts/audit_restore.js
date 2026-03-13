require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'aquacontrol',
  });

  // 1. Current DB state
  const [tables] = await conn.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name"
  );
  console.log('=== ESTADO ACTUAL DE LA BD ===');
  console.log('Total tablas:', tables.length);

  let totalRows = 0;
  const currentData = {};
  for (const t of tables) {
    const tn = t.table_name || t.TABLE_NAME;
    const [[row]] = await conn.query('SELECT COUNT(*) as cnt FROM `' + tn + '`');
    currentData[tn] = row.cnt;
    totalRows += row.cnt;
    if (row.cnt > 0) console.log('  ' + tn + ': ' + row.cnt + ' registros');
  }
  console.log('\nTotal registros en BD:', totalRows);

  // 2. Load backup
  const backupFile = path.join(__dirname, '..', 'backups', '20260311_232544.json');
  const backup = JSON.parse(fs.readFileSync(backupFile, 'utf-8'));
  const backupTables = new Set(Object.keys(backup.tablas));
  const existingTables = new Set(tables.map(t => t.table_name || t.TABLE_NAME));

  console.log('\n=== BACKUP: 20260311_232544.json ===');
  console.log('Tablas en backup:', backupTables.size);
  let backupTotal = 0;
  for (const [tn, rows] of Object.entries(backup.tablas)) {
    backupTotal += rows.length;
  }
  console.log('Registros en backup:', backupTotal);

  // 3. Tables with data not covered by backup
  console.log('\n=== TABLAS CON DATOS NO CUBIERTAS POR BACKUP ===');
  let missing = 0;
  for (const t of tables) {
    const tn = t.table_name || t.TABLE_NAME;
    if (currentData[tn] > 0 && !backupTables.has(tn)) {
      console.log('  ⚠️  MISSING: ' + tn + ' (' + currentData[tn] + ' rows actuales, se PERDERAN)');
      missing++;
    }
  }
  if (!missing) console.log('  ✅ Ninguna - backup cubre todo');

  // 4. Tables in backup but not in DB
  console.log('\n=== TABLAS EN BACKUP PERO NO EN BD ===');
  let extra = 0;
  for (const tn of backupTables) {
    if (!existingTables.has(tn)) {
      console.log('  ⚠️  ' + tn + ' (' + backup.tablas[tn].length + ' rows, se IGNORARAN)');
      extra++;
    }
  }
  if (!extra) console.log('  ✅ Ninguna - todo coincide');

  // 5. Check generated columns
  const [genCols] = await conn.query(
    "SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.columns WHERE TABLE_SCHEMA = DATABASE() AND GENERATION_EXPRESSION IS NOT NULL AND GENERATION_EXPRESSION != ''"
  );
  if (genCols.length) {
    console.log('\n=== COLUMNAS GENERATED (se excluirán del INSERT) ===');
    for (const g of genCols) {
      const tn = g.TABLE_NAME || g.table_name;
      const cn = g.COLUMN_NAME || g.column_name;
      console.log('  ' + tn + '.' + cn);
    }
  }

  // 6. Check triggers that could cause issues
  const [triggers] = await conn.query('SHOW TRIGGERS');
  const insertTriggers = triggers.filter(t => t.Event === 'INSERT' && t.Timing === 'AFTER');
  if (insertTriggers.length) {
    console.log('\n=== TRIGGERS AFTER INSERT (se desactivarán durante restore) ===');
    for (const trg of insertTriggers) {
      // Find which tables the trigger inserts into
      const stmt = trg.Statement;
      const insertMatch = stmt.match(/INSERT INTO (\w+)/gi) || [];
      console.log('  ' + trg.Trigger + ' (on ' + trg.Table + ') -> inserta en: ' +
        (insertMatch.map(m => m.replace(/INSERT INTO /i, '')).join(', ') || 'N/A'));
    }
  }

  // 7. Diff: what changes when we restore
  console.log('\n=== DIFERENCIAS AL RESTAURAR ===');
  for (const [tn, rows] of Object.entries(backup.tablas)) {
    if (!existingTables.has(tn)) continue;
    const actual = currentData[tn] || 0;
    const backupCount = rows.length;
    if (actual !== backupCount) {
      const diff = backupCount - actual;
      console.log('  ' + tn + ': ' + actual + ' → ' + backupCount + ' (' + (diff > 0 ? '+' : '') + diff + ')');
    }
  }

  // 8. Check usuarios table specifically
  console.log('\n=== USUARIOS EN BACKUP ===');
  if (backup.tablas.usuarios) {
    for (const u of backup.tablas.usuarios) {
      console.log('  id=' + u.id + ' | ' + u.nombre + ' | ' + u.email + ' | rol=' + u.rol + ' | activo=' + u.activo);
    }
  }

  // 9. Check configuracion
  console.log('\n=== CONFIGURACION EN BACKUP ===');
  if (backup.tablas.configuracion) {
    for (const c of backup.tablas.configuracion) {
      const val = (c.valor || '').substring(0, 60);
      console.log('  ' + c.clave + ' = ' + val);
    }
  }

  // 10. Dry-run: simulate full restore and report any potential issues
  console.log('\n=== DRY RUN: Simulando restore ===');
  // Check for ISO dates that need conversion
  let isoDateCount = 0;
  for (const [tn, rows] of Object.entries(backup.tablas)) {
    for (const row of rows) {
      for (const [k, v] of Object.entries(row)) {
        if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) {
          isoDateCount++;
        }
      }
    }
  }
  console.log('  Fechas ISO a convertir: ' + isoDateCount);
  console.log('  Generated columns a excluir: ' + genCols.length);
  console.log('  Triggers a desactivar: ' + triggers.length);

  console.log('\n=== VEREDICTO ===');
  if (missing > 0) {
    console.log('⚠️  HAY ' + missing + ' TABLAS CON DATOS QUE NO ESTÁN EN EL BACKUP');
    console.log('   Se necesita crear un backup NUEVO antes de restaurar');
  } else {
    console.log('✅ El backup cubre todas las tablas con datos');
    console.log('✅ La restauración debería ser segura');
  }

  await conn.end();
})().catch(e => console.error('FATAL:', e.message));
