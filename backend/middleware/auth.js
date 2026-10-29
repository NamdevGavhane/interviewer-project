const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (process.env.NODE_ENV === 'production') {
  if (!JWT_SECRET || JWT_SECRET.length < 32) {
    console.error('FATAL: JWT_SECRET environment variable is missing or shorter than 32 characters in production.');
    process.exit(1);
  }
  if (!JWT_REFRESH_SECRET || JWT_REFRESH_SECRET.length < 32) {
    console.error('FATAL: JWT_REFRESH_SECRET environment variable is missing or shorter than 32 characters in production.');
    process.exit(1);
  }
  if (JWT_SECRET === JWT_REFRESH_SECRET) {
    console.error('FATAL: JWT_SECRET and JWT_REFRESH_SECRET must be distinct secrets.');
    process.exit(1);
  }
} else if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is missing. Server must refuse to start.');
  process.exit(1);
}

/**
 * Generate short-lived Access Token (15 minutes)
 */
const generateAccessToken = (user) => {
  return jwt.sign(
    {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      accountStatus: user.accountStatus,
      isVerified: user.isVerified
    },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
};

/**
 * Generate long-lived Refresh Token (7 days)
 */
const generateRefreshToken = async (user, req = null) => {
  const token = jwt.sign(
    { id: user._id.toString() },
    JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await RefreshToken.create({
    userId: user._id,
    tokenHash,
    expiresAt,
    ipAddress: req?.ip || '',
    userAgent: req?.headers['user-agent'] || ''
  });

  return token;
};

/**
 * Set Refresh Token Cookie on response
 */
const setRefreshTokenCookie = (res, token) => {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/'
  });
};

/**
 * Clear Refresh Token Cookie on response
 */
const clearRefreshTokenCookie = (res) => {
  const isProduction = process.env.NODE_ENV === 'production';
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/'
  });
};

/**
 * Authentication Middleware:
 * STRICT JWT Bearer ONLY. Removed all x-user-id and adminUserId body/query fallbacks.
 */
const authenticate = async (req, res, next) => {
  try {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Authorization header with Bearer token missing.'
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (tokenErr) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired access token. Please refresh your token.',
        isTokenExpired: tokenErr.name === 'TokenExpiredError'
      });
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User account associated with this token does not exist.'
      });
    }

    // Check deactivated status
    if (user.isDeactivated || user.accountStatus === 'deactivated') {
      return res.status(403).json({
        success: false,
        message: 'Account has been deactivated. Access is restricted.'
      });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Authentication error: ' + err.message
    });
  }
};

/**
 * Role-based authorization middleware
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized. Authentication required.'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: This action requires [${allowedRoles.join(' or ')}] role. Current role is "${req.user.role}".`
      });
    }

    next();
  };
};

/**
 * Enforce active & verified professional requirements
 */
const requireActiveProfessional = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: Authentication required.'
    });
  }

  // Admin can always inspect or perform actions
  if (req.user.role === 'admin') {
    return next();
  }

  if (req.user.role !== 'professional') {
    return res.status(403).json({
      success: false,
      message: 'Forbidden: Access is restricted to Professional accounts.'
    });
  }

  if (req.user.accountStatus === 'invited') {
    return res.status(403).json({
      success: false,
      message: 'Account pending activation: You must open your invitation link and set your password.',
      accountStatus: 'invited'
    });
  }

  if (req.user.approvalStatus === 'rejected') {
    return res.status(403).json({
      success: false,
      message: 'Application rejected: Your professional application was not approved.',
      accountStatus: 'rejected'
    });
  }

  if (req.user.accountStatus === 'pending' || req.user.approvalStatus === 'pending') {
    return res.status(403).json({
      success: false,
      message: 'Account pending verification: Your professional account is awaiting administrator approval.',
      accountStatus: 'pending'
    });
  }

  if (req.user.isDeactivated || req.user.accountStatus === 'deactivated') {
    return res.status(403).json({
      success: false,
      message: 'Account deactivated: Your professional account has been suspended.',
      accountStatus: 'deactivated'
    });
  }

  if (!req.user.isVerified) {
    return res.status(403).json({
      success: false,
      message: 'Verification required: Your professional profile must be verified by an administrator.',
      isVerified: false
    });
  }

  next();
};

/**
 * Ownership verification middleware:
 * Ensures candidates only access their own resources, professionals their sessions, admin everything.
 */
const enforceOwnership = (resourceCandidateIdField = 'candidateId', resourceInterviewerIdField = 'interviewerId') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (req.user.role === 'admin') {
      return next();
    }

    // Attached document if already fetched
    const doc = req.resourceDoc;
    if (doc) {
      const candidateId = doc[resourceCandidateIdField]?.toString();
      const interviewerId = doc[resourceInterviewerIdField]?.toString();
      const myId = req.user._id.toString();

      if (req.user.role === 'candidate' && candidateId && candidateId !== myId) {
        return res.status(403).json({ success: false, message: 'Forbidden: You can only access your own records.' });
      }

      if (req.user.role === 'professional' && interviewerId && interviewerId !== myId) {
        return res.status(403).json({ success: false, message: 'Forbidden: You can only access your own sessions.' });
      }
    }

    next();
  };
};

module.exports = {
  JWT_SECRET,
  JWT_REFRESH_SECRET,
  generateAccessToken,
  generateRefreshToken,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  authenticate,
  requireRole,
  requireActiveProfessional,
  enforceOwnership
};
