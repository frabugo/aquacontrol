// routes/central.js — Rutas de administración central (multi-tenant)
const { Router } = require('express');
const auth       = require('../middleware/authMiddleware');
const centralOnly = require('../middleware/centralOnly');
const ctrl       = require('../controllers/centralController');

const router = Router();

// Todas las rutas requieren: autenticación + admin + dominio principal
router.use(auth);
router.use(centralOnly);
router.use((req, res, next) => {
  if (!['superadmin', 'soporte'].includes(req.user.rol)) {
    return res.status(403).json({ error: 'Solo administradores centrales' });
  }
  next();
});

// Stats del panel central
router.get('/stats', ctrl.stats);

// Módulos disponibles en el sistema
router.get('/modulos-disponibles', ctrl.availableModulos);

// CRUD Tenants
router.get('/tenants',             ctrl.list);
router.get('/tenants/:id',         ctrl.get);
router.post('/tenants',            ctrl.create);
router.put('/tenants/:id',         ctrl.update);
router.put('/tenants/:id/toggle',  ctrl.toggle);

// Módulos por tenant
router.get('/tenants/:id/modulos', ctrl.getModulos);
router.put('/tenants/:id/modulos', ctrl.setModulos);

// Usuarios de un tenant
router.get('/tenants/:id/usuarios',  ctrl.listUsers);
router.post('/tenants/:id/admin',    ctrl.createAdmin);

// Reset rate limiter
router.post('/reset-rate-limit', ctrl.resetRateLimit);

// Suspender tenant en tiempo real (expulsa usuarios logueados)
router.put('/tenants/:id/suspend', ctrl.suspendRealtime);

module.exports = router;
