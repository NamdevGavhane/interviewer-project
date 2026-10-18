import { API_BASE_URL } from '../config/api';

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

/**
 * Central API Client (Fetch wrapper)
 * - Automatically attaches Bearer token from localStorage/session
 * - Includes credentials (for httpOnly refresh token cookie)
 * - Automatically handles 401 by requesting /api/users/refresh
 * - Retries failed requests transparently
 * - Redirects to /login if refresh fails
 */
export const apiClient = async (endpoint, options = {}) => {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
  const config = { ...options };

  config.headers = {
    'Content-Type': 'application/json',
    ...(config.headers || {})
  };

  // If body is FormData, delete Content-Type so browser sets boundary
  if (config.body instanceof FormData) {
    delete config.headers['Content-Type'];
  }

  // Include credentials for cookies across origins
  config.credentials = 'include';

  // Attach access token if available
  const token = localStorage.getItem('token');
  if (token && !config.headers['Authorization']) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(url, config);
  } catch (networkErr) {
    throw new Error('Network error: Unable to reach the server. Please verify backend is running.');
  }

  // Handle 401 Unauthorized (Expired access token)
  if (response.status === 401 && !endpoint.includes('/api/users/login') && !endpoint.includes('/api/users/register') && !endpoint.includes('/api/users/refresh')) {
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then(newToken => {
          config.headers['Authorization'] = `Bearer ${newToken}`;
          return fetch(url, config).then(res => res.json());
        })
        .catch(err => Promise.reject(err));
    }

    isRefreshing = true;

    try {
      const refreshRes = await fetch(`${API_BASE_URL}/api/users/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });

      const refreshData = await refreshRes.json();

      if (refreshRes.ok && refreshData.data?.token) {
        const newToken = refreshData.data.token;
        localStorage.setItem('token', newToken);
        if (refreshData.data.user) {
          localStorage.setItem('userId', refreshData.data.user.id || refreshData.data.user._id);
        }
        processQueue(null, newToken);
        isRefreshing = false;

        // Retry original request with new token
        config.headers['Authorization'] = `Bearer ${newToken}`;
        const retryRes = await fetch(url, config);
        return retryRes.json();
      } else {
        throw new Error(refreshData.message || 'Session expired');
      }
    } catch (refreshErr) {
      processQueue(refreshErr, null);
      isRefreshing = false;

      // Invalidate frontend auth and redirect
      localStorage.removeItem('token');
      localStorage.removeItem('userId');
      localStorage.removeItem('userRole');

      if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
        window.location.href = '/login?expired=1';
      }

      throw new Error('Your session has expired. Please log in again.');
    }
  }

  const contentType = response.headers.get('content-type');
  let data;
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const errorMsg = data?.message || data?.error || (typeof data === 'string' ? data : `Request failed with status ${response.status}`);
    const err = new Error(errorMsg);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
};

// Convenience HTTP Methods
apiClient.get = (url, options = {}) => apiClient(url, { ...options, method: 'GET' });
apiClient.post = (url, body, options = {}) => apiClient(url, { ...options, method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) });
apiClient.put = (url, body, options = {}) => apiClient(url, { ...options, method: 'PUT', body: body instanceof FormData ? body : JSON.stringify(body) });
apiClient.patch = (url, body, options = {}) => apiClient(url, { ...options, method: 'PATCH', body: body instanceof FormData ? body : JSON.stringify(body) });
apiClient.delete = (url, options = {}) => apiClient(url, { ...options, method: 'DELETE' });

export default apiClient;
