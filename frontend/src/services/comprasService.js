import api from './api';

export const listarCompras = (params) => api.get('/compras', { params }).then(r => r.data);
export const obtenerCompra = (id)     => api.get(`/compras/${id}`).then(r => r.data);
export const crearCompra   = (data)   => api.post('/compras', data).then(r => r.data);
export const anularCompra  = (id)    => api.put(`/compras/${id}/anular`).then(r => r.data);

// Deudas proveedores
export const deudasProveedores       = (params)       => api.get('/compras/deudas-proveedores', { params }).then(r => r.data);
export const comprasDeProveedor      = (proveedorId)  => api.get(`/compras/proveedor/${proveedorId}/compras`).then(r => r.data);
export const historialPagosProveedor = (proveedorId)  => api.get(`/compras/proveedor/${proveedorId}/pagos`).then(r => r.data);
export const registrarPagoProveedor  = (data)         => api.post('/compras/pagar', data).then(r => r.data);
export const anularPagoProveedor     = (pagoId)       => api.put(`/compras/pagos/${pagoId}/anular`).then(r => r.data);
