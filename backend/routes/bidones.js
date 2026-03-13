// routes/bidones.js
const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/authMiddleware');
const ctrl    = require('../controllers/bidoinesController');

router.get('/stock',        auth, ctrl.getStock);
router.get('/movimientos',  auth, ctrl.getMovimientos);

module.exports = router;
