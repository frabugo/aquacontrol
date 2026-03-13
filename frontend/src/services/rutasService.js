import api from './api';

export const listarRutas     = (params)    => api.get('/rutas', { params }).then(r => r.data);
export const obtenerRuta     = (id)        => api.get(`/rutas/${id}`).then(r => r.data);
export const miRuta          = ()          => api.get('/rutas/mi-ruta').then(r => r.data);
export const crearRuta       = (data)      => api.post('/rutas', data).then(r => r.data);
export const salirRuta       = (id, data)  => api.put(`/rutas/${id}/salir`, data).then(r => r.data);
export const cargarVehiculo  = (id, data)  => api.put(`/rutas/${id}/cargar`, data).then(r => r.data);
export const finalizarRuta   = (id, data)  => api.put(`/rutas/${id}/finalizar`, data).then(r => r.data);
export const entregarCaja    = (id)        => api.post(`/rutas/${id}/entregar-caja`).then(r => r.data);
export const solicitarEntrega = (id)       => api.put(`/rutas/${id}/solicitar-entrega`).then(r => r.data);
export const confirmarEntrega = (id)       => api.post(`/rutas/${id}/confirmar-entrega`).then(r => r.data);
export const getMovimientosRuta = (id)     => api.get(`/rutas/${id}/movimientos`).then(r => r.data);
export const registrarGasto  = (id, data)  => api.post(`/rutas/${id}/gasto`, data).then(r => r.data);
export const devolverVacios  = (id, data)  => api.put(`/rutas/${id}/devolver-vacios`, data).then(r => r.data);
export const devolverLlenos  = (id, data)  => api.put(`/rutas/${id}/devolver-llenos`, data).then(r => r.data);
export const visitaPlanta    = (id, data)  => api.post(`/rutas/${id}/visita-planta`, data).then(r => r.data);
export const getVisitas      = (id)        => api.get(`/rutas/${id}/visitas`).then(r => r.data);
export const getStockVehiculo = (id)       => api.get(`/rutas/${id}/stock-vehiculo`).then(r => r.data);
export const ventaRapida     = (id, data)  => api.post(`/rutas/${id}/venta-rapida`, data).then(r => r.data);
export const getVentasAlPaso = (id)        => api.get(`/rutas/${id}/ventas-al-paso`).then(r => r.data);
export const anularVentaAlPaso = (id, ventaId) => api.put(`/rutas/${id}/anular-venta-al-paso/${ventaId}`).then(r => r.data);
export const cobrarDeuda      = (id, data)    => api.post(`/rutas/${id}/cobrar-deuda`, data).then(r => r.data);
export const getCobrosDeuda   = (id)          => api.get(`/rutas/${id}/cobros-deuda`).then(r => r.data);

export default {
  listarRutas, obtenerRuta, miRuta, crearRuta, salirRuta, cargarVehiculo,
  finalizarRuta, entregarCaja, solicitarEntrega, confirmarEntrega,
  getMovimientosRuta, registrarGasto, devolverVacios, devolverLlenos,
  visitaPlanta, getVisitas, getStockVehiculo, ventaRapida, getVentasAlPaso, anularVentaAlPaso,
  cobrarDeuda, getCobrosDeuda,
};
