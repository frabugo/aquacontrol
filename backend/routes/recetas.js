const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/authMiddleware');
const ctrl    = require('../controllers/recetasController');

router.get ('/:presentacion_id', auth, ctrl.getByPresentacion);
router.post('/',                 auth, ctrl.create);
router.put ('/:id',              auth, ctrl.update);
router.delete('/:id',            auth, ctrl.remove);

module.exports = router;
