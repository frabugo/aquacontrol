// helpers/getConfigValue.js — Lee una clave de `configuracion` con default
const db = require('../db');

/**
 * @param {string} clave
 * @param {string} defaultVal  — valor por defecto si no existe
 * @param {object} [conn]      — conexión opcional (para usar dentro de transacciones)
 */
async function getConfigValue(clave, defaultVal = '1', conn) {
  const q = conn || db;
  const [[row]] = await q.query(
    'SELECT valor FROM configuracion WHERE clave = ?',
    [clave]
  );
  return row ? row.valor : defaultVal;
}

module.exports = getConfigValue;
