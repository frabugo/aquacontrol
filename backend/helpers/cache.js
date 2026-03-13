// helpers/cache.js — Cache en memoria con TTL
const store = new Map();

function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

function set(key, value, ttlMs = 30000) {
  store.set(key, { value, expires: Date.now() + ttlMs });
}

function invalidate(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

// Cleanup expirados cada 5 min
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.expires) store.delete(key);
  }
}, 5 * 60 * 1000);

module.exports = { get, set, invalidate };
