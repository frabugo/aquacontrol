import api from './api';

export const listarMetas      = (params) => api.get('/metas', { params }).then(r => r.data);
export const resumenMetas     = (params) => api.get('/metas/resumen', { params }).then(r => r.data);
export const crearMeta        = (data)   => api.post('/metas', data).then(r => r.data);
export const actualizarMeta   = (id, data) => api.put(`/metas/${id}`, data).then(r => r.data);
export const eliminarMeta     = (id)     => api.delete(`/metas/${id}`).then(r => r.data);
