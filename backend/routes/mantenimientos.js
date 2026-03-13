const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/authMiddleware');
const ctrl    = require('../controllers/mantenimientosController');

router.get   ('/alertas',  auth, ctrl.alertas);
router.get   ('/proximos', auth, ctrl.proximos);
router.get   ('/',         auth, ctrl.list);
router.post  ('/',        auth, ctrl.create);
router.put   ('/:id',     auth, ctrl.update);
router.delete('/:id',     auth, ctrl.remove);

module.exports = router;
