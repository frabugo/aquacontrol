const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/authMiddleware');
const ctrl    = require('../controllers/lavadosController');

router.get ('/pendientes',      auth, ctrl.pendientes);
router.get ('/ingresos-vacios', auth, ctrl.ingresosVacios);
router.get ('/',                auth, ctrl.list);
router.post('/',                auth, ctrl.create);

module.exports = router;
