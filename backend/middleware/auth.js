const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'interviewpro_jwt_secret_key_2026';

/**
 * Generate a JWT token for a user
 */
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user._id, 
      email: user.email, 
      role: user.role,
      accountStatus: user.accountStatus,
      isVerified: user.isVerified 
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
};

/**
 * Authentication Middleware:
 * Verifies JWT token from Authorization header or fallback x-user-id header.
 */
const authenticate = async (req, res, next) => {
  try {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    let user = null;

    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        user = await User.findById(decoded.id);
      } catch (tokenErr) {
        // Token invalid or expired
        return res.status(401).json({ message: 'Authentication failed. Invalid or expired token.' });
      }
    } else if (req.headers['x-user-id']) {
      // Fallback for existing frontend calls using x-user-id header
      user = await User.findById(req.headers['x-user-id']);
    } else if (req.body && req.body.adminUserId) {
      // Check admin body parameter if provided
      user = await User.findById(req.body.adminUserId);
    } else if (req.query && req.query.adminUserId) {
      user = await User.findById(req.query.adminUserId);
    }

    if (!user) {
      return res.status(401).json({ message: 'Authentication required. Please log in.' });
    }

    // Check deactivated status
    if (user.isDeactivated || user.accountStatus === 'deactivated') {
      return res.status(403).json({ message: 'Account is deactivated. Access is restricted.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(500).json({ message: 'Authentication error: ' + err.message });
  }
};

/**
 * Optional Authenticate:
 * Attaches req.user if valid credentials are provided, but doesn't block if not provided.
 */
const optionalAuthenticate = async (req, res, next) => {
  try {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    let userId = null;
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.id;
      } catch (e) {}
    } else if (req.headers['x-user-id']) {
      userId = req.headers['x-user-id'];
    }

    if (userId) {
      const user = await User.findById(userId);
      if (user && !user.isDeactivated && user.accountStatus !== 'deactivated') {
        req.user = user;
      }
    }
  } catch (err) {}
  next();
};

/**
 * Role-based authorization middleware.
 * Example: requireRole('admin') or requireRole('professional', 'admin')
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized. Please sign in.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: `Forbidden: This action requires ${allowedRoles.join(' or ')} privileges. Your role is "${req.user.role}".` 
      });
    }

    next();
  };
};

/**
 * Enforce Requirement 11:
 * "Do not allow invited, pending, or deactivated accounts to access protected Professional features."
 */
const requireActiveProfessional = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized: Authentication required.' });
  }

  // Admin can inspect or bypass
  if (req.user.role === 'admin') {
    return next();
  }

  if (req.user.role !== 'professional') {
    return res.status(403).json({ 
      message: 'Forbidden: Access is restricted to Professional Interviewer accounts.' 
    });
  }

  // 1. Check if still in invited state (hasn't set password yet)
  if (req.user.accountStatus === 'invited') {
    return res.status(403).json({
      message: 'Account pending activation: You must open your invitation link and set your password before accessing professional features.',
      accountStatus: 'invited'
    });
  }

  // 2. Check if pending approval
  if (req.user.accountStatus === 'pending' || req.user.approvalStatus === 'pending') {
    return res.status(403).json({
      message: 'Account pending verification: Your professional account is awaiting administrator approval.',
      accountStatus: 'pending'
    });
  }

  // 3. Check if rejected
  if (req.user.approvalStatus === 'rejected') {
    return res.status(403).json({
      message: 'Application rejected: Your professional application was not approved.',
      accountStatus: 'rejected'
    });
  }

  // 4. Check if deactivated
  if (req.user.isDeactivated || req.user.accountStatus === 'deactivated') {
    return res.status(403).json({
      message: 'Account deactivated: Your professional account has been suspended by the administrator.',
      accountStatus: 'deactivated'
    });
  }

  // 5. Check verification requirement
  if (!req.user.isVerified) {
    return res.status(403).json({
      message: 'Verification required: Your professional profile must be verified by an administrator to access these features.',
      isVerified: false
    });
  }

  next();
};

module.exports = {
  JWT_SECRET,
  generateToken,
  authenticate,
  optionalAuthenticate,
  requireRole,
  requireActiveProfessional
};
