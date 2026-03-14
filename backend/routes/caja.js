const router = require('express').Router();
const auth   = require('../middleware/authMiddleware');
const ctrl   = require('../controllers/cajaController');

router.get('/',             auth, ctrl.getHoy);
router.get('/preview-apertura', auth, ctrl.previewApertura);
router.post('/abrir',       auth, ctrl.abrir);
router.put('/cerrar',       auth, ctrl.cerrar);
router.put('/reabrir',      auth, ctrl.reabrir);
router.get('/historial',              auth, ctrl.historial);
router.get('/repartidores',           auth, ctrl.getRepartidores);
router.get('/movimientos',            auth, ctrl.getMovimientos);
router.post('/movimientos',           auth, ctrl.addMovimiento);
router.put('/movimientos/:id/anular', auth, ctrl.anularMovimiento);
router.get('/:id',                     auth, ctrl.getById);
router.get('/:id/resumen-bidones',      auth, ctrl.resumenBidones);
router.get('/:id/movimientos',        auth, ctrl.getMovimientosCaja);

module.exports = router;
