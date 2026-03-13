import api from './api';

const BASE = '/caja';

export const getCajaHoy     = ()       => api.get(BASE).then(r => r.data);
export const getCajaById    = (id)     => api.get(`${BASE}/${id}`).then(r => r.data);
export const previewApertura = ()       => api.get(`${BASE}/preview-apertura`).then(r => r.data);
export const abrirCaja      = (data)   => api.post(`${BASE}/abrir`, data).then(r => r.data);
export const cerrarCaja     = (data)   => api.put(`${BASE}/cerrar`, data).then(r => r.data);
export const reabrirCaja    = (data)   => api.put(`${BASE}/reabrir`, data).then(r => r.data);
export const getMovimientos       = (params) => api.get(`${BASE}/movimientos`, { params }).then(r => r.data);
export const addMovimiento        = (data)   => api.post(`${BASE}/movimientos`, data).then(r => r.data);
export const anularMovimiento     = (id)     => api.put(`${BASE}/movimientos/${id}/anular`).then(r => r.data);
export const getCajasRepartidores = (params) => api.get(`${BASE}/repartidores`, { params }).then(r => r.data);
export const getHistorial         = (params) => api.get(`${BASE}/historial`, { params }).then(r => r.data);
export const getMovimientosCaja   = (id, params) => api.get(`${BASE}/${id}/movimientos`, { params }).then(r => r.data);
