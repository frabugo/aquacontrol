import api from './api';

export const listarProveedores   = (params) => api.get('/proveedores', { params }).then(r => r.data);
export const obtenerProveedor    = (id)     => api.get(`/proveedores/${id}`).then(r => r.data);
export const crearProveedor      = (data)   => api.post('/proveedores', data).then(r => r.data);
export const actualizarProveedor = (id, d)  => api.put(`/proveedores/${id}`, d).then(r => r.data);
export const desactivarProveedor = (id)     => api.delete(`/proveedores/${id}`).then(r => r.data);
export const obtenerPrecios      = (id)     => api.get(`/proveedores/${id}/precios`).then(r => r.data);
export const compararPrecios     = (params) => api.get('/proveedores/comparar', { params }).then(r => r.data);
