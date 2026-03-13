// controllers/pedidosController.js — Módulo Reparto
const db = require('../db');
const getConfigValue = require('../helpers/getConfigValue');
const logAudit = require('../helpers/audit');
const { parsePagination, paginatedResponse } = require('../helpers/paginate');
const { sendPushToUser } = require('../helpers/sendPush');

/* ── Helper: notificar al repartidor vía socket + push ── */
async function emitirNuevoPedido(req, repartidor_id, pedido_id) {
  if (!repartidor_id) return;
  try {
    const [rows] = await db.query(`
      SELECT p.numero, u.nombre AS repartidor_nombre, u.notif_pedidos, c.nombre AS cliente_nombre
        FROM pedidos p
        JOIN usuarios u ON u.id = ?
        LEFT JOIN clientes c ON c.id = p.cliente_id
       WHERE p.id = ?`, [repartidor_id, pedido_id]);
    if (rows.length === 0) return;

    const data = {
      pedido_id,
      numero:            rows[0].numero,
      cliente:           rows[0].cliente_nombre,
      repartidor_nombre: rows[0].repartidor_nombre,
      timestamp:         Date.now(),
    };

    // Socket (cuando la app esta abierta — siempre emitir para la campana)
    const io = req.app.get('io');
    if (io) {
      io.to(`repartidor_${repartidor_id}`).emit('pedido:nuevo', data);
    }

    // Web Push (cuando la app esta cerrada — solo si notif_pedidos activo)
    if (rows[0].notif_pedidos) {
      const nombre = rows[0].repartidor_nombre?.split(' ')[0] || 'Repartidor';
      sendPushToUser(repartidor_id, {
        title: 'Nuevo pedido',
        body: `Hola ${nombre}, tienes un nuevo pedido${rows[0].cliente_nombre ? ` de ${rows[0].cliente_nombre}` : ''}`,
        data: { url: '/repartidor/pedidos', pedido_id, numero: rows[0].numero },
      });
    }
  } catch (err) {
    console.error('Error emitirNuevoPedido:', err.message);
  }
}

/* ── GET /api/pedidos ── */
exports.list = async (req, res) => {
  try {
    const { fecha, fecha_inicio, fecha_fin, ruta_id, repartidor_id, estado, cliente_id, q } = req.query;
    const { page, limit, offset } = parsePagination(req.query);

    const conds  = [];
    const params = [];
    if (fecha_inicio) { conds.push('p.fecha >= ?'); params.push(fecha_inicio); }
    if (fecha_fin)    { conds.push('p.fecha <= ?'); params.push(fecha_fin); }
    if (fecha && !fecha_inicio && !fecha_fin) { conds.push('p.fecha = ?'); params.push(fecha); }
    if (ruta_id)       { conds.push('p.ruta_id = ?');        params.push(ruta_id); }
    if (repartidor_id) { conds.push('(p.repartidor_id = ? OR r.repartidor_id = ?)'); params.push(repartidor_id, repartidor_id); }
    if (estado)        { conds.push('p.estado = ?');       params.push(estado); }
    if (cliente_id) { conds.push('p.cliente_id = ?');  params.push(cliente_id); }
    if (q)          { conds.push('(c.nombre LIKE ? OR p.numero LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM pedidos p
         LEFT JOIN clientes c ON c.id = p.cliente_id
         LEFT JOIN rutas r ON r.id = p.ruta_id
         ${where}`,
      params
    );

    const [rows] = await db.query(
      `SELECT p.id, p.numero, p.fecha, p.estado, p.orden_entrega, p.ruta_id, p.repartidor_id,
              p.notas_encargada, p.notas_repartidor, p.latitud, p.longitud,
              p.creado_en, p.venta_id,
              c.id AS cliente_id, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono,
              COALESCE(p.direccion_entrega, c.direccion, '') AS cliente_direccion,
              c.latitud AS cliente_lat, c.longitud AS cliente_lng,
              r.numero AS ruta_numero,
              COALESCE(rep.nombre, ru.nombre) AS repartidor_nombre,
              COALESCE(p.repartidor_id, r.repartidor_id) AS repartidor_id_resuelto,
              a.nombre AS asignado_por_nombre,
              GROUP_CONCAT(
                CONCAT(pr.nombre, ' x', pd.cantidad)
                ORDER BY pd.id SEPARATOR ', '
              ) AS productos_resumen
         FROM pedidos p
         LEFT JOIN clientes c       ON c.id = p.cliente_id
         LEFT JOIN rutas r          ON r.id = p.ruta_id
         LEFT JOIN usuarios rep     ON rep.id = p.repartidor_id
         LEFT JOIN usuarios ru      ON ru.id = r.repartidor_id
         LEFT JOIN usuarios a       ON a.id = p.asignado_por
         LEFT JOIN pedido_detalle pd ON pd.pedido_id = p.id
         LEFT JOIN presentaciones pr ON pr.id = pd.presentacion_id
         ${where}
         GROUP BY p.id
         ORDER BY p.fecha DESC,
                  FIELD(p.estado, 'pendiente', 'en_camino', 'no_entregado', 'entregado', 'cancelado', 'reasignado'),
                  p.orden_entrega ASC
         LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json(paginatedResponse(rows, total, page, limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/pedidos/mapa ── */
exports.mapData = async (req, res) => {
  try {
    const ruta_id = req.query.ruta_id || null;
    const repartidor_id = req.query.repartidor_id || null;

    const conds  = ["p.estado != 'reasignado'"];
    const params = [];

    // Si piden por ruta_id, no filtrar por fecha (la ruta vive hasta finalizar)
    // Si no, usar fecha explícita o la de hoy
    if (!ruta_id) {
      const fecha = req.query.fecha || new Date().toISOString().slice(0, 10);
      conds.push('p.fecha = ?');
      params.push(fecha);
    }
    if (ruta_id) { conds.push('p.ruta_id = ?'); params.push(ruta_id); }
    if (repartidor_id) { conds.push('(p.repartidor_id = ? OR r.repartidor_id = ?)'); params.push(repartidor_id, repartidor_id); }

    const [rows] = await db.query(
      `SELECT p.id, p.numero, p.estado, p.orden_entrega, p.ruta_id, p.repartidor_id,
              c.nombre AS cliente_nombre, c.telefono AS cliente_telefono,
              COALESCE(p.direccion_entrega, c.direccion, '') AS direccion,
              COALESCE(p.latitud, c.latitud) AS lat,
              COALESCE(p.longitud, c.longitud) AS lng,
              p.notas_encargada,
              r.numero AS ruta_numero, COALESCE(rep.nombre, ru.nombre) AS repartidor_nombre,
              GROUP_CONCAT(
                CONCAT(pr.nombre, ' x', pd.cantidad)
                ORDER BY pd.id SEPARATOR ', '
              ) AS productos_resumen
         FROM pedidos p
         JOIN clientes c ON c.id = p.cliente_id
         LEFT JOIN rutas r ON r.id = p.ruta_id
         LEFT JOIN usuarios rep ON rep.id = p.repartidor_id
         LEFT JOIN usuarios ru ON ru.id = r.repartidor_id
         LEFT JOIN pedido_detalle pd ON pd.pedido_id = p.id
         LEFT JOIN presentaciones pr ON pr.id = pd.presentacion_id
         WHERE ${conds.join(' AND ')}
         GROUP BY p.id
         ORDER BY p.orden_entrega ASC`,
      params
    );

    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/pedidos/repartidores ── */
exports.repartidores = async (req, res) => {
  try {
    // 1 query: repartidores + su ruta activa (si existe) via LEFT JOIN
    const [rows] = await db.query(
      `SELECT u.id, u.nombre, r.id AS ruta_id
         FROM usuarios u
         LEFT JOIN rutas r ON r.repartidor_id = u.id
           AND r.estado IN ('preparando','en_ruta','regresando')
        WHERE u.rol = 'chofer' AND u.activo = 1
        ORDER BY u.nombre`
    );

    // Deduplicate: keep most recent ruta per repartidor
    const repMap = new Map();
    for (const row of rows) {
      if (!repMap.has(row.id)) {
        repMap.set(row.id, { id: row.id, nombre: row.nombre, ruta_id: row.ruta_id || null, stock: [] });
      }
    }
    const repartidores = Array.from(repMap.values());

    // 2nd query: batch stock for all active rutas
    const rutaIds = repartidores.filter(r => r.ruta_id).map(r => r.ruta_id);
    if (rutaIds.length > 0) {
      const [stockRows] = await db.query(
        `SELECT sv.ruta_id, sv.presentacion_id, p.nombre AS presentacion_nombre,
                (sv.llenos_cargados - sv.llenos_entregados) AS llenos_disponibles
           FROM stock_vehiculo sv
           JOIN presentaciones p ON p.id = sv.presentacion_id
          WHERE sv.ruta_id IN (${rutaIds.map(() => '?').join(',')})
            AND (sv.llenos_cargados - sv.llenos_entregados) > 0
          ORDER BY p.nombre`,
        rutaIds
      );
      // Group stock by ruta_id
      const stockMap = new Map();
      for (const s of stockRows) {
        if (!stockMap.has(s.ruta_id)) stockMap.set(s.ruta_id, []);
        stockMap.get(s.ruta_id).push(s);
      }
      for (const rep of repartidores) {
        if (rep.ruta_id) rep.stock = stockMap.get(rep.ruta_id) || [];
      }
    }

    res.json({ data: repartidores });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/pedidos/:id ── */
exports.getOne = async (req, res) => {
  try {
    const [[pedido]] = await db.query(
      `SELECT p.*,
              c.nombre AS cliente_nombre, c.telefono AS cliente_telefono,
              COALESCE(p.direccion_entrega, c.direccion, '') AS cliente_direccion,
              c.latitud AS cliente_lat, c.longitud AS cliente_lng,
              r.numero AS ruta_numero,
              COALESCE(rep.nombre, ru.nombre) AS repartidor_nombre,
              COALESCE(p.repartidor_id, r.repartidor_id) AS repartidor_id_resuelto,
              a.nombre AS asignado_por_nombre
         FROM pedidos p
         LEFT JOIN clientes c ON c.id = p.cliente_id
         LEFT JOIN rutas r ON r.id = p.ruta_id
         LEFT JOIN usuarios rep ON rep.id = p.repartidor_id
         LEFT JOIN usuarios ru ON ru.id = r.repartidor_id
         LEFT JOIN usuarios a ON a.id = p.asignado_por
         WHERE p.id = ?`,
      [req.params.id]
    );
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

    // Chofer solo puede ver sus propios pedidos
    if (req.user.rol === 'chofer') {
      const dueño = pedido.repartidor_id_resuelto || pedido.repartidor_id;
      if (dueño && dueño !== req.user.id) {
        return res.status(403).json({ error: 'No tienes acceso a este pedido' });
      }
    }

    const [detalle] = await db.query(
      `SELECT pd.*, pr.nombre AS presentacion_nombre, pr.es_retornable, pr.precio_base
         FROM pedido_detalle pd
         LEFT JOIN presentaciones pr ON pr.id = pd.presentacion_id
         WHERE pd.pedido_id = ?`,
      [pedido.id]
    );
    pedido.detalle = detalle;
    res.json(pedido);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── POST /api/pedidos ── */
exports.create = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const {
      ruta_id, repartidor_id, cliente_id, fecha, notas_encargada,
      latitud, longitud, direccion_entrega, orden_entrega, detalle,
    } = req.body;

    if (!cliente_id) { conn.release(); return res.status(400).json({ error: 'Selecciona un cliente' }); }
    if (!Array.isArray(detalle) || detalle.length === 0) {
      conn.release(); return res.status(400).json({ error: 'Agrega al menos un producto al pedido' });
    }

    await conn.beginTransaction();

    // La caja no se requiere para crear pedidos (pueden registrarse de noche).
    // Solo se valida al momento de entregar (cuando se genera la venta).

    const [result] = await conn.query(
      `INSERT INTO pedidos
         (numero, ruta_id, repartidor_id, cliente_id, fecha, notas_encargada,
          latitud, longitud, direccion_entrega, orden_entrega, asignado_por)
       VALUES ('', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ruta_id || null, repartidor_id || null, cliente_id,
        fecha || new Date().toISOString().slice(0, 10),
        notas_encargada?.trim() || null,
        latitud || null, longitud || null,
        direccion_entrega?.trim() || null,
        orden_entrega || 1, req.user.id,
      ]
    );
    const pedidoId = result.insertId;

    for (const line of detalle) {
      const sub = (Number(line.precio_unitario) || 0) * (Number(line.cantidad) || 1);
      await conn.query(
        `INSERT INTO pedido_detalle
           (pedido_id, presentacion_id, tipo_linea, cantidad, vacios_esperados, precio_unitario, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [pedidoId, line.presentacion_id, line.tipo_linea || 'producto',
         line.cantidad || 1, line.vacios_esperados || 0, line.precio_unitario || 0, sub]
      );
    }

    await conn.commit();
    conn.release();

    const [[created]] = await db.query(
      `SELECT p.*, c.nombre AS cliente_nombre
         FROM pedidos p LEFT JOIN clientes c ON c.id = p.cliente_id WHERE p.id = ?`,
      [pedidoId]
    );

    // Notificar al repartidor si fue asignado al crear
    if (repartidor_id) {
      await emitirNuevoPedido(req, repartidor_id, pedidoId);
    } else if (ruta_id) {
      const [[ruta]] = await db.query('SELECT repartidor_id FROM rutas WHERE id = ?', [ruta_id]);
      if (ruta?.repartidor_id) await emitirNuevoPedido(req, ruta.repartidor_id, pedidoId);
    }

    logAudit(req, { modulo: 'pedidos', accion: 'crear', tabla: 'pedidos', registro_id: pedidoId, detalle: { cliente_id, ruta_id: ruta_id || null } });
    res.status(201).json(created);
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    res.status(500).json({ error: err.message });
  }
};

/* ── PUT /api/pedidos/:id ── */
exports.update = async (req, res) => {
  try {
    const [[pedido]] = await db.query('SELECT id, estado FROM pedidos WHERE id = ?', [req.params.id]);
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
    if (pedido.estado !== 'pendiente') {
      return res.status(400).json({ error: 'Solo se pueden editar pedidos pendientes' });
    }

    const { notas_encargada, latitud, longitud, direccion_entrega, orden_entrega } = req.body;
    await db.query(
      `UPDATE pedidos SET
         notas_encargada = COALESCE(?, notas_encargada),
         latitud = COALESCE(?, latitud),
         longitud = COALESCE(?, longitud),
         direccion_entrega = COALESCE(?, direccion_entrega),
         orden_entrega = COALESCE(?, orden_entrega)
       WHERE id = ?`,
      [notas_encargada, latitud, longitud, direccion_entrega, orden_entrega, pedido.id]
    );
    logAudit(req, { modulo: 'pedidos', accion: 'editar', tabla: 'pedidos', registro_id: Number(req.params.id) });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── PUT /api/pedidos/:id/asignar-ruta ── */
exports.asignarRuta = async (req, res) => {
  try {
    const { ruta_id } = req.body;
    const pedido_id = req.params.id;
    const [result] = await db.query(
      "UPDATE pedidos SET ruta_id = ? WHERE id = ? AND estado = 'pendiente'",
      [ruta_id || null, pedido_id]
    );
    if (result.affectedRows === 0) {
      const [[exists]] = await db.query('SELECT estado FROM pedidos WHERE id = ?', [pedido_id]);
      if (!exists) return res.status(404).json({ error: 'Pedido no encontrado' });
      return res.status(400).json({ error: `Solo se puede asignar ruta a pedidos pendientes (estado actual: ${exists.estado})` });
    }

    // Notificar al repartidor de la ruta
    if (ruta_id) {
      const [[ruta]] = await db.query('SELECT repartidor_id FROM rutas WHERE id = ?', [ruta_id]);
      if (ruta?.repartidor_id) await emitirNuevoPedido(req, ruta.repartidor_id, pedido_id);
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── PUT /api/pedidos/:id/entregar ── */
exports.entregar = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[cajaPlanta]] = await conn.query(
      "SELECT id FROM cajas WHERE estado IN ('abierta','reabierta') LIMIT 1"
    );
    if (!cajaPlanta) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'No hay caja abierta. No se puede entregar pedidos sin caja abierta.' });
    }

    const [[pedido]] = await conn.query(
      `SELECT p.*, r.id AS ruta_id_check FROM pedidos p LEFT JOIN rutas r ON r.id = p.ruta_id WHERE p.id = ?`,
      [req.params.id]
    );
    if (!pedido) { await conn.rollback(); conn.release(); return res.status(404).json({ error: 'Pedido no encontrado' }); }
    if (pedido.estado === 'entregado') { await conn.rollback(); conn.release(); return res.status(400).json({ error: 'Pedido ya fue entregado' }); }

    // Chofer solo puede entregar sus propios pedidos
    if (req.user.rol === 'chofer') {
      const dueño = pedido.repartidor_id || (pedido.ruta_id_check ? (await conn.query('SELECT repartidor_id FROM rutas WHERE id = ?', [pedido.ruta_id_check]))[0]?.[0]?.repartidor_id : null);
      if (dueño && dueño !== req.user.id) {
        await conn.rollback(); conn.release();
        return res.status(403).json({ error: 'No tienes acceso a este pedido' });
      }
    }

    const {
      lineas = [],
      pagado_efectivo = 0, pagado_transferencia = 0,
      pagado_tarjeta = 0, pagado_credito = 0,
      pagos: pagosArray,
      notas_repartidor,
    } = req.body;

    // Normalize pagos array (new format or legacy)
    let pagos;
    if (Array.isArray(pagosArray) && pagosArray.length > 0) {
      pagos = pagosArray.filter(p => Number(p.monto) > 0).map(p => ({ metodo: p.metodo, monto: Number(p.monto) }));
    } else {
      pagos = [];
      if (Number(pagado_efectivo) > 0)      pagos.push({ metodo: 'efectivo',      monto: Number(pagado_efectivo) });
      if (Number(pagado_transferencia) > 0) pagos.push({ metodo: 'transferencia', monto: Number(pagado_transferencia) });
      if (Number(pagado_tarjeta) > 0)       pagos.push({ metodo: 'tarjeta',       monto: Number(pagado_tarjeta) });
      if (Number(pagado_credito) > 0)       pagos.push({ metodo: 'credito',       monto: Number(pagado_credito) });
    }
    const legacyEfectivo      = pagos.filter(p => p.metodo === 'efectivo').reduce((s, p) => s + p.monto, 0);
    const legacyTransferencia = pagos.filter(p => p.metodo === 'transferencia').reduce((s, p) => s + p.monto, 0);
    const legacyTarjeta       = pagos.filter(p => p.metodo === 'tarjeta').reduce((s, p) => s + p.monto, 0);
    const legacyCredito       = pagos.filter(p => p.metodo === 'credito').reduce((s, p) => s + p.monto, 0);

    // Resolve ruta_id: from pedido, or from repartidor's active ruta (sin filtro fecha)
    let rutaId = pedido.ruta_id;
    if (!rutaId) {
      const [[miRuta]] = await conn.query(
        "SELECT id FROM rutas WHERE repartidor_id = ? AND estado IN ('preparando','en_ruta','regresando') ORDER BY creado_en DESC LIMIT 1",
        [req.user.id]
      );
      if (miRuta) {
        rutaId = miRuta.id;
        await conn.query('UPDATE pedidos SET ruta_id = ? WHERE id = ?', [rutaId, pedido.id]);
      }
    }

    // ── Validar stock del vehículo si config lo exige ──
    const permitirSinStock = await getConfigValue('entregar_sin_stock', '1', conn);
    if (permitirSinStock === '0' && rutaId && lineas.length > 0) {
      const [stockRows] = await conn.query(
        `SELECT presentacion_id,
                (llenos_cargados - llenos_entregados) AS disponibles
           FROM stock_vehiculo
          WHERE ruta_id = ?
          FOR UPDATE`,
        [rutaId]
      );
      const stockMap = {};
      for (const s of stockRows) stockMap[s.presentacion_id] = Number(s.disponibles);

      for (const l of lineas) {
        const cant = Number(l.cantidad) || 1;
        const disp = stockMap[l.presentacion_id] || 0;
        if (cant > disp) {
          await conn.rollback(); conn.release();
          return res.status(400).json({
            error: `No tiene stock suficiente en el vehiculo. Recargue antes de entregar.`,
          });
        }
      }
    }

    let subtotal = 0;
    for (const l of lineas) {
      subtotal += (Number(l.precio_unitario) || 0) * (Number(l.cantidad) || 1);
    }
    const total = subtotal;

    // Validar que los pagos cubran el total
    if (pagos.length === 0 && total > 0) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'Selecciona al menos un método de pago' });
    }
    const sumPagos = pagos.reduce((s, p) => s + p.monto, 0);
    if (total > 0 && Math.abs(sumPagos - total) > 0.02) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: `Suma de pagos (S/ ${sumPagos.toFixed(2)}) no coincide con el total (S/ ${total.toFixed(2)})` });
    }

    // Validar métodos de pago contra config
    const [metodosActivos] = await conn.query('SELECT nombre FROM metodos_pago_config WHERE activo = 1');
    const nombresActivos = new Set(metodosActivos.map(m => m.nombre));
    for (const p of pagos) {
      if (!nombresActivos.has(p.metodo)) {
        await conn.rollback(); conn.release();
        return res.status(400).json({ error: `Método de pago "${p.metodo}" no válido` });
      }
    }

    const deuda_generada = legacyCredito;
    const estado_venta = deuda_generada > 0 ? 'pendiente' : 'pagada';

    // Create venta with ruta_id + repartidor_id
    const [ventaResult] = await conn.query(
      `INSERT INTO ventas
         (cliente_id, vendedor_id, repartidor_id, origen, ruta_id,
          subtotal, descuento, total,
          pagado_efectivo, pagado_transferencia, pagado_tarjeta, pagado_credito,
          deuda_generada, estado, notas)
       VALUES (?, ?, ?, 'reparto', ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        pedido.cliente_id, req.user.id, req.user.id, rutaId,
        subtotal, total,
        legacyEfectivo, legacyTransferencia,
        legacyTarjeta, legacyCredito,
        deuda_generada, estado_venta, notas_repartidor?.trim() || null,
      ]
    );
    const ventaId = ventaResult.insertId;

    // Insert venta_pagos
    for (const p of pagos) {
      await conn.query(
        'INSERT INTO venta_pagos (venta_id, metodo_pago, monto) VALUES (?, ?, ?)',
        [ventaId, p.metodo, p.monto]
      );
    }

    // ── Caja ruta (chofer): registrar cobros ──
    const [[cajaRuta]] = rutaId
      ? await conn.query("SELECT id, estado FROM caja_ruta WHERE ruta_id = ? LIMIT 1", [rutaId])
      : [[]];

    if (!cajaRuta || cajaRuta.estado === 'entregada') {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'No tienes una ruta activa con caja abierta. Finaliza tu ruta actual e inicia una nueva.' });
    }

    for (const p of pagos) {
      if (p.monto > 0) {
        // 1) Movimiento en caja_ruta del chofer
        const { getCategoriaId } = require('../helpers/categoriaCaja');
        const catVentaPed = await getCategoriaId('Venta', conn);
        if (cajaRuta) {
          await conn.query(
            `INSERT INTO caja_ruta_movimientos (caja_ruta_id, venta_id, tipo, clasificacion, categoria_id, metodo_pago, monto, descripcion, registrado_por)
             VALUES (?, ?, 'cobro_venta', 'ingreso', ?, ?, ?, ?, ?)`,
            [cajaRuta.id, ventaId, catVentaPed, p.metodo, p.monto, `Pedido #${pedido.numero || ''}`, req.user.id]
          );
        }
        // 2) Movimiento en caja general (pendiente hasta que chofer entregue)
        await conn.query(
          `INSERT INTO caja_movimientos (caja_id, tipo, metodo_pago, monto, descripcion, venta_id, registrado_por, origen, estado_entrega, categoria_id${cajaRuta ? ', caja_ruta_id' : ''})
           VALUES (?, 'ingreso', ?, ?, ?, ?, ?, 'repartidor', 'pendiente', ?${cajaRuta ? ', ?' : ''})`,
          cajaRuta
            ? [cajaPlanta.id, p.metodo, p.monto, `Entrega pedido #${pedido.numero || ''}`, ventaId, req.user.id, catVentaPed, cajaRuta.id]
            : [cajaPlanta.id, p.metodo, p.monto, `Entrega pedido #${pedido.numero || ''}`, ventaId, req.user.id, catVentaPed]
        );
      }
    }

    // Actualizar totales en caja_ruta
    if (cajaRuta) {
      const totalPagos = pagos.reduce((s, p) => s + p.monto, 0);
      // Columnas legacy por método
      const cobradoEf = pagos.filter(p => p.metodo === 'efectivo').reduce((s, p) => s + p.monto, 0);
      const cobradoTr = pagos.filter(p => p.metodo === 'transferencia').reduce((s, p) => s + p.monto, 0);
      const cobradoTa = pagos.filter(p => p.metodo === 'tarjeta').reduce((s, p) => s + p.monto, 0);
      const cobradoCr = pagos.filter(p => p.metodo === 'credito').reduce((s, p) => s + p.monto, 0);
      await conn.query(
        `UPDATE caja_ruta SET
           cobrado_efectivo = cobrado_efectivo + ?,
           cobrado_transferencia = cobrado_transferencia + ?,
           cobrado_tarjeta = cobrado_tarjeta + ?,
           cobrado_credito = cobrado_credito + ?,
           total_cobrado = total_cobrado + ?,
           neto_a_entregar = total_cobrado - total_gastos
         WHERE id = ?`,
        [cobradoEf, cobradoTr, cobradoTa, cobradoCr, totalPagos, cajaRuta.id]
      );
    }

    // Validar tipo_linea antes de insertar detalle
    const TIPOS_VALIDOS = ['compra_bidon', 'recarga', 'prestamo', 'producto'];
    for (const l of lineas) {
      const tipoLinea = l.tipo_linea || 'producto';
      if (!TIPOS_VALIDOS.includes(tipoLinea)) {
        await conn.rollback(); conn.release();
        return res.status(400).json({ error: `tipo_linea inválido: ${tipoLinea}` });
      }
    }

    for (const l of lineas) {
      const cantidad = Number(l.cantidad) || 1;
      const precioU  = Number(l.precio_unitario) || 0;
      const vacios   = Number(l.vacios_recibidos) || 0;
      const sub      = precioU * cantidad;
      const tipoLinea = l.tipo_linea || 'producto';

      await conn.query(
        `INSERT INTO venta_detalle
           (venta_id, presentacion_id, tipo_linea, cantidad, vacios_recibidos, precio_unitario, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [ventaId, l.presentacion_id, tipoLinea, cantidad, vacios, precioU, sub]
      );

      // Registrar movimiento de stock (trazabilidad)
      await conn.query(
        `INSERT INTO stock_movimientos
           (presentacion_id, tipo, cantidad, estado_origen, estado_destino,
            venta_id, cliente_id, repartidor_id, registrado_por, motivo)
         VALUES (?, 'venta', ?, 'en_ruta_lleno', 'vendido', ?, ?, ?, ?, ?)`,
        [l.presentacion_id, cantidad, ventaId, pedido.cliente_id,
         req.user.id, req.user.id, `Pedido #${pedido.numero}`]
      );

      if (rutaId) {
        // Upsert: if product wasn't pre-loaded, create the tracking row
        await conn.query(
          `INSERT INTO stock_vehiculo (ruta_id, presentacion_id, llenos_cargados, llenos_entregados)
           VALUES (?, ?, 0, ?)
           ON DUPLICATE KEY UPDATE llenos_entregados = llenos_entregados + VALUES(llenos_entregados)`,
          [rutaId, l.presentacion_id, cantidad]
        );
        if (vacios > 0) {
          await conn.query(
            `INSERT INTO stock_vehiculo (ruta_id, presentacion_id, llenos_cargados, vacios_recogidos)
             VALUES (?, ?, 0, ?)
             ON DUPLICATE KEY UPDATE vacios_recogidos = vacios_recogidos + VALUES(vacios_recogidos)`,
            [rutaId, l.presentacion_id, vacios]
          );
        }
      }
    }

    // ── Préstamo automático: vacíos faltantes en recargas retornables ──
    // Si entrega 2 pero recibe solo 1 vacío, la diferencia (1) se suma como préstamo.
    // vacíos > cantidad no se permite (devoluciones extras van por módulo Devoluciones).
    if (pedido.cliente_id) {
      let totalPrestamo = 0;
      for (const l of lineas) {
        const tipoLinea = l.tipo_linea || 'producto';
        if (tipoLinea !== 'recarga') continue;
        const cantidad = Number(l.cantidad) || 1;
        const vacios   = Math.min(Number(l.vacios_recibidos) || 0, cantidad);
        const faltantes = cantidad - vacios;
        if (faltantes <= 0) continue;

        const [[pres]] = await conn.query(
          'SELECT es_retornable FROM presentaciones WHERE id = ?', [l.presentacion_id]
        );
        if (pres?.es_retornable) {
          totalPrestamo += faltantes;
        }
      }
      if (totalPrestamo > 0) {
        await conn.query(
          'UPDATE clientes SET bidones_prestados = bidones_prestados + ? WHERE id = ?',
          [totalPrestamo, pedido.cliente_id]
        );
      }
    }

    if (pedido.cliente_id && deuda_generada > 0) {
      // Validar crédito máximo (0 = sin límite)
      const [[cli]] = await conn.query(
        'SELECT saldo_dinero, credito_maximo FROM clientes WHERE id = ? FOR UPDATE', [pedido.cliente_id]
      );
      if (cli && cli.credito_maximo > 0 && (Number(cli.saldo_dinero) + deuda_generada) > cli.credito_maximo) {
        await conn.rollback(); conn.release();
        return res.status(400).json({
          error: `El cliente excede su crédito máximo (S/${cli.credito_maximo}). Deuda actual: S/${cli.saldo_dinero}, nueva deuda: S/${deuda_generada}`
        });
      }
      await conn.query(
        'UPDATE clientes SET saldo_dinero = saldo_dinero + ? WHERE id = ?',
        [deuda_generada, pedido.cliente_id]
      );
    }

    await conn.query(
      "UPDATE pedidos SET estado = 'entregado', venta_id = ?, notas_repartidor = COALESCE(?, notas_repartidor) WHERE id = ?",
      [ventaId, notas_repartidor?.trim() || null, req.params.id]
    );

    await conn.commit();
    conn.release();
    logAudit(req, { modulo: 'pedidos', accion: 'editar', tabla: 'pedidos', registro_id: Number(req.params.id), detalle: { accion_especifica: 'entregar', venta_id: ventaId } });
    res.json({ ok: true, venta_id: ventaId });
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    res.status(500).json({ error: err.message });
  }
};

/* ── PUT /api/pedidos/:id/no-entregado ── */
exports.noEntregado = async (req, res) => {
  try {
    // Chofer solo puede marcar sus propios pedidos
    if (req.user.rol === 'chofer') {
      const [[p]] = await db.query(
        `SELECT COALESCE(p.repartidor_id, r.repartidor_id) AS rep_id
           FROM pedidos p LEFT JOIN rutas r ON r.id = p.ruta_id WHERE p.id = ?`,
        [req.params.id]
      );
      if (p && p.rep_id && p.rep_id !== req.user.id) {
        return res.status(403).json({ error: 'No tienes acceso a este pedido' });
      }
    }

    // Chofer necesita ruta activa + caja abierta
    if (req.user.rol === 'chofer') {
      const [[miRuta]] = await db.query(
        "SELECT id FROM rutas WHERE repartidor_id = ? AND estado IN ('preparando','en_ruta','regresando') ORDER BY creado_en DESC LIMIT 1",
        [req.user.id]
      );
      if (!miRuta) return res.status(400).json({ error: 'No tienes una ruta activa. Inicia una nueva ruta para continuar.' });
      const [[cajaR]] = await db.query("SELECT estado FROM caja_ruta WHERE ruta_id = ? LIMIT 1", [miRuta.id]);
      if (!cajaR || cajaR.estado === 'entregada') return res.status(400).json({ error: 'Tu caja ya fue entregada. Finaliza la ruta e inicia una nueva.' });
    }

    const { notas_repartidor } = req.body;
    if (!notas_repartidor?.trim()) {
      return res.status(400).json({ error: 'El motivo de no entrega es obligatorio.' });
    }
    const [result] = await db.query(
      "UPDATE pedidos SET estado = 'no_entregado', notas_repartidor = ? WHERE id = ? AND estado IN ('pendiente','en_camino')",
      [notas_repartidor.trim(), req.params.id]
    );
    if (result.affectedRows === 0) return res.status(400).json({ error: 'No se puede cambiar el estado' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── PUT /api/pedidos/:id/estado ── */
exports.updateEstado = async (req, res) => {
  try {
    const { estado, notas_repartidor } = req.body;
    const [[pedido]] = await db.query(
      `SELECT p.id, p.estado, COALESCE(p.repartidor_id, r.repartidor_id) AS rep_id
         FROM pedidos p LEFT JOIN rutas r ON r.id = p.ruta_id WHERE p.id = ?`,
      [req.params.id]
    );
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

    // Chofer solo puede cambiar estado de sus propios pedidos
    if (req.user.rol === 'chofer' && pedido.rep_id && pedido.rep_id !== req.user.id) {
      return res.status(403).json({ error: 'No tienes acceso a este pedido' });
    }

    const transiciones = {
      pendiente:  ['en_camino'],
      en_camino:  ['entregado', 'no_entregado'],
    };
    const allowed = transiciones[pedido.estado] || [];
    if (!allowed.includes(estado)) {
      return res.status(400).json({ error: `No se puede cambiar de "${pedido.estado}" a "${estado}"` });
    }

    // Chofer necesita ruta activa + caja abierta para poner en_camino o entregar
    if (req.user.rol === 'chofer' && ['en_camino', 'entregado', 'no_entregado'].includes(estado)) {
      const [[miRuta]] = await db.query(
        "SELECT id FROM rutas WHERE repartidor_id = ? AND estado IN ('preparando','en_ruta','regresando') ORDER BY creado_en DESC LIMIT 1",
        [req.user.id]
      );
      if (!miRuta) {
        return res.status(400).json({ error: 'No tienes una ruta activa. Inicia una nueva ruta para continuar.' });
      }
      const [[cajaR]] = await db.query(
        "SELECT id, estado FROM caja_ruta WHERE ruta_id = ? LIMIT 1", [miRuta.id]
      );
      if (!cajaR || cajaR.estado === 'entregada') {
        return res.status(400).json({ error: 'Tu caja ya fue entregada. Finaliza la ruta e inicia una nueva.' });
      }
    }

    const sets = ['estado = ?'];
    const params = [estado];
    if (notas_repartidor !== undefined) { sets.push('notas_repartidor = ?'); params.push(notas_repartidor); }

    await db.query(`UPDATE pedidos SET ${sets.join(', ')} WHERE id = ?`, [...params, pedido.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/pedidos/mis-pedidos ── */
exports.misPedidos = async (req, res) => {
  try {
    const userId = req.user.id;
    const { fecha, fecha_inicio, fecha_fin } = req.query;

    const conds  = ["(p.repartidor_id = ? OR r.repartidor_id = ?)", "p.estado NOT IN ('reasignado','cancelado')"];
    const params = [userId, userId];

    if (fecha_inicio) { conds.push('p.fecha >= ?'); params.push(fecha_inicio); }
    if (fecha_fin)    { conds.push('p.fecha <= ?'); params.push(fecha_fin); }

    // Si no hay filtro de fecha, buscar pedidos de la ruta activa del repartidor
    // Si no tiene ruta activa, usar fecha de hoy como fallback
    let rutaActivaId = null;
    if (!fecha_inicio && !fecha_fin && !fecha) {
      const [[miRuta]] = await db.query(
        "SELECT id FROM rutas WHERE repartidor_id = ? AND estado IN ('preparando','en_ruta','regresando') ORDER BY creado_en DESC LIMIT 1",
        [userId]
      );
      if (miRuta) {
        rutaActivaId = miRuta.id;
        // Incluir pedidos de la ruta + pedidos asignados directamente sin ruta
        conds.push('(p.ruta_id = ? OR (p.repartidor_id = ? AND p.ruta_id IS NULL))');
        params.push(rutaActivaId, userId);
      } else {
        conds.push('p.fecha = ?');
        params.push(new Date().toISOString().slice(0, 10));
      }
    } else if (fecha && !fecha_inicio && !fecha_fin) {
      conds.push('p.fecha = ?');
      params.push(fecha);
    }

    const where = `WHERE ${conds.join(' AND ')}`;

    const [rows] = await db.query(
      `SELECT p.id, p.numero, p.fecha, p.estado, p.orden_entrega, p.ruta_id, p.repartidor_id,
              p.notas_encargada, p.notas_repartidor,
              COALESCE(p.latitud, c.latitud) AS lat,
              COALESCE(p.longitud, c.longitud) AS lng,
              c.id AS cliente_id, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono,
              COALESCE(p.direccion_entrega, c.direccion, '') AS cliente_direccion,
              GROUP_CONCAT(
                CONCAT(pr.nombre, ' x', pd.cantidad)
                ORDER BY pd.id SEPARATOR ', '
              ) AS productos_resumen
         FROM pedidos p
         JOIN clientes c ON c.id = p.cliente_id
         LEFT JOIN rutas r ON r.id = p.ruta_id
         LEFT JOIN pedido_detalle pd ON pd.pedido_id = p.id
         LEFT JOIN presentaciones pr ON pr.id = pd.presentacion_id
         ${where}
         GROUP BY p.id
         ORDER BY FIELD(p.estado, 'pendiente', 'en_camino', 'no_entregado', 'entregado'), p.orden_entrega ASC`,
      params
    );

    // Resumen
    const resumen = {
      total: rows.length,
      pendientes:    rows.filter(r => r.estado === 'pendiente').length,
      en_camino:     rows.filter(r => r.estado === 'en_camino').length,
      entregados:    rows.filter(r => r.estado === 'entregado').length,
      no_entregados: rows.filter(r => r.estado === 'no_entregado').length,
    };

    res.json({ data: rows, resumen });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/pedidos/precio-sugerido ── */
exports.getPrecioSugerido = async (req, res) => {
  try {
    const { cliente_id, presentacion_id, tipo_linea } = req.query;
    if (!presentacion_id) return res.status(400).json({ error: 'presentacion_id requerido' });

    // 1. Precio especial del cliente
    if (cliente_id) {
      const [especial] = await db.query(`
        SELECT precio, tipo_linea
          FROM precios_cliente
         WHERE cliente_id      = ?
           AND presentacion_id = ?
           AND tipo_linea      = ?
           AND activo          = 1
         LIMIT 1
      `, [cliente_id, presentacion_id, tipo_linea || 'producto']);

      if (especial.length > 0) {
        return res.json({
          precio:  especial[0].precio,
          origen:  'especial',
          mensaje: 'Precio especial del cliente',
        });
      }
    }

    // 2. Fallback: precio base de la presentación
    const [base] = await db.query(
      'SELECT precio_base, nombre FROM presentaciones WHERE id = ?',
      [presentacion_id]
    );
    if (!base.length) return res.status(404).json({ error: 'Presentación no encontrada' });

    res.json({
      precio:  base[0].precio_base,
      origen:  'base',
      mensaje: 'Precio base',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/pedidos/ultima-direccion?cliente_id= ── */
exports.getUltimaDireccion = async (req, res) => {
  try {
    const { cliente_id } = req.query;
    if (!cliente_id) return res.json({ direccion_entrega: null });

    const [[row]] = await db.query(
      `SELECT direccion_entrega FROM pedidos
       WHERE cliente_id = ? AND direccion_entrega IS NOT NULL AND direccion_entrega != ''
       ORDER BY id DESC LIMIT 1`,
      [cliente_id]
    );
    res.json({ direccion_entrega: row?.direccion_entrega || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── PUT /api/pedidos/:id/asignar-repartidor ── */
exports.asignarRepartidor = async (req, res) => {
  try {
    const { repartidor_id } = req.body;
    const pedido_id = req.params.id;
    const [result] = await db.query(
      "UPDATE pedidos SET repartidor_id = ? WHERE id = ? AND estado = 'pendiente'",
      [repartidor_id || null, pedido_id]
    );
    if (result.affectedRows === 0) {
      const [[exists]] = await db.query('SELECT estado FROM pedidos WHERE id = ?', [pedido_id]);
      if (!exists) return res.status(404).json({ error: 'Pedido no encontrado' });
      return res.status(400).json({ error: `Solo se puede asignar repartidor a pedidos pendientes (estado actual: ${exists.estado})` });
    }

    // Notificar al repartidor asignado
    await emitirNuevoPedido(req, repartidor_id, pedido_id);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
