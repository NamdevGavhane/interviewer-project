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
    const errorMsg = `[MAIL ERROR] SMTP is not configured in environment variables. Email to "${to}" was not sent.`;
    console.warn(errorMsg);
    if (process.env.NODE_ENV === 'production') {
      const err = new Error('SMTP service unconfigured. Unable to deliver transactional email in production.');
      err.statusCode = 503;
      throw err;
    }
    return { sent: false, error: 'SMTP not configured in environment variables' };
  }

  const from = process.env.SMTP_FROM || `"DevSphere" <${process.env.SMTP_USER}>`;

  const info = await transporter.sendMail({
    from,
    to,
    subject,
    text: text || '',
    html,
  });

  return { sent: true, messageId: info.messageId };
};

const emailHeader = (title, subtitle, bgGradient = 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)') => `
  <div style="background: ${bgGradient}; padding: 28px; text-align: center; color: white;">
    <h1 style="margin: 0; font-size: 22px;">${title}</h1>
    ${subtitle ? `<p style="margin: 6px 0 0; opacity: 0.9; font-size: 14px;">${subtitle}</p>` : ''}
  </div>
`;

const emailContainer = (content, header) => `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    ${header}
    <div style="padding: 28px; color: #1e293b;">
      ${content}
    </div>
    <div style="background: #f8fafc; padding: 16px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
      © ${new Date().getFullYear()} DevSphere. All rights reserved.
    </div>
  </div>
`;

/**
 * Send Email Verification link to new user
 */
const sendVerificationEmail = async ({ name, email, token, frontendBaseUrl = 'http://localhost:5173' }) => {
  const cleanBaseUrl = frontendBaseUrl.replace(/\/+$/, '');
  const verificationLink = `${cleanBaseUrl}/verify-email?token=${encodeURIComponent(token)}`;
  const subject = 'Verify Your Email Address - DevSphere';

  const content = `
    <p style="font-size: 16px;">Hello <strong>${name}</strong>,</p>
    <p style="font-size: 14px; line-height: 1.6; color: #475569;">
      Thank you for creating an account on DevSphere. Please verify your email address to activate your full account access and receive interview notifications.
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
  `;

  return sendEmail({
    to: email,
    subject,
    html: emailContainer(content, emailHeader('Welcome to DevSphere', 'Confirm your email address')),
    text: `Verify your email: ${verificationLink}`
  });
};

/**
 * Send Password Reset link
 */
const sendPasswordResetEmail = async ({ name, email, token, frontendBaseUrl = 'http://localhost:5173' }) => {
  const cleanBaseUrl = frontendBaseUrl.replace(/\/+$/, '');
  const resetLink = `${cleanBaseUrl}/reset-password?token=${encodeURIComponent(token)}`;
  const subject = 'Password Reset Request - DevSphere';

  const content = `
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
  `;

  return sendEmail({
    to: email,
    subject,
    html: emailContainer(content, emailHeader('Reset Your Password', 'DevSphere Security', 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)')),
    text: `Reset your password: ${resetLink}`
  });
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
  const subject = `Exclusive Invitation: Join DevSphere as a Professional Interviewer`;

  const content = `
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
  `;

  return sendEmail({
    to: email,
    subject,
    html: emailContainer(content, emailHeader('DevSphere', 'Official Professional Invitation')),
    text: `Accept invitation: ${invitationLink}`
  });
};

/**
 * Send Booking Confirmation email to candidate or interviewer
 */
const sendBookingConfirmationEmail = async ({
  recipientName,
  recipientEmail,
  otherPartyName,
  isCandidate,
  topic,
  date,
  timeSlot,
  interviewId,
  frontendBaseUrl = 'http://localhost:5173'
}) => {
  const cleanBaseUrl = frontendBaseUrl.replace(/\/+$/, '');
  const sessionLink = `${cleanBaseUrl}/interviews`;
  const subject = `Booking Confirmed: Mock Interview on ${topic} - DevSphere`;

  const content = `
    <p style="font-size: 16px;">Hello <strong>${recipientName}</strong>,</p>
    <p style="font-size: 14px; line-height: 1.6; color: #475569;">
      ${isCandidate
        ? `Your mock technical interview session with <strong>${otherPartyName}</strong> has been successfully confirmed and scheduled.`
        : `A new technical interview session with candidate <strong>${otherPartyName}</strong> has been scheduled and confirmed.`
      }
    </p>
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 13px; line-height: 1.8;">
      <div><strong>Topic:</strong> ${topic}</div>
      <div><strong>Date:</strong> ${date}</div>
      <div><strong>Time Slot:</strong> ${timeSlot}</div>
      <div><strong>${isCandidate ? 'Interviewer' : 'Candidate'}:</strong> ${otherPartyName}</div>
      <div><strong>Session ID:</strong> ${interviewId}</div>
    </div>
    <div style="text-align: center; margin: 28px 0;">
      <a href="${sessionLink}" style="background: #4f46e5; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">
        View Your Interviews
      </a>
    </div>
    <p style="font-size: 12px; color: #94a3b8;">
      You will receive reminder alerts 24 hours and 1 hour before the session starts.
    </p>
  `;

  return sendEmail({
    to: recipientEmail,
    subject,
    html: emailContainer(content, emailHeader('Booking Confirmed', `Scheduled for ${date}`)),
    text: `Booking confirmed: ${topic} on ${date} at ${timeSlot}. View details: ${sessionLink}`
  });
};

/**
 * Send 24h or 1h Reminder email
 */
const sendInterviewReminderEmail = async ({
  recipientName,
  recipientEmail,
  otherPartyName,
  isCandidate,
  topic,
  date,
  timeSlot,
  interviewId,
  hoursNotice = '24',
  frontendBaseUrl = 'http://localhost:5173'
}) => {
  const cleanBaseUrl = frontendBaseUrl.replace(/\/+$/, '');
  const roomRole = isCandidate ? 'candidate' : 'interviewer';
  const roomLink = `${cleanBaseUrl}/room?interviewId=${interviewId}&role=${roomRole}`;
  const subject = `[Reminder - ${hoursNotice}h] Mock Interview: ${topic} - DevSphere`;

  const content = `
    <p style="font-size: 16px;">Hello <strong>${recipientName}</strong>,</p>
    <p style="font-size: 14px; line-height: 1.6; color: #475569;">
      This is a reminder that your mock technical interview on <strong>${topic}</strong> with <strong>${otherPartyName}</strong> starts in approximately <strong>${hoursNotice} hour${hoursNotice === '1' ? '' : 's'}</strong>.
    </p>
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 13px; line-height: 1.8;">
      <div><strong>Date:</strong> ${date}</div>
      <div><strong>Time Slot:</strong> ${timeSlot}</div>
      <div><strong>Partner:</strong> ${otherPartyName}</div>
    </div>
    <p style="font-size: 13px; color: #475569;">
      Please ensure you have a quiet environment, stable internet connection, and working camera/microphone ready.
    </p>
    <div style="text-align: center; margin: 28px 0;">
      <a href="${roomLink}" style="background: #10b981; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">
        Enter Meeting Room
      </a>
    </div>
  `;

  return sendEmail({
    to: recipientEmail,
    subject,
    html: emailContainer(content, emailHeader(`Interview in ${hoursNotice} Hour${hoursNotice === '1' ? '' : 's'}`, 'DevSphere Session Alert', 'linear-gradient(135deg, #059669 0%, #10b981 100%)')),
    text: `Interview reminder: Your session starts in ${hoursNotice} hours (${date} ${timeSlot}). Join here: ${roomLink}`
  });
};

/**
 * Send Cancellation Email
 */
const sendCancellationEmail = async ({
  recipientName,
  recipientEmail,
  topic,
  date,
  timeSlot,
  reason,
  cancelledByName,
  refundAmount = 0,
  frontendBaseUrl = 'http://localhost:5173'
}) => {
  const cleanBaseUrl = frontendBaseUrl.replace(/\/+$/, '');
  const dashboardLink = `${cleanBaseUrl}/interviews`;
  const subject = `Interview Cancelled: ${topic} - DevSphere`;

  const content = `
    <p style="font-size: 16px;">Hello <strong>${recipientName}</strong>,</p>
    <p style="font-size: 14px; line-height: 1.6; color: #475569;">
      The mock interview session for <strong>${topic}</strong> scheduled on <strong>${date}</strong> (${timeSlot}) has been cancelled by <strong>${cancelledByName}</strong>.
    </p>
    ${reason ? `
      <div style="background: #fef2f2; border: 1px solid #fee2e2; border-radius: 8px; padding: 14px; margin: 18px 0; font-size: 13px; color: #991b1b;">
        <strong>Cancellation Reason:</strong> ${reason}
      </div>
    ` : ''}
    ${refundAmount > 0 ? `
      <p style="font-size: 14px; color: #047857; font-weight: 600;">
        A refund of ₹${refundAmount} has been initiated and will credit to your original payment method according to your bank's processing timeline (usually 3-7 business days).
      </p>
    ` : ''}
    <div style="text-align: center; margin: 28px 0;">
      <a href="${dashboardLink}" style="background: #4f46e5; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">
        View Interview Dashboard
      </a>
    </div>
  `;

  return sendEmail({
    to: recipientEmail,
    subject,
    html: emailContainer(content, emailHeader('Interview Cancelled', `Session on ${date}`, 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)')),
    text: `Interview cancelled: ${topic} on ${date} (${timeSlot}). Reason: ${reason || 'N/A'}`
  });
};

/**
 * Send Refund Processed Email
 */
const sendRefundProcessedEmail = async ({
  recipientName,
  recipientEmail,
  topic,
  refundAmount,
  refundId,
  frontendBaseUrl = 'http://localhost:5173'
}) => {
  const cleanBaseUrl = frontendBaseUrl.replace(/\/+$/, '');
  const historyLink = `${cleanBaseUrl}/payment-history`;
  const subject = `Refund Processed (₹${refundAmount}) - DevSphere`;

  const content = `
    <p style="font-size: 16px;">Hello <strong>${recipientName}</strong>,</p>
    <p style="font-size: 14px; line-height: 1.6; color: #475569;">
      Your refund for the interview on <strong>${topic}</strong> has been successfully processed through Razorpay.
    </p>
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 13px; line-height: 1.8;">
      <div><strong>Refund Amount:</strong> ₹${refundAmount}</div>
      <div><strong>Refund ID:</strong> ${refundId}</div>
      <div><strong>Status:</strong> Processed</div>
    </div>
    <div style="text-align: center; margin: 28px 0;">
      <a href="${historyLink}" style="background: #4f46e5; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">
        View Payment History
      </a>
    </div>
  `;

  return sendEmail({
    to: recipientEmail,
    subject,
    html: emailContainer(content, emailHeader('Refund Processed', `₹${refundAmount} credited`, 'linear-gradient(135deg, #059669 0%, #10b981 100%)')),
    text: `Refund processed: ₹${refundAmount} for ${topic}. Refund ID: ${refundId}`
  });
};

/**
 * Send Feedback Published Email
 */
const sendFeedbackPublishedEmail = async ({
  candidateName,
  candidateEmail,
  interviewerName,
  topic,
  overallScore,
  interviewId,
  frontendBaseUrl = 'http://localhost:5173'
}) => {
  const cleanBaseUrl = frontendBaseUrl.replace(/\/+$/, '');
  const reportLink = `${cleanBaseUrl}/feedback/${interviewId}`;
  const subject = `Your Interview Evaluation is Ready! (${overallScore}/100) - DevSphere`;

  const content = `
    <p style="font-size: 16px;">Hello <strong>${candidateName}</strong>,</p>
    <p style="font-size: 14px; line-height: 1.6; color: #475569;">
      Great news! <strong>${interviewerName}</strong> has submitted comprehensive evaluation and technical feedback for your interview session on <strong>${topic}</strong>.
    </p>
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
      <div style="font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 600;">Overall Technical Score</div>
      <div style="font-size: 36px; font-weight: 800; color: #4f46e5; margin: 8px 0;">${overallScore}<span style="font-size: 18px; color: #94a3b8;">/100</span></div>
    </div>
    <p style="font-size: 13px; color: #475569;">
      Log in to read the complete breakdown, strengths, areas for improvement, and leave a review for your interviewer.
    </p>
    <div style="text-align: center; margin: 28px 0;">
      <a href="${reportLink}" style="background: #4f46e5; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">
        View Full Feedback Report
      </a>
    </div>
  `;

  return sendEmail({
    to: candidateEmail,
    subject,
    html: emailContainer(content, emailHeader('Feedback Published', 'Comprehensive Scorecard Ready')),
    text: `Your feedback for ${topic} is ready (Score: ${overallScore}/100). View report: ${reportLink}`
  });
};

/**
 * Send Payout Processed Email
 */
const sendPayoutProcessedEmail = async ({
  professionalName,
  professionalEmail,
  amount,
  status,
  referenceId,
  frontendBaseUrl = 'http://localhost:5173'
}) => {
  const cleanBaseUrl = frontendBaseUrl.replace(/\/+$/, '');
  const earningsLink = `${cleanBaseUrl}/earnings`;
  const subject = `Payout ${status === 'paid' ? 'Completed' : 'Status Update'}: ₹${amount} - DevSphere`;

  const content = `
    <p style="font-size: 16px;">Hello <strong>${professionalName}</strong>,</p>
    <p style="font-size: 14px; line-height: 1.6; color: #475569;">
      Your payout request for <strong>₹${amount}</strong> has been updated to: <strong>${status.toUpperCase()}</strong>.
    </p>
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 13px; line-height: 1.8;">
      <div><strong>Amount:</strong> ₹${amount}</div>
      <div><strong>Status:</strong> ${status.toUpperCase()}</div>
      ${referenceId ? `<div><strong>Transfer Reference ID:</strong> ${referenceId}</div>` : ''}
    </div>
    <div style="text-align: center; margin: 28px 0;">
      <a href="${earningsLink}" style="background: #4f46e5; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">
        View Earnings Dashboard
      </a>
    </div>
  `;

  return sendEmail({
    to: professionalEmail,
    subject,
    html: emailContainer(content, emailHeader(`Payout ${status.toUpperCase()}`, `₹${amount}`, status === 'paid' ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)' : 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)')),
    text: `Payout ${status}: ₹${amount}. Reference: ${referenceId || 'N/A'}`
  });
};

module.exports = {
  isSmtpConfigured,
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendProfessionalInvitationEmail,
  sendBookingConfirmationEmail,
  sendInterviewReminderEmail,
  sendCancellationEmail,
  sendRefundProcessedEmail,
  sendFeedbackPublishedEmail,
  sendPayoutProcessedEmail
};
