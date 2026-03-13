const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const ctrl = require('../controllers/pushController');

router.get('/vapid-key', auth, ctrl.getKey);
router.post('/subscribe', auth, ctrl.subscribe);
router.post('/unsubscribe', auth, ctrl.unsubscribe);

module.exports = router;
