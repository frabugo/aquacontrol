const { Router } = require('express');
const auth = require('../middleware/authMiddleware');
const ctrl = require('../controllers/programacionMantController');

const router = Router();

router.get('/alertas-todas',  auth, ctrl.alertasUnificadas);
router.get('/alertas',        auth, ctrl.alertas);
router.get('/',               auth, ctrl.list);
router.post('/',              auth, ctrl.create);
router.put('/:id',            auth, ctrl.update);
router.delete('/:id',         auth, ctrl.remove);

module.exports = router;
