const request = require('supertest');
const mongoose = require('mongoose');
const { connectTestDB, closeTestDB, clearTestDB } = require('./setup');
const { app } = require('../server');
const User = require('../models/User');
const { generateAccessToken } = require('../middleware/auth');

describe('S1: Token Leak & Public Field Allow-list Tests', () => {
  let candidateUser, professionalUser, adminUser, inactiveProfessional;
  let candidateToken, adminToken;

  beforeAll(async () => {
    await connectTestDB();
  }, 120000);

  afterAll(async () => {
    await closeTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();

    // 1. Candidate User with reset token
    candidateUser = await User.create({
      name: 'Alice Candidate',
      email: 'alice@example.com',
      password: 'Password123!',
      role: 'candidate',
      accountStatus: 'active',
      isVerified: true,
      resetPasswordToken: 'plaintext-secret-token-alice',
      resetPasswordExpires: new Date(Date.now() + 3600000),
      emailVerificationToken: 'plaintext-verify-token-alice',
      emailVerificationExpires: new Date(Date.now() + 3600000)
    });

    // 2. Active Verified Professional with invitation token
    professionalUser = await User.create({
      name: 'Bob Interviewer',
      email: 'bob@example.com',
      password: 'Password123!',
      role: 'professional',
      accountStatus: 'active',
      approvalStatus: 'approved',
      isVerified: true,
      hourlyRate: 150,
      skills: ['React', 'Node.js'],
      title: 'Senior Engineer',
      invitationToken: 'plaintext-invite-token-bob',
      invitationExpires: new Date(Date.now() + 3600000)
    });

    // 3. Inactive/Unverified Professional (should NOT appear in candidate search)
    inactiveProfessional = await User.create({
      name: 'Charlie Inactive',
      email: 'charlie@example.com',
      password: 'Password123!',
      role: 'professional',
      accountStatus: 'pending',
      approvalStatus: 'pending',
      isVerified: false,
      hourlyRate: 100
    });

    // 4. Admin User
    adminUser = await User.create({
      name: 'Admin User',
      email: 'admin@interviewpro.com',
      password: 'AdminPassword123!',
      role: 'admin',
      isVerified: true
    });

    candidateToken = generateAccessToken(candidateUser);
    adminToken = generateAccessToken(adminUser);
  });

  test('1. Candidate querying GET /api/users does NOT see other candidates or inactive professionals', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${candidateToken}`);

    expect(res.status).toBe(200);
    const users = Array.isArray(res.body) ? res.body : (res.body.data || []);
    
    // Must only contain Bob, not Alice and not Charlie
    const userIds = users.map(u => u._id.toString());
    expect(userIds).toContain(professionalUser._id.toString());
    expect(userIds).not.toContain(candidateUser._id.toString());
    expect(userIds).not.toContain(inactiveProfessional._id.toString());
  });

  test('2. Candidate querying GET /api/users does NOT receive email or tokens of professionals', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${candidateToken}`);

    expect(res.status).toBe(200);
    const users = Array.isArray(res.body) ? res.body : (res.body.data || []);
    expect(users.length).toBeGreaterThan(0);

    for (const u of users) {
      expect(u.email).toBeUndefined();
      expect(u.resetPasswordToken).toBeUndefined();
      expect(u.emailVerificationToken).toBeUndefined();
      expect(u.invitationToken).toBeUndefined();
      expect(u.password).toBeUndefined();
    }
  });

  test('3. Candidate querying GET /api/users/:id for another candidate is forbidden/not found', async () => {
    const anotherCandidate = await User.create({
      name: 'David Candidate',
      email: 'david@example.com',
      password: 'Password123!',
      role: 'candidate',
      accountStatus: 'active'
    });

    const res = await request(app)
      .get(`/api/users/${anotherCandidate._id}`)
      .set('Authorization', `Bearer ${candidateToken}`);

    // Must not disclose candidate profiles to other candidates
    expect([403, 404]).toContain(res.status);
  });

  test('4. Candidate querying GET /api/users/:id for professional does NOT receive email or tokens', async () => {
    const res = await request(app)
      .get(`/api/users/${professionalUser._id}`)
      .set('Authorization', `Bearer ${candidateToken}`);

    expect(res.status).toBe(200);
    const u = res.body.data || res.body;
    expect(u._id.toString()).toBe(professionalUser._id.toString());
    expect(u.name).toBe('Bob Interviewer');
    expect(u.email).toBeUndefined();
    expect(u.resetPasswordToken).toBeUndefined();
    expect(u.emailVerificationToken).toBeUndefined();
    expect(u.invitationToken).toBeUndefined();
    expect(u.password).toBeUndefined();
  });

  test('5. Admin querying GET /api/users gets paginated results and can search', async () => {
    const res = await request(app)
      .get('/api/users?search=Candidate')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const data = res.body.data || res.body;
    expect(data.length).toBeGreaterThanOrEqual(1);
    // Tokens must still not be leaked in API responses
    for (const u of data) {
      expect(u.resetPasswordToken).toBeUndefined();
      expect(u.emailVerificationToken).toBeUndefined();
      expect(u.invitationToken).toBeUndefined();
      expect(u.password).toBeUndefined();
    }
  });

  test('6. User querying GET /api/users/:id for self gets own profile with email, but never tokens or password', async () => {
    const res = await request(app)
      .get(`/api/users/${candidateUser._id}`)
      .set('Authorization', `Bearer ${candidateToken}`);

    expect(res.status).toBe(200);
    const u = res.body.data || res.body;
    expect(u.email).toBe('alice@example.com');
    expect(u.resetPasswordToken).toBeUndefined();
    expect(u.emailVerificationToken).toBeUndefined();
    expect(u.password).toBeUndefined();
  });
});
