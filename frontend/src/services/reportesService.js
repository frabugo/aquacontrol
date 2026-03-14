import api from './api';

function descargar(response, filename) {
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export const exportarVentas = (params) =>
  api.get('/reportes/ventas', { params, responseType: 'blob' })
    .then(r => descargar(r, `ventas_${params.fecha_inicio || 'all'}.xlsx`));

export const exportarCaja = (params) =>
  api.get('/reportes/caja', { params, responseType: 'blob' })
    .then(r => descargar(r, `caja_${params.caja_id || 'general'}.xlsx`));

export const exportarProduccion = (params) =>
  api.get('/reportes/produccion', { params, responseType: 'blob' })
    .then(r => descargar(r, `produccion_${params.fecha_inicio || 'all'}.xlsx`));

export const exportarDeudas = () =>
  api.get('/reportes/deudas', { responseType: 'blob' })
    .then(r => descargar(r, 'deudas_clientes.xlsx'));

export function obtenerGraficos(params) {
  return api.get('/reportes/graficos', { params }).then(r => r.data);
}

export const exportarProveedores = (params) =>
  api.get('/reportes/proveedores', { params, responseType: 'blob' })
    .then(r => descargar(r, 'proveedores.xlsx'));

export const exportarClientes = (params) =>
  api.get('/reportes/clientes', { params, responseType: 'blob' })
    .then(r => descargar(r, 'clientes.xlsx'));

export const exportarCompras = (params) =>
  api.get('/reportes/compras-excel', { params, responseType: 'blob' })
    .then(r => descargar(r, `compras_${params?.fecha_inicio || 'all'}.xlsx`));

export const exportarComprobantes = (params) =>
  api.get('/reportes/comprobantes', { params, responseType: 'blob' })
    .then(r => descargar(r, 'comprobantes.xlsx'));

export function obtenerEntregas(params) {
  return api.get('/reportes/entregas', { params }).then(r => r.data);
}

export const obtenerRentabilidad = (params) => api.get('/reportes/rentabilidad-clientes', { params }).then(r => r.data);
