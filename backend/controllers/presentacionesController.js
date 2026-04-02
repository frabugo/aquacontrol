// controllers/presentacionesController.js
const db = require('../db');
const { parsePagination, paginatedResponse } = require('../helpers/paginate');

/* ── Mapeo estado → columna stock ── */
const ESTADO_COL = {
  lleno:         'stock_llenos',
  vacio:         'stock_vacios',
  roto:          'stock_rotos',
  en_lavado:     'stock_en_lavado',
  en_reparacion: 'stock_en_reparacion',
  perdido:       'stock_perdidos',
  baja:          'stock_baja',
};

/* ── Transiciones automáticas por tipo ── */
function getTransicion(tipo, estado_origen) {
  switch (tipo) {
    case 'rotura':           return { decr: ESTADO_COL[estado_origen] ?? 'stock_llenos', incr: 'stock_rotos',         eOrigen: estado_origen ?? 'lleno', eDestino: 'roto' };
    case 'baja':             return { decr: 'stock_rotos',          incr: 'stock_baja',           eOrigen: 'roto',           eDestino: 'baja' };
    case 'reparacion_inicio':return { decr: 'stock_rotos',          incr: 'stock_en_reparacion',  eOrigen: 'roto',           eDestino: 'en_reparacion' };
    case 'reparacion_fin':   return { decr: 'stock_en_reparacion',  incr: 'stock_vacios',         eOrigen: 'en_reparacion',  eDestino: 'vacio' };
    case 'lavado_inicio':    return { decr: 'stock_vacios',         incr: 'stock_en_lavado',      eOrigen: 'vacio',          eDestino: 'en_lavado' };
    case 'lavado_fin':       return { decr: 'stock_en_lavado',      incr: 'stock_vacios',         eOrigen: 'en_lavado',      eDestino: 'vacio' };
    case 'compra_empresa':   return { decr: null,                   incr: 'stock_en_lavado',      eOrigen: null,             eDestino: 'en_lavado' };
    case 'perdida':          return { decr: ESTADO_COL[estado_origen] ?? 'stock_vacios', incr: 'stock_perdidos',       eOrigen: estado_origen ?? 'vacio', eDestino: 'perdido' };
    case 'llenado':          return { decr: 'stock_vacios',         incr: 'stock_llenos',         eOrigen: 'vacio',          eDestino: 'lleno' };
    default:                 return null; // ajuste — se maneja por separado
  }
}

/* ── GET /api/presentaciones ── */
exports.list = async (req, res) => {
  try {
    const q            = (req.query.q || '').trim();
    const activo       = req.query.activo;
    const es_retornable = req.query.es_retornable;
    const es_producto_final = req.query.es_producto_final;
    const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 50 });

    const conds  = [];
    const params = [];
    if (q)             { conds.push('nombre LIKE ?');          params.push(`%${q}%`); }
    if (activo   != null) { conds.push('activo = ?');          params.push(Number(activo)); }
    if (es_retornable != null) { conds.push('es_retornable = ?'); params.push(Number(es_retornable)); }
    if (es_producto_final != null) { conds.push('es_producto_final = ?'); params.push(Number(es_producto_final)); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM presentaciones ${where}`, params);
    const [rows]        = await db.query(
      `SELECT * FROM presentaciones ${where} ORDER BY es_retornable DESC, nombre ASC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json(paginatedResponse(rows, total, page, limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/presentaciones/:id ── */
exports.getOne = async (req, res) => {
  try {
    const [[row]] = await db.query('SELECT * FROM presentaciones WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Presentación no encontrada' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── POST /api/presentaciones ── */
exports.create = async (req, res) => {
  try {
    const {
      nombre, descripcion, tipo = 'agua', unidad = 'unidad',
      precio_base = 0, stock_minimo = 0, es_retornable = 0, requiere_lavado = 0,
      es_producto_final = 0, stock_llenos = 0, stock_vacios = 0,
    } = req.body;

    if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es requerido' });

    const finalFlag = Number(es_producto_final) ? 1 : 0;
    const retornableFlag = finalFlag ? 0 : (Number(es_retornable) ? 1 : 0);

    const [result] = await db.query(
      `INSERT INTO presentaciones
         (nombre, descripcion, tipo, unidad, precio_base, stock_minimo,
          es_retornable, requiere_lavado, es_producto_final, stock_llenos, stock_vacios)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nombre.trim(), descripcion?.trim() || null, tipo, unidad,
        Number(precio_base), Number(stock_minimo),
        retornableFlag,
        retornableFlag && Number(requiere_lavado) ? 1 : 0,
        finalFlag,
        retornableFlag ? Number(stock_llenos) : 0,
        retornableFlag ? Number(stock_vacios) : 0,
      ]
    );

    const [[row]] = await db.query('SELECT * FROM presentaciones WHERE id = ?', [result.insertId]);
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── PUT /api/presentaciones/:id ── */
exports.update = async (req, res) => {
  try {
    const [[check]] = await db.query('SELECT es_sistema FROM presentaciones WHERE id = ?', [req.params.id]);
    if (check?.es_sistema) return res.status(403).json({ error: 'Este producto es del sistema y no se puede modificar' });
  } catch (e) { return res.status(500).json({ error: e.message }); }
  try {
    const {
      nombre, descripcion, tipo = 'agua', unidad = 'unidad',
      precio_base = 0, stock_minimo = 0, es_retornable = 0, requiere_lavado = 0,
      es_producto_final = 0, activo = 1,
    } = req.body;

    if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es requerido' });

    const finalFlag = Number(es_producto_final) ? 1 : 0;
    const retornableFlag = finalFlag ? 0 : (Number(es_retornable) ? 1 : 0);

    const [result] = await db.query(
      `UPDATE presentaciones SET
         nombre=?, descripcion=?, tipo=?, unidad=?, precio_base=?,
         stock_minimo=?, es_retornable=?, requiere_lavado=?, es_producto_final=?, activo=?
       WHERE id=?`,
      [
        nombre.trim(), descripcion?.trim() || null, tipo, unidad,
        Number(precio_base), Number(stock_minimo),
        retornableFlag,
        retornableFlag && Number(requiere_lavado) ? 1 : 0,
        finalFlag,
        Number(activo) ? 1 : 0,
        req.params.id,
      ]
    );

    if (result.affectedRows === 0) return res.status(404).json({ error: 'Presentación no encontrada' });
    const [[row]] = await db.query('SELECT * FROM presentaciones WHERE id = ?', [req.params.id]);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── DELETE /api/presentaciones/:id (soft delete) ── */
exports.deactivate = async (req, res) => {
  try {
    const [[check]] = await db.query('SELECT es_sistema FROM presentaciones WHERE id = ?', [req.params.id]);
    if (check?.es_sistema) return res.status(403).json({ error: 'Este producto es del sistema y no se puede desactivar' });
  } catch (e) { return res.status(500).json({ error: e.message }); }
  try {
    const [result] = await db.query(
      'UPDATE presentaciones SET activo = 0 WHERE id = ? AND activo = 1',
      [req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Presentación no encontrada' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/presentaciones/:id/trazabilidad ── */
exports.trazabilidad = async (req, res) => {
  try {
    const id = req.params.id;
    const fecha_inicio = req.query.fecha_inicio || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const fecha_fin    = req.query.fecha_fin    || new Date().toISOString().slice(0, 10);

    const [movimientos] = await db.query(
      `SELECT sm.id, sm.tipo, sm.cantidad, sm.estado_origen, sm.estado_destino,
              sm.motivo, sm.fecha_hora,
              u.nombre  AS usuario_nombre,
              c.nombre  AS cliente_nombre,
              rep.nombre AS repartidor_nombre,
              v.folio   AS venta_folio
         FROM stock_movimientos sm
         LEFT JOIN usuarios u   ON u.id   = sm.registrado_por
         LEFT JOIN clientes c   ON c.id   = sm.cliente_id
         LEFT JOIN usuarios rep ON rep.id = sm.repartidor_id
         LEFT JOIN ventas v     ON v.id   = sm.venta_id
        WHERE sm.presentacion_id = ?
          AND sm.fecha_hora >= ?
          AND sm.fecha_hora <  DATE_ADD(?, INTERVAL 1 DAY)
        ORDER BY sm.fecha_hora DESC`,
      [id, fecha_inicio, fecha_fin]
    );

    // Resumen por tipo
    const resumen = {};
    for (const m of movimientos) {
      resumen[m.tipo] = (resumen[m.tipo] || 0) + Number(m.cantidad);
    }

    res.json({ data: movimientos, resumen });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/presentaciones/:id/movimientos ── */
exports.getMovimientos = async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query);

    const [rows] = await db.query(
      `SELECT sm.*,
              u.nombre AS registrado_por_nombre
         FROM stock_movimientos sm
         LEFT JOIN usuarios u ON u.id = sm.registrado_por
         WHERE sm.presentacion_id = ?
         ORDER BY sm.fecha_hora DESC
         LIMIT ? OFFSET ?`,
      [req.params.id, limit, offset]
    );

    const [[{ total }]] = await db.query(
      'SELECT COUNT(*) AS total FROM stock_movimientos WHERE presentacion_id = ?',
      [req.params.id]
    );

    res.json(paginatedResponse(rows, total, page, limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/presentaciones/:id/kardex — Movimientos con saldos acumulados ── */
exports.kardex = async (req, res) => {
  try {
    const presId = req.params.id;
    const fecha_inicio = req.query.fecha_inicio || null;
    const fecha_fin    = req.query.fecha_fin    || null;

    const [[pres]] = await db.query(
      `SELECT id, nombre, stock_llenos, stock_vacios, stock_rotos, stock_en_lavado,
              stock_en_reparacion, stock_perdidos, stock_baja
         FROM presentaciones WHERE id = ?`, [presId]
    );
    if (!pres) return res.status(404).json({ error: 'Presentación no encontrada' });

    // Filtro de fechas
    let dateWhere = '';
    const dateParams = [];
    if (fecha_inicio) { dateWhere += ' AND sm.fecha_hora >= ?'; dateParams.push(fecha_inicio); }
    if (fecha_fin)    { dateWhere += ' AND sm.fecha_hora < DATE_ADD(?, INTERVAL 1 DAY)'; dateParams.push(fecha_fin); }

    // Movimientos filtrados (más recientes primero)
    const [rows] = await db.query(
      `SELECT sm.id, sm.tipo, sm.estado_origen, sm.estado_destino, sm.cantidad,
              sm.repartidor_id, sm.motivo, sm.fecha_hora,
              u.nombre AS registrado_por_nombre,
              rep.nombre AS repartidor_nombre
         FROM stock_movimientos sm
         LEFT JOIN usuarios u ON u.id = sm.registrado_por
         LEFT JOIN usuarios rep ON rep.id = sm.repartidor_id
         WHERE sm.presentacion_id = ?${dateWhere}
         ORDER BY sm.fecha_hora DESC, sm.id DESC
         LIMIT 200`,
      [presId, ...dateParams]
    );

    const COLS = ['lleno','vacio','roto','en_lavado','en_reparacion','perdido','baja'];
    const COL_MAP = {
      lleno: true, vacio: true, roto: true,
      en_lavado: true, en_reparacion: true, perdido: true, baja: true,
    };

    function getDeltas(m) {
      const d = {};
      COLS.forEach(c => d[c] = 0);
      if (m.estado_origen && COL_MAP[m.estado_origen]) d[m.estado_origen] -= m.cantidad;
      if (m.estado_destino && COL_MAP[m.estado_destino]) d[m.estado_destino] += m.cantidad;
      return d;
    }

    // Sumar deltas de movimientos POSTERIORES a los filtrados para calcular saldo inicial
    let afterWhere = '';
    const afterParams = [];
    if (fecha_fin) {
      afterWhere = ' AND sm.fecha_hora >= DATE_ADD(?, INTERVAL 1 DAY)';
      afterParams.push(fecha_fin);
    } else if (rows.length > 0) {
      // Sin fecha_fin: los posteriores son los que tienen fecha > primer row
      afterWhere = ' AND (sm.fecha_hora > ? OR (sm.fecha_hora = ? AND sm.id > ?))';
      afterParams.push(rows[0].fecha_hora, rows[0].fecha_hora, rows[0].id);
    }

    const afterDeltas = {};
    COLS.forEach(c => afterDeltas[c] = 0);

    if (afterWhere) {
      const [newer] = await db.query(
        `SELECT tipo, estado_origen, estado_destino, cantidad
           FROM stock_movimientos sm
           WHERE sm.presentacion_id = ?${afterWhere}`,
        [presId, ...afterParams]
      );
      for (const m of newer) {
        const d = getDeltas(m);
        COLS.forEach(c => afterDeltas[c] += d[c]);
      }
    }

    // stock_col names → COLS key
    const colKey = c => c === 'lleno' ? 'llenos' : c === 'vacio' ? 'vacios' : c === 'roto' ? 'rotos' : c === 'perdido' ? 'perdidos' : c;
    const saldos = {};
    COLS.forEach(c => saldos[c] = (Number(pres[`stock_${colKey(c)}`]) || 0) - afterDeltas[c]);

    const kardex = rows.map(m => {
      const saldo_despues = { ...saldos };
      const d = getDeltas(m);
      COLS.forEach(c => saldos[c] -= d[c]);

      return {
        id: m.id,
        fecha_hora: m.fecha_hora,
        tipo: m.tipo,
        estado_origen: m.estado_origen,
        estado_destino: m.estado_destino,
        cantidad: m.cantidad,
        motivo: m.motivo,
        registrado_por: m.registrado_por_nombre,
        repartidor: m.repartidor_nombre,
        ubicacion: m.repartidor_id ? 'repartidor' : 'planta',
        saldo: {
          llenos:        saldo_despues.lleno,
          vacios:        saldo_despues.vacio,
          rotos:         saldo_despues.roto,
          en_lavado:     saldo_despues.en_lavado,
          en_reparacion: saldo_despues.en_reparacion,
          perdidos:      saldo_despues.perdido,
          baja:          saldo_despues.baja,
        },
      };
    });

    res.json({ data: kardex, total: rows.length, stock_actual: pres });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── POST /api/presentaciones/:id/movimientos ── */
exports.registrarMovimiento = async (req, res) => {
  const { tipo, estado_origen, estado_destino, cantidad, motivo } = req.body;
  const id  = req.params.id;
  const qty = Number(cantidad);

  if (!tipo)    return res.status(400).json({ error: 'El tipo de movimiento es requerido' });
  if (!qty || qty <= 0) return res.status(400).json({ error: 'La cantidad debe ser mayor a 0' });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[pres]] = await conn.query(
      'SELECT * FROM presentaciones WHERE id = ? AND activo = 1 FOR UPDATE',
      [id]
    );
    if (!pres) {
      await conn.rollback(); conn.release();
      return res.status(404).json({ error: 'Presentación no encontrada' });
    }
    if (!pres.es_retornable && !pres.es_producto_final) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'Esta presentación no lleva control de stock retornable' });
    }

    let decr = null, incr = null, eOrig = null, eDest = null;

    if (tipo === 'ajuste') {
      // ajuste: usuario especifica col y dirección
      const col = ESTADO_COL[estado_destino];
      if (!col) { await conn.rollback(); conn.release(); return res.status(400).json({ error: 'Estado de destino inválido para ajuste' }); }
      const esReduccion = estado_origen === estado_destino; // flag de reducción
      if (esReduccion) { decr = col; eOrig = estado_destino; }
      else             { incr = col; eDest = estado_destino; }
    } else {
      const t = getTransicion(tipo, estado_origen);
      if (!t) { await conn.rollback(); conn.release(); return res.status(400).json({ error: 'Tipo de movimiento inválido' }); }
      ({ decr, incr, eOrigen: eOrig, eDestino: eDest } = t);
    }

    // Validar stock suficiente en origen
    if (decr && pres[decr] < qty) {
      await conn.rollback(); conn.release();
      return res.status(400).json({
        error: `Stock insuficiente. Disponible en "${decr.replace('stock_','')}" : ${pres[decr]}`,
      });
    }

    // Actualizar stock
    const setParts = [];
    const vals     = [];
    if (decr) { setParts.push(`${decr} = ${decr} - ?`); vals.push(qty); }
    if (incr) { setParts.push(`${incr} = ${incr} + ?`); vals.push(qty); }

    if (setParts.length > 0) {
      await conn.query(`UPDATE presentaciones SET ${setParts.join(', ')} WHERE id = ?`, [...vals, id]);
    }

    // Registrar movimiento
    await conn.query(
      `INSERT INTO stock_movimientos
         (presentacion_id, tipo, estado_origen, estado_destino, cantidad, registrado_por, motivo)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, tipo, eOrig || null, eDest || null, qty, req.user.id, motivo?.trim() || null]
    );

    await conn.commit();
    conn.release();

    const [[updated]] = await db.query('SELECT * FROM presentaciones WHERE id = ?', [id]);
    res.status(201).json(updated);
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    res.status(500).json({ error: err.message });
  }
};
