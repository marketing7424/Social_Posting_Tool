import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
});

// JWT interceptor - attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor - auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry && original.url !== '/auth/login') {
      original._retry = true;
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        try {
          const res = await axios.post(`${import.meta.env.VITE_API_URL || '/api'}/auth/refresh`, { refreshToken });
          localStorage.setItem('accessToken', res.data.accessToken);
          localStorage.setItem('refreshToken', res.data.refreshToken);
          original.headers.Authorization = `Bearer ${res.data.accessToken}`;
          return api(original);
        } catch (_) {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

// Auth
export const authLogin = (data) => api.post('/auth/login', data).then(r => r.data);
export const authRegister = (data) => api.post('/auth/register', data).then(r => r.data);
export const authMe = () => api.get('/auth/me').then(r => r.data);

// Merchants
export const searchMerchants = (search = '') => api.get(`/merchants?search=${encodeURIComponent(search)}`).then(r => r.data);
export const getMerchant = (mid) => api.get(`/merchants/${mid}`).then(r => r.data);
export const createMerchant = (data) => api.post('/merchants', data).then(r => r.data);
export const updateMerchant = (mid, data) => api.patch(`/merchants/${mid}`, data).then(r => r.data);
export const deleteMerchant = (mid) => api.delete(`/merchants/${mid}`).then(r => r.data);

// Posts
export const getPosts = (filters = {}) => {
  const params = new URLSearchParams(filters).toString();
  return api.get(`/posts?${params}`).then(r => r.data);
};
export const getPost = (id) => api.get(`/posts/${id}`).then(r => r.data);
export const createPost = (data) => api.post('/posts', data).then(r => r.data);
export const updatePost = (id, data) => api.patch(`/posts/${id}`, data).then(r => r.data);
export const deletePost = (id) => api.delete(`/posts/${id}`).then(r => r.data);
export const publishPost = (id) => api.post(`/posts/${id}/publish`).then(r => r.data);
export const getPostStatus = (id) => api.get(`/posts/${id}/status`).then(r => r.data);
export const schedulePost = (id, scheduledTime) => api.post(`/posts/${id}/schedule`, { scheduledTime }).then(r => r.data);
export const retryPost = (id) => api.post(`/posts/${id}/retry`).then(r => r.data);

// Media
export const uploadMedia = (formData) => api.post('/media/upload', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
}).then(r => r.data);
export const deleteMedia = (filename) => api.delete(`/media/${filename}`).then(r => r.data);

// AI Captions
export const generateCaptions = (data) => api.post('/captions/generate', data).then(r => r.data);
export const regenerateCaption = (data) => api.post('/captions/regenerate', data).then(r => r.data);

// OAuth / Connection Test
export const testConnections = (mid) => api.post(`/oauth/test/${mid}`).then(r => r.data);
export const getMetaPages = (mid) => api.get(`/oauth/meta/pages/${mid}`).then(r => r.data);
export const selectMetaPage = (mid, pageId) => api.post(`/oauth/meta/select-page/${mid}`, { pageId }).then(r => r.data);
export const getGoogleLocations = (mid) => api.get(`/oauth/google/locations/${mid}`).then(r => r.data);
export const selectGoogleLocation = (mid, locationName) => api.post(`/oauth/google/select-location/${mid}`, { locationName }).then(r => r.data);

// Bulk Schedule
export const bulkUpload = (formData) => api.post('/bulk/upload', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
}).then(r => r.data);
export const bulkSchedule = (posts) => api.post('/bulk/schedule', { posts }).then(r => r.data);
export const bulkTemplate = () => `${api.defaults.baseURL}/bulk/template`;

export default api;
