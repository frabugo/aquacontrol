import api from './api';

export function getConfig() {
  return api.get('/config').then(r => r.data);
}

export function saveConfig(claves) {
  return api.put('/config', { claves }).then(r => r.data);
}

export function consultarDni(dni) {
  return api.post('/config/dni', { dni }).then(r => r.data);
}

export function consultarRuc(ruc) {
  return api.post('/config/ruc', { ruc }).then(r => r.data);
}

export function cambiarModo(modo, pin, confirmacion) {
  return api.put('/config/modo-sistema', { modo, pin, confirmacion }).then(r => r.data);
}

export function restaurarBd(confirmacion) {
  return api.post('/config/restaurar-bd', { confirmacion }).then(r => r.data);
}

export function listarBackups() {
  return api.get('/config/backups').then(r => r.data);
}

export function crearBackup() {
  return api.post('/config/backups').then(r => r.data);
}

export function restaurarBackup(nombre, confirmacion) {
  return api.post(`/config/backups/${nombre}/restaurar`, { confirmacion }).then(r => r.data);
}
