// routes/clientes.js
const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const auth    = require('../middleware/authMiddleware');
const ctrl    = require('../controllers/clientesController');

router.get   ('/plantilla-deudas', auth, ctrl.plantillaDeudas);
router.post  ('/importar-deudas',  auth, upload.single('archivo'), ctrl.importarDeudas);
router.get   ('/',    auth, ctrl.list);
router.get   ('/:id', auth, ctrl.getOne);
router.post  ('/',    auth, ctrl.create);
router.post  ('/:id/carga-inicial', auth, ctrl.cargaInicial);
router.put   ('/:id', auth, ctrl.update);
router.delete('/:id', auth, ctrl.deactivate);

module.exports = router;
