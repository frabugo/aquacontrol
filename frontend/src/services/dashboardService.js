import api from './api';

export async function getIndicadores(params) {
  const { data } = await api.get('/dashboard', { params });
  return data;
}
