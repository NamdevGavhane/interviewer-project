const { z } = require('zod');

// Auth Schemas
const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  email: z.string().trim().email('Invalid email address').toLowerCase(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  title: z.string().optional(),
  bio: z.string().optional(),
  skills: z.union([z.array(z.string()), z.string()]).optional(),
  avatar: z.string().optional()
});

const loginSchema = z.object({
  email: z.string().trim().email('Invalid email address').toLowerCase(),
  password: z.string().min(1, 'Password is required')
});

const googleLoginSchema = z.object({
  credential: z.string().min(1, 'Google ID token credential is required')
});

const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Invalid email address').toLowerCase()
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z.string().min(8, 'New password must be at least 8 characters')
});

const acceptInviteSchema = z.object({
  token: z.string().min(1, 'Invitation token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters')
});

// User Profile Update Schema
const updateUserSchema = z.object({
  name: z.string().trim().min(2).optional(),
  title: z.string().optional(),
  designation: z.string().optional(),
  company: z.string().optional(),
  domain: z.string().optional(),
  bio: z.string().optional(),
  skills: z.array(z.string()).optional(),
  experience: z.string().optional(),
  linkedin: z.string().optional(),
  avatar: z.string().optional()
});

// Admin Schemas
const inviteProfessionalSchema = z.object({
  name: z.string().trim().optional().default('Professional Interviewer'),
  email: z.string().trim().email("Valid professional email is required").toLowerCase(),
  company: z.string().trim().optional().default('Tech Org'),
  designation: z.string().trim().optional().default('Technical Interviewer'),
  experience: z.string().trim().optional().default('5+ Years'),
  domain: z.string().optional().default('General Software')
});

const requestDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject', 'make_candidate']),
  rejectionReason: z.string().optional()
});

const registerProfessionalSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100, 'Name must be at most 100 characters'),
  email: z.string().trim().email('Invalid email address').toLowerCase().max(254, 'Email must be at most 254 characters'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128, 'Password must be at most 128 characters'),
  company: z.string().trim().min(1, 'Company is required').max(100, 'Company must be at most 100 characters'),
  designation: z.string().trim().min(1, 'Designation is required').max(100, 'Designation must be at most 100 characters'),
  experience: z.string().trim().min(1, 'Experience is required').max(50, 'Experience must be at most 50 characters'),
  domain: z.string().trim().max(100, 'Domain must be at most 100 characters').optional(),
  linkedin: z.string().trim().refine((val) => {
    try {
      const url = new URL(val);
      if (url.protocol !== 'https:') return false;
      const host = url.hostname.toLowerCase();
      return host === 'linkedin.com' || host.endsWith('.linkedin.com');
    } catch {
      return false;
    }
  }, 'Valid LinkedIn URL is required (must start with https:// and be on linkedin.com)'),
  bio: z.string().trim().max(500, 'Bio must be at most 500 characters').optional(),
}).strict();

module.exports = {
  registerSchema,
  loginSchema,
  googleLoginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  acceptInviteSchema,
  updateUserSchema,
  inviteProfessionalSchema,
  requestDecisionSchema,
  registerProfessionalSchema
};

