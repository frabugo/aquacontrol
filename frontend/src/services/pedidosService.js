import api from './api';

export const listarPedidos      = (params)    => api.get('/pedidos', { params }).then(r => r.data);
export const obtenerPedido      = (id)        => api.get(`/pedidos/${id}`).then(r => r.data);
export const crearPedido        = (data)      => api.post('/pedidos', data).then(r => r.data);
export const actualizarPedido   = (id, data)  => api.put(`/pedidos/${id}`, data).then(r => r.data);
export const asignarRuta        = (id, data)  => api.put(`/pedidos/${id}/asignar-ruta`, data).then(r => r.data);
export const entregarPedido     = (id, data)  => api.put(`/pedidos/${id}/entregar`, data).then(r => r.data);
export const noEntregado        = (id, data)  => api.put(`/pedidos/${id}/no-entregado`, data).then(r => r.data);
export const cambiarEstado      = (id, data)  => api.put(`/pedidos/${id}/estado`, data).then(r => r.data);
export const dataMapa           = (params)    => api.get('/pedidos/mapa', { params }).then(r => r.data);
export const listarRepartidores = ()          => api.get('/pedidos/repartidores').then(r => r.data);
export const misPedidos         = (params)    => api.get('/pedidos/mis-pedidos', { params }).then(r => r.data);
export const asignarRepartidor  = (id, data)  => api.put(`/pedidos/${id}/asignar-repartidor`, data).then(r => r.data);
export const getUltimaDireccion = (cliente_id) => api.get('/pedidos/ultima-direccion', { params: { cliente_id } }).then(r => r.data);
