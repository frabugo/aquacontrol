// helpers/audit.js — Fire-and-forget audit logging
const db = require('../db');

/**
 * Registra una acción en audit_log (no bloquea la respuesta).
 * @param {Object} req - Express request (necesita req.user y req.ip)
 * @param {Object} opts
 * @param {string} opts.modulo   - e.g. 'clientes', 'ventas', 'caja'
 * @param {string} opts.accion   - 'crear'|'editar'|'eliminar'|'cancelar'|'abrir'|'cerrar'|'reabrir'
 * @param {string} opts.tabla    - tabla principal afectada
 * @param {number} [opts.registro_id] - PK del registro afectado
 * @param {Object} [opts.detalle]     - JSON libre con datos relevantes
 */
function logAudit(req, { modulo, accion, tabla, registro_id = null, detalle = null }) {
  const user = req.user || {};
  db.query(
    `INSERT INTO audit_log (usuario_id, usuario_nombre, usuario_rol, modulo, accion, tabla, registro_id, detalle, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      user.id || 0,
      user.nombre || 'desconocido',
      user.rol || 'desconocido',
      modulo,
      accion,
      tabla,
      registro_id,
      detalle ? JSON.stringify(detalle) : null,
      req.ip || req.connection?.remoteAddress || null,
    ]
  ).catch(err => console.error('audit.logAudit:', err.message));
}

module.exports = logAudit;
