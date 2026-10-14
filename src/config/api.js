// Central API Base URL Configuration
// In development, it defaults to 'http://localhost:5000'
// In production (e.g. Vercel), set VITE_API_URL to your deployed backend URL (e.g. https://your-backend.onrender.com)
export const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/+$/, '');
