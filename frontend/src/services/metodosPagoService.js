import api from './api';

export const listarMetodos = () => api.get('/metodos-pago').then(r => r.data);
export const listarTodosMetodos = () => api.get('/metodos-pago/todos').then(r => r.data);
export const crearMetodo = (data) => api.post('/metodos-pago', data).then(r => r.data);
export const actualizarMetodo = (id, data) => api.put(`/metodos-pago/${id}`, data).then(r => r.data);
export const desactivarMetodo = (id) => api.delete(`/metodos-pago/${id}`).then(r => r.data);
