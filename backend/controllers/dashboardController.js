// controllers/dashboardController.js
const db = require('../db');

exports.getIndicadores = async (req, res) => {
  try {
    const { fecha_inicio, fecha_fin } = req.query;

    // Default: today
    const fi = fecha_inicio || new Date().toISOString().slice(0, 10);
    const ff = fecha_fin    || new Date().toISOString().slice(0, 10);

    // Rango sargable: fecha_hora >= fi AND fecha_hora < ff+1day
    const ffNext = new Date(ff);
    ffNext.setDate(ffNext.getDate() + 1);
    const ffNextStr = ffNext.toISOString().slice(0, 10);

    // 1. Ventas en rango (sargable)
    const [[ventas]] = await db.query(`
      SELECT
        COUNT(CASE WHEN estado != 'cancelada' THEN 1 END) AS cantidad_ventas,
        COALESCE(SUM(CASE WHEN estado != 'cancelada' THEN total ELSE 0 END), 0) AS total_ventas
      FROM ventas
      WHERE fecha_hora >= ? AND fecha_hora < ?`,
      [fi, ffNextStr]
    );

    // 1b. Totales por método de pago dinámico (desde venta_pagos)
    const [pagosPorMetodo] = await db.query(`
      SELECT vp.metodo_pago, COALESCE(SUM(vp.monto), 0) AS total
      FROM venta_pagos vp
      JOIN ventas v ON v.id = vp.venta_id
      WHERE v.estado != 'cancelada'
        AND v.fecha_hora >= ? AND v.fecha_hora < ?
      GROUP BY vp.metodo_pago`,
      [fi, ffNextStr]
    );
    const pagosMap = {};
    for (const r of pagosPorMetodo) pagosMap[r.metodo_pago] = Number(r.total);

    // 1c. Métodos de pago activos (para el frontend)
    const [metodosRows] = await db.query(
      'SELECT nombre, etiqueta, tipo, color, orden FROM metodos_pago_config WHERE activo = 1 ORDER BY orden'
    );

    // 2. Clientes activos
    const [[{ clientes_activos }]] = await db.query(
      'SELECT COUNT(*) AS clientes_activos FROM clientes WHERE activo = 1'
    );

    // 3. Bidones llenos (stock real de presentaciones retornables)
    const [[{ bidones_llenos }]] = await db.query(
      'SELECT COALESCE(SUM(stock_llenos), 0) AS bidones_llenos FROM presentaciones WHERE es_retornable = 1 AND activo = 1'
    );

    // 4. Bidones prestados (suma real de clientes)
    const [[{ bidones_prestados }]] = await db.query(
      'SELECT COALESCE(SUM(bidones_prestados), 0) AS bidones_prestados FROM clientes WHERE activo = 1'
    );

    // 5. Pendientes de lavado
    const [[{ pendientes_lavado }]] = await db.query(`
      SELECT COALESCE(SUM(stock_en_lavado), 0) AS pendientes_lavado
      FROM presentaciones WHERE activo = 1 AND es_retornable = 1`
    );

    // 5b. Vacíos limpios disponibles (para producción)
    const [[{ vacios_disponibles }]] = await db.query(
      'SELECT COALESCE(SUM(stock_vacios), 0) AS vacios_disponibles FROM presentaciones WHERE es_retornable = 1 AND activo = 1'
    );

    // 6. Devoluciones en rango
    const [[devs]] = await db.query(`
      SELECT COUNT(*) AS cantidad_devoluciones,
             COALESCE(SUM(cantidad), 0) AS total_bidones_devueltos
      FROM devoluciones
      WHERE estado = 'activa' AND fecha >= ? AND fecha <= ?`,
      [fi, ff]
    );

    // 7. Ranking top 10 clientes por monto en rango (sargable)
    const [ranking] = await db.query(`
      SELECT c.id, c.nombre, c.tipo,
             COUNT(v.id) AS num_ventas,
             COALESCE(SUM(v.total), 0) AS monto_total
      FROM ventas v
      JOIN clientes c ON c.id = v.cliente_id
      WHERE v.estado != 'cancelada'
        AND v.fecha_hora >= ? AND v.fecha_hora < ?
      GROUP BY c.id
      ORDER BY monto_total DESC
      LIMIT 10`,
      [fi, ffNextStr]
    );

    // 8. Deuda total clientes
    const [[{ deuda_clientes }]] = await db.query(
      'SELECT COALESCE(SUM(saldo_dinero), 0) AS deuda_clientes FROM clientes WHERE activo = 1 AND saldo_dinero > 0'
    );

    // 9. Deuda total a proveedores
    const [[{ deuda_proveedores }]] = await db.query(
      'SELECT COALESCE(SUM(saldo_deuda), 0) AS deuda_proveedores FROM proveedores WHERE activo = 1 AND saldo_deuda > 0'
    );

    // 10. Producción en rango
    const [[prod]] = await db.query(
      `SELECT COUNT(*) AS lotes, COALESCE(SUM(cantidad_producida), 0) AS unidades
       FROM lotes_produccion WHERE estado = 'completado' AND fecha >= ? AND fecha <= ?`,
      [fi, ff]
    );

    // 11. Stock bajo (presentaciones con stock_llenos < 10 o insumos con stock_actual < stock_minimo)
    const [stockBajoPres] = await db.query(
      `SELECT id, nombre, stock_llenos FROM presentaciones WHERE activo = 1 AND stock_llenos < 10 ORDER BY stock_llenos ASC LIMIT 10`
    );
    const [stockBajoIns] = await db.query(
      `SELECT id, nombre, stock_actual, stock_minimo FROM insumos WHERE activo = 1 AND stock_minimo > 0 AND stock_actual <= stock_minimo ORDER BY (stock_actual / stock_minimo) ASC LIMIT 10`
    );

    const result = {
      fecha_inicio: fi,
      fecha_fin: ff,
      ventas: {
        cantidad:          Number(ventas.cantidad_ventas),
        total:             Number(ventas.total_ventas),
        // Legacy fields for backward compat
        efectivo:          pagosMap['efectivo'] || 0,
        transferencia:     pagosMap['transferencia'] || 0,
        tarjeta:           pagosMap['tarjeta'] || 0,
        credito:           pagosMap['credito'] || 0,
      },
      metodos_pago: metodosRows.map(m => ({
        nombre:   m.nombre,
        etiqueta: m.etiqueta,
        tipo:     m.tipo,
        color:    m.color,
        total:    pagosMap[m.nombre] || 0,
      })),
      clientes_activos:    Number(clientes_activos),
      bidones_llenos:      Number(bidones_llenos),
      bidones_prestados:   Number(bidones_prestados),
      pendientes_lavado:   Number(pendientes_lavado),
      vacios_disponibles:  Number(vacios_disponibles),
      devoluciones: {
        cantidad:          Number(devs.cantidad_devoluciones),
        bidones:           Number(devs.total_bidones_devueltos),
      },
      ranking_clientes:    ranking.map(r => ({
        id:         r.id,
        nombre:     r.nombre,
        tipo:       r.tipo,
        num_ventas: Number(r.num_ventas),
        monto:      Number(r.monto_total),
      })),
      deuda_clientes:      Number(deuda_clientes),
      deuda_proveedores:   Number(deuda_proveedores),
      produccion:          { lotes: Number(prod.lotes), unidades: Number(prod.unidades) },
      stock_bajo: {
        presentaciones: stockBajoPres.map(p => ({ id: p.id, nombre: p.nombre, stock: Number(p.stock_llenos) })),
        insumos:        stockBajoIns.map(i => ({ id: i.id, nombre: i.nombre, stock: Number(i.stock_actual), minimo: Number(i.stock_minimo) })),
      },
    };

    // Clientes que dejaron de comprar (frecuencia vs días sin comprar)
    const [clientesInactivos] = await db.query(
      `SELECT c.id, c.nombre, c.tipo, c.telefono, c.saldo_dinero, c.bidones_prestados,
              MAX(v.fecha_hora) AS ultima_compra,
              DATEDIFF(CURDATE(), MAX(v.fecha_hora)) AS dias_sin_comprar,
              COUNT(DISTINCT DATE(v.fecha_hora)) AS dias_con_compra,
              DATEDIFF(MAX(v.fecha_hora), MIN(v.fecha_hora)) AS rango_dias,
              COUNT(v.id) AS total_ventas
         FROM clientes c
         JOIN ventas v ON v.cliente_id = c.id AND v.estado != 'cancelada'
        WHERE c.activo = 1
        GROUP BY c.id
        HAVING dias_sin_comprar > GREATEST(3,
          ROUND(rango_dias / NULLIF(dias_con_compra, 0) * 1.5)
        )
        ORDER BY dias_sin_comprar DESC
        LIMIT 15`
    );

    result.clientes_inactivos = clientesInactivos.map(c => {
      const frecuencia = c.rango_dias > 0 && c.dias_con_compra > 1
        ? Math.round(c.rango_dias / (c.dias_con_compra - 1))
        : null;
      return {
        id: c.id,
        nombre: c.nombre,
        tipo: c.tipo,
        telefono: c.telefono,
        saldo_dinero: Number(c.saldo_dinero),
        bidones_prestados: c.bidones_prestados,
        ultima_compra: c.ultima_compra,
        dias_sin_comprar: c.dias_sin_comprar,
        frecuencia_dias: frecuencia,
        total_ventas: c.total_ventas,
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
