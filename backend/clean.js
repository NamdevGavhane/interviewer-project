const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./models/User');
const Interview = require('./models/Interview');
const Feedback = require('./models/Feedback');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/interviewpro';

async function clean() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB for cleanup...');

    const deletedInterviews = await Interview.deleteMany({});
    console.log(`Deleted ${deletedInterviews.deletedCount} interviews.`);

    const deletedFeedbacks = await Feedback.deleteMany({});
    console.log(`Deleted ${deletedFeedbacks.deletedCount} feedbacks.`);

    const deletedUsers = await User.deleteMany({ email: { $ne: 'namdev.sharma@gmail.com' } });
    console.log(`Deleted ${deletedUsers.deletedCount} dummy users.`);

    const remainingUsers = await User.find({});
    console.log('Remaining users:', remainingUsers.map(u => ({ id: u._id, name: u.name, email: u.email, role: u.role })));

    process.exit(0);
  } catch (err) {
    console.error('Error cleaning database:', err);
    process.exit(1);
  }
}

clean();
