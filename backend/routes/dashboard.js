// routes/dashboard.js
const express  = require('express');
const router   = express.Router();
const auth     = require('../middleware/authMiddleware');
const { getIndicadores } = require('../controllers/dashboardController');

// GET /api/dashboard — protegida
router.get('/', auth, getIndicadores);

module.exports = router;
