const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./models/User');
const Interview = require('./models/Interview');
const Feedback = require('./models/Feedback');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/interviewpro';

const seedDatabase = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB for seeding...');

    // Clear any fake/dummy scheduled sessions and feedbacks
    await Interview.deleteMany({});
    await Feedback.deleteMany({});
    console.log('Cleared scheduled interview sessions.');

    // 1. Shushant Gaikwad (Professional Interviewer)
    await User.findOneAndUpdate(
      { email: 'shushant@example.com' },
      {
        name: 'Shushant Gaikwad',
        email: 'shushant@example.com',
        password: 'password123',
        role: 'professional',
        title: 'Senior MERN Developer & Batch 3 Lead',
        company: 'Cognizant',
        domain: 'MERN Stack Development',
        hourlyRate: 100,
        bio: 'MERN Stack Developer specializing in React, Node.js, Express, and MongoDB. Conducting technical mock interviews and hands-on system reviews.',
        skills: ['MongoDB', 'Express.js', 'React', 'Node.js', 'REST APIs', 'Full Stack Architecture', 'JavaScript'],
        rating: 4.98,
        reviewsCount: 52,
        avatar: '/shushant-gaikwad.png',
        availabilitySlots: ['10:00 AM - 10:45 AM', '02:00 PM - 02:45 PM', '05:00 PM - 05:45 PM', '07:30 PM - 08:15 PM']
      },
      { upsert: true, returnDocument: 'after' }
    );

    // 2. Raju Bojane (Professional Interviewer)
    await User.findOneAndUpdate(
      { email: 'raju@example.com' },
      {
        name: 'Raju Bojane',
        email: 'raju@example.com',
        password: 'password123',
        role: 'professional',
        title: 'ML Developer & AI Specialist',
        company: 'NICE Systems',
        domain: 'Machine Learning & AI',
        hourlyRate: 100,
        bio: 'Machine Learning & AI Engineer specializing in Python, PyTorch, TensorFlow, LLMs, and model deployment. Conducting ML technical mock interviews.',
        skills: ['Python', 'Machine Learning', 'Deep Learning', 'PyTorch', 'TensorFlow', 'LLMs & GenAI', 'Model Deployment'],
        rating: 4.97,
        reviewsCount: 46,
        avatar: '/raju-bojane.png',
        availabilitySlots: ['11:00 AM - 11:45 AM', '03:00 PM - 03:45 PM', '06:00 PM - 06:45 PM', '08:30 PM - 09:15 PM']
      },
      { upsert: true, returnDocument: 'after' }
    );

    // 3. Namdev Sharma (Candidate)
    await User.findOneAndUpdate(
      { email: 'namdev.sharma@gmail.com' },
      {
        name: 'Namdev Sharma',
        email: 'namdev.sharma@gmail.com',
        password: 'password123',
        role: 'candidate',
        title: 'Software Developer',
        bio: 'Developer actively preparing for technical mock interviews.',
        avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?ixlib=rb-4.0.3&auto=format&fit=crop&w=200&q=80',
        availabilitySlots: ['10:00 AM - 10:45 AM', '02:00 PM - 02:45 PM', '05:00 PM - 05:45 PM', '07:00 PM - 07:45 PM']
      },
      { upsert: true, returnDocument: 'after' }
    );

    // 4. Namdev Gavhane (Admin)
    await User.findOneAndUpdate(
      { email: 'namdevgavhane41@gmail.com' },
      {
        name: 'Namdev Gavhane',
        email: 'namdevgavhane41@gmail.com',
        password: 'Namu7654321@',
        role: 'admin',
        isVerified: true,
        title: 'Super Administrator',
        company: 'InterviewPro Admin Team',
        bio: 'Platform Super Administrator with full system privileges.',
        avatar: '/namdev-admin.jpg'
      },
      { upsert: true, returnDocument: 'after' }
    );

    // Remove any other test user like rahul
    await User.deleteMany({ email: { $nin: ['shushant@example.com', 'raju@example.com', 'namdev.sharma@gmail.com', 'namdevgavhane41@gmail.com'] } });

    const allUsers = await User.find({});
    console.log('Current users in DB:', allUsers.map(u => `${u.name} (${u.role}) - ${u.email}`));

    console.log('Seeding completed successfully: Shushant and Raju retained as interviewers!');
    process.exit(0);
  } catch (err) {
    console.error('Error seeding database:', err);
    process.exit(1);
  }
};

seedDatabase();
