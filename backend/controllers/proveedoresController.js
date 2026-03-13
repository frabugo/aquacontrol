// controllers/proveedoresController.js
const db = require('../db');
const logAudit = require('../helpers/audit');
const { parsePagination, paginatedResponse } = require('../helpers/paginate');

/* ── GET /api/proveedores ── */
exports.list = async (req, res) => {
  try {
    const { q, activo } = req.query;
    const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 });

    const conds  = [];
    const params = [];
    if (activo !== undefined) { conds.push('p.activo = ?'); params.push(activo === '0' ? 0 : 1); }
    else                       { conds.push('p.activo = 1'); }
    if (q) { conds.push('(p.nombre LIKE ? OR p.ruc LIKE ? OR p.contacto LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }

    const where = `WHERE ${conds.join(' AND ')}`;

    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM proveedores p ${where}`, params);
    const [rows] = await db.query(
      `SELECT p.*,
              u.nombre AS creado_por_nombre,
              (SELECT COUNT(*) FROM compras c WHERE c.proveedor_id = p.id) AS num_compras
         FROM proveedores p
         LEFT JOIN usuarios u ON u.id = p.creado_por
         ${where}
         ORDER BY p.nombre ASC
         LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    res.json(paginatedResponse(rows, total, page, limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/proveedores/:id ── */
exports.getOne = async (req, res) => {
  try {
    const [[prov]] = await db.query(
      `SELECT p.*, u.nombre AS creado_por_nombre
         FROM proveedores p
         LEFT JOIN usuarios u ON u.id = p.creado_por
         WHERE p.id = ?`,
      [req.params.id]
    );
    if (!prov) return res.status(404).json({ error: 'Proveedor no encontrado' });

    const [precios] = await db.query(
      `SELECT pp.*,
              COALESCE(i.nombre, pres.nombre) AS producto_nombre,
              CASE WHEN i.id IS NOT NULL THEN 'insumo' ELSE 'presentacion' END AS tipo
         FROM precios_proveedor pp
         LEFT JOIN insumos i       ON i.id   = pp.insumo_id
         LEFT JOIN presentaciones pres ON pres.id = pp.presentacion_id
         WHERE pp.proveedor_id = ?
         ORDER BY pp.fecha_ultima_compra DESC`,
      [req.params.id]
    );

    res.json({ ...prov, precios });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── POST /api/proveedores ── */
exports.create = async (req, res) => {
  try {
    const { nombre, ruc, telefono, email, direccion, contacto, notas, ubigeo } = req.body;
    if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es requerido' });

    const [r] = await db.query(
      `INSERT INTO proveedores (nombre, ruc, telefono, email, direccion, contacto, notas, ubigeo, creado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [nombre.trim(), ruc?.trim() || null, telefono?.trim() || null,
       email?.trim() || null, direccion?.trim() || null,
       contacto?.trim() || null, notas?.trim() || null, ubigeo?.trim() || null, req.user.id]
    );
    const [[prov]] = await db.query('SELECT * FROM proveedores WHERE id = ?', [r.insertId]);
    logAudit(req, { modulo: 'proveedores', accion: 'crear', tabla: 'proveedores', registro_id: r.insertId, detalle: { nombre: nombre.trim() } });
    res.status(201).json(prov);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ya existe un proveedor con ese RUC' });
    res.status(500).json({ error: err.message });
  }
};

/* ── PUT /api/proveedores/:id ── */
exports.update = async (req, res) => {
  try {
    const { nombre, ruc, telefono, email, direccion, contacto, notas, ubigeo, activo } = req.body;
    await db.query(
      `UPDATE proveedores SET
         nombre    = COALESCE(?, nombre),
         ruc       = ?,
         telefono  = ?,
         email     = ?,
         direccion = ?,
         contacto  = ?,
         notas     = ?,
         ubigeo    = ?,
         activo    = COALESCE(?, activo)
       WHERE id = ?`,
      [nombre?.trim() || null, ruc?.trim() || null, telefono?.trim() || null,
       email?.trim() || null, direccion?.trim() || null,
       contacto?.trim() || null, notas?.trim() || null,
       ubigeo?.trim() || null,
       activo != null ? Number(activo) : null,
       req.params.id]
    );
    const [[prov]] = await db.query('SELECT * FROM proveedores WHERE id = ?', [req.params.id]);
    if (!prov) return res.status(404).json({ error: 'Proveedor no encontrado' });
    logAudit(req, { modulo: 'proveedores', accion: 'editar', tabla: 'proveedores', registro_id: Number(req.params.id), detalle: { nombre: prov.nombre } });
    res.json(prov);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ya existe un proveedor con ese RUC' });
    res.status(500).json({ error: err.message });
  }
};

/* ── DELETE /api/proveedores/:id  (soft delete) ── */
exports.deactivate = async (req, res) => {
  try {
    await db.query('UPDATE proveedores SET activo = 0 WHERE id = ?', [req.params.id]);
    logAudit(req, { modulo: 'proveedores', accion: 'eliminar', tabla: 'proveedores', registro_id: Number(req.params.id) });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/proveedores/:id/precios ── */
exports.getPrecios = async (req, res) => {
  try {
    const [[prov]] = await db.query('SELECT id, nombre FROM proveedores WHERE id = ?', [req.params.id]);
    if (!prov) return res.status(404).json({ error: 'Proveedor no encontrado' });

    const [precios] = await db.query(
      `SELECT pp.id, pp.insumo_id, pp.presentacion_id,
              pp.precio, pp.fecha_ultima_compra, pp.compra_id,
              COALESCE(i.nombre, pres.nombre)  AS producto_nombre,
              COALESCE(i.unidad, 'unidad')     AS unidad,
              CASE WHEN i.id IS NOT NULL THEN 'insumo' ELSE 'presentacion' END AS tipo
         FROM precios_proveedor pp
         LEFT JOIN insumos        i    ON i.id    = pp.insumo_id
         LEFT JOIN presentaciones pres ON pres.id = pp.presentacion_id
         WHERE pp.proveedor_id = ?
         ORDER BY producto_nombre ASC`,
      [req.params.id]
    );
    res.json({ proveedor: prov, data: precios });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/proveedores/comparar?insumo_id=X  |  ?presentacion_id=Y ── */
exports.comparar = async (req, res) => {
  try {
    const { insumo_id, presentacion_id } = req.query;
    if (!insumo_id && !presentacion_id)
      return res.status(400).json({ error: 'Se requiere insumo_id o presentacion_id' });

    const byInsumo = !!insumo_id;
    const itemId   = byInsumo ? insumo_id : presentacion_id;

    // Nombre del producto
    const [[producto]] = byInsumo
      ? await db.query('SELECT nombre, unidad FROM insumos WHERE id = ?', [itemId])
      : await db.query('SELECT nombre, NULL AS unidad FROM presentaciones WHERE id = ?', [itemId]);

    if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });

    const whereCol = byInsumo ? 'pp.insumo_id' : 'pp.presentacion_id';
    const [rows] = await db.query(
      `SELECT
         pv.id          AS proveedor_id,
         pv.nombre      AS proveedor,
         pv.telefono,
         pv.contacto,
         pv.email,
         pp.precio      AS ultimo_precio,
         pp.fecha_ultima_compra,
         pp.compra_id,
         RANK() OVER (ORDER BY pp.precio ASC) AS ranking
       FROM precios_proveedor pp
       JOIN proveedores pv ON pv.id = pp.proveedor_id
       WHERE ${whereCol} = ? AND pv.activo = 1
       ORDER BY pp.precio ASC`,
      [itemId]
    );
    res.json({ producto: { ...producto, tipo: byInsumo ? 'insumo' : 'presentacion', id: itemId }, data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
