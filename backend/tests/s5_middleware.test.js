const { requireActiveProfessional } = require('../middleware/auth');

describe('S5: requireActiveProfessional Middleware Unit Tests', () => {
  let req, res, next;

  beforeEach(() => {
    req = { user: null };
    res = {
      statusCode: null,
      jsonData: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.jsonData = data;
        return this;
      }
    };
    next = jest.fn();
  });

  test('Branch 1: No user returns 401', () => {
    requireActiveProfessional(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('Branch 2: Admin role bypasses checks and calls next()', () => {
    req.user = { role: 'admin' };
    requireActiveProfessional(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('Branch 3: Candidate role returns 403 forbidden', () => {
    req.user = { role: 'candidate' };
    requireActiveProfessional(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('Branch 4: Invited accountStatus returns 403', () => {
    req.user = { role: 'professional', accountStatus: 'invited' };
    requireActiveProfessional(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(res.jsonData.accountStatus).toBe('invited');
    expect(next).not.toHaveBeenCalled();
  });

  test('Branch 5: Pending accountStatus or approvalStatus returns 403', () => {
    req.user = { role: 'professional', accountStatus: 'pending' };
    requireActiveProfessional(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(res.jsonData.accountStatus).toBe('pending');
    expect(next).not.toHaveBeenCalled();

    res.statusCode = null;
    res.jsonData = null;
    req.user = { role: 'professional', accountStatus: 'active', approvalStatus: 'pending' };
    requireActiveProfessional(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(res.jsonData.accountStatus).toBe('pending');
    expect(next).not.toHaveBeenCalled();
  });

  test('Branch 6: Rejected approvalStatus returns 403', () => {
    req.user = { role: 'professional', approvalStatus: 'rejected' };
    requireActiveProfessional(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(res.jsonData.accountStatus).toBe('rejected');
    expect(next).not.toHaveBeenCalled();
  });

  test('Branch 7: Deactivated accountStatus returns 403 without ReferenceError', () => {
    req.user = { role: 'professional', accountStatus: 'deactivated', isDeactivated: false };
    requireActiveProfessional(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(res.jsonData.accountStatus).toBe('deactivated');
    expect(next).not.toHaveBeenCalled();
  });

  test('Branch 8: isDeactivated=true returns 403 without ReferenceError', () => {
    req.user = { role: 'professional', accountStatus: 'active', isDeactivated: true };
    requireActiveProfessional(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(res.jsonData.accountStatus).toBe('deactivated');
    expect(next).not.toHaveBeenCalled();
  });

  test('Branch 9: Unverified isVerified=false returns 403', () => {
    req.user = { role: 'professional', accountStatus: 'active', approvalStatus: 'approved', isVerified: false, isDeactivated: false };
    requireActiveProfessional(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(res.jsonData.isVerified).toBe(false);
    expect(next).not.toHaveBeenCalled();
  });

  test('Branch 10: Active, verified, approved professional passes and calls next()', () => {
    req.user = {
      role: 'professional',
      accountStatus: 'active',
      approvalStatus: 'approved',
      isVerified: true,
      isDeactivated: false
    };
    requireActiveProfessional(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
