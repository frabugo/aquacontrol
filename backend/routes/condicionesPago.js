// routes/condicionesPago.js
const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const ctrl = require('../controllers/condicionesPagoController');

// Middleware: solo admin/encargada para escritura
function onlyAdmin(req, res, next) {
  if (!['admin', 'encargada'].includes(req.user.rol)) {
    return res.status(403).json({ error: 'Solo admin o encargada pueden gestionar condiciones de pago' });
  }
  next();
}

router.get('/',      auth,             ctrl.list);
router.get('/todos', auth, onlyAdmin,  ctrl.listAll);
router.post('/',     auth, onlyAdmin,  ctrl.create);
router.put('/:id',   auth, onlyAdmin,  ctrl.update);
router.delete('/:id', auth, onlyAdmin, ctrl.deactivate);

module.exports = router;
