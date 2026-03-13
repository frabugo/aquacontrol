const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/authMiddleware');
const ctrl    = require('../controllers/calidadController');

router.get   ('/resumen',    auth, ctrl.resumen);
router.get   ('/tendencia',  auth, ctrl.tendencia);
router.get   ('/parametros', auth, ctrl.parametros);
router.put   ('/parametros', auth, ctrl.updateParametros);
router.get   ('/',           auth, ctrl.list);
router.post  ('/',           auth, ctrl.create);
router.put   ('/:id',        auth, ctrl.update);
router.delete('/:id',        auth, ctrl.remove);

module.exports = router;
