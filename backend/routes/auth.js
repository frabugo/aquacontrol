// routes/auth.js
const express    = require("express");
const router     = express.Router();
const rateLimit  = require("express-rate-limit");
const auth       = require("../middleware/authMiddleware");
const { login, logout }  = require("../controllers/authController");

// Rate limit login: 6 intentos / 15 min
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6,
  message: { error: "Demasiados intentos de login, espere 15 minutos" },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});

// POST /api/auth/login
router.post("/login", loginLimiter, login);

// POST /api/auth/logout
router.post("/logout", auth, logout);

module.exports = router;
module.exports.loginLimiter = loginLimiter;
