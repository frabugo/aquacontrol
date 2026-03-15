// controllers/lavadosController.js
const db = require('../db');
const { parsePagination, paginatedResponse } = require('../helpers/paginate');

/* ── GET /api/lavados/pendientes ── */
exports.pendientes = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT p.id AS presentacion_id, p.nombre AS presentacion_nombre,
              p.stock_en_lavado AS cantidad_pendiente,
              i.id AS insumo_id, i.nombre AS insumo_nombre
         FROM presentaciones p
         LEFT JOIN insumos i ON i.presentacion_id = p.id AND i.es_retornable = 1
         WHERE p.activo = 1 AND p.es_retornable = 1 AND p.stock_en_lavado > 0
         ORDER BY p.nombre`
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/lavados ── */
exports.list = async (req, res) => {
  try {
    const { fecha, fecha_inicio, fecha_fin } = req.query;
    const { page, limit, offset } = parsePagination(req.query);

    const conds  = [];
    const params = [];
    if (fecha) {
      conds.push('DATE(l.fecha_hora) = ?'); params.push(fecha);
    } else {
      if (fecha_inicio) { conds.push('DATE(l.fecha_hora) >= ?'); params.push(fecha_inicio); }
      if (fecha_fin)    { conds.push('DATE(l.fecha_hora) <= ?'); params.push(fecha_fin); }
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM lavados l ${where}`, params
    );
    const [rows] = await db.query(
      `SELECT l.*,
              u.nombre AS operario_nombre,
              i.nombre AS insumo_nombre,
              i.unidad,
              pr.nombre AS presentacion_nombre
         FROM lavados l
         LEFT JOIN usuarios u ON u.id = l.operario_id
         LEFT JOIN insumos  i ON i.id = l.insumo_id
         LEFT JOIN presentaciones pr ON pr.id = l.presentacion_id
         ${where}
         ORDER BY l.fecha_hora DESC
         LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    res.json(paginatedResponse(rows, total, page, limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── POST /api/lavados ── */
exports.create = async (req, res) => {
  const conn = await db.getConnection();
  try {
    // Validar caja abierta
    const [[cajaCheck]] = await db.query(
      "SELECT id FROM cajas WHERE estado IN ('abierta','reabierta') ORDER BY fecha DESC LIMIT 1"
    );
    if (!cajaCheck) {
      return res.status(400).json({ error: 'No hay caja abierta. Abre la caja antes de registrar lavados.' });
    }

    const { insumo_id, presentacion_id, cantidad, notas } = req.body;
    if (!insumo_id && !presentacion_id) { conn.release(); return res.status(400).json({ error: 'insumo_id o presentacion_id requerido' }); }
    if (!cantidad || Number(cantidad) <= 0) { conn.release(); return res.status(400).json({ error: 'cantidad debe ser mayor a 0' }); }

    await conn.beginTransaction();

    // Resolver presentacion_id si solo viene insumo_id
    let finalPresId = presentacion_id || null;
    if (!finalPresId && insumo_id) {
      const [[ins]] = await conn.query('SELECT presentacion_id FROM insumos WHERE id = ?', [insumo_id]);
      if (ins) finalPresId = ins.presentacion_id;
    }

    // Validar que haya suficiente stock_en_lavado (FOR UPDATE ahora dentro de transacción)
    if (finalPresId) {
      const [[pres]] = await conn.query(
        'SELECT stock_en_lavado FROM presentaciones WHERE id = ? FOR UPDATE',
        [finalPresId]
      );
      if (!pres) { await conn.rollback(); conn.release(); return res.status(404).json({ error: 'Presentación no encontrada' }); }
      if (pres.stock_en_lavado < Number(cantidad)) {
        await conn.rollback(); conn.release();
        return res.status(400).json({
          error: `Stock insuficiente en lavado. Disponible: ${pres.stock_en_lavado}, solicitado: ${Number(cantidad)}`
        });
      }
    }

    const [r] = await conn.query(
      `INSERT INTO lavados (insumo_id, presentacion_id, cantidad, operario_id, notas)
       VALUES (?, ?, ?, ?, ?)`,
      [insumo_id || null, finalPresId, Number(cantidad), req.user.id, notas?.trim() || null]
    );
    const lavadoId = r.insertId;

    // stock_movimientos + stock update lo maneja el trigger trg_lavado_a_insumo

    await conn.commit();

    const [[lavado]] = await db.query(
      `SELECT l.*, u.nombre AS operario_nombre, i.nombre AS insumo_nombre, i.unidad,
              pr.nombre AS presentacion_nombre
         FROM lavados l
         LEFT JOIN usuarios u ON u.id = l.operario_id
         LEFT JOIN insumos  i ON i.id = l.insumo_id
         LEFT JOIN presentaciones pr ON pr.id = l.presentacion_id
         WHERE l.id = ?`,
      [lavadoId]
    );
    conn.release();
    res.status(201).json(lavado);
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/lavados/ingresos-vacios ── */
exports.ingresosVacios = async (req, res) => {
  try {
    const { fecha, fecha_inicio, fecha_fin, repartidor_id } = req.query;
    const { page, limit, offset } = parsePagination(req.query);

    const conds  = [];
    const params = [];
    if (fecha) {
      conds.push('DATE(iv.fecha_hora) = ?'); params.push(fecha);
    } else {
      if (fecha_inicio) { conds.push('DATE(iv.fecha_hora) >= ?'); params.push(fecha_inicio); }
      if (fecha_fin)    { conds.push('DATE(iv.fecha_hora) <= ?'); params.push(fecha_fin); }
    }
    if (repartidor_id) { conds.push('iv.repartidor_id = ?'); params.push(repartidor_id); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM ingresos_vacios iv ${where}`, params
    );
    const [rows] = await db.query(
      `SELECT iv.*,
              p.nombre AS presentacion_nombre,
              u.nombre AS repartidor_nombre,
              ur.nombre AS registrado_por_nombre
         FROM ingresos_vacios iv
         LEFT JOIN presentaciones p ON p.id = iv.presentacion_id
         LEFT JOIN usuarios u ON u.id = iv.repartidor_id
         LEFT JOIN usuarios ur ON ur.id = iv.registrado_por
         ${where}
         ORDER BY iv.fecha_hora DESC
         LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    res.json(paginatedResponse(rows, total, page, limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
