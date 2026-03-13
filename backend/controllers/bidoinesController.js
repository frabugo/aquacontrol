// controllers/bidoinesController.js
const db = require('../db');

/* ── GET /api/bidones/stock ── */
exports.getStock = async (req, res) => {
  try {
    const [[stock]] = await db.query('SELECT * FROM bidones_stock LIMIT 1');
    res.json(stock ?? {
      llenos_disponibles: 0,
      vacios_disponibles: 0,
      prestados_total:    0,
      total_empresa:      0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/bidones/movimientos ── */
exports.getMovimientos = async (req, res) => {
  try {
    const fecha = req.query.fecha || new Date().toISOString().slice(0, 10);
    const [rows] = await db.query(
      `SELECT bm.*,
              c.nombre AS cliente_nombre
         FROM bidones_movimientos bm
         LEFT JOIN clientes c ON c.id = bm.cliente_id
         WHERE DATE(bm.fecha_hora) = ?
         ORDER BY bm.fecha_hora DESC`,
      [fecha]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
