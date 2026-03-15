// controllers/clientesController.js
const db = require('../db');
const logAudit = require('../helpers/audit');
const { parsePagination, paginatedResponse } = require('../helpers/paginate');
const XLSX = require('xlsx');

/* ── Campos calculados reutilizables ── */
const CALC_FIELDS = `
  c.*, c.ruc_dni AS dni,
  CASE
    WHEN c.saldo_dinero > c.credito_maximo AND c.credito_maximo > 0 THEN 'sobre_limite'
    WHEN c.saldo_dinero > 0 OR c.bidones_prestados > 0             THEN 'con_deuda'
    ELSE 'al_dia'
  END AS estado_deuda,
  (SELECT MAX(v.fecha_hora) FROM ventas v WHERE v.cliente_id = c.id) AS ultima_compra
`;

/* ── Construcción dinámica del WHERE ── */
function buildWhere(q, tipo) {
  const conds  = ['c.activo = 1'];
  const params = [];
  if (q)    { conds.push('(c.nombre LIKE ? OR c.ruc_dni LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  if (tipo) { conds.push('c.tipo = ?'); params.push(tipo); }
  return { where: `WHERE ${conds.join(' AND ')}`, params };
}

/* ── GET /api/clientes ── */
exports.list = async (req, res) => {
  try {
    const q      = (req.query.q    || '').trim();
    const tipo   =  req.query.tipo || '';
    const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 20 });

    const { where, params } = buildWhere(q, tipo);

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM clientes c ${where}`,
      params
    );

    const [rows] = await db.query(
      `SELECT ${CALC_FIELDS} FROM clientes c ${where} ORDER BY c.nombre ASC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json(paginatedResponse(rows, total, page, limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/clientes/:id ── */
exports.getOne = async (req, res) => {
  try {
    const [[cliente]] = await db.query(
      `SELECT ${CALC_FIELDS} FROM clientes c WHERE c.id = ?`,
      [req.params.id]
    );
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

    const [ventas] = await db.query(
      `SELECT id, folio, fecha_hora, origen, total, estado
         FROM ventas WHERE cliente_id = ? ORDER BY fecha_hora DESC LIMIT 10`,
      [req.params.id]
    );

    res.json({ ...cliente, ventas_recientes: ventas });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── POST /api/clientes ── */
exports.create = async (req, res) => {
  try {
    const {
      nombre, ruc_dni: _ruc_dni, dni, telefono, direccion, latitud, longitud,
      tipo                   = 'menudeo',
      precio_recarga_con_bidon = 0,
      precio_recarga_sin_bidon = 0,
      precio_bidon_lleno       = 0,
      credito_maximo           = 0,
      notas, ubigeo,
    } = req.body;

    const ruc_dni = _ruc_dni || dni;
    if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es requerido' });

    const [result] = await db.query(
      `INSERT INTO clientes
         (nombre, ruc_dni, telefono, direccion, latitud, longitud, tipo,
          precio_recarga_con_bidon, precio_recarga_sin_bidon, precio_bidon_lleno,
          credito_maximo, notas, ubigeo, creado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nombre.trim(),
        ruc_dni?.trim()   || null,
        telefono?.trim()  || null,
        direccion?.trim() || null,
        latitud || null,
        longitud || null,
        tipo,
        Number(precio_recarga_con_bidon) || 0,
        Number(precio_recarga_sin_bidon) || 0,
        Number(precio_bidon_lleno)       || 0,
        Number(credito_maximo)           || 0,
        notas?.trim() || null,
        ubigeo?.trim() || null,
        req.user.id,
      ]
    );

    const [[row]] = await db.query(
      `SELECT ${CALC_FIELDS} FROM clientes c WHERE c.id = ?`,
      [result.insertId]
    );
    logAudit(req, { modulo: 'clientes', accion: 'crear', tabla: 'clientes', registro_id: result.insertId, detalle: { nombre: nombre.trim(), tipo } });
    res.status(201).json(row);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ya existe un cliente con ese DNI' });
    res.status(500).json({ error: err.message });
  }
};

/* ── PUT /api/clientes/:id ── */
exports.update = async (req, res) => {
  try {
    const {
      nombre, ruc_dni: _ruc_dni2, dni: dni2, telefono, direccion, latitud, longitud,
      tipo                   = 'menudeo',
      precio_recarga_con_bidon = 0,
      precio_recarga_sin_bidon = 0,
      precio_bidon_lleno       = 0,
      credito_maximo           = 0,
      notas, ubigeo,
    } = req.body;

    if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es requerido' });

    const ruc_dni = _ruc_dni2 || dni2;
    const [result] = await db.query(
      `UPDATE clientes SET
         nombre=?, ruc_dni=?, telefono=?, direccion=?, latitud=?, longitud=?, tipo=?,
         precio_recarga_con_bidon=?, precio_recarga_sin_bidon=?,
         precio_bidon_lleno=?, credito_maximo=?, notas=?, ubigeo=?
       WHERE id=?`,
      [
        nombre.trim(),
        ruc_dni?.trim()   || null,
        telefono?.trim()  || null,
        direccion?.trim() || null,
        latitud || null,
        longitud || null,
        tipo,
        Number(precio_recarga_con_bidon) || 0,
        Number(precio_recarga_sin_bidon) || 0,
        Number(precio_bidon_lleno)       || 0,
        Number(credito_maximo)           || 0,
        notas?.trim() || null,
        ubigeo?.trim() || null,
        req.params.id,
      ]
    );

    if (result.affectedRows === 0) return res.status(404).json({ error: 'Cliente no encontrado' });

    const [[row]] = await db.query(
      `SELECT ${CALC_FIELDS} FROM clientes c WHERE c.id = ?`,
      [req.params.id]
    );
    logAudit(req, { modulo: 'clientes', accion: 'editar', tabla: 'clientes', registro_id: Number(req.params.id), detalle: { nombre: nombre.trim(), tipo } });
    res.json(row);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ya existe un cliente con ese DNI' });
    res.status(500).json({ error: err.message });
  }
};

/* ── POST /api/clientes/:id/carga-inicial — Cargar deuda y bidones iniciales ── */
exports.cargaInicial = async (req, res) => {
  const conn = await db.getConnection();
  try {
    if (req.user.rol !== 'admin' && req.user.rol !== 'encargada') {
      conn.release();
      return res.status(403).json({ error: 'Solo admin o encargada pueden cargar saldos iniciales' });
    }

    const { saldo_dinero, bidones_prestados, notas } = req.body;
    const clienteId = req.params.id;

    const [[cliente]] = await conn.query(
      'SELECT id, nombre, saldo_dinero, bidones_prestados FROM clientes WHERE id = ? AND activo = 1',
      [clienteId]
    );
    if (!cliente) { conn.release(); return res.status(404).json({ error: 'Cliente no encontrado' }); }

    const updates = [];
    const params = [];

    if (saldo_dinero != null && Number(saldo_dinero) >= 0) {
      updates.push('saldo_dinero = ?');
      params.push(Number(saldo_dinero));
    }
    if (bidones_prestados != null && Number(bidones_prestados) >= 0) {
      updates.push('bidones_prestados = ?');
      params.push(Number(bidones_prestados));
    }

    if (updates.length === 0) {
      conn.release();
      return res.status(400).json({ error: 'Debe enviar saldo_dinero y/o bidones_prestados' });
    }

    params.push(clienteId);
    await conn.query(`UPDATE clientes SET ${updates.join(', ')} WHERE id = ?`, params);

    const [[updated]] = await conn.query(
      `SELECT ${CALC_FIELDS} FROM clientes c WHERE c.id = ?`,
      [clienteId]
    );

    logAudit(req, {
      modulo: 'clientes', accion: 'editar', tabla: 'clientes',
      registro_id: Number(clienteId),
      detalle: {
        accion_especifica: 'carga_inicial',
        saldo_dinero_anterior: Number(cliente.saldo_dinero),
        saldo_dinero_nuevo: Number(updated.saldo_dinero),
        bidones_anterior: cliente.bidones_prestados,
        bidones_nuevo: updated.bidones_prestados,
        notas: notas?.trim() || null,
      },
    });

    conn.release();
    res.json(updated);
  } catch (err) {
    conn.release();
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/clientes/plantilla-deudas — Descargar plantilla Excel ── */
exports.plantillaDeudas = async (req, res) => {
  try {
    const [clientes] = await db.query(
      `SELECT nombre, ruc_dni, tipo, telefono, saldo_dinero, bidones_prestados
         FROM clientes WHERE activo = 1 ORDER BY nombre`
    );

    const data = clientes.map(c => ({
      'NOMBRE':             c.nombre,
      'DNI_RUC':            c.ruc_dni || '',
      'TIPO':               c.tipo,
      'TELEFONO':           c.telefono || '',
      'DEUDA_DINERO':       Number(c.saldo_dinero),
      'BIDONES_PRESTADOS':  c.bidones_prestados,
      'NOTAS':              '',
    }));

    // Si no hay clientes, poner una fila de ejemplo
    if (data.length === 0) {
      data.push({
        'NOMBRE':            'Juan Perez (ejemplo)',
        'DNI_RUC':           '12345678',
        'TIPO':              'menudeo',
        'TELEFONO':          '999999999',
        'DEUDA_DINERO':      150.00,
        'BIDONES_PRESTADOS': 3,
        'NOTAS':             'Deuda del sistema anterior',
      });
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);

    // Ajustar ancho de columnas
    ws['!cols'] = [
      { wch: 30 }, // NOMBRE
      { wch: 15 }, // DNI_RUC
      { wch: 12 }, // TIPO
      { wch: 15 }, // TELEFONO
      { wch: 15 }, // DEUDA_DINERO
      { wch: 18 }, // BIDONES_PRESTADOS
      { wch: 30 }, // NOTAS
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Deudas');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=plantilla_deudas.xlsx');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── POST /api/clientes/importar-deudas — Importar deudas desde Excel ── */
exports.importarDeudas = async (req, res) => {
  try {
    if (req.user.rol !== 'admin' && req.user.rol !== 'encargada') {
      return res.status(403).json({ error: 'Solo admin o encargada pueden importar deudas' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Debe enviar un archivo Excel (.xlsx)' });
    }

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws);

    if (!rows.length) {
      return res.status(400).json({ error: 'El archivo esta vacio' });
    }

    // Cargar todos los clientes activos para matchear
    const [clientes] = await db.query(
      'SELECT id, nombre, ruc_dni, saldo_dinero, bidones_prestados FROM clientes WHERE activo = 1'
    );

    // Indexar por ruc_dni y por nombre (lowercase)
    const byDni = {};
    const byNombre = {};
    for (const c of clientes) {
      if (c.ruc_dni) byDni[c.ruc_dni.trim()] = c;
      byNombre[c.nombre.trim().toLowerCase()] = c;
    }

    const resultados = [];
    let actualizados = 0, errores = 0, sinCambios = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const fila = i + 2; // fila del Excel (1=header, 2=primera data)
      const nombre = String(row.NOMBRE || row.nombre || '').trim();
      const dni = String(row.DNI_RUC || row.dni_ruc || row.DNI || row.RUC || '').trim();
      const deuda = Number(row.DEUDA_DINERO || row.deuda_dinero || row.DEUDA || 0);
      const bidones = Number(row.BIDONES_PRESTADOS || row.bidones_prestados || row.BIDONES || 0);
      const notas = String(row.NOTAS || row.notas || '').trim();

      if (!nombre && !dni) {
        resultados.push({ fila, nombre: '(vacio)', estado: 'error', msg: 'Fila sin nombre ni DNI' });
        errores++;
        continue;
      }

      // Buscar cliente: primero por DNI/RUC, luego por nombre exacto
      let cliente = null;
      if (dni) cliente = byDni[dni];
      if (!cliente && nombre) cliente = byNombre[nombre.toLowerCase()];

      if (!cliente) {
        resultados.push({ fila, nombre: nombre || dni, estado: 'no_encontrado', msg: 'Cliente no existe en el sistema' });
        errores++;
        continue;
      }

      // Verificar si hay cambio
      if (Number(cliente.saldo_dinero) === deuda && cliente.bidones_prestados === bidones) {
        resultados.push({ fila, nombre: cliente.nombre, estado: 'sin_cambios', msg: 'Ya tiene esos valores' });
        sinCambios++;
        continue;
      }

      // Actualizar
      await db.query(
        'UPDATE clientes SET saldo_dinero = ?, bidones_prestados = ? WHERE id = ?',
        [deuda, bidones, cliente.id]
      );

      logAudit(req, {
        modulo: 'clientes', accion: 'editar', tabla: 'clientes',
        registro_id: cliente.id,
        detalle: {
          accion_especifica: 'importar_deudas',
          saldo_anterior: Number(cliente.saldo_dinero), saldo_nuevo: deuda,
          bidones_anterior: cliente.bidones_prestados, bidones_nuevo: bidones,
          notas: notas || null,
        },
      });

      resultados.push({
        fila, nombre: cliente.nombre, estado: 'actualizado',
        msg: `Deuda: S/${Number(cliente.saldo_dinero).toFixed(2)} → S/${deuda.toFixed(2)}, Bidones: ${cliente.bidones_prestados} → ${bidones}`,
      });
      actualizados++;
    }

    res.json({
      ok: true,
      resumen: { total: rows.length, actualizados, errores, sin_cambios: sinCambios },
      resultados,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── DELETE /api/clientes/:id  (soft delete) ── */
exports.deactivate = async (req, res) => {
  try {
    const [result] = await db.query(
      'UPDATE clientes SET activo = 0 WHERE id = ? AND activo = 1',
      [req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
    logAudit(req, { modulo: 'clientes', accion: 'eliminar', tabla: 'clientes', registro_id: Number(req.params.id) });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
