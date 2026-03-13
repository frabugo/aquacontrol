const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const ctrl = require('../controllers/facturacionController');

router.get('/listar',             auth, ctrl.listar);
router.get('/series',             auth, ctrl.getSeries);
router.get('/metodos-pago',       auth, ctrl.getMetodosPago);
router.post('/emitir',            auth, ctrl.emitir);
router.post('/guia',              auth, ctrl.emitirGuia);
router.post('/anular',            auth, ctrl.anularComprobante);
router.post('/enviar-baja',      auth, ctrl.enviarBaja);
router.post('/cancelar-anulacion', auth, ctrl.cancelarAnulacion);
router.get('/venta/:ventaId',     auth, ctrl.getByVenta);
router.get('/estado/:comprobanteId', auth, ctrl.consultarEstado);

module.exports = router;
