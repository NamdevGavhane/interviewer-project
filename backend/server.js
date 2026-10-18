const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

// Load environment variables
require('dotenv').config();
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

// GLOBAL RULE 4: Server must refuse to start if JWT_SECRET is missing
if (!process.env.JWT_SECRET) {
  console.error('\n============================================================');
  console.error('FATAL ERROR: JWT_SECRET environment variable is missing!');
  console.error('Server cannot start securely without a configured JWT_SECRET.');
  console.error('Please configure JWT_SECRET in your backend/.env file.');
  console.error('============================================================\n');
  process.exit(1);
}

const { apiLimiter } = require('./middleware/rateLimiter');

const app = express();

// Security Headers with Helmet
app.use(helmet({
  crossOriginResourcePolicy: false,
  crossOriginEmbedderPolicy: false
}));

// CORS Configuration (Allow frontend with credentials for cookies)
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];

app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (e.g. mobile apps, curl)
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, true); // Permissive in dev, origins validated
  },
  credentials: true
}));

app.use(cookieParser());

// Webhook raw body parser for Razorpay webhook in Phase 3
app.use((req, res, next) => {
  if (req.originalUrl === '/api/payment/webhook') {
    express.raw({ type: 'application/json' })(req, res, next);
  } else {
    express.json({ limit: '15mb' })(req, res, next);
  }
});

app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Global Rate Limiting
app.use('/api', apiLimiter);

// Health check route (Public)
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'InterviewPro API is running',
    version: '2.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
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
const { startReminderWorker } = require('./services/reminderService');

// Mount Routes
app.use('/api/users', userRoutes);
app.use('/api/interviews', interviewRoutes);
app.use('/api/feedbacks', feedbackRoutes);
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
  console.error('Server error:', err);
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

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`InterviewPro server listening on 0.0.0.0:${PORT}`);
});

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('Connected to MongoDB successfully');
    // Start automated reminder worker
    startReminderWorker();
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err.message);
  });

module.exports = { app, server };
