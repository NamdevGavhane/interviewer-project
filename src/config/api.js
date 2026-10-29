// Central API Base URL Configuration (Phase 1d)
// In development, it defaults to 'http://localhost:5000'
// In production builds, missing VITE_API_URL fails loudly to prevent silent localhost connections

const envApiUrl = import.meta.env.VITE_API_URL;

if (import.meta.env.PROD && (!envApiUrl || envApiUrl.trim() === '')) {
  throw new Error(
    '[FATAL CONFIG ERROR] VITE_API_URL environment variable is required in production builds. ' +
    'Please set VITE_API_URL to your deployed backend URL (e.g. https://your-backend.onrender.com).'
  );
}

export const API_BASE_URL = (envApiUrl || 'http://localhost:5000').replace(/\/+$/, '');
