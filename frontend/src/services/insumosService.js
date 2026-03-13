import api from './api';

export const listarInsumos    = (params) => api.get('/insumos', { params }).then(r => r.data);
export const obtenerInsumo    = (id)     => api.get(`/insumos/${id}`).then(r => r.data);
export const crearInsumo      = (data)   => api.post('/insumos', data).then(r => r.data);
export const actualizarInsumo = (id, d)  => api.put(`/insumos/${id}`, d).then(r => r.data);
export const ajustarInsumo    = (id, d)  => api.post(`/insumos/${id}/ajuste`, d).then(r => r.data);
export const desactivarInsumo = (id)    => api.delete(`/insumos/${id}`).then(r => r.data);
export const obtenerAlertas   = ()      => api.get('/insumos/alertas').then(r => r.data);
