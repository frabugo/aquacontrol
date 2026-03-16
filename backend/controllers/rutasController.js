// controllers/rutasController.js
const db = require('../db');
const logAudit = require('../helpers/audit');
const getConfigValue = require('../helpers/getConfigValue');

/* ── GET /api/rutas ── */
exports.list = async (req, res) => {
  try {
    const { fecha, fecha_inicio, fecha_fin, repartidor_id, estado } = req.query;
    const conds = [];
    const params = [];

    if (fecha_inicio) { conds.push('r.fecha >= ?'); params.push(fecha_inicio); }
    if (fecha_fin)    { conds.push('r.fecha <= ?'); params.push(fecha_fin); }
    if (fecha && !fecha_inicio && !fecha_fin) { conds.push('r.fecha = ?'); params.push(fecha); }
    if (repartidor_id) { conds.push('r.repartidor_id = ?'); params.push(repartidor_id); }
    if (estado) { conds.push('r.estado = ?'); params.push(estado); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const [rows] = await db.query(
      `SELECT r.*,
              u.nombre AS repartidor_nombre,
              v.placa AS vehiculo_placa, v.marca AS vehiculo_marca, v.modelo AS vehiculo_modelo,
              cr.id AS caja_ruta_id, cr.total_cobrado, cr.total_gastos, cr.neto_a_entregar, cr.estado AS caja_estado,
              cr.cobrado_efectivo, cr.cobrado_transferencia, cr.cobrado_tarjeta, cr.cobrado_credito,
              cr.solicitada_entrega, cr.solicitada_en, cr.confirmada_en,
              COALESCE(pc.total_pedidos, 0)          AS total_pedidos,
              COALESCE(pc.pedidos_entregados, 0)     AS pedidos_entregados,
              COALESCE(pc.pedidos_pendientes, 0)     AS pedidos_pendientes,
              COALESCE(pc.pedidos_en_camino, 0)      AS pedidos_en_camino,
              COALESCE(pc.pedidos_no_entregados, 0)  AS pedidos_no_entregados
         FROM rutas r
         LEFT JOIN usuarios u ON u.id = r.repartidor_id
         LEFT JOIN vehiculos v ON v.id = r.vehiculo_id
         LEFT JOIN caja_ruta cr ON cr.ruta_id = r.id
         LEFT JOIN (
           SELECT ruta_id,
                  SUM(estado NOT IN ('reasignado','cancelado')) AS total_pedidos,
                  SUM(estado = 'entregado')     AS pedidos_entregados,
                  SUM(estado = 'pendiente')     AS pedidos_pendientes,
                  SUM(estado = 'en_camino')     AS pedidos_en_camino,
                  SUM(estado = 'no_entregado')  AS pedidos_no_entregados
             FROM pedidos
            GROUP BY ruta_id
         ) pc ON pc.ruta_id = r.id
         ${where}
         ORDER BY r.fecha DESC, r.creado_en DESC`,
      params
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/rutas/mi-ruta ── */
exports.miRuta = async (req, res) => {
  try {
    // Buscar ruta activa sin filtro de fecha — vive hasta que se finalice
    const [[ruta]] = await db.query(
      `SELECT r.*,
              v.placa AS vehiculo_placa, v.marca AS vehiculo_marca,
              v.kilometraje_actual,
              cr.id AS caja_ruta_id, cr.total_cobrado, cr.total_gastos, cr.neto_a_entregar, cr.estado AS caja_estado,
              cr.cobrado_efectivo, cr.cobrado_transferencia, cr.cobrado_tarjeta, cr.cobrado_credito,
              cr.gasto_combustible, cr.gasto_alimentacion, cr.gasto_otros, cr.desc_gastos,
              cr.solicitada_entrega, cr.solicitada_en, cr.confirmada_en
         FROM rutas r
         LEFT JOIN vehiculos v ON v.id = r.vehiculo_id
         LEFT JOIN caja_ruta cr ON cr.ruta_id = r.id
         WHERE r.repartidor_id = ? AND r.estado IN ('preparando','en_ruta','regresando')
         ORDER BY r.creado_en DESC LIMIT 1`,
      [req.user.id]
    );
    if (!ruta) return res.json({ data: null });

    const [stock] = await db.query(
      `SELECT sv.*, p.nombre AS presentacion_nombre, p.es_retornable,
              (sv.llenos_cargados - sv.llenos_entregados - sv.llenos_sobrantes) AS llenos_disponibles,
              (sv.vacios_recogidos - sv.vacios_devueltos) AS vacios_en_vehiculo
         FROM stock_vehiculo sv
         JOIN presentaciones p ON p.id = sv.presentacion_id
         WHERE sv.ruta_id = ?`,
      [ruta.id]
    );

    const [pedidos] = await db.query(
      `SELECT ped.*, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono,
              c.direccion AS cliente_direccion, c.latitud AS cliente_lat, c.longitud AS cliente_lng,
              GROUP_CONCAT(CONCAT(pr.nombre, ' x', pd.cantidad) ORDER BY pd.id SEPARATOR ', ') AS productos_resumen
         FROM pedidos ped
         LEFT JOIN clientes c ON c.id = ped.cliente_id
         LEFT JOIN pedido_detalle pd ON pd.pedido_id = ped.id
         LEFT JOIN presentaciones pr ON pr.id = pd.presentacion_id
         WHERE ped.ruta_id = ?
         GROUP BY ped.id
         ORDER BY ped.orden_entrega`,
      [ruta.id]
    );

    // Neto por método de pago (ingresos - egresos) desde movimientos
    if (ruta.caja_ruta_id) {
      const [cobros] = await db.query(
        `SELECT metodo_pago,
                SUM(CASE WHEN clasificacion = 'ingreso' OR tipo = 'cobro_venta' THEN monto ELSE 0 END) AS ingresos,
                SUM(CASE WHEN clasificacion = 'egreso' THEN monto ELSE 0 END) AS egresos
           FROM caja_ruta_movimientos
          WHERE caja_ruta_id = ? AND anulado = 0
          GROUP BY metodo_pago`,
        [ruta.caja_ruta_id]
      );
      for (const c of cobros) {
        ruta[`cobrado_${c.metodo_pago}`] = Number(c.ingresos) - Number(c.egresos);
      }
    }

    // Última ruta finalizada de este vehículo (para mostrar km_fin de referencia)
    let ultimaRutaFinalizada = null;
    try {
      const [[row]] = await db.query(
        `SELECT r.numero, r.fecha, r.km_fin, r.hora_regreso,
                u.nombre AS repartidor_nombre
           FROM rutas r
           LEFT JOIN usuarios u ON u.id = r.repartidor_id
           WHERE r.vehiculo_id = ? AND r.estado = 'finalizada' AND r.km_fin IS NOT NULL
           ORDER BY r.fecha DESC, r.id DESC LIMIT 1`,
        [ruta.vehiculo_id]
      );
      ultimaRutaFinalizada = row || null;
    } catch (_) {
      // hora_regreso puede no existir aún — intentar sin ella
      try {
        const [[row]] = await db.query(
          `SELECT r.numero, r.fecha, r.km_fin,
                  u.nombre AS repartidor_nombre
             FROM rutas r
             LEFT JOIN usuarios u ON u.id = r.repartidor_id
             WHERE r.vehiculo_id = ? AND r.estado = 'finalizada' AND r.km_fin IS NOT NULL
             ORDER BY r.fecha DESC, r.id DESC LIMIT 1`,
          [ruta.vehiculo_id]
        );
        ultimaRutaFinalizada = row || null;
      } catch (__) { /* ignorar */ }
    }

    res.json({ data: { ...ruta, stock, pedidos, ultima_ruta_finalizada: ultimaRutaFinalizada } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/rutas/:id ── */
exports.getOne = async (req, res) => {
  try {
    const [[ruta]] = await db.query(
      `SELECT r.*,
              u.nombre AS repartidor_nombre,
              v.placa AS vehiculo_placa, v.marca AS vehiculo_marca, v.modelo AS vehiculo_modelo,
              cr.id AS caja_ruta_id, cr.total_cobrado, cr.total_gastos, cr.neto_a_entregar, cr.estado AS caja_estado,
              cr.cobrado_efectivo, cr.cobrado_transferencia, cr.cobrado_tarjeta, cr.cobrado_credito,
              cr.gasto_combustible, cr.gasto_alimentacion, cr.gasto_otros
         FROM rutas r
         LEFT JOIN usuarios u ON u.id = r.repartidor_id
         LEFT JOIN vehiculos v ON v.id = r.vehiculo_id
         LEFT JOIN caja_ruta cr ON cr.ruta_id = r.id
         WHERE r.id = ?`,
      [req.params.id]
    );
    if (!ruta) return res.status(404).json({ error: 'Ruta no encontrada' });

    const [stock] = await db.query(
      `SELECT sv.*, p.nombre AS presentacion_nombre, p.es_retornable,
              (sv.llenos_cargados - sv.llenos_entregados - sv.llenos_sobrantes) AS llenos_disponibles,
              (sv.vacios_recogidos - sv.vacios_devueltos) AS vacios_en_vehiculo
         FROM stock_vehiculo sv
         JOIN presentaciones p ON p.id = sv.presentacion_id
         WHERE sv.ruta_id = ?`,
      [ruta.id]
    );

    const [pedidos] = await db.query(
      `SELECT ped.*, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono,
              c.direccion AS cliente_direccion, c.latitud AS cliente_lat, c.longitud AS cliente_lng,
              GROUP_CONCAT(CONCAT(pr.nombre, ' x', pd.cantidad) ORDER BY pd.id SEPARATOR ', ') AS productos_resumen
         FROM pedidos ped
         LEFT JOIN clientes c ON c.id = ped.cliente_id
         LEFT JOIN pedido_detalle pd ON pd.pedido_id = ped.id
         LEFT JOIN presentaciones pr ON pr.id = pd.presentacion_id
         WHERE ped.ruta_id = ?
         GROUP BY ped.id
         ORDER BY ped.orden_entrega`,
      [ruta.id]
    );

    res.json({ ...ruta, stock, pedidos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── POST /api/rutas ── */
exports.create = async (req, res) => {
  try {
    // Validar que exista caja principal abierta
    const [[cajaPlanta]] = await db.query(
      "SELECT id FROM cajas WHERE estado IN ('abierta','reabierta') LIMIT 1"
    );
    if (!cajaPlanta) {
      return res.status(400).json({ error: 'No se puede crear una ruta sin caja principal abierta. Pida a planta que abra la caja primero.' });
    }

    const { vehiculo_id, fecha } = req.body;
    // repartidor_id del body (admin crea ruta) o del usuario autenticado (repartidor crea su propia ruta)
    const repartidor_id = req.body.repartidor_id || req.user.id;
    if (!vehiculo_id) {
      return res.status(400).json({ error: 'Se requiere vehículo' });
    }

    // Validar que el vehículo esté asignado al repartidor
    const [[vehAsignado]] = await db.query(
      'SELECT id, repartidor_id FROM vehiculos WHERE id = ? AND activo = 1',
      [vehiculo_id]
    );
    if (!vehAsignado) {
      return res.status(400).json({ error: 'El vehículo no existe o está inactivo' });
    }
    if (!vehAsignado.repartidor_id || vehAsignado.repartidor_id !== repartidor_id) {
      return res.status(400).json({ error: 'No puedes iniciar jornada sin un vehículo asignado. Pide a la encargada que te asigne uno.' });
    }

    const [result] = await db.query(
      `INSERT INTO rutas (numero, repartidor_id, vehiculo_id, fecha, creado_por)
       VALUES ('', ?, ?, ?, ?)`,
      [repartidor_id, vehiculo_id, fecha || new Date().toISOString().slice(0, 10), req.user.id]
    );
    const nuevaRutaId = result.insertId;

    // ── Arrastrar stock remanente de la última ruta finalizada (mismo vehículo) ──
    await db.query(
      `INSERT INTO stock_vehiculo (ruta_id, presentacion_id, llenos_cargados)
       SELECT ?, presentacion_id, (llenos_cargados - llenos_entregados - llenos_sobrantes)
         FROM stock_vehiculo
        WHERE ruta_id = (
          SELECT id FROM rutas
           WHERE repartidor_id = ? AND vehiculo_id = ? AND estado = 'finalizada'
           ORDER BY creado_en DESC LIMIT 1
        )
          AND (llenos_cargados - llenos_entregados - llenos_sobrantes) > 0`,
      [nuevaRutaId, repartidor_id, vehiculo_id]
    );

    const [[created]] = await db.query(
      `SELECT r.*, u.nombre AS repartidor_nombre, v.placa AS vehiculo_placa
         FROM rutas r
         LEFT JOIN usuarios u ON u.id = r.repartidor_id
         LEFT JOIN vehiculos v ON v.id = r.vehiculo_id
         WHERE r.id = ?`,
      [nuevaRutaId]
    );
    logAudit(req, { modulo: 'rutas', accion: 'crear', tabla: 'rutas', registro_id: nuevaRutaId, detalle: { vehiculo_id, repartidor_id } });
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── PUT /api/rutas/:id/salir ── */
/* Al iniciar la ruta se descuenta el stock de planta y se crean los movimientos. */
exports.salir = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { km_inicio } = req.body || {};

    if (km_inicio == null || km_inicio === '') {
      conn.release();
      return res.status(400).json({ error: 'El kilometraje de inicio es obligatorio' });
    }

    await conn.beginTransaction();

    // Validar que exista caja principal abierta
    const [[cajaPlanta]] = await conn.query(
      "SELECT id FROM cajas WHERE estado IN ('abierta','reabierta') LIMIT 1"
    );
    if (!cajaPlanta) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'No se puede iniciar ruta sin caja principal abierta. Pida a planta que abra la caja primero.' });
    }

    const [[ruta]] = await conn.query('SELECT id, estado, vehiculo_id, repartidor_id FROM rutas WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!ruta) { await conn.rollback(); conn.release(); return res.status(404).json({ error: 'Ruta no encontrada' }); }
    if (ruta.estado !== 'preparando') {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'La ruta ya salió o fue finalizada' });
    }

    // Validar que el vehículo esté asignado al repartidor
    const [[vehCheck]] = await conn.query(
      'SELECT id, repartidor_id, kilometraje_actual FROM vehiculos WHERE id = ?', [ruta.vehiculo_id]
    );
    if (!vehCheck) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'El vehículo asignado a esta ruta no existe' });
    }
    if (!vehCheck.repartidor_id || vehCheck.repartidor_id !== ruta.repartidor_id) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'El vehículo no está asignado a este repartidor. Asígnelo primero desde Vehículos.' });
    }

    const kmNum = Number(km_inicio);
    const kmActual = Number(vehCheck.kilometraje_actual) || 0;

    if (kmNum < kmActual) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: `El km de inicio (${kmNum}) no puede ser menor al último registrado (${kmActual})` });
    }

    // Verificar que haya stock cargado
    const [stockItems] = await conn.query(
      'SELECT presentacion_id, llenos_cargados FROM stock_vehiculo WHERE ruta_id = ? AND llenos_cargados > 0',
      [req.params.id]
    );
    if (stockItems.length === 0) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'No hay stock cargado para iniciar la ruta' });
    }

    // Descontar stock de planta y registrar movimientos
    for (const item of stockItems) {
      const [[pres]] = await conn.query(
        'SELECT stock_llenos FROM presentaciones WHERE id = ? FOR UPDATE',
        [item.presentacion_id]
      );
      if (!pres || pres.stock_llenos < item.llenos_cargados) {
        await conn.rollback(); conn.release();
        return res.status(400).json({
          error: `Stock insuficiente en planta para iniciar. Disponible: ${pres?.stock_llenos || 0}, Cargado: ${item.llenos_cargados}. Ajusta la carga antes de salir.`
        });
      }

      await conn.query(
        'UPDATE presentaciones SET stock_llenos = stock_llenos - ? WHERE id = ?',
        [item.llenos_cargados, item.presentacion_id]
      );

      await conn.query(
        `INSERT INTO stock_movimientos
          (presentacion_id, tipo, cantidad, estado_origen, estado_destino, registrado_por, motivo)
         VALUES (?, 'carga_salida', ?, 'lleno', 'en_ruta_lleno', ?, ?)`,
        [item.presentacion_id, item.llenos_cargados, req.user.id, `Carga vehículo ruta #${req.params.id}`]
      );
    }

    // Calcular diferencia: si alguien más usó el vehículo
    const diferencia = kmActual > 0 ? kmNum - kmActual : null;

    await conn.query(
      "UPDATE rutas SET estado = 'en_ruta', hora_salida = NOW(), km_inicio = ?, km_diferencia_inicio = ? WHERE id = ?",
      [kmNum, diferencia, req.params.id]
    );

    // Crear caja_ruta al momento de salir (ya no se crea por trigger al crear ruta)
    const [[existeCaja]] = await conn.query('SELECT id FROM caja_ruta WHERE ruta_id = ?', [req.params.id]);
    if (!existeCaja) {
      await conn.query(
        'INSERT INTO caja_ruta (ruta_id, repartidor_id) VALUES (?, ?)',
        [req.params.id, ruta.repartidor_id]
      );
    }

    await conn.commit();
    conn.release();

    logAudit(req, { modulo: 'rutas', accion: 'editar', tabla: 'rutas', registro_id: Number(req.params.id), detalle: { accion_especifica: 'salir', km_inicio: kmNum } });
    res.json({ ok: true, km_diferencia: diferencia });
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    res.status(500).json({ error: err.message });
  }
};

/* ── PUT /api/rutas/:id/cargar ── */
/* Solo registra la carga prevista en stock_vehiculo.
   El descuento real de planta se hace al iniciar ruta (salir). */
exports.cargar = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { items } = req.body; // [{presentacion_id, cantidad}]
    if (!Array.isArray(items) || items.length === 0) {
      conn.release();
      return res.status(400).json({ error: 'Se requiere al menos un item para cargar' });
    }

    // Validar caja principal abierta
    const [[cajaCheck]] = await conn.query(
      "SELECT id FROM cajas WHERE estado IN ('abierta','reabierta') LIMIT 1"
    );
    if (!cajaCheck) {
      conn.release();
      return res.status(400).json({ error: 'No se puede cargar sin caja principal abierta. Pida a planta que abra la caja primero.' });
    }

    // Verificar que la ruta siga en preparando
    const [[ruta]] = await conn.query('SELECT id, estado FROM rutas WHERE id = ?', [req.params.id]);
    if (!ruta || ruta.estado !== 'preparando') {
      conn.release();
      return res.status(400).json({ error: 'Solo se puede cargar stock mientras la ruta está en preparación' });
    }

    await conn.beginTransaction();

    for (const item of items) {
      // Validación soft: verificar que haya stock suficiente en planta (sin restar, pero con lock)
      const [[pres]] = await conn.query(
        'SELECT stock_llenos FROM presentaciones WHERE id = ? FOR UPDATE',
        [item.presentacion_id]
      );
      if (!pres || pres.stock_llenos < item.cantidad) {
        await conn.rollback(); conn.release();
        return res.status(400).json({
          error: `Stock insuficiente en planta. Disponible: ${pres?.stock_llenos || 0}, Solicitado: ${item.cantidad}`
        });
      }

      // Solo registrar en stock_vehiculo (sin tocar presentaciones ni movimientos)
      await conn.query(
        `INSERT INTO stock_vehiculo (ruta_id, presentacion_id, llenos_cargados)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE llenos_cargados = llenos_cargados + ?`,
        [req.params.id, item.presentacion_id, item.cantidad, item.cantidad]
      );
    }

    await conn.commit();

    // Return updated stock
    const [stock] = await db.query(
      `SELECT sv.*, p.nombre AS presentacion_nombre,
              (sv.llenos_cargados - sv.llenos_entregados - sv.llenos_sobrantes) AS llenos_disponibles,
              (sv.vacios_recogidos - sv.vacios_devueltos) AS vacios_en_vehiculo
         FROM stock_vehiculo sv
         JOIN presentaciones p ON p.id = sv.presentacion_id
         WHERE sv.ruta_id = ?`,
      [req.params.id]
    );
    conn.release();
    res.json({ ok: true, stock });
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    res.status(500).json({ error: err.message });
  }
};

/* ── PUT /api/rutas/:id/finalizar ── */
exports.finalizar = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[ruta]] = await conn.query('SELECT id, estado, vehiculo_id, km_inicio FROM rutas WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!ruta) { await conn.rollback(); conn.release(); return res.status(404).json({ error: 'Ruta no encontrada' }); }
    if (ruta.estado === 'finalizada') { await conn.rollback(); conn.release(); return res.status(400).json({ error: 'La ruta ya fue finalizada' }); }

    // Validar que la caja ya haya sido entregada antes de finalizar ruta
    const [[cajaRuta]] = await conn.query('SELECT id, estado FROM caja_ruta WHERE ruta_id = ? LIMIT 1', [req.params.id]);
    if (!cajaRuta || cajaRuta.estado !== 'entregada') {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'Debes entregar tu caja antes de finalizar la ruta.' });
    }

    const { llenos_sobrantes, vacios_a_planta, km_fin } = req.body;

    // Validar que cantidades no excedan stock real del vehículo
    const [svActual] = await conn.query(
      `SELECT presentacion_id,
              (llenos_cargados - llenos_entregados - llenos_sobrantes) AS llenos_disponibles,
              (vacios_recogidos - vacios_devueltos) AS vacios_disponibles
         FROM stock_vehiculo WHERE ruta_id = ?`,
      [req.params.id]
    );
    const stockMap = {};
    for (const s of svActual) stockMap[s.presentacion_id] = s;

    if (Array.isArray(llenos_sobrantes)) {
      for (const item of llenos_sobrantes) {
        const real = stockMap[item.presentacion_id];
        if ((item.cantidad || 0) > (real?.llenos_disponibles || 0)) {
          await conn.rollback(); conn.release();
          return res.status(400).json({ error: `Llenos a devolver excede lo disponible en el vehículo. Disponible: ${real?.llenos_disponibles || 0}` });
        }
      }
    }
    if (Array.isArray(vacios_a_planta)) {
      for (const item of vacios_a_planta) {
        const real = stockMap[item.presentacion_id];
        if ((item.cantidad || 0) > (real?.vacios_disponibles || 0)) {
          await conn.rollback(); conn.release();
          return res.status(400).json({ error: `Vacíos a devolver excede lo disponible en el vehículo. Disponible: ${real?.vacios_disponibles || 0}` });
        }
      }
    }

    // km_fin es obligatorio
    if (km_fin == null || km_fin === '') {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'El kilometraje de regreso es obligatorio' });
    }
    if (ruta.km_inicio && Number(km_fin) < ruta.km_inicio) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: `El km final (${km_fin}) no puede ser menor al km de salida (${ruta.km_inicio})` });
    }
    await conn.query('UPDATE rutas SET km_fin = ?, hora_regreso = NOW() WHERE id = ?', [km_fin, req.params.id]);
    // Actualizar kilometraje_actual del vehículo
    await conn.query(
      'UPDATE vehiculos SET kilometraje_actual = ? WHERE id = ? AND ? > kilometraje_actual',
      [km_fin, ruta.vehiculo_id, km_fin]
    );

    // Sumar sobrantes/vacíos adicionales a lo que ya se marcó mid-ruta
    if (Array.isArray(llenos_sobrantes)) {
      for (const item of llenos_sobrantes) {
        if ((item.cantidad || 0) > 0) {
          await conn.query(
            `UPDATE stock_vehiculo SET llenos_sobrantes = llenos_sobrantes + ?
             WHERE ruta_id = ? AND presentacion_id = ?`,
            [item.cantidad, req.params.id, item.presentacion_id]
          );
          // Trazabilidad para llenos devueltos al finalizar
          await conn.query(
            `INSERT INTO stock_movimientos (presentacion_id, tipo, cantidad, estado_origen, estado_destino, registrado_por, motivo)
             VALUES (?, 'devolucion_ruta', ?, 'en_ruta_lleno', 'lleno', ?, ?)`,
            [item.presentacion_id, item.cantidad, req.user.id, `Finalizacion ruta #${req.params.id} — llenos devueltos`]
          );
        }
      }
    }
    if (Array.isArray(vacios_a_planta)) {
      for (const item of vacios_a_planta) {
        if ((item.cantidad || 0) > 0) {
          await conn.query(
            `UPDATE stock_vehiculo SET vacios_devueltos = vacios_devueltos + ?
             WHERE ruta_id = ? AND presentacion_id = ?`,
            [item.cantidad, req.params.id, item.presentacion_id]
          );
        }
      }
    }

    // Enviar vacíos restantes (no devueltos en visitas) a cola de lavado
    const [svRows] = await conn.query(
      `SELECT presentacion_id, vacios_devueltos FROM stock_vehiculo WHERE ruta_id = ? AND vacios_devueltos > 0`,
      [req.params.id]
    );
    const [[{ repartidor_id }]] = await conn.query('SELECT repartidor_id FROM rutas WHERE id = ?', [req.params.id]);

    for (const sv of svRows) {
      // Restar lo que ya se envió a lavado desde visitas
      const [[{ ya_enviado }]] = await conn.query(
        `SELECT COALESCE(SUM(cantidad), 0) AS ya_enviado FROM ingresos_vacios
         WHERE ruta_id = ? AND presentacion_id = ? AND origen = 'visita_planta'`,
        [req.params.id, sv.presentacion_id]
      );
      const pendiente = sv.vacios_devueltos - ya_enviado;
      if (pendiente > 0) {
        await conn.query(
          `INSERT INTO stock_movimientos (presentacion_id, tipo, cantidad, estado_origen, estado_destino, registrado_por, motivo)
           VALUES (?, 'devolucion_ruta', ?, 'en_ruta_vacio', 'en_lavado', ?, ?)`,
          [sv.presentacion_id, pendiente, req.user.id, `Finalizacion ruta #${req.params.id}`]
        );
        await conn.query(
          `INSERT INTO ingresos_vacios (presentacion_id, cantidad, origen, ruta_id, repartidor_id, registrado_por)
           VALUES (?, ?, 'finalizacion_ruta', ?, ?, ?)`,
          [sv.presentacion_id, pendiente, req.params.id, repartidor_id, req.user.id]
        );
      }
    }

    // Finalizar ruta (ya no toca vacíos, solo llenos sobrantes + estado)
    await conn.query('CALL sp_finalizar_ruta(?, ?)', [req.params.id, req.user.id]);
    await conn.commit();
    conn.release();

    logAudit(req, { modulo: 'rutas', accion: 'editar', tabla: 'rutas', registro_id: Number(req.params.id), detalle: { accion_especifica: 'finalizar', km_fin } });

    // Emitir alertas de mantenimiento si el km_fin disparó alguna
    try {
      const [alertasMant] = await db.query(
        `SELECT pm.tipo_mantenimiento, pm.categoria, v.placa,
                (pm.ultimo_km_realizado + pm.cada_km) AS proximo_km,
                (pm.ultimo_km_realizado + pm.cada_km) - ? AS km_restante,
                CASE WHEN ? >= (pm.ultimo_km_realizado + pm.cada_km) THEN 'vencido' ELSE 'proximo' END AS nivel
           FROM programacion_mantenimiento pm
           JOIN vehiculos v ON v.id = pm.vehiculo_id
          WHERE pm.activo = 1 AND pm.vehiculo_id = ?
            AND ? >= (pm.ultimo_km_realizado + pm.cada_km - 500)`,
        [km_fin, km_fin, ruta.vehiculo_id, km_fin]
      );
      if (alertasMant.length > 0) {
        const io = req.app.get('io');
        if (io) io.emit('mantenimiento:alerta', { alertas: alertasMant, vehiculo_id: ruta.vehiculo_id });
      }
    } catch (alertErr) {
      console.error('Error emitiendo alertas mantenimiento:', alertErr.message);
    }

    res.json({ ok: true });
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    res.status(500).json({ error: err.message });
  }
};

/* ── PUT /api/rutas/:id/solicitar-entrega — repartidor solicita entregar su caja ── */
exports.solicitarEntrega = async (req, res) => {
  try {
    const usuario_id = req.user.id;

    const [rutas] = await db.query(
      `SELECT r.repartidor_id, cr.id AS caja_ruta_id, cr.estado, cr.solicitada_entrega
         FROM rutas r
         JOIN caja_ruta cr ON cr.ruta_id = r.id
        WHERE r.id = ?`,
      [req.params.id]
    );

    if (rutas.length === 0) return res.status(404).json({ error: 'Ruta no encontrada' });
    if (rutas[0].repartidor_id !== usuario_id) return res.status(403).json({ error: 'Solo puedes entregar tu propia caja' });
    if (rutas[0].estado === 'entregada') return res.status(400).json({ error: 'Esta caja ya fue entregada' });
    if (rutas[0].solicitada_entrega === 1) return res.status(400).json({ error: 'Ya solicitaste la entrega, espera que el cajero confirme' });

    await db.query(
      `UPDATE caja_ruta SET solicitada_entrega = 1, solicitada_en = NOW() WHERE id = ?`,
      [rutas[0].caja_ruta_id]
    );

    res.json({ ok: true, mensaje: 'Entrega solicitada. El cajero confirmará la recepción.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── POST /api/rutas/:id/confirmar-entrega — cajero confirma recepción física ── */
exports.confirmarEntrega = async (req, res) => {
  try {
    const rol = req.user.rol;
    if (!['admin', 'encargada'].includes(rol)) {
      return res.status(403).json({ error: 'Solo admin o encargada pueden confirmar la entrega' });
    }

    const [rutas] = await db.query(
      `SELECT cr.id AS caja_ruta_id, cr.solicitada_entrega, cr.estado, u.nombre AS repartidor
         FROM rutas r
         JOIN caja_ruta cr ON cr.ruta_id = r.id
         JOIN usuarios u ON u.id = r.repartidor_id
        WHERE r.id = ?`,
      [req.params.id]
    );

    if (rutas.length === 0) return res.status(404).json({ error: 'Ruta no encontrada' });
    if (rutas[0].solicitada_entrega !== 1) return res.status(400).json({ error: 'El repartidor aún no ha solicitado entregar su caja' });
    if (rutas[0].estado === 'entregada') return res.status(400).json({ error: 'Esta caja ya fue confirmada' });

    await db.query('CALL sp_entregar_caja_ruta(?, ?)', [req.params.id, req.user.id]);
    await db.query(`UPDATE caja_ruta SET confirmada_en = NOW() WHERE id = ?`, [rutas[0].caja_ruta_id]);

    res.json({ ok: true, mensaje: `Caja de ${rutas[0].repartidor} confirmada y registrada en caja principal` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── POST /api/rutas/:id/entregar-caja — LEGACY: entrega directa (admin) ── */
exports.entregarCaja = async (req, res) => {
  try {
    const rol = req.user.rol;
    if (!['admin', 'encargada'].includes(rol)) {
      return res.status(403).json({ error: 'Solo admin o encargada pueden recibir la caja' });
    }

    // Verificar que el repartidor haya solicitado la entrega
    const [[cr]] = await db.query(
      'SELECT solicitada_entrega, estado FROM caja_ruta WHERE ruta_id = ?',
      [req.params.id]
    );
    if (!cr) return res.status(404).json({ error: 'No hay caja para esta ruta' });
    if (cr.estado === 'entregada') return res.status(400).json({ error: 'Esta caja ya fue entregada' });
    if (!cr.solicitada_entrega) {
      return res.status(400).json({ error: 'El repartidor aún no ha solicitado entregar su caja. Debe dar clic en "Entregar caja" primero.' });
    }

    await db.query('CALL sp_entregar_caja_ruta(?, ?)', [req.params.id, req.user.id]);

    const [[caja]] = await db.query(
      `SELECT * FROM caja_ruta WHERE ruta_id = ?`, [req.params.id]
    );
    res.json({ ok: true, caja });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/rutas/:id/movimientos — movimientos de la caja de ruta ── */
exports.getMovimientosRuta = async (req, res) => {
  try {
    const [[caja]] = await db.query(
      `SELECT id FROM caja_ruta WHERE ruta_id = ?`,
      [req.params.id]
    );
    if (!caja) return res.json({ data: [] });

    const [rows] = await db.query(
      `SELECT crm.*,
              u.nombre AS registrado_por_nombre,
              v.folio AS venta_folio,
              cc.nombre AS categoria_nombre
         FROM caja_ruta_movimientos crm
         LEFT JOIN usuarios u ON u.id = crm.registrado_por
         LEFT JOIN ventas v ON v.id = crm.venta_id
         LEFT JOIN categorias_caja cc ON cc.id = crm.categoria_id
         WHERE crm.caja_ruta_id = ?
         ORDER BY crm.fecha_hora DESC`,
      [caja.id]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── PUT /api/rutas/:id/devolver-vacios ── */
exports.devolverVacios = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { items } = req.body; // [{presentacion_id, cantidad}]
    if (!Array.isArray(items) || items.length === 0) {
      conn.release();
      return res.status(400).json({ error: 'Se requiere al menos un item' });
    }

    await conn.beginTransaction();

    const [[ruta]] = await conn.query('SELECT id, estado FROM rutas WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!ruta) { await conn.rollback(); conn.release(); return res.status(404).json({ error: 'Ruta no encontrada' }); }
    if (ruta.estado === 'finalizada') { await conn.rollback(); conn.release(); return res.status(400).json({ error: 'La ruta ya fue finalizada' }); }

    for (const item of items) {
      if (!item.presentacion_id || !item.cantidad || item.cantidad <= 0) continue;
      const [[sv]] = await conn.query(
        'SELECT vacios_recogidos, vacios_devueltos FROM stock_vehiculo WHERE ruta_id = ? AND presentacion_id = ? FOR UPDATE',
        [req.params.id, item.presentacion_id]
      );
      if (!sv) continue;
      const disponible = sv.vacios_recogidos - sv.vacios_devueltos;
      if (item.cantidad > disponible) {
        await conn.rollback(); conn.release();
        return res.status(400).json({ error: `Solo hay ${disponible} vacíos disponibles para devolver` });
      }
      await conn.query(
        `UPDATE stock_vehiculo SET vacios_devueltos = vacios_devueltos + ?
         WHERE ruta_id = ? AND presentacion_id = ?`,
        [item.cantidad, req.params.id, item.presentacion_id]
      );
    }

    await conn.commit();

    const [stock] = await db.query(
      `SELECT sv.*, p.nombre AS presentacion_nombre,
              (sv.llenos_cargados - sv.llenos_entregados - sv.llenos_sobrantes) AS llenos_disponibles,
              (sv.vacios_recogidos - sv.vacios_devueltos) AS vacios_en_vehiculo
         FROM stock_vehiculo sv
         JOIN presentaciones p ON p.id = sv.presentacion_id
         WHERE sv.ruta_id = ?`,
      [req.params.id]
    );
    conn.release();
    res.json({ ok: true, stock });
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    res.status(500).json({ error: err.message });
  }
};

/* ── PUT /api/rutas/:id/devolver-llenos ── */
exports.devolverLlenos = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { items } = req.body; // [{presentacion_id, cantidad}]
    if (!Array.isArray(items) || items.length === 0) {
      conn.release();
      return res.status(400).json({ error: 'Se requiere al menos un item' });
    }

    await conn.beginTransaction();

    const [[ruta]] = await conn.query('SELECT id, estado FROM rutas WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!ruta) { await conn.rollback(); conn.release(); return res.status(404).json({ error: 'Ruta no encontrada' }); }
    if (ruta.estado === 'finalizada') { await conn.rollback(); conn.release(); return res.status(400).json({ error: 'La ruta ya fue finalizada' }); }

    for (const item of items) {
      if (!item.presentacion_id || !item.cantidad || item.cantidad <= 0) continue;
      const [[sv]] = await conn.query(
        'SELECT llenos_cargados, llenos_entregados, llenos_sobrantes FROM stock_vehiculo WHERE ruta_id = ? AND presentacion_id = ? FOR UPDATE',
        [req.params.id, item.presentacion_id]
      );
      if (!sv) continue;
      const disponible = sv.llenos_cargados - sv.llenos_entregados - sv.llenos_sobrantes;
      if (item.cantidad > disponible) {
        await conn.rollback(); conn.release();
        return res.status(400).json({ error: `Solo hay ${disponible} llenos disponibles para devolver` });
      }
      await conn.query(
        `UPDATE stock_vehiculo SET llenos_sobrantes = llenos_sobrantes + ?
         WHERE ruta_id = ? AND presentacion_id = ?`,
        [item.cantidad, req.params.id, item.presentacion_id]
      );
    }

    await conn.commit();

    const [stock] = await db.query(
      `SELECT sv.*, p.nombre AS presentacion_nombre,
              (sv.llenos_cargados - sv.llenos_entregados - sv.llenos_sobrantes) AS llenos_disponibles,
              (sv.vacios_recogidos - sv.vacios_devueltos) AS vacios_en_vehiculo
         FROM stock_vehiculo sv
         JOIN presentaciones p ON p.id = sv.presentacion_id
         WHERE sv.ruta_id = ?`,
      [req.params.id]
    );
    conn.release();
    res.json({ ok: true, stock });
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    res.status(500).json({ error: err.message });
  }
};

/* ── POST /api/rutas/:id/gasto — movimiento manual (ingreso o egreso) en caja de ruta ── */
exports.registrarGasto = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { clasificacion, monto, descripcion, categoria_id, metodo_pago } = req.body;
    if (!clasificacion || !['ingreso', 'egreso'].includes(clasificacion)) {
      conn.release(); return res.status(400).json({ error: 'Clasificación requerida (ingreso o egreso)' });
    }
    if (!monto || Number(monto) <= 0) { conn.release(); return res.status(400).json({ error: 'El monto debe ser mayor a 0' }); }
    if (!descripcion?.trim()) { conn.release(); return res.status(400).json({ error: 'La descripción es requerida' }); }

    await conn.beginTransaction();

    // Verificar propiedad de la ruta
    const [[ruta]] = await conn.query(
      'SELECT repartidor_id FROM rutas WHERE id = ?', [req.params.id]
    );
    if (!ruta) { await conn.rollback(); conn.release(); return res.status(404).json({ error: 'Ruta no encontrada' }); }
    if (req.user.rol === 'chofer' && ruta.repartidor_id !== req.user.id) {
      await conn.rollback(); conn.release();
      return res.status(403).json({ error: 'No tienes acceso a esta ruta' });
    }

    const [[caja]] = await conn.query(
      `SELECT id, estado, solicitada_entrega, confirmada_en FROM caja_ruta WHERE ruta_id = ? FOR UPDATE`,
      [req.params.id]
    );
    if (!caja) { await conn.rollback(); conn.release(); return res.status(400).json({ error: 'No hay caja para esta ruta' }); }
    if (caja.confirmada_en) { await conn.rollback(); conn.release(); return res.status(400).json({ error: 'La caja ya fue entregada y confirmada' }); }
    if (caja.solicitada_entrega) { await conn.rollback(); conn.release(); return res.status(400).json({ error: 'La caja está en proceso de entrega, no se puede modificar' }); }
    if (caja.estado !== 'abierta') { await conn.rollback(); conn.release(); return res.status(400).json({ error: 'La caja no está abierta' }); }

    const montoNum = Number(monto);
    const desc = descripcion.trim();

    if (clasificacion === 'egreso') {
      // Sumar a total_gastos, restar de neto
      await conn.query(
        `UPDATE caja_ruta SET
           gasto_otros = gasto_otros + ?,
           total_gastos = total_gastos + ?,
           neto_a_entregar = total_cobrado - total_gastos,
           desc_gastos = CONCAT(COALESCE(desc_gastos,''), ?, '\n')
         WHERE id = ?`,
        [montoNum, montoNum,
         `S/${montoNum.toFixed(2)} - ${desc}`, caja.id]
      );
    } else {
      // Ingreso manual: sumar a total_cobrado y al método correspondiente
      const metCol = (metodo_pago === 'transferencia' || metodo_pago === 'yape') ? 'cobrado_transferencia'
        : metodo_pago === 'tarjeta' ? 'cobrado_tarjeta'
        : 'cobrado_efectivo';
      await conn.query(
        `UPDATE caja_ruta SET
           ${metCol} = ${metCol} + ?,
           total_cobrado = total_cobrado + ?,
           neto_a_entregar = total_cobrado - total_gastos
         WHERE id = ?`,
        [montoNum, montoNum, caja.id]
      );
    }

    const tipoMov = clasificacion === 'egreso' ? 'egreso' : 'ingreso';
    await conn.query(
      `INSERT INTO caja_ruta_movimientos (caja_ruta_id, tipo, clasificacion, categoria_id, metodo_pago, monto, descripcion, registrado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [caja.id, tipoMov, clasificacion, categoria_id || null, metodo_pago || 'efectivo', montoNum, desc, req.user.id]
    );

    // Registrar en caja principal como pendiente
    const [[cajaPlanta]] = await conn.query(
      "SELECT id FROM cajas WHERE estado IN ('abierta','reabierta') ORDER BY fecha DESC LIMIT 1"
    );
    if (cajaPlanta) {
      await conn.query(
        `INSERT INTO caja_movimientos (caja_id, tipo, metodo_pago, monto, descripcion, registrado_por, origen, estado_entrega, caja_ruta_id, categoria_id)
         VALUES (?, ?, ?, ?, ?, ?, 'repartidor', 'pendiente', ?, ?)`,
        [cajaPlanta.id, tipoMov, metodo_pago || 'efectivo', montoNum, desc, req.user.id, caja.id, categoria_id || null]
      );
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

/* ── POST /api/rutas/:id/visita-planta — repartidor registra visita a planta ── */
exports.visitaPlanta = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { id } = req.params;
    const { items = [], notas = '' } = req.body;
    const usuario_id = req.user.id;

    const [rutas] = await conn.query(
      `SELECT r.id, r.repartidor_id, cr.estado AS caja_estado
         FROM rutas r
         JOIN caja_ruta cr ON cr.ruta_id = r.id
        WHERE r.id = ? AND r.estado = 'en_ruta'`,
      [id]
    );
    if (rutas.length === 0) {
      await conn.rollback(); conn.release();
      return res.status(404).json({ error: 'Ruta activa no encontrada' });
    }

    const itemsConMovimiento = items.filter(item =>
      (item.vacios_devueltos || 0) > 0 ||
      (item.llenos_devueltos || 0) > 0 ||
      (item.llenos_cargados || 0) > 0
    );
    if (itemsConMovimiento.length === 0) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'No hay movimientos para registrar' });
    }

    const tipos = [];
    if (itemsConMovimiento.some(i => (i.vacios_devueltos || 0) > 0)) tipos.push('devolucion_vacios');
    if (itemsConMovimiento.some(i => (i.llenos_devueltos || 0) > 0)) tipos.push('devolucion_llenos');
    if (itemsConMovimiento.some(i => (i.llenos_cargados || 0) > 0)) tipos.push('carga_llenos');

    const [visita] = await conn.query(
      `INSERT INTO visitas_planta (ruta_id, repartidor_id, tipo, notas, registrado_por)
       VALUES (?, ?, ?, ?, ?)`,
      [id, rutas[0].repartidor_id, tipos.join(','), notas || null, usuario_id]
    );
    const visita_id = visita.insertId;

    for (const item of itemsConMovimiento) {
      const vacios = item.vacios_devueltos || 0;
      const llenosD = item.llenos_devueltos || 0;
      const llenosC = item.llenos_cargados || 0;

      await conn.query(
        `INSERT INTO visita_detalle (visita_id, presentacion_id, vacios_devueltos, llenos_devueltos, llenos_cargados)
         VALUES (?, ?, ?, ?, ?)`,
        [visita_id, item.presentacion_id, vacios, llenosD, llenosC]
      );

      if (vacios > 0) {
        // Marcar en stock_vehiculo
        await conn.query(
          `UPDATE stock_vehiculo SET vacios_devueltos = vacios_devueltos + ?
           WHERE ruta_id = ? AND presentacion_id = ?`,
          [vacios, id, item.presentacion_id]
        );
        // Enviar a cola de lavado
        await conn.query(
          `INSERT INTO stock_movimientos (presentacion_id, tipo, cantidad, estado_origen, estado_destino, registrado_por, motivo)
           VALUES (?, 'devolucion_ruta', ?, 'en_ruta_vacio', 'en_lavado', ?, ?)`,
          [item.presentacion_id, vacios, usuario_id, `Visita planta ruta #${id}`]
        );
        // Registrar ingreso de vacíos sucios
        await conn.query(
          `INSERT INTO ingresos_vacios (presentacion_id, cantidad, origen, ruta_id, visita_id, repartidor_id, registrado_por)
           VALUES (?, ?, 'visita_planta', ?, ?, ?, ?)`,
          [item.presentacion_id, vacios, id, visita_id, rutas[0].repartidor_id, usuario_id]
        );
        // Actualizar stock_en_lavado inmediatamente (vacios sucios entran a cola de lavado)
        await conn.query(
          `UPDATE presentaciones SET stock_en_lavado = stock_en_lavado + ? WHERE id = ?`,
          [vacios, item.presentacion_id]
        );
      }
      if (llenosD > 0) {
        await conn.query(
          `UPDATE stock_vehiculo SET llenos_sobrantes = llenos_sobrantes + ?
           WHERE ruta_id = ? AND presentacion_id = ?`,
          [llenosD, id, item.presentacion_id]
        );
        // Sumar a stock de planta inmediatamente
        await conn.query(
          `UPDATE presentaciones SET stock_llenos = stock_llenos + ? WHERE id = ?`,
          [llenosD, item.presentacion_id]
        );
        // Trazabilidad
        await conn.query(
          `INSERT INTO stock_movimientos (presentacion_id, tipo, cantidad, estado_origen, estado_destino, registrado_por, motivo)
           VALUES (?, 'devolucion_ruta', ?, 'en_ruta_lleno', 'lleno', ?, ?)`,
          [item.presentacion_id, llenosD, usuario_id, `Visita planta ruta #${id} — llenos devueltos`]
        );
      }
      if (llenosC > 0) {
        // Descuento atómico con validación de stock
        const [upd] = await conn.query(
          'UPDATE presentaciones SET stock_llenos = stock_llenos - ? WHERE id = ? AND stock_llenos >= ?',
          [llenosC, item.presentacion_id, llenosC]
        );
        if (upd.affectedRows === 0) {
          const [[{ stock_llenos }]] = await conn.query('SELECT stock_llenos FROM presentaciones WHERE id = ?', [item.presentacion_id]);
          await conn.rollback(); conn.release();
          return res.status(400).json({ error: `Stock insuficiente para cargar. Disponible: ${stock_llenos}, Solicitado: ${llenosC}` });
        }
        await conn.query(
          `INSERT INTO stock_vehiculo (ruta_id, presentacion_id, llenos_cargados)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE llenos_cargados = llenos_cargados + ?`,
          [id, item.presentacion_id, llenosC, llenosC]
        );
      }
    }

    await conn.commit();

    const [stockActual] = await db.query(
      `SELECT sv.presentacion_id, p.nombre AS presentacion_nombre,
              (sv.llenos_cargados - sv.llenos_entregados - sv.llenos_sobrantes) AS llenos_disponibles,
              (sv.vacios_recogidos - sv.vacios_devueltos) AS vacios_en_vehiculo,
              p.stock_llenos AS stock_planta
         FROM stock_vehiculo sv
         JOIN presentaciones p ON p.id = sv.presentacion_id
        WHERE sv.ruta_id = ?`,
      [id]
    );

    conn.release();
    res.json({ ok: true, mensaje: 'Visita a planta registrada', tipos, stock_vehiculo: stockActual });
  } catch (error) {
    await conn.rollback().catch(() => {});
    conn.release();
    res.status(500).json({ error: error.message });
  }
};

/* ── GET /api/rutas/:id/visitas — historial de visitas a planta ── */
exports.getVisitas = async (req, res) => {
  try {
    const [visitas] = await db.query(
      `SELECT vp.*,
              GROUP_CONCAT(
                CONCAT(p.nombre,
                  IF(vd.vacios_devueltos>0, CONCAT(' V:', vd.vacios_devueltos), ''),
                  IF(vd.llenos_devueltos>0, CONCAT(' LD:', vd.llenos_devueltos), ''),
                  IF(vd.llenos_cargados>0, CONCAT(' LC:', vd.llenos_cargados), '')
                ) SEPARATOR ' | '
              ) AS resumen
         FROM visitas_planta vp
         JOIN visita_detalle vd ON vd.visita_id = vp.id
         JOIN presentaciones p ON p.id = vd.presentacion_id
        WHERE vp.ruta_id = ?
        GROUP BY vp.id
        ORDER BY vp.fecha_hora DESC`,
      [req.params.id]
    );
    res.json({ data: visitas });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/rutas/:id/stock-vehiculo — stock actual del vehículo ── */
exports.getStockVehiculo = async (req, res) => {
  try {
    const [stock] = await db.query(
      `SELECT sv.presentacion_id, p.nombre AS presentacion_nombre, p.es_retornable,
              p.precio_base,
              sv.llenos_cargados, sv.llenos_entregados, sv.llenos_sobrantes,
              sv.vacios_recogidos, sv.vacios_devueltos,
              (sv.llenos_cargados - sv.llenos_entregados - sv.llenos_sobrantes) AS llenos_disponibles,
              (sv.vacios_recogidos - sv.vacios_devueltos) AS vacios_en_vehiculo,
              p.stock_llenos AS stock_planta
         FROM stock_vehiculo sv
         JOIN presentaciones p ON p.id = sv.presentacion_id
        WHERE sv.ruta_id = ?`,
      [req.params.id]
    );
    res.json({ data: stock });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── POST /api/rutas/:id/venta-rapida — venta al paso del repartidor ── */
exports.ventaRapida = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const rutaId = Number(req.params.id);

    // Validar caja de planta abierta
    const [[cajaPlanta]] = await conn.query(
      "SELECT id FROM cajas WHERE estado IN ('abierta','reabierta') LIMIT 1"
    );
    if (!cajaPlanta) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'No hay caja de planta abierta.' });
    }

    // Validar ruta activa del chofer
    const [[ruta]] = await conn.query(
      "SELECT id, repartidor_id, estado FROM rutas WHERE id = ? AND repartidor_id = ? AND estado IN ('en_ruta','regresando')",
      [rutaId, req.user.id]
    );
    if (!ruta) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'No tienes una ruta activa.' });
    }

    // Validar caja_ruta
    const [[cajaRuta]] = await conn.query(
      "SELECT id, estado FROM caja_ruta WHERE ruta_id = ? LIMIT 1", [rutaId]
    );
    if (!cajaRuta || cajaRuta.estado === 'entregada') {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'Tu caja ya fue entregada. Inicia una nueva ruta.' });
    }

    const { lineas = [], pagos: pagosArray = [], cliente_id = null, notas = '' } = req.body;

    if (!Array.isArray(lineas) || lineas.length === 0) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'Agrega al menos un producto' });
    }

    // Validar tipo_linea
    const TIPOS_VALIDOS_VR = ['compra_bidon', 'recarga', 'prestamo', 'producto', 'bonificacion'];
    for (const l of lineas) {
      const tipoLinea = l.tipo_linea || 'producto';
      if (!TIPOS_VALIDOS_VR.includes(tipoLinea)) {
        await conn.rollback(); conn.release();
        return res.status(400).json({ error: `tipo_linea inválido: ${tipoLinea}` });
      }
    }

    // Prestamo requiere cliente
    const tienePrestamo = lineas.some(l => (l.tipo_linea || 'producto') === 'prestamo');
    if (tienePrestamo && !cliente_id) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'Las líneas de préstamo requieren seleccionar un cliente' });
    }

    // Normalize pagos
    const pagos = (Array.isArray(pagosArray) ? pagosArray : [])
      .filter(p => Number(p.monto) > 0)
      .map(p => ({ metodo: p.metodo, monto: Number(p.monto) }));

    // Calcular total
    let subtotal = 0;
    for (const l of lineas) {
      subtotal += (Number(l.precio_unitario) || 0) * (Number(l.cantidad) || 1);
    }
    const total = subtotal;

    // Validar pagos cubren total
    const esSoloBonifVR = lineas.every(l => (l.tipo_linea || 'producto') === 'bonificacion');
    if (pagos.length === 0 && total > 0 && !esSoloBonifVR) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'Selecciona al menos un método de pago' });
    }
    const sumPagos = pagos.reduce((s, p) => s + p.monto, 0);
    if (total > 0 && !esSoloBonifVR && Math.abs(sumPagos - total) > 0.02) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: `Suma de pagos (S/ ${sumPagos.toFixed(2)}) no coincide con total (S/ ${total.toFixed(2)})` });
    }

    // Validar métodos de pago
    const [metodosActivos] = await conn.query('SELECT nombre FROM metodos_pago_config WHERE activo = 1');
    const nombresActivos = new Set(metodosActivos.map(m => m.nombre));
    for (const p of pagos) {
      if (!nombresActivos.has(p.metodo)) {
        await conn.rollback(); conn.release();
        return res.status(400).json({ error: `Método de pago "${p.metodo}" no válido` });
      }
    }

    // Validar stock del vehículo
    const permitirSinStock = await getConfigValue('entregar_sin_stock', '1', conn);
    if (permitirSinStock === '0') {
      const [stockRows] = await conn.query(
        `SELECT presentacion_id, (llenos_cargados - llenos_entregados - llenos_sobrantes) AS disponibles
           FROM stock_vehiculo WHERE ruta_id = ? FOR UPDATE`, [rutaId]
      );
      const stockMap = {};
      for (const s of stockRows) stockMap[s.presentacion_id] = Number(s.disponibles);
      for (const l of lineas) {
        const cant = Number(l.cantidad) || 1;
        const disp = stockMap[l.presentacion_id] || 0;
        if (cant > disp) {
          await conn.rollback(); conn.release();
          return res.status(400).json({ error: 'Stock insuficiente en el vehículo. Recarga antes de vender.' });
        }
      }
    }

    // Legacy columns
    const legacyEfectivo      = pagos.filter(p => p.metodo === 'efectivo').reduce((s, p) => s + p.monto, 0);
    const legacyTransferencia = pagos.filter(p => p.metodo === 'transferencia').reduce((s, p) => s + p.monto, 0);
    const legacyTarjeta       = pagos.filter(p => p.metodo === 'tarjeta').reduce((s, p) => s + p.monto, 0);
    const legacyCredito       = pagos.filter(p => p.metodo === 'credito').reduce((s, p) => s + p.monto, 0);
    const deuda_generada = legacyCredito;
    const estado_venta = deuda_generada > 0 ? 'pendiente' : 'pagada';

    // Crear venta
    const [ventaResult] = await conn.query(
      `INSERT INTO ventas
         (cliente_id, vendedor_id, repartidor_id, origen, ruta_id,
          subtotal, descuento, total,
          pagado_efectivo, pagado_transferencia, pagado_tarjeta, pagado_credito,
          deuda_generada, estado, notas)
       VALUES (?, ?, ?, 'reparto', ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cliente_id || null, req.user.id, req.user.id, rutaId,
        subtotal, total,
        legacyEfectivo, legacyTransferencia, legacyTarjeta, legacyCredito,
        deuda_generada, estado_venta, notas?.trim() || 'Venta al paso',
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

    // Registrar cobros en caja_ruta + caja_movimientos
    const { getCategoriaId } = require('../helpers/categoriaCaja');
    const catVentaPaso = await getCategoriaId('Venta', conn);
    for (const p of pagos) {
      if (p.monto > 0) {
        await conn.query(
          `INSERT INTO caja_ruta_movimientos (caja_ruta_id, venta_id, tipo, clasificacion, categoria_id, metodo_pago, monto, descripcion, registrado_por)
           VALUES (?, ?, 'cobro_venta', 'ingreso', ?, ?, ?, ?, ?)`,
          [cajaRuta.id, ventaId, catVentaPaso, p.metodo, p.monto, `Venta al paso #${ventaId}`, req.user.id]
        );
        await conn.query(
          `INSERT INTO caja_movimientos (caja_id, tipo, metodo_pago, monto, descripcion, venta_id, registrado_por, origen, estado_entrega, caja_ruta_id, categoria_id)
           VALUES (?, 'ingreso', ?, ?, ?, ?, ?, 'repartidor', 'pendiente', ?, ?)`,
          [cajaPlanta.id, p.metodo, p.monto, `Venta al paso #${ventaId}`, ventaId, req.user.id, cajaRuta.id, catVentaPaso]
        );
      }
    }

    // Actualizar totales caja_ruta
    const totalPagos = pagos.reduce((s, p) => s + p.monto, 0);
    await conn.query(
      `UPDATE caja_ruta SET
         cobrado_efectivo = cobrado_efectivo + ?,
         cobrado_transferencia = cobrado_transferencia + ?,
         cobrado_tarjeta = cobrado_tarjeta + ?,
         cobrado_credito = cobrado_credito + ?,
         total_cobrado = total_cobrado + ?,
         neto_a_entregar = total_cobrado - total_gastos
       WHERE id = ?`,
      [legacyEfectivo, legacyTransferencia, legacyTarjeta, legacyCredito, totalPagos, cajaRuta.id]
    );

    // Insert venta_detalle + actualizar stock vehículo
    for (const l of lineas) {
      const cantidad = Number(l.cantidad) || 1;
      const precioU  = Number(l.precio_unitario) || 0;
      const vacios   = Number(l.vacios_recibidos) || 0;
      const sub      = precioU * cantidad;

      const tipoLineaVR = l.tipo_linea || 'producto';
      const garantiaVR = (tipoLineaVR === 'prestamo' || (tipoLineaVR === 'bonificacion' && Number(l.garantia) > 0) || (tipoLineaVR === 'recarga' && Number(l.garantia) > 0)) ? (Number(l.garantia) || 0) : 0;
      await conn.query(
        `INSERT INTO venta_detalle
           (venta_id, presentacion_id, tipo_linea, cantidad, vacios_recibidos, precio_unitario, subtotal, garantia)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [ventaId, l.presentacion_id, tipoLineaVR, cantidad, vacios, precioU, sub, garantiaVR]
      );

      // Trazabilidad stock
      await conn.query(
        `INSERT INTO stock_movimientos
           (presentacion_id, tipo, cantidad, estado_origen, estado_destino,
            venta_id, cliente_id, repartidor_id, registrado_por, motivo)
         VALUES (?, 'venta', ?, 'en_ruta_lleno', 'vendido', ?, ?, ?, ?, ?)`,
        [l.presentacion_id, cantidad, ventaId, cliente_id || null,
         req.user.id, req.user.id, `Venta al paso #${ventaId}`]
      );

      // Descontar del stock del vehículo
      await conn.query(
        `INSERT INTO stock_vehiculo (ruta_id, presentacion_id, llenos_cargados, llenos_entregados)
         VALUES (?, ?, 0, ?)
         ON DUPLICATE KEY UPDATE llenos_entregados = llenos_entregados + VALUES(llenos_entregados)`,
        [rutaId, l.presentacion_id, cantidad]
      );

      // Si recibió vacíos (recarga/retornable)
      if (vacios > 0) {
        await conn.query(
          `INSERT INTO stock_vehiculo (ruta_id, presentacion_id, llenos_cargados, vacios_recogidos)
           VALUES (?, ?, 0, ?)
           ON DUPLICATE KEY UPDATE vacios_recogidos = vacios_recogidos + VALUES(vacios_recogidos)`,
          [rutaId, l.presentacion_id, vacios]
        );
      }
    }

    // ── Préstamo automático: vacíos faltantes en recargas retornables ──
    if (cliente_id) {
      let totalPrestamo = 0;
      for (const l of lineas) {
        const tipoLinea = l.tipo_linea || 'producto';
        if (tipoLinea !== 'recarga' && tipoLinea !== 'bonificacion') continue;
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
          [totalPrestamo, cliente_id]
        );
      }
    }

    // Garantías
    let totalGarantiaVR = 0;
    let garantiaMetodoVR = 'efectivo';
    for (const l of lineas) {
      if (Number(l.garantia) > 0) {
        totalGarantiaVR += Number(l.garantia);
        if (l.garantia_metodo) garantiaMetodoVR = l.garantia_metodo;
      }
    }
    if (totalGarantiaVR > 0 && cliente_id) {
      await conn.query(
        'UPDATE clientes SET saldo_garantia = saldo_garantia + ? WHERE id = ?',
        [totalGarantiaVR, cliente_id]
      );
      const catGarVR = await getCategoriaId('Garantía recibida', conn);
      const [[cliNomVR]] = await conn.query('SELECT nombre FROM clientes WHERE id = ?', [cliente_id]);
      await conn.query(
        `INSERT INTO caja_ruta_movimientos (caja_ruta_id, venta_id, tipo, clasificacion, categoria_id, metodo_pago, monto, descripcion, registrado_por)
         VALUES (?, ?, 'ingreso', 'ingreso', ?, ?, ?, ?, ?)`,
        [cajaRuta.id, ventaId, catGarVR, garantiaMetodoVR, totalGarantiaVR,
         `Garantía venta #${ventaId} - ${cliNomVR?.nombre || 'Cliente'}`, req.user.id]
      );
      // Sumar garantia a totales caja_ruta
      await conn.query(
        `UPDATE caja_ruta SET total_cobrado = total_cobrado + ?, neto_a_entregar = total_cobrado - total_gastos WHERE id = ?`,
        [totalGarantiaVR, cajaRuta.id]
      );
      await conn.query(
        `INSERT INTO caja_movimientos (caja_id, tipo, metodo_pago, monto, descripcion, cliente_id, venta_id, registrado_por, origen, estado_entrega, caja_ruta_id, categoria_id)
         VALUES (?, 'ingreso', ?, ?, ?, ?, ?, ?, 'repartidor', 'pendiente', ?, ?)`,
        [cajaPlanta.id, garantiaMetodoVR, totalGarantiaVR,
         `Garantía venta #${ventaId} - ${cliNomVR?.nombre || 'Cliente'}`,
         cliente_id, ventaId, req.user.id, cajaRuta.id, catGarVR]
      );
    }

    // Deuda del cliente
    if (cliente_id && deuda_generada > 0) {
      // Validar crédito máximo (0 = sin límite)
      const [[cli]] = await conn.query(
        'SELECT saldo_dinero, credito_maximo FROM clientes WHERE id = ? FOR UPDATE', [cliente_id]
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

    await conn.commit();
    conn.release();
    logAudit(req, { modulo: 'rutas', accion: 'crear', tabla: 'ventas', registro_id: ventaId, detalle: { accion_especifica: 'venta_al_paso', ruta_id: rutaId } });
    res.status(201).json({ ok: true, venta_id: ventaId });
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    res.status(500).json({ error: err.message });
  }
};

/* ── PUT /api/rutas/:id/anular-venta-al-paso/:ventaId ── */
exports.anularVentaAlPaso = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const rutaId  = Number(req.params.id);
    const ventaId = Number(req.params.ventaId);

    // Obtener venta
    const [[venta]] = await conn.query(
      "SELECT * FROM ventas WHERE id = ? AND ruta_id = ? AND origen = 'reparto' FOR UPDATE",
      [ventaId, rutaId]
    );
    if (!venta) {
      await conn.rollback(); conn.release();
      return res.status(404).json({ error: 'Venta no encontrada' });
    }
    if (venta.estado === 'cancelada') {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'Esta venta ya fue anulada' });
    }

    // Obtener lineas y pagos
    const [lineas] = await conn.query('SELECT * FROM venta_detalle WHERE venta_id = ?', [ventaId]);
    const [pagos]  = await conn.query('SELECT * FROM venta_pagos WHERE venta_id = ?', [ventaId]);

    // Caja ruta
    const [[cajaRuta]] = await conn.query(
      'SELECT id FROM caja_ruta WHERE ruta_id = ? LIMIT 1', [rutaId]
    );

    // 1. Marcar venta como cancelada (anulada)
    await conn.query("UPDATE ventas SET estado = 'cancelada' WHERE id = ?", [ventaId]);

    // 2. Revertir dinero en caja_ruta
    if (cajaRuta) {
      const { getCategoriaId: getCatId } = require('../helpers/categoriaCaja');
      const catDevol = await getCatId('Devolución', conn);
      for (const p of pagos) {
        await conn.query(
          `INSERT INTO caja_ruta_movimientos (caja_ruta_id, venta_id, tipo, clasificacion, categoria_id, metodo_pago, monto, descripcion, registrado_por)
           VALUES (?, ?, 'ajuste', 'egreso', ?, ?, ?, ?, ?)`,
          [cajaRuta.id, ventaId, catDevol, p.metodo_pago, -p.monto, `Anulación venta al paso #${ventaId}`, req.user.id]
        );
      }
      await conn.query(
        `UPDATE caja_ruta SET
           cobrado_efectivo = cobrado_efectivo - ?,
           cobrado_transferencia = cobrado_transferencia - ?,
           cobrado_tarjeta = cobrado_tarjeta - ?,
           cobrado_credito = cobrado_credito - ?,
           total_cobrado = total_cobrado - ?,
           neto_a_entregar = total_cobrado - total_gastos
         WHERE id = ?`,
        [venta.pagado_efectivo, venta.pagado_transferencia,
         venta.pagado_tarjeta, venta.pagado_credito,
         venta.total, cajaRuta.id]
      );
    }

    // 3. Anular caja_movimientos de planta asociados (preservar auditoría)
    await conn.query(
      "UPDATE caja_movimientos SET anulado = 1, anulado_por = ?, anulado_en = NOW() WHERE venta_id = ? AND tipo = 'ingreso' AND anulado = 0",
      [req.user.id, ventaId]
    );

    // 4. Revertir stock vehículo por cada línea
    for (const l of lineas) {
      // Devolver llenos al vehículo
      await conn.query(
        `UPDATE stock_vehiculo SET llenos_entregados = GREATEST(0, llenos_entregados - ?)
         WHERE ruta_id = ? AND presentacion_id = ?`,
        [l.cantidad, rutaId, l.presentacion_id]
      );

      // Restar vacíos recibidos del vehículo
      if (l.vacios_recibidos > 0) {
        await conn.query(
          `UPDATE stock_vehiculo SET vacios_recogidos = GREATEST(0, vacios_recogidos - ?)
           WHERE ruta_id = ? AND presentacion_id = ?`,
          [l.vacios_recibidos, rutaId, l.presentacion_id]
        );
      }

      // Revertir prestamo auto de recarga/bonificacion (vacios faltantes)
      if ((l.tipo_linea === 'recarga' || l.tipo_linea === 'bonificacion') && venta.cliente_id) {
        const faltantes = l.cantidad - l.vacios_recibidos;
        if (faltantes > 0) {
          await conn.query(
            'UPDATE clientes SET bidones_prestados = GREATEST(0, bidones_prestados - ?) WHERE id = ?',
            [faltantes, venta.cliente_id]
          );
        }
      }

      // Si fue préstamo, revertir bidones_prestados y devoluciones asociadas
      if (l.tipo_linea === 'prestamo' && venta.cliente_id) {
        // Buscar devoluciones activas en esta ruta para este cliente+presentación
        const [devs] = await conn.query(
          `SELECT * FROM devoluciones
           WHERE cliente_id = ? AND presentacion_id = ? AND ruta_id = ? AND estado = 'activa'
           ORDER BY id DESC`,
          [venta.cliente_id, l.presentacion_id, rutaId]
        );

        let prestamoPorAnular = Number(l.cantidad);

        for (const dev of devs) {
          if (prestamoPorAnular <= 0) break;
          const devQty = Math.min(Number(dev.cantidad), prestamoPorAnular);

          // Anular devolución
          await conn.query("UPDATE devoluciones SET estado = 'anulada' WHERE id = ?", [dev.id]);

          // Revertir bidones_prestados (la devolución los había restado)
          await conn.query(
            'UPDATE clientes SET bidones_prestados = bidones_prestados + ? WHERE id = ?',
            [devQty, venta.cliente_id]
          );

          // Revertir vacíos del vehículo (la devolución los había sumado)
          await conn.query(
            `UPDATE stock_vehiculo SET vacios_recogidos = GREATEST(0, vacios_recogidos - ?)
             WHERE ruta_id = ? AND presentacion_id = ?`,
            [devQty, rutaId, l.presentacion_id]
          );

          prestamoPorAnular -= devQty;
        }

        // Revertir el préstamo: quitar bidones_prestados que sumó la venta
        await conn.query(
          'UPDATE clientes SET bidones_prestados = GREATEST(0, bidones_prestados - ?) WHERE id = ?',
          [l.cantidad, venta.cliente_id]
        );
      }
    }

    // 5. Revertir deuda del cliente
    if (venta.cliente_id && venta.deuda_generada > 0) {
      await conn.query(
        'UPDATE clientes SET saldo_dinero = GREATEST(0, saldo_dinero - ?) WHERE id = ?',
        [venta.deuda_generada, venta.cliente_id]
      );
    }

    await conn.commit();
    conn.release();
    logAudit(req, { modulo: 'rutas', accion: 'anular', tabla: 'ventas', registro_id: ventaId, detalle: { accion_especifica: 'anular_venta_al_paso', ruta_id: rutaId } });
    res.json({ ok: true });
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    res.status(500).json({ error: err.message });
  }
};

/* ── POST /api/rutas/:id/cobrar-deuda ── */
exports.cobrarDeuda = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const rutaId = Number(req.params.id);
    const { cliente_id, monto, metodo_pago, venta_id, notas } = req.body;

    if (!cliente_id) { await conn.rollback(); conn.release(); return res.status(400).json({ error: 'cliente_id es requerido' }); }
    if (!monto || Number(monto) <= 0) { await conn.rollback(); conn.release(); return res.status(400).json({ error: 'El monto debe ser mayor a 0' }); }
    if (!metodo_pago) { await conn.rollback(); conn.release(); return res.status(400).json({ error: 'Selecciona un método de pago' }); }

    const montoNum = Number(monto);

    // Validar ruta activa
    const [[ruta]] = await conn.query(
      "SELECT id FROM rutas WHERE id = ? AND repartidor_id = ? AND estado IN ('en_ruta','regresando')",
      [rutaId, req.user.id]
    );
    if (!ruta) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'No tienes una ruta activa' });
    }

    // Validar caja_ruta
    const [[cajaRuta]] = await conn.query(
      "SELECT id FROM caja_ruta WHERE ruta_id = ? AND estado != 'entregada' LIMIT 1", [rutaId]
    );
    if (!cajaRuta) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'Tu caja ya fue entregada' });
    }

    // Validar cliente con deuda
    const [[cliente]] = await conn.query(
      'SELECT id, nombre, saldo_dinero FROM clientes WHERE id = ? AND activo = 1 FOR UPDATE',
      [cliente_id]
    );
    if (!cliente) {
      await conn.rollback(); conn.release();
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    if (Number(cliente.saldo_dinero) <= 0) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'El cliente no tiene deuda pendiente' });
    }
    if (montoNum > Number(cliente.saldo_dinero)) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: `El monto excede la deuda del cliente (S/ ${Number(cliente.saldo_dinero).toFixed(2)})` });
    }

    // 1. Insertar pago — trigger trg_abono_cliente maneja saldo_dinero + caja_movimientos planta
    const [pagoResult] = await conn.query(
      `INSERT INTO pagos_clientes (cliente_id, venta_id, monto, metodo_pago, registrado_por, notas)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [cliente_id, venta_id || null, montoNum, metodo_pago, req.user.id, notas?.trim() || `Cobro en ruta #${rutaId}`]
    );

    // 2. Marcar el caja_movimientos (creado por trigger) como origen repartidor pendiente
    await conn.query(
      `UPDATE caja_movimientos
       SET origen = 'repartidor', estado_entrega = 'pendiente', caja_ruta_id = ?
       WHERE pago_id = ? AND tipo = 'abono_cliente'`,
      [cajaRuta.id, pagoResult.insertId]
    );

    // 3. Registrar en caja_ruta
    const METODO_CAMPO = {
      efectivo: 'cobrado_efectivo',
      transferencia: 'cobrado_transferencia',
      tarjeta: 'cobrado_tarjeta',
      credito: 'cobrado_credito',
    };
    const campoMetodo = METODO_CAMPO[metodo_pago] || null;

    const { getCategoriaId: getCatIdDeuda } = require('../helpers/categoriaCaja');
    const catCobroDeuda = await getCatIdDeuda('Cobro deuda', conn);
    await conn.query(
      `INSERT INTO caja_ruta_movimientos (caja_ruta_id, tipo, clasificacion, categoria_id, metodo_pago, monto, descripcion, registrado_por)
       VALUES (?, 'cobro_venta', 'ingreso', ?, ?, ?, ?, ?)`,
      [cajaRuta.id, catCobroDeuda, metodo_pago, montoNum, `Cobro deuda ${cliente.nombre} — pago #${pagoResult.insertId}`, req.user.id]
    );

    // Actualizar columna legacy si el método tiene campo correspondiente + siempre total_cobrado
    if (campoMetodo) {
      await conn.query(
        `UPDATE caja_ruta SET
           ${campoMetodo} = ${campoMetodo} + ?,
           total_cobrado = total_cobrado + ?,
           neto_a_entregar = total_cobrado - total_gastos
         WHERE id = ?`,
        [montoNum, montoNum, cajaRuta.id]
      );
    } else {
      await conn.query(
        `UPDATE caja_ruta SET
           total_cobrado = total_cobrado + ?,
           neto_a_entregar = total_cobrado - total_gastos
         WHERE id = ?`,
        [montoNum, cajaRuta.id]
      );
    }

    await conn.commit();

    const [[saldoActual]] = await db.query(
      'SELECT saldo_dinero FROM clientes WHERE id = ?', [cliente_id]
    );

    conn.release();
    logAudit(req, { modulo: 'rutas', accion: 'crear', tabla: 'pagos_clientes', registro_id: pagoResult.insertId, detalle: { accion_especifica: 'cobro_deuda_reparto', ruta_id: rutaId, cliente_id } });
    res.status(201).json({ ok: true, pago_id: pagoResult.insertId, saldo_actualizado: Number(saldoActual.saldo_dinero) });
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/rutas/:id/cobros-deuda ── */
exports.getCobrosDeuda = async (req, res) => {
  try {
    const rutaId = Number(req.params.id);
    const [[ruta]] = await db.query('SELECT repartidor_id, fecha FROM rutas WHERE id = ?', [rutaId]);
    if (!ruta) return res.status(404).json({ error: 'Ruta no encontrada' });

    const [rows] = await db.query(
      `SELECT p.id, p.monto, p.metodo_pago, p.notas, p.fecha_hora,
              c.nombre AS cliente_nombre, c.saldo_dinero
       FROM pagos_clientes p
       JOIN clientes c ON c.id = p.cliente_id
       WHERE p.registrado_por = ? AND DATE(p.fecha_hora) = ? AND p.estado = 'activo'
       ORDER BY p.fecha_hora DESC`,
      [ruta.repartidor_id, ruta.fecha]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/rutas/:id/ventas-al-paso ── */
exports.getVentasAlPaso = async (req, res) => {
  try {
    const rutaId = Number(req.params.id);
    const [rows] = await db.query(
      `SELECT v.id, v.total, v.estado, v.notas, v.fecha_hora,
              c.nombre AS cliente_nombre,
              GROUP_CONCAT(
                CONCAT(vd.cantidad, 'x ', p.nombre) ORDER BY vd.id SEPARATOR ', '
              ) AS detalle
       FROM ventas v
       LEFT JOIN clientes c ON c.id = v.cliente_id
       LEFT JOIN venta_detalle vd ON vd.venta_id = v.id
       LEFT JOIN presentaciones p ON p.id = vd.presentacion_id
       WHERE v.ruta_id = ? AND v.origen = 'reparto' AND v.repartidor_id = v.vendedor_id
       GROUP BY v.id
       ORDER BY v.fecha_hora DESC`,
      [rutaId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


/* == PUT /api/rutas/:id/movimientos/:movId/anular == */
exports.anularMovimientoRuta = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[mov]] = await conn.query(
      'SELECT crm.*, cr.ruta_id, cr.estado AS caja_estado FROM caja_ruta_movimientos crm JOIN caja_ruta cr ON cr.id = crm.caja_ruta_id WHERE crm.id = ? FOR UPDATE',
      [req.params.movId]
    );
    if (!mov) { await conn.rollback(); conn.release(); return res.status(404).json({ error: 'Movimiento no encontrado' }); }
    if (mov.anulado) { await conn.rollback(); conn.release(); return res.status(400).json({ error: 'El movimiento ya est\u00e1 anulado' }); }
    if (mov.caja_estado !== 'abierta') { await conn.rollback(); conn.release(); return res.status(400).json({ error: 'La caja no est\u00e1 abierta' }); }
    // Solo movimientos manuales (ingreso/egreso sin venta)
    if (mov.venta_id) { await conn.rollback(); conn.release(); return res.status(400).json({ error: 'No se puede anular movimientos de venta desde aqu\u00ed' }); }

    const montoNum = Number(mov.monto);

    // Marcar como anulado
    await conn.query(
      'UPDATE caja_ruta_movimientos SET anulado = 1, anulado_por = ?, anulado_en = NOW() WHERE id = ?',
      [req.user.id, mov.id]
    );

    // Revertir totales de caja_ruta
    if (mov.clasificacion === 'egreso' || mov.tipo === 'egreso' || mov.tipo === 'gasto') {
      await conn.query(
        `UPDATE caja_ruta SET
           gasto_otros = GREATEST(0, gasto_otros - ?),
           total_gastos = GREATEST(0, total_gastos - ?),
           neto_a_entregar = total_cobrado - total_gastos
         WHERE id = ?`,
        [montoNum, montoNum, mov.caja_ruta_id]
      );
    } else {
      await conn.query(
        `UPDATE caja_ruta SET
           total_cobrado = GREATEST(0, total_cobrado - ?),
           neto_a_entregar = total_cobrado - total_gastos
         WHERE id = ?`,
        [montoNum, mov.caja_ruta_id]
      );
    }

    // Anular tambien en caja principal si existe
    await conn.query(
      `UPDATE caja_movimientos SET anulado = 1, anulado_por = ?, anulado_en = NOW()
       WHERE caja_ruta_id = ? AND descripcion = ? AND monto = ? AND anulado = 0
       ORDER BY id DESC LIMIT 1`,
      [req.user.id, mov.caja_ruta_id, mov.descripcion, montoNum]
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