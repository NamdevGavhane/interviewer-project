const request = require('supertest');
const mongoose = require('mongoose');

// Mock rate limiters with pass-through middleware
jest.mock('../middleware/rateLimiter', () => ({
  apiLimiter: (req, res, next) => next(),
  pollingLimiter: (req, res, next) => next(),
  authLimiter: (req, res, next) => next(),
  passwordResetLimiter: (req, res, next) => next(),
  paymentLimiter: (req, res, next) => next(),
  aiLimiter: (req, res, next) => next(),
  chatLimiter: (req, res, next) => next(),
  professionalSignupLimiter: (req, res, next) => next()
}));

// Mock mailer: every exported function is a jest.fn resolving { sent: false }
jest.mock('../utils/mailer', () => ({
  isSmtpConfigured: jest.fn().mockReturnValue(true),
  sendEmail: jest.fn().mockResolvedValue({ sent: false }),
  sendVerificationEmail: jest.fn().mockResolvedValue({ sent: false }),
  sendPasswordResetEmail: jest.fn().mockResolvedValue({ sent: false }),
  sendProfessionalInvitationEmail: jest.fn().mockResolvedValue({ sent: false }),
  sendBookingConfirmationEmail: jest.fn().mockResolvedValue({ sent: false }),
  sendInterviewReminderEmail: jest.fn().mockResolvedValue({ sent: false }),
  sendCancellationEmail: jest.fn().mockResolvedValue({ sent: false }),
  sendRefundProcessedEmail: jest.fn().mockResolvedValue({ sent: false }),
  sendFeedbackPublishedEmail: jest.fn().mockResolvedValue({ sent: false }),
  sendPayoutProcessedEmail: jest.fn().mockResolvedValue({ sent: false }),
  sendProfessionalDecisionEmail: jest.fn().mockResolvedValue({ sent: false })
}));

const { connectTestDB, closeTestDB, clearTestDB } = require('./setup');
const { app } = require('../server');
const User = require('../models/User');
const Settings = require('../models/Settings');
const Notification = require('../models/Notification');
const RefreshToken = require('../models/RefreshToken');
const { generateAccessToken } = require('../middleware/auth');
const mailer = require('../utils/mailer');

describe('R-Series: Professional Self Sign-Up & Admin Approval Workflow', () => {
  let adminUser, adminToken;
  let candidateUser, candidateToken;

  beforeAll(async () => {
    await connectTestDB();
  }, 120000);

  afterAll(async () => {
    await closeTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
    jest.clearAllMocks();

    // Default settings
    await Settings.create({
      professionalReapplyAfterDays: 30
    });

    // Create an Admin user
    adminUser = await User.create({
      name: 'System Administrator',
      email: 'admin@interviewpro.com',
      password: 'AdminPassword123!',
      role: 'admin',
      accountStatus: 'active',
      approvalStatus: 'approved',
      isVerified: true
    });
    adminToken = generateAccessToken(adminUser);

    // Create a Candidate user
    candidateUser = await User.create({
      name: 'Jane Candidate',
      email: 'candidate@interviewpro.com',
      password: 'CandidatePassword123!',
      role: 'candidate',
      accountStatus: 'active',
      approvalStatus: 'approved',
      isVerified: true
    });
    candidateToken = generateAccessToken(candidateUser);
  });

  const validSignupData = {
    name: 'Sarah Connor',
    email: 'sarah.interviewer@techcorp.com',
    password: 'SecurePassword123!',
    company: 'TechCorp Solutions',
    designation: 'Senior Distributed Systems Engineer',
    experience: '8+ years',
    domain: 'Cloud Architecture & Backend',
    linkedin: 'https://www.linkedin.com/in/sarah-connor-test',
    bio: 'Passionate about distributed consensus, high-scale database architecture, and mentoring engineers.'
  };

  test('1. signup creates a pending professional with a hashed password and no token or cookie', async () => {
    const res = await request(app)
      .post('/api/users/register-professional')
      .send(validSignupData);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe(validSignupData.email);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.token).toBeUndefined();
    expect(res.headers['set-cookie']).toBeUndefined();

    const created = await User.findOne({ email: validSignupData.email });
    expect(created).not.toBeNull();
    expect(created.role).toBe('professional');
    expect(created.accountStatus).toBe('pending');
    expect(created.approvalStatus).toBe('pending');
    expect(created.isVerified).toBe(false);
    expect(created.isEmailVerified).toBe(false);
    expect(created.appliedAt).toBeInstanceOf(Date);
    expect(created.title).toBe(validSignupData.designation);
    expect(created.availabilitySlots).toEqual([]);
    expect(created.password).not.toBe(validSignupData.password);
    expect(await created.comparePassword(validSignupData.password)).toBe(true);
  });

  test('2. role/approvalStatus/accountStatus/isVerified in the body give 400 and no user is created', async () => {
    const blockedFields = [
      { role: 'admin' },
      { approvalStatus: 'approved' },
      { accountStatus: 'active' },
      { isVerified: true }
    ];

    for (const injected of blockedFields) {
      const email = `injected_${Object.keys(injected)[0]}@techcorp.com`;
      const res = await request(app)
        .post('/api/users/register-professional')
        .send({
          ...validSignupData,
          email,
          ...injected
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Validation error/i);

      const user = await User.findOne({ email });
      expect(user).toBeNull();
    }
  });

  test('3. bad LinkedIn URLs (http, linkedin.com.evil.com, evil.com, javascript:) give 400', async () => {
    const badUrls = [
      'http://www.linkedin.com/in/sarah',
      'https://linkedin.com.evil.com/in/sarah',
      'https://evil.com/in/sarah',
      'javascript:alert(1)'
    ];

    for (const badUrl of badUrls) {
      const res = await request(app)
        .post('/api/users/register-professional')
        .send({
          ...validSignupData,
          email: `bad_linkedin_${Date.now()}@test.com`,
          linkedin: badUrl
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/LinkedIn/i);
    }
  });

  test('4. weak password, bad email, empty company and a 501 character bio give 400', async () => {
    // Weak password
    const resPass = await request(app)
      .post('/api/users/register-professional')
      .send({ ...validSignupData, email: 'p1@test.com', password: 'short' });
    expect(resPass.status).toBe(400);

    // Bad email
    const resEmail = await request(app)
      .post('/api/users/register-professional')
      .send({ ...validSignupData, email: 'not-an-email' });
    expect(resEmail.status).toBe(400);

    // Empty company
    const resCompany = await request(app)
      .post('/api/users/register-professional')
      .send({ ...validSignupData, email: 'p2@test.com', company: '   ' });
    expect(resCompany.status).toBe(400);

    // 501 character bio
    const resBio = await request(app)
      .post('/api/users/register-professional')
      .send({ ...validSignupData, email: 'p3@test.com', bio: 'a'.repeat(501) });
    expect(resBio.status).toBe(400);
  });

  test('5. duplicate email returns the same generic 409 for a candidate and an active professional', async () => {
    // 1. Attempt using existing candidate email
    const resCandidateDup = await request(app)
      .post('/api/users/register-professional')
      .send({ ...validSignupData, email: candidateUser.email });

    expect(resCandidateDup.status).toBe(409);
    expect(resCandidateDup.body.success).toBe(false);
    expect(resCandidateDup.body.message).toBe('An account with this email address already exists. Please log in.');

    // 2. Create an active professional
    const activeProf = await User.create({
      name: 'Bob Interviewer',
      email: 'bob.interviewer@techcorp.com',
      password: 'ActiveProfPassword123!',
      role: 'professional',
      accountStatus: 'active',
      approvalStatus: 'approved',
      isVerified: true
    });

    // 3. Attempt using existing active professional email
    const resProfDup = await request(app)
      .post('/api/users/register-professional')
      .send({ ...validSignupData, email: activeProf.email });

    expect(resProfDup.status).toBe(409);
    expect(resProfDup.body.success).toBe(false);
    expect(resProfDup.body.message).toBe('An account with this email address already exists. Please log in.');

    // Verify messages are 100% identical
    expect(resCandidateDup.body.message).toBe(resProfDup.body.message);
  });

  test('6. signup works when the mailer throws', async () => {
    mailer.sendEmail.mockImplementationOnce(() => {
      throw new Error('SMTP connection timed out');
    });

    const res = await request(app)
      .post('/api/users/register-professional')
      .send({ ...validSignupData, email: 'mailer_fail@techcorp.com' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('pending');
  });

  test('7. admins get exactly one notification and candidates none', async () => {
    // Create a 2nd admin to verify multi-admin dispatch
    const admin2 = await User.create({
      name: 'Admin Two',
      email: 'admin2@interviewpro.com',
      password: 'AdminPassword123!',
      role: 'admin',
      accountStatus: 'active',
      approvalStatus: 'approved',
      isVerified: true
    });

    await Notification.deleteMany({});

    const res = await request(app)
      .post('/api/users/register-professional')
      .send({ ...validSignupData, email: 'notify_test@techcorp.com' });

    expect(res.status).toBe(201);

    const admin1Notifs = await Notification.find({ userId: adminUser._id });
    const admin2Notifs = await Notification.find({ userId: admin2._id });
    const candidateNotifs = await Notification.find({ userId: candidateUser._id });

    expect(admin1Notifs).toHaveLength(1);
    expect(admin1Notifs[0].type).toBe('system');
    expect(admin1Notifs[0].link).toBe('/admin?tab=requests');

    expect(admin2Notifs).toHaveLength(1);
    expect(admin2Notifs[0].type).toBe('system');
    expect(admin2Notifs[0].link).toBe('/admin?tab=requests');

    expect(candidateNotifs).toHaveLength(0);
  });

  test('8. pending login gives 403 pendingApproval', async () => {
    await request(app)
      .post('/api/users/register-professional')
      .send(validSignupData);

    const res = await request(app)
      .post('/api/users/login')
      .send({
        email: validSignupData.email,
        password: validSignupData.password
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.pendingApproval).toBe(true);
    expect(res.body.message).toBe('Your professional application is awaiting administrator approval. You will be able to sign in once it is approved.');
  });

  test('9. pending and rejected users are hidden from the candidate professional list and profile (404)', async () => {
    // Create 1 pending applicant
    const pendingRes = await request(app)
      .post('/api/users/register-professional')
      .send(validSignupData);
    const pendingUser = await User.findOne({ email: validSignupData.email });

    // Create 1 rejected applicant
    const rejectedUser = await User.create({
      name: 'Rejected Dan',
      email: 'rejected.dan@techcorp.com',
      password: 'Password123!',
      role: 'professional',
      accountStatus: 'pending',
      approvalStatus: 'rejected',
      isVerified: false,
      rejectionReason: 'Does not meet experience criteria'
    });

    // 1. Candidate views professionals list
    const listRes = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${candidateToken}`);

    expect(listRes.status).toBe(200);
    const userIds = listRes.body.data.map(u => u._id.toString());
    expect(userIds).not.toContain(pendingUser._id.toString());
    expect(userIds).not.toContain(rejectedUser._id.toString());

    // 2. Candidate queries individual profile by ID
    const pendingProfileRes = await request(app)
      .get(`/api/users/${pendingUser._id}`)
      .set('Authorization', `Bearer ${candidateToken}`);
    expect(pendingProfileRes.status).toBe(404);

    const rejectedProfileRes = await request(app)
      .get(`/api/users/${rejectedUser._id}`)
      .set('Authorization', `Bearer ${candidateToken}`);
    expect(rejectedProfileRes.status).toBe(404);
  });

  test('10. a token for a pending or rejected professional gets 403 on /api/users/me', async () => {
    const pendingProf = await User.create({
      name: 'Pending Paul',
      email: 'paul.pending@techcorp.com',
      password: 'Password123!',
      role: 'professional',
      accountStatus: 'pending',
      approvalStatus: 'pending',
      isVerified: false
    });
    const pendingToken = generateAccessToken(pendingProf);

    const rejectedProf = await User.create({
      name: 'Rejected Rita',
      email: 'rita.rejected@techcorp.com',
      password: 'Password123!',
      role: 'professional',
      accountStatus: 'pending',
      approvalStatus: 'rejected',
      isVerified: false
    });
    const rejectedToken = generateAccessToken(rejectedProf);

    const resPending = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${pendingToken}`);
    expect(resPending.status).toBe(403);

    const resRejected = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${rejectedToken}`);
    expect(resRejected.status).toBe(403);
  });

  test('11. a candidate or anonymous caller cannot call the decision route (403 and 401)', async () => {
    const signupRes = await request(app)
      .post('/api/users/register-professional')
      .send(validSignupData);
    const applicant = await User.findOne({ email: validSignupData.email });

    // Anonymous
    const anonRes = await request(app)
      .patch(`/api/admin/requests/${applicant._id}/decision`)
      .send({ decision: 'approve' });
    expect(anonRes.status).toBe(401);

    // Candidate
    const candidateRes = await request(app)
      .patch(`/api/admin/requests/${applicant._id}/decision`)
      .set('Authorization', `Bearer ${candidateToken}`)
      .send({ decision: 'approve' });
    expect(candidateRes.status).toBe(403);
  });

  test('12. admin Requests lists the application with linkedin and company', async () => {
    await request(app)
      .post('/api/users/register-professional')
      .send(validSignupData);

    const res = await request(app)
      .get('/api/admin/requests')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const found = res.body.data.find(r => r.email === validSignupData.email);
    expect(found).toBeDefined();
    expect(found.company).toBe(validSignupData.company);
    expect(found.linkedin).toBe(validSignupData.linkedin);
    expect(found.appliedAt).toBeDefined();
  });

  test('13. approve activates the account, stores decidedBy and decidedAt, and login then works and the user appears in the list', async () => {
    await request(app)
      .post('/api/users/register-professional')
      .send(validSignupData);
    const applicant = await User.findOne({ email: validSignupData.email });

    const decisionRes = await request(app)
      .patch(`/api/admin/requests/${applicant._id}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'approve' });

    expect(decisionRes.status).toBe(200);
    expect(decisionRes.body.success).toBe(true);

    const updated = await User.findById(applicant._id);
    expect(updated.approvalStatus).toBe('approved');
    expect(updated.accountStatus).toBe('active');
    expect(updated.isVerified).toBe(true);
    expect(updated.decidedBy.toString()).toBe(adminUser._id.toString());
    expect(updated.decidedAt).toBeInstanceOf(Date);

    // Login now works
    const loginRes = await request(app)
      .post('/api/users/login')
      .send({
        email: validSignupData.email,
        password: validSignupData.password
      });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.token).toBeDefined();

    // Appears in candidate professionals list
    const listRes = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${candidateToken}`);
    expect(listRes.status).toBe(200);
    const userIds = listRes.body.data.map(u => u._id.toString());
    expect(userIds).toContain(applicant._id.toString());
  });

  test('14. the decision still succeeds when the mailer rejects', async () => {
    mailer.sendProfessionalDecisionEmail.mockRejectedValueOnce(new Error('SMTP server connection refused'));

    await request(app)
      .post('/api/users/register-professional')
      .send({ ...validSignupData, email: 'decision_mailer_err@test.com' });
    const applicant = await User.findOne({ email: 'decision_mailer_err@test.com' });

    const decisionRes = await request(app)
      .patch(`/api/admin/requests/${applicant._id}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'approve' });

    expect(decisionRes.status).toBe(200);
    expect(decisionRes.body.success).toBe(true);
    expect(decisionRes.body.mailSent).toBe(false);

    const updated = await User.findById(applicant._id);
    expect(updated.approvalStatus).toBe('approved');
  });

  test('15. reject stores the reason and the login message contains the reason and not "awaiting"', async () => {
    await request(app)
      .post('/api/users/register-professional')
      .send(validSignupData);
    const applicant = await User.findOne({ email: validSignupData.email });

    const customReason = 'Insufficient years of experience with distributed cloud architecture';
    const decisionRes = await request(app)
      .patch(`/api/admin/requests/${applicant._id}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        decision: 'reject',
        rejectionReason: customReason
      });

    expect(decisionRes.status).toBe(200);

    const updated = await User.findById(applicant._id);
    expect(updated.approvalStatus).toBe('rejected');
    expect(updated.rejectionReason).toBe(customReason);

    // Login test
    const loginRes = await request(app)
      .post('/api/users/login')
      .send({
        email: validSignupData.email,
        password: validSignupData.password
      });

    expect(loginRes.status).toBe(403);
    expect(loginRes.body.rejected).toBe(true);
    expect(loginRes.body.message).toContain(customReason);
    expect(loginRes.body.message).not.toContain('awaiting');
    expect(loginRes.body.message).toContain('You can apply again from the Interviewer Sign Up page.');
  });

  test('16. reject without a reason stores the default', async () => {
    await request(app)
      .post('/api/users/register-professional')
      .send({ ...validSignupData, email: 'default_reason@test.com' });
    const applicant = await User.findOne({ email: 'default_reason@test.com' });

    const decisionRes = await request(app)
      .patch(`/api/admin/requests/${applicant._id}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'reject' });

    expect(decisionRes.status).toBe(200);

    const updated = await User.findById(applicant._id);
    expect(updated.approvalStatus).toBe('rejected');
    expect(updated.rejectionReason).toBe('Application criteria not met at this time.');
  });

  test('17. rejecting an approved professional revokes all refresh tokens and their old access token then gets 403', async () => {
    // 1. Create and approve professional
    await request(app)
      .post('/api/users/register-professional')
      .send(validSignupData);
    const applicant = await User.findOne({ email: validSignupData.email });
    await request(app)
      .patch(`/api/admin/requests/${applicant._id}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'approve' });

    // 2. Professional logs in to receive tokens
    const loginRes = await request(app)
      .post('/api/users/login')
      .send({
        email: validSignupData.email,
        password: validSignupData.password
      });
    expect(loginRes.status).toBe(200);
    const oldAccessToken = loginRes.body.data.token;

    // Verify unrevoked refresh tokens exist
    const initialTokens = await RefreshToken.find({ userId: applicant._id, revoked: false });
    expect(initialTokens.length).toBeGreaterThan(0);

    // 3. Admin rejects this previously approved professional
    const rejectRes = await request(app)
      .patch(`/api/admin/requests/${applicant._id}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'reject', rejectionReason: 'Policy violation reported' });
    expect(rejectRes.status).toBe(200);

    // 4. Verify all refresh tokens are revoked
    const remainingUnrevoked = await RefreshToken.find({ userId: applicant._id, revoked: false });
    expect(remainingUnrevoked).toHaveLength(0);

    // 5. Old access token now gets 403 on /api/users/me
    const meRes = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${oldAccessToken}`);
    expect(meRes.status).toBe(403);
  });

  test('18. re-apply is blocked inside the waiting period, needs the original password, and works after the period', async () => {
    // 1. Signup and reject
    await request(app)
      .post('/api/users/register-professional')
      .send(validSignupData);
    const applicant = await User.findOne({ email: validSignupData.email });

    await request(app)
      .patch(`/api/admin/requests/${applicant._id}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'reject', rejectionReason: 'Need more senior experience' });

    // 2. Re-apply with WRONG password gives generic 409
    const wrongPassRes = await request(app)
      .post('/api/users/register-professional')
      .send({
        ...validSignupData,
        password: 'IncorrectPassword999!'
      });
    expect(wrongPassRes.status).toBe(409);
    expect(wrongPassRes.body.message).toBe('An account with this email address already exists. Please log in.');

    // 3. Re-apply with correct password inside waiting period gives 403 with canReapplyAfter
    const earlyRes = await request(app)
      .post('/api/users/register-professional')
      .send(validSignupData);
    expect(earlyRes.status).toBe(403);
    expect(earlyRes.body.canReapplyAfter).toBeDefined();

    // 4. Advance decidedAt by 31 days (outside 30-day period)
    await User.findByIdAndUpdate(applicant._id, {
      decidedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
    });
    await Notification.deleteMany({});

    // 5. Re-apply succeeds after waiting period
    const reapplyRes = await request(app)
      .post('/api/users/register-professional')
      .send({
        ...validSignupData,
        company: 'New Elite Tech',
        experience: '9+ years',
        bio: 'Updated bio with additional system design credentials.'
      });

    expect(reapplyRes.status).toBe(200);
    expect(reapplyRes.body.success).toBe(true);
    expect(reapplyRes.body.data.status).toBe('pending');

    const reloaded = await User.findById(applicant._id);
    expect(reloaded.approvalStatus).toBe('pending');
    expect(reloaded.accountStatus).toBe('pending');
    expect(reloaded.isVerified).toBe(false);
    expect(reloaded.rejectionReason).toBe('');
    expect(reloaded.decidedAt).toBeUndefined();
    expect(reloaded.decidedBy).toBeUndefined();
    expect(reloaded.company).toBe('New Elite Tech');

    // Admin notified again
    const adminNotifs = await Notification.find({ userId: adminUser._id });
    expect(adminNotifs).toHaveLength(1);
  });

  test('19. professionalReapplyAfterDays = 0 allows immediate re-apply', async () => {
    await Settings.findOneAndUpdate({}, { professionalReapplyAfterDays: 0 });

    await request(app)
      .post('/api/users/register-professional')
      .send({ ...validSignupData, email: 'zero_days@test.com' });
    const applicant = await User.findOne({ email: 'zero_days@test.com' });

    await request(app)
      .patch(`/api/admin/requests/${applicant._id}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'reject', rejectionReason: 'Try immediately with corrected LinkedIn' });

    // Immediate re-application with zero days setting
    const res = await request(app)
      .post('/api/users/register-professional')
      .send({
        ...validSignupData,
        email: 'zero_days@test.com',
        company: 'Immediate Updated Corp'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const reloaded = await User.findById(applicant._id);
    expect(reloaded.approvalStatus).toBe('pending');
    expect(reloaded.company).toBe('Immediate Updated Corp');
  });

  test('20. the existing POST /api/admin/invite-professional still creates an invited professional', async () => {
    const inviteData = {
      name: 'Invited Expert',
      email: 'invited.expert@enterprise.com',
      company: 'Enterprise Systems',
      designation: 'Principal Architect',
      experience: '12+ years',
      domain: 'System Design'
    };

    const res = await request(app)
      .post('/api/admin/invite-professional')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(inviteData);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const created = await User.findOne({ email: inviteData.email });
    expect(created).not.toBeNull();
    expect(created.role).toBe('professional');
    expect(created.accountStatus).toBe('invited');
  });
});
