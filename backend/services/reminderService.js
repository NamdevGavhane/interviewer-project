const Interview = require('../models/Interview');
const Notification = require('../models/Notification');

const runReminderJob = async () => {
  try {
    const now = new Date();

    // 1. Check for interviews starting in ~24 hours (between 23h and 25h)
    const in25h = new Date(now.getTime() + 25 * 60 * 60 * 1000);
    const in23h = new Date(now.getTime() + 23 * 60 * 60 * 1000);

    const upcoming24h = await Interview.find({
      status: 'scheduled',
      startTime: { $gte: in23h, $lte: in25h }
    }).populate('candidateId', 'name email').populate('interviewerId', 'name email');

    for (const interview of upcoming24h) {
      if (!interview.candidateId || !interview.interviewerId) continue;
      const existingNotif = await Notification.findOne({
        interviewId: interview._id,
        type: 'reminder_24h'
      });
      if (!existingNotif) {
        await Notification.create({
          userId: interview.candidateId._id,
          interviewId: interview._id,
          type: 'reminder_24h',
          title: 'Interview Reminder (24 Hours)',
          message: `Your mock interview session with ${interview.interviewerId.name} starts in approximately 24 hours (${interview.timeSlot}).`,
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
      }
    }

    // 2. Check for interviews starting in ~1 hour (between 45m and 75m)
    const in75m = new Date(now.getTime() + 75 * 60 * 1000);
    const in45m = new Date(now.getTime() + 45 * 60 * 1000);

    const upcoming1h = await Interview.find({
      status: 'scheduled',
      startTime: { $gte: in45m, $lte: in75m }
    }).populate('candidateId', 'name email').populate('interviewerId', 'name email');

    for (const interview of upcoming1h) {
      if (!interview.candidateId || !interview.interviewerId) continue;
      const existingNotif = await Notification.findOne({
        interviewId: interview._id,
        type: 'reminder_1h'
      });
      if (!existingNotif) {
        await Notification.create({
          userId: interview.candidateId._id,
          interviewId: interview._id,
          type: 'reminder_1h',
          title: 'Session Starting in 1 Hour!',
          message: `Your mock interview session with ${interview.interviewerId.name} starts in 1 hour. Get your camera & mic ready!`,
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
      }
    }
  } catch (err) {
    console.error('Reminder job error:', err.message);
  }
};

const startReminderWorker = () => {
  // Initial run 5s after startup
  setTimeout(runReminderJob, 5000);
  // Recurring every 10 minutes
  setInterval(runReminderJob, 10 * 60 * 1000);
};

module.exports = { runReminderJob, startReminderWorker };
