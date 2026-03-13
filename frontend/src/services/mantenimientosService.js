import api from './api';

export const listarMantenimientos    = (params) => api.get('/mantenimientos', { params }).then(r => r.data);
export const obtenerAlertas          = ()       => api.get('/mantenimientos/alertas').then(r => r.data);
export const crearMantenimiento      = (data)   => api.post('/mantenimientos', data).then(r => r.data);
export const actualizarMantenimiento = (id, data) => api.put(`/mantenimientos/${id}`, data).then(r => r.data);
export const eliminarMantenimiento   = (id)     => api.delete(`/mantenimientos/${id}`).then(r => r.data);
export const obtenerProximos         = ()       => api.get('/mantenimientos/proximos').then(r => r.data);
