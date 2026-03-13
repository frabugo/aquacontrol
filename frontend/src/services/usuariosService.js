import api from './api';

export const listarUsuarios     = (params)    => api.get('/usuarios', { params }).then(r => r.data);
export const obtenerUsuario     = (id)        => api.get(`/usuarios/${id}`).then(r => r.data);
export const crearUsuario       = (data)      => api.post('/usuarios', data).then(r => r.data);
export const actualizarUsuario  = (id, data)  => api.put(`/usuarios/${id}`, data).then(r => r.data);
export const desactivarUsuario  = (id)        => api.delete(`/usuarios/${id}`).then(r => r.data);
export const modulosDisponibles = ()          => api.get('/usuarios/modulos').then(r => r.data);
