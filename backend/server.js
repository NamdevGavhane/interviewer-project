const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

// Load environment variables
require('dotenv').config();
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const isProd = process.env.NODE_ENV === 'production';

// S2: Secret validation - Server must refuse to boot without required secrets (min 32 chars)
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('\n============================================================');
  console.error('FATAL CONFIGURATION ERROR: JWT_SECRET is missing or less than 32 characters!');
  console.error('Server cannot start securely. Please set a strong JWT_SECRET.');
  console.error('============================================================\n');
  process.exit(1);
}

if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET.length < 32) {
  console.error('\n============================================================');
  console.error('FATAL CONFIGURATION ERROR: JWT_REFRESH_SECRET is missing or less than 32 characters!');
  console.error('Server cannot start securely. Please set a strong JWT_REFRESH_SECRET.');
  console.error('============================================================\n');
  process.exit(1);
}

if (isProd) {
  if (!process.env.MONGO_URI) {
    console.error('FATAL CONFIGURATION ERROR: MONGO_URI is missing in production!');
    process.exit(1);
  }
  if (!process.env.FRONTEND_URL) {
    console.error('FATAL CONFIGURATION ERROR: FRONTEND_URL is missing in production!');
    process.exit(1);
  }
}

const { apiLimiter } = require('./middleware/rateLimiter');

const app = express();

// Trust reverse proxy (Vercel/Render) for accurate IP resolution and secure cookies
app.set('trust proxy', 1);

// S7: Security Headers with Helmet CSP tailored for SPA, Razorpay & Google Sign-In
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
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

// S3: CORS Configuration - Allow ONLY origins from FRONTEND_URL (comma-separated), reject all others
const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map(o => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);

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
    return callback(new Error(`CORS policy violation: Origin "${origin}" is not authorized.`));
  },
  credentials: true
}));

app.use(cookieParser());

// S7: Global body limits - 1MB limit globally; raw parser strictly for webhooks
app.use((req, res, next) => {
  if (req.originalUrl === '/api/payment/webhook') {
    express.raw({ type: 'application/json' })(req, res, next);
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
  const statusCode = isDbConnected ? 200 : 503;
  res.status(statusCode).json({
    success: isDbConnected,
    status: isDbConnected ? 'healthy' : 'degraded',
    database: isDbConnected ? 'connected' : 'disconnected',
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
const { startReminderWorker } = require('./services/reminderService');

// Mount Routes
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

// Centralized Error Handling Middleware
app.use((err, req, res, next) => {
  if (err.message && err.message.includes('CORS policy violation')) {
    return res.status(403).json({
      success: false,
      message: err.message
    });
  }

  // Handle payload too large
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      message: 'Request entity too large: Maximum payload allowed is 1MB.'
    });
  }

  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {})
  });
});

// Database Connection & Server Startup
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/interviewpro';

let isConnecting = false;

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
    startReminderWorker();
  } catch (err) {
    isConnecting = false;
    console.error('Failed to connect to MongoDB:', err.message);
    if (process.env.NODE_ENV !== 'test') {
      setTimeout(connectDB, 3000);
    }
  }
};

mongoose.connection.on('disconnected', () => {
  if (process.env.NODE_ENV !== 'test') {
    console.warn('MongoDB connection lost. Reconnecting in 2 seconds...');
    setTimeout(connectDB, 2000);
  }
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err.message);
});

let server = null;
if (process.env.NODE_ENV !== 'test') {
  app.use('/api', (req, res, next) => {
    if (mongoose.connection.readyState !== 1 && !isConnecting) {
      connectDB();
    }
    next();
  });

  server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`InterviewPro server listening on 0.0.0.0:${PORT}`);
    connectDB();
  });
}

module.exports = { app, server, connectDB };
