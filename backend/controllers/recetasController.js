// controllers/recetasController.js
const db = require('../db');

/* ── GET /api/recetas/:presentacion_id ── */
exports.getByPresentacion = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT r.*, i.nombre AS insumo_nombre, i.unidad, i.precio_unitario AS insumo_precio
         FROM recetas_produccion r
         JOIN insumos i ON i.id = r.insumo_id
         WHERE r.presentacion_id = ?
         ORDER BY r.es_opcional, i.nombre`,
      [req.params.presentacion_id]
    );
    const costo_estimado = rows
      .filter(r => !r.es_opcional)
      .reduce((s, r) => s + Number(r.cantidad) * Number(r.insumo_precio), 0);

    res.json({ data: rows, costo_estimado });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── POST /api/recetas ── */
exports.create = async (req, res) => {
  try {
    const { presentacion_id, insumo_id, cantidad, es_opcional = 0 } = req.body;
    if (!presentacion_id) return res.status(400).json({ error: 'presentacion_id requerido' });
    if (!insumo_id)       return res.status(400).json({ error: 'insumo_id requerido' });
    if (!cantidad || Number(cantidad) <= 0) return res.status(400).json({ error: 'cantidad debe ser mayor a 0' });

    const [r] = await db.query(
      `INSERT INTO recetas_produccion (presentacion_id, insumo_id, cantidad, es_opcional)
       VALUES (?, ?, ?, ?)`,
      [presentacion_id, insumo_id, Number(cantidad), es_opcional ? 1 : 0]
    );
    const [[row]] = await db.query(
      `SELECT r.*, i.nombre AS insumo_nombre, i.unidad
         FROM recetas_produccion r
         JOIN insumos i ON i.id = r.insumo_id
         WHERE r.id = ?`,
      [r.insertId]
    );
    res.status(201).json(row);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ese insumo ya está en la receta' });
    }
    res.status(500).json({ error: err.message });
  }
};

/* ── PUT /api/recetas/:id ── */
exports.update = async (req, res) => {
  try {
    const { cantidad, es_opcional } = req.body;
    await db.query(
      `UPDATE recetas_produccion SET
         cantidad    = COALESCE(?, cantidad),
         es_opcional = COALESCE(?, es_opcional)
       WHERE id = ?`,
      [
        cantidad != null ? Number(cantidad) : null,
        es_opcional != null ? (es_opcional ? 1 : 0) : null,
        req.params.id,
      ]
    );
    const [[row]] = await db.query(
      `SELECT r.*, i.nombre AS insumo_nombre, i.unidad
         FROM recetas_produccion r
         JOIN insumos i ON i.id = r.insumo_id
         WHERE r.id = ?`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'Receta no encontrada' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── DELETE /api/recetas/:id ── */
exports.remove = async (req, res) => {
  try {
    const [r] = await db.query('DELETE FROM recetas_produccion WHERE id = ?', [req.params.id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Receta no encontrada' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
