const jwt = require('jsonwebtoken');
const { getTenantContext } = require('../tenantContext');

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Sin token de autorización' });
  }

  // Token invalidado por sesión desplazada
  if (global.tokenBlacklist?.has(token)) {
    return res.status(401).json({
      error:   'SESION_DESPLAZADA',
      mensaje: 'Tu sesión fue cerrada porque ingresaste desde otro dispositivo.',
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    // Multi-tenant: verificar que el token pertenece al tenant actual
    const ctx = getTenantContext();
    if (ctx?.tenantId && decoded.tenantId && decoded.tenantId !== ctx.tenantId) {
      return res.status(401).json({ error: 'Token no pertenece a esta empresa' });
    }

    // Verificar que el tenant sigue activo
    if (req.tenant && !req.tenant.activo) {
      return res.status(403).json({ error: 'Cuenta suspendida' });
    }

    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
};

module.exports = authMiddleware;
