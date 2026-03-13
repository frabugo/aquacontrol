// controllers/produccionController.js
const db = require('../db');
const { parsePagination, paginatedResponse } = require('../helpers/paginate');

/* ── GET /api/produccion ── */
exports.list = async (req, res) => {
  try {
    const { fecha, fecha_inicio, fecha_fin, estado, presentacion_id } = req.query;
    const { page, limit, offset } = parsePagination(req.query);

    const conds  = [];
    const params = [];
    if (fecha) {
      conds.push('l.fecha = ?'); params.push(fecha);
    } else {
      if (fecha_inicio) { conds.push('l.fecha >= ?'); params.push(fecha_inicio); }
      if (fecha_fin)    { conds.push('l.fecha <= ?'); params.push(fecha_fin); }
    }
    if (estado)          { conds.push('l.estado = ?');           params.push(estado); }
    if (presentacion_id) { conds.push('l.presentacion_id = ?'); params.push(presentacion_id); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM lotes_produccion l ${where}`, params
    );
    const [rows] = await db.query(
      `SELECT l.*,
              p.nombre AS presentacion_nombre,
              u.nombre AS operario_nombre
         FROM lotes_produccion l
         JOIN presentaciones p ON p.id = l.presentacion_id
         LEFT JOIN usuarios u  ON u.id = l.operario_id
         ${where}
         ORDER BY l.creado_en DESC
         LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    res.json(paginatedResponse(rows, total, page, limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── POST /api/produccion ── */
exports.create = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { presentacion_id, turno, cantidad_producida = 0, notas } = req.body;
    if (!presentacion_id) { conn.release(); return res.status(400).json({ error: 'presentacion_id requerido' }); }
    if (!turno)           { conn.release(); return res.status(400).json({ error: 'turno requerido' }); }

    await conn.beginTransaction();

    const [r] = await conn.query(
      `INSERT INTO lotes_produccion
         (numero, presentacion_id, operario_id, turno, cantidad_producida, notas)
       VALUES ('', ?, ?, ?, ?, ?)`,
      [presentacion_id, req.user.id, turno, Number(cantidad_producida), notas?.trim() || null]
    );

    const [[lote]] = await conn.query(
      `SELECT l.*, p.nombre AS presentacion_nombre, u.nombre AS operario_nombre
         FROM lotes_produccion l
         JOIN presentaciones p ON p.id = l.presentacion_id
         LEFT JOIN usuarios u  ON u.id = l.operario_id
         WHERE l.id = ?`,
      [r.insertId]
    );

    await conn.commit();
    conn.release();
    res.status(201).json(lote);
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    res.status(500).json({ error: err.message });
  }
};

/* ── PUT /api/produccion/:id/completar ── */
exports.completar = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[lote]] = await conn.query(
      'SELECT * FROM lotes_produccion WHERE id = ? FOR UPDATE',
      [req.params.id]
    );
    if (!lote) {
      await conn.rollback(); conn.release();
      return res.status(404).json({ error: 'Lote no encontrado' });
    }
    if (lote.estado === 'completado') {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'El lote ya está completado' });
    }
    if (lote.estado === 'rechazado') {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'No se puede completar un lote rechazado' });
    }

    const { cantidad_producida, notas } = req.body;
    const qty = cantidad_producida != null ? Number(cantidad_producida) : lote.cantidad_producida;

    if (qty <= 0) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'La cantidad producida debe ser mayor a 0' });
    }

    // Validar stock de vacíos para retornables
    const [[pres]] = await conn.query(
      'SELECT nombre, stock_vacios, es_retornable FROM presentaciones WHERE id = ? FOR UPDATE',
      [lote.presentacion_id]
    );
    if (pres && pres.es_retornable && pres.stock_vacios < qty) {
      const faltan = qty - pres.stock_vacios;
      await conn.rollback(); conn.release();
      return res.status(400).json({
        error: `Faltan ${faltan} ${pres.nombre} vacíos limpios (disponibles: ${pres.stock_vacios})`
      });
    }

    // Validar insumos no-retornables tengan stock suficiente
    const [faltantes] = await conn.query(
      `SELECT i.nombre, i.stock_actual,
              (r.cantidad * ?) AS necesita
         FROM recetas_produccion r
         JOIN insumos i ON i.id = r.insumo_id
         WHERE r.presentacion_id = ?
           AND r.es_opcional = 0
           AND i.es_retornable = 0
           AND i.stock_actual < (r.cantidad * ?)`,
      [qty, lote.presentacion_id, qty]
    );
    if (faltantes.length > 0) {
      const msgs = faltantes.map(f =>
        `Faltan ${Math.ceil(Number(f.necesita) - Number(f.stock_actual))} de ${f.nombre}`
      );
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: msgs.join('; ') });
    }

    // Update lote (trigger handles stock + insumos_movimientos)
    // cantidad_disponible is set here so the trigger can use NEW.cantidad_disponible for lotes mode
    await conn.query(
      `UPDATE lotes_produccion
         SET estado = 'completado', cantidad_producida = ?,
             cantidad_disponible = ?,
             notas = COALESCE(?, notas)
       WHERE id = ?`,
      [qty, qty, notas?.trim() || null, req.params.id]
    );

    await conn.commit();
    conn.release();

    const [[updated]] = await db.query(
      `SELECT l.*, p.nombre AS presentacion_nombre, u.nombre AS operario_nombre
         FROM lotes_produccion l
         JOIN presentaciones p ON p.id = l.presentacion_id
         LEFT JOIN usuarios u  ON u.id = l.operario_id
         WHERE l.id = ?`,
      [req.params.id]
    );
    res.json(updated);
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    res.status(500).json({ error: err.message });
  }
};

/* ── PUT /api/produccion/:id/rechazar ── */
exports.rechazar = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[lote]] = await conn.query(
      'SELECT * FROM lotes_produccion WHERE id = ? FOR UPDATE', [req.params.id]
    );
    if (!lote) {
      await conn.rollback(); conn.release();
      return res.status(404).json({ error: 'Lote no encontrado' });
    }
    if (lote.estado !== 'en_proceso') {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'Solo se pueden rechazar lotes en proceso' });
    }

    await conn.query(
      `UPDATE lotes_produccion SET estado = 'rechazado', notas = COALESCE(?, notas) WHERE id = ?`,
      [req.body.notas?.trim() || null, req.params.id]
    );

    await conn.commit();
    conn.release();
    res.json({ ok: true });
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/produccion/:id ── */
exports.getOne = async (req, res) => {
  try {
    const [[lote]] = await db.query(
      `SELECT l.*, p.nombre AS presentacion_nombre, u.nombre AS operario_nombre
         FROM lotes_produccion l
         JOIN presentaciones p ON p.id = l.presentacion_id
         LEFT JOIN usuarios u  ON u.id = l.operario_id
         WHERE l.id = ?`,
      [req.params.id]
    );
    if (!lote) return res.status(404).json({ error: 'Lote no encontrado' });

    const [consumo] = await db.query(
      `SELECT m.*, i.nombre AS insumo_nombre, i.unidad
         FROM insumos_movimientos m
         JOIN insumos i ON i.id = m.insumo_id
         WHERE m.lote_id = ?
         ORDER BY m.fecha_hora`,
      [req.params.id]
    );
    res.json({ ...lote, consumo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/produccion/verificar ── */
exports.verificar = async (req, res) => {
  try {
    const { presentacion_id, cantidad } = req.query;
    if (!presentacion_id || !cantidad) {
      return res.status(400).json({ error: 'presentacion_id y cantidad son requeridos' });
    }
    const qty = Number(cantidad);

    const [receta] = await db.query(
      `SELECT r.insumo_id, i.nombre AS insumo_nombre, i.unidad, i.stock_actual,
              i.es_retornable,
              r.cantidad AS por_unidad,
              r.cantidad * ? AS necesita,
              r.es_opcional
         FROM recetas_produccion r
         JOIN insumos i ON i.id = r.insumo_id
         WHERE r.presentacion_id = ?
         ORDER BY r.es_opcional, i.nombre`,
      [qty, presentacion_id]
    );

    // Check presentacion stock_vacios para retornables
    const [[pres]] = await db.query(
      'SELECT stock_vacios, es_retornable, nombre FROM presentaciones WHERE id = ?',
      [presentacion_id]
    );

    const items = receta.map(r => {
      const stock   = Number(r.stock_actual);
      const necesita = Number(r.necesita);
      // Retornables no consumen de insumos.stock_actual, se manejan por stock_vacios
      const suficiente = Number(r.es_retornable) ? true : stock >= necesita;
      return { ...r, stock_actual: stock, necesita, suficiente };
    });

    let vaciosOk = true;
    let vacios = null;
    if (pres && pres.es_retornable) {
      vaciosOk = pres.stock_vacios >= qty;
      vacios = {
        nombre: pres.nombre,
        stock_vacios: pres.stock_vacios,
        necesita: qty,
        suficiente: vaciosOk,
        mensaje: !vaciosOk ? `Faltan ${qty - pres.stock_vacios} ${pres.nombre} vacíos limpios` : null,
      };
    }

    const ok = items.filter(i => !i.es_opcional).every(i => i.suficiente) && vaciosOk;

    res.json({ data: items, ok, vacios });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/produccion/stock-fifo ── */
exports.stockFifo = async (req, res) => {
  try {
    const { presentacion_id } = req.query;
    if (!presentacion_id) return res.status(400).json({ error: 'presentacion_id requerido' });

    const [rows] = await db.query(
      `SELECT l.*, p.nombre AS presentacion_nombre
         FROM lotes_produccion l
         JOIN presentaciones p ON p.id = l.presentacion_id
         WHERE l.presentacion_id = ? AND l.estado = 'completado' AND l.cantidad_disponible > 0
         ORDER BY l.creado_en ASC`,
      [presentacion_id]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/produccion/receta/:presentacion_id ── */
exports.getReceta = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT r.*, i.nombre AS insumo_nombre, i.unidad, i.stock_actual
         FROM recetas_produccion r
         JOIN insumos i ON i.id = r.insumo_id
         WHERE r.presentacion_id = ?
         ORDER BY r.es_opcional, i.nombre`,
      [req.params.presentacion_id]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
