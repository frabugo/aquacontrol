// controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const db     = require('../db');
const { getTenantContext } = require('../tenantContext');
const { getCentralPool } = require('../middleware/tenantMiddleware');

exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son requeridos' });
  }

  try {
    // Central usa su propia BD, tenants usan la suya
    const pool = req.isCentral ? getCentralPool() : db;

    const [rows] = await pool.query(
      'SELECT * FROM usuarios WHERE email = ? AND activo = 1',
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Cuenta suspendida (solo tenants)
    if (req.tenantSuspendido) {
      return res.json({
        suspendido: true,
        mensaje_suspension: req.mensajeSuspension,
      });
    }

    // Módulos: central no tiene usuario_modulos, tenants sí
    let modulos = [];
    if (!req.isCentral) {
      const [modRows] = await pool.query(
        'SELECT modulo FROM usuario_modulos WHERE usuario_id = ?',
        [user.id]
      );
      modulos = modRows.map(r => r.modulo);
    }

    // Sesión única solo aplica en tenants, NO en central
    if (!req.isCentral && user.sesion_unica && user.sesion_token) {
      global.tokenBlacklist.add(user.sesion_token);

      const io = req.app.get('io');
      if (io) {
        io.emit('sesion:desplazada', {
          token_viejo: user.sesion_token,
          mensaje: 'Tu sesión fue cerrada porque ingresaste desde otro dispositivo.',
        });
      }
    }

    const ctx = getTenantContext();
    const token = jwt.sign(
      { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol, gps_obligatorio: user.gps_obligatorio || 0, notif_pedidos: user.notif_pedidos || 0, tenantId: ctx?.tenantId || null, isCentral: !!req.isCentral },
      process.env.JWT_SECRET
    );

    // Solo guardar sesion_token en tenants
    if (!req.isCentral) {
      await pool.query(
        'UPDATE usuarios SET sesion_token = ?, ultimo_login = NOW() WHERE id = ?',
        [token, user.id]
      );
    } else {
      await pool.query(
        'UPDATE usuarios SET ultimo_login = NOW() WHERE id = ?',
        [user.id]
      );
    }

    res.json({
      token,
      user: {
        id:              user.id,
        nombre:          user.nombre,
        email:           user.email,
        rol:             user.rol,
        modulos,
        gps_obligatorio: user.gps_obligatorio || 0,
        notif_pedidos:   user.notif_pedidos || 0,
        sesion_unica:    user.sesion_unica || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.logout = async (req, res) => {
  try {
    await db.query(
      'UPDATE usuarios SET sesion_token = NULL WHERE id = ?',
      [req.user.id]
    );
    const { endpoint } = req.body || {};
    if (endpoint) {
      await db.query('DELETE FROM push_subscriptions WHERE endpoint = ?', [endpoint]);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
