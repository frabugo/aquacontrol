const { Router } = require('express');
const auth = require('../middleware/authMiddleware');
const ctrl = require('../controllers/pedidosController');

const router = Router();

router.get('/mapa',              auth, ctrl.mapData);
router.get('/repartidores',      auth, ctrl.repartidores);
router.get('/mis-pedidos',       auth, ctrl.misPedidos);
router.get('/precio-sugerido',   auth, ctrl.getPrecioSugerido);
router.get('/ultima-direccion',  auth, ctrl.getUltimaDireccion);
router.get('/',                  auth, ctrl.list);
router.get('/:id',               auth, ctrl.getOne);
router.post('/',                 auth, ctrl.create);
router.put('/:id',               auth, ctrl.update);
router.put('/:id/asignar-ruta',        auth, ctrl.asignarRuta);
router.put('/:id/asignar-repartidor', auth, ctrl.asignarRepartidor);
router.put('/:id/entregar',     auth, ctrl.entregar);
router.put('/:id/no-entregado', auth, ctrl.noEntregado);
router.put('/:id/estado',       auth, ctrl.updateEstado);

module.exports = router;
