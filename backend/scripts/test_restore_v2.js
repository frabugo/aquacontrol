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

  const backupFile = path.join(__dirname, '..', 'backups', '20260311_232544.json');
  const backup = JSON.parse(fs.readFileSync(backupFile, 'utf-8'));

  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  await conn.query('SET SQL_MODE = ""');

  // ── 1. Save and drop all triggers ──
  const [triggers] = await conn.query('SHOW TRIGGERS');
  const triggerDefs = [];
  for (const trg of triggers) {
    triggerDefs.push({
      name: trg.Trigger,
      table: trg.Table,
      timing: trg.Timing,
      event: trg.Event,
      stmt: trg.Statement,
    });
    await conn.query('DROP TRIGGER IF EXISTS `' + trg.Trigger + '`');
  }
  console.log('Triggers dropped:', triggerDefs.length);

  // ── 2. Get existing tables ──
  const [tablesResult] = await conn.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'"
  );
  const existingTables = new Set(tablesResult.map(t => t.table_name || t.TABLE_NAME));

  // ── 3. Column cache with GENERATED detection ──
  const colCache = {};
  const genCache = {};
  async function getCols(tabla) {
    if (!colCache[tabla]) {
      const [cols] = await conn.query(
        'SELECT column_name, EXTRA FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?',
        [tabla]
      );
      const allCols = new Set();
      const genCols = new Set();
      for (const c of cols) {
        const colName = c.column_name || c.COLUMN_NAME;
        const extra = (c.EXTRA || '').toUpperCase();
        allCols.add(colName);
        if (extra.includes('GENERATED') || extra.includes('VIRTUAL') || extra.includes('STORED')) {
          genCols.add(colName);
        }
      }
      colCache[tabla] = allCols;
      genCache[tabla] = genCols;
    }
    return { all: colCache[tabla], generated: genCache[tabla] };
  }

  // ── 4. DELETE all tables in backup ──
  for (const tabla of Object.keys(backup.tablas)) {
    if (existingTables.has(tabla)) {
      await conn.query('DELETE FROM `' + tabla + '`');
    }
  }

  // ── 5. Insert all rows ──
  const errors = [];
  let totalOK = 0;

  for (const [tabla, rows] of Object.entries(backup.tablas)) {
    if (!rows.length || !existingTables.has(tabla)) continue;

    const { all: colsReales, generated: colsGen } = await getCols(tabla);
    const columnas = Object.keys(rows[0]).filter(c => colsReales.has(c) && !colsGen.has(c));
    if (!columnas.length) continue;

    if (colsGen.size > 0) {
      console.log(`  [${tabla}] Excluded GENERATED cols: ${[...colsGen].join(', ')}`);
    }

    const placeholders = columnas.map(() => '?').join(', ');
    const colNames = columnas.map(c => '`' + c + '`').join(', ');

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const valores = columnas.map(c => {
        const v = row[c];
        if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) {
          return v.replace('T', ' ').replace(/\.\d{3}Z$/, '');
        }
        return v;
      });
      try {
        await conn.query('INSERT INTO `' + tabla + '` (' + colNames + ') VALUES (' + placeholders + ')', valores);
        totalOK++;
      } catch (err) {
        errors.push({ tabla, row: i, msg: err.message, sqlState: err.sqlState });
      }
    }
  }

  // ── 6. Recreate triggers ──
  let triggerErrors = 0;
  for (const trg of triggerDefs) {
    try {
      const sql = 'CREATE TRIGGER `' + trg.name + '` ' + trg.timing + ' ' + trg.event + ' ON `' + trg.table + '` FOR EACH ROW ' + trg.stmt;
      await conn.query(sql);
    } catch (err) {
      triggerErrors++;
      console.error('  Trigger error ' + trg.name + ': ' + err.message);
    }
  }
  console.log('Triggers recreated:', triggerDefs.length, '(errors:', triggerErrors + ')');

  await conn.query('SET FOREIGN_KEY_CHECKS = 1');

  console.log('\n=== RESULTS ===');
  console.log('Total OK:', totalOK);
  console.log('Total errors:', errors.length);
  if (errors.length) {
    for (const e of errors) {
      console.log(`  [${e.tabla}] row ${e.row}: ${e.msg}`);
    }
  }

  await conn.end();
})().catch(e => console.error('FATAL:', e.message));
