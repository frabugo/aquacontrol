const { Router } = require('express');
const auth = require('../middleware/authMiddleware');
const ctrl = require('../controllers/rutasController');

const router = Router();

router.get('/mi-ruta',            auth, ctrl.miRuta);
router.get('/',                   auth, ctrl.list);
router.get('/:id',                auth, ctrl.getOne);
router.get('/:id/movimientos',   auth, ctrl.getMovimientosRuta);
router.post('/',                  auth, ctrl.create);
router.put('/:id/salir',         auth, ctrl.salir);
router.put('/:id/cargar',        auth, ctrl.cargar);
router.put('/:id/devolver-vacios', auth, ctrl.devolverVacios);
router.put('/:id/devolver-llenos', auth, ctrl.devolverLlenos);
router.put('/:id/finalizar',          auth, ctrl.finalizar);
router.put('/:id/solicitar-entrega', auth, ctrl.solicitarEntrega);
router.post('/:id/confirmar-entrega', auth, ctrl.confirmarEntrega);
router.post('/:id/entregar-caja',    auth, ctrl.entregarCaja);
router.post('/:id/gasto',            auth, ctrl.registrarGasto);
router.post('/:id/visita-planta',   auth, ctrl.visitaPlanta);
router.get('/:id/visitas',          auth, ctrl.getVisitas);
router.get('/:id/stock-vehiculo',   auth, ctrl.getStockVehiculo);
router.post('/:id/venta-rapida',   auth, ctrl.ventaRapida);
router.get('/:id/ventas-al-paso', auth, ctrl.getVentasAlPaso);
router.put('/:id/anular-venta-al-paso/:ventaId', auth, ctrl.anularVentaAlPaso);
router.post('/:id/cobrar-deuda',    auth, ctrl.cobrarDeuda);
router.get('/:id/cobros-deuda',     auth, ctrl.getCobrosDeuda);

router.put('/:id/movimientos/:movId/anular', auth, ctrl.anularMovimientoRuta);

module.exports = router;
