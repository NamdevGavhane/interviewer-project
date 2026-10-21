const Interview = require('../models/Interview');
const Notification = require('../models/Notification');
const JobLock = require('../models/JobLock');
const { sendInterviewReminderEmail } = require('../utils/mailer');

const runReminderJob = async () => {
  const lockName = 'interview_reminder_worker';
  let lockInstance = null;

  try {
    const lockResult = await JobLock.acquire(lockName, 60000);
    if (!lockResult.acquired) {
      // Another instance is currently executing the reminder sweep
      return;
    }
    lockInstance = lockResult.instanceId;

    const now = new Date();
    const frontendBaseUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim();

    // 1. Check for interviews starting in ~24 hours (between 23h and 25h)
    const in25h = new Date(now.getTime() + 25 * 60 * 60 * 1000);
    const in23h = new Date(now.getTime() + 23 * 60 * 60 * 1000);

    const upcoming24h = await Interview.find({
      status: 'scheduled',
      startTime: { $gte: in23h, $lte: in25h },
      reminderSent24h: false
    }).populate('candidateId', 'name email').populate('interviewerId', 'name email');

    for (const interview of upcoming24h) {
      if (!interview.candidateId || !interview.interviewerId) continue;

      // Atomic lock on interview to avoid race condition
      const claimed = await Interview.findOneAndUpdate(
        { _id: interview._id, reminderSent24h: false },
        { $set: { reminderSent24h: true } },
        { new: true }
      );
      if (!claimed) continue;

      // In-app notifications
      try {
        await Notification.create({
          userId: interview.candidateId._id,
          interviewId: interview._id,
          type: 'reminder_24h',
          title: 'Interview Reminder (24 Hours)',
          message: `Your mock interview session with ${interview.interviewerId.name} on "${interview.topic}" starts in approximately 24 hours (${interview.timeSlot}).`,
          link: `/interviews`
        });
        await Notification.create({
          userId: interview.interviewerId._id,
          interviewId: interview._id,
          type: 'reminder_24h',
          title: 'Upcoming Interview Session (24 Hours)',
          message: `You have an interview session scheduled with candidate ${interview.candidateId.name} tomorrow at ${interview.timeSlot}.`,
          link: `/interviews`
        });
      } catch (notifErr) {
        console.warn('In-app notification creation error:', notifErr.message);
      }

      // Real transactional emails
      try {
        await sendInterviewReminderEmail({
          recipientName: interview.candidateId.name,
          recipientEmail: interview.candidateId.email,
          otherPartyName: interview.interviewerId.name,
          isCandidate: true,
          topic: interview.topic,
          date: interview.date,
          timeSlot: interview.timeSlot,
          interviewId: interview._id,
          hoursNotice: '24',
          frontendBaseUrl
        });

        await sendInterviewReminderEmail({
          recipientName: interview.interviewerId.name,
          recipientEmail: interview.interviewerId.email,
          otherPartyName: interview.candidateId.name,
          isCandidate: false,
          topic: interview.topic,
          date: interview.date,
          timeSlot: interview.timeSlot,
          interviewId: interview._id,
          hoursNotice: '24',
          frontendBaseUrl
        });
      } catch (mailErr) {
        console.warn('Reminder email dispatch warning (24h):', mailErr.message);
      }
    }

    // 2. Check for interviews starting in ~1 hour (between 45m and 75m)
    const in75m = new Date(now.getTime() + 75 * 60 * 1000);
    const in45m = new Date(now.getTime() + 45 * 60 * 1000);

    const upcoming1h = await Interview.find({
      status: 'scheduled',
      startTime: { $gte: in45m, $lte: in75m },
      reminderSent1h: false
    }).populate('candidateId', 'name email').populate('interviewerId', 'name email');

    for (const interview of upcoming1h) {
      if (!interview.candidateId || !interview.interviewerId) continue;

      const claimed = await Interview.findOneAndUpdate(
        { _id: interview._id, reminderSent1h: false },
        { $set: { reminderSent1h: true } },
        { new: true }
      );
      if (!claimed) continue;

      // In-app notifications
      try {
        await Notification.create({
          userId: interview.candidateId._id,
          interviewId: interview._id,
          type: 'reminder_1h',
          title: 'Session Starting in 1 Hour!',
          message: `Your mock interview session with ${interview.interviewerId.name} on "${interview.topic}" starts in 1 hour. Get your camera & mic ready!`,
          link: `/room?interviewId=${interview._id}&role=candidate`
        });
        await Notification.create({
          userId: interview.interviewerId._id,
          interviewId: interview._id,
          type: 'reminder_1h',
          title: 'Session Starting in 1 Hour!',
          message: `Your interview session with ${interview.candidateId.name} starts in 1 hour.`,
          link: `/room?interviewId=${interview._id}&role=interviewer`
        });
      } catch (notifErr) {
        console.warn('In-app notification creation error:', notifErr.message);
      }

      // Real transactional emails
      try {
        await sendInterviewReminderEmail({
          recipientName: interview.candidateId.name,
          recipientEmail: interview.candidateId.email,
          otherPartyName: interview.interviewerId.name,
          isCandidate: true,
          topic: interview.topic,
          date: interview.date,
          timeSlot: interview.timeSlot,
          interviewId: interview._id,
          hoursNotice: '1',
          frontendBaseUrl
        });

        await sendInterviewReminderEmail({
          recipientName: interview.interviewerId.name,
          recipientEmail: interview.interviewerId.email,
          otherPartyName: interview.candidateId.name,
          isCandidate: false,
          topic: interview.topic,
          date: interview.date,
          timeSlot: interview.timeSlot,
          interviewId: interview._id,
          hoursNotice: '1',
          frontendBaseUrl
        });
      } catch (mailErr) {
        console.warn('Reminder email dispatch warning (1h):', mailErr.message);
      }
    }
  } catch (err) {
    console.error('[ReminderWorker] Run error:', err.message);
  } finally {
    if (lockInstance) {
      await JobLock.release(lockName, lockInstance);
    }
  }
};

let workerInterval = null;

const startReminderWorker = () => {
  // Initial run 5s after startup
  setTimeout(runReminderJob, 5000);
  // Recurring every 5 minutes
  workerInterval = setInterval(runReminderJob, 5 * 60 * 1000);
};

const stopReminderWorker = () => {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
};

module.exports = { runReminderJob, startReminderWorker, stopReminderWorker };
