const { Router } = require('express');
const auth = require('../middleware/authMiddleware');
const ctrl = require('../controllers/vehiculosController');

const router = Router();

router.get('/mi-vehiculo',             auth, ctrl.miVehiculo);
router.get('/disponibles',             auth, ctrl.disponibles);
router.get('/',                        auth, ctrl.list);
router.post('/',                       auth, ctrl.create);
router.put('/:id',                     auth, ctrl.update);
router.delete('/:id',                  auth, ctrl.remove);
router.get('/:id/historial-km',        auth, ctrl.historialKm);
router.put('/:id/asignar-repartidor',  auth, ctrl.asignarRepartidor);

module.exports = router;
