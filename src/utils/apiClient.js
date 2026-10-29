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
 * Safely parse response body and validate HTTP status.
 * Throws a consistent Error with .status and .data on failure.
 */
const parseAndValidateResponse = async (response) => {
  const contentType = response.headers.get('content-type') || '';
  let data;

  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  } else {
    try {
      data = await response.text();
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const errorMsg = 
      (data && typeof data === 'object' && (data.message || data.error)) ||
      (typeof data === 'string' && data.trim().length > 0 ? data : null) ||
      `Request failed with status ${response.status}`;

    const err = new Error(errorMsg);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
};

/**
 * Central API Client (Fetch wrapper)
 * - Automatically attaches Bearer token from localStorage
 * - Includes credentials (for httpOnly refresh cookies)
 * - AbortController timeout handling (default 30s)
 * - Handles 401 by refreshing tokens via /api/users/refresh
 * - Retries queued and initial requests with full validation
 * - Prevents refresh loops and unhandled response crashes
 */
export const apiClient = async (endpoint, options = {}) => {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
  const config = { ...options };

  config.headers = {
    'Content-Type': 'application/json',
    ...(config.headers || {})
  };

  // If body is FormData, delete Content-Type so the browser sets multipart boundary
  if (config.body instanceof FormData) {
    delete config.headers['Content-Type'];
  }

  config.credentials = 'include';

  // Attach access token if present
  const token = localStorage.getItem('token');
  if (token && !config.headers['Authorization']) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }

  // Network Timeout via AbortController
  const timeoutMs = typeof config.timeout === 'number' ? config.timeout : 30000;
  let timeoutId = null;
  let clientSignal = config.signal;

  if (!clientSignal && timeoutMs > 0) {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    config.signal = controller.signal;
  }

  let response;
  try {
    response = await fetch(url, config);
  } catch (networkErr) {
    if (networkErr.name === 'AbortError') {
      const err = new Error(`Request timed out after ${timeoutMs / 1000} seconds.`);
      err.status = 504;
      throw err;
    }
    const err = new Error('Network error: Unable to reach the server. Please check your internet connection.');
    err.status = 503;
    err.originalError = networkErr;
    throw err;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }

  const isAuthEndpoint = 
    endpoint.includes('/api/users/login') ||
    endpoint.includes('/api/users/register') ||
    endpoint.includes('/api/users/refresh');

  // Handle 401 Unauthorized (Expired access token)
  if (response.status === 401 && !isAuthEndpoint && !config._isRetry) {
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then(newToken => {
          const retryConfig = { ...config, _isRetry: true };
          retryConfig.headers = {
            ...retryConfig.headers,
            'Authorization': `Bearer ${newToken}`
          };
          return fetch(url, retryConfig).then(parseAndValidateResponse);
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
        processQueue(null, newToken);
        isRefreshing = false;

        // Retry original request with new token and parse response safely
        const retryConfig = { ...config, _isRetry: true };
        retryConfig.headers = {
          ...retryConfig.headers,
          'Authorization': `Bearer ${newToken}`
        };
        const retryRes = await fetch(url, retryConfig);
        return await parseAndValidateResponse(retryRes);
      } else {
        throw new Error(refreshData.message || 'Session expired');
      }
    } catch (refreshErr) {
      const sessionErr = new Error('Your session has expired. Please log in again.');
      sessionErr.status = 401;
      processQueue(sessionErr, null);
      isRefreshing = false;

      // Invalidate frontend auth state
      localStorage.removeItem('token');
      localStorage.removeItem('userId');
      localStorage.removeItem('userRole');

      if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
        window.location.href = '/login?expired=1';
      }

      throw sessionErr;
    }
  }

  return await parseAndValidateResponse(response);
};

// Convenience HTTP Methods
apiClient.get = (url, options = {}) => apiClient(url, { ...options, method: 'GET' });
apiClient.post = (url, body, options = {}) => apiClient(url, { ...options, method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) });
apiClient.put = (url, body, options = {}) => apiClient(url, { ...options, method: 'PUT', body: body instanceof FormData ? body : JSON.stringify(body) });
apiClient.patch = (url, body, options = {}) => apiClient(url, { ...options, method: 'PATCH', body: body instanceof FormData ? body : JSON.stringify(body) });
apiClient.delete = (url, options = {}) => apiClient(url, { ...options, method: 'DELETE' });

export default apiClient;
