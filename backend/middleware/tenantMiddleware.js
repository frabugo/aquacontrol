// middleware/tenantMiddleware.js — Detecta tenant por subdominio y activa contexto
const mysql = require('mysql2/promise');
const { tenantStorage } = require('../tenantContext');

let centralPool = null;

function getCentralPool() {
  if (!centralPool) {
    centralPool = mysql.createPool({
      host:     process.env.DB_HOST,
      port:     process.env.DB_PORT || 3306,
      database: 'aquacontrol_central',
      user:     process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      waitForConnections: true,
      connectionLimit: 5,
      timezone: '-05:00',
    });
  }
  return centralPool;
}

// Cache de tenants en memoria (60s TTL)
const tenantCache = new Map();
const CACHE_TTL = 60000;

async function resolveTenant(identifier) {
  const cached = tenantCache.get(identifier);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const pool = getCentralPool();
  const [[tenant]] = await pool.query(
    `SELECT t.id, t.nombre_empresa, t.subdominio, t.database_name, t.activo,
            t.plan, t.max_usuarios, t.mensaje_suspension
       FROM tenants t WHERE t.subdominio = ?`,
    [identifier]
  );

  if (tenant) {
    const [modRows] = await pool.query(
      'SELECT modulo FROM tenant_modulos WHERE tenant_id = ?',
      [tenant.id]
    );
    tenant.modulos = modRows.map(r => r.modulo);
    tenantCache.set(identifier, { data: tenant, ts: Date.now() });
  }

  return tenant || null;
}

function clearTenantCache(subdominio) {
  if (subdominio) {
    tenantCache.delete(subdominio);
  } else {
    tenantCache.clear();
  }
}

async function tenantMiddleware(req, res, next) {
  let subdomain = null;

  // Dev: header override
  if (process.env.NODE_ENV !== 'production' && req.headers['x-tenant-id']) {
    subdomain = req.headers['x-tenant-id'];
  } else {
    const host = req.headers.host || '';
    const hostname = host.replace(/:\d+$/, '');
    const baseDomains = [
      'aquacontrol.site',
      'www.aquacontrol.site',
      'aquacontrol.duckdns.org',
      'aquacontrol.pe',
      'www.aquacontrol.pe',
      'localhost',
      '127.0.0.1',
    ];
    if (!baseDomains.includes(hostname)) {
      const parts = hostname.split('.');
      if (parts.length >= 3) {
        subdomain = parts[0];
      }
    }
  }

  // Sin subdominio o www → dominio central, pasar sin tenant context
  if (!subdomain || subdomain === 'www') {
    req.isCentral = true;
    return next();
  }

  try {
    const tenant = await resolveTenant(subdomain);
    if (!tenant) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }

    // Si está suspendido, marcar pero dejar pasar (login mostrará el mensaje)
    if (!tenant.activo) {
      req.tenantSuspendido = true;
      req.mensajeSuspension = tenant.mensaje_suspension || 'Cuenta suspendida. Contacte al administrador.';
    }

    tenantStorage.run(
      { tenantId: tenant.id, databaseName: tenant.database_name, tenant },
      () => {
        req.tenant = tenant;
        next();
      }
    );
  } catch (err) {
    console.error('tenantMiddleware error:', err.message);
    if (err.code === 'ER_BAD_DB_ERROR') {
      return next();
    }
    res.status(500).json({ error: 'Error resolviendo empresa' });
  }
}

module.exports = { tenantMiddleware, getCentralPool, resolveTenant, clearTenantCache };
