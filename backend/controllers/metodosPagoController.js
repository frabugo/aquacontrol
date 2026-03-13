// controllers/metodosPagoController.js
const db = require('../db');

/* ── GET /api/metodos-pago — activos, ordenados ── */
exports.list = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM metodos_pago_config WHERE activo = 1 ORDER BY orden, id'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/metodos-pago/todos — incluye inactivos ── */
exports.listAll = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM metodos_pago_config ORDER BY orden, id'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── POST /api/metodos-pago — crear método digital ── */
exports.create = async (req, res) => {
  try {
    const { nombre, etiqueta, tipo = 'digital', color = 'slate', activo = 1, arrastra_saldo = 0, orden = 0 } = req.body;
    const label = (etiqueta || nombre || '').trim();
    if (!label) {
      return res.status(400).json({ error: 'La etiqueta es requerida' });
    }
    const validTipos = ['fisico', 'digital', 'credito'];
    const tipoFinal = validTipos.includes(tipo) ? tipo : 'digital';
    const slug = (nombre || label).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const [result] = await db.query(
      `INSERT INTO metodos_pago_config (nombre, etiqueta, tipo, color, activo, arrastra_saldo, orden, es_sistema)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      [slug, label, tipoFinal, color, activo ? 1 : 0, arrastra_saldo ? 1 : 0, orden]
    );
    const [[created]] = await db.query('SELECT * FROM metodos_pago_config WHERE id = ?', [result.insertId]);
    res.status(201).json(created);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe un método con ese nombre' });
    }
    res.status(500).json({ error: err.message });
  }
};

/* ── PUT /api/metodos-pago/:id — editar ── */
exports.update = async (req, res) => {
  try {
    const [[metodo]] = await db.query('SELECT * FROM metodos_pago_config WHERE id = ?', [req.params.id]);
    if (!metodo) return res.status(404).json({ error: 'Método no encontrado' });

    const { etiqueta, tipo, color, arrastra_saldo, activo, orden } = req.body;

    if (metodo.es_sistema) {
      // Solo permitir cambiar arrastra_saldo y orden en métodos de sistema
      const sets = [];
      const params = [];
      if (arrastra_saldo !== undefined) { sets.push('arrastra_saldo = ?'); params.push(arrastra_saldo ? 1 : 0); }
      if (orden !== undefined) { sets.push('orden = ?'); params.push(orden); }
      if (sets.length === 0) return res.status(400).json({ error: 'No se puede editar un método de sistema' });
      params.push(metodo.id);
      await db.query(`UPDATE metodos_pago_config SET ${sets.join(', ')} WHERE id = ?`, params);
    } else {
      const sets = [];
      const params = [];
      if (etiqueta !== undefined)       { sets.push('etiqueta = ?');       params.push(etiqueta.trim()); }
      if (tipo !== undefined)           { const valid = ['fisico','digital','credito']; sets.push('tipo = ?'); params.push(valid.includes(tipo) ? tipo : 'digital'); }
      if (color !== undefined)          { sets.push('color = ?');          params.push(color); }
      if (arrastra_saldo !== undefined) { sets.push('arrastra_saldo = ?'); params.push(arrastra_saldo ? 1 : 0); }
      if (activo !== undefined)         { sets.push('activo = ?');         params.push(activo ? 1 : 0); }
      if (orden !== undefined)          { sets.push('orden = ?');          params.push(orden); }
      if (sets.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });
      params.push(metodo.id);
      await db.query(`UPDATE metodos_pago_config SET ${sets.join(', ')} WHERE id = ?`, params);
    }

    const [[updated]] = await db.query('SELECT * FROM metodos_pago_config WHERE id = ?', [req.params.id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── DELETE /api/metodos-pago/:id — soft delete ── */
exports.deactivate = async (req, res) => {
  try {
    const [[metodo]] = await db.query('SELECT * FROM metodos_pago_config WHERE id = ?', [req.params.id]);
    if (!metodo) return res.status(404).json({ error: 'Método no encontrado' });
    if (metodo.es_sistema) return res.status(400).json({ error: 'No se puede desactivar un método de sistema' });

    await db.query('UPDATE metodos_pago_config SET activo = 0 WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
