// controllers/auditController.js
const db = require('../db');
const { parsePagination, paginatedResponse } = require('../helpers/paginate');

/* ── GET /api/audit ── */
exports.list = async (req, res) => {
  try {
    const { usuario_id, modulo, accion, fecha_ini, fecha_fin, q } = req.query;
    const { page, limit, offset } = parsePagination(req.query);

    const conds  = [];
    const params = [];

    if (usuario_id) { conds.push('a.usuario_id = ?'); params.push(usuario_id); }
    if (modulo)     { conds.push('a.modulo = ?');      params.push(modulo); }
    if (accion)     { conds.push('a.accion = ?');      params.push(accion); }
    if (fecha_ini)  { conds.push('a.created_at >= ?'); params.push(`${fecha_ini} 00:00:00`); }
    if (fecha_fin)  { conds.push('a.created_at <= ?'); params.push(`${fecha_fin} 23:59:59`); }
    if (q) {
      conds.push('(a.usuario_nombre LIKE ? OR a.tabla LIKE ? OR a.detalle LIKE ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM audit_log a ${where}`,
      params
    );

    const [rows] = await db.query(
      `SELECT a.* FROM audit_log a ${where}
       ORDER BY a.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json(paginatedResponse(rows, total, page, limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
