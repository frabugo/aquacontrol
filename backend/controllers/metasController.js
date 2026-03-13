// controllers/metasController.js
const db = require('../db');

/* ── GET /api/metas ── */
exports.list = async (req, res) => {
  try {
    const mes = req.query.mes || new Date().toISOString().slice(0, 7) + '-01';

    const [rows] = await db.query(
      `SELECT * FROM v_avance_metas WHERE mes = ? ORDER BY usuario_nombre`,
      [mes]
    );

    // Calcular avance y comisiones
    const data = rows.map(r => {
      const avance_pct = r.meta_soles > 0
        ? Math.round((Number(r.vendido_soles) / Number(r.meta_soles)) * 10000) / 100
        : 0;
      const comision_ganada = Number(r.vendido_soles) * (Number(r.comision_pct) / 100);
      const bono_aplica = avance_pct >= 100;
      return {
        ...r,
        avance_pct,
        comision_ganada: Math.round(comision_ganada * 100) / 100,
        bono_aplica,
      };
    });

    res.json(data);
  } catch (err) {
    console.error('metas.list:', err.message);
    res.status(500).json({ error: 'Error listando metas' });
  }
};

/* ── GET /api/metas/resumen ── */
exports.resumen = async (req, res) => {
  try {
    const mes = req.query.mes || new Date().toISOString().slice(0, 7) + '-01';

    const [rows] = await db.query(
      `SELECT * FROM v_avance_metas WHERE mes = ?`,
      [mes]
    );

    const total_metas = rows.length;
    let cumplidas = 0;
    let total_comisiones = 0;

    rows.forEach(r => {
      const avance = r.meta_soles > 0 ? Number(r.vendido_soles) / Number(r.meta_soles) : 0;
      if (avance >= 1) cumplidas++;
      total_comisiones += Number(r.vendido_soles) * (Number(r.comision_pct) / 100);
      if (avance >= 1) total_comisiones += Number(r.bono_cumplido);
    });

    res.json({
      total_metas,
      cumplidas,
      total_comisiones: Math.round(total_comisiones * 100) / 100,
    });
  } catch (err) {
    console.error('metas.resumen:', err.message);
    res.status(500).json({ error: 'Error obteniendo resumen de metas' });
  }
};

/* ── POST /api/metas ── */
exports.create = async (req, res) => {
  try {
    const { usuario_id, mes, meta_soles, meta_bidones, comision_pct, bono_cumplido } = req.body;
    if (!usuario_id || !mes || !meta_soles) {
      return res.status(400).json({ error: 'usuario_id, mes y meta_soles son obligatorios' });
    }

    const [result] = await db.query(
      `INSERT INTO metas (usuario_id, mes, meta_soles, meta_bidones, comision_pct, bono_cumplido, creado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [usuario_id, mes, meta_soles, meta_bidones || null, comision_pct || 0, bono_cumplido || 0, req.user.id]
    );

    res.status(201).json({ id: result.insertId, message: 'Meta creada' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe una meta para ese usuario en ese mes' });
    }
    console.error('metas.create:', err.message);
    res.status(500).json({ error: 'Error creando meta' });
  }
};

/* ── PUT /api/metas/:id ── */
exports.update = async (req, res) => {
  try {
    const { meta_soles, meta_bidones, comision_pct, bono_cumplido } = req.body;

    await db.query(
      `UPDATE metas SET meta_soles = ?, meta_bidones = ?, comision_pct = ?, bono_cumplido = ?
       WHERE id = ?`,
      [meta_soles, meta_bidones || null, comision_pct || 0, bono_cumplido || 0, req.params.id]
    );

    res.json({ message: 'Meta actualizada' });
  } catch (err) {
    console.error('metas.update:', err.message);
    res.status(500).json({ error: 'Error actualizando meta' });
  }
};

/* ── DELETE /api/metas/:id ── */
exports.remove = async (req, res) => {
  try {
    await db.query('DELETE FROM metas WHERE id = ?', [req.params.id]);
    res.json({ message: 'Meta eliminada' });
  } catch (err) {
    console.error('metas.remove:', err.message);
    res.status(500).json({ error: 'Error eliminando meta' });
  }
};
