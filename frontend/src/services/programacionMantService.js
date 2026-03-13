import api from './api';

export const listarProgramaciones      = (params) => api.get('/programacion-mantenimiento', { params }).then(r => r.data);
export const obtenerAlertasProgramadas = ()       => api.get('/programacion-mantenimiento/alertas').then(r => r.data);
export const crearProgramacion         = (data)   => api.post('/programacion-mantenimiento', data).then(r => r.data);
export const actualizarProgramacion    = (id, data) => api.put(`/programacion-mantenimiento/${id}`, data).then(r => r.data);
export const eliminarProgramacion      = (id)     => api.delete(`/programacion-mantenimiento/${id}`).then(r => r.data);
export const obtenerAlertasTodas       = ()       => api.get('/programacion-mantenimiento/alertas-todas').then(r => r.data);
