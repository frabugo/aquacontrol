const getApiUrl = () => {
  try {
    const guardada = localStorage.getItem('AQUA_API_URL');
    if (guardada) return guardada;
  } catch (e) { /* SSR o sin localStorage */ }

  // En dev con Vite proxy, usar ruta relativa (mismo origin)
  if (import.meta.env.DEV) return '';

  // En producción, usar la misma IP/host del navegador
  return import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3001`;
};

export const API_BASE = getApiUrl();
export const API_URL = `${API_BASE}/api`;
