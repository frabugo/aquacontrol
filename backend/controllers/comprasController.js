// controllers/comprasController.js
const db = require('../db');
const { parsePagination, paginatedResponse } = require('../helpers/paginate');

/* ── GET /api/compras ── */
exports.list = async (req, res) => {
  try {
    const { fecha, fecha_inicio, fecha_fin, estado } = req.query;
    const { page, limit, offset } = parsePagination(req.query);

    const conds  = [];
    const params = [];
    if (fecha) {
      conds.push('c.fecha = ?'); params.push(fecha);
    } else {
      if (fecha_inicio) { conds.push('c.fecha >= ?'); params.push(fecha_inicio); }
      if (fecha_fin)    { conds.push('c.fecha <= ?'); params.push(fecha_fin); }
    }
    if (estado) { conds.push('c.estado = ?');  params.push(estado); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM compras c ${where}`, params
    );
    const [rows] = await db.query(
      `SELECT c.*, u.nombre AS registrado_por_nombre,
              pv.nombre AS proveedor_nombre,
              COALESCE((SELECT SUM(pp.monto) FROM pagos_proveedores pp WHERE pp.compra_id = c.id AND pp.estado = 'activo'), 0) AS total_pagado
         FROM compras c
         LEFT JOIN usuarios    u  ON u.id  = c.registrado_por
         LEFT JOIN proveedores pv ON pv.id = c.proveedor_id
         ${where}
         ORDER BY c.creado_en DESC
         LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    res.json(paginatedResponse(rows, total, page, limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/compras/:id ── */
exports.getOne = async (req, res) => {
  try {
    const [[compra]] = await db.query(
      `SELECT c.*, u.nombre AS registrado_por_nombre,
              pv.nombre AS proveedor_nombre, pv.telefono AS proveedor_telefono
         FROM compras c
         LEFT JOIN usuarios    u  ON u.id  = c.registrado_por
         LEFT JOIN proveedores pv ON pv.id = c.proveedor_id
         WHERE c.id = ?`,
      [req.params.id]
    );
    if (!compra) return res.status(404).json({ error: 'Compra no encontrada' });

    const [detalle] = await db.query(
      `SELECT cd.*,
              i.nombre  AS insumo_nombre,
              p.nombre  AS presentacion_nombre
         FROM compra_detalle cd
         LEFT JOIN insumos        i ON i.id = cd.insumo_id
         LEFT JOIN presentaciones p ON p.id = cd.presentacion_id
         WHERE cd.compra_id = ?
         ORDER BY cd.id`,
      [req.params.id]
    );
    res.json({ ...compra, detalle });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── POST /api/compras ── */
exports.create = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { proveedor, proveedor_id, fecha, notas, items = [] } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'Se requiere al menos un ítem' });
    }

    // Validar cada item antes de procesar
    for (const it of items) {
      const qty = Number(it.cantidad);
      const pu  = Number(it.precio_unitario);
      if (!qty || qty <= 0 || isNaN(qty)) {
        await conn.rollback(); conn.release();
        return res.status(400).json({ error: 'Cada ítem debe tener cantidad mayor a 0' });
      }
      if (isNaN(pu) || pu < 0) {
        await conn.rollback(); conn.release();
        return res.status(400).json({ error: 'Cada ítem debe tener precio_unitario válido' });
      }
    }

    const [[cajaPlanta]] = await conn.query(
      "SELECT id FROM cajas WHERE estado IN ('abierta','reabierta') LIMIT 1"
    );
    if (!cajaPlanta) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'No hay caja abierta. Abre la caja antes de registrar compras.' });
    }

    const total = items.reduce((s, it) => s + (Number(it.precio_unitario) * Number(it.cantidad)), 0);

    const [r] = await conn.query(
      `INSERT INTO compras (numero, proveedor_id, proveedor, fecha, total, registrado_por, notas)
       VALUES ('', ?, ?, ?, ?, ?, ?)`,
      [proveedor_id || null, proveedor?.trim() || null, fecha || null, total, req.user.id, notas?.trim() || null]
    );
    const compraId = r.insertId;

    for (const it of items) {
      const qty = Number(it.cantidad);
      const subtotal = Number(it.precio_unitario) * qty;
      await conn.query(
        `INSERT INTO compra_detalle
           (compra_id, tipo_item, insumo_id, presentacion_id,
            cantidad, precio_unitario, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          compraId,
          it.tipo_item || 'insumo',
          it.insumo_id       || null,
          it.presentacion_id || null,
          qty,
          Number(it.precio_unitario),
          subtotal,
        ]
      );

      // Actualizar stock directamente (no depender de trigger)
      if (it.tipo_item === 'insumo' && it.insumo_id) {
        await conn.query('UPDATE insumos SET stock_actual = stock_actual + ? WHERE id = ?', [qty, it.insumo_id]);
        await conn.query(
          `INSERT INTO insumos_movimientos (insumo_id, tipo, cantidad, costo_unitario, compra_id, motivo)
           VALUES (?, 'compra', ?, ?, ?, ?)`,
          [it.insumo_id, qty, Number(it.precio_unitario), compraId, `Compra #${compraId}`]
        );
      } else if (it.tipo_item === 'presentacion' && it.presentacion_id) {
        const [[pres]] = await conn.query('SELECT es_retornable, es_producto_final FROM presentaciones WHERE id = ?', [it.presentacion_id]);
        if (pres?.es_producto_final) {
          // Producto final: va directo a stock_llenos (listo para vender)
          await conn.query('UPDATE presentaciones SET stock_llenos = stock_llenos + ? WHERE id = ?', [qty, it.presentacion_id]);
          await conn.query(
            `INSERT INTO stock_movimientos (presentacion_id, tipo, cantidad, estado_origen, estado_destino, registrado_por, motivo)
             VALUES (?, 'compra_empresa', ?, NULL, 'lleno', ?, ?)`,
            [it.presentacion_id, qty, req.user.id, `Compra producto final #${compraId}`]
          );
        } else if (pres?.es_retornable) {
          await conn.query('UPDATE presentaciones SET stock_en_lavado = stock_en_lavado + ? WHERE id = ?', [qty, it.presentacion_id]);
          await conn.query(
            `INSERT INTO stock_movimientos (presentacion_id, tipo, cantidad, estado_origen, estado_destino, registrado_por, motivo)
             VALUES (?, 'compra_empresa', ?, NULL, 'en_lavado', ?, ?)`,
            [it.presentacion_id, qty, req.user.id, `Compra envases #${compraId}`]
          );
        } else {
          // No retornable y no producto final: va a stock_llenos por defecto
          await conn.query('UPDATE presentaciones SET stock_llenos = stock_llenos + ? WHERE id = ?', [qty, it.presentacion_id]);
          await conn.query(
            `INSERT INTO stock_movimientos (presentacion_id, tipo, cantidad, estado_origen, estado_destino, registrado_por, motivo)
             VALUES (?, 'compra_empresa', ?, NULL, 'lleno', ?, ?)`,
            [it.presentacion_id, qty, req.user.id, `Compra presentación #${compraId}`]
          );
        }
      }
    }

    // Registrar deuda al proveedor
    if (proveedor_id) {
      await conn.query('UPDATE proveedores SET saldo_deuda = saldo_deuda + ? WHERE id = ?', [total, proveedor_id]);
    }

    await conn.commit();
    conn.release();

    const [[compra]] = await db.query(`SELECT * FROM compras WHERE id = ?`, [compraId]);
    const [detalle]  = await db.query(
      `SELECT cd.*, i.nombre AS insumo_nombre, p.nombre AS presentacion_nombre
         FROM compra_detalle cd
         LEFT JOIN insumos i ON i.id = cd.insumo_id
         LEFT JOIN presentaciones p ON p.id = cd.presentacion_id
         WHERE cd.compra_id = ?`, [compraId]
    );
    res.status(201).json({ ...compra, detalle });
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    res.status(500).json({ error: err.message });
  }
};

/* ── PUT /api/compras/:id/anular ── */
exports.anular = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[compra]] = await conn.query(
      'SELECT * FROM compras WHERE id = ? FOR UPDATE', [req.params.id]
    );
    if (!compra) {
      await conn.rollback(); conn.release();
      return res.status(404).json({ error: 'Compra no encontrada' });
    }
    if (compra.estado === 'anulada') {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'La compra ya está anulada' });
    }

    // Obtener detalle para revertir stock
    const [detalle] = await conn.query(
      'SELECT * FROM compra_detalle WHERE compra_id = ?', [compra.id]
    );

    for (const item of detalle) {
      if (item.tipo_item === 'insumo' && item.insumo_id) {
        const [[insumo]] = await conn.query('SELECT stock_actual FROM insumos WHERE id = ?', [item.insumo_id]);
        const stockDisponible = insumo?.stock_actual || 0;
        const qty = Number(item.cantidad);

        // Clamp deduction to available stock (don't go negative)
        const deducir = Math.min(qty, stockDisponible);
        if (deducir > 0) {
          await conn.query('UPDATE insumos SET stock_actual = stock_actual - ? WHERE id = ?', [deducir, item.insumo_id]);
        }

        const deficit = qty - deducir;
        const motivo = deficit > 0
          ? `Anulación compra #${compra.numero} (déficit: ${deficit} uds ya consumidas)`
          : `Anulación compra #${compra.numero}`;

        await conn.query(
          `INSERT INTO insumos_movimientos (insumo_id, tipo, cantidad, compra_id, motivo)
           VALUES (?, 'ajuste_salida', ?, ?, ?)`,
          [item.insumo_id, deducir, compra.id, motivo]
        );

      } else if (item.tipo_item === 'presentacion' && item.presentacion_id) {
        const [[pres]] = await conn.query(
          'SELECT stock_en_lavado, stock_vacios, stock_llenos, es_producto_final FROM presentaciones WHERE id = ?',
          [item.presentacion_id]
        );
        if (pres) {
          let pendiente = Number(item.cantidad);

          if (pres.es_producto_final) {
            // Producto final: restar directo de stock_llenos
            await conn.query('UPDATE presentaciones SET stock_llenos = GREATEST(0, stock_llenos - ?) WHERE id = ?', [pendiente, item.presentacion_id]);
          } else {
            // 1. Restar de lavado primero
            const deLavado = Math.min(pendiente, pres.stock_en_lavado);
            if (deLavado > 0) {
              await conn.query('UPDATE presentaciones SET stock_en_lavado = stock_en_lavado - ? WHERE id = ?', [deLavado, item.presentacion_id]);
              pendiente -= deLavado;
            }
            // 2. Restar de vacíos
            if (pendiente > 0) {
              const deVacios = Math.min(pendiente, pres.stock_vacios);
              if (deVacios > 0) {
                await conn.query('UPDATE presentaciones SET stock_vacios = stock_vacios - ? WHERE id = ?', [deVacios, item.presentacion_id]);
                pendiente -= deVacios;
              }
            }
            // 3. Si aún queda, restar de llenos (ya pasó por producción)
            if (pendiente > 0) {
              await conn.query('UPDATE presentaciones SET stock_llenos = GREATEST(0, stock_llenos - ?) WHERE id = ?', [pendiente, item.presentacion_id]);
            }
          }
          // Trazabilidad
          const estadoOrigen = pres.es_producto_final ? 'lleno' : 'en_lavado';
          await conn.query(
            `INSERT INTO stock_movimientos (presentacion_id, tipo, cantidad, estado_origen, estado_destino, registrado_por, motivo)
             VALUES (?, 'ajuste', ?, ?, 'anulado', ?, ?)`,
            [item.presentacion_id, item.cantidad, estadoOrigen, req.user.id, `Anulación compra #${compra.numero}`]
          );
        }
      }
    }

    // Revertir pagos y deuda del proveedor
    if (compra.proveedor_id) {
      // Obtener pagos activos de esta compra
      const [pagosActivos] = await conn.query(
        "SELECT pp.id, pp.monto, cm.caja_id, c.estado AS caja_estado FROM pagos_proveedores pp LEFT JOIN caja_movimientos cm ON cm.pago_proveedor_id = pp.id LEFT JOIN cajas c ON c.id = cm.caja_id WHERE pp.compra_id = ? AND pp.estado = 'activo'",
        [compra.id]
      );

      // Verificar que ningún pago pertenezca a una caja ya cerrada
      for (const p of pagosActivos) {
        if (p.caja_estado && !['abierta', 'reabierta'].includes(p.caja_estado)) {
          await conn.rollback(); conn.release();
          return res.status(400).json({ error: 'No se puede anular: esta compra tiene pagos en una caja ya cerrada.' });
        }
      }

      // Anular todos los pagos activos
      let totalPagado = 0;
      for (const p of pagosActivos) {
        await conn.query("UPDATE pagos_proveedores SET estado = 'anulado' WHERE id = ?", [p.id]);
        await conn.query(
          "UPDATE caja_movimientos SET anulado = 1, anulado_por = ?, anulado_en = NOW() WHERE pago_proveedor_id = ? AND anulado = 0",
          [req.user.id, p.id]
        );
        totalPagado += Number(p.monto);
      }

      // Revertir deuda completa (total de la compra, ya que anulamos los pagos también)
      await conn.query('UPDATE proveedores SET saldo_deuda = GREATEST(0, saldo_deuda - ?) WHERE id = ?',
        [Number(compra.total) - totalPagado, compra.proveedor_id]);
    }

    // Marcar compra como anulada
    await conn.query(
      'UPDATE compras SET estado = ? WHERE id = ?', ['anulada', compra.id]
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

/* ── GET /api/compras/deudas-proveedores — Proveedores con deuda ── */
exports.deudasProveedores = async (req, res) => {
  try {
    const { q } = req.query;
    const { page, limit, offset } = parsePagination(req.query);

    const conds = ['p.activo = 1', 'p.saldo_deuda > 0'];
    const params = [];
    if (q) { conds.push('(p.nombre LIKE ? OR p.ruc LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }

    const where = `WHERE ${conds.join(' AND ')}`;

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM proveedores p ${where}`, params
    );
    const [rows] = await db.query(
      `SELECT p.id, p.nombre, p.ruc, p.telefono, p.saldo_deuda,
              (SELECT COUNT(*) FROM compras c WHERE c.proveedor_id = p.id AND c.estado != 'anulada') AS num_compras
         FROM proveedores p
         ${where}
         ORDER BY p.saldo_deuda DESC
         LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    res.json(paginatedResponse(rows, total, page, limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/compras/proveedor/:proveedorId/compras — Compras con deuda de un proveedor ── */
exports.comprasDeProveedor = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT c.id, c.numero, c.fecha, c.total, c.estado,
              COALESCE((SELECT SUM(pp.monto) FROM pagos_proveedores pp WHERE pp.compra_id = c.id AND pp.estado = 'activo'), 0) AS total_pagado
         FROM compras c
         WHERE c.proveedor_id = ? AND c.estado != 'anulada'
         ORDER BY c.fecha DESC`,
      [req.params.proveedorId]
    );
    const data = rows.map(c => ({
      ...c,
      total_pagado: Number(c.total_pagado),
      saldo_pendiente: Math.max(0, Number(c.total) - Number(c.total_pagado)),
    }));
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/compras/proveedor/:proveedorId/pagos — Historial de pagos a un proveedor ── */
exports.historialPagos = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT pp.*, u.nombre AS registrado_por_nombre, c.numero AS compra_numero
         FROM pagos_proveedores pp
         LEFT JOIN usuarios u ON u.id = pp.registrado_por
         LEFT JOIN compras c ON c.id = pp.compra_id
         WHERE pp.proveedor_id = ?
         ORDER BY pp.fecha_hora DESC
         LIMIT 50`,
      [req.params.proveedorId]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── POST /api/compras/pagar — Registrar pago a proveedor ── */
exports.registrarPago = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { proveedor_id, compra_id, monto, metodo_pago, notas } = req.body;

    if (!proveedor_id) { conn.release(); return res.status(400).json({ error: 'Proveedor requerido' }); }
    if (!monto || Number(monto) <= 0) { conn.release(); return res.status(400).json({ error: 'El monto debe ser mayor a 0' }); }

    // Validate metodo_pago (no credito)
    const [metodosRows] = await conn.query(
      "SELECT nombre FROM metodos_pago_config WHERE activo = 1 AND nombre != 'credito'"
    );
    const metodosValidos = metodosRows.map(r => r.nombre);
    if (!metodosValidos.includes(metodo_pago)) {
      conn.release(); return res.status(400).json({ error: 'Método de pago inválido' });
    }

    await conn.beginTransaction();

    // Verify caja abierta
    const [[cajaAbierta]] = await conn.query(
      "SELECT id FROM cajas WHERE estado IN ('abierta','reabierta') ORDER BY fecha DESC LIMIT 1 FOR UPDATE"
    );
    if (!cajaAbierta) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'No hay caja abierta. Abre la caja para registrar pagos.' });
    }

    // Verify proveedor and debt (FOR UPDATE para serializar pagos concurrentes)
    const [[proveedor]] = await conn.query(
      'SELECT id, nombre, saldo_deuda FROM proveedores WHERE id = ? AND activo = 1 FOR UPDATE',
      [proveedor_id]
    );
    if (!proveedor) {
      await conn.rollback(); conn.release();
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }
    if (Number(proveedor.saldo_deuda) <= 0) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'El proveedor no tiene deuda pendiente' });
    }
    if (Number(monto) > Number(proveedor.saldo_deuda)) {
      await conn.rollback(); conn.release();
      return res.status(400).json({
        error: `El monto (S/ ${Number(monto).toFixed(2)}) excede la deuda del proveedor (S/ ${Number(proveedor.saldo_deuda).toFixed(2)})`
      });
    }

    // If compra_id, verify it belongs to proveedor and has remaining debt
    if (compra_id) {
      const [[compra]] = await conn.query(
        "SELECT id, total, proveedor_id FROM compras WHERE id = ? AND estado != 'anulada'", [compra_id]
      );
      if (!compra || Number(compra.proveedor_id) !== Number(proveedor_id)) {
        await conn.rollback(); conn.release();
        return res.status(400).json({ error: 'Compra no válida para este proveedor' });
      }
      const [[pagosCompra]] = await conn.query(
        "SELECT COALESCE(SUM(monto), 0) AS t FROM pagos_proveedores WHERE compra_id = ? AND estado = 'activo'",
        [compra_id]
      );
      const saldoCompra = Number(compra.total) - Number(pagosCompra.t);
      if (Number(monto) > saldoCompra) {
        await conn.rollback(); conn.release();
        return res.status(400).json({
          error: `El monto excede la deuda de esta compra (S/ ${saldoCompra.toFixed(2)})`
        });
      }
    }

    // Insert payment
    const [result] = await conn.query(
      `INSERT INTO pagos_proveedores (compra_id, proveedor_id, monto, metodo_pago, registrado_por, notas)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [compra_id || null, proveedor_id, Number(monto), metodo_pago, req.user.id, notas?.trim() || null]
    );

    // Update saldo_deuda
    await conn.query(
      'UPDATE proveedores SET saldo_deuda = GREATEST(0, saldo_deuda - ?) WHERE id = ?',
      [Number(monto), proveedor_id]
    );

    // Create egreso in caja_movimientos
    const { getCategoriaId } = require('../helpers/categoriaCaja');
    const catPagoProv = await getCategoriaId('Pago proveedor', conn);
    const concepto = compra_id
      ? `Pago proveedor ${proveedor.nombre} — Compra #${compra_id}`
      : `Pago proveedor ${proveedor.nombre}`;
    await conn.query(
      `INSERT INTO caja_movimientos (caja_id, tipo, monto, metodo_pago, descripcion, registrado_por, pago_proveedor_id, categoria_id)
       VALUES (?, 'egreso', ?, ?, ?, ?, ?, ?)`,
      [cajaAbierta.id, Number(monto), metodo_pago, concepto, req.user.id, result.insertId, catPagoProv]
    );

    await conn.commit();

    // Get the created pago
    const [[pago]] = await db.query(
      `SELECT pp.*, u.nombre AS registrado_por_nombre
         FROM pagos_proveedores pp
         LEFT JOIN usuarios u ON u.id = pp.registrado_por
         WHERE pp.id = ?`,
      [result.insertId]
    );

    const [[updated]] = await db.query(
      'SELECT saldo_deuda FROM proveedores WHERE id = ?', [proveedor_id]
    );

    conn.release();
    res.status(201).json({ pago, saldo_actualizado: Number(updated.saldo_deuda) });
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    res.status(500).json({ error: err.message });
  }
};

/* ── PUT /api/compras/pagos/:pagoId/anular — Anular un pago a proveedor ── */
exports.anularPago = async (req, res) => {
  const conn = await db.getConnection();
  try {
    // Verify caja abierta
    const [[cajaAbierta]] = await conn.query(
      "SELECT id FROM cajas WHERE estado IN ('abierta','reabierta') ORDER BY fecha DESC LIMIT 1"
    );
    if (!cajaAbierta) {
      conn.release();
      return res.status(400).json({ error: 'No hay caja abierta para anular pagos.' });
    }

    await conn.beginTransaction();

    const [[pago]] = await conn.query(
      'SELECT * FROM pagos_proveedores WHERE id = ? FOR UPDATE', [req.params.pagoId]
    );
    if (!pago) { await conn.rollback(); conn.release(); return res.status(404).json({ error: 'Pago no encontrado' }); }
    if (pago.estado === 'anulado') { await conn.rollback(); conn.release(); return res.status(400).json({ error: 'El pago ya está anulado' }); }

    // Mark pago as anulado
    await conn.query("UPDATE pagos_proveedores SET estado = 'anulado' WHERE id = ?", [pago.id]);

    // Restore supplier debt
    await conn.query(
      'UPDATE proveedores SET saldo_deuda = saldo_deuda + ? WHERE id = ?',
      [pago.monto, pago.proveedor_id]
    );

    // Anular (soft delete) el caja_movimiento asociado
    await conn.query(
      "UPDATE caja_movimientos SET anulado = 1, anulado_por = ?, anulado_en = NOW() WHERE pago_proveedor_id = ? AND anulado = 0",
      [req.user.id, pago.id]
    );

    await conn.commit();
    conn.release();

    const [[updated]] = await db.query(
      'SELECT saldo_deuda FROM proveedores WHERE id = ?', [pago.proveedor_id]
    );

    res.json({ ok: true, saldo_actualizado: Number(updated.saldo_deuda) });
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    res.status(500).json({ error: err.message });
  }
};
