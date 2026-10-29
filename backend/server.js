const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');

// Load environment variables
require('dotenv').config();
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const { validateEnv } = require('./config/envValidator');
validateEnv();

const { apiLimiter } = require('./middleware/rateLimiter');

const app = express();

// Trust reverse proxy (Vercel/Render) for accurate IP resolution and secure cookies
app.set('trust proxy', 1);

const isProd = process.env.NODE_ENV === 'production';

// S7: Security Headers with Helmet CSP tailored for SPA, Razorpay & Google Sign-In
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: isProd
        ? ["'self'", 'https://checkout.razorpay.com', 'https://accounts.google.com']
        : [
            "'self'",
            "'unsafe-inline'",
            'https://checkout.razorpay.com',
            'https://accounts.google.com'
          ],
      frameSrc: [
        "'self'",
        'https://api.razorpay.com',
        'https://accounts.google.com'
      ],
      connectSrc: [
        "'self'",
        'https://api.razorpay.com',
        'https://lumberjack.razorpay.com',
        'https://accounts.google.com',
        'wss:',
        'ws:'
      ],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:', 'http:'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: isProd ? [] : null
    }
  }
}));

// S3: CORS Configuration - strictly FRONTEND_URL in production, localhost allowed only in dev
const configuredOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map(o => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const devOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://localhost:5000'
];

const allowedOrigins = Array.from(
  new Set(isProd ? configuredOrigins : [...configuredOrigins, ...devOrigins])
);

app.use(cors({
  origin: function (origin, callback) {
    // Allow non-browser requests (e.g. server-to-server, curl, test suites)
    if (!origin) {
      return callback(null, true);
    }
    const cleanOrigin = origin.replace(/\/+$/, '');
    if (allowedOrigins.includes(cleanOrigin)) {
      return callback(null, true);
    }
    if (!isProd && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(cleanOrigin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS policy violation: Origin "${origin}" is not authorized.`));
  },
  credentials: true
}));

// Request ID tracking for structured logging
app.use((req, res, next) => {
  const reqId = req.headers['x-request-id'] || crypto.randomUUID();
  req.id = reqId;
  res.setHeader('X-Request-Id', reqId);
  next();
});

app.use(cookieParser());

// S7: Global body limits - 1MB limit globally; raw parser strictly for webhooks
app.use((req, res, next) => {
  if (req.originalUrl === '/api/payment/webhook') {
    express.raw({ type: '*/*' })(req, res, next);
  } else {
    express.json({ limit: '1mb' })(req, res, next);
  }
});

app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Global Rate Limiting
app.use('/api', apiLimiter);

// Health check routes
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'InterviewPro API is running',
    version: '2.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;
  const status = isDbConnected ? 'healthy' : 'unhealthy';
  const statusCode = isDbConnected ? 200 : 503;

  res.status(statusCode).json({
    success: isDbConnected,
    status,
    database: isDbConnected ? 'connected' : 'disconnected',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// Import Routes
const userRoutes = require('./routes/userRoutes');
const interviewRoutes = require('./routes/interviewRoutes');
const feedbackRoutes = require('./routes/feedbackRoutes');
const aiInterviewRoutes = require('./routes/aiInterviewRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const adminRoutes = require('./routes/adminRoutes');
const availabilityRoutes = require('./routes/availabilityRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const configRoutes = require('./routes/configRoutes');
const { startReminderWorker, stopReminderWorker } = require('./services/reminderService');
const { startLifecycleWorker, stopLifecycleWorker } = require('./services/sessionLifecycleService');

// Mount Routes
app.use('/api/config', configRoutes);
app.use('/api/users', userRoutes);
app.use('/api/interviews', interviewRoutes);
app.use('/api/feedbacks', feedbackRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/ai', aiInterviewRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/notifications', notificationRoutes);

// Consistent 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `API route not found: ${req.method} ${req.originalUrl}`
  });
});

// Centralized Error Handling Middleware (Phase 1f)
app.use((err, req, res, next) => {
  const requestId = req.id || req.headers['x-request-id'] || crypto.randomUUID();

  if (err.message && err.message.includes('CORS policy violation')) {
    return res.status(403).json({
      success: false,
      message: err.message,
      requestId
    });
  }

  // Handle payload too large
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      message: 'Request entity too large: Maximum payload allowed is 1MB.',
      requestId
    });
  }

  const status = err.status || err.statusCode || 500;

  if (status >= 500) {
    console.error(`[ERROR] [${requestId}] ${req.method} ${req.originalUrl}:`, err);
    return res.status(status).json({
      success: false,
      message: isProd ? 'Internal Server Error. Please contact support.' : (err.message || 'Internal Server Error'),
      requestId,
      ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {})
    });
  }

  return res.status(status).json({
    success: false,
    message: err.message || 'Bad Request',
    requestId,
    ...(err.errors ? { errors: err.errors } : {})
  });
});

// Database Connection & Server Startup
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/interviewpro';

let isConnecting = false;
let reconnectTimer = null;
let workersStarted = false;

const scheduleReconnect = (delayMs = 2000) => {
  if (process.env.NODE_ENV === 'test') return;
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    await connectDB();
  }, delayMs);
};

const connectDB = async () => {
  if (mongoose.connection.readyState === 1 || isConnecting) return;
  isConnecting = true;
  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 8000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10
    });
    console.log('Connected to MongoDB successfully');
    isConnecting = false;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    // Prevent duplicate worker intervals across reconnects (2c, 2d)
    if (!workersStarted && process.env.NODE_ENV !== 'test') {
      workersStarted = true;
      startReminderWorker();
      startLifecycleWorker();
    }
  } catch (err) {
    isConnecting = false;
    console.error('Failed to connect to MongoDB:', err.message);
    scheduleReconnect(3000);
  }
};

mongoose.connection.on('disconnected', () => {
  if (process.env.NODE_ENV !== 'test') {
    console.warn('MongoDB connection lost. Scheduling reconnect in 2 seconds...');
    scheduleReconnect(2000);
  }
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err.message);
});

let server = null;
if (process.env.NODE_ENV !== 'test') {
  app.use('/api', (req, res, next) => {
    if (mongoose.connection.readyState !== 1 && !isConnecting) {
      scheduleReconnect(500);
    }
    next();
  });

  server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`InterviewPro server listening on 0.0.0.0:${PORT}`);
    connectDB();
  });
}

// ==========================================
// Process Error Handlers & Graceful Shutdown (2c)
// ==========================================
process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL REJECTION] Unhandled Promise Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[FATAL EXCEPTION] Uncaught Exception:', err);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

const gracefulShutdown = async (signal) => {
  console.log(`[SHUTDOWN] Received ${signal}. Closing server, workers, and database connection gracefully...`);
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  stopReminderWorker();
  stopLifecycleWorker();

  if (server) {
    server.close(async () => {
      console.log('[SHUTDOWN] HTTP server closed.');
      try {
        await mongoose.connection.close(false);
        console.log('[SHUTDOWN] MongoDB connection closed.');
      } catch (dbErr) {
        console.warn('[SHUTDOWN] Error closing MongoDB connection:', dbErr.message);
      }
      process.exit(0);
    });

    // Enforce 10s timeout to force exit if pending sockets hang
    setTimeout(() => {
      console.error('[SHUTDOWN] Force exiting after 10s shutdown timeout.');
      process.exit(1);
    }, 10000).unref();
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = { app, server, connectDB, gracefulShutdown };
