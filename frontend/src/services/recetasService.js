import api from './api';

export const obtenerReceta   = (presentacion_id) => api.get(`/recetas/${presentacion_id}`).then(r => r.data);
export const agregarInsumo   = (data)            => api.post('/recetas', data).then(r => r.data);
export const editarReceta    = (id, data)        => api.put(`/recetas/${id}`, data).then(r => r.data);
export const eliminarReceta  = (id)              => api.delete(`/recetas/${id}`).then(r => r.data);
