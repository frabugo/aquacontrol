// poolManager.js — Gestiona pools de conexión por tenant
const mysql = require('mysql2/promise');
require('dotenv').config();

const pools = new Map();

function createPool(databaseName) {
  const isDefault = databaseName === process.env.DB_NAME;
  return mysql.createPool({
    host:     process.env.DB_HOST,
    port:     process.env.DB_PORT || 3306,
    database: databaseName,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    waitForConnections:    true,
    connectionLimit:       isDefault ? 25 : 10,
    enableKeepAlive:       true,
    keepAliveInitialDelay: 30000,
    timezone: '-05:00',
  });
}

function getPool(databaseName) {
  if (!pools.has(databaseName)) {
    pools.set(databaseName, createPool(databaseName));
  }
  return pools.get(databaseName);
}

function removePool(databaseName) {
  const pool = pools.get(databaseName);
  if (pool) {
    pool.end().catch(e => console.error('Pool close error:', e.message));
    pools.delete(databaseName);
  }
}

module.exports = { getPool, removePool };
