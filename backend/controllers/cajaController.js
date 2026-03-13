// controllers/cajaController.js
const db = require('../db');
const logAudit = require('../helpers/audit');
const { parsePagination, paginatedResponse } = require('../helpers/paginate');

/* ── Helper: SELECT completo con agregados dinámicos ── */
async function fetchCajaFull(whereClause, params, optConn) {
  const q = optConn || db;
  // 1. Basic caja data + origin totals
  const [[caja]] = await q.query(
    `SELECT ca.*,
            ua.nombre AS abierta_por_nombre,
            uc.nombre AS cerrada_por_nombre,
            -- Totales por origen: directo
            COALESCE(SUM(CASE WHEN cm.origen='directo' AND cm.tipo IN ('ingreso','abono_cliente') THEN cm.monto END), 0) AS ing_directo,
            COALESCE(SUM(CASE WHEN cm.origen='directo' AND cm.tipo = 'egreso' THEN cm.monto END), 0) AS egr_directo,
            -- Totales por origen: repartidor entregado
            COALESCE(SUM(CASE WHEN cm.origen='repartidor' AND cm.estado_entrega='entregado' AND cm.tipo IN ('ingreso','abono_cliente') THEN cm.monto END), 0) AS ing_repartidor_entregado,
            COALESCE(SUM(CASE WHEN cm.origen='repartidor' AND cm.estado_entrega='entregado' AND cm.tipo = 'egreso' THEN cm.monto END), 0) AS egr_repartidor_entregado,
            -- Totales por origen: repartidor pendiente
            COALESCE(SUM(CASE WHEN cm.origen='repartidor' AND cm.estado_entrega='pendiente' AND cm.tipo IN ('ingreso','abono_cliente') THEN cm.monto END), 0) AS ing_repartidor_pendiente,
            COALESCE(SUM(CASE WHEN cm.origen='repartidor' AND cm.estado_entrega='pendiente' AND cm.tipo = 'egreso' THEN cm.monto END), 0) AS egr_repartidor_pendiente
       FROM cajas ca
       LEFT JOIN usuarios ua           ON ua.id = ca.abierta_por
       LEFT JOIN usuarios uc           ON uc.id = ca.cerrada_por
       LEFT JOIN caja_movimientos cm   ON cm.caja_id = ca.id AND cm.anulado = 0
      WHERE ${whereClause}
      GROUP BY ca.id`,
    params
  );
  if (!caja) return null;

  // 2. Dynamic per-method totals from caja_movimientos
  const [metodoRows] = await q.query(
    `SELECT cm.metodo_pago,
            COALESCE(SUM(CASE WHEN cm.tipo IN ('ingreso','abono_cliente') AND (cm.origen='directo' OR cm.estado_entrega='entregado') THEN cm.monto END), 0) AS ing,
            COALESCE(SUM(CASE WHEN cm.tipo = 'egreso' AND (cm.origen='directo' OR cm.estado_entrega='entregado') THEN cm.monto END), 0) AS egr
       FROM caja_movimientos cm
      WHERE cm.caja_id = ? AND cm.anulado = 0
      GROUP BY cm.metodo_pago`,
    [caja.id]
  );
  const metodos_movimientos = {};
  for (const r of metodoRows) {
    metodos_movimientos[r.metodo_pago] = { ing: Number(r.ing), egr: Number(r.egr) };
  }

  // 3. caja_saldos
  const [saldosRows] = await q.query(
    'SELECT * FROM caja_saldos WHERE caja_id = ?',
    [caja.id]
  );
  const saldos_map = {};
  for (const s of saldosRows) {
    saldos_map[s.metodo_pago] = { saldo_ini: Number(s.saldo_ini), saldo_fin: s.saldo_fin != null ? Number(s.saldo_fin) : null };
  }

  // 4. Backward compat: keep legacy ing_efectivo etc.
  const legacyMethods = ['efectivo', 'transferencia', 'tarjeta', 'credito'];
  for (const m of legacyMethods) {
    const mm = metodos_movimientos[m] || { ing: 0, egr: 0 };
    caja[`ing_${m}`] = mm.ing;
    if (m !== 'credito') caja[`egr_${m}`] = mm.egr;
  }

  // Calcular totales agrupados
  const totales_directo = Number(caja.ing_directo) - Number(caja.egr_directo);
  const totales_repartidores_entregado = Number(caja.ing_repartidor_entregado) - Number(caja.egr_repartidor_entregado);
  const totales_repartidores_pendiente = Number(caja.ing_repartidor_pendiente) - Number(caja.egr_repartidor_pendiente);
  const total_real = totales_directo + totales_repartidores_entregado;
  const total_proyectado = total_real + totales_repartidores_pendiente;

  return {
    ...caja,
    metodos_movimientos,
    saldos_map,
    totales_directo,
    totales_repartidores_entregado,
    totales_repartidores_pendiente,
    total_real,
    total_proyectado
  };
}

/* ── GET /api/caja — última caja (abierta, o última cerrada para poder reabrir) ── */
exports.getHoy = async (req, res) => {
  try {
    // Primero buscar caja abierta/reabierta
    let caja = await fetchCajaFull("ca.estado IN ('abierta','reabierta')", []);
    // Si no hay abierta, buscar la última cerrada (para mostrar opción reabrir)
    if (!caja) {
      const [[ultima]] = await db.query(
        "SELECT id FROM cajas WHERE estado = 'cerrada' ORDER BY id DESC LIMIT 1"
      );
      if (ultima) {
        caja = await fetchCajaFull("ca.id = ?", [ultima.id]);
      }
    }
    res.json(caja);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/caja/preview-apertura — saldos que se arrastrarán al abrir nueva caja ── */
exports.previewApertura = async (req, res) => {
  try {
    const [metodos] = await db.query(
      'SELECT nombre, etiqueta, color, arrastra_saldo FROM metodos_pago_config WHERE activo = 1 ORDER BY orden'
    );
    const [prevSaldos] = await db.query(
      `SELECT metodo_pago, saldo_fin FROM caja_saldos
       WHERE caja_id = (SELECT id FROM cajas WHERE estado='cerrada' ORDER BY id DESC LIMIT 1)`
    );
    const prevMap = {};
    for (const s of prevSaldos) prevMap[s.metodo_pago] = Number(s.saldo_fin) || 0;

    const arrastres = metodos.map(m => ({
      nombre: m.nombre,
      etiqueta: m.etiqueta,
      color: m.color,
      arrastra_saldo: !!m.arrastra_saldo,
      saldo_anterior: prevMap[m.nombre] ?? 0,
      saldo_ini: m.arrastra_saldo && prevSaldos.length > 0 ? (prevMap[m.nombre] ?? 0) : 0,
    }));

    res.json({ data: arrastres });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── POST /api/caja/abrir ── */
exports.abrir = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { saldo_ini_efectivo = 0, observaciones } = req.body;

    await conn.beginTransaction();

    const [[existing]] = await conn.query(
      "SELECT id FROM cajas WHERE estado IN ('abierta','reabierta') FOR UPDATE"
    );
    if (existing) {
      await conn.rollback(); conn.release();
      return res.status(409).json({ error: 'Ya hay una caja abierta. Ciérrala antes de abrir una nueva.' });
    }

    const [result] = await conn.query(
      `INSERT INTO cajas (fecha, abierta_por, estado, saldo_ini_efectivo, observaciones)
       VALUES (CURDATE(), ?, 'abierta', ?, ?)`,
      [req.user.id, Number(saldo_ini_efectivo) || 0, observaciones?.trim() || null]
    );
    const cajaId = result.insertId;

    // Read active payment methods + arrastra_saldo config
    const [metodos] = await conn.query(
      'SELECT nombre, arrastra_saldo FROM metodos_pago_config WHERE activo = 1'
    );

    // Get previous closed caja's saldo_fin from caja_saldos
    const [prevSaldos] = await conn.query(
      `SELECT metodo_pago, saldo_fin FROM caja_saldos
       WHERE caja_id = (SELECT id FROM cajas WHERE estado='cerrada' ORDER BY id DESC LIMIT 1)`
    );
    const prevMap = {};
    for (const s of prevSaldos) prevMap[s.metodo_pago] = Number(s.saldo_fin) || 0;

    // Create caja_saldos row for each active method
    // - Primera apertura (sin caja anterior): solo efectivo acepta monto manual
    // - Siguientes aperturas: arrastra_saldo según configuración de cada método
    const hasPrevCaja = prevSaldos.length > 0;

    for (const m of metodos) {
      let saldoIni = 0;
      if (hasPrevCaja && m.arrastra_saldo && prevMap[m.nombre] != null) {
        // Arrastra saldo del cierre anterior (aplica a cualquier método, incluido efectivo)
        saldoIni = prevMap[m.nombre];
      } else if (m.nombre === 'efectivo') {
        // Primera apertura: solo efectivo acepta monto manual
        saldoIni = Number(saldo_ini_efectivo) || 0;
      }
      await conn.query(
        'INSERT INTO caja_saldos (caja_id, metodo_pago, saldo_ini) VALUES (?, ?, ?)',
        [cajaId, m.nombre, saldoIni]
      );
    }

    // Movimiento de apertura para auditoría (origen='apertura' para NO contar como ingreso real)
    const { getCategoriaId } = require('../helpers/categoriaCaja');
    const catSaldoIni = await getCategoriaId('Saldo inicial', conn);
    const efectivoIni = hasPrevCaja && metodos.find(m => m.nombre === 'efectivo')?.arrastra_saldo
      ? (prevMap['efectivo'] || 0)
      : (Number(saldo_ini_efectivo) || 0);
    if (efectivoIni > 0) {
      await conn.query(
        `INSERT INTO caja_movimientos
           (caja_id, tipo, metodo_pago, monto, descripcion, registrado_por, origen, categoria_id)
         VALUES (?, 'ingreso', 'efectivo', ?, 'Saldo inicial de apertura', ?, 'apertura', ?)`,
        [cajaId, efectivoIni, req.user.id, catSaldoIni]
      );
    }
    // Movimientos de apertura para otros métodos que arrastran saldo
    if (hasPrevCaja) {
      for (const m of metodos) {
        if (m.nombre === 'efectivo') continue;
        if (m.arrastra_saldo && prevMap[m.nombre] > 0) {
          await conn.query(
            `INSERT INTO caja_movimientos
               (caja_id, tipo, metodo_pago, monto, descripcion, registrado_por, origen, categoria_id)
             VALUES (?, 'ingreso', ?, ?, 'Saldo arrastrado del cierre anterior', ?, 'apertura', ?)`,
            [cajaId, m.nombre, prevMap[m.nombre], req.user.id, catSaldoIni]
          );
        }
      }
    }

    await conn.commit();
    conn.release();

    const caja = await fetchCajaFull('ca.id = ?', [cajaId]);
    logAudit(req, { modulo: 'caja', accion: 'abrir', tabla: 'cajas', registro_id: cajaId, detalle: { saldo_ini_efectivo: Number(saldo_ini_efectivo) || 0 } });
    res.status(201).json(caja);
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    res.status(500).json({ error: err.message });
  }
};

/* ── PUT /api/caja/cerrar ── */
exports.cerrar = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { observaciones } = req.body;

    const [[caja]] = await conn.query(
      "SELECT id FROM cajas WHERE estado IN ('abierta','reabierta') ORDER BY fecha DESC LIMIT 1 FOR UPDATE"
    );
    if (!caja) { conn.release(); return res.status(404).json({ error: 'No hay caja abierta' }); }

    // Bloquear cierre si hay cajas de repartidores sin entregar
    const [cajasPendientes] = await conn.query(
      `SELECT cr.id, u.nombre AS repartidor
         FROM caja_ruta cr
         JOIN rutas r ON r.id = cr.ruta_id
         JOIN usuarios u ON u.id = cr.repartidor_id
        WHERE cr.estado = 'abierta'`
    );
    if (cajasPendientes.length > 0) {
      conn.release();
      const nombres = cajasPendientes.map(c => c.repartidor).join(', ');
      return res.status(400).json({
        error: `No se puede cerrar la caja. Hay ${cajasPendientes.length} caja(s) de repartidor sin entregar: ${nombres}. Recibe todas las cajas antes de cerrar.`,
      });
    }

    await conn.beginTransaction();

    const obs = observaciones?.trim() || null;
    await conn.query(
      `UPDATE cajas
          SET estado = 'cerrada',
              cerrada_por = ?,
              cerrada_en = NOW()
              ${obs ? ', observaciones = ?' : ''}
        WHERE id = ?`,
      obs ? [req.user.id, obs, caja.id] : [req.user.id, caja.id]
    );

    // Calculate saldo_fin for each method dynamically via caja_saldos (use conn to stay in transaction)
    const recalc = await fetchCajaFull('ca.id = ?', [caja.id], conn);
    if (recalc) {
      // Update legacy columns
      const fin_ef = (recalc.saldos_map?.efectivo?.saldo_ini ?? Number(recalc.saldo_ini_efectivo)) + (recalc.metodos_movimientos?.efectivo?.ing ?? 0) - (recalc.metodos_movimientos?.efectivo?.egr ?? 0);
      const fin_tr = (recalc.saldos_map?.transferencia?.saldo_ini ?? Number(recalc.saldo_ini_transferencia || 0)) + (recalc.metodos_movimientos?.transferencia?.ing ?? 0) - (recalc.metodos_movimientos?.transferencia?.egr ?? 0);
      const fin_ta = (recalc.saldos_map?.tarjeta?.saldo_ini ?? Number(recalc.saldo_ini_tarjeta || 0)) + (recalc.metodos_movimientos?.tarjeta?.ing ?? 0) - (recalc.metodos_movimientos?.tarjeta?.egr ?? 0);
      const fin_cr = (recalc.saldos_map?.credito?.saldo_ini ?? Number(recalc.saldo_ini_credito || 0)) + (recalc.metodos_movimientos?.credito?.ing ?? 0);
      await conn.query(
        `UPDATE cajas SET saldo_fin_efectivo=?, saldo_fin_transferencia=?, saldo_fin_tarjeta=?, saldo_fin_credito=? WHERE id=?`,
        [fin_ef, fin_tr, fin_ta, fin_cr, caja.id]
      );

      // Update caja_saldos for ALL methods (INSERT if missing — covers methods added mid-caja)
      for (const [metodo, mm] of Object.entries(recalc.metodos_movimientos)) {
        const sIni = recalc.saldos_map?.[metodo]?.saldo_ini ?? 0;
        const saldoFin = metodo === 'credito' ? sIni + mm.ing : sIni + mm.ing - mm.egr;
        if (recalc.saldos_map?.[metodo]) {
          await conn.query(
            `UPDATE caja_saldos SET saldo_fin = ? WHERE caja_id = ? AND metodo_pago = ?`,
            [saldoFin, caja.id, metodo]
          );
        } else {
          // Método no existía al abrir la caja — crear fila ahora
          await conn.query(
            `INSERT INTO caja_saldos (caja_id, metodo_pago, saldo_ini, saldo_fin) VALUES (?, ?, 0, ?)`,
            [caja.id, metodo, saldoFin]
          );
        }
      }
      // Also update methods that have saldos but no movements
      for (const [metodo, s] of Object.entries(recalc.saldos_map)) {
        if (!recalc.metodos_movimientos[metodo]) {
          await conn.query(
            `UPDATE caja_saldos SET saldo_fin = ? WHERE caja_id = ? AND metodo_pago = ?`,
            [s.saldo_ini, caja.id, metodo]
          );
        }
      }
    }

    await conn.commit();
    conn.release();

    const updated = await fetchCajaFull('ca.id = ?', [caja.id]);
    logAudit(req, { modulo: 'caja', accion: 'cerrar', tabla: 'cajas', registro_id: caja.id });
    res.json(updated);
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    res.status(500).json({ error: err.message });
  }
};

/* ── PUT /api/caja/reabrir ── */
exports.reabrir = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { motivo } = req.body;
    if (!motivo?.trim()) {
      conn.release();
      return res.status(400).json({ error: 'El motivo es requerido para reabrir la caja' });
    }

    await conn.beginTransaction();

    const [[caja]] = await conn.query(
      "SELECT id FROM cajas WHERE estado = 'cerrada' ORDER BY fecha DESC LIMIT 1 FOR UPDATE"
    );
    if (!caja) {
      await conn.rollback(); conn.release();
      return res.status(404).json({ error: 'No hay caja cerrada para reabrir' });
    }

    await conn.query(
      `INSERT INTO caja_reaberturas (caja_id, reabierta_por, razon) VALUES (?, ?, ?)`,
      [caja.id, req.user.id, motivo.trim()]
    );

    await conn.query(
      `UPDATE cajas
          SET estado                = 'reabierta',
              cerrada_por           = NULL,
              cerrada_en            = NULL,
              saldo_fin_efectivo    = NULL,
              saldo_fin_transferencia = NULL,
              saldo_fin_tarjeta     = NULL,
              saldo_fin_credito     = NULL
        WHERE id = ?`,
      [caja.id]
    );

    // Clear saldo_fin in caja_saldos
    await conn.query(
      'UPDATE caja_saldos SET saldo_fin = NULL WHERE caja_id = ?',
      [caja.id]
    );

    await conn.commit();
    conn.release();

    const updated = await fetchCajaFull('ca.id = ?', [caja.id]);
    logAudit(req, { modulo: 'caja', accion: 'reabrir', tabla: 'cajas', registro_id: caja.id, detalle: { motivo: motivo.trim() } });
    res.json(updated);
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/caja/movimientos ── */
exports.getMovimientos = async (req, res) => {
  try {
    const [[hoy]] = await db.query(
      "SELECT id FROM cajas WHERE estado IN ('abierta','reabierta') ORDER BY fecha DESC LIMIT 1"
    );
    if (!hoy) return res.json({ data: [], total: 0, pages: 1 });

    const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 50 });
    const tipo   = req.query.tipo;

    const conds  = ['cm.caja_id = ?'];
    const params = [hoy.id];
    if (tipo) { conds.push('cm.tipo = ?'); params.push(tipo); }

    const origen = req.query.origen;
    if (origen && ['directo','repartidor'].includes(origen)) {
      conds.push('cm.origen = ?'); params.push(origen);
    }
    const estado_entrega = req.query.estado_entrega;
    if (estado_entrega && ['pendiente','entregado'].includes(estado_entrega)) {
      conds.push('cm.estado_entrega = ?'); params.push(estado_entrega);
    }

    const where = `WHERE ${conds.join(' AND ')}`;

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM caja_movimientos cm ${where}`,
      params
    );

    const [rows] = await db.query(
      `SELECT cm.*,
              u.nombre AS registrado_por_nombre,
              c.nombre AS cliente_nombre,
              v.folio  AS venta_folio,
              ua.nombre AS anulado_por_nombre,
              cc.nombre AS categoria_nombre
         FROM caja_movimientos cm
         LEFT JOIN usuarios u  ON u.id  = cm.registrado_por
         LEFT JOIN clientes c  ON c.id  = cm.cliente_id
         LEFT JOIN ventas   v  ON v.id  = cm.venta_id
         LEFT JOIN usuarios ua ON ua.id = cm.anulado_por
         LEFT JOIN categorias_caja cc ON cc.id = cm.categoria_id
         ${where}
         ORDER BY cm.fecha_hora DESC
         LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json(paginatedResponse(rows, total, page, limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── POST /api/caja/movimientos — movimiento manual ── */
exports.addMovimiento = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { tipo, metodo_pago, monto, descripcion, categoria_id } = req.body;

    if (!['ingreso', 'egreso'].includes(tipo)) {
      conn.release();
      return res.status(400).json({ error: 'Tipo inválido. Use: ingreso o egreso' });
    }
    const [metodosActivos] = await db.query("SELECT nombre FROM metodos_pago_config WHERE activo = 1 AND nombre != 'credito'");
    const metodosSet = new Set(metodosActivos.map(m => m.nombre));
    if (!metodosSet.has(metodo_pago)) {
      conn.release();
      return res.status(400).json({ error: 'Método de pago inválido para movimientos de caja' });
    }
    if (!monto || Number(monto) <= 0) {
      conn.release();
      return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
    }
    if (!descripcion?.trim()) {
      conn.release();
      return res.status(400).json({ error: 'La descripción es requerida' });
    }

    await conn.beginTransaction();

    const [[caja]] = await conn.query(
      "SELECT id FROM cajas WHERE estado IN ('abierta','reabierta') ORDER BY fecha DESC LIMIT 1 FOR UPDATE"
    );
    if (!caja) {
      await conn.rollback(); conn.release();
      return res.status(404).json({ error: 'No hay caja abierta' });
    }

    const [result] = await conn.query(
      `INSERT INTO caja_movimientos
         (caja_id, tipo, metodo_pago, monto, descripcion, categoria_id, registrado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [caja.id, tipo, metodo_pago, Number(monto), descripcion.trim(), categoria_id || null, req.user.id]
    );

    await conn.commit();

    const [[mov]] = await db.query(
      `SELECT cm.*, u.nombre AS registrado_por_nombre, cc.nombre AS categoria_nombre
         FROM caja_movimientos cm
         LEFT JOIN usuarios u ON u.id = cm.registrado_por
         LEFT JOIN categorias_caja cc ON cc.id = cm.categoria_id
         WHERE cm.id = ?`,
      [result.insertId]
    );

    conn.release();
    logAudit(req, { modulo: 'caja', accion: 'crear', tabla: 'caja_movimientos', registro_id: result.insertId, detalle: { tipo, metodo_pago, monto: Number(monto), descripcion: descripcion.trim() } });
    res.status(201).json(mov);
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    res.status(500).json({ error: err.message });
  }
};

/* ── PUT /api/caja/movimientos/:id/anular — anular movimiento manual ── */
exports.anularMovimiento = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Verificar que hay caja abierta
    const [[cajaAbierta]] = await conn.query(
      "SELECT id FROM cajas WHERE estado IN ('abierta','reabierta') ORDER BY fecha DESC LIMIT 1 FOR UPDATE"
    );
    if (!cajaAbierta) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'Solo se pueden anular movimientos de una caja abierta' });
    }

    // Obtener el movimiento
    const [[mov]] = await conn.query(
      'SELECT * FROM caja_movimientos WHERE id = ? AND caja_id = ?',
      [req.params.id, cajaAbierta.id]
    );
    if (!mov) {
      await conn.rollback(); conn.release();
      return res.status(404).json({ error: 'Movimiento no encontrado en la caja abierta' });
    }

    // Movimientos vinculados a ventas, pagos clientes o mantenimientos no se anulan desde caja
    if (mov.venta_id || mov.pago_id || mov.mantenimiento_id) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'Este movimiento esta vinculado a otra operacion y no se puede anular desde caja' });
    }
    if (!['ingreso', 'egreso'].includes(mov.tipo)) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'Solo se pueden anular movimientos de tipo ingreso o egreso' });
    }
    if (mov.anulado) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'Este movimiento ya fue anulado' });
    }

    // Si es pago a proveedor, anular el pago y restaurar deuda
    if (mov.pago_proveedor_id) {
      const [[pago]] = await conn.query(
        'SELECT * FROM pagos_proveedores WHERE id = ? AND estado = ?',
        [mov.pago_proveedor_id, 'activo']
      );
      if (pago) {
        await conn.query("UPDATE pagos_proveedores SET estado = 'anulado' WHERE id = ?", [pago.id]);
        await conn.query('UPDATE proveedores SET saldo_deuda = saldo_deuda + ? WHERE id = ?', [pago.monto, pago.proveedor_id]);
      }
    }

    await conn.query(
      'UPDATE caja_movimientos SET anulado = 1, anulado_por = ?, anulado_en = NOW() WHERE id = ?',
      [req.user.id, mov.id]
    );

    await conn.commit();
    conn.release();
    logAudit(req, { modulo: 'caja', accion: 'cancelar', tabla: 'caja_movimientos', registro_id: mov.id, detalle: { tipo: mov.tipo, monto: mov.monto } });
    res.json({ message: 'Movimiento anulado' });
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    console.error('caja.anularMovimiento:', err.message);
    res.status(500).json({ error: 'Error anulando movimiento' });
  }
};

/* ── GET /api/caja/:id — caja completa por ID ── */
exports.getById = async (req, res) => {
  try {
    const caja = await fetchCajaFull('ca.id = ?', [req.params.id]);
    if (!caja) return res.status(404).json({ error: 'Caja no encontrada' });
    res.json(caja);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/caja/historial — cajas cerradas ── */
exports.historial = async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 15, maxLimit: 50 });
    const { fecha_inicio, fecha_fin } = req.query;

    const conds  = ["ca.estado = 'cerrada'"];
    const params = [];
    if (fecha_inicio) { conds.push('ca.fecha >= ?'); params.push(fecha_inicio); }
    if (fecha_fin)    { conds.push('ca.fecha <= ?'); params.push(fecha_fin); }
    const where = `WHERE ${conds.join(' AND ')}`;

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM cajas ca ${where}`, params
    );

    const [rows] = await db.query(
      `SELECT ca.*, ua.nombre AS abierta_por_nombre, uc.nombre AS cerrada_por_nombre
         FROM cajas ca
         LEFT JOIN usuarios ua ON ua.id = ca.abierta_por
         LEFT JOIN usuarios uc ON uc.id = ca.cerrada_por
         ${where}
         ORDER BY ca.fecha DESC, ca.id DESC
         LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    // Attach saldos_map per caja
    const ids = rows.map(r => r.id);
    if (ids.length > 0) {
      const [saldosRows] = await db.query(
        `SELECT caja_id, metodo_pago, saldo_ini, saldo_fin FROM caja_saldos WHERE caja_id IN (${ids.map(() => '?').join(',')})`,
        ids
      );
      const saldosByCaja = {};
      for (const s of saldosRows) {
        if (!saldosByCaja[s.caja_id]) saldosByCaja[s.caja_id] = {};
        saldosByCaja[s.caja_id][s.metodo_pago] = { saldo_ini: Number(s.saldo_ini), saldo_fin: s.saldo_fin != null ? Number(s.saldo_fin) : null };
      }
      for (const r of rows) {
        r.saldos_map = saldosByCaja[r.id] || {};
      }
    }

    res.json(paginatedResponse(rows, total, page, limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/caja/:id/movimientos — movimientos de cualquier caja ── */
exports.getMovimientosCaja = async (req, res) => {
  try {
    const cajaId = req.params.id;
    const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 50 });

    const [[{ total }]] = await db.query(
      'SELECT COUNT(*) AS total FROM caja_movimientos WHERE caja_id = ?', [cajaId]
    );

    const [rows] = await db.query(
      `SELECT cm.*,
              u.nombre AS registrado_por_nombre,
              c.nombre AS cliente_nombre,
              v.folio  AS venta_folio,
              ua.nombre AS anulado_por_nombre,
              cc.nombre AS categoria_nombre
         FROM caja_movimientos cm
         LEFT JOIN usuarios u  ON u.id  = cm.registrado_por
         LEFT JOIN clientes c  ON c.id  = cm.cliente_id
         LEFT JOIN ventas   v  ON v.id  = cm.venta_id
         LEFT JOIN usuarios ua ON ua.id = cm.anulado_por
         LEFT JOIN categorias_caja cc ON cc.id = cm.categoria_id
         WHERE cm.caja_id = ?
         ORDER BY cm.fecha_hora DESC
         LIMIT ? OFFSET ?`,
      [cajaId, limit, offset]
    );

    res.json(paginatedResponse(rows, total, page, limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/caja/repartidores — cajas de repartidores (pendientes de cualquier fecha + hoy) ── */
exports.getRepartidores = async (req, res) => {
  try {
    const fecha = req.query.fecha || new Date().toISOString().slice(0, 10);
    const [rows] = await db.query(
      `SELECT * FROM v_cajas_repartidores
       WHERE fecha = ? OR caja_estado != 'entregada'
       ORDER BY caja_estado != 'entregada' DESC, fecha DESC, ruta_numero`,
      [fecha]
    );
    // Deduplicar por caja_ruta_id (por si una caja pendiente también es de hoy)
    const seen = new Set();
    const unique = rows.filter(r => {
      if (seen.has(r.caja_ruta_id)) return false;
      seen.add(r.caja_ruta_id);
      return true;
    });
    res.json({ data: unique });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
