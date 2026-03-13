// controllers/condicionesPagoController.js
const db = require('../db');

/* ── GET /api/condiciones-pago — activos, ordenados ── */
exports.list = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM condiciones_pago WHERE activo = 1 ORDER BY orden, id'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/condiciones-pago/todos — incluye inactivos ── */
exports.listAll = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM condiciones_pago ORDER BY orden, id'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── POST /api/condiciones-pago — crear condición ── */
exports.create = async (req, res) => {
  try {
    const { nombre, descripcion = null, tipo = 'contado', num_cuotas = 1, dias_entre_cuotas = 30, orden = 0 } = req.body;
    if (!nombre?.trim()) {
      return res.status(400).json({ error: 'El nombre es requerido' });
    }
    if (!['contado', 'credito'].includes(tipo)) {
      return res.status(400).json({ error: 'Tipo debe ser contado o credito' });
    }
    const [result] = await db.query(
      `INSERT INTO condiciones_pago (nombre, descripcion, tipo, num_cuotas, dias_entre_cuotas, es_sistema, activo, orden)
       VALUES (?, ?, ?, ?, ?, 0, 1, ?)`,
      [nombre.trim(), descripcion?.trim() || null, tipo, tipo === 'contado' ? 1 : Math.max(1, num_cuotas), tipo === 'contado' ? 0 : Math.max(0, dias_entre_cuotas), orden]
    );
    const [[created]] = await db.query('SELECT * FROM condiciones_pago WHERE id = ?', [result.insertId]);
    res.status(201).json(created);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe una condición con ese nombre' });
    }
    res.status(500).json({ error: err.message });
  }
};

/* ── PUT /api/condiciones-pago/:id — editar ── */
exports.update = async (req, res) => {
  try {
    const [[cond]] = await db.query('SELECT * FROM condiciones_pago WHERE id = ?', [req.params.id]);
    if (!cond) return res.status(404).json({ error: 'Condición no encontrada' });

    const { nombre, descripcion, tipo, num_cuotas, dias_entre_cuotas, activo, orden } = req.body;

    if (cond.es_sistema) {
      // Solo permitir cambiar orden en condiciones de sistema
      const sets = [];
      const params = [];
      if (orden !== undefined) { sets.push('orden = ?'); params.push(orden); }
      if (sets.length === 0) return res.status(400).json({ error: 'No se puede editar una condición de sistema' });
      params.push(cond.id);
      await db.query(`UPDATE condiciones_pago SET ${sets.join(', ')} WHERE id = ?`, params);
    } else {
      const sets = [];
      const params = [];
      if (nombre !== undefined)            { sets.push('nombre = ?');            params.push(nombre.trim()); }
      if (descripcion !== undefined)       { sets.push('descripcion = ?');       params.push(descripcion?.trim() || null); }
      if (tipo !== undefined)              { sets.push('tipo = ?');              params.push(tipo); }
      if (num_cuotas !== undefined)        { sets.push('num_cuotas = ?');        params.push(Math.max(1, num_cuotas)); }
      if (dias_entre_cuotas !== undefined) { sets.push('dias_entre_cuotas = ?'); params.push(Math.max(0, dias_entre_cuotas)); }
      if (activo !== undefined)            { sets.push('activo = ?');            params.push(activo ? 1 : 0); }
      if (orden !== undefined)             { sets.push('orden = ?');             params.push(orden); }
      if (sets.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });
      params.push(cond.id);
      await db.query(`UPDATE condiciones_pago SET ${sets.join(', ')} WHERE id = ?`, params);
    }

    const [[updated]] = await db.query('SELECT * FROM condiciones_pago WHERE id = ?', [req.params.id]);
    res.json(updated);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe una condición con ese nombre' });
    }
    res.status(500).json({ error: err.message });
  }
};

/* ── DELETE /api/condiciones-pago/:id — soft delete ── */
exports.deactivate = async (req, res) => {
  try {
    const [[cond]] = await db.query('SELECT * FROM condiciones_pago WHERE id = ?', [req.params.id]);
    if (!cond) return res.status(404).json({ error: 'Condición no encontrada' });
    if (cond.es_sistema) return res.status(400).json({ error: 'No se puede desactivar una condición de sistema' });

    await db.query('UPDATE condiciones_pago SET activo = 0 WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
