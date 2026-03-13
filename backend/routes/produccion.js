const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/authMiddleware');
const ctrl    = require('../controllers/produccionController');

router.get ('/verificar',                 auth, ctrl.verificar);
router.get ('/stock-fifo',                auth, ctrl.stockFifo);
router.get ('/',                          auth, ctrl.list);
router.post('/',                          auth, ctrl.create);
router.get ('/receta/:presentacion_id',   auth, ctrl.getReceta);
router.get ('/:id',                       auth, ctrl.getOne);
router.put ('/:id/completar',             auth, ctrl.completar);
router.put ('/:id/rechazar',              auth, ctrl.rechazar);

module.exports = router;
