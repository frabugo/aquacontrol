const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/authMiddleware');
const ctrl    = require('../controllers/insumosController');

router.get ('/alertas',           auth, ctrl.alertas);
router.get ('/',                 auth, ctrl.list);
router.post('/',                 auth, ctrl.create);
router.get ('/receta/:id',       auth, ctrl.getReceta);
router.get ('/:id',              auth, ctrl.getOne);
router.put ('/:id',              auth, ctrl.update);
router.delete('/:id',            auth, ctrl.deactivate);
router.post('/:id/ajuste',       auth, ctrl.ajuste);

module.exports = router;
