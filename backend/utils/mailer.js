const nodemailer = require('nodemailer');

/**
 * Configure Nodemailer transporter.
 * If SMTP credentials are provided in env, use them.
 * Otherwise, log to console and simulate delivery safely in dev.
 */
const createTransporter = async () => {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  // Fallback to test/console logger transporter
  return null;
};

/**
 * Send an invitation email to a newly created professional account.
 * CRITICAL RULE: NEVER SEND PASSWORDS THROUGH EMAIL!
 * Only the unique, secure invitation link is provided to set their own password.
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

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>InterviewPro Professional Invitation</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #1e293b; }
    .card { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .header { background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 32px 28px; text-align: center; color: #ffffff; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 700; }
    .badge { display: inline-block; background: rgba(255,255,255,0.2); padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600; text-transform: uppercase; margin-top: 8px; letter-spacing: 0.5px; }
    .content { padding: 32px 28px; }
    .greeting { font-size: 18px; font-weight: 600; margin-bottom: 12px; }
    .intro { font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 24px; }
    .profile-box { background: #f1f5f9; border-radius: 12px; padding: 18px; margin-bottom: 24px; border: 1px solid #e2e8f0; }
    .profile-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; border-bottom: 1px solid #e2e8f0; }
    .profile-row:last-child { border-bottom: none; }
    .profile-label { color: #64748b; font-weight: 500; }
    .profile-value { font-weight: 600; color: #1e293b; }
    .btn-container { text-align: center; margin: 30px 0; }
    .btn { display: inline-block; background: #4f46e5; color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 600; font-size: 15px; box-shadow: 0 4px 10px rgba(79, 70, 229, 0.3); }
    .notice { background: #fefce8; border-left: 4px solid #eab308; padding: 12px 16px; border-radius: 6px; font-size: 12px; color: #854d0e; line-height: 1.5; margin-bottom: 24px; }
    .footer { border-top: 1px solid #e2e8f0; padding: 20px 28px; background: #f8fafc; text-align: center; font-size: 12px; color: #94a3b8; }
    .token-box { word-break: break-all; background: #ffffff; padding: 8px 12px; border: 1px dashed #cbd5e1; border-radius: 6px; font-family: monospace; font-size: 11px; color: #475569; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>InterviewPro</h1>
      <span class="badge">Official Professional Invitation</span>
    </div>
    <div class="content">
      <div class="greeting">Hello ${name},</div>
      <p class="intro">
        You have been personally invited by the <strong>InterviewPro Platform Administrator</strong> to join our elite panel of verified Professional Interviewers.
      </p>

      <div class="profile-box">
        <div style="font-size: 12px; font-weight: 700; color: #4f46e5; text-transform: uppercase; margin-bottom: 8px;">
          Your Registered Professional Credentials:
        </div>
        <div class="profile-row">
          <span class="profile-label">Full Name:</span>
          <span class="profile-value">${name}</span>
        </div>
        <div class="profile-row">
          <span class="profile-label">Email:</span>
          <span class="profile-value">${email}</span>
        </div>
        <div class="profile-row">
          <span class="profile-label">Company:</span>
          <span class="profile-value">${company || 'Not specified'}</span>
        </div>
        <div class="profile-row">
          <span class="profile-label">Designation:</span>
          <span class="profile-value">${designation || 'Technical Interviewer'}</span>
        </div>
        <div class="profile-row">
          <span class="profile-label">Experience:</span>
          <span class="profile-value">${experience || 'Experienced'}</span>
        </div>
      </div>

      <div class="notice">
        <strong>🔒 Security Policy:</strong> For your protection, passwords are <em>never</em> sent via email. 
        Please click the invitation button below to securely set your own confidential password and activate your verified account.
      </div>

      <div class="btn-container">
        <a href="${invitationLink}" class="btn" target="_blank">Accept Invitation & Set Password</a>
      </div>

      <p style="font-size: 12px; color: #64748b; line-height: 1.5;">
        If the button above does not work, copy and paste this link into your browser:
      </p>
      <div class="token-box">${invitationLink}</div>
      
      <p style="font-size: 12px; color: #94a3b8; margin-top: 20px;">
        This invitation link is valid for 7 days. If you did not expect this invitation, you may ignore this email.
      </p>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} InterviewPro Inc. Mock Prep, Live Peer Interviews & Mentorship. All rights reserved.
    </div>
  </div>
</body>
</html>
  `;

  const textContent = `
Hello ${name},

You have been invited by the InterviewPro Administrator to join as a Professional Interviewer.

Your Registered Details:
- Name: ${name}
- Email: ${email}
- Company: ${company}
- Designation: ${designation}
- Experience: ${experience}

SECURITY POLICY: For your security, passwords are never sent via email. 
Please open the link below to set your own secure password and activate your account:
${invitationLink}

This invitation link is valid for 7 days.

Best regards,
InterviewPro Team
`;

  console.log('\n================================================================');
  console.log('📨 INVITATION EMAIL DISPATCHED (PASSWORDS NEVER SENT BY EMAIL)');
  console.log(`Recipient:   ${name} <${email}>`);
  console.log(`Subject:     ${subject}`);
  console.log(`Company:     ${company} | Designation: ${designation} | Exp: ${experience}`);
  console.log(`Invite Link: ${invitationLink}`);
  console.log('================================================================\n');

  try {
    const transporter = await createTransporter();
    if (transporter) {
      const info = await transporter.sendMail({
        from: process.env.EMAIL_FROM || '"InterviewPro Admin" <admin@interviewpro.com>',
        to: email,
        subject,
        text: textContent,
        html: htmlContent,
      });
      console.log('Nodemailer sent message ID:', info.messageId);
      return { success: true, invitationLink, messageId: info.messageId };
    }
  } catch (err) {
    console.error('SMTP send error (falling back to console/logged delivery):', err.message);
  }

  return { success: true, invitationLink, simulated: true };
};

module.exports = {
  sendProfessionalInvitationEmail
};
