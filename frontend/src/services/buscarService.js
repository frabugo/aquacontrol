import api from './api';

export const buscarGlobal = (params) => api.get('/buscar', { params }).then(r => r.data);
