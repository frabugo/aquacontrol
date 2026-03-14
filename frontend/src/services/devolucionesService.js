import api from './api';

export const listarDevoluciones   = (params)    => api.get('/devoluciones', { params }).then(r => r.data);
export const crearDevolucion      = (data)      => api.post('/devoluciones', data).then(r => r.data);
export const anularDevolucion     = (id)        => api.put(`/devoluciones/${id}/anular`).then(r => r.data);
export const clientesPrestamos    = (params)    => api.get('/devoluciones/prestamos', { params }).then(r => r.data);
export const detallePrestamos     = (clienteId) => api.get(`/devoluciones/prestamos/${clienteId}`).then(r => r.data);
export const pendientesPorVenta   = (clienteId) => api.get(`/devoluciones/pendientes/${clienteId}`).then(r => r.data);
export const devolverDesdeReparto = (data)      => api.post('/devoluciones/desde-reparto', data).then(r => r.data);
export const bidonPerdido          = (data)      => api.post('/devoluciones/bidon-perdido', data).then(r => r.data);
export const bidonPerdidoRuta       = (data)      => api.post('/devoluciones/bidon-perdido-ruta', data).then(r => r.data);
export const devolverGarantia      = (data)      => api.post('/devoluciones/devolver-garantia', data).then(r => r.data);
