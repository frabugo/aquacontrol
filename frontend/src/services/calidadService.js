import api from './api';

export const listarControles      = (params) => api.get('/calidad', { params }).then(r => r.data);
export const resumenCalidad       = (params) => api.get('/calidad/resumen', { params }).then(r => r.data);
export const tendenciaCalidad     = (params) => api.get('/calidad/tendencia', { params }).then(r => r.data);
export const obtenerParametros    = ()       => api.get('/calidad/parametros').then(r => r.data);
export const actualizarParametros = (data)   => api.put('/calidad/parametros', data).then(r => r.data);
export const crearControl         = (data)   => api.post('/calidad', data).then(r => r.data);
export const actualizarControl    = (id, data) => api.put(`/calidad/${id}`, data).then(r => r.data);
export const eliminarControl      = (id)     => api.delete(`/calidad/${id}`).then(r => r.data);
