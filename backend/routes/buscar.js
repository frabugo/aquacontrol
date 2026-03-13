const router = require('express').Router();
const auth   = require('../middleware/authMiddleware');
const ctrl   = require('../controllers/buscarController');

router.get('/', auth, ctrl.search);

module.exports = router;
