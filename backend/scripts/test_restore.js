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

  const [tablesResult] = await conn.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'"
  );
  const existingTables = new Set(tablesResult.map(t => t.table_name || t.TABLE_NAME));

  const colCache = {};
  async function getCols(tabla) {
    if (!colCache[tabla]) {
      const [cols] = await conn.query(
        'SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?',
        [tabla]
      );
      colCache[tabla] = new Set(cols.map(c => c.column_name || c.COLUMN_NAME));
    }
    return colCache[tabla];
  }

  // Phase 1: DELETE all tables in backup
  for (const tabla of Object.keys(backup.tablas)) {
    if (existingTables.has(tabla)) {
      await conn.query('DELETE FROM `' + tabla + '`');
    }
  }

  // Phase 2: Insert all rows, collect errors
  const errors = [];
  let totalOK = 0;

  for (const [tabla, rows] of Object.entries(backup.tablas)) {
    if (!rows.length || !existingTables.has(tabla)) continue;

    const colsReales = await getCols(tabla);
    const columnas = Object.keys(rows[0]).filter(c => colsReales.has(c));
    if (!columnas.length) continue;

    const placeholders = columnas.map(() => '?').join(', ');
    const colNames = columnas.map(c => '`' + c + '`').join(', ');

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const valores = columnas.map(c => {
        const v = row[c];
        // Convert ISO dates to MySQL format
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

  await conn.query('SET FOREIGN_KEY_CHECKS = 1');

  console.log('Total OK:', totalOK);
  console.log('Total errors:', errors.length);
  if (errors.length) {
    for (const e of errors) {
      console.log(`  [${e.tabla}] row ${e.row}: ${e.msg}`);
    }
  }

  await conn.end();
})().catch(e => console.error('FATAL:', e.message));
