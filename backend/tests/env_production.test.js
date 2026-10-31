const { spawnSync } = require('child_process');
const path = require('path');

describe('TASK A2: Production Environment Invariants', () => {
  test('starts server.js in a child process with NODE_ENV=production and missing secrets and asserts exit code 1', () => {
    const serverPath = path.resolve(__dirname, '../server.js');
    const child = spawnSync(process.execPath, [serverPath], {
      env: {
        ...process.env,
        NODE_ENV: 'production',
        JWT_SECRET: '',
        JWT_REFRESH_SECRET: '',
        FRONTEND_URL: '',
        MONGO_URI: '',
        RAZORPAY_WEBHOOK_SECRET: ''
      },
      encoding: 'utf8'
    });

    expect(child.status).toBe(1);
    const combinedOutput = (child.stderr || '') + (child.stdout || '');
    expect(combinedOutput).toMatch(/FATAL STARTUP ERROR/);
    expect(combinedOutput).toMatch(/JWT_SECRET is missing/);
    expect(combinedOutput).toMatch(/JWT_REFRESH_SECRET is missing/);
    expect(combinedOutput).toMatch(/FRONTEND_URL is missing/);
    expect(combinedOutput).toMatch(/MONGO_URI is missing/);
    expect(combinedOutput).toMatch(/RAZORPAY_WEBHOOK_SECRET is missing/);
  });

  test('starts server.js in a child process with short or identical JWT secrets and asserts exit code 1', () => {
    const serverPath = path.resolve(__dirname, '../server.js');
    const child = spawnSync(process.execPath, [serverPath], {
      env: {
        ...process.env,
        NODE_ENV: 'production',
        JWT_SECRET: 'short_secret',
        JWT_REFRESH_SECRET: 'short_secret',
        FRONTEND_URL: 'https://example.com',
        MONGO_URI: 'mongodb://localhost:27017/test',
        RAZORPAY_WEBHOOK_SECRET: 'webhook_secret_123'
      },
      encoding: 'utf8'
    });

    expect(child.status).toBe(1);
    const combinedOutput = (child.stderr || '') + (child.stdout || '');
    expect(combinedOutput).toMatch(/FATAL STARTUP ERROR/);
    expect(combinedOutput).toMatch(/JWT_SECRET is shorter than 32 characters/);
    expect(combinedOutput).toMatch(/JWT_REFRESH_SECRET is shorter than 32 characters/);
    expect(combinedOutput).toMatch(/identical to each other/);
  });
});
