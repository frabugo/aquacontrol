import api from './api';

export function getVapidKey() {
  return api.get('/push/vapid-key').then(r => r.data.key);
}

export function subscribePush(subscription) {
  return api.post('/push/subscribe', { subscription }).then(r => r.data);
}

export function unsubscribePush(endpoint) {
  return api.post('/push/unsubscribe', { endpoint }).then(r => r.data);
}
