const db = require('../db');

// Cache en memoria — se invalida cada 5 minutos
let cache = null;
let cacheTime = 0;
const TTL = 5 * 60 * 1000;

async function getAll(conn) {
  const now = Date.now();
  if (cache && now - cacheTime < TTL) return cache;
  const q = conn || db;
  const [rows] = await q.query('SELECT id, nombre, tipo, es_sistema FROM categorias_caja WHERE activo = 1');
  const map = {};
  for (const r of rows) map[r.nombre] = r.id;
  cache = map;
  cacheTime = now;
  return map;
}

/**
 * Obtiene el ID de una categoría del sistema por nombre.
 * Nombres: 'Venta', 'Cobro deuda', 'Pago proveedor', 'Devolución', 'Gasto operativo', 'Otro ingreso', 'Otro egreso'
 */
async function getCategoriaId(nombre, conn) {
  const map = await getAll(conn);
  return map[nombre] || null;
}

module.exports = { getCategoriaId };
