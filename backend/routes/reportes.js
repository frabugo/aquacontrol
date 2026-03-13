const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/authMiddleware');
const ctrl    = require('../controllers/reportesController');

router.get('/ventas',       auth, ctrl.exportVentas);
router.get('/caja',         auth, ctrl.exportCaja);
router.get('/produccion',   auth, ctrl.exportProduccion);
router.get('/deudas',       auth, ctrl.exportDeudas);
router.get('/graficos',     auth, ctrl.graficos);
router.get('/proveedores',  auth, ctrl.exportProveedores);
router.get('/clientes',     auth, ctrl.exportClientes);
router.get('/compras-excel', auth, ctrl.exportCompras);
router.get('/comprobantes', auth, ctrl.exportComprobantes);
router.get('/entregas',             auth, ctrl.graficosEntregas);
router.get('/frecuencia-compras',  auth, ctrl.frecuenciaCompras);

module.exports = router;
