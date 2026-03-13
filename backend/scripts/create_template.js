// scripts/create_template.js — Crea aquacontrol_template (clon sin datos de la BD principal)
// Uso: node scripts/create_template.js
const mysql = require('mysql2/promise');
require('dotenv').config();

const { DB_HOST, DB_PORT = 3306, DB_USER, DB_PASSWORD, DB_NAME } = process.env;

async function main() {
  console.log(`Creando template desde ${DB_NAME}...`);

  const conn = await mysql.createConnection({
    host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD,
  });

  // Crear BD template
  await conn.query('CREATE DATABASE IF NOT EXISTS aquacontrol_template');
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  console.log('BD aquacontrol_template creada');

  // Obtener todas las tablas (no vistas)
  const [tables] = await conn.query(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
    [DB_NAME]
  );

  for (const { TABLE_NAME } of tables) {
    try {
      // Obtener CREATE TABLE
      const [[row]] = await conn.query(`SHOW CREATE TABLE \`${DB_NAME}\`.\`${TABLE_NAME}\``);
      let createSql = row['Create Table'];
      // Cambiar esquema destino
      createSql = createSql.replace(
        /CREATE TABLE `/,
        'CREATE TABLE IF NOT EXISTS `aquacontrol_template`.`'
      );
      await conn.query(createSql);
      console.log(`  ✓ ${TABLE_NAME}`);
    } catch (err) {
      console.error(`  ✗ ${TABLE_NAME}: ${err.message}`);
    }
  }

  // Copiar triggers
  const [triggers] = await conn.query(
    `SELECT TRIGGER_NAME, EVENT_MANIPULATION, EVENT_OBJECT_TABLE, ACTION_STATEMENT, ACTION_TIMING
     FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ?`,
    [DB_NAME]
  );
  for (const trg of triggers) {
    try {
      await conn.query(`DROP TRIGGER IF EXISTS \`aquacontrol_template\`.\`${trg.TRIGGER_NAME}\``);
      await conn.query(
        `CREATE TRIGGER \`aquacontrol_template\`.\`${trg.TRIGGER_NAME}\`
         ${trg.ACTION_TIMING} ${trg.EVENT_MANIPULATION} ON \`aquacontrol_template\`.\`${trg.EVENT_OBJECT_TABLE}\`
         FOR EACH ROW ${trg.ACTION_STATEMENT}`
      );
      console.log(`  ✓ trigger: ${trg.TRIGGER_NAME}`);
    } catch (err) {
      console.error(`  ✗ trigger ${trg.TRIGGER_NAME}: ${err.message}`);
    }
  }

  // Copiar procedures
  const [procs] = await conn.query(
    `SELECT ROUTINE_NAME, ROUTINE_TYPE FROM information_schema.ROUTINES
     WHERE ROUTINE_SCHEMA = ?`,
    [DB_NAME]
  );
  for (const proc of procs) {
    try {
      const [[show]] = await conn.query(`SHOW CREATE ${proc.ROUTINE_TYPE} \`${DB_NAME}\`.\`${proc.ROUTINE_NAME}\``);
      const key = proc.ROUTINE_TYPE === 'PROCEDURE' ? 'Create Procedure' : 'Create Function';
      let createSql = show[key];
      if (createSql) {
        await conn.query(`DROP ${proc.ROUTINE_TYPE} IF EXISTS \`aquacontrol_template\`.\`${proc.ROUTINE_NAME}\``);
        // Reemplazar DEFINER y ejecutar en contexto de template
        createSql = createSql.replace(/DEFINER=`[^`]+`@`[^`]+`\s*/g, '');
        await conn.query(`USE aquacontrol_template`);
        await conn.query(createSql);
        console.log(`  ✓ ${proc.ROUTINE_TYPE.toLowerCase()}: ${proc.ROUTINE_NAME}`);
      }
    } catch (err) {
      console.error(`  ✗ ${proc.ROUTINE_TYPE} ${proc.ROUTINE_NAME}: ${err.message}`);
    }
  }

  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  await conn.end();
  console.log('\n✅ aquacontrol_template creada exitosamente');
}

main().catch(err => {
  console.error('❌ Error fatal:', err.message);
  process.exit(1);
});
