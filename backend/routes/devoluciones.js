const { Router } = require('express');
const auth = require('../middleware/authMiddleware');
const ctrl = require('../controllers/devolucionesController');

const router = Router();

router.get('/',  auth, ctrl.list);
router.get('/prestamos',             auth, ctrl.clientesPrestamos);
router.get('/prestamos/:clienteId',  auth, ctrl.detallePrestamos);
router.get('/pendientes/:clienteId', auth, ctrl.pendientesPorVenta);
router.post('/desde-reparto', auth, ctrl.createDesdeReparto);
router.post('/bidon-perdido', auth, ctrl.bidonPerdido);
router.post('/', auth, ctrl.create);
router.put('/:id/anular', auth, ctrl.anular);

module.exports = router;
