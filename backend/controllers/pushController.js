const db = require('../db');
const { getVapidPublicKey } = require('../helpers/sendPush');

// GET /api/push/vapid-key — devuelve clave publica (para suscribirse)
exports.getKey = async (req, res) => {
  try {
    const key = await getVapidPublicKey();
    if (!key) return res.status(500).json({ error: 'VAPID no configurado' });
    res.json({ key });
  } catch (err) {
    console.error('pushController.getKey:', err.message);
    res.status(500).json({ error: 'Error al obtener clave VAPID' });
  }
};

// POST /api/push/subscribe — guardar suscripcion push
exports.subscribe = async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ error: 'Suscripcion invalida' });
    }

    await db.query(
      `INSERT INTO push_subscriptions (usuario_id, endpoint, p256dh, auth)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE usuario_id = VALUES(usuario_id), p256dh = VALUES(p256dh), auth = VALUES(auth)`,
      [req.user.id, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('pushController.subscribe:', err.message);
    res.status(500).json({ error: 'Error al guardar suscripcion' });
  }
};

// POST /api/push/unsubscribe — eliminar suscripcion push
exports.unsubscribe = async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (endpoint) {
      await db.query('DELETE FROM push_subscriptions WHERE endpoint = ?', [endpoint]);
    } else {
      await db.query('DELETE FROM push_subscriptions WHERE usuario_id = ?', [req.user.id]);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('pushController.unsubscribe:', err.message);
    res.status(500).json({ error: 'Error al eliminar suscripcion' });
  }
};
