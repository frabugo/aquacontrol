// controllers/buscarController.js — Búsqueda global
const db = require('../db');

/* ── GET /api/buscar?q=term&limit=5 ── */
exports.search = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const limit = Math.min(10, parseInt(req.query.limit) || 5);

    if (q.length < 2) {
      return res.json({ data: [] });
    }

    const like = `%${q}%`;

    const [clientes, ventas, pedidos, proveedores, usuarios, presentaciones] = await Promise.all([
      db.query(
        `SELECT id, nombre AS label, CONCAT(COALESCE(tipo,''), ' - ', COALESCE(ruc_dni,'')) AS sublabel, 'cliente' AS tipo
           FROM clientes WHERE activo = 1 AND (nombre LIKE ? OR ruc_dni LIKE ?) ORDER BY nombre LIMIT ?`,
        [like, like, limit]
      ),
      db.query(
        `SELECT v.id, v.folio AS label,
                CONCAT(COALESCE(c.nombre,'Sin cliente'), ' - S/', FORMAT(v.total, 2)) AS sublabel,
                'venta' AS tipo
           FROM ventas v LEFT JOIN clientes c ON c.id = v.cliente_id
          WHERE v.folio LIKE ? OR c.nombre LIKE ?
          ORDER BY v.fecha_hora DESC LIMIT ?`,
        [like, like, limit]
      ),
      db.query(
        `SELECT p.id, p.numero AS label,
                CONCAT(COALESCE(c.nombre,''), ' - ', p.estado) AS sublabel,
                'pedido' AS tipo
           FROM pedidos p LEFT JOIN clientes c ON c.id = p.cliente_id
          WHERE p.numero LIKE ? OR c.nombre LIKE ?
          ORDER BY p.creado_en DESC LIMIT ?`,
        [like, like, limit]
      ),
      db.query(
        `SELECT id, nombre AS label, COALESCE(ruc,'') AS sublabel, 'proveedor' AS tipo
           FROM proveedores WHERE activo = 1 AND (nombre LIKE ? OR ruc LIKE ?) ORDER BY nombre LIMIT ?`,
        [like, like, limit]
      ),
      db.query(
        `SELECT id, nombre AS label, CONCAT(email, ' - ', rol) AS sublabel, 'usuario' AS tipo
           FROM usuarios WHERE activo = 1 AND (nombre LIKE ? OR email LIKE ?) ORDER BY nombre LIMIT ?`,
        [like, like, limit]
      ),
      db.query(
        `SELECT id, nombre AS label, CONCAT('S/', FORMAT(precio_base,2)) AS sublabel, 'presentacion' AS tipo
           FROM presentaciones WHERE activo = 1 AND nombre LIKE ? ORDER BY nombre LIMIT ?`,
        [like, limit]
      ),
    ]);

    // Each db.query returns [rows, fields]; extract rows
    const data = [
      ...clientes[0],
      ...ventas[0],
      ...pedidos[0],
      ...proveedores[0],
      ...usuarios[0],
      ...presentaciones[0],
    ];

    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
