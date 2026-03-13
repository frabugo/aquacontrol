// controllers/programacionMantController.js
const db = require('../db');

const CATEGORIAS = ['motor', 'frenos', 'llantas', 'electrico', 'transmision', 'suspension', 'carroceria', 'general'];

/* ── GET /api/programacion-mantenimiento ── listar por vehiculo_id */
exports.list = async (req, res) => {
  try {
    const { vehiculo_id } = req.query;
    const conds = ['pm.activo = 1'];
    const params = [];
    if (vehiculo_id) { conds.push('pm.vehiculo_id = ?'); params.push(vehiculo_id); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const [rows] = await db.query(
      `SELECT pm.*,
              v.placa, v.kilometraje_actual,
              (pm.ultimo_km_realizado + pm.cada_km) AS proximo_km,
              (pm.ultimo_km_realizado + pm.cada_km) - v.kilometraje_actual AS km_restante
         FROM programacion_mantenimiento pm
         JOIN vehiculos v ON v.id = pm.vehiculo_id
         ${where}
         ORDER BY ((pm.ultimo_km_realizado + pm.cada_km) - v.kilometraje_actual) ASC`,
      params
    );
    res.json({ data: rows });
  } catch (err) {
    console.error('programacionMant.list:', err.message);
    res.status(500).json({ error: 'Error listando programaciones' });
  }
};

/* ── GET /api/programacion-mantenimiento/alertas ── programaciones próximas/vencidas */
exports.alertas = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT pm.id, pm.vehiculo_id, pm.tipo_mantenimiento, pm.cada_km, pm.categoria,
              pm.ultimo_km_realizado,
              (pm.ultimo_km_realizado + pm.cada_km) AS proximo_km,
              v.placa, v.kilometraje_actual,
              (pm.ultimo_km_realizado + pm.cada_km) - v.kilometraje_actual AS km_restante,
              CASE
                WHEN v.kilometraje_actual >= (pm.ultimo_km_realizado + pm.cada_km) THEN 'vencido'
                ELSE 'proximo'
              END AS nivel_alerta
         FROM programacion_mantenimiento pm
         JOIN vehiculos v ON v.id = pm.vehiculo_id
         WHERE pm.activo = 1
           AND v.kilometraje_actual >= (pm.ultimo_km_realizado + pm.cada_km - 500)
         ORDER BY
           CASE WHEN v.kilometraje_actual >= (pm.ultimo_km_realizado + pm.cada_km) THEN 0 ELSE 1 END,
           ((pm.ultimo_km_realizado + pm.cada_km) - v.kilometraje_actual) ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error('programacionMant.alertas:', err.message);
    res.status(500).json({ error: 'Error obteniendo alertas' });
  }
};

/* ── GET /api/programacion-mantenimiento/alertas-todas ── alertas unificadas (programaciones + historial) */
exports.alertasUnificadas = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT 'programacion' AS origen, pm.id, pm.tipo_mantenimiento AS tipo,
              pm.categoria, v.placa, v.id AS vehiculo_id,
              (pm.ultimo_km_realizado + pm.cada_km) AS proximo_km,
              (pm.ultimo_km_realizado + pm.cada_km) - v.kilometraje_actual AS km_restante,
              NULL AS proximo_fecha,
              CASE WHEN v.kilometraje_actual >= (pm.ultimo_km_realizado + pm.cada_km) THEN 'vencido' ELSE 'proximo' END AS nivel
         FROM programacion_mantenimiento pm
         JOIN vehiculos v ON v.id = pm.vehiculo_id
        WHERE pm.activo = 1
          AND v.kilometraje_actual >= (pm.ultimo_km_realizado + pm.cada_km - 500)

       UNION ALL

       SELECT 'historial' AS origen, m.id, m.tipo, NULL AS categoria, v.placa, v.id AS vehiculo_id,
              m.proximo_km, (m.proximo_km - v.kilometraje_actual) AS km_restante,
              m.proximo_fecha,
              CASE
                WHEN m.proximo_fecha IS NOT NULL AND m.proximo_fecha < CURDATE() THEN 'vencido'
                WHEN m.proximo_km IS NOT NULL AND v.kilometraje_actual >= m.proximo_km THEN 'vencido'
                ELSE 'proximo'
              END AS nivel
         FROM mantenimientos m
         JOIN vehiculos v ON v.id = m.vehiculo_id
        WHERE m.estado = 'completado'
          AND ((m.proximo_fecha IS NOT NULL AND m.proximo_fecha <= DATE_ADD(CURDATE(), INTERVAL 7 DAY))
           OR  (m.proximo_km IS NOT NULL AND v.kilometraje_actual >= (m.proximo_km - 500)))

       ORDER BY CASE WHEN nivel = 'vencido' THEN 0 ELSE 1 END, km_restante ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error('programacionMant.alertasUnificadas:', err.message);
    res.status(500).json({ error: 'Error obteniendo alertas unificadas' });
  }
};

/* ── POST /api/programacion-mantenimiento ── crear programación */
exports.create = async (req, res) => {
  try {
    const { vehiculo_id, tipo_mantenimiento, cada_km, descripcion, categoria } = req.body;
    if (!vehiculo_id || !tipo_mantenimiento || !cada_km) {
      return res.status(400).json({ error: 'vehiculo_id, tipo_mantenimiento y cada_km son obligatorios' });
    }

    // ultimo_km_realizado = km actual del vehículo (se parte desde el estado actual)
    const [[veh]] = await db.query('SELECT kilometraje_actual FROM vehiculos WHERE id = ?', [vehiculo_id]);
    if (!veh) return res.status(404).json({ error: 'Vehiculo no encontrado' });

    const [result] = await db.query(
      `INSERT INTO programacion_mantenimiento (vehiculo_id, tipo_mantenimiento, cada_km, descripcion, categoria, ultimo_km_realizado, creado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [vehiculo_id, tipo_mantenimiento, cada_km, descripcion || null, categoria || 'general', veh.kilometraje_actual, req.user.id]
    );

    res.status(201).json({ id: result.insertId, message: 'Programacion creada' });
  } catch (err) {
    console.error('programacionMant.create:', err.message);
    res.status(500).json({ error: 'Error creando programacion' });
  }
};

/* ── PUT /api/programacion-mantenimiento/:id ── editar */
exports.update = async (req, res) => {
  try {
    const { cada_km, descripcion, activo, tipo_mantenimiento, categoria } = req.body;

    const sets = [];
    const params = [];
    if (cada_km !== undefined)            { sets.push('cada_km = ?');            params.push(cada_km); }
    if (descripcion !== undefined)        { sets.push('descripcion = ?');        params.push(descripcion || null); }
    if (activo !== undefined)             { sets.push('activo = ?');             params.push(activo); }
    if (tipo_mantenimiento !== undefined) { sets.push('tipo_mantenimiento = ?'); params.push(tipo_mantenimiento); }
    if (categoria !== undefined)          { sets.push('categoria = ?');          params.push(categoria); }

    if (sets.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

    params.push(req.params.id);
    await db.query(`UPDATE programacion_mantenimiento SET ${sets.join(', ')} WHERE id = ?`, params);
    res.json({ message: 'Programacion actualizada' });
  } catch (err) {
    console.error('programacionMant.update:', err.message);
    res.status(500).json({ error: 'Error actualizando programacion' });
  }
};

/* ── DELETE /api/programacion-mantenimiento/:id ── soft delete */
exports.remove = async (req, res) => {
  try {
    await db.query('UPDATE programacion_mantenimiento SET activo = 0 WHERE id = ?', [req.params.id]);
    res.json({ message: 'Programacion desactivada' });
  } catch (err) {
    console.error('programacionMant.remove:', err.message);
    res.status(500).json({ error: 'Error eliminando programacion' });
  }
};
