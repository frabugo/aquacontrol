const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const ctrl = require('../controllers/configController');

function adminOnly(req, res, next) {
  if (req.user.rol !== 'admin') return res.status(403).json({ error: 'Solo admin puede modificar configuración' });
  next();
}

router.get('/',     auth, ctrl.getAll);
router.put('/',     auth, adminOnly, ctrl.save);
router.post('/dni', auth, ctrl.consultarDni);
router.post('/ruc', auth, ctrl.consultarRuc);
router.put('/modo-sistema',   auth, adminOnly, ctrl.cambiarModo);
router.post('/restaurar-bd', auth, ctrl.restaurarBd);
router.get('/backups',                    auth, ctrl.listarBackups);
router.post('/backups',                   auth, ctrl.crearBackupManual);
router.post('/backups/:nombre/restaurar', auth, ctrl.restaurarBackup);

// Categorías de caja
const catCtrl = require('../controllers/categoriasCajaController');
router.get('/categorias-caja',      auth, catCtrl.list);
router.post('/categorias-caja',     auth, adminOnly, catCtrl.create);
router.put('/categorias-caja/:id',  auth, adminOnly, catCtrl.update);
router.delete('/categorias-caja/:id', auth, adminOnly, catCtrl.remove);

module.exports = router;
