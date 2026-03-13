// controllers/mantenimientosController.js
const db = require('../db');
const logAudit = require('../helpers/audit');
const { parsePagination, paginatedResponse } = require('../helpers/paginate');

/* ── GET /api/mantenimientos ── */
exports.list = async (req, res) => {
  try {
    const { vehiculo_id, tipo, fecha_inicio, fecha_fin } = req.query;
    const { page, limit, offset } = parsePagination(req.query);

    const conds = [], params = [];
    if (vehiculo_id)  { conds.push('m.vehiculo_id = ?');    params.push(vehiculo_id); }
    if (tipo)         { conds.push('m.tipo = ?');           params.push(tipo); }
    if (fecha_inicio) { conds.push('m.fecha >= ?');         params.push(fecha_inicio); }
    if (fecha_fin)    { conds.push('m.fecha <= ?');         params.push(fecha_fin); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM mantenimientos m ${where}`, params
    );

    const [rows] = await db.query(
      `SELECT m.*, v.placa, u.nombre AS registrado_nombre
         FROM mantenimientos m
         LEFT JOIN vehiculos v ON v.id = m.vehiculo_id
         LEFT JOIN usuarios u ON u.id = m.registrado_por
         ${where}
         ORDER BY m.fecha DESC
         LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json(paginatedResponse(rows, total, page, limit));
  } catch (err) {
    console.error('mantenimientos.list:', err.message);
    res.status(500).json({ error: 'Error listando mantenimientos' });
  }
};

/* ── GET /api/mantenimientos/alertas ── */
exports.alertas = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT m.id, m.vehiculo_id, m.tipo, m.descripcion, m.proximo_km, m.proximo_fecha,
              v.placa, v.kilometraje_actual,
              CASE
                WHEN m.proximo_fecha IS NOT NULL AND m.proximo_fecha < CURDATE() THEN 'vencido'
                WHEN m.proximo_fecha IS NOT NULL AND m.proximo_fecha <= DATE_ADD(CURDATE(), INTERVAL 7 DAY) THEN 'proximo'
                WHEN m.proximo_km IS NOT NULL AND v.kilometraje_actual >= m.proximo_km THEN 'vencido'
                WHEN m.proximo_km IS NOT NULL AND v.kilometraje_actual >= (m.proximo_km - 500) THEN 'proximo'
              END AS nivel_alerta
         FROM mantenimientos m
         JOIN vehiculos v ON v.id = m.vehiculo_id
         WHERE m.estado = 'completado'
           AND (
             (m.proximo_fecha IS NOT NULL AND m.proximo_fecha <= DATE_ADD(CURDATE(), INTERVAL 7 DAY))
             OR (m.proximo_km IS NOT NULL AND v.kilometraje_actual >= (m.proximo_km - 500))
           )
         ORDER BY
           CASE WHEN m.proximo_fecha < CURDATE() OR v.kilometraje_actual >= m.proximo_km THEN 0 ELSE 1 END,
           m.proximo_fecha ASC`
    );

    res.json(rows);
  } catch (err) {
    console.error('mantenimientos.alertas:', err.message);
    res.status(500).json({ error: 'Error obteniendo alertas' });
  }
};

/* ── GET /api/mantenimientos/proximos ── */
exports.proximos = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT v.id AS vehiculo_id, v.placa, v.kilometraje_actual,
             pm.id AS prog_id, pm.tipo_mantenimiento, pm.descripcion, pm.cada_km,
             pm.ultimo_km_realizado,
             (pm.ultimo_km_realizado + pm.cada_km) AS proximo_km,
             GREATEST(0, (pm.ultimo_km_realizado + pm.cada_km) - v.kilometraje_actual) AS km_restantes
      FROM programacion_mantenimiento pm
      JOIN vehiculos v ON v.id = pm.vehiculo_id
      WHERE v.activo = 1 AND pm.activo = 1
      ORDER BY km_restantes ASC, v.placa ASC`);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── POST /api/mantenimientos ── */
exports.create = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { vehiculo_id, tipo, descripcion, kilometraje, costo, proveedor, fecha, proximo_km, proximo_fecha, estado, programacion_id, registrar_en_caja, metodo_pago } = req.body;
    if (!vehiculo_id || !tipo || !descripcion || !fecha) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'vehiculo_id, tipo, descripcion y fecha son obligatorios' });
    }

    // Si viene programacion_id, calcular proximo_km automáticamente
    let proxKm = proximo_km || null;
    if (programacion_id && kilometraje) {
      const [[prog]] = await conn.query('SELECT cada_km FROM programacion_mantenimiento WHERE id = ?', [programacion_id]);
      if (prog) proxKm = Number(kilometraje) + prog.cada_km;
    }

    const costoNum = Number(costo) || 0;

    const [result] = await conn.query(
      `INSERT INTO mantenimientos (vehiculo_id, tipo, descripcion, kilometraje, costo, proveedor, fecha, proximo_km, proximo_fecha, estado, registrado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [vehiculo_id, tipo, descripcion, kilometraje || null, costoNum, proveedor || null, fecha, proxKm, proximo_fecha || null, estado || 'completado', req.user.id]
    );

    // Actualizar kilometraje del vehículo si viene
    if (kilometraje) {
      await conn.query(
        `UPDATE vehiculos SET kilometraje_actual = GREATEST(kilometraje_actual, ?) WHERE id = ?`,
        [kilometraje, vehiculo_id]
      );
    }

    // Si viene programacion_id, actualizar ultimo_km_realizado para recalcular próximo
    if (programacion_id && kilometraje) {
      await conn.query(
        `UPDATE programacion_mantenimiento SET ultimo_km_realizado = ?, ultimo_mantenimiento_id = ? WHERE id = ?`,
        [kilometraje, result.insertId, programacion_id]
      );
    }

    // Registrar egreso en caja si se solicitó
    if (registrar_en_caja && costoNum > 0) {
      // Validar método de pago contra config dinámica
      const [[metodoValido]] = await conn.query(
        'SELECT nombre FROM metodos_pago_config WHERE nombre = ? AND activo = 1', [metodo_pago]
      );
      if (!metodoValido) {
        await conn.rollback(); conn.release();
        return res.status(400).json({ error: 'Método de pago inválido o inactivo' });
      }

      const [[caja]] = await conn.query(
        "SELECT id FROM cajas WHERE estado IN ('abierta','reabierta') ORDER BY fecha DESC LIMIT 1 FOR UPDATE"
      );
      if (!caja) {
        await conn.rollback(); conn.release();
        return res.status(400).json({ error: 'No hay caja abierta para registrar el gasto' });
      }

      const [[veh]] = await conn.query('SELECT placa FROM vehiculos WHERE id = ?', [vehiculo_id]);
      const placa = veh ? veh.placa : vehiculo_id;

      const { getCategoriaId } = require('../helpers/categoriaCaja');
      const catGasto = await getCategoriaId('Gasto operativo', conn);
      await conn.query(
        `INSERT INTO caja_movimientos (caja_id, tipo, metodo_pago, monto, descripcion, registrado_por, mantenimiento_id, categoria_id)
         VALUES (?, 'egreso', ?, ?, ?, ?, ?, ?)`,
        [caja.id, metodo_pago, costoNum, `Mantenimiento ${placa}: ${descripcion}`, req.user.id, result.insertId, catGasto]
      );
    }

    await conn.commit();
    conn.release();

    logAudit(req, { modulo: 'mantenimientos', accion: 'crear', tabla: 'mantenimientos', registro_id: result.insertId, detalle: { vehiculo_id, tipo, descripcion } });
    res.status(201).json({ id: result.insertId, message: 'Mantenimiento registrado' });
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    console.error('mantenimientos.create:', err.message);
    res.status(500).json({ error: 'Error registrando mantenimiento' });
  }
};

/* ── PUT /api/mantenimientos/:id ── */
exports.update = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { vehiculo_id, tipo, descripcion, kilometraje, costo, proveedor, fecha, proximo_km, proximo_fecha, estado, programacion_id } = req.body;

    await conn.beginTransaction();

    await conn.query(
      `UPDATE mantenimientos SET vehiculo_id=?, tipo=?, descripcion=?, kilometraje=?, costo=?, proveedor=?, fecha=?, proximo_km=?, proximo_fecha=?, estado=?
       WHERE id = ?`,
      [vehiculo_id, tipo, descripcion, kilometraje || null, costo || 0, proveedor || null, fecha, proximo_km || null, proximo_fecha || null, estado || 'completado', req.params.id]
    );

    if (kilometraje && vehiculo_id) {
      await conn.query(
        `UPDATE vehiculos SET kilometraje_actual = GREATEST(kilometraje_actual, ?) WHERE id = ?`,
        [kilometraje, vehiculo_id]
      );
    }

    // Sincronizar programación si aplica
    if (programacion_id && kilometraje) {
      const [[prog]] = await conn.query('SELECT cada_km FROM programacion_mantenimiento WHERE id = ?', [programacion_id]);
      if (prog) {
        await conn.query(
          'UPDATE programacion_mantenimiento SET ultimo_km_realizado = ?, ultimo_mantenimiento_id = ? WHERE id = ?',
          [kilometraje, req.params.id, programacion_id]
        );
      }
    }

    await conn.commit();
    conn.release();
    logAudit(req, { modulo: 'mantenimientos', accion: 'editar', tabla: 'mantenimientos', registro_id: Number(req.params.id), detalle: { tipo, descripcion } });
    res.json({ message: 'Mantenimiento actualizado' });
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    console.error('mantenimientos.update:', err.message);
    res.status(500).json({ error: 'Error actualizando mantenimiento' });
  }
};

/* ── DELETE /api/mantenimientos/:id ── */
exports.remove = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Verificar si tiene movimiento en caja y si esa caja ya está cerrada
    const [[movCaja]] = await conn.query(
      `SELECT cm.id, ca.estado AS caja_estado
         FROM caja_movimientos cm
         JOIN cajas ca ON ca.id = cm.caja_id
        WHERE cm.mantenimiento_id = ?
        LIMIT 1`,
      [req.params.id]
    );

    if (movCaja && movCaja.caja_estado === 'cerrada') {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'No se puede eliminar: el gasto está en una caja ya cerrada' });
    }

    // Anular movimiento de caja vinculado (soft delete para auditoría)
    await conn.query(
      'UPDATE caja_movimientos SET anulado = 1, anulado_por = ?, anulado_en = NOW(), mantenimiento_id = NULL WHERE mantenimiento_id = ? AND anulado = 0',
      [req.user.id, req.params.id]
    );

    // Limpiar FK en programacion_mantenimiento antes de eliminar
    await conn.query(
      'UPDATE programacion_mantenimiento SET ultimo_mantenimiento_id = NULL WHERE ultimo_mantenimiento_id = ?',
      [req.params.id]
    );

    await conn.query('DELETE FROM mantenimientos WHERE id = ?', [req.params.id]);

    await conn.commit();
    conn.release();
    logAudit(req, { modulo: 'mantenimientos', accion: 'eliminar', tabla: 'mantenimientos', registro_id: Number(req.params.id) });
    res.json({ message: 'Mantenimiento eliminado' });
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    console.error('mantenimientos.remove:', err.message);
    res.status(500).json({ error: 'Error eliminando mantenimiento' });
  }
};
