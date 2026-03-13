// controllers/deudasController.js
const db = require('../db');
const { parsePagination, paginatedResponse } = require('../helpers/paginate');

/* ── GET /api/deudas — Clientes con deuda ── */
exports.list = async (req, res) => {
  try {
    const { q } = req.query;
    const { page, limit, offset } = parsePagination(req.query);

    const conds = ['c.activo = 1', 'c.saldo_dinero > 0'];
    const params = [];
    if (q) { conds.push('c.nombre LIKE ?'); params.push(`%${q}%`); }

    const where = `WHERE ${conds.join(' AND ')}`;

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM clientes c ${where}`, params
    );

    const [rows] = await db.query(
      `SELECT c.id, c.nombre, c.tipo, c.telefono, c.saldo_dinero, c.bidones_prestados
         FROM clientes c
         ${where}
         ORDER BY c.saldo_dinero DESC
         LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json(paginatedResponse(rows, total, page, limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/deudas/:clienteId/ventas — Ventas al crédito de un cliente ── */
exports.ventasCredito = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT v.id, v.folio, v.fecha_hora, v.total, v.pagado_credito, v.deuda_generada, v.estado,
              COALESCE((SELECT SUM(p.monto) FROM pagos_clientes p WHERE p.venta_id = v.id AND p.estado = 'activo'), 0) AS total_abonado
         FROM ventas v
         WHERE v.cliente_id = ? AND v.pagado_credito > 0 AND v.estado != 'cancelada'
         ORDER BY v.fecha_hora DESC`,
      [req.params.clienteId]
    );

    // Calculate remaining debt per venta
    const data = rows.map(v => ({
      ...v,
      total_abonado: Number(v.total_abonado),
      saldo_pendiente: Math.max(0, Number(v.pagado_credito) - Number(v.total_abonado)),
    }));

    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/deudas/:clienteId/pagos — Historial de pagos de un cliente ── */
exports.historialPagos = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT p.*, u.nombre AS registrado_por_nombre, v.folio AS venta_folio
         FROM pagos_clientes p
         LEFT JOIN usuarios u ON u.id = p.registrado_por
         LEFT JOIN ventas v ON v.id = p.venta_id
         WHERE p.cliente_id = ?
         ORDER BY p.fecha_hora DESC
         LIMIT 50`,
      [req.params.clienteId]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── POST /api/deudas/:clienteId/pagar — Registrar pago/abono ── */
exports.registrarPago = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { monto, metodo_pago, venta_id, notas } = req.body;
    const clienteId = req.params.clienteId;

    if (!monto || Number(monto) <= 0) {
      conn.release();
      return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
    }
    // Validate metodo_pago against active methods (excluding credito — can't pay debt with credit)
    const [metodosRows] = await conn.query(
      "SELECT nombre FROM metodos_pago_config WHERE activo = 1 AND nombre != 'credito'"
    );
    const metodosValidos = metodosRows.map(r => r.nombre);
    if (!metodosValidos.includes(metodo_pago)) {
      conn.release();
      return res.status(400).json({ error: 'Método de pago inválido' });
    }

    await conn.beginTransaction();

    // Verify caja is open (con lock para evitar cierre concurrente)
    const [[cajaAbierta]] = await conn.query(
      "SELECT id FROM cajas WHERE estado IN ('abierta','reabierta') ORDER BY fecha DESC LIMIT 1 FOR UPDATE"
    );
    if (!cajaAbierta) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'No hay caja abierta. Abre la caja para registrar pagos.' });
    }

    // Verify client exists and has debt (con lock para serializar pagos del mismo cliente)
    const [[cliente]] = await conn.query(
      'SELECT id, nombre, saldo_dinero FROM clientes WHERE id = ? AND activo = 1 FOR UPDATE',
      [clienteId]
    );
    if (!cliente) {
      await conn.rollback(); conn.release();
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    if (Number(cliente.saldo_dinero) <= 0) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'El cliente no tiene deuda pendiente' });
    }
    if (Number(monto) > Number(cliente.saldo_dinero)) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: `El monto (S/ ${Number(monto).toFixed(2)}) excede la deuda actual del cliente (S/ ${Number(cliente.saldo_dinero).toFixed(2)}). Es posible que alguien más haya cobrado antes.` });
    }

    // Insert payment — trigger trg_abono_cliente handles saldo_dinero and caja_movimientos
    const [result] = await conn.query(
      `INSERT INTO pagos_clientes (cliente_id, venta_id, monto, metodo_pago, registrado_por, notas)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [clienteId, venta_id || null, Number(monto), metodo_pago, req.user.id, notas?.trim() || null]
    );

    await conn.commit();

    const [[pago]] = await db.query(
      `SELECT p.*, u.nombre AS registrado_por_nombre
         FROM pagos_clientes p
         LEFT JOIN usuarios u ON u.id = p.registrado_por
         WHERE p.id = ?`,
      [result.insertId]
    );

    const [[updated]] = await db.query(
      'SELECT saldo_dinero FROM clientes WHERE id = ?',
      [clienteId]
    );

    conn.release();
    res.status(201).json({ pago, saldo_actualizado: Number(updated.saldo_dinero) });
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    res.status(500).json({ error: err.message });
  }
};

/* ── PUT /api/deudas/pagos/:pagoId/anular — Anular un pago ── */
exports.anularPago = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Verify caja is open
    const [[cajaAbierta]] = await conn.query(
      "SELECT id FROM cajas WHERE estado IN ('abierta','reabierta') ORDER BY fecha DESC LIMIT 1"
    );
    if (!cajaAbierta) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'No hay caja abierta. Abre la caja para anular pagos.' });
    }

    const [[pago]] = await conn.query(
      'SELECT * FROM pagos_clientes WHERE id = ? FOR UPDATE',
      [req.params.pagoId]
    );
    if (!pago) {
      await conn.rollback(); conn.release();
      return res.status(404).json({ error: 'Pago no encontrado' });
    }
    if (pago.estado === 'anulado') {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'El pago ya está anulado' });
    }

    // 1. Mark pago as anulado
    await conn.query(
      "UPDATE pagos_clientes SET estado = 'anulado' WHERE id = ?",
      [pago.id]
    );

    // 2. Restore client debt (reverse what the trigger did)
    await conn.query(
      'UPDATE clientes SET saldo_dinero = saldo_dinero + ? WHERE id = ?',
      [pago.monto, pago.cliente_id]
    );

    // 3. Anular (soft delete) el caja_movimiento que el trigger creó
    await conn.query(
      "UPDATE caja_movimientos SET anulado = 1, anulado_por = ?, anulado_en = NOW() WHERE pago_id = ? AND anulado = 0",
      [req.user.id, pago.id]
    );

    await conn.commit();
    conn.release();

    // Get updated balance
    const [[updated]] = await db.query(
      'SELECT saldo_dinero FROM clientes WHERE id = ?',
      [pago.cliente_id]
    );

    res.json({ ok: true, saldo_actualizado: Number(updated.saldo_dinero) });
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    res.status(500).json({ error: err.message });
  }
};
