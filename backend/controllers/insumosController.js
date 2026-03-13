// controllers/insumosController.js
const db = require('../db');

/* ── GET /api/insumos ── */
exports.list = async (req, res) => {
  try {
    const { q, activo = '1' } = req.query;
    const conds  = [];
    const params = [];

    if (activo !== '') { conds.push('i.activo = ?'); params.push(Number(activo)); }
    if (q)             { conds.push('i.nombre LIKE ?'); params.push(`%${q}%`); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const [rows] = await db.query(
      `SELECT i.*,
              (i.stock_actual <= i.stock_minimo) AS stock_bajo
         FROM insumos i
         ${where}
         ORDER BY i.nombre`,
      params
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/insumos/:id ── */
exports.getOne = async (req, res) => {
  try {
    const [[insumo]] = await db.query(
      'SELECT *, (stock_actual <= stock_minimo) AS stock_bajo FROM insumos WHERE id = ?',
      [req.params.id]
    );
    if (!insumo) return res.status(404).json({ error: 'Insumo no encontrado' });

    const [movs] = await db.query(
      `SELECT m.*, u.nombre AS registrado_por_nombre
         FROM insumos_movimientos m
         LEFT JOIN usuarios u ON u.id = m.registrado_por
         WHERE m.insumo_id = ?
         ORDER BY m.fecha_hora DESC
         LIMIT 50`,
      [req.params.id]
    );

    const [recetas] = await db.query(
      `SELECT r.*, p.nombre AS presentacion_nombre
         FROM recetas_produccion r
         JOIN presentaciones p ON p.id = r.presentacion_id
         WHERE r.insumo_id = ?`,
      [req.params.id]
    );

    res.json({ ...insumo, movimientos: movs, recetas });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── POST /api/insumos ── */
exports.create = async (req, res) => {
  try {
    const { nombre, unidad, stock_actual = 0, stock_minimo = 0, precio_unitario = 0 } = req.body;
    if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es requerido' });
    if (!unidad?.trim()) return res.status(400).json({ error: 'La unidad es requerida' });

    const [r] = await db.query(
      `INSERT INTO insumos (nombre, unidad, stock_actual, stock_minimo, precio_unitario)
       VALUES (?, ?, ?, ?, ?)`,
      [nombre.trim(), unidad.trim(), Number(stock_actual), Number(stock_minimo), Number(precio_unitario)]
    );
    const [[ins]] = await db.query('SELECT * FROM insumos WHERE id = ?', [r.insertId]);
    res.status(201).json(ins);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── PUT /api/insumos/:id ── */
exports.update = async (req, res) => {
  try {
    const { nombre, unidad, stock_minimo, precio_unitario, activo } = req.body;
    await db.query(
      `UPDATE insumos SET
         nombre          = COALESCE(?, nombre),
         unidad          = COALESCE(?, unidad),
         stock_minimo    = COALESCE(?, stock_minimo),
         precio_unitario = COALESCE(?, precio_unitario),
         activo          = COALESCE(?, activo)
       WHERE id = ?`,
      [nombre?.trim() || null, unidad?.trim() || null,
       stock_minimo != null ? Number(stock_minimo) : null,
       precio_unitario != null ? Number(precio_unitario) : null,
       activo != null ? Number(activo) : null,
       req.params.id]
    );
    const [[ins]] = await db.query('SELECT * FROM insumos WHERE id = ?', [req.params.id]);
    if (!ins) return res.status(404).json({ error: 'Insumo no encontrado' });
    res.json(ins);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── POST /api/insumos/:id/ajuste ── */
exports.ajuste = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { tipo, cantidad, motivo } = req.body;
    const TIPOS_AJUSTE = ['ajuste_entrada', 'ajuste_salida', 'merma'];
    if (!TIPOS_AJUSTE.includes(tipo)) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'tipo inválido' });
    }
    if (!cantidad || Number(cantidad) <= 0) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'cantidad debe ser mayor a 0' });
    }

    const delta = tipo === 'ajuste_entrada' ? Number(cantidad) : -Number(cantidad);

    await conn.query(
      'UPDATE insumos SET stock_actual = stock_actual + ? WHERE id = ?',
      [delta, req.params.id]
    );
    await conn.query(
      `INSERT INTO insumos_movimientos
         (insumo_id, tipo, cantidad, registrado_por, motivo)
       VALUES (?, ?, ?, ?, ?)`,
      [req.params.id, tipo, delta, req.user.id, motivo?.trim() || null]
    );

    await conn.commit();
    conn.release();

    const [[ins]] = await db.query('SELECT * FROM insumos WHERE id = ?', [req.params.id]);
    res.json(ins);
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    res.status(500).json({ error: err.message });
  }
};

/* ── DELETE /api/insumos/:id ── */
exports.deactivate = async (req, res) => {
  try {
    const [r] = await db.query('UPDATE insumos SET activo = 0 WHERE id = ?', [req.params.id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Insumo no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/insumos/alertas ── */
exports.alertas = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT *,
              CASE WHEN stock_actual = 0 THEN 'agotado' ELSE 'bajo' END AS alerta
         FROM insumos
         WHERE activo = 1 AND stock_actual <= stock_minimo
         ORDER BY stock_actual ASC`
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/insumos/:id/receta ── */
exports.getReceta = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT r.*, i.nombre AS insumo_nombre, i.unidad, i.stock_actual
         FROM recetas_produccion r
         JOIN insumos i ON i.id = r.insumo_id
         WHERE r.presentacion_id = ?
         ORDER BY r.es_opcional, i.nombre`,
      [req.params.id]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
