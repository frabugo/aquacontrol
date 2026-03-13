const { Router } = require('express');
const auth = require('../middleware/authMiddleware');
const ctrl = require('../controllers/usuariosController');

const router = Router();

router.get('/modulos', auth, ctrl.modulosDisponibles);
router.get('/',        auth, ctrl.list);
router.get('/:id',     auth, ctrl.getOne);
router.post('/',       auth, ctrl.create);
router.put('/:id',     auth, ctrl.update);
router.delete('/:id',  auth, ctrl.deactivate);
router.put('/:id/configuracion', auth, ctrl.updateConfig);

module.exports = router;
