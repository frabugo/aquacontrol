// controllers/ventasController.js
const db = require('../db');
const getConfigValue = require('../helpers/getConfigValue');
const logAudit = require('../helpers/audit');
const { parsePagination, paginatedResponse } = require('../helpers/paginate');

/* ── GET /api/ventas ── */
exports.list = async (req, res) => {
  try {
    const { q, cliente_id, estado, fecha, fecha_inicio, fecha_fin, origen } = req.query;
    const { page, limit, offset } = parsePagination(req.query);

    const conds  = [];
    const params = [];

    if (fecha) {
      conds.push('DATE(v.fecha_hora) = ?');
      params.push(fecha);
    } else {
      if (fecha_inicio) { conds.push('DATE(v.fecha_hora) >= ?'); params.push(fecha_inicio); }
      if (fecha_fin)    { conds.push('DATE(v.fecha_hora) <= ?'); params.push(fecha_fin); }
    }
    if (cliente_id) { conds.push('v.cliente_id = ?');                   params.push(cliente_id); }
    if (estado)     { conds.push('v.estado = ?');                       params.push(estado); }
    if (origen)     { conds.push('v.origen = ?');                       params.push(origen); }
    if (q)          { conds.push('(v.folio LIKE ? OR c.nombre LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total
         FROM ventas v
         LEFT JOIN clientes c ON c.id = v.cliente_id
         ${where}`,
      params
    );

    // Totales por método de pago dinámico (desde venta_pagos)
    const [totalesPorMetodo] = await db.query(
      `SELECT vp.metodo_pago, COALESCE(SUM(vp.monto), 0) AS total
         FROM venta_pagos vp
         JOIN ventas v ON v.id = vp.venta_id
         LEFT JOIN clientes c ON c.id = v.cliente_id
         ${where ? where + " AND v.estado != 'cancelada'" : "WHERE v.estado != 'cancelada'"}
         GROUP BY vp.metodo_pago`,
      params
    );
    const [[{ suma_total: sumaTotal }]] = await db.query(
      `SELECT COALESCE(SUM(CASE WHEN v.estado != 'cancelada' THEN v.total ELSE 0 END), 0) AS suma_total
         FROM ventas v
         LEFT JOIN clientes c ON c.id = v.cliente_id
         ${where}`,
      params
    );
    const totales = { suma_total: Number(sumaTotal) };
    for (const r of totalesPorMetodo) totales[r.metodo_pago] = Number(r.total);

    const [rows] = await db.query(
      `SELECT v.*,
              c.nombre AS cliente_nombre,
              c.tipo   AS cliente_tipo,
              u.nombre AS vendedor_nombre,
              (SELECT COUNT(*) FROM venta_detalle d WHERE d.venta_id = v.id) AS num_lineas,
              comp.id          AS comprobante_id,
              comp.tipo_comprobante,
              comp.serie       AS comprobante_serie,
              comp.numero      AS comprobante_numero,
              comp.estado      AS comprobante_estado,
              comp.pdf_url     AS comprobante_pdf,
              comp.xml_url     AS comprobante_xml,
              comp.cdr_url     AS comprobante_cdr
         FROM ventas v
         LEFT JOIN clientes c ON c.id = v.cliente_id
         LEFT JOIN usuarios u ON u.id = v.vendedor_id
         LEFT JOIN comprobantes comp ON comp.id = (
           SELECT id FROM comprobantes
           WHERE venta_id = v.id AND estado = 'emitido' AND tipo_comprobante != 'guia_remision'
           ORDER BY id ASC LIMIT 1
         )
         ${where}
         ORDER BY v.fecha_hora DESC
         LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    // Cargar pagos de cada venta desde venta_pagos
    if (rows.length > 0) {
      const ids = rows.map(r => r.id);
      const [allPagos] = await db.query(
        `SELECT vp.*, m.etiqueta AS metodo_etiqueta, m.color AS metodo_color
           FROM venta_pagos vp
           LEFT JOIN metodos_pago_config m ON m.nombre = vp.metodo_pago
           WHERE vp.venta_id IN (${ids.map(() => '?').join(',')})`,
        ids
      );
      const pagosMap = {};
      for (const p of allPagos) {
        if (!pagosMap[p.venta_id]) pagosMap[p.venta_id] = [];
        pagosMap[p.venta_id].push(p);
      }
      for (const r of rows) r.pagos = pagosMap[r.id] || [];
    }

    res.json(paginatedResponse(rows, total, page, limit, { totales }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/ventas/precio-sugerido ── */
exports.getPrecioSugerido = async (req, res) => {
  try {
    const { cliente_id, presentacion_id, tipo_linea } = req.query;
    if (!presentacion_id || !tipo_linea) {
      return res.status(400).json({ error: 'Faltan presentacion_id y tipo_linea' });
    }

    // Try custom client price first
    if (cliente_id) {
      const [[especial]] = await db.query(
        `SELECT precio FROM precios_cliente
          WHERE cliente_id = ? AND presentacion_id = ? AND tipo_linea = ? AND activo = 1
          LIMIT 1`,
        [cliente_id, presentacion_id, tipo_linea]
      );
      if (especial) return res.json({ precio: Number(especial.precio), origen: 'especial' });
    }

    // Check client-level prices (campos del cliente)
    if (cliente_id) {
      const [[cli]] = await db.query(
        'SELECT precio_recarga_con_bidon, precio_recarga_sin_bidon, precio_bidon_lleno FROM clientes WHERE id = ?',
        [cliente_id]
      );
      if (cli) {
        let precioCliente = 0;
        if (tipo_linea === 'recarga')     precioCliente = Number(cli.precio_recarga_con_bidon);
        if (tipo_linea === 'prestamo')    precioCliente = Number(cli.precio_recarga_sin_bidon);
        if (tipo_linea === 'compra_bidon') precioCliente = Number(cli.precio_bidon_lleno);
        if (precioCliente > 0) return res.json({ precio: precioCliente, origen: 'cliente' });
      }
    }

    // Fallback to presentacion base price
    const [[pres]] = await db.query(
      'SELECT precio_base FROM presentaciones WHERE id = ?',
      [presentacion_id]
    );
    if (!pres) return res.status(404).json({ error: 'Presentación no encontrada' });

    res.json({ precio: Number(pres.precio_base), origen: 'base' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/ventas/:id ── */
exports.getOne = async (req, res) => {
  try {
    const [[venta]] = await db.query(
      `SELECT v.*,
              c.nombre    AS cliente_nombre,
              c.telefono  AS cliente_telefono,
              c.ruc_dni   AS cliente_dni,
              c.direccion AS cliente_direccion,
              c.ubigeo    AS cliente_ubigeo,
              u.nombre    AS vendedor_nombre
         FROM ventas v
         LEFT JOIN clientes c ON c.id = v.cliente_id
         LEFT JOIN usuarios u ON u.id = v.vendedor_id
         WHERE v.id = ?`,
      [req.params.id]
    );
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });

    const [lineas] = await db.query(
      `SELECT d.*, p.nombre AS presentacion_nombre, p.es_retornable
         FROM venta_detalle d
         JOIN presentaciones p ON p.id = d.presentacion_id
         WHERE d.venta_id = ?
         ORDER BY d.id`,
      [req.params.id]
    );

    const [movimientos] = await db.query(
      `SELECT cm.*, u.nombre AS registrado_por_nombre
         FROM caja_movimientos cm
         LEFT JOIN usuarios u ON u.id = cm.registrado_por
         WHERE cm.venta_id = ?
         ORDER BY cm.id`,
      [req.params.id]
    );

    const [ventaPagos] = await db.query(
      `SELECT vp.*, m.etiqueta AS metodo_etiqueta, m.color AS metodo_color
         FROM venta_pagos vp
         LEFT JOIN metodos_pago_config m ON m.nombre = vp.metodo_pago
         WHERE vp.venta_id = ?`,
      [req.params.id]
    );

    res.json({ ...venta, lineas, movimientos, pagos: ventaPagos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── POST /api/ventas ── */
exports.create = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Verify caja is open (any date, not just today)
    const [[caja]] = await conn.query(
      "SELECT id FROM cajas WHERE estado IN ('abierta','reabierta') ORDER BY fecha DESC LIMIT 1"
    );
    if (!caja) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'No hay caja abierta. Abre la caja antes de vender.' });
    }

    const {
      cliente_id,
      origen              = 'presencial',
      carga_id            = null,
      pedido_id           = null,
      descuento           = 0,
      pagado_efectivo     = 0,
      pagado_transferencia = 0,
      pagado_tarjeta      = 0,
      pagado_credito      = 0,
      pagos: pagosArray,
      notas,
      lineas = [],
    } = req.body;

    // Build normalized pagos array (accept new format or convert legacy)
    let pagos;
    if (Array.isArray(pagosArray) && pagosArray.length > 0) {
      pagos = pagosArray.filter(p => Number(p.monto) > 0).map(p => ({ metodo: p.metodo, monto: Number(p.monto) }));
    } else {
      // Legacy format → convert to pagos array
      pagos = [];
      if (Number(pagado_efectivo) > 0)      pagos.push({ metodo: 'efectivo',      monto: Number(pagado_efectivo) });
      if (Number(pagado_transferencia) > 0) pagos.push({ metodo: 'transferencia', monto: Number(pagado_transferencia) });
      if (Number(pagado_tarjeta) > 0)       pagos.push({ metodo: 'tarjeta',       monto: Number(pagado_tarjeta) });
      if (Number(pagado_credito) > 0)       pagos.push({ metodo: 'credito',       monto: Number(pagado_credito) });
    }

    // Validar que haya al menos un pago (excepto bonificaciones puras)
    const esSoloBonif = lineas.every(l => l.tipo_linea === 'bonificacion');
    if (pagos.length === 0 && !esSoloBonif) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'Selecciona al menos un método de pago' });
    }

    // Validate each metodo exists in metodos_pago_config and is active
    const [metodosActivos] = await conn.query('SELECT nombre FROM metodos_pago_config WHERE activo = 1');
    const metodosSet = new Set(metodosActivos.map(m => m.nombre));
    for (const p of pagos) {
      if (!metodosSet.has(p.metodo)) {
        await conn.rollback(); conn.release();
        return res.status(400).json({ error: `Método de pago inválido: ${p.metodo}` });
      }
    }

    // Bloquear ventas con origen='reparto' desde este endpoint.
    // Las ventas de reparto deben ir por pedidos/:id/entregar o rutas/:id/venta-rapida.
    if (origen === 'reparto') {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'Las ventas de reparto deben registrarse desde la app del repartidor' });
    }

    if (!cliente_id) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'Se requiere seleccionar un cliente' });
    }

    if (!Array.isArray(lineas) || lineas.length === 0) {
      await conn.rollback();
      conn.release();
      return res.status(400).json({ error: 'Se requiere al menos una línea de detalle' });
    }

    // ── Validar stock en planta si config lo exige ──
    const permitirSinStock = await getConfigValue('vender_sin_stock', '1', conn);
    if (permitirSinStock === '0') {
      for (const l of lineas) {
        const cant = Number(l.cantidad) || 1;
        const [[pres]] = await conn.query(
          'SELECT nombre, stock_llenos FROM presentaciones WHERE id = ? FOR UPDATE',
          [l.presentacion_id]
        );
        if (pres && cant > Number(pres.stock_llenos)) {
          await conn.rollback(); conn.release();
          return res.status(400).json({
            error: `Stock insuficiente de "${pres.nombre}". Disponible: ${pres.stock_llenos}, solicitado: ${cant}`,
          });
        }
      }
    }

    // Calculate totals from lines
    let subtotalLineas = 0;
    for (const l of lineas) {
      const sub = (Number(l.precio_unitario) - Number(l.descuento_linea || 0)) * Number(l.cantidad);
      subtotalLineas += sub;
    }
    const subtotal = subtotalLineas;
    const total    = Math.max(0, subtotal - Number(descuento));

    // Compute legacy columns from pagos array for backward compat
    const legacyEfectivo      = pagos.filter(p => p.metodo === 'efectivo').reduce((s, p) => s + p.monto, 0);
    const legacyTransferencia = pagos.filter(p => p.metodo === 'transferencia').reduce((s, p) => s + p.monto, 0);
    const legacyTarjeta       = pagos.filter(p => p.metodo === 'tarjeta').reduce((s, p) => s + p.monto, 0);
    const legacyCredito       = pagos.filter(p => p.metodo === 'credito').reduce((s, p) => s + p.monto, 0);

    const sumPagos = pagos.reduce((s, p) => s + p.monto, 0);
    if (Math.abs(sumPagos - total) > 0.02) {
      await conn.rollback();
      conn.release();
      return res.status(400).json({
        error: `Suma de pagos (${sumPagos.toFixed(2)}) ≠ total (${total.toFixed(2)})`,
      });
    }

    const deuda_generada = legacyCredito;
    const estado = deuda_generada > 0 ? 'pendiente' : 'pagada';

    // Insert venta header
    const repartidor_id = origen === 'reparto' ? req.user.id : null;
    const [result] = await conn.query(
      `INSERT INTO ventas
         (cliente_id, vendedor_id, repartidor_id, origen, carga_id, pedido_id,
          subtotal, descuento, total,
          pagado_efectivo, pagado_transferencia, pagado_tarjeta, pagado_credito,
          deuda_generada, estado, notas)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cliente_id || null,
        req.user.id,
        repartidor_id,
        origen,
        carga_id  || null,
        pedido_id || null,
        subtotal,
        Number(descuento),
        total,
        legacyEfectivo,
        legacyTransferencia,
        legacyTarjeta,
        legacyCredito,
        deuda_generada,
        estado,
        notas?.trim() || null,
      ]
    );
    const ventaId = result.insertId;

    // Insert into venta_pagos
    for (const p of pagos) {
      await conn.query(
        'INSERT INTO venta_pagos (venta_id, metodo_pago, monto) VALUES (?, ?, ?)',
        [ventaId, p.metodo, p.monto]
      );
    }

    // Insert each detail line (trigger handles stock + stock_movimientos)
    const TIPOS_VALIDOS = ['compra_bidon', 'recarga', 'prestamo', 'producto', 'bonificacion'];
    for (const l of lineas) {
      if (!l.presentacion_id) {
        await conn.rollback();
        conn.release();
        return res.status(400).json({ error: 'Cada línea requiere presentacion_id' });
      }
      if (!TIPOS_VALIDOS.includes(l.tipo_linea)) {
        await conn.rollback();
        conn.release();
        return res.status(400).json({ error: `tipo_linea inválido: ${l.tipo_linea}` });
      }
      const cantidad       = Number(l.cantidad) || 1;
      const vacios         = Math.min(Number(l.vacios_recibidos) || 0, (l.tipo_linea === 'recarga' || l.tipo_linea === 'bonificacion') ? cantidad : Infinity);
      const precioU        = Number(l.precio_unitario) || 0;
      const descL          = Number(l.descuento_linea) || 0;
      const subtotalLinea  = (precioU - descL) * cantidad;

      const garantiaLinea = (l.tipo_linea === 'prestamo' || (l.tipo_linea === 'recarga' && Number(l.garantia) > 0)) ? (Number(l.garantia) || 0) : 0;

      await conn.query(
        `INSERT INTO venta_detalle
           (venta_id, presentacion_id, tipo_linea, cantidad, vacios_recibidos,
            precio_unitario, descuento_linea, subtotal, carga_id, pedido_id, garantia)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [ventaId, l.presentacion_id, l.tipo_linea, cantidad, vacios,
         precioU, descL, subtotalLinea, carga_id || null, pedido_id || null, garantiaLinea]
      );

      // Registrar movimiento de stock (trazabilidad)
      await conn.query(
        `INSERT INTO stock_movimientos
           (presentacion_id, tipo, cantidad, estado_origen, estado_destino,
            venta_id, cliente_id, registrado_por, motivo)
         VALUES (?, 'venta', ?, 'lleno', 'vendido', ?, ?, ?, ?)`,
        [l.presentacion_id, cantidad, ventaId, cliente_id, req.user.id, `Venta #${ventaId}`]
      );
    }

    // Auto-create devoluciones for recarga lines with vacios
    let totalPrestamo = 0;
    for (const l of lineas) {
      const cantidad = Number(l.cantidad) || 1;
      const vacios = Math.min(Number(l.vacios_recibidos) || 0, cantidad);
      if ((l.tipo_linea === 'recarga' || l.tipo_linea === 'bonificacion') && vacios > 0 && cliente_id) {
        await conn.query(
          `INSERT INTO devoluciones (cliente_id, presentacion_id, cantidad, origen, venta_id, fecha, notas, registrado_por)
           VALUES (?, ?, ?, 'venta', ?, CURDATE(), ?, ?)`,
          [cliente_id, l.presentacion_id, vacios, ventaId, `Recarga venta #${ventaId}`, req.user.id]
        );
        // Vacíos recibidos en recarga van a lavado
        await conn.query(
          'UPDATE presentaciones SET stock_en_lavado = stock_en_lavado + ? WHERE id = ?',
          [vacios, l.presentacion_id]
        );
        // stock_movimientos lo registra el trigger trg_devolucion_a_lavado (no duplicar)
      }
      // Préstamo automático: vacíos faltantes en recargas retornables
      if ((l.tipo_linea === 'recarga' || l.tipo_linea === 'bonificacion') && cliente_id) {
        const faltantes = cantidad - vacios;
        if (faltantes > 0) {
          const [[pres]] = await conn.query(
            'SELECT es_retornable FROM presentaciones WHERE id = ?', [l.presentacion_id]
          );
          if (pres?.es_retornable) totalPrestamo += faltantes;
        }
      }
    }
    if (totalPrestamo > 0 && cliente_id) {
      await conn.query(
        'UPDATE clientes SET bidones_prestados = bidones_prestados + ? WHERE id = ?',
        [totalPrestamo, cliente_id]
      );
    }

    // Cobrar garantías de préstamos y recargas con faltantes
    let totalGarantia = 0;
    let garantiaMetodo = 'efectivo';
    for (const l of lineas) {
      if (Number(l.garantia) > 0) {
        totalGarantia += Number(l.garantia);
        if (l.garantia_metodo) garantiaMetodo = l.garantia_metodo;
      }
    }

    if (totalGarantia > 0 && cliente_id) {
      // Sumar saldo_garantia al cliente
      await conn.query(
        'UPDATE clientes SET saldo_garantia = saldo_garantia + ? WHERE id = ?',
        [totalGarantia, cliente_id]
      );
      // Registrar ingreso en caja
      const [[cajaAbierta]] = await conn.query(
        "SELECT id FROM cajas WHERE estado IN ('abierta','reabierta') ORDER BY fecha DESC LIMIT 1"
      );
      if (cajaAbierta) {
        const { getCategoriaId } = require('../helpers/categoriaCaja');
        const catGar = await getCategoriaId('Garantía recibida', conn);
        const [[cliNombre]] = await conn.query('SELECT nombre FROM clientes WHERE id = ?', [cliente_id]);
        await conn.query(
          `INSERT INTO caja_movimientos (caja_id, tipo, metodo_pago, monto, descripcion, cliente_id, venta_id, registrado_por, categoria_id)
           VALUES (?, 'ingreso', ?, ?, ?, ?, ?, ?, ?)`,
          [cajaAbierta.id, garantiaMetodo, totalGarantia,
           `Garantía x${totalPrestamo} bidón(es) - ${cliNombre?.nombre || 'Cliente'}`,
           cliente_id, ventaId, req.user.id, catGar]
        );
      }
    }

    // Update client balance if credit used
    if (cliente_id && deuda_generada > 0) {
      // Validar crédito máximo (0 = sin límite)
      const [[cli]] = await conn.query(
        'SELECT saldo_dinero, credito_maximo FROM clientes WHERE id = ?', [cliente_id]
      );
      if (cli && cli.credito_maximo > 0 && (Number(cli.saldo_dinero) + deuda_generada) > cli.credito_maximo) {
        await conn.rollback(); conn.release();
        return res.status(400).json({
          error: `El cliente excede su crédito máximo (S/${cli.credito_maximo}). Deuda actual: S/${cli.saldo_dinero}, nueva deuda: S/${deuda_generada}`
        });
      }
      await conn.query(
        'UPDATE clientes SET saldo_dinero = saldo_dinero + ? WHERE id = ?',
        [deuda_generada, cliente_id]
      );
    }

    // Create caja_movimientos directly (no trigger)
    const { getCategoriaId } = require('../helpers/categoriaCaja');
    const catVenta = await getCategoriaId('Venta', conn);
    for (const p of pagos) {
      if (p.monto > 0 && p.metodo !== 'credito') {
        await conn.query(
          `INSERT INTO caja_movimientos (caja_id, tipo, metodo_pago, monto, descripcion, venta_id, registrado_por, origen, categoria_id)
           VALUES (?, 'ingreso', ?, ?, ?, ?, ?, ?, ?)`,
          [caja.id, p.metodo, p.monto, `Venta`, ventaId, req.user.id, origen === 'reparto' ? 'repartidor' : 'directo', catVenta]
        );
      }
    }
    // Credit movement (tracked separately)
    if (legacyCredito > 0) {
      await conn.query(
        `INSERT INTO caja_movimientos (caja_id, tipo, metodo_pago, monto, descripcion, venta_id, registrado_por, origen, categoria_id)
         VALUES (?, 'ingreso', 'credito', ?, ?, ?, ?, ?, ?)`,
        [caja.id, legacyCredito, `Venta (crédito)`, ventaId, req.user.id, origen === 'reparto' ? 'repartidor' : 'directo', catVenta]
      );
    }

    await conn.commit();
    conn.release();

    // Return full venta with lineas
    const [[venta]] = await db.query(
      `SELECT v.*, c.nombre AS cliente_nombre, u.nombre AS vendedor_nombre
         FROM ventas v
         LEFT JOIN clientes c ON c.id = v.cliente_id
         LEFT JOIN usuarios u ON u.id = v.vendedor_id
         WHERE v.id = ?`,
      [ventaId]
    );
    const [lineasOut] = await db.query(
      `SELECT d.*, p.nombre AS presentacion_nombre, p.es_retornable
         FROM venta_detalle d
         JOIN presentaciones p ON p.id = d.presentacion_id
         WHERE d.venta_id = ? ORDER BY d.id`,
      [ventaId]
    );

    logAudit(req, { modulo: 'ventas', accion: 'crear', tabla: 'ventas', registro_id: ventaId, detalle: { folio: venta.folio, total, cliente_id } });
    res.status(201).json({ ...venta, lineas: lineasOut });
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    res.status(500).json({ error: err.message });
  }
};

/* ── PUT /api/ventas/:id/cancelar ── */
exports.cancelar = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[venta]] = await conn.query(
      'SELECT * FROM ventas WHERE id = ? FOR UPDATE',
      [req.params.id]
    );
    if (!venta) {
      await conn.rollback();
      conn.release();
      return res.status(404).json({ error: 'Venta no encontrada' });
    }
    if (venta.estado === 'cancelada') {
      await conn.rollback();
      conn.release();
      return res.status(400).json({ error: 'La venta ya está cancelada' });
    }

    // Only admin or encargada can cancel
    const rol = req.user.rol;
    if (rol !== 'admin' && rol !== 'encargada') {
      await conn.rollback(); conn.release();
      return res.status(403).json({ error: 'Solo admin o encargada pueden cancelar ventas' });
    }

    // Verify caja is open
    const [[cajaAbierta]] = await conn.query(
      "SELECT id FROM cajas WHERE estado IN ('abierta','reabierta') ORDER BY fecha DESC LIMIT 1"
    );
    if (!cajaAbierta) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'No hay caja abierta. Abre la caja para poder cancelar ventas.' });
    }

    // Fetch detail lines to reverse stock
    const [lineas] = await conn.query(
      'SELECT * FROM venta_detalle WHERE venta_id = ?',
      [req.params.id]
    );

    // Determinar si es venta de reparto (stock descontado del vehículo, no de planta)
    const isReparto = venta.origen === 'reparto' && venta.ruta_id;

    // Reverse stock for each line
    for (const l of lineas) {
      if (isReparto) {
        // Reparto: revertir stock_vehiculo (llenos_entregados / vacios_recogidos)
        if (['compra_bidon', 'recarga', 'producto', 'bonificacion'].includes(l.tipo_linea)) {
          await conn.query(
            `UPDATE stock_vehiculo SET llenos_entregados = GREATEST(0, llenos_entregados - ?)
             WHERE ruta_id = ? AND presentacion_id = ?`,
            [l.cantidad, venta.ruta_id, l.presentacion_id]
          );
          // Revertir prestamo auto de recarga/bonificacion en reparto
          if ((l.tipo_linea === 'recarga' || l.tipo_linea === 'bonificacion') && venta.cliente_id) {
            const faltantes = l.cantidad - l.vacios_recibidos;
            if (faltantes > 0) {
              await conn.query(
                'UPDATE clientes SET bidones_prestados = GREATEST(0, bidones_prestados - ?) WHERE id = ?',
                [faltantes, venta.cliente_id]
              );
            }
          }
        }
        if (l.tipo_linea === 'prestamo') {
          await conn.query(
            `UPDATE stock_vehiculo SET llenos_entregados = GREATEST(0, llenos_entregados - ?)
             WHERE ruta_id = ? AND presentacion_id = ?`,
            [l.cantidad, venta.ruta_id, l.presentacion_id]
          );
          if (venta.cliente_id) {
            await conn.query(
              'UPDATE clientes SET bidones_prestados = GREATEST(0, bidones_prestados - ?) WHERE id = ?',
              [l.cantidad, venta.cliente_id]
            );
          }
        }
        if (l.vacios_recibidos > 0) {
          await conn.query(
            `UPDATE stock_vehiculo SET vacios_recogidos = GREATEST(0, vacios_recogidos - ?)
             WHERE ruta_id = ? AND presentacion_id = ?`,
            [l.vacios_recibidos, venta.ruta_id, l.presentacion_id]
          );
        }
        if (l.tipo_linea === 'devolucion' && venta.cliente_id) {
          await conn.query(
            'UPDATE clientes SET bidones_prestados = bidones_prestados + ? WHERE id = ?',
            [l.vacios_recibidos, venta.cliente_id]
          );
        }
      } else {
        // Planta: revertir stock_llenos
        if (l.tipo_linea === 'compra_bidon' || l.tipo_linea === 'producto') {
          await conn.query(
            'UPDATE presentaciones SET stock_llenos = stock_llenos + ? WHERE id = ?',
            [l.cantidad, l.presentacion_id]
          );
        } else if (l.tipo_linea === 'recarga' || l.tipo_linea === 'bonificacion') {
          await conn.query(
            'UPDATE presentaciones SET stock_llenos = stock_llenos + ? WHERE id = ?',
            [l.cantidad, l.presentacion_id]
          );
          // Revertir prestamo auto (vacios faltantes que se sumaron como prestamo)
          if (venta.cliente_id) {
            const faltantes = l.cantidad - l.vacios_recibidos;
            if (faltantes > 0) {
              await conn.query(
                'UPDATE clientes SET bidones_prestados = GREATEST(0, bidones_prestados - ?) WHERE id = ?',
                [faltantes, venta.cliente_id]
              );
            }
          }
          // Revertir vacios a lavado lo hace el cascade de devoluciones mas abajo
        } else if (l.tipo_linea === 'prestamo') {
          await conn.query(
            'UPDATE presentaciones SET stock_llenos = stock_llenos + ? WHERE id = ?',
            [l.cantidad, l.presentacion_id]
          );
          if (venta.cliente_id) {
            await conn.query(
              'UPDATE clientes SET bidones_prestados = GREATEST(0, bidones_prestados - ?) WHERE id = ?',
              [l.cantidad, venta.cliente_id]
            );
          }
        } else if (l.tipo_linea === 'devolucion') {
          if (venta.cliente_id) {
            await conn.query(
              'UPDATE clientes SET bidones_prestados = bidones_prestados + ? WHERE id = ?',
              [l.vacios_recibidos, venta.cliente_id]
            );
          }
        }
      }

    }

    // Revertir garantias si la venta tenia
    const [lineasGar] = await conn.query(
      'SELECT garantia FROM venta_detalle WHERE venta_id = ? AND garantia > 0', [req.params.id]
    );
    const totalGarRevert = lineasGar.reduce((s, l) => s + Number(l.garantia), 0);
    if (totalGarRevert > 0 && venta.cliente_id) {
      await conn.query(
        'UPDATE clientes SET saldo_garantia = GREATEST(0, saldo_garantia - ?) WHERE id = ?',
        [totalGarRevert, venta.cliente_id]
      );
    }

    await conn.query('UPDATE ventas SET estado = ? WHERE id = ?', ['cancelada', req.params.id]);

    // Cascade: anular devoluciones vinculadas y revertir stock lavado
    const [devs] = await conn.query(
      "SELECT id, presentacion_id, cantidad, cliente_id FROM devoluciones WHERE venta_id = ? AND estado = 'activa'",
      [req.params.id]
    );
    for (const dev of devs) {
      // Restar de lavado los vacíos que se habían sumado
      await conn.query(
        'UPDATE presentaciones SET stock_en_lavado = GREATEST(0, stock_en_lavado - ?) WHERE id = ?',
        [dev.cantidad, dev.presentacion_id]
      );
      // Eliminar el stock_movimiento que envió bidones a lavado
      await conn.query(
        `DELETE FROM stock_movimientos
         WHERE presentacion_id = ? AND tipo = 'devolucion_cliente'
           AND estado_destino = 'en_lavado' AND cliente_id = ? AND cantidad = ?
         ORDER BY id DESC LIMIT 1`,
        [dev.presentacion_id, dev.cliente_id, dev.cantidad]
      );
    }
    await conn.query(
      "UPDATE devoluciones SET estado = 'anulada' WHERE venta_id = ? AND estado = 'activa'",
      [req.params.id]
    );

    // Anular caja_movimientos (soft delete para auditoría)
    await conn.query(
      "UPDATE caja_movimientos SET anulado = 1, anulado_por = ?, anulado_en = NOW() WHERE venta_id = ? AND tipo = 'ingreso' AND anulado = 0",
      [req.user.id, venta.id]
    );

    // Revertir caja_ruta si es venta de reparto
    if (isReparto) {
      const [[cajaRuta]] = await conn.query(
        'SELECT id FROM caja_ruta WHERE ruta_id = ? LIMIT 1', [venta.ruta_id]
      );
      if (cajaRuta) {
        const [ventaPagos] = await conn.query(
          'SELECT metodo_pago, monto FROM venta_pagos WHERE venta_id = ?', [venta.id]
        );
        let totalRevertir = 0;
        const cobradoEf = ventaPagos.filter(p => p.metodo_pago === 'efectivo').reduce((s, p) => s + Number(p.monto), 0);
        const cobradoTr = ventaPagos.filter(p => p.metodo_pago === 'transferencia').reduce((s, p) => s + Number(p.monto), 0);
        const cobradoTa = ventaPagos.filter(p => p.metodo_pago === 'tarjeta').reduce((s, p) => s + Number(p.monto), 0);
        const cobradoCr = ventaPagos.filter(p => p.metodo_pago === 'credito').reduce((s, p) => s + Number(p.monto), 0);
        totalRevertir = cobradoEf + cobradoTr + cobradoTa + cobradoCr;
        await conn.query(
          `UPDATE caja_ruta SET
             cobrado_efectivo = GREATEST(0, cobrado_efectivo - ?),
             cobrado_transferencia = GREATEST(0, cobrado_transferencia - ?),
             cobrado_tarjeta = GREATEST(0, cobrado_tarjeta - ?),
             cobrado_credito = GREATEST(0, cobrado_credito - ?),
             total_cobrado = GREATEST(0, total_cobrado - ?),
             neto_a_entregar = GREATEST(0, total_cobrado - total_gastos)
           WHERE id = ?`,
          [cobradoEf, cobradoTr, cobradoTa, cobradoCr, totalRevertir, cajaRuta.id]
        );
        // Registrar ajuste en caja_ruta_movimientos
        for (const p of ventaPagos) {
          if (Number(p.monto) > 0) {
            await conn.query(
              `INSERT INTO caja_ruta_movimientos (caja_ruta_id, venta_id, tipo, metodo_pago, monto, descripcion, registrado_por)
               VALUES (?, ?, 'ajuste', ?, ?, ?, ?)`,
              [cajaRuta.id, venta.id, p.metodo_pago, -Number(p.monto), `Cancelación venta #${venta.folio}`, req.user.id]
            );
          }
        }
      }
    }

    // Reverse client debt + cleanup pagos_clientes
    if (venta.cliente_id && venta.deuda_generada > 0) {
      // Buscar pagos (abonos) que el cliente ya hizo contra esta venta
      const [pagosHechos] = await conn.query(
        "SELECT id, monto FROM pagos_clientes WHERE venta_id = ? AND estado = 'activo'",
        [venta.id]
      );
      let totalYaPagado = 0;
      for (const pago of pagosHechos) {
        totalYaPagado += Number(pago.monto);
        // Anular el pago y revertir el saldo (trigger ya restó saldo_dinero, necesitamos revertir eso)
        await conn.query(
          "UPDATE pagos_clientes SET estado = 'anulado' WHERE id = ?",
          [pago.id]
        );
        // Anular los caja_movimientos generados por el trigger trg_abono_cliente
        await conn.query(
          "UPDATE caja_movimientos SET anulado = 1, anulado_por = ?, anulado_en = NOW() WHERE pago_id = ? AND anulado = 0",
          [req.user.id, pago.id]
        );
      }
      // Revertir: restar la deuda original, sumar lo que el cliente ya pagó (devolverle)
      // saldo actual = original + deuda_generada - totalYaPagado
      // queremos: original → restar (deuda_generada - totalYaPagado)
      const ajuste = venta.deuda_generada - totalYaPagado;
      if (ajuste > 0) {
        await conn.query(
          'UPDATE clientes SET saldo_dinero = GREATEST(0, saldo_dinero - ?) WHERE id = ?',
          [ajuste, venta.cliente_id]
        );
      } else if (ajuste < 0) {
        // Cliente pagó más de lo que debía (sobrepago), devolver la diferencia
        await conn.query(
          'UPDATE clientes SET saldo_dinero = saldo_dinero + ? WHERE id = ?',
          [Math.abs(ajuste), venta.cliente_id]
        );
      }
    }

    await conn.commit();
    conn.release();
    logAudit(req, { modulo: 'ventas', accion: 'cancelar', tabla: 'ventas', registro_id: Number(req.params.id), detalle: { folio: venta.folio, total: venta.total } });
    res.json({ ok: true, folio: venta.folio });
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/ventas/prediccion ── */
exports.prediccion = async (req, res) => {
  try {
    const dias = Math.min(180, Math.max(30, parseInt(req.query.dias) || 90));

    // 1. Ventas diarias (últimos N días, solo no canceladas)
    const [ventasDiarias] = await db.query(
      `SELECT DATE(fecha_hora) AS fecha,
              COUNT(*)                       AS cantidad,
              COALESCE(SUM(total), 0)        AS total,
              COALESCE(SUM(pagado_efectivo), 0)      AS efectivo,
              COALESCE(SUM(pagado_transferencia), 0) AS transferencia,
              COALESCE(SUM(pagado_tarjeta), 0)       AS tarjeta,
              COALESCE(SUM(pagado_credito), 0)       AS credito
         FROM ventas
        WHERE estado != 'cancelada'
          AND fecha_hora >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        GROUP BY DATE(fecha_hora)
        ORDER BY fecha ASC`,
      [dias]
    );

    // 2. Patrón por día de semana
    const [patronSemanal] = await db.query(
      `SELECT DAYOFWEEK(fecha_hora) AS dia_semana,
              COUNT(*) / COUNT(DISTINCT DATE(fecha_hora))  AS promedio_cantidad,
              SUM(total) / COUNT(DISTINCT DATE(fecha_hora)) AS promedio_total
         FROM ventas
        WHERE estado != 'cancelada'
          AND fecha_hora >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        GROUP BY DAYOFWEEK(fecha_hora)
        ORDER BY dia_semana`,
      [dias]
    );

    // 3. Top 10 productos más vendidos
    const [topProductos] = await db.query(
      `SELECT p.nombre, p.id AS presentacion_id,
              SUM(d.cantidad) AS unidades,
              SUM(d.subtotal) AS monto,
              COUNT(DISTINCT DATE(v.fecha_hora)) AS dias_con_venta
         FROM venta_detalle d
         JOIN ventas v ON v.id = d.venta_id
         JOIN presentaciones p ON p.id = d.presentacion_id
        WHERE v.estado != 'cancelada'
          AND v.fecha_hora >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        GROUP BY p.id, p.nombre
        ORDER BY monto DESC
        LIMIT 10`,
      [dias]
    );

    // 4. Top 10 clientes
    const [topClientes] = await db.query(
      `SELECT c.nombre, c.id AS cliente_id, c.tipo,
              COUNT(v.id) AS num_ventas,
              COALESCE(SUM(v.total), 0) AS monto
         FROM ventas v
         JOIN clientes c ON c.id = v.cliente_id
        WHERE v.estado != 'cancelada'
          AND v.fecha_hora >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        GROUP BY c.id, c.nombre, c.tipo
        ORDER BY monto DESC
        LIMIT 10`,
      [dias]
    );

    // 5. Comparación períodos (mitad reciente vs mitad anterior)
    const mitad = Math.floor(dias / 2);
    const [[periodoReciente]] = await db.query(
      `SELECT COUNT(*) AS cantidad, COALESCE(SUM(total), 0) AS total
         FROM ventas
        WHERE estado != 'cancelada'
          AND fecha_hora >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
      [mitad]
    );
    const [[periodoAnterior]] = await db.query(
      `SELECT COUNT(*) AS cantidad, COALESCE(SUM(total), 0) AS total
         FROM ventas
        WHERE estado != 'cancelada'
          AND fecha_hora >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
          AND fecha_hora <  DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
      [dias, mitad]
    );

    // 6. Demanda por presentación por día de semana (unidades)
    const [demandaSemanal] = await db.query(
      `SELECT DAYOFWEEK(v.fecha_hora) AS dia_semana,
              p.id AS presentacion_id, p.nombre AS presentacion,
              SUM(d.cantidad) AS total_unidades,
              COUNT(DISTINCT DATE(v.fecha_hora)) AS dias_contados,
              ROUND(SUM(d.cantidad) / COUNT(DISTINCT DATE(v.fecha_hora)), 1) AS promedio_unidades
         FROM venta_detalle d
         JOIN ventas v ON v.id = d.venta_id
         JOIN presentaciones p ON p.id = d.presentacion_id
        WHERE v.estado != 'cancelada'
          AND v.fecha_hora >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
          AND d.tipo_linea IN ('recarga','compra_bidon','prestamo','bonificacion')
        GROUP BY DAYOFWEEK(v.fecha_hora), p.id
        ORDER BY p.id, dia_semana`,
      [dias]
    );

    // 7. Stock actual de presentaciones retornables (para comparar con demanda)
    const [stockActual] = await db.query(
      `SELECT id AS presentacion_id, nombre, stock_llenos, stock_vacios, stock_en_lavado,
              es_retornable
         FROM presentaciones WHERE activo = 1 AND es_retornable = 1`
    );

    // 8. Ventas diarias en UNIDADES (para gráfico toggle)
    const [ventasUnidades] = await db.query(
      `SELECT DATE(v.fecha_hora) AS fecha,
              SUM(d.cantidad) AS unidades
         FROM venta_detalle d
         JOIN ventas v ON v.id = d.venta_id
        WHERE v.estado != 'cancelada'
          AND v.fecha_hora >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
          AND d.tipo_linea IN ('recarga','compra_bidon','prestamo','bonificacion')
        GROUP BY DATE(v.fecha_hora)
        ORDER BY fecha ASC`,
      [dias]
    );

    // 9. Patrón quincena (primera vs segunda mitad del mes)
    const [patronQuincena] = await db.query(
      `SELECT
         CASE WHEN DAY(fecha_hora) <= 15 THEN 'primera' ELSE 'segunda' END AS quincena,
         COUNT(*) / COUNT(DISTINCT DATE(fecha_hora)) AS promedio_ventas,
         SUM(total) / COUNT(DISTINCT DATE(fecha_hora)) AS promedio_monto,
         COUNT(DISTINCT DATE(fecha_hora)) AS dias_contados
       FROM ventas
       WHERE estado != 'cancelada'
         AND fecha_hora >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY quincena`,
      [dias]
    );

    // 10. Ventas por tipo de cliente
    const [ventasPorTipo] = await db.query(
      `SELECT c.tipo,
              COUNT(DISTINCT v.id) AS num_ventas,
              COUNT(DISTINCT c.id) AS num_clientes,
              COALESCE(SUM(v.total), 0) AS monto_total,
              SUM(d.cantidad) AS unidades_total,
              COUNT(DISTINCT DATE(v.fecha_hora)) AS dias_con_venta,
              ROUND(SUM(d.cantidad) / COUNT(DISTINCT DATE(v.fecha_hora)), 1) AS promedio_unidades_dia
         FROM ventas v
         JOIN clientes c ON c.id = v.cliente_id
         JOIN venta_detalle d ON d.venta_id = v.id
        WHERE v.estado != 'cancelada'
          AND v.fecha_hora >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
          AND d.tipo_linea IN ('recarga','compra_bidon','prestamo','bonificacion')
        GROUP BY c.tipo
        ORDER BY monto_total DESC`,
      [dias]
    );

    // 11. Días sin actividad (para detectar días que no se trabaja)
    const [diasSinVentas] = await db.query(
      `SELECT DAYOFWEEK(d.fecha) AS dia_semana,
              COUNT(*) AS dias_sin_venta
         FROM (
           SELECT DATE(fecha_hora) AS fecha FROM ventas
           WHERE estado != 'cancelada'
             AND fecha_hora >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
           GROUP BY DATE(fecha_hora)
         ) AS con_venta
         RIGHT JOIN (
           SELECT CURDATE() - INTERVAL seq DAY AS fecha
           FROM (SELECT @row := @row + 1 AS seq FROM information_schema.columns, (SELECT @row := -1) r LIMIT 180) nums
           WHERE CURDATE() - INTERVAL seq DAY >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
         ) AS d ON d.fecha = con_venta.fecha
         WHERE con_venta.fecha IS NULL
         GROUP BY DAYOFWEEK(d.fecha)
         ORDER BY dias_sin_venta DESC`,
      [dias, dias]
    );

    res.json({
      dias,
      ventas_diarias: ventasDiarias,
      ventas_unidades: ventasUnidades,
      patron_semanal: patronSemanal,
      top_productos: topProductos,
      top_clientes: topClientes,
      comparacion: {
        reciente: periodoReciente,
        anterior: periodoAnterior,
      },
      demanda_semanal: demandaSemanal,
      stock_actual: stockActual,
      patron_quincena: patronQuincena,
      ventas_por_tipo: ventasPorTipo,
      dias_sin_ventas: diasSinVentas,
    });
  } catch (err) {
    console.error('ventas.prediccion:', err.message);
    res.status(500).json({ error: 'Error calculando predicción' });
  }
};

/* ── GET /api/ventas/resumen-dia ── */
exports.resumenDia = async (req, res) => {
  try {
    const [[row]] = await db.query(
      `SELECT
         COUNT(CASE WHEN v.estado != 'cancelada' THEN 1 END) AS cantidad_ventas,
         COALESCE(SUM(CASE WHEN v.estado != 'cancelada' THEN v.total ELSE 0 END), 0) AS total_ventas
       FROM ventas v
       WHERE DATE(v.fecha_hora) = CURDATE()`
    );
    // Desglose dinámico por método de pago desde venta_pagos
    const [metodos] = await db.query(
      `SELECT vp.metodo_pago, COALESCE(SUM(vp.monto), 0) AS total
         FROM venta_pagos vp
         JOIN ventas v ON v.id = vp.venta_id
        WHERE DATE(v.fecha_hora) = CURDATE() AND v.estado != 'cancelada'
        GROUP BY vp.metodo_pago`
    );
    const por_metodo = {};
    for (const m of metodos) por_metodo[m.metodo_pago] = Number(m.total);
    // Backward compat
    row.total_efectivo = por_metodo.efectivo || 0;
    row.total_transferencia = por_metodo.transferencia || 0;
    row.total_tarjeta = por_metodo.tarjeta || 0;
    row.total_credito = por_metodo.credito || 0;
    row.por_metodo = por_metodo;
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


/* == GET /api/ventas/bonificaciones == */
exports.bonificaciones = async (req, res) => {
  try {
    const { fecha_inicio, fecha_fin } = req.query;
    const fi = fecha_inicio || new Date(Date.now() - 30*86400000).toISOString().slice(0, 10);
    const ff = fecha_fin || new Date().toISOString().slice(0, 10);

    // Resumen por cliente
    const [rows] = await db.query(
      `SELECT c.id AS cliente_id, c.nombre AS cliente_nombre, c.ruc_dni AS dni, c.tipo,
              SUM(vd.cantidad) AS total_bonificaciones,
              COUNT(DISTINCT v.id) AS total_ventas,
              GROUP_CONCAT(DISTINCT p.nombre SEPARATOR ', ') AS productos
         FROM venta_detalle vd
         JOIN ventas v ON v.id = vd.venta_id
         JOIN clientes c ON c.id = v.cliente_id
         LEFT JOIN presentaciones p ON p.id = vd.presentacion_id
         WHERE vd.tipo_linea = 'bonificacion'
           AND v.estado != 'cancelada'
           AND DATE(v.fecha_hora) >= ? AND DATE(v.fecha_hora) <= ?
         GROUP BY c.id
         ORDER BY total_bonificaciones DESC`,
      [fi, ff]
    );

    const total_general = rows.reduce((s, r) => s + Number(r.total_bonificaciones), 0);

    res.json({ data: rows, total_general, fecha_inicio: fi, fecha_fin: ff });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* == GET /api/ventas/bonificaciones/:clienteId == */
exports.bonificacionesDetalle = async (req, res) => {
  try {
    const { fecha_inicio, fecha_fin } = req.query;
    const fi = fecha_inicio || new Date(Date.now() - 30*86400000).toISOString().slice(0, 10);
    const ff = fecha_fin || new Date().toISOString().slice(0, 10);

    const [rows] = await db.query(
      `SELECT v.id AS venta_id, v.folio, v.fecha_hora, v.origen,
              vd.cantidad, vd.vacios_recibidos,
              p.nombre AS presentacion_nombre,
              u.nombre AS vendedor_nombre
         FROM venta_detalle vd
         JOIN ventas v ON v.id = vd.venta_id
         LEFT JOIN presentaciones p ON p.id = vd.presentacion_id
         LEFT JOIN usuarios u ON u.id = v.vendedor_id
         WHERE vd.tipo_linea = 'bonificacion'
           AND v.cliente_id = ?
           AND v.estado != 'cancelada'
           AND DATE(v.fecha_hora) >= ? AND DATE(v.fecha_hora) <= ?
         ORDER BY v.fecha_hora DESC`,
      [req.params.clienteId, fi, ff]
    );

    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* == GET /api/ventas/bonificaciones/analytics == */
exports.bonificacionesAnalytics = async (req, res) => {
  try {
    const { fecha_inicio, fecha_fin } = req.query;
    const fi = fecha_inicio || new Date(Date.now() - 30*86400000).toISOString().slice(0, 10);
    const ff = fecha_fin || new Date().toISOString().slice(0, 10);

    // 1. Ratio bonificacion/venta por cliente
    const [ratio] = await db.query(
      `SELECT c.id AS cliente_id, c.nombre,
              COALESCE(SUM(CASE WHEN vd.tipo_linea = 'bonificacion' THEN vd.cantidad ELSE 0 END), 0) AS bonificados,
              COALESCE(SUM(CASE WHEN vd.tipo_linea != 'bonificacion' THEN vd.cantidad ELSE 0 END), 0) AS vendidos,
              COALESCE(SUM(CASE WHEN vd.tipo_linea != 'bonificacion' THEN vd.subtotal ELSE 0 END), 0) AS facturado,
              COUNT(DISTINCT v.id) AS total_ventas
         FROM venta_detalle vd
         JOIN ventas v ON v.id = vd.venta_id
         JOIN clientes c ON c.id = v.cliente_id
         WHERE v.estado != 'cancelada'
           AND DATE(v.fecha_hora) >= ? AND DATE(v.fecha_hora) <= ?
         GROUP BY c.id
         HAVING bonificados > 0
         ORDER BY bonificados DESC`,
      [fi, ff]
    );

    const ratioData = ratio.map(r => ({
      ...r,
      bonificados: Number(r.bonificados),
      vendidos: Number(r.vendidos),
      facturado: Number(r.facturado),
      ratio_pct: Number(r.vendidos) > 0 ? Math.round(Number(r.bonificados) / Number(r.vendidos) * 100 * 10) / 10 : 0,
      cada_cuantos: Number(r.vendidos) > 0 ? Math.round(Number(r.vendidos) / Number(r.bonificados) * 10) / 10 : 0,
    }));

    // 2. Tendencia mensual
    const [tendencia] = await db.query(
      `SELECT DATE_FORMAT(v.fecha_hora, '%Y-%m') AS mes,
              SUM(CASE WHEN vd.tipo_linea = 'bonificacion' THEN vd.cantidad ELSE 0 END) AS bonificados,
              SUM(CASE WHEN vd.tipo_linea != 'bonificacion' THEN vd.cantidad ELSE 0 END) AS vendidos,
              SUM(CASE WHEN vd.tipo_linea != 'bonificacion' THEN vd.subtotal ELSE 0 END) AS facturado
         FROM venta_detalle vd
         JOIN ventas v ON v.id = vd.venta_id
         WHERE v.estado != 'cancelada'
           AND v.fecha_hora >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
         GROUP BY DATE_FORMAT(v.fecha_hora, '%Y-%m')
         ORDER BY mes ASC`,
      []
    );

    // 3. Por producto
    const [porProducto] = await db.query(
      `SELECT p.nombre AS producto,
              SUM(vd.cantidad) AS bonificados,
              COUNT(DISTINCT v.id) AS ventas
         FROM venta_detalle vd
         JOIN ventas v ON v.id = vd.venta_id
         JOIN presentaciones p ON p.id = vd.presentacion_id
         WHERE vd.tipo_linea = 'bonificacion'
           AND v.estado != 'cancelada'
           AND DATE(v.fecha_hora) >= ? AND DATE(v.fecha_hora) <= ?
         GROUP BY p.id
         ORDER BY bonificados DESC`,
      [fi, ff]
    );

    // 4. Totales
    const totalBonif = ratioData.reduce((s, r) => s + r.bonificados, 0);
    const totalVendidos = ratioData.reduce((s, r) => s + r.vendidos, 0);
    const totalFacturado = ratioData.reduce((s, r) => s + r.facturado, 0);

    // 5. Costo estimado (usar precio_base de cada presentacion)
    const [[costoBonif]] = await db.query(
      `SELECT COALESCE(SUM(vd.cantidad * p.precio_base), 0) AS costo_bonificaciones
         FROM venta_detalle vd
         JOIN ventas v ON v.id = vd.venta_id
         JOIN presentaciones p ON p.id = vd.presentacion_id
         WHERE vd.tipo_linea = 'bonificacion'
           AND v.estado != 'cancelada'
           AND DATE(v.fecha_hora) >= ? AND DATE(v.fecha_hora) <= ?`,
      [fi, ff]
    );

    res.json({
      periodo: { inicio: fi, fin: ff },
      totales: {
        bonificados: totalBonif,
        vendidos: totalVendidos,
        facturado: totalFacturado,
        costo_bonificaciones: Number(costoBonif.costo_bonificaciones),
        ratio_global_pct: totalVendidos > 0 ? Math.round(totalBonif / totalVendidos * 100 * 10) / 10 : 0,
        rentabilidad: totalFacturado - Number(costoBonif.costo_bonificaciones),
      },
      ratio_por_cliente: ratioData,
      tendencia_mensual: tendencia.map(t => ({
        mes: t.mes,
        bonificados: Number(t.bonificados),
        vendidos: Number(t.vendidos),
        facturado: Number(t.facturado),
      })),
      por_producto: porProducto.map(p => ({
        producto: p.producto,
        bonificados: Number(p.bonificados),
        ventas: Number(p.ventas),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};