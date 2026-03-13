import api from './api';

const BASE = '/ventas';

export const listarVentas       = (params) => api.get(BASE, { params }).then(r => r.data);
export const obtenerVenta       = (id)     => api.get(`${BASE}/${id}`).then(r => r.data);
export const crearVenta         = (data)   => api.post(BASE, data).then(r => r.data);
export const cancelarVenta      = (id)     => api.put(`${BASE}/${id}/cancelar`).then(r => r.data);
export const getPrecioSugerido  = (params) => api.get(`${BASE}/precio-sugerido`, { params }).then(r => r.data);
export const resumenDia         = ()       => api.get(`${BASE}/resumen-dia`).then(r => r.data);
export const getPrediccion     = (params) => api.get(`${BASE}/prediccion`, { params }).then(r => r.data);
