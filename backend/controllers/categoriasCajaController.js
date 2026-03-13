const db = require('../db');

// GET /api/config/categorias-caja — listar todas (activas por defecto, ?todas=1 para incluir inactivas)
exports.list = async (req, res) => {
  try {
    const todas = req.query.todas === '1';
    const where = todas ? '' : 'WHERE activo = 1';
    const [rows] = await db.query(
      `SELECT * FROM categorias_caja ${where} ORDER BY es_sistema DESC, tipo, nombre`
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/config/categorias-caja — crear
exports.create = async (req, res) => {
  try {
    const { nombre, tipo } = req.body;
    if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es requerido' });
    if (!['ingreso', 'egreso'].includes(tipo)) return res.status(400).json({ error: 'Tipo debe ser ingreso o egreso' });

    const [result] = await db.query(
      'INSERT INTO categorias_caja (nombre, tipo) VALUES (?, ?)',
      [nombre.trim(), tipo]
    );
    const [[row]] = await db.query('SELECT * FROM categorias_caja WHERE id = ?', [result.insertId]);
    res.status(201).json(row);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ya existe una categoría con ese nombre' });
    res.status(500).json({ error: err.message });
  }
};

// PUT /api/config/categorias-caja/:id — editar
exports.update = async (req, res) => {
  try {
    // Proteger categorías del sistema
    const [[cat]] = await db.query('SELECT es_sistema FROM categorias_caja WHERE id = ?', [req.params.id]);
    if (!cat) return res.status(404).json({ error: 'Categoría no encontrada' });
    if (cat.es_sistema) return res.status(400).json({ error: 'Las categorías del sistema no se pueden modificar' });

    const { nombre, tipo, activo } = req.body;
    const sets = [];
    const params = [];

    if (nombre !== undefined) { sets.push('nombre = ?'); params.push(nombre.trim()); }
    if (tipo !== undefined) {
      if (!['ingreso', 'egreso'].includes(tipo)) return res.status(400).json({ error: 'Tipo debe ser ingreso o egreso' });
      sets.push('tipo = ?'); params.push(tipo);
    }
    if (activo !== undefined) { sets.push('activo = ?'); params.push(activo ? 1 : 0); }

    if (sets.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

    params.push(req.params.id);
    await db.query(`UPDATE categorias_caja SET ${sets.join(', ')} WHERE id = ?`, params);
    const [[row]] = await db.query('SELECT * FROM categorias_caja WHERE id = ?', [req.params.id]);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE /api/config/categorias-caja/:id — desactivar (soft delete)
exports.remove = async (req, res) => {
  try {
    // Proteger categorías del sistema
    const [[cat]] = await db.query('SELECT es_sistema FROM categorias_caja WHERE id = ?', [req.params.id]);
    if (!cat) return res.status(404).json({ error: 'Categoría no encontrada' });
    if (cat.es_sistema) return res.status(400).json({ error: 'Las categorías del sistema no se pueden eliminar' });

    await db.query('UPDATE categorias_caja SET activo = 0 WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
