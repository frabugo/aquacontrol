// controllers/usuariosController.js
const bcrypt = require('bcryptjs');
const db = require('../db');
const logAudit = require('../helpers/audit');
const { parsePagination, paginatedResponse } = require('../helpers/paginate');

// Módulos se validan en el frontend desde navStructure (Layout.jsx).
// El backend acepta cualquier string de módulo para no quedar desincronizado.

/* ── GET /api/usuarios ── */
exports.list = async (req, res) => {
  try {
    const { q, rol } = req.query;
    const { page, limit, offset } = parsePagination(req.query);

    const conds  = [];
    const params = [];
    if (q)   { conds.push('(u.nombre LIKE ? OR u.email LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
    if (rol) { conds.push('u.rol = ?'); params.push(rol); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM usuarios u ${where}`, params
    );

    const [rows] = await db.query(
      `SELECT u.id, u.nombre, u.email, u.telefono, u.rol, u.activo, u.ultimo_login, u.creado_en,
              u.gps_obligatorio, u.notif_pedidos, u.sesion_unica,
              GROUP_CONCAT(um.modulo ORDER BY um.modulo SEPARATOR ',') AS modulos_csv
         FROM usuarios u
         LEFT JOIN usuario_modulos um ON um.usuario_id = u.id
         ${where}
         GROUP BY u.id
         ORDER BY u.activo DESC, u.nombre ASC
         LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const data = rows.map(r => ({
      ...r,
      modulos: r.modulos_csv ? r.modulos_csv.split(',') : [],
      modulos_csv: undefined,
    }));

    res.json(paginatedResponse(data, total, page, limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/usuarios/:id ── */
exports.getOne = async (req, res) => {
  try {
    const [[user]] = await db.query(
      `SELECT id, nombre, email, telefono, rol, activo, ultimo_login, creado_en,
              gps_obligatorio, notif_pedidos, sesion_unica
         FROM usuarios WHERE id = ?`,
      [req.params.id]
    );
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const [modRows] = await db.query(
      'SELECT modulo FROM usuario_modulos WHERE usuario_id = ?',
      [user.id]
    );
    user.modulos = modRows.map(r => r.modulo);

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── POST /api/usuarios ── */
exports.create = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { nombre, email, password, telefono, rol, modulos, gps_obligatorio, notif_pedidos, sesion_unica } = req.body;

    if (!nombre || !email || !password || !rol) {
      conn.release();
      return res.status(400).json({ error: 'nombre, email, password y rol son requeridos' });
    }
    if (!['admin', 'encargada', 'vendedor', 'operario', 'chofer'].includes(rol)) {
      conn.release();
      return res.status(400).json({ error: 'Rol inválido' });
    }

    const hash = await bcrypt.hash(password, 10);

    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO usuarios (nombre, email, password_hash, telefono, rol, gps_obligatorio, notif_pedidos, sesion_unica, creado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [nombre.trim(), email.trim().toLowerCase(), hash, telefono?.trim() || null, rol,
       gps_obligatorio ? 1 : 0, notif_pedidos ? 1 : 0, sesion_unica !== undefined ? (sesion_unica ? 1 : 0) : 1, req.user.id]
    );
    const userId = result.insertId;

    // Insertar módulos
    const mods = Array.isArray(modulos) ? modulos.filter(m => typeof m === 'string' && m.trim()) : [];
    if (mods.length > 0) {
      const vals = mods.map(() => '(?, ?)').join(', ');
      const flat = mods.flatMap(m => [userId, m]);
      await conn.query(`INSERT INTO usuario_modulos (usuario_id, modulo) VALUES ${vals}`, flat);
    }

    await conn.commit();
    conn.release();

    // Devolver usuario creado
    const [[created]] = await db.query(
      'SELECT id, nombre, email, telefono, rol, activo, creado_en FROM usuarios WHERE id = ?',
      [userId]
    );
    created.modulos = mods;
    logAudit(req, { modulo: 'usuarios', accion: 'crear', tabla: 'usuarios', registro_id: userId, detalle: { nombre: nombre.trim(), email: email.trim(), rol } });
    res.status(201).json(created);
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe un usuario con ese email' });
    }
    res.status(500).json({ error: err.message });
  }
};

/* ── PUT /api/usuarios/:id ── */
exports.update = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { nombre, email, telefono, rol, modulos, password, gps_obligatorio, notif_pedidos, sesion_unica } = req.body;
    const userId = parseInt(req.params.id);

    const [[existing]] = await conn.query('SELECT id FROM usuarios WHERE id = ?', [userId]);
    if (!existing) { conn.release(); return res.status(404).json({ error: 'Usuario no encontrado' }); }

    await conn.beginTransaction();

    // Actualizar campos básicos
    const sets = [];
    const params = [];
    if (nombre) { sets.push('nombre = ?'); params.push(nombre.trim()); }
    if (email)  { sets.push('email = ?');  params.push(email.trim().toLowerCase()); }
    if (telefono !== undefined) { sets.push('telefono = ?'); params.push(telefono?.trim() || null); }
    if (rol && ['admin', 'encargada', 'vendedor', 'operario', 'chofer'].includes(rol)) {
      sets.push('rol = ?'); params.push(rol);
    }
    if (password && password.trim()) {
      const hash = await bcrypt.hash(password.trim(), 10);
      sets.push('password_hash = ?'); params.push(hash);
    }
    if (gps_obligatorio !== undefined) { sets.push('gps_obligatorio = ?'); params.push(gps_obligatorio ? 1 : 0); }
    if (notif_pedidos !== undefined)   { sets.push('notif_pedidos = ?');   params.push(notif_pedidos ? 1 : 0); }
    if (sesion_unica !== undefined)    { sets.push('sesion_unica = ?');    params.push(sesion_unica ? 1 : 0); }

    if (sets.length > 0) {
      await conn.query(`UPDATE usuarios SET ${sets.join(', ')} WHERE id = ?`, [...params, userId]);
    }

    // Reemplazar módulos
    if (Array.isArray(modulos)) {
      await conn.query('DELETE FROM usuario_modulos WHERE usuario_id = ?', [userId]);
      const mods = modulos.filter(m => typeof m === 'string' && m.trim());
      if (mods.length > 0) {
        const vals = mods.map(() => '(?, ?)').join(', ');
        const flat = mods.flatMap(m => [userId, m]);
        await conn.query(`INSERT INTO usuario_modulos (usuario_id, modulo) VALUES ${vals}`, flat);
      }
    }

    await conn.commit();
    conn.release();

    // Devolver usuario actualizado
    const [[updated]] = await db.query(
      'SELECT id, nombre, email, telefono, rol, activo, creado_en FROM usuarios WHERE id = ?',
      [userId]
    );
    const [modRows] = await db.query('SELECT modulo FROM usuario_modulos WHERE usuario_id = ?', [userId]);
    updated.modulos = modRows.map(r => r.modulo);

    logAudit(req, { modulo: 'usuarios', accion: 'editar', tabla: 'usuarios', registro_id: userId, detalle: { nombre: updated.nombre, rol: updated.rol } });
    res.json(updated);
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe un usuario con ese email' });
    }
    res.status(500).json({ error: err.message });
  }
};

/* ── DELETE /api/usuarios/:id (soft) ── */
exports.deactivate = async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta' });
    }

    const [result] = await db.query(
      'UPDATE usuarios SET activo = 0 WHERE id = ? AND activo = 1',
      [userId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado o ya desactivado' });
    }

    logAudit(req, { modulo: 'usuarios', accion: 'eliminar', tabla: 'usuarios', registro_id: userId });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── PUT /api/usuarios/:id/configuracion ── */
exports.updateConfig = async (req, res) => {
  try {
    const { id } = req.params;
    const { gps_obligatorio, notif_pedidos, sesion_unica } = req.body;
    const campos = [];
    const valores = [];
    if (gps_obligatorio !== undefined) { campos.push('gps_obligatorio = ?'); valores.push(gps_obligatorio ? 1 : 0); }
    if (notif_pedidos !== undefined)   { campos.push('notif_pedidos = ?');   valores.push(notif_pedidos ? 1 : 0); }
    if (sesion_unica !== undefined)    { campos.push('sesion_unica = ?');    valores.push(sesion_unica ? 1 : 0); }
    if (!campos.length) return res.status(400).json({ error: 'Nada que actualizar' });
    valores.push(id);
    await db.query(`UPDATE usuarios SET ${campos.join(', ')} WHERE id = ?`, valores);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/usuarios/modulos — Lista de módulos disponibles ── */
/* DEPRECATED: El frontend ahora deriva los módulos de navStructure (Layout.jsx).
   Se mantiene por compatibilidad, retorna los módulos usados en la DB. */
exports.modulosDisponibles = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT DISTINCT modulo FROM usuario_modulos ORDER BY modulo'
    );
    res.json({ data: rows.map(r => ({ key: r.modulo, label: r.modulo })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
