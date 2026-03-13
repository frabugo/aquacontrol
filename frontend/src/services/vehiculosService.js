import api from './api';

export const listarVehiculos   = ()          => api.get('/vehiculos').then(r => r.data);
export const crearVehiculo     = (data)      => api.post('/vehiculos', data).then(r => r.data);
export const actualizarVehiculo = (id, data) => api.put(`/vehiculos/${id}`, data).then(r => r.data);
export const desactivarVehiculo = (id)       => api.delete(`/vehiculos/${id}`).then(r => r.data);
export const asignarRepartidor = (id, data)  => api.put(`/vehiculos/${id}/asignar-repartidor`, data).then(r => r.data);
export const miVehiculo        = ()          => api.get('/vehiculos/mi-vehiculo').then(r => r.data);
export const vehiculosDisponibles = ()       => api.get('/vehiculos/disponibles').then(r => r.data);
export const historialKm         = (id)     => api.get(`/vehiculos/${id}/historial-km`).then(r => r.data);
