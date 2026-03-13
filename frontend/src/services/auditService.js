import api from './api';

export const getAuditLog = (params) => api.get('/audit', { params }).then(r => r.data);
