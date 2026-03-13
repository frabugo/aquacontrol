import api from './api';

export const listarLotes    = (params) => api.get('/produccion', { params }).then(r => r.data);
export const crearLote      = (data)   => api.post('/produccion', data).then(r => r.data);
export const completarLote  = (id, d)  => api.put(`/produccion/${id}/completar`, d).then(r => r.data);
export const rechazarLote   = (id, d)  => api.put(`/produccion/${id}/rechazar`, d).then(r => r.data);
export const getReceta         = (pres_id) => api.get(`/produccion/receta/${pres_id}`).then(r => r.data);
export const obtenerLote       = (id)     => api.get(`/produccion/${id}`).then(r => r.data);
export const verificarInsumos  = (params) => api.get('/produccion/verificar', { params }).then(r => r.data);
export const stockFifo         = (params) => api.get('/produccion/stock-fifo', { params }).then(r => r.data);
