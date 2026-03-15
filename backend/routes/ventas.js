// routes/ventas.js
const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/authMiddleware');
const ctrl    = require('../controllers/ventasController');

router.get ('/bonificaciones',         auth, ctrl.bonificaciones);
router.get ('/bonificaciones/:clienteId', auth, ctrl.bonificacionesDetalle);
router.get ('/precio-sugerido', auth, ctrl.getPrecioSugerido);
router.get ('/prediccion',      auth, ctrl.prediccion);
router.get ('/resumen-dia',     auth, ctrl.resumenDia);
router.get ('/',                auth, ctrl.list);
router.get ('/:id',             auth, ctrl.getOne);
router.post('/',                auth, ctrl.create);
router.put ('/:id/cancelar',    auth, ctrl.cancelar);

module.exports = router;
