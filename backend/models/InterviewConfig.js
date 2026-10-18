const mongoose = require('mongoose');

const interviewConfigSchema = new mongoose.Schema({
  topics: {
    type: [String],
    default: [
      'Frontend (React, Web Vitals, JS Architecture)',
      'Backend (Node.js, Microservices, DB Scaling)',
      'Full Stack (MERN & Next.js)',
      'System Design & Distributed Architecture',
      'Data Structures & Algorithms',
      'Machine Learning & LLM Engineering',
      'DevOps, CI/CD & Kubernetes',
      'Engineering Management & Behavioral (STAR)'
    ]
  },
  difficulties: {
    type: [String],
    default: ['Junior / Associate', 'Mid-Level Software Engineer', 'Senior Software Engineer', 'Staff / Principal Architect']
  },
  companies: {
    type: [String],
    default: ['Google', 'Amazon', 'Microsoft', 'Meta', 'Netflix', 'Uber', 'Stripe', 'Cognizant', 'TCS']
  }
}, { timestamps: true });

interviewConfigSchema.statics.getConfig = async function() {
  let config = await this.findOne();
  if (!config) {
    config = await this.create({});
  }
  return config;
};

module.exports = mongoose.model('InterviewConfig', interviewConfigSchema);
