/**
 * Central URL helper for computing trusted frontend base URL (Phase 1b)
 * Prevents Host/Origin header injection attacks by deriving base URL
 * strictly from validated FRONTEND_URL environment configuration.
 */

const getFrontendBaseUrl = () => {
  const raw = process.env.FRONTEND_URL || '';
  const first = raw.split(',')[0].trim().replace(/\/+$/, '');
  if (first) {
    return first;
  }
  if (process.env.NODE_ENV !== 'production') {
    return 'http://localhost:5173';
  }
  return '';
};

module.exports = {
  getFrontendBaseUrl
};
