// controllers/reportesController.js
const db = require('../db');
const ExcelJS = require('exceljs');

/* ── Helper: enviar workbook como xlsx ── */
async function sendXlsx(res, workbook, filename) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
}

function styleHeader(sheet) {
  sheet.getRow(1).eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    cell.alignment = { horizontal: 'center' };
  });
}

/* ── GET /api/reportes/ventas ── */
exports.exportVentas = async (req, res) => {
  try {
    const { fecha_inicio, fecha_fin, vendedor_id, cliente_id } = req.query;
    const conds = [], params = [];

    if (fecha_inicio) { conds.push('DATE(v.fecha_hora) >= ?'); params.push(fecha_inicio); }
    if (fecha_fin)    { conds.push('DATE(v.fecha_hora) <= ?'); params.push(fecha_fin); }
    if (vendedor_id)  { conds.push('v.vendedor_id = ?');       params.push(vendedor_id); }
    if (cliente_id)   { conds.push('v.cliente_id = ?');        params.push(cliente_id); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const [rows] = await db.query(
      `SELECT v.folio, v.fecha_hora, c.nombre AS cliente, u.nombre AS vendedor,
              (SELECT COUNT(*) FROM venta_detalle d WHERE d.venta_id = v.id) AS items,
              v.total,
              (SELECT GROUP_CONCAT(CONCAT(vp.metodo_pago, ': S/', FORMAT(vp.monto,2)) SEPARATOR ', ')
                 FROM venta_pagos vp WHERE vp.venta_id = v.id) AS metodo_pago,
              v.estado
         FROM ventas v
         LEFT JOIN clientes c ON c.id = v.cliente_id
         LEFT JOIN usuarios u ON u.id = v.vendedor_id
         ${where}
         ORDER BY v.fecha_hora DESC`,
      params
    );

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Ventas');
    ws.columns = [
      { header: 'Folio',       key: 'folio',       width: 15 },
      { header: 'Fecha',       key: 'fecha_hora',  width: 20 },
      { header: 'Cliente',     key: 'cliente',     width: 25 },
      { header: 'Vendedor',    key: 'vendedor',    width: 20 },
      { header: 'Items',       key: 'items',       width: 8 },
      { header: 'Total',       key: 'total',       width: 12 },
      { header: 'Método Pago', key: 'metodo_pago', width: 15 },
      { header: 'Estado',      key: 'estado',      width: 12 },
    ];
    rows.forEach(r => ws.addRow(r));
    styleHeader(ws);

    await sendXlsx(res, wb, `ventas_${fecha_inicio || 'all'}_${fecha_fin || 'all'}.xlsx`);
  } catch (err) {
    console.error('exportVentas:', err.message);
    res.status(500).json({ error: 'Error generando reporte de ventas' });
  }
};

/* ── GET /api/reportes/caja ── */
exports.exportCaja = async (req, res) => {
  try {
    const { caja_id, fecha_inicio, fecha_fin } = req.query;
    const conds = [], params = [];

    if (caja_id) { conds.push('cm.caja_id = ?'); params.push(caja_id); }
    if (fecha_inicio) { conds.push('DATE(cm.fecha_hora) >= ?'); params.push(fecha_inicio); }
    if (fecha_fin)    { conds.push('DATE(cm.fecha_hora) <= ?'); params.push(fecha_fin); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    // Resumen por método
    const [resumen] = await db.query(
      `SELECT cm.metodo_pago,
              SUM(CASE WHEN cm.tipo = 'ingreso' THEN cm.monto ELSE 0 END) AS ingresos,
              SUM(CASE WHEN cm.tipo = 'egreso'  THEN cm.monto ELSE 0 END) AS egresos
         FROM caja_movimientos cm
         ${where}
         GROUP BY cm.metodo_pago`,
      params
    );

    // Detalle
    const [detalle] = await db.query(
      `SELECT cm.id, cm.fecha_hora, cm.tipo, cm.descripcion AS concepto, cm.metodo_pago, cm.monto, u.nombre AS usuario
         FROM caja_movimientos cm
         LEFT JOIN usuarios u ON u.id = cm.registrado_por
         ${where}
         ORDER BY cm.fecha_hora DESC`,
      params
    );

    const wb = new ExcelJS.Workbook();

    // Hoja 1: Resumen
    const ws1 = wb.addWorksheet('Resumen');
    ws1.columns = [
      { header: 'Método Pago', key: 'metodo_pago', width: 18 },
      { header: 'Ingresos',    key: 'ingresos',    width: 14 },
      { header: 'Egresos',     key: 'egresos',     width: 14 },
    ];
    resumen.forEach(r => ws1.addRow(r));
    styleHeader(ws1);

    // Hoja 2: Detalle
    const ws2 = wb.addWorksheet('Detalle');
    ws2.columns = [
      { header: 'ID',          key: 'id',          width: 8 },
      { header: 'Fecha',       key: 'fecha_hora',  width: 20 },
      { header: 'Tipo',        key: 'tipo',        width: 10 },
      { header: 'Concepto',    key: 'concepto',    width: 30 },
      { header: 'Método Pago', key: 'metodo_pago', width: 15 },
      { header: 'Monto',       key: 'monto',       width: 12 },
      { header: 'Usuario',     key: 'usuario',     width: 20 },
    ];
    detalle.forEach(r => ws2.addRow(r));
    styleHeader(ws2);

    await sendXlsx(res, wb, `caja_${caja_id || 'general'}.xlsx`);
  } catch (err) {
    console.error('exportCaja:', err.message);
    res.status(500).json({ error: 'Error generando reporte de caja' });
  }
};

/* ── GET /api/reportes/produccion ── */
exports.exportProduccion = async (req, res) => {
  try {
    const { fecha_inicio, fecha_fin, estado } = req.query;
    const conds = [], params = [];

    if (fecha_inicio) { conds.push('DATE(lp.fecha) >= ?'); params.push(fecha_inicio); }
    if (fecha_fin)    { conds.push('DATE(lp.fecha) <= ?'); params.push(fecha_fin); }
    if (estado)       { conds.push('lp.estado = ?');       params.push(estado); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const [rows] = await db.query(
      `SELECT lp.id AS lote, lp.fecha, p.nombre AS presentacion,
              lp.cantidad_producida AS cantidad, u.nombre AS operario, lp.estado
         FROM lotes_produccion lp
         LEFT JOIN presentaciones p ON p.id = lp.presentacion_id
         LEFT JOIN usuarios u ON u.id = lp.operario_id
         ${where}
         ORDER BY lp.fecha DESC`,
      params
    );

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Producción');
    ws.columns = [
      { header: 'Lote',         key: 'lote',         width: 10 },
      { header: 'Fecha',        key: 'fecha',        width: 15 },
      { header: 'Presentación', key: 'presentacion', width: 25 },
      { header: 'Cantidad',     key: 'cantidad',     width: 12 },
      { header: 'Operario',     key: 'operario',     width: 20 },
      { header: 'Estado',       key: 'estado',       width: 12 },
    ];
    rows.forEach(r => ws.addRow(r));
    styleHeader(ws);

    await sendXlsx(res, wb, `produccion_${fecha_inicio || 'all'}_${fecha_fin || 'all'}.xlsx`);
  } catch (err) {
    console.error('exportProduccion:', err.message);
    res.status(500).json({ error: 'Error generando reporte de producción' });
  }
};

/* ── GET /api/reportes/graficos ── */
exports.graficos = async (req, res) => {
  try {
    const { fecha_inicio, fecha_fin } = req.query;
    const fi = fecha_inicio || new Date().toISOString().slice(0, 10);
    const ff = fecha_fin || fi;

    // Ventas por dia
    const [ventasPorDia] = await db.query(`
      SELECT DATE(fecha_hora) AS dia, COUNT(*) AS cantidad, COALESCE(SUM(total), 0) AS total
      FROM ventas WHERE estado != 'cancelada' AND DATE(fecha_hora) >= ? AND DATE(fecha_hora) <= ?
      GROUP BY DATE(fecha_hora) ORDER BY dia ASC`, [fi, ff]);

    // Top 10 productos
    const [topProductos] = await db.query(`
      SELECT p.nombre, SUM(d.cantidad) AS cantidad, SUM(d.subtotal) AS total
      FROM venta_detalle d
      JOIN ventas v ON v.id = d.venta_id
      JOIN presentaciones p ON p.id = d.presentacion_id
      WHERE v.estado != 'cancelada' AND DATE(v.fecha_hora) >= ? AND DATE(v.fecha_hora) <= ?
      GROUP BY d.presentacion_id ORDER BY total DESC LIMIT 10`, [fi, ff]);

    // Top 10 clientes
    const [topClientes] = await db.query(`
      SELECT c.nombre, COUNT(v.id) AS ventas, COALESCE(SUM(v.total), 0) AS total
      FROM ventas v JOIN clientes c ON c.id = v.cliente_id
      WHERE v.estado != 'cancelada' AND DATE(v.fecha_hora) >= ? AND DATE(v.fecha_hora) <= ?
      GROUP BY v.cliente_id ORDER BY total DESC LIMIT 10`, [fi, ff]);

    res.json({ ventas_por_dia: ventasPorDia, top_productos: topProductos, top_clientes: topClientes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/reportes/deudas ── */
exports.exportDeudas = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT c.nombre, c.direccion, c.saldo_dinero AS deuda, c.bidones_prestados
         FROM clientes c
         WHERE c.saldo_dinero > 0 AND c.activo = 1
         ORDER BY c.saldo_dinero DESC`
    );

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Deudas');
    ws.columns = [
      { header: 'Cliente',            key: 'nombre',             width: 30 },
      { header: 'Dirección',          key: 'direccion',          width: 35 },
      { header: 'Deuda (S/)',         key: 'deuda',              width: 14 },
      { header: 'Bidones Prestados',  key: 'bidones_prestados',  width: 18 },
    ];
    rows.forEach(r => ws.addRow(r));
    styleHeader(ws);

    await sendXlsx(res, wb, 'deudas_clientes.xlsx');
  } catch (err) {
    console.error('exportDeudas:', err.message);
    res.status(500).json({ error: 'Error generando reporte de deudas' });
  }
};

/* ── GET /api/reportes/proveedores ── */
exports.exportProveedores = async (req, res) => {
  try {
    const { q } = req.query;
    let where = 'WHERE p.activo = 1';
    const params = [];
    if (q) { where += ' AND (p.nombre LIKE ? OR p.ruc LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
    const [rows] = await db.query(
      `SELECT p.nombre, p.ruc, p.telefono, p.email, p.contacto, p.direccion, p.saldo_deuda,
              (SELECT COUNT(*) FROM compras c WHERE c.proveedor_id = p.id) AS num_compras
       FROM proveedores p ${where} ORDER BY p.nombre`, params);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Proveedores');
    ws.columns = [
      { header: 'Nombre', key: 'nombre', width: 30 },
      { header: 'RUC', key: 'ruc', width: 14 },
      { header: 'Teléfono', key: 'telefono', width: 15 },
      { header: 'Email', key: 'email', width: 25 },
      { header: 'Contacto', key: 'contacto', width: 20 },
      { header: 'Dirección', key: 'direccion', width: 30 },
      { header: 'Deuda', key: 'saldo_deuda', width: 12 },
      { header: 'N° Compras', key: 'num_compras', width: 12 },
    ];
    rows.forEach(r => ws.addRow(r));
    styleHeader(ws);
    await sendXlsx(res, wb, 'proveedores.xlsx');
  } catch (err) {
    console.error('exportProveedores:', err.message);
    res.status(500).json({ error: 'Error generando reporte de proveedores' });
  }
};

/* ── GET /api/reportes/clientes ── */
exports.exportClientes = async (req, res) => {
  try {
    const { q, tipo } = req.query;
    const conds = ['c.activo = 1'];
    const params = [];
    if (q)    { conds.push('(c.nombre LIKE ? OR c.ruc_dni LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
    if (tipo) { conds.push('c.tipo = ?'); params.push(tipo); }
    const where = `WHERE ${conds.join(' AND ')}`;

    const [rows] = await db.query(
      `SELECT c.nombre, c.ruc_dni AS dni, c.telefono, c.tipo, c.direccion, c.saldo_dinero,
              c.credito_maximo, c.bidones_prestados,
              CASE
                WHEN c.saldo_dinero > c.credito_maximo AND c.credito_maximo > 0 THEN 'sobre_limite'
                WHEN c.saldo_dinero > 0 OR c.bidones_prestados > 0             THEN 'con_deuda'
                ELSE 'al_dia'
              END AS estado_deuda,
              (SELECT MAX(v.fecha_hora) FROM ventas v WHERE v.cliente_id = c.id) AS ultima_compra
       FROM clientes c ${where} ORDER BY c.nombre`, params);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Clientes');
    ws.columns = [
      { header: 'Nombre',           key: 'nombre',            width: 30 },
      { header: 'DNI',              key: 'dni',               width: 12 },
      { header: 'Teléfono',         key: 'telefono',          width: 15 },
      { header: 'Tipo',             key: 'tipo',              width: 12 },
      { header: 'Dirección',        key: 'direccion',         width: 30 },
      { header: 'Saldo Dinero',     key: 'saldo_dinero',      width: 14 },
      { header: 'Crédito Máximo',   key: 'credito_maximo',    width: 14 },
      { header: 'Bidones Prestados', key: 'bidones_prestados', width: 16 },
      { header: 'Estado Deuda',     key: 'estado_deuda',      width: 14 },
      { header: 'Última Compra',    key: 'ultima_compra',     width: 20 },
    ];
    rows.forEach(r => ws.addRow(r));
    styleHeader(ws);
    await sendXlsx(res, wb, 'clientes.xlsx');
  } catch (err) {
    console.error('exportClientes:', err.message);
    res.status(500).json({ error: 'Error generando reporte de clientes' });
  }
};

/* ── GET /api/reportes/compras-excel ── */
exports.exportCompras = async (req, res) => {
  try {
    const { fecha_inicio, fecha_fin, estado } = req.query;
    const conds = [];
    const params = [];
    if (fecha_inicio) { conds.push('c.fecha >= ?'); params.push(fecha_inicio); }
    if (fecha_fin)    { conds.push('c.fecha <= ?'); params.push(fecha_fin); }
    if (estado)       { conds.push('c.estado = ?'); params.push(estado); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const [rows] = await db.query(
      `SELECT c.id, c.fecha, pv.nombre AS proveedor_nombre, c.total,
              COALESCE((SELECT SUM(pp.monto) FROM pagos_proveedores pp WHERE pp.compra_id = c.id AND pp.estado = 'activo'), 0) AS total_pagado,
              c.estado, u.nombre AS registrado_por_nombre
       FROM compras c
       LEFT JOIN usuarios    u  ON u.id  = c.registrado_por
       LEFT JOIN proveedores pv ON pv.id = c.proveedor_id
       ${where}
       ORDER BY c.creado_en DESC`, params);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Compras');
    ws.columns = [
      { header: 'N° Compra',      key: 'id',                    width: 12 },
      { header: 'Fecha',          key: 'fecha',                 width: 14 },
      { header: 'Proveedor',      key: 'proveedor_nombre',      width: 30 },
      { header: 'Total',          key: 'total',                 width: 14 },
      { header: 'Pagado',         key: 'total_pagado',          width: 14 },
      { header: 'Deuda',          key: 'deuda',                 width: 14 },
      { header: 'Estado',         key: 'estado',                width: 12 },
      { header: 'Registrado por', key: 'registrado_por_nombre', width: 20 },
    ];
    rows.forEach(r => {
      ws.addRow({ ...r, deuda: Math.max(0, Number(r.total) - Number(r.total_pagado)) });
    });
    styleHeader(ws);
    await sendXlsx(res, wb, `compras_${fecha_inicio || 'all'}_${fecha_fin || 'all'}.xlsx`);
  } catch (err) {
    console.error('exportCompras:', err.message);
    res.status(500).json({ error: 'Error generando reporte de compras' });
  }
};

/* ── GET /api/reportes/entregas ── */
exports.graficosEntregas = async (req, res) => {
  try {
    const { fecha_inicio, fecha_fin } = req.query;
    const fi = fecha_inicio || new Date().toISOString().slice(0, 10);
    const ff = fecha_fin || fi;

    const [por_estado] = await db.query(`
      SELECT estado, COUNT(*) AS cantidad
      FROM pedidos
      WHERE fecha >= ? AND fecha <= ?
      GROUP BY estado`, [fi, ff]);

    const [motivos] = await db.query(`
      SELECT notas_repartidor AS motivo, COUNT(*) AS cantidad
      FROM pedidos
      WHERE estado = 'no_entregado' AND fecha >= ? AND fecha <= ?
        AND notas_repartidor IS NOT NULL
      GROUP BY notas_repartidor
      ORDER BY cantidad DESC
      LIMIT 10`, [fi, ff]);

    res.json({ por_estado, motivos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/reportes/frecuencia-compras ── */
exports.frecuenciaCompras = async (req, res) => {
  try {
    const { estado } = req.query;

    const [rows] = await db.query(`
      SELECT c.id AS cliente_id, c.nombre, c.telefono,
             COUNT(v.id) AS total_pedidos,
             MIN(v.fecha_hora) AS primer_pedido,
             MAX(v.fecha_hora) AS ultimo_pedido,
             DATEDIFF(CURDATE(), MIN(v.fecha_hora)) AS dias_como_cliente,
             CASE
               WHEN COUNT(v.id) <= 1 THEN NULL
               ELSE ROUND(DATEDIFF(MAX(v.fecha_hora), MIN(v.fecha_hora)) / (COUNT(v.id) - 1), 1)
             END AS promedio_dias_entre_pedidos,
             DATEDIFF(CURDATE(), MAX(v.fecha_hora)) AS dias_sin_comprar
        FROM clientes c
        JOIN ventas v ON v.cliente_id = c.id AND v.estado != 'cancelada'
        WHERE c.activo = 1
        GROUP BY c.id
        HAVING total_pedidos >= 1
        ORDER BY dias_sin_comprar DESC
    `);

    const data = rows.map(r => {
      const prom = r.promedio_dias_entre_pedidos ? Number(r.promedio_dias_entre_pedidos) : null;
      const sinComprar = Number(r.dias_sin_comprar);
      let est;
      if (!prom || prom === 0) {
        est = sinComprar <= 30 ? 'activo' : sinComprar <= 60 ? 'en_riesgo' : 'perdido';
      } else {
        est = sinComprar <= prom * 2 ? 'activo' : sinComprar <= prom * 3 ? 'en_riesgo' : 'perdido';
      }
      return { ...r, promedio_dias_entre_pedidos: prom, dias_sin_comprar: sinComprar, estado: est };
    });

    const filtered = estado ? data.filter(d => d.estado === estado) : data;
    res.json({ data: filtered, total: filtered.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/reportes/comprobantes ── */
exports.exportComprobantes = async (req, res) => {
  try {
    const { q, tipo_comprobante, estado, fecha_inicio, fecha_fin } = req.query;
    const conds = [];
    const params = [];
    if (q) {
      conds.push('(c.razon_social LIKE ? OR c.serie LIKE ? OR c.numero LIKE ? OR c.numero_documento LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }
    if (tipo_comprobante) { conds.push('c.tipo_comprobante = ?'); params.push(tipo_comprobante); }
    if (estado)           { conds.push('c.estado = ?');           params.push(estado); }
    if (fecha_inicio)     { conds.push('DATE(c.creado_en) >= ?'); params.push(fecha_inicio); }
    if (fecha_fin)        { conds.push('DATE(c.creado_en) <= ?'); params.push(fecha_fin); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const [rows] = await db.query(
      `SELECT c.tipo_comprobante, c.serie, c.numero, c.razon_social,
              c.numero_documento, c.total, c.estado, c.estado_sunat, c.creado_en
       FROM comprobantes c
       ${where}
       ORDER BY c.creado_en DESC`, params);

    const SUNAT_LABELS = { '01': 'Registrado', '05': 'Aceptado', '07': 'Observado', '09': 'Rechazado', '11': 'Anulado', '13': 'Por anular' };

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Comprobantes');
    ws.columns = [
      { header: 'Tipo',         key: 'tipo_comprobante',  width: 15 },
      { header: 'Serie',        key: 'serie',             width: 10 },
      { header: 'Número',       key: 'numero',            width: 12 },
      { header: 'Razón Social', key: 'razon_social',      width: 30 },
      { header: 'N° Documento', key: 'numero_documento',  width: 14 },
      { header: 'Total',        key: 'total',             width: 12 },
      { header: 'Estado',       key: 'estado',            width: 12 },
      { header: 'Estado SUNAT', key: 'estado_sunat_label', width: 14 },
      { header: 'Fecha',        key: 'creado_en',         width: 20 },
    ];
    rows.forEach(r => {
      ws.addRow({ ...r, estado_sunat_label: SUNAT_LABELS[r.estado_sunat] || r.estado_sunat || '' });
    });
    styleHeader(ws);
    await sendXlsx(res, wb, 'comprobantes.xlsx');
  } catch (err) {
    console.error('exportComprobantes:', err.message);
    res.status(500).json({ error: 'Error generando reporte de comprobantes' });
  }
};
