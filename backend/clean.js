/**
 * Database Cleanup Utility
 * 
 * Safety guards:
 * - Refuses to run when NODE_ENV=production
 * - Requires explicit --confirm flag to execute
 * - Preserves admin account configured via process.env.ADMIN_EMAIL
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const User = require('./models/User');
const Interview = require('./models/Interview');
const Feedback = require('./models/Feedback');

if (process.env.NODE_ENV === 'production') {
  console.error('\nFATAL: Database cleanup script is strictly prohibited in production environments (NODE_ENV=production).');
  process.exit(1);
}

if (!process.argv.includes('--confirm')) {
  console.error('\nERROR: Database cleanup requires the explicit --confirm flag to run.');
  console.error('Example: node clean.js --confirm\n');
  process.exit(1);
}

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/interviewpro';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ? process.env.ADMIN_EMAIL.toLowerCase().trim() : null;

async function clean() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB for authorized cleanup...');

    const deletedInterviews = await Interview.deleteMany({});
    console.log(`Deleted ${deletedInterviews.deletedCount} interviews.`);

    const deletedFeedbacks = await Feedback.deleteMany({});
    console.log(`Deleted ${deletedFeedbacks.deletedCount} feedbacks.`);

    const userDeleteFilter = ADMIN_EMAIL ? { email: { $ne: ADMIN_EMAIL } } : {};
    const deletedUsers = await User.deleteMany(userDeleteFilter);
    console.log(`Deleted ${deletedUsers.deletedCount} users (Admin preserved: ${ADMIN_EMAIL || 'none specified'}).`);

    const remainingUsers = await User.find({});
    console.log('Remaining users:', remainingUsers.map(u => ({ id: u._id, name: u.name, email: u.email, role: u.role })));

    await mongoose.disconnect();
    console.log('Cleanup completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Error cleaning database:', err);
    process.exit(1);
  }
}

clean();
