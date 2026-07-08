import axios from 'axios';

/**
 * Single axios instance for the whole app.
 * - attaches the access token
 * - on 401, tries ONE refresh, replays the request, else logs out
 */
// Prod: set VITE_API_URL to the backend origin, e.g. https://xebai-api.onrender.com/api
// Dev: unset -> falls back to '/api', served by the Vite proxy (vite.config.js)
const API_BASE = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing = null;

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const is401 = error.response?.status === 401;
    const isAuthCall = original?.url?.includes('/auth/');

    if (is401 && !original._retried && !isAuthCall) {
      original._retried = true;
      try {
        refreshing =
          refreshing ||
          axios.post(`${API_BASE}/auth/refresh`, { refreshToken: localStorage.getItem('refreshToken') });
        const { data } = await refreshing;
        refreshing = null;
        localStorage.setItem('token', data.token);
        original.headers.Authorization = `Bearer ${data.token}`;
        return api(original);
      } catch {
        refreshing = null;
        localStorage.clear();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
