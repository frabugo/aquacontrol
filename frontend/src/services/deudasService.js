import api from './api';

export const listarDeudas      = (params)    => api.get('/deudas', { params }).then(r => r.data);
export const ventasCredito     = (clienteId) => api.get(`/deudas/${clienteId}/ventas`).then(r => r.data);
export const historialPagos    = (clienteId) => api.get(`/deudas/${clienteId}/pagos`).then(r => r.data);
export const registrarPago     = (clienteId, data) => api.post(`/deudas/${clienteId}/pagar`, data).then(r => r.data);
export const anularPago        = (pagoId) => api.put(`/deudas/pagos/${pagoId}/anular`).then(r => r.data);
