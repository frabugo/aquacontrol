const { Router } = require('express');
const auth = require('../middleware/authMiddleware');
const ctrl = require('../controllers/deudasController');

const router = Router();

router.get('/',                  auth, ctrl.list);
router.get('/:clienteId/ventas', auth, ctrl.ventasCredito);
router.get('/:clienteId/pagos',  auth, ctrl.historialPagos);
router.post('/:clienteId/pagar', auth, ctrl.registrarPago);
router.put('/pagos/:pagoId/anular', auth, ctrl.anularPago);

module.exports = router;
