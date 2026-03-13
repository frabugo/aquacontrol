// controllers/calidadController.js
const db = require('../db');
const { parsePagination, paginatedResponse } = require('../helpers/paginate');

/* ── Helper: evaluar cumplimiento automáticamente ── */
async function evaluarCumple({ ph, cloro_residual, tds, turbidez, temperatura }) {
  const [params] = await db.query('SELECT * FROM calidad_parametros');
  for (const p of params) {
    const valor = { ph, cloro_residual, tds, turbidez, temperatura }[p.parametro];
    if (valor == null) continue;
    const v = Number(valor);
    if (p.min_valor != null && v < Number(p.min_valor)) return 0;
    if (p.max_valor != null && v > Number(p.max_valor)) return 0;
  }
  return 1;
}

/* ── GET /api/calidad ── */
exports.list = async (req, res) => {
  try {
    const { fecha_inicio, fecha_fin, punto_muestreo, cumple } = req.query;
    const { page, limit, offset } = parsePagination(req.query);

    const conds = [], params = [];
    if (fecha_inicio)   { conds.push('DATE(cc.fecha) >= ?');    params.push(fecha_inicio); }
    if (fecha_fin)      { conds.push('DATE(cc.fecha) <= ?');    params.push(fecha_fin); }
    if (punto_muestreo) { conds.push('cc.punto_muestreo = ?'); params.push(punto_muestreo); }
    if (cumple !== undefined && cumple !== '') { conds.push('cc.cumple = ?'); params.push(cumple); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM controles_calidad cc ${where}`, params
    );

    const [rows] = await db.query(
      `SELECT cc.*, u.nombre AS registrado_nombre
         FROM controles_calidad cc
         LEFT JOIN usuarios u ON u.id = cc.registrado_por
         ${where}
         ORDER BY cc.fecha DESC
         LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json(paginatedResponse(rows, total, page, limit));
  } catch (err) {
    console.error('calidad.list:', err.message);
    res.status(500).json({ error: 'Error listando controles de calidad' });
  }
};

/* ── GET /api/calidad/resumen ── */
exports.resumen = async (req, res) => {
  try {
    const dias = parseInt(req.query.dias) || 30;

    const [[stats]] = await db.query(
      `SELECT
         COUNT(*) AS total_controles,
         ROUND(AVG(cc.cumple) * 100, 1) AS pct_cumplimiento,
         SUM(CASE WHEN cc.cumple = 0 THEN 1 ELSE 0 END) AS alertas
       FROM controles_calidad cc
       WHERE cc.fecha >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [dias]
    );

    const [porPunto] = await db.query(
      `SELECT cc.punto_muestreo,
              COUNT(*) AS controles,
              ROUND(AVG(cc.ph), 2) AS avg_ph,
              ROUND(AVG(cc.cloro_residual), 3) AS avg_cloro,
              ROUND(AVG(cc.tds), 0) AS avg_tds,
              ROUND(AVG(cc.turbidez), 2) AS avg_turbidez,
              ROUND(AVG(cc.temperatura), 1) AS avg_temp
         FROM controles_calidad cc
         WHERE cc.fecha >= DATE_SUB(NOW(), INTERVAL ? DAY)
         GROUP BY cc.punto_muestreo`,
      [dias]
    );

    res.json({ ...stats, por_punto: porPunto });
  } catch (err) {
    console.error('calidad.resumen:', err.message);
    res.status(500).json({ error: 'Error obteniendo resumen de calidad' });
  }
};

/* ── GET /api/calidad/tendencia ── */
exports.tendencia = async (req, res) => {
  try {
    const dias = parseInt(req.query.dias) || 30;

    const [rows] = await db.query(
      `SELECT DATE(cc.fecha) AS dia,
              ROUND(AVG(cc.ph), 2) AS ph,
              ROUND(AVG(cc.cloro_residual), 3) AS cloro,
              ROUND(AVG(cc.tds), 0) AS tds,
              ROUND(AVG(cc.turbidez), 2) AS turbidez,
              ROUND(AVG(cc.temperatura), 1) AS temp
         FROM controles_calidad cc
         WHERE cc.fecha >= DATE_SUB(NOW(), INTERVAL ? DAY)
         GROUP BY DATE(cc.fecha)
         ORDER BY dia ASC`,
      [dias]
    );

    res.json(rows);
  } catch (err) {
    console.error('calidad.tendencia:', err.message);
    res.status(500).json({ error: 'Error obteniendo tendencia de calidad' });
  }
};

/* ── GET /api/calidad/parametros ── */
exports.parametros = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM calidad_parametros ORDER BY id');
    res.json(rows);
  } catch (err) {
    console.error('calidad.parametros:', err.message);
    res.status(500).json({ error: 'Error obteniendo parámetros' });
  }
};

/* ── PUT /api/calidad/parametros ── */
exports.updateParametros = async (req, res) => {
  try {
    const { parametros } = req.body; // array de { parametro, min_valor, max_valor }
    if (!Array.isArray(parametros) || parametros.length === 0) {
      return res.status(400).json({ error: 'Se espera un array de parámetros' });
    }

    // Single UPDATE with CASE (instead of N queries)
    const nombres = parametros.map(p => p.parametro);
    const placeholders = nombres.map(() => '?').join(',');
    let minCase = 'CASE parametro';
    let maxCase = 'CASE parametro';
    const params = [];
    for (const p of parametros) {
      minCase += ' WHEN ? THEN ?';
      maxCase += ' WHEN ? THEN ?';
      params.push(p.parametro, p.min_valor);
    }
    for (const p of parametros) {
      params.push(p.parametro, p.max_valor);
    }
    minCase += ' END';
    maxCase += ' END';

    await db.query(
      `UPDATE calidad_parametros SET min_valor = ${minCase}, max_valor = ${maxCase} WHERE parametro IN (${placeholders})`,
      [...params, ...nombres]
    );

    res.json({ message: 'Parámetros actualizados' });
  } catch (err) {
    console.error('calidad.updateParametros:', err.message);
    res.status(500).json({ error: 'Error actualizando parámetros' });
  }
};

/* ── POST /api/calidad ── */
exports.create = async (req, res) => {
  try {
    const { fecha, punto_muestreo, ph, cloro_residual, tds, turbidez, temperatura, observaciones } = req.body;
    if (!punto_muestreo) {
      return res.status(400).json({ error: 'punto_muestreo es obligatorio' });
    }

    const cumple = await evaluarCumple({ ph, cloro_residual, tds, turbidez, temperatura });

    const [result] = await db.query(
      `INSERT INTO controles_calidad (fecha, punto_muestreo, ph, cloro_residual, tds, turbidez, temperatura, observaciones, cumple, registrado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [fecha || new Date(), punto_muestreo, ph || null, cloro_residual || null, tds || null, turbidez || null, temperatura || null, observaciones || null, cumple, req.user.id]
    );

    res.status(201).json({ id: result.insertId, cumple, message: 'Control registrado' });
  } catch (err) {
    console.error('calidad.create:', err.message);
    res.status(500).json({ error: 'Error registrando control de calidad' });
  }
};

/* ── PUT /api/calidad/:id ── */
exports.update = async (req, res) => {
  try {
    const { fecha, punto_muestreo, ph, cloro_residual, tds, turbidez, temperatura, observaciones } = req.body;

    const cumple = await evaluarCumple({ ph, cloro_residual, tds, turbidez, temperatura });

    await db.query(
      `UPDATE controles_calidad SET fecha=?, punto_muestreo=?, ph=?, cloro_residual=?, tds=?, turbidez=?, temperatura=?, observaciones=?, cumple=?
       WHERE id = ?`,
      [fecha, punto_muestreo, ph || null, cloro_residual || null, tds || null, turbidez || null, temperatura || null, observaciones || null, cumple, req.params.id]
    );

    res.json({ cumple, message: 'Control actualizado' });
  } catch (err) {
    console.error('calidad.update:', err.message);
    res.status(500).json({ error: 'Error actualizando control' });
  }
};

/* ── DELETE /api/calidad/:id ── */
exports.remove = async (req, res) => {
  try {
    await db.query('DELETE FROM controles_calidad WHERE id = ?', [req.params.id]);
    res.json({ message: 'Control eliminado' });
  } catch (err) {
    console.error('calidad.remove:', err.message);
    res.status(500).json({ error: 'Error eliminando control' });
  }
};
