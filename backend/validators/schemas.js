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
  name: z.string().trim().min(2, "Professional's name is required"),
  email: z.string().trim().email("Valid professional email is required").toLowerCase(),
  company: z.string().trim().min(1, 'Company name is required'),
  designation: z.string().trim().min(1, 'Designation is required'),
  experience: z.string().trim().min(1, 'Experience is required'),
  domain: z.string().optional()
});

const requestDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject', 'make_candidate']),
  rejectionReason: z.string().optional()
});

module.exports = {
  registerSchema,
  loginSchema,
  googleLoginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  acceptInviteSchema,
  updateUserSchema,
  inviteProfessionalSchema,
  requestDecisionSchema
};
