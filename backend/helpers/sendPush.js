const webpush = require('web-push');
const db = require('../db');

let vapidConfigured = false;

/* ── Configurar VAPID (auto-genera claves si no existen) ── */
async function ensureVapid() {
  if (vapidConfigured) return;

  const [rows] = await db.query(
    "SELECT clave, valor FROM configuracion WHERE clave IN ('vapid_public_key', 'vapid_private_key')"
  );
  const cfg = {};
  for (const r of rows) cfg[r.clave] = r.valor;

  if (!cfg.vapid_public_key || !cfg.vapid_private_key) {
    const keys = webpush.generateVAPIDKeys();
    await db.query(
      "REPLACE INTO configuracion (clave, valor) VALUES ('vapid_public_key', ?), ('vapid_private_key', ?)",
      [keys.publicKey, keys.privateKey]
    );
    cfg.vapid_public_key = keys.publicKey;
    cfg.vapid_private_key = keys.privateKey;
    console.log('🔑 VAPID keys generadas automaticamente');
  }

  webpush.setVapidDetails(
    'mailto:admin@aquacontrol.pe',
    cfg.vapid_public_key,
    cfg.vapid_private_key
  );
  vapidConfigured = true;
}

/* ── Obtener clave publica VAPID ── */
async function getVapidPublicKey() {
  await ensureVapid();
  const [[row]] = await db.query("SELECT valor FROM configuracion WHERE clave = 'vapid_public_key'");
  return row?.valor || null;
}

/* ── Enviar push a un usuario ── */
async function sendPushToUser(userId, payload) {
  try {
    await ensureVapid();

    const [subs] = await db.query(
      'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE usuario_id = ?',
      [userId]
    );

    if (!subs.length) return;

    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);

    for (const sub of subs) {
      const pushSub = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };

      try {
        await webpush.sendNotification(pushSub, body);
      } catch (err) {
        // 410 Gone o 404 = suscripcion invalida, eliminar
        if (err.statusCode === 410 || err.statusCode === 404) {
          await db.query('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]);
        }
      }
    }
  } catch (err) {
    console.error('sendPush error:', err.message);
  }
}

module.exports = { getVapidPublicKey, sendPushToUser };
