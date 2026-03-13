// helpers/paginate.js — Paginación reutilizable

/**
 * Extrae page/limit/offset de req.query con valores por defecto.
 * @param {Object} query - req.query
 * @param {Object} [opts]
 * @param {number} [opts.defaultLimit=30] - items por página por defecto
 * @param {number} [opts.maxLimit=100]    - máximo permitido
 * @returns {{ page: number, limit: number, offset: number }}
 */
function parsePagination(query, { defaultLimit = 30, maxLimit = 100 } = {}) {
  const page   = Math.max(1, parseInt(query.page) || 1);
  const limit  = Math.min(maxLimit, Math.max(1, parseInt(query.limit) || defaultLimit));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

/**
 * Construye el objeto de respuesta paginada.
 * @param {Array}  data  - filas de la consulta
 * @param {number} total - total de registros (COUNT)
 * @param {number} page
 * @param {number} limit
 * @param {Object} [extra] - campos adicionales (e.g. { totales })
 */
function paginatedResponse(data, total, page, limit, extra = {}) {
  return {
    data,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    ...extra,
  };
}

module.exports = { parsePagination, paginatedResponse };
