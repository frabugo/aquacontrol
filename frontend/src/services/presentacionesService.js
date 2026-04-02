import api from './api';

const BASE = '/presentaciones';

export const listarPresentaciones   = (params)     => api.get(BASE, { params }).then(r => r.data);
export const obtenerPresentacion    = (id)          => api.get(`${BASE}/${id}`).then(r => r.data);
export const crearPresentacion      = (data)        => api.post(BASE, data).then(r => r.data);
export const actualizarPresentacion = (id, data)    => api.put(`${BASE}/${id}`, data).then(r => r.data);
export const desactivarPresentacion = (id)          => api.delete(`${BASE}/${id}`).then(r => r.data);
export const getMovimientosStock    = (id, params)  => api.get(`${BASE}/${id}/movimientos`, { params }).then(r => r.data);
export const registrarMovimiento    = (id, data)    => api.post(`${BASE}/${id}/movimientos`, data).then(r => r.data);
export const getKardex              = (id, params)  => api.get(`${BASE}/${id}/kardex`, { params }).then(r => r.data);
