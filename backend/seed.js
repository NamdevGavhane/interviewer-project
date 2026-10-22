const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();
const User = require('./models/User');
const Settings = require('./models/Settings');
const InterviewConfig = require('./models/InterviewConfig');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/interviewpro';

const seedDatabase = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB for idempotent seeding...');

    // 1. Ensure Default Settings Exist (M1, M2)
    const settings = await Settings.getSettings();
    console.log('Platform settings verified:', {
      mockSessionPricePaise: settings.mockSessionPricePaise,
      interviewerSharePercent: `${settings.interviewerSharePercent}%`,
      minPayoutPaise: settings.minPayoutPaise,
      pendingPaymentMinutes: `${settings.pendingPaymentMinutes}m`,
      joinOpensMinutesBefore: `${settings.joinOpensMinutesBefore}m`,
      joinGraceMinutesAfter: `${settings.joinGraceMinutesAfter}m`,
      noShowWaitMinutes: `${settings.noShowWaitMinutes}m`
    });

    // 2. Ensure Default Interview Options Config Exists
    const config = await InterviewConfig.getConfig();
    console.log(`Interview options verified (${config.topics.length} topics, ${config.companies.length} companies).`);

    // 3. Ensure Super Admin Account Exists (Idempotent)
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminEmail || !adminEmail.includes('@')) {
      console.error('FATAL: ADMIN_EMAIL environment variable is required to seed the admin account.');
      process.exit(1);
    }

    if (!adminPassword || adminPassword.length < 12) {
      console.error('FATAL: ADMIN_PASSWORD environment variable is required and must be at least 12 characters.');
      process.exit(1);
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(adminPassword, salt);

    let admin = await User.findOne({ email: adminEmail });
    if (!admin) {
      admin = new User({
        name: 'System Administrator',
        email: adminEmail,
        password: hashedPassword,
        role: 'admin',
        approvalStatus: 'approved',
        isVerified: true,
        title: 'Platform Administrator',
        company: 'DevSphere Core',
        bio: 'Super administrator managing platform settings, interviewer verifications, and financial policies.'
      });
      await admin.save();
      console.log(`Created new Super Admin account: ${adminEmail}`);
    } else {
      admin.role = 'admin';
      admin.approvalStatus = 'approved';
      admin.isVerified = true;
      if (!admin.password.startsWith('$2')) {
        admin.password = hashedPassword;
      }
      await admin.save();
      console.log(`Super Admin verified: ${adminEmail}`);
    }

    console.log('Idempotent database initialization complete.');
    process.exit(0);
  } catch (err) {
    console.error('Error seeding database:', err);
    process.exit(1);
  }
};

seedDatabase();
