import api from './api';

export const getStock       = ()      => api.get('/bidones/stock').then(r => r.data);
export const getMovimientos = (fecha) => api.get('/bidones/movimientos', { params: { fecha } }).then(r => r.data);
