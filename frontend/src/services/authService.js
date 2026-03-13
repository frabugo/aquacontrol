import axios from 'axios';
import { API_URL } from '../config/api';

const API = `${API_URL}/auth`;

export async function login(email, password) {
  const { data } = await axios.post(`${API}/login`, { email, password }, {
    timeout: 15000,
  });
  localStorage.setItem('token', data.token);
  localStorage.setItem('user', JSON.stringify(data.user));
  return data;
}

export function logout() {
  const token = getToken();
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  // Notificar al backend en segundo plano (fire & forget)
  if (token) {
    import('../config/api').then(({ API_URL }) => {
      axios.post(`${API_URL}/auth/logout`, {}, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 5000,
      }).catch(() => {});
    }).catch(() => {});
  }
}

export function getToken() {
  return localStorage.getItem('token');
}

export function getUser() {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    localStorage.removeItem('user');
    return null;
  }
}
