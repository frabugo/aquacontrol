const router = require('express').Router();
const auth   = require('../middleware/authMiddleware');
const ctrl   = require('../controllers/proveedoresController');

// Literal routes BEFORE parameterized /:id to avoid conflicts
router.get('/comparar',     auth, ctrl.comparar);

router.get ('/',            auth, ctrl.list);
router.post('/',            auth, ctrl.create);
router.get ('/:id',         auth, ctrl.getOne);
router.get ('/:id/precios', auth, ctrl.getPrecios);
router.put ('/:id',         auth, ctrl.update);
router.delete('/:id',       auth, ctrl.deactivate);

module.exports = router;
