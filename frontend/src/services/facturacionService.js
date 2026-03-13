import api from './api';

export function listarComprobantes(params) {
  return api.get('/facturacion/listar', { params }).then(r => r.data);
}

export function emitirComprobante(data) {
  return api.post('/facturacion/emitir', data).then(r => r.data);
}

export function getComprobantes(ventaId) {
  return api.get(`/facturacion/venta/${ventaId}`).then(r => r.data);
}

export function getSeries(tipo) {
  return api.get(`/facturacion/series?tipo=${tipo}`).then(r => r.data);
}

export function getMetodosPagoFacturacion() {
  return api.get('/facturacion/metodos-pago').then(r => r.data);
}

export function emitirGuiaRemision(data) {
  return api.post('/facturacion/guia', data).then(r => r.data);
}

export function consultarEstadoSunat(comprobanteId) {
  return api.get(`/facturacion/estado/${comprobanteId}`).then(r => r.data);
}

export function anularComprobante(data) {
  return api.post('/facturacion/anular', data).then(r => r.data);
}

export function enviarBaja(data) {
  return api.post('/facturacion/enviar-baja', data).then(r => r.data);
}

export function cancelarAnulacion(data) {
  return api.post('/facturacion/cancelar-anulacion', data).then(r => r.data);
}
