const rateLimit = require('express-rate-limit');

/**
 * PRODUCTION RATE LIMITING STRATEGY & VOLUME CALCULATION (Phase 2b)
 * 
 * Volume Breakdown per Active User in 15-minute window:
 * - Notification Polling: 1 request every 30s = 30 req / 15 min
 * - Active Session Polling / Status: 1 request every 15s = 60 req / 15 min
 * - Navigation & Dashboard API fetches: ~6-12 req per page load x 10 page navigations = ~100 req
 * Total normal active user volume = 190 - 250 requests per 15 min.
 * Setting a flat 150/15min global cap throttles legitimate active users.
 * 
 * NOTE ON MULTI-INSTANCE / SHARED STORE:
 * The default MemoryStore is zero-dependency and optimal for single-instance
 * deployments (e.g. Render Web Services). For horizontal autoscaling across
 * multiple container replicas, provision Redis and pass `store: new RedisStore({ client: redisClient })`.
 */

// 1. General API Rate Limiter: 600 req per 15 min (40 req/min)
// Bypasses dedicated polling endpoints so normal browsing is never starved by background polls
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.baseUrl === '/api/notifications' || req.originalUrl.includes('/api/config/public'),
  message: {
    success: false,
    message: 'Too many requests from this client. Please slow down.'
  }
});

// 2. High-Frequency Polling Limiter: 1200 req per 15 min (80 req/min)
// Accommodates 15s - 30s background polling without hitting general API caps
const pollingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Polling frequency limit exceeded. Please back off.'
  }
});

// 3. Sensitive Auth Limiter: 20 attempts per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please wait 15 minutes before trying again.'
  }
});

// 4. Password Reset Limiter: 5 attempts per hour
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many password reset attempts. Please wait an hour before requesting again.'
  }
});

// 5. Financial / Payment Order Creation Limiter: 30 requests per 15 min
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Payment order creation limit reached. Please wait before creating more orders.'
  }
});

// 6. External AI Generation Limiter: 40 requests per 15 min
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'AI mock interview request limit reached. Please wait a few minutes before next question.'
  }
});

// 7. Live Room Peer Chat Limiter: 60 messages per minute
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many chat messages sent. Please slow down.'
  }
});

module.exports = {
  apiLimiter,
  pollingLimiter,
  authLimiter,
  passwordResetLimiter,
  paymentLimiter,
  aiLimiter,
  chatLimiter
};

