// controllers/vehiculosController.js
const db = require('../db');

/* ── GET /api/vehiculos ── */
exports.list = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT v.*, u.nombre AS repartidor_nombre
         FROM vehiculos v
         LEFT JOIN usuarios u ON u.id = v.repartidor_id
         WHERE v.activo = 1
         ORDER BY v.placa`
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── POST /api/vehiculos ── */
exports.create = async (req, res) => {
  try {
    const { placa, marca, modelo, color, capacidad_notas, repartidor_id } = req.body;
    if (!placa) return res.status(400).json({ error: 'La placa es requerida' });

    const [result] = await db.query(
      `INSERT INTO vehiculos (placa, marca, modelo, color, capacidad_notas, repartidor_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [placa.trim().toUpperCase(), marca?.trim() || null, modelo?.trim() || null,
       color?.trim() || null, capacidad_notas?.trim() || null, repartidor_id || null]
    );

    const [[created]] = await db.query(
      `SELECT v.*, u.nombre AS repartidor_nombre
         FROM vehiculos v LEFT JOIN usuarios u ON u.id = v.repartidor_id
         WHERE v.id = ?`, [result.insertId]
    );
    res.status(201).json(created);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe un vehículo con esa placa' });
    }
    res.status(500).json({ error: err.message });
  }
};

/* ── PUT /api/vehiculos/:id ── */
exports.update = async (req, res) => {
  try {
    const { placa, marca, modelo, color, capacidad_notas, repartidor_id } = req.body;
    const sets = [
      'placa = COALESCE(?, placa)',
      'marca = COALESCE(?, marca)',
      'modelo = COALESCE(?, modelo)',
      'color = COALESCE(?, color)',
      'capacidad_notas = COALESCE(?, capacidad_notas)',
    ];
    const params = [placa?.trim().toUpperCase(), marca?.trim(), modelo?.trim(),
       color?.trim(), capacidad_notas?.trim()];
    if (repartidor_id !== undefined) {
      sets.push('repartidor_id = ?');
      params.push(repartidor_id || null);
    }
    params.push(req.params.id);
    const [result] = await db.query(
      `UPDATE vehiculos SET ${sets.join(', ')} WHERE id = ?`, params
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Vehículo no encontrado' });

    const [[updated]] = await db.query(
      `SELECT v.*, u.nombre AS repartidor_nombre
         FROM vehiculos v LEFT JOIN usuarios u ON u.id = v.repartidor_id
         WHERE v.id = ?`, [req.params.id]
    );
    res.json(updated);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe un vehículo con esa placa' });
    }
    res.status(500).json({ error: err.message });
  }
};

/* ── DELETE /api/vehiculos/:id (soft delete) ── */
exports.remove = async (req, res) => {
  try {
    const [result] = await db.query(
      'UPDATE vehiculos SET activo = 0 WHERE id = ?', [req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Vehículo no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/vehiculos/mi-vehiculo ── */
exports.miVehiculo = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT v.*
         FROM vehiculos v
         WHERE v.repartidor_id = ? AND v.activo = 1
         LIMIT 1`,
      [req.user.id]
    );
    res.json({ data: rows[0] || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/vehiculos/disponibles ── */
exports.disponibles = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT v.*
         FROM vehiculos v
         WHERE v.activo = 1 AND (v.repartidor_id IS NULL OR v.repartidor_id = ?)
         ORDER BY v.repartidor_id = ? DESC, v.placa`,
      [req.user.id, req.user.id]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/vehiculos/:id/historial-km ── */
exports.historialKm = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT r.id AS ruta_id, r.fecha, r.km_inicio, r.km_fin,
              (r.km_fin - r.km_inicio) AS recorrido,
              u.nombre AS repartidor_nombre
         FROM rutas r
         JOIN usuarios u ON u.id = r.repartidor_id
         WHERE r.vehiculo_id = ? AND r.km_fin IS NOT NULL
         ORDER BY r.fecha DESC
         LIMIT 50`,
      [req.params.id]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── PUT /api/vehiculos/:id/asignar-repartidor ── */
exports.asignarRepartidor = async (req, res) => {
  try {
    const { repartidor_id } = req.body;
    await db.query(
      'UPDATE vehiculos SET repartidor_id = ? WHERE id = ?',
      [repartidor_id || null, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
