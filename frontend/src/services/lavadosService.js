import api from './api';

export const obtenerPendientes   = ()       => api.get('/lavados/pendientes').then(r => r.data);
export const listarLavados       = (params) => api.get('/lavados', { params }).then(r => r.data);
export const registrarLavado     = (data)   => api.post('/lavados', data).then(r => r.data);
export const listarIngresosVacios = (params) => api.get('/lavados/ingresos-vacios', { params }).then(r => r.data);
