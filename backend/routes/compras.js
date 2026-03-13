const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/authMiddleware');
const ctrl    = require('../controllers/comprasController');

// Rutas específicas ANTES de /:id
router.get ('/deudas-proveedores',             auth, ctrl.deudasProveedores);
router.get ('/proveedor/:proveedorId/compras', auth, ctrl.comprasDeProveedor);
router.get ('/proveedor/:proveedorId/pagos',   auth, ctrl.historialPagos);
router.post('/pagar',                          auth, ctrl.registrarPago);
router.put ('/pagos/:pagoId/anular',           auth, ctrl.anularPago);

router.get ('/',            auth, ctrl.list);
router.post('/',            auth, ctrl.create);
router.get ('/:id',         auth, ctrl.getOne);
router.put ('/:id/anular',  auth, ctrl.anular);

module.exports = router;
