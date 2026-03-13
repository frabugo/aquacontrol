// routes/presentaciones.js
const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/authMiddleware');
const ctrl    = require('../controllers/presentacionesController');

router.get ('/',                       auth, ctrl.list);
router.get ('/:id',                    auth, ctrl.getOne);
router.post('/',                       auth, ctrl.create);
router.put ('/:id',                    auth, ctrl.update);
router.delete('/:id',                  auth, ctrl.deactivate);
router.get ('/:id/trazabilidad',       auth, ctrl.trazabilidad);
router.get ('/:id/movimientos',        auth, ctrl.getMovimientos);
router.post('/:id/movimientos',        auth, ctrl.registrarMovimiento);

module.exports = router;
