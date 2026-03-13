const router = require('express').Router();
const auth   = require('../middleware/authMiddleware');
const ctrl   = require('../controllers/auditController');

// Solo admin puede ver auditoría
function adminOnly(req, res, next) {
  if (req.user.rol !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado: solo administradores' });
  }
  next();
}

router.get('/', auth, adminOnly, ctrl.list);

module.exports = router;
