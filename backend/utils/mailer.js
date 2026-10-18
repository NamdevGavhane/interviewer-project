const nodemailer = require('nodemailer');

const isSmtpConfigured = () => {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
};

const getTransporter = () => {
  if (!isSmtpConfigured()) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

const sendEmail = async ({ to, subject, html, text }) => {
  const transporter = getTransporter();

  if (!transporter) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SMTP email service is not configured. Cannot send email.');
    } else {
      console.warn(`[DEV MAIL NOTICE] SMTP not configured. Email to "${to}" was not sent.`);
      return { sent: false, error: 'SMTP not configured in environment' };
    }
  }

  const from = process.env.SMTP_FROM || `"InterviewPro" <${process.env.SMTP_USER}>`;

  const info = await transporter.sendMail({
    from,
    to,
    subject,
    text: text || '',
    html,
  });

  return { sent: true, messageId: info.messageId };
};

/**
 * Send Email Verification link to new user
 */
const sendVerificationEmail = async ({ name, email, token, frontendBaseUrl = 'http://localhost:5173' }) => {
  const cleanBaseUrl = frontendBaseUrl.replace(/\/+$/, '');
  const verificationLink = `${cleanBaseUrl}/verify-email?token=${encodeURIComponent(token)}`;

  const subject = 'Verify Your Email Address - InterviewPro';
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 28px; text-align: center; color: white;">
        <h1 style="margin: 0; font-size: 22px;">Welcome to InterviewPro</h1>
        <p style="margin: 6px 0 0; opacity: 0.9; font-size: 14px;">Confirm your email address</p>
      </div>
      <div style="padding: 28px; color: #1e293b;">
        <p style="font-size: 16px;">Hello <strong>${name}</strong>,</p>
        <p style="font-size: 14px; line-height: 1.6; color: #475569;">
          Thank you for creating an account on InterviewPro. Please verify your email address to activate your full account access and receive interview notifications.
        </p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${verificationLink}" style="background: #4f46e5; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">
            Verify Email Address
          </a>
        </div>
        <p style="font-size: 12px; color: #94a3b8; word-break: break-all;">
          Or copy and paste this link into your browser:<br/>
          <a href="${verificationLink}" style="color: #4f46e5;">${verificationLink}</a>
        </p>
        <p style="font-size: 12px; color: #94a3b8;">This link will expire in 24 hours.</p>
      </div>
    </div>
  `;

  return sendEmail({ to: email, subject, html, text: `Verify your email: ${verificationLink}` });
};

/**
 * Send Password Reset link
 */
const sendPasswordResetEmail = async ({ name, email, token, frontendBaseUrl = 'http://localhost:5173' }) => {
  const cleanBaseUrl = frontendBaseUrl.replace(/\/+$/, '');
  const resetLink = `${cleanBaseUrl}/reset-password?token=${encodeURIComponent(token)}`;

  const subject = 'Password Reset Request - InterviewPro';
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #ef4444 0%, #f97316 100%); padding: 28px; text-align: center; color: white;">
        <h1 style="margin: 0; font-size: 22px;">Reset Your Password</h1>
        <p style="margin: 6px 0 0; opacity: 0.9; font-size: 14px;">InterviewPro Security</p>
      </div>
      <div style="padding: 28px; color: #1e293b;">
        <p style="font-size: 16px;">Hello <strong>${name}</strong>,</p>
        <p style="font-size: 14px; line-height: 1.6; color: #475569;">
          We received a request to reset your password. Click the button below to set a new password for your account:
        </p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${resetLink}" style="background: #ef4444; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">
            Reset Password
          </a>
        </div>
        <p style="font-size: 12px; color: #94a3b8; word-break: break-all;">
          Or copy and paste this link:<br/>
          <a href="${resetLink}" style="color: #ef4444;">${resetLink}</a>
        </p>
        <p style="font-size: 12px; color: #94a3b8;">This password reset link is valid for 1 hour. If you did not make this request, please disregard this email.</p>
      </div>
    </div>
  `;

  return sendEmail({ to: email, subject, html, text: `Reset your password: ${resetLink}` });
};

/**
 * Send Professional Invitation email
 */
const sendProfessionalInvitationEmail = async ({
  name,
  email,
  company,
  designation,
  experience,
  token,
  frontendBaseUrl = 'http://localhost:5173'
}) => {
  const cleanBaseUrl = frontendBaseUrl.replace(/\/+$/, '');
  const invitationLink = `${cleanBaseUrl}/accept-invite?token=${encodeURIComponent(token)}`;

  const subject = `Exclusive Invitation: Join InterviewPro as a Professional Interviewer`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 28px; text-align: center; color: white;">
        <h1 style="margin: 0; font-size: 22px;">InterviewPro</h1>
        <p style="margin: 6px 0 0; opacity: 0.9; font-size: 14px;">Official Professional Invitation</p>
      </div>
      <div style="padding: 28px; color: #1e293b;">
        <p style="font-size: 16px;">Hello <strong>${name}</strong>,</p>
        <p style="font-size: 14px; line-height: 1.6; color: #475569;">
          You have been personally invited by the Platform Administrator to join our elite panel of verified Professional Interviewers for <strong>${company || 'Software Engineering'}</strong> (${designation || 'Specialist'}, ${experience || 'Experienced'}).
        </p>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 13px;">
          <div><strong>Email:</strong> ${email}</div>
          <div><strong>Company:</strong> ${company || 'N/A'}</div>
          <div><strong>Designation:</strong> ${designation || 'N/A'}</div>
        </div>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${invitationLink}" style="background: #4f46e5; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">
            Accept Invitation & Set Password
          </a>
        </div>
        <p style="font-size: 12px; color: #94a3b8; word-break: break-all;">
          Or copy link:<br/>
          <a href="${invitationLink}" style="color: #4f46e5;">${invitationLink}</a>
        </p>
      </div>
    </div>
  `;

  return sendEmail({ to: email, subject, html, text: `Accept invitation: ${invitationLink}` });
};

module.exports = {
  isSmtpConfigured,
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendProfessionalInvitationEmail
};
