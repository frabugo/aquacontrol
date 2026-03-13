// db.js — Conexión a MariaDB con soporte multi-tenant transparente
const { getTenantContext } = require('./tenantContext');
const { getPool } = require('./poolManager');
require('dotenv').config();

// Pool por defecto (backward compatible)
const defaultPool = getPool(process.env.DB_NAME);

// Probar conexión y fijar timezone de sesión
defaultPool.getConnection()
  .then(async conn => {
    await conn.query("SET time_zone = '-05:00'");
    console.log('✅ Conectado a MariaDB — aquacontrol (TZ: America/Lima)');
    conn.release();
  })
  .catch(err => {
    console.error('❌ Error de conexión:', err.message);
  });

// Proxy: redirige queries al pool del tenant activo o al default
const dbProxy = new Proxy(defaultPool, {
  get(target, prop) {
    const ctx = getTenantContext();
    const pool = ctx?.databaseName ? getPool(ctx.databaseName) : target;
    const value = pool[prop];
    return typeof value === 'function' ? value.bind(pool) : value;
  },
});

module.exports = dbProxy;
