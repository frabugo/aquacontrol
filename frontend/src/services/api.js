import axios from 'axios';
import { getToken } from './authService';
import { API_URL } from '../config/api';

const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use(config => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res,
  error => {
    if (error.response?.status === 401) {
      // Sesión desplazada por otro dispositivo
      if (error.response?.data?.error === 'SESION_DESPLAZADA') {
        window.dispatchEvent(new CustomEvent('sesion:desplazada', {
          detail: { mensaje: error.response.data.mensaje },
        }));
        return Promise.reject(error); // rechaza para que los componentes manejen el loading
      }

      // Token expirado o inválido → limpiar y enviar a login
      const url = error.config?.url || '';
      if (!url.includes('/auth/login')) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.replace('/login');
        return new Promise(() => {});
      }
    }
    return Promise.reject(error);
  }
);

export default api;
