import api from './api';

export const listarCondiciones = () => api.get('/condiciones-pago').then(r => r.data);
export const listarTodasCondiciones = () => api.get('/condiciones-pago/todos').then(r => r.data);
export const crearCondicion = (data) => api.post('/condiciones-pago', data).then(r => r.data);
export const actualizarCondicion = (id, data) => api.put(`/condiciones-pago/${id}`, data).then(r => r.data);
export const desactivarCondicion = (id) => api.delete(`/condiciones-pago/${id}`).then(r => r.data);
