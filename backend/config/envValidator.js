const { z } = require('zod');

/**
 * Zod schema defining backend environment configuration (O3)
 */
const productionEnvSchema = z.object({
  MONGO_URI: z.string().min(1, 'MONGO_URI connection string is required in production.'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters in production to resist brute-force attacks.'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters in production.'),
  FRONTEND_URL: z.string().min(1, 'FRONTEND_URL (allowed CORS origin) is required in production.')
}).refine(data => data.JWT_SECRET !== data.JWT_REFRESH_SECRET, {
  message: 'JWT_SECRET and JWT_REFRESH_SECRET must be distinct secrets.',
  path: ['JWT_REFRESH_SECRET']
});

const validateEnv = () => {
  const isProduction = process.env.NODE_ENV === 'production';

  console.log(`[ENV VALIDATOR] Checking environment variables (Mode: ${process.env.NODE_ENV || 'development'})...`);

  if (isProduction) {
    const result = productionEnvSchema.safeParse(process.env);
    if (!result.success) {
      console.error('\n================================================================================');
      console.error('[FATAL STARTUP ERROR] Production Environment Invariant Violations:');
      console.error('================================================================================');
      result.error.issues.forEach(issue => {
        console.error(`- ${issue.path.join('.') || 'CONFIG'}: ${issue.message}`);
      });
      console.error('================================================================================');
      console.error('Server process aborted. Set required environment variables before deploying.\n');
      process.exit(1);
    }
  } else {
    // Development checks
    const missingCritical = [];
    if (!process.env.MONGO_URI) missingCritical.push('MONGO_URI');
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
      missingCritical.push('JWT_SECRET (min 16 chars required in dev, 32 in prod)');
    }
    if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET.length < 16) {
      missingCritical.push('JWT_REFRESH_SECRET (min 16 chars required in dev, 32 in prod)');
    }
    if (process.env.JWT_SECRET && process.env.JWT_REFRESH_SECRET && process.env.JWT_SECRET === process.env.JWT_REFRESH_SECRET) {
      missingCritical.push('JWT_SECRET and JWT_REFRESH_SECRET must not be identical');
    }

    if (missingCritical.length > 0) {
      console.error('\n[ENV WARNING] Missing or weak critical environment variables in development:');
      missingCritical.forEach(item => console.error(`  - ${item}`));
    }
  }

  // Warn about optional third-party integrations
  const optionalServices = [];
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    optionalServices.push('Razorpay Payments (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET)');
  }
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    optionalServices.push('SMTP Email Delivery (SMTP_HOST, SMTP_USER, SMTP_PASS)');
  }
  if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) {
    optionalServices.push('AI Mock Interviewer (GEMINI_API_KEY or OPENAI_API_KEY)');
  }
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    optionalServices.push('Cloudinary Avatar Storage (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)');
  }

  if (optionalServices.length > 0) {
    console.log('[ENV NOTICE] The following optional services are unconfigured (will return 503 / disabled gracefully):');
    optionalServices.forEach(s => console.log(`  * ${s}`));
  } else {
    console.log('[ENV STATUS] All third-party services (Razorpay, SMTP, AI, Cloudinary) are fully configured.');
  }
};

module.exports = {
  validateEnv,
  productionEnvSchema
};
