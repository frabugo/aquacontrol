// controllers/devolucionesController.js
const db = require('../db');
const { parsePagination, paginatedResponse } = require('../helpers/paginate');

/* ── GET /api/devoluciones ── */
exports.list = async (req, res) => {
  try {
    const { fecha_inicio, fecha_fin, cliente_id, q, origen, estado } = req.query;
    const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 20 });

    const conds  = [];
    const params = [];
    if (fecha_inicio) { conds.push('d.fecha >= ?'); params.push(fecha_inicio); }
    if (fecha_fin)    { conds.push('d.fecha <= ?'); params.push(fecha_fin); }
    if (cliente_id)   { conds.push('d.cliente_id = ?'); params.push(cliente_id); }
    if (q)            { conds.push('c.nombre LIKE ?'); params.push(`%${q}%`); }
    if (origen)       { conds.push('d.origen = ?'); params.push(origen); }
    if (estado)       { conds.push('d.estado = ?'); params.push(estado); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total
         FROM devoluciones d
         LEFT JOIN clientes c ON c.id = d.cliente_id
         ${where}`,
      params
    );

    const [rows] = await db.query(
      `SELECT d.*,
              c.nombre AS cliente_nombre,
              c.bidones_prestados,
              p.nombre AS presentacion_nombre,
              u.nombre AS registrado_por_nombre,
              v.folio  AS venta_folio
         FROM devoluciones d
         LEFT JOIN clientes       c ON c.id = d.cliente_id
         LEFT JOIN presentaciones p ON p.id = d.presentacion_id
         LEFT JOIN usuarios       u ON u.id = d.registrado_por
         LEFT JOIN ventas         v ON v.id = d.venta_id
         ${where}
         ORDER BY d.creado_en DESC
         LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json(paginatedResponse(rows, total, page, limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/devoluciones/pendientes/:clienteId — Préstamos pendientes por venta ── */
exports.pendientesPorVenta = async (req, res) => {
  try {
    const clienteId = req.params.clienteId;

    // Líneas de préstamo agrupadas por venta + presentación, con devueltos calculados
    const [rows] = await db.query(
      `SELECT v.id AS venta_id, v.folio, v.fecha_hora,
              vd.presentacion_id, p.nombre AS presentacion_nombre,
              SUM(vd.cantidad) AS prestados,
              COALESCE((
                SELECT SUM(d2.cantidad) FROM devoluciones d2
                WHERE d2.venta_id = v.id AND d2.presentacion_id = vd.presentacion_id
                  AND d2.estado = 'activa'
              ), 0) AS devueltos
         FROM venta_detalle vd
         JOIN ventas v ON v.id = vd.venta_id
         LEFT JOIN presentaciones p ON p.id = vd.presentacion_id
         WHERE v.cliente_id = ? AND vd.tipo_linea = 'prestamo' AND v.estado != 'cancelada'
         GROUP BY v.id, vd.presentacion_id
         HAVING prestados > devueltos
         ORDER BY v.fecha_hora DESC`,
      [clienteId]
    );

    const data = rows.map(r => ({
      ...r,
      prestados:  Number(r.prestados),
      devueltos:  Number(r.devueltos),
      pendiente:  Number(r.prestados) - Number(r.devueltos),
    }));

    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── POST /api/devoluciones (manual) ── */
exports.create = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { cliente_id, presentacion_id, cantidad, fecha, notas, venta_id } = req.body;

    if (!cliente_id)      { conn.release(); return res.status(400).json({ error: 'cliente_id es requerido' }); }
    if (!presentacion_id) { conn.release(); return res.status(400).json({ error: 'presentacion_id es requerido' }); }
    if (!cantidad || Number(cantidad) <= 0) { conn.release(); return res.status(400).json({ error: 'La cantidad debe ser mayor a 0' }); }

    const qty = Number(cantidad);

    await conn.beginTransaction();

    // Validar caja abierta
    const [[cajaAbiertaCheck]] = await conn.query(
      "SELECT id FROM cajas WHERE estado IN ('abierta','reabierta') ORDER BY fecha DESC LIMIT 1"
    );
    if (!cajaAbiertaCheck) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'No hay caja abierta. Abre la caja antes de registrar devoluciones.' });
    }

    // Validar bidones_prestados del cliente con lock
    const [[cliente]] = await conn.query(
      'SELECT bidones_prestados FROM clientes WHERE id = ? FOR UPDATE',
      [cliente_id]
    );
    if (!cliente) {
      await conn.rollback(); conn.release();
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    if (Number(cliente.bidones_prestados) <= 0) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'El cliente ya no tiene bidones prestados. Es posible que alguien más registró la devolución.' });
    }
    if (qty > Number(cliente.bidones_prestados)) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: `El cliente solo tiene ${cliente.bidones_prestados} bidones prestados. Es posible que alguien más devolvió antes.` });
    }

    // Si viene venta_id, validar que no exceda lo pendiente
    if (venta_id) {
      const [[check]] = await conn.query(
        `SELECT COALESCE(SUM(vd.cantidad), 0) AS prestados,
                COALESCE((SELECT SUM(d2.cantidad) FROM devoluciones d2
                          WHERE d2.venta_id = ? AND d2.presentacion_id = ? AND d2.estado = 'activa'), 0) AS devueltos
           FROM venta_detalle vd
           JOIN ventas v ON v.id = vd.venta_id
           WHERE v.id = ? AND vd.presentacion_id = ? AND vd.tipo_linea = 'prestamo' AND v.estado != 'cancelada'`,
        [venta_id, presentacion_id, venta_id, presentacion_id]
      );
      const pendiente = Number(check.prestados) - Number(check.devueltos);
      if (qty > pendiente) {
        await conn.rollback(); conn.release();
        return res.status(400).json({ error: `Solo quedan ${pendiente} bidones pendientes de esa venta` });
      }
    }

    const fechaFinal = fecha || new Date().toISOString().slice(0, 10);
    const notasFinal = notas?.trim() || null;
    const devIds = [];

    // 1. Insertar devolución(es) — FIFO si no viene venta_id
    if (venta_id) {
      // Caso con venta específica: una sola inserción
      const [result] = await conn.query(
        `INSERT INTO devoluciones (cliente_id, presentacion_id, cantidad, origen, venta_id, fecha, notas, registrado_por)
         VALUES (?, ?, ?, 'manual', ?, ?, ?, ?)`,
        [cliente_id, presentacion_id, qty, venta_id, fechaFinal, notasFinal, req.user.id]
      );
      devIds.push(result.insertId);
    } else {
      // Sin venta: asignar FIFO a ventas más antiguas con préstamos pendientes
      const [pendientes] = await conn.query(
        `SELECT v.id AS venta_id, v.fecha_hora,
                SUM(vd.cantidad) AS prestados,
                COALESCE((
                  SELECT SUM(d2.cantidad) FROM devoluciones d2
                  WHERE d2.venta_id = v.id AND d2.presentacion_id = ? AND d2.estado = 'activa'
                ), 0) AS devueltos
           FROM venta_detalle vd
           JOIN ventas v ON v.id = vd.venta_id
           WHERE v.cliente_id = ? AND vd.presentacion_id = ? AND vd.tipo_linea = 'prestamo' AND v.estado != 'cancelada'
           GROUP BY v.id
           HAVING prestados > devueltos
           ORDER BY v.fecha_hora ASC`,
        [presentacion_id, cliente_id, presentacion_id]
      );

      let remaining = qty;
      for (const p of pendientes) {
        if (remaining <= 0) break;
        const pendiente = Number(p.prestados) - Number(p.devueltos);
        const asignar = Math.min(remaining, pendiente);
        const [result] = await conn.query(
          `INSERT INTO devoluciones (cliente_id, presentacion_id, cantidad, origen, venta_id, fecha, notas, registrado_por)
           VALUES (?, ?, ?, 'manual', ?, ?, ?, ?)`,
          [cliente_id, presentacion_id, asignar, p.venta_id, fechaFinal, notasFinal, req.user.id]
        );
        devIds.push(result.insertId);
        remaining -= asignar;
      }

      // Si sobran (carga inicial sin venta asociada), insertar con venta_id NULL
      if (remaining > 0) {
        const [result] = await conn.query(
          `INSERT INTO devoluciones (cliente_id, presentacion_id, cantidad, origen, venta_id, fecha, notas, registrado_por)
           VALUES (?, ?, ?, 'manual', NULL, ?, ?, ?)`,
          [cliente_id, presentacion_id, remaining, fechaFinal, notasFinal, req.user.id]
        );
        devIds.push(result.insertId);
      }
    }

    // 2. Restar bidones_prestados del cliente
    await conn.query(
      'UPDATE clientes SET bidones_prestados = GREATEST(0, bidones_prestados - ?) WHERE id = ?',
      [qty, cliente_id]
    );

    // 3. Retornable: siempre a cola de lavado
    const [[pres]] = await conn.query(
      'SELECT es_retornable FROM presentaciones WHERE id = ?',
      [presentacion_id]
    );

    if (pres && pres.es_retornable) {
      await conn.query(
        `INSERT INTO stock_movimientos
           (presentacion_id, tipo, cantidad, estado_origen, estado_destino, cliente_id, registrado_por)
         VALUES (?, 'devolucion_cliente', ?, 'en_ruta_vacio', 'en_lavado', ?, ?)`,
        [presentacion_id, qty, cliente_id, req.user.id]
      );
      await conn.query(
        'UPDATE presentaciones SET stock_en_lavado = stock_en_lavado + ? WHERE id = ?',
        [qty, presentacion_id]
      );
    }

    await conn.commit();
    conn.release();

    // Devolver el primer registro (o todos si fueron varios)
    const [devs] = await db.query(
      `SELECT d.*, c.nombre AS cliente_nombre, p.nombre AS presentacion_nombre, u.nombre AS registrado_por_nombre,
              v.folio AS venta_folio
         FROM devoluciones d
         LEFT JOIN clientes c ON c.id = d.cliente_id
         LEFT JOIN presentaciones p ON p.id = d.presentacion_id
         LEFT JOIN usuarios u ON u.id = d.registrado_por
         LEFT JOIN ventas v ON v.id = d.venta_id
         WHERE d.id IN (?)`,
      [devIds]
    );

    res.status(201).json(devIds.length === 1 ? devs[0] : devs);
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/devoluciones/prestamos — Clientes con bidones prestados ── */
exports.clientesPrestamos = async (req, res) => {
  try {
    const { q } = req.query;
    const { page, limit, offset } = parsePagination(req.query);

    const conds  = ['c.activo = 1', 'c.bidones_prestados > 0'];
    const params = [];
    if (q) { conds.push('c.nombre LIKE ?'); params.push(`%${q}%`); }

    const where = `WHERE ${conds.join(' AND ')}`;

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM clientes c ${where}`, params
    );

    const [rows] = await db.query(
      `SELECT c.id, c.nombre, c.tipo, c.telefono, c.bidones_prestados,
              COALESCE((
                SELECT SUM(vd.cantidad)
                FROM venta_detalle vd
                JOIN ventas v ON v.id = vd.venta_id
                WHERE v.cliente_id = c.id AND vd.tipo_linea = 'prestamo' AND v.estado != 'cancelada'
              ), 0) AS total_prestados,
              COALESCE((
                SELECT SUM(d.cantidad)
                FROM devoluciones d
                WHERE d.cliente_id = c.id AND d.estado = 'activa'
              ), 0) AS total_devueltos
         FROM clientes c
         ${where}
         ORDER BY c.bidones_prestados DESC
         LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json(paginatedResponse(rows, total, page, limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/devoluciones/prestamos/:clienteId — Detalle préstamos de un cliente ── */
exports.detallePrestamos = async (req, res) => {
  try {
    const clienteId = req.params.clienteId;

    // Ventas con líneas de préstamo
    const [ventas] = await db.query(
      `SELECT v.id, v.folio, v.fecha_hora, v.estado,
              vd.presentacion_id, p.nombre AS presentacion_nombre,
              vd.cantidad, vd.precio_unitario, vd.subtotal
         FROM venta_detalle vd
         JOIN ventas v ON v.id = vd.venta_id
         LEFT JOIN presentaciones p ON p.id = vd.presentacion_id
         WHERE v.cliente_id = ? AND vd.tipo_linea = 'prestamo' AND v.estado != 'cancelada'
         ORDER BY v.fecha_hora DESC`,
      [clienteId]
    );

    // Devoluciones del cliente
    const [devoluciones] = await db.query(
      `SELECT d.id, d.fecha, d.creado_en, d.cantidad, d.origen, d.estado,
              p.nombre AS presentacion_nombre,
              v.folio AS venta_folio
         FROM devoluciones d
         LEFT JOIN presentaciones p ON p.id = d.presentacion_id
         LEFT JOIN ventas v ON v.id = d.venta_id
         WHERE d.cliente_id = ?
         ORDER BY d.creado_en DESC`,
      [clienteId]
    );

    // Resumen del cliente
    const [[cliente]] = await db.query(
      'SELECT id, nombre, bidones_prestados FROM clientes WHERE id = ?',
      [clienteId]
    );

    res.json({ cliente, ventas, devoluciones });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/devoluciones/auditoria-bidones/:clienteId — Desglose completo de bidones ── */
exports.auditoriaBidones = async (req, res) => {
  try {
    const clienteId = req.params.clienteId;

    const [[cliente]] = await db.query(
      'SELECT id, nombre, bidones_prestados FROM clientes WHERE id = ?', [clienteId]
    );
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

    // Préstamos explícitos (tipo_linea = 'prestamo')
    const [prestamosExplicitos] = await db.query(
      `SELECT v.id AS venta_id, v.folio, v.fecha_hora, v.estado,
              p.nombre AS presentacion, SUM(vd.cantidad) AS cantidad
         FROM venta_detalle vd
         JOIN ventas v ON v.id = vd.venta_id
         LEFT JOIN presentaciones p ON p.id = vd.presentacion_id
         WHERE v.cliente_id = ? AND vd.tipo_linea = 'prestamo' AND v.estado != 'cancelada'
         GROUP BY v.id, vd.presentacion_id
         ORDER BY v.fecha_hora ASC`,
      [clienteId]
    );

    // Préstamos automáticos (recargas retornables con vacíos faltantes)
    const [prestamosAuto] = await db.query(
      `SELECT v.id AS venta_id, v.folio, v.fecha_hora, v.estado,
              p.nombre AS presentacion,
              SUM(vd.cantidad - COALESCE(vd.vacios_recibidos, 0)) AS cantidad
         FROM venta_detalle vd
         JOIN ventas v ON v.id = vd.venta_id
         JOIN presentaciones p ON p.id = vd.presentacion_id
         WHERE v.cliente_id = ? AND vd.tipo_linea = 'recarga' AND p.es_retornable = 1
           AND v.estado != 'cancelada'
           AND (vd.cantidad - COALESCE(vd.vacios_recibidos, 0)) > 0
         GROUP BY v.id, vd.presentacion_id
         ORDER BY v.fecha_hora ASC`,
      [clienteId]
    );

    // Cargas iniciales (del audit_log)
    const [cargasIniciales] = await db.query(
      `SELECT created_at AS fecha, usuario_nombre, detalle
         FROM audit_log
         WHERE tabla = 'clientes' AND registro_id = ?
           AND detalle LIKE '%carga_inicial%'
         ORDER BY created_at ASC`,
      [clienteId]
    );

    // Devoluciones activas
    const [devoluciones] = await db.query(
      `SELECT d.id, d.fecha, d.cantidad, d.origen, d.creado_en,
              p.nombre AS presentacion, v.folio AS venta_folio,
              u.nombre AS registrado_por
         FROM devoluciones d
         LEFT JOIN presentaciones p ON p.id = d.presentacion_id
         LEFT JOIN ventas v ON v.id = d.venta_id
         LEFT JOIN usuarios u ON u.id = d.registrado_por
         WHERE d.cliente_id = ? AND d.estado = 'activa'
         ORDER BY d.fecha ASC`,
      [clienteId]
    );

    const totalExplicitos = prestamosExplicitos.reduce((s, r) => s + Number(r.cantidad), 0);
    const totalAuto       = prestamosAuto.reduce((s, r) => s + Number(r.cantidad), 0);
    const totalDevueltos  = devoluciones.reduce((s, r) => s + Number(r.cantidad), 0);
    const saldoCalculado  = totalExplicitos + totalAuto - totalDevueltos;

    let ultimaCargaInicial = null;
    if (cargasIniciales.length > 0) {
      const last = cargasIniciales[cargasIniciales.length - 1];
      try {
        const det = typeof last.detalle === 'string' ? JSON.parse(last.detalle) : last.detalle;
        ultimaCargaInicial = { fecha: last.fecha, usuario: last.usuario_nombre, bidones_anterior: det.bidones_anterior, bidones_nuevo: det.bidones_nuevo };
      } catch (_) {}
    }

    res.json({
      cliente,
      resumen: {
        prestamos_ventas: totalExplicitos,
        prestamos_auto_recargas: totalAuto,
        total_prestados: totalExplicitos + totalAuto,
        total_devueltos: totalDevueltos,
        saldo_calculado: saldoCalculado,
        saldo_actual: cliente.bidones_prestados,
        diferencia: cliente.bidones_prestados - saldoCalculado,
        ultima_carga_inicial: ultimaCargaInicial,
      },
      prestamos_explicitos: prestamosExplicitos.map(r => ({ ...r, cantidad: Number(r.cantidad) })),
      prestamos_auto: prestamosAuto.map(r => ({ ...r, cantidad: Number(r.cantidad) })),
      cargas_iniciales: cargasIniciales.map(r => {
        let det = {};
        try { det = typeof r.detalle === 'string' ? JSON.parse(r.detalle) : r.detalle; } catch (_) {}
        return { fecha: r.fecha, usuario: r.usuario_nombre, ...det };
      }),
      devoluciones,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── POST /api/devoluciones/desde-reparto (chofer en ruta) ── */
exports.createDesdeReparto = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { cliente_id, presentacion_id, cantidad, notas } = req.body;

    if (!cliente_id)      { conn.release(); return res.status(400).json({ error: 'cliente_id es requerido' }); }
    if (!presentacion_id) { conn.release(); return res.status(400).json({ error: 'presentacion_id es requerido' }); }
    if (!cantidad || Number(cantidad) <= 0) { conn.release(); return res.status(400).json({ error: 'La cantidad debe ser mayor a 0' }); }

    const qty = Number(cantidad);

    // Validar ruta activa del chofer
    const [[ruta]] = await conn.query(
      `SELECT id FROM rutas
       WHERE repartidor_id = ? AND estado IN ('preparando','en_ruta','regresando')
       ORDER BY creado_en DESC LIMIT 1`,
      [req.user.id]
    );
    if (!ruta) {
      conn.release();
      return res.status(400).json({ error: 'No tienes una ruta activa' });
    }

    // Validar que la presentación sea retornable
    const [[presCheck]] = await conn.query(
      'SELECT es_retornable FROM presentaciones WHERE id = ?', [presentacion_id]
    );
    if (!presCheck || !presCheck.es_retornable) {
      conn.release();
      return res.status(400).json({ error: 'Solo se pueden devolver presentaciones retornables' });
    }

    await conn.beginTransaction();

    // Validar que el cliente tenga bidones_prestados suficientes (con lock)
    const [[cliente]] = await conn.query(
      'SELECT bidones_prestados FROM clientes WHERE id = ? FOR UPDATE',
      [cliente_id]
    );
    if (!cliente) {
      await conn.rollback(); conn.release();
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    if (Number(cliente.bidones_prestados) <= 0) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'El cliente ya no tiene bidones prestados. Es posible que alguien más registró la devolución.' });
    }
    if (qty > Number(cliente.bidones_prestados)) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: `El cliente solo tiene ${cliente.bidones_prestados} bidones prestados. Es posible que alguien más devolvió antes.` });
    }

    const notasFinal = notas?.trim() || null;
    const devIds = [];

    // 1. FIFO: asignar devoluciones a ventas más antiguas con préstamos pendientes
    const [pendientes] = await conn.query(
      `SELECT v.id AS venta_id, v.fecha_hora,
              SUM(vd.cantidad) AS prestados,
              COALESCE((
                SELECT SUM(d2.cantidad) FROM devoluciones d2
                WHERE d2.venta_id = v.id AND d2.presentacion_id = ? AND d2.estado = 'activa'
              ), 0) AS devueltos
         FROM venta_detalle vd
         JOIN ventas v ON v.id = vd.venta_id
         WHERE v.cliente_id = ? AND vd.presentacion_id = ? AND vd.tipo_linea = 'prestamo' AND v.estado != 'cancelada'
         GROUP BY v.id
         HAVING prestados > devueltos
         ORDER BY v.fecha_hora ASC`,
      [presentacion_id, cliente_id, presentacion_id]
    );

    let remaining = qty;
    for (const p of pendientes) {
      if (remaining <= 0) break;
      const pendiente = Number(p.prestados) - Number(p.devueltos);
      const asignar = Math.min(remaining, pendiente);
      const [result] = await conn.query(
        `INSERT INTO devoluciones (cliente_id, presentacion_id, cantidad, origen, venta_id, ruta_id, fecha, notas, registrado_por)
         VALUES (?, ?, ?, 'reparto', ?, ?, CURDATE(), ?, ?)`,
        [cliente_id, presentacion_id, asignar, p.venta_id, ruta.id, notasFinal, req.user.id]
      );
      devIds.push(result.insertId);
      remaining -= asignar;
    }

    // Si sobran (carga inicial sin venta asociada), insertar con venta_id NULL
    if (remaining > 0) {
      const [result] = await conn.query(
        `INSERT INTO devoluciones (cliente_id, presentacion_id, cantidad, origen, venta_id, ruta_id, fecha, notas, registrado_por)
         VALUES (?, ?, ?, 'reparto', NULL, ?, CURDATE(), ?, ?)`,
        [cliente_id, presentacion_id, remaining, ruta.id, notasFinal, req.user.id]
      );
      devIds.push(result.insertId);
    }

    // 2. Restar bidones_prestados del cliente
    await conn.query(
      'UPDATE clientes SET bidones_prestados = GREATEST(0, bidones_prestados - ?) WHERE id = ?',
      [qty, cliente_id]
    );

    // 3. Sumar vacíos al vehículo (NO a planta/lavado)
    await conn.query(
      `INSERT INTO stock_vehiculo (ruta_id, presentacion_id, llenos_cargados, vacios_recogidos)
       VALUES (?, ?, 0, ?)
       ON DUPLICATE KEY UPDATE vacios_recogidos = vacios_recogidos + VALUES(vacios_recogidos)`,
      [ruta.id, presentacion_id, qty]
    );

    // 4. Registrar movimiento de stock
    await conn.query(
      `INSERT INTO stock_movimientos
         (presentacion_id, tipo, cantidad, estado_origen, estado_destino, cliente_id, registrado_por)
       VALUES (?, 'devolucion_cliente', ?, 'vacio', 'en_ruta_vacio', ?, ?)`,
      [presentacion_id, qty, cliente_id, req.user.id]
    );

    await conn.commit();
    conn.release();

    // Devolver registros completos
    const [devs] = await db.query(
      `SELECT d.*, c.nombre AS cliente_nombre, p.nombre AS presentacion_nombre, u.nombre AS registrado_por_nombre,
              v.folio AS venta_folio
         FROM devoluciones d
         LEFT JOIN clientes c ON c.id = d.cliente_id
         LEFT JOIN presentaciones p ON p.id = d.presentacion_id
         LEFT JOIN usuarios u ON u.id = d.registrado_por
         LEFT JOIN ventas v ON v.id = d.venta_id
         WHERE d.id IN (?)`,
      [devIds]
    );

    res.status(201).json(devIds.length === 1 ? devs[0] : devs);
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    res.status(500).json({ error: err.message });
  }
};

/* ── PUT /api/devoluciones/:id/anular ── */
exports.anular = async (req, res) => {
  const conn = await db.getConnection();
  try {
    // BUG 14 fix: begin transaction BEFORE SELECT ... FOR UPDATE
    await conn.beginTransaction();

    const [[dev]] = await conn.query(
      'SELECT * FROM devoluciones WHERE id = ? FOR UPDATE',
      [req.params.id]
    );
    if (!dev) {
      await conn.rollback(); conn.release();
      return res.status(404).json({ error: 'Devolución no encontrada' });
    }
    if (dev.estado === 'anulada') {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'La devolución ya está anulada' });
    }
    if (dev.origen === 'venta') {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'No se puede anular una devolución generada por venta. Anule la venta para revertirla.' });
    }

    // 1. Marcar como anulada
    await conn.query('UPDATE devoluciones SET estado = ? WHERE id = ?', ['anulada', dev.id]);

    // 2. Revertir bidones_prestados
    await conn.query(
      'UPDATE clientes SET bidones_prestados = bidones_prestados + ? WHERE id = ?',
      [dev.cantidad, dev.cliente_id]
    );

    // 3. Revertir stock según origen
    if (dev.origen === 'reparto') {
      // Reparto: los vacíos fueron a stock_vehiculo.vacios_recogidos, revertir ahí
      if (dev.ruta_id) {
        await conn.query(
          `UPDATE stock_vehiculo SET vacios_recogidos = GREATEST(0, vacios_recogidos - ?)
           WHERE ruta_id = ? AND presentacion_id = ?`,
          [dev.cantidad, dev.ruta_id, dev.presentacion_id]
        );
      }
      // Revertir stock_movimiento de reparto
      await conn.query(
        `DELETE FROM stock_movimientos
         WHERE presentacion_id = ?
           AND tipo = 'devolucion_cliente'
           AND estado_destino = 'en_ruta_vacio'
           AND cliente_id = ?
           AND cantidad = ?
         ORDER BY id DESC
         LIMIT 1`,
        [dev.presentacion_id, dev.cliente_id, dev.cantidad]
      );
    } else {
      // Manual: los vacíos fueron a stock_en_lavado en planta
      const [[pres]] = await conn.query(
        'SELECT es_retornable FROM presentaciones WHERE id = ?',
        [dev.presentacion_id]
      );

      if (pres && pres.es_retornable) {
        await conn.query(
          `DELETE FROM stock_movimientos
           WHERE presentacion_id = ?
             AND tipo = 'devolucion_cliente'
             AND estado_destino = 'en_lavado'
             AND cliente_id = ?
             AND cantidad = ?
           ORDER BY id DESC
           LIMIT 1`,
          [dev.presentacion_id, dev.cliente_id, dev.cantidad]
        );
        await conn.query(
          'UPDATE presentaciones SET stock_en_lavado = GREATEST(0, stock_en_lavado - ?) WHERE id = ?',
          [dev.cantidad, dev.presentacion_id]
        );
      }
    }

    await conn.commit();
    conn.release();
    res.json({ ok: true });
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    res.status(500).json({ error: err.message });
  }
};


/* == POST /api/devoluciones/bidon-perdido == */
exports.bidonPerdido = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { cliente_id, presentacion_id, cantidad, monto, metodo_pago, notas } = req.body;

    if (!cliente_id) { conn.release(); return res.status(400).json({ error: 'cliente_id es requerido' }); }
    if (!presentacion_id) { conn.release(); return res.status(400).json({ error: 'presentacion_id es requerido' }); }
    if (!cantidad || Number(cantidad) <= 0) { conn.release(); return res.status(400).json({ error: 'La cantidad debe ser mayor a 0' }); }
    if (!monto || Number(monto) <= 0) { conn.release(); return res.status(400).json({ error: 'El monto debe ser mayor a 0' }); }

    const qty = Number(cantidad);
    const montoNum = Number(monto);

    await conn.beginTransaction();

    // Validar cliente y bidones_prestados
    const [[cliente]] = await conn.query(
      'SELECT bidones_prestados, nombre FROM clientes WHERE id = ? FOR UPDATE', [cliente_id]
    );
    if (!cliente) { await conn.rollback(); conn.release(); return res.status(404).json({ error: 'Cliente no encontrado' }); }
    if (Number(cliente.bidones_prestados) < qty) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: `El cliente solo tiene ${cliente.bidones_prestados} bidones prestados` });
    }

    // Validar caja abierta
    const [[caja]] = await conn.query(
      "SELECT id FROM cajas WHERE estado IN ('abierta','reabierta') ORDER BY fecha DESC LIMIT 1"
    );
    if (!caja) { await conn.rollback(); conn.release(); return res.status(400).json({ error: 'No hay caja abierta' }); }

    // Buscar categoria "Cobro bidón perdido"
    const [[cat]] = await conn.query(
      "SELECT id FROM categorias_caja WHERE nombre = 'Cobro bidón perdido' AND tipo = 'ingreso' LIMIT 1"
    );

    // 1. Restar bidones_prestados del cliente
    await conn.query(
      'UPDATE clientes SET bidones_prestados = GREATEST(0, bidones_prestados - ?) WHERE id = ?',
      [qty, cliente_id]
    );

    // 2. Registrar ingreso en caja
    await conn.query(
      `INSERT INTO caja_movimientos (caja_id, tipo, metodo_pago, monto, descripcion, cliente_id, registrado_por, categoria_id)
       VALUES (?, 'ingreso', ?, ?, ?, ?, ?, ?)`,
      [caja.id, metodo_pago || 'efectivo', montoNum,
       `Bidón perdido x${qty} - ${cliente.nombre}${notas ? ' - ' + notas : ''}`,
       cliente_id, req.user.id, cat?.id || null]
    );

    // 3. Registrar en devoluciones como referencia (origen 'manual', notas indica que fue cobro)
    await conn.query(
      `INSERT INTO devoluciones (cliente_id, presentacion_id, cantidad, origen, fecha, notas, registrado_por)
       VALUES (?, ?, ?, 'manual', CURDATE(), ?, ?)`,
      [cliente_id, presentacion_id, qty,
       `Bidón perdido - cobrado S/${montoNum.toFixed(2)}${notas ? ' - ' + notas : ''}`,
       req.user.id]
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

/* == POST /api/devoluciones/bidon-perdido-ruta == */
exports.bidonPerdidoRuta = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { cliente_id, presentacion_id, cantidad, monto, metodo_pago, notas, ruta_id } = req.body;

    if (!cliente_id) { conn.release(); return res.status(400).json({ error: 'cliente_id es requerido' }); }
    if (!presentacion_id) { conn.release(); return res.status(400).json({ error: 'presentacion_id es requerido' }); }
    if (!ruta_id) { conn.release(); return res.status(400).json({ error: 'ruta_id es requerido' }); }
    if (!cantidad || Number(cantidad) <= 0) { conn.release(); return res.status(400).json({ error: 'La cantidad debe ser mayor a 0' }); }
    if (!monto || Number(monto) <= 0) { conn.release(); return res.status(400).json({ error: 'El monto debe ser mayor a 0' }); }

    const qty = Number(cantidad);
    const montoNum = Number(monto);

    await conn.beginTransaction();

    // Validar cliente
    const [[cliente]] = await conn.query(
      'SELECT bidones_prestados, nombre FROM clientes WHERE id = ? FOR UPDATE', [cliente_id]
    );
    if (!cliente) { await conn.rollback(); conn.release(); return res.status(404).json({ error: 'Cliente no encontrado' }); }
    if (Number(cliente.bidones_prestados) < qty) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: `El cliente solo tiene ${cliente.bidones_prestados} bidones prestados` });
    }

    // Validar caja_ruta abierta
    const [[cajaRuta]] = await conn.query(
      "SELECT id FROM caja_ruta WHERE ruta_id = ? AND estado = 'abierta' LIMIT 1", [ruta_id]
    );
    if (!cajaRuta) { await conn.rollback(); conn.release(); return res.status(400).json({ error: 'No hay caja de ruta abierta' }); }

    // Buscar categoria
    const [[cat]] = await conn.query(
      "SELECT id FROM categorias_caja WHERE nombre = 'Cobro bid\u00f3n perdido' AND tipo = 'ingreso' LIMIT 1"
    );

    // 1. Restar bidones_prestados
    await conn.query(
      'UPDATE clientes SET bidones_prestados = GREATEST(0, bidones_prestados - ?) WHERE id = ?',
      [qty, cliente_id]
    );

    // 2. Registrar ingreso en caja_ruta
    await conn.query(
      `INSERT INTO caja_ruta_movimientos (caja_ruta_id, tipo, clasificacion, categoria_id, metodo_pago, monto, descripcion, registrado_por)
       VALUES (?, 'ingreso', 'ingreso', ?, ?, ?, ?, ?)`,
      [cajaRuta.id, cat?.id || null, metodo_pago || 'efectivo', montoNum,
       `Bid\u00f3n perdido x${qty} - ${cliente.nombre}${notas ? ' - ' + notas : ''}`,
       req.user.id]
    );

    // 3. Actualizar totales caja_ruta
    const metodo = metodo_pago || 'efectivo';
    const colCobrado = metodo === 'efectivo' ? 'cobrado_efectivo'
      : metodo === 'transferencia' || metodo === 'yape' ? 'cobrado_transferencia'
      : metodo === 'tarjeta' ? 'cobrado_tarjeta' : 'cobrado_efectivo';
    await conn.query(
      `UPDATE caja_ruta SET
         ${colCobrado} = ${colCobrado} + ?,
         total_cobrado = total_cobrado + ?,
         neto_a_entregar = total_cobrado - total_gastos
       WHERE id = ?`,
      [montoNum, montoNum, cajaRuta.id]
    );

    // 4. Registrar en caja principal tambien
    const [[cajaPlanta]] = await conn.query(
      "SELECT id FROM cajas WHERE estado IN ('abierta','reabierta') ORDER BY fecha DESC LIMIT 1"
    );
    if (cajaPlanta) {
      await conn.query(
        `INSERT INTO caja_movimientos (caja_id, tipo, metodo_pago, monto, descripcion, cliente_id, registrado_por, origen, estado_entrega, caja_ruta_id, categoria_id)
         VALUES (?, 'ingreso', ?, ?, ?, ?, ?, 'repartidor', 'pendiente', ?, ?)`,
        [cajaPlanta.id, metodo, montoNum,
         `Bid\u00f3n perdido x${qty} - ${cliente.nombre}${notas ? ' - ' + notas : ''}`,
         cliente_id, req.user.id, cajaRuta.id, cat?.id || null]
      );
    }

    // 5. Registrar en devoluciones
    await conn.query(
      `INSERT INTO devoluciones (cliente_id, presentacion_id, cantidad, origen, ruta_id, fecha, notas, registrado_por)
       VALUES (?, ?, ?, 'reparto', ?, CURDATE(), ?, ?)`,
      [cliente_id, presentacion_id, qty, ruta_id,
       `Bid\u00f3n perdido - cobrado S/${montoNum.toFixed(2)}${notas ? ' - ' + notas : ''}`,
       req.user.id]
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

/* == POST /api/devoluciones/devolver-garantia == */
exports.devolverGarantia = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { cliente_id, monto, metodo_pago, notas } = req.body;

    if (!cliente_id) { conn.release(); return res.status(400).json({ error: 'cliente_id es requerido' }); }
    if (!monto || Number(monto) <= 0) { conn.release(); return res.status(400).json({ error: 'El monto debe ser mayor a 0' }); }

    const montoNum = Number(monto);

    await conn.beginTransaction();

    const [[cliente]] = await conn.query(
      'SELECT saldo_garantia, nombre FROM clientes WHERE id = ? FOR UPDATE', [cliente_id]
    );
    if (!cliente) { await conn.rollback(); conn.release(); return res.status(404).json({ error: 'Cliente no encontrado' }); }
    if (Number(cliente.saldo_garantia) <= 0) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'El cliente no tiene garant\u00eda pendiente' });
    }
    if (montoNum > Number(cliente.saldo_garantia)) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: `La garant\u00eda del cliente es S/${Number(cliente.saldo_garantia).toFixed(2)}. No puedes devolver m\u00e1s.` });
    }

    const [[caja]] = await conn.query(
      "SELECT id FROM cajas WHERE estado IN ('abierta','reabierta') ORDER BY fecha DESC LIMIT 1"
    );
    if (!caja) { await conn.rollback(); conn.release(); return res.status(400).json({ error: 'No hay caja abierta' }); }

    // Restar saldo_garantia
    await conn.query(
      'UPDATE clientes SET saldo_garantia = GREATEST(0, saldo_garantia - ?) WHERE id = ?',
      [montoNum, cliente_id]
    );

    // Registrar egreso en caja
    const { getCategoriaId } = require('../helpers/categoriaCaja');
    const catDev = await getCategoriaId('Devoluci\u00f3n garant\u00eda', conn);
    await conn.query(
      `INSERT INTO caja_movimientos (caja_id, tipo, metodo_pago, monto, descripcion, cliente_id, registrado_por, categoria_id)
       VALUES (?, 'egreso', ?, ?, ?, ?, ?, ?)`,
      [caja.id, metodo_pago || 'efectivo', montoNum,
       `Devoluci\u00f3n garant\u00eda S/${montoNum.toFixed(2)} - ${cliente.nombre}${notas ? ' - ' + notas : ''}`,
       cliente_id, req.user.id, catDev]
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