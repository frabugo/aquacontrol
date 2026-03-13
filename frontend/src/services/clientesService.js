import api from './api';

const BASE = '/clientes';

export const listarClientes   = (params) => api.get(BASE, { params }).then(r => ({
  data:  Array.isArray(r.data?.data) ? r.data.data : [],
  total: r.data?.total  ?? 0,
  page:  r.data?.page   ?? 1,
  pages: r.data?.pages  ?? 1,
}));
export const obtenerCliente   = (id)     => api.get(`${BASE}/${id}`).then(r => r.data);
export const crearCliente     = (data)   => api.post(BASE, data).then(r => r.data);
export const actualizarCliente= (id, data) => api.put(`${BASE}/${id}`, data).then(r => r.data);
export const desactivarCliente= (id)     => api.delete(`${BASE}/${id}`).then(r => r.data);
export const cargaInicialCliente = (id, data) => api.post(`${BASE}/${id}/carga-inicial`, data).then(r => r.data);
export const descargarPlantillaDeudas = () => api.get(`${BASE}/plantilla-deudas`, { responseType: 'blob' }).then(r => {
  const url = window.URL.createObjectURL(new Blob([r.data]));
  const a = document.createElement('a'); a.href = url; a.download = 'plantilla_deudas.xlsx';
  document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url);
});
export const importarDeudas = (file) => {
  const fd = new FormData(); fd.append('archivo', file);
  return api.post(`${BASE}/importar-deudas`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
};
