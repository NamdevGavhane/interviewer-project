const Razorpay = require('razorpay');
const Interview = require('../models/Interview');
const Availability = require('../models/Availability');
const PendingBooking = require('../models/PendingBooking');
const Payment = require('../models/Payment');
const Settings = require('../models/Settings');
const Notification = require('../models/Notification');
const JobLock = require('../models/JobLock');
const { sendCancellationEmail } = require('../utils/mailer');
const { releaseSlotForInterview, releaseExpiredReservations } = require('./availabilityService');

const getRazorpayInstance = () => {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (key_id && key_secret) {
    try {
      return new Razorpay({ key_id, key_secret });
    } catch (e) {
      console.warn('Razorpay initialization warning in sessionLifecycleService:', e.message);
    }
  }
  return null;
};

/**
 * Execute one full sweep of the session lifecycle worker.
 * Idempotent, safe to run twice or concurrently across multiple instances.
 */
const runLifecycleJob = async (options = {}) => {
  const lockName = 'session_lifecycle_worker';
  let lockInstance = null;

  try {
    if (!options.force) {
      const lockResult = await JobLock.acquire(lockName, 55000);
      if (!lockResult.acquired) {
        // Another instance is actively executing the lifecycle sweep
        return { success: true, skipped: true, reason: 'locked' };
      }
      lockInstance = lockResult.instanceId;
    }

    const settings = await Settings.getSettings();
    const now = new Date();
    const nowMs = now.getTime();
    const frontendBaseUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim();

    const noShowWaitMs = (settings.noShowWaitMinutes || 10) * 60 * 1000;
    const slotDurationMs = (settings.slotDurationMinutes || 45) * 60 * 1000;
    const results = {
      expiredPendingBookings: 0,
      interviewerNoShows: 0,
      candidateNoShows: 0,
      completedSessions: 0,
      expiredSessions: 0,
      cleanedOldSlots: 0
    };

    // =========================================================================
    // SWEEP 1: 10-minute hold release on expired pending bookings
    // =========================================================================
    const expiredPending = await PendingBooking.find({
      status: 'pending',
      expiresAt: { $lt: now }
    });

    for (const pending of expiredPending) {
      const updated = await PendingBooking.findOneAndUpdate(
        { _id: pending._id, status: 'pending' },
        { $set: { status: 'expired' } },
        { new: true }
      );
      if (updated) {
        results.expiredPendingBookings++;
        if (updated.slotId) {
          await Availability.updateOne(
            { _id: updated.slotId, reservedBy: updated.candidateId, isBooked: false },
            { $set: { reservedBy: null, reservedUntil: null } }
          );
        }
      }
    }

    // Also sweep any unheld reservations past their reservedUntil timestamp
    await releaseExpiredReservations();

    // =========================================================================
    // SWEEP 2: Auto-status transitions on scheduled interviews
    // =========================================================================
    const scheduledInterviews = await Interview.find({ status: 'scheduled' })
      .populate('candidateId', 'name email')
      .populate('interviewerId', 'name email');

    for (const interview of scheduledInterviews) {
      if (!interview.startTime) continue;

      const startMs = new Date(interview.startTime).getTime();
      const endMs = interview.endTime 
        ? new Date(interview.endTime).getTime() 
        : (startMs + slotDurationMs);

      const hasInterviewerJoined = !!interview.interviewerJoinedAt;
      const hasCandidateJoined = !!interview.candidateJoinedAt;
      const isTimeOver = nowMs >= endMs;
      const isPastNoShowCutoff = nowMs >= (startMs + noShowWaitMs);

      // Scenario 1: Interviewer never joined within 10m of start -> interviewer_no_show
      // Triggered if candidate joined and cutoff passed, OR if session ended and candidate joined while interviewer never did.
      if (!hasInterviewerJoined && hasCandidateJoined && isPastNoShowCutoff) {
        const claimed = await Interview.findOneAndUpdate(
          { _id: interview._id, status: 'scheduled' },
          {
            $set: {
              status: 'interviewer_no_show',
              completedAt: now,
              cancellationReason: 'Interviewer did not join within 10 minutes of start time'
            }
          },
          { new: true }
        );

        if (claimed) {
          results.interviewerNoShows++;
          // Full automatic refund
          let refundAmount = claimed.paidAmount || (claimed.amountPaise ? claimed.amountPaise / 100 : 50);
          const payment = await Payment.findOne({ interviewId: claimed._id });

          if (payment && payment.paymentId && payment.status === 'captured') {
            const rzp = getRazorpayInstance();
            if (rzp) {
              try {
                const ref = await rzp.payments.refund(payment.paymentId, {
                  amount: Math.round(payment.amount * 100),
                  notes: {
                    interviewId: String(claimed._id),
                    reason: 'Interviewer no-show automatic refund'
                  }
                });
                payment.refundId = ref.id;
              } catch (rzpErr) {
                console.warn('[LIFECYCLE] Razorpay auto-refund notice for interviewer no-show:', rzpErr.message);
              }
            }
            payment.refundStatus = 'processed';
            payment.refundAmount = payment.amount;
            payment.refundedAt = now;
            payment.status = 'refunded';
            await payment.save();
          }

          claimed.paymentStatus = 'refunded';
          claimed.refundAmount = refundAmount;
          await claimed.save();

          // Release slot lock
          await releaseSlotForInterview(claimed._id);

          // Notifications to both parties
          try {
            if (interview.candidateId) {
              await Notification.create({
                userId: interview.candidateId._id,
                interviewId: claimed._id,
                type: 'interview_cancelled',
                title: 'Full Refund: Interviewer No-Show',
                message: `The interviewer did not join your mock interview on "${claimed.topic}" within 10 minutes. A full refund of ₹${refundAmount} has been processed to your payment method.`,
                link: '/interviews'
              });
              await sendCancellationEmail({
                recipientName: interview.candidateId.name,
                recipientEmail: interview.candidateId.email,
                topic: claimed.topic,
                date: claimed.date,
                timeSlot: claimed.timeSlot,
                reason: 'Interviewer no-show (did not join within 10 minutes of scheduled start)',
                cancelledByName: 'DevSphere System',
                refundAmount,
                frontendBaseUrl
              });
            }

            if (interview.interviewerId) {
              await Notification.create({
                userId: interview.interviewerId._id,
                interviewId: claimed._id,
                type: 'interview_cancelled',
                title: 'Session Marked No-Show',
                message: `You missed your scheduled mock interview on "${claimed.topic}". The candidate was fully refunded.`,
                link: '/interviews'
              });
              await sendCancellationEmail({
                recipientName: interview.interviewerId.name,
                recipientEmail: interview.interviewerId.email,
                topic: claimed.topic,
                date: claimed.date,
                timeSlot: claimed.timeSlot,
                reason: 'You did not join within 10 minutes of scheduled start time.',
                cancelledByName: 'DevSphere System',
                refundAmount: 0,
                frontendBaseUrl
              });
            }
          } catch (notifErr) {
            console.warn('[LIFECYCLE] Notification dispatch error on interviewer no-show:', notifErr.message);
          }
        }
        continue;
      }

      // If time is not over yet, remaining checks wait until session duration has passed
      if (!isTimeOver) continue;

      // Scenario 2: Candidate never joined, interviewer did -> candidate_no_show
      // Interviewer earns their share; no refund to candidate.
      if (hasInterviewerJoined && !hasCandidateJoined) {
        const claimed = await Interview.findOneAndUpdate(
          { _id: interview._id, status: 'scheduled' },
          {
            $set: {
              status: 'candidate_no_show',
              completedAt: now
            }
          },
          { new: true }
        );

        if (claimed) {
          results.candidateNoShows++;
          try {
            if (interview.candidateId) {
              await Notification.create({
                userId: interview.candidateId._id,
                interviewId: claimed._id,
                type: 'interview_cancelled',
                title: 'Session Missed (Candidate No-Show)',
                message: `You did not attend your scheduled mock interview session on "${claimed.topic}". As per platform policy, candidate no-shows are non-refundable.`,
                link: '/interviews'
              });
            }
            if (interview.interviewerId) {
              await Notification.create({
                userId: interview.interviewerId._id,
                interviewId: claimed._id,
                type: 'system',
                title: 'Candidate No-Show - Earnings Retained',
                message: `The candidate did not attend the mock interview session on "${claimed.topic}". Your session earnings have been credited to your balance.`,
                link: '/professional/earnings'
              });
            }
          } catch (notifErr) {
            console.warn('[LIFECYCLE] Notification error on candidate no-show:', notifErr.message);
          }
        }
        continue;
      }

      // Scenario 3: Interviewer joined and time is over -> completed
      if (hasInterviewerJoined && hasCandidateJoined) {
        const claimed = await Interview.findOneAndUpdate(
          { _id: interview._id, status: 'scheduled' },
          {
            $set: {
              status: 'completed',
              completedAt: now
            }
          },
          { new: true }
        );

        if (claimed) {
          results.completedSessions++;
          try {
            if (interview.candidateId) {
              await Notification.create({
                userId: interview.candidateId._id,
                interviewId: claimed._id,
                type: 'feedback_received',
                title: 'Interview Completed',
                message: `Your mock interview on "${claimed.topic}" is complete. Leave a review for your interviewer!`,
                link: `/interviews`
              });
            }
          } catch (notifErr) {
            console.warn('[LIFECYCLE] Notification error on session completed:', notifErr.message);
          }
        }
        continue;
      }

      // Scenario 4: Nobody joined and time is over -> expired
      if (!hasInterviewerJoined && !hasCandidateJoined) {
        const claimed = await Interview.findOneAndUpdate(
          { _id: interview._id, status: 'scheduled' },
          {
            $set: {
              status: 'expired',
              completedAt: now
            }
          },
          { new: true }
        );

        if (claimed) {
          results.expiredSessions++;
          await releaseSlotForInterview(claimed._id);

          try {
            if (interview.candidateId) {
              await Notification.create({
                userId: interview.candidateId._id,
                interviewId: claimed._id,
                type: 'system',
                title: 'Session Expired',
                message: `Your mock interview session on "${claimed.topic}" has expired because neither party joined.`,
                link: '/interviews'
              });
            }
            if (interview.interviewerId) {
              await Notification.create({
                userId: interview.interviewerId._id,
                interviewId: claimed._id,
                type: 'system',
                title: 'Session Expired',
                message: `The mock interview session on "${claimed.topic}" expired with no participants.`,
                link: '/interviews'
              });
            }
          } catch (notifErr) {
            console.warn('[LIFECYCLE] Notification error on session expired:', notifErr.message);
          }
        }
      }
    }

    // =========================================================================
    // SWEEP 3: Delete unbooked availability slots past 7 days
    // =========================================================================
    const sevenDaysAgo = new Date(nowMs - 7 * 24 * 60 * 60 * 1000);
    const deleteResult = await Availability.deleteMany({
      isBooked: false,
      endTime: { $lt: sevenDaysAgo }
    });
    results.cleanedOldSlots = deleteResult.deletedCount || 0;

    return { success: true, ...results };
  } catch (err) {
    console.error('[LIFECYCLE] Error running session lifecycle sweep:', err);
    return { success: false, error: err.message };
  } finally {
    if (lockInstance && !options.force) {
      await JobLock.release(lockName, lockInstance);
    }
  }
};

let lifecycleTimer = null;

const startLifecycleWorker = (intervalMs = 60000) => {
  if (lifecycleTimer) return;

  // Run initial pass after brief delay
  setTimeout(() => {
    runLifecycleJob().catch(err => console.warn('[LIFECYCLE] Initial run warning:', err.message));
  }, 5000);

  lifecycleTimer = setInterval(() => {
    runLifecycleJob().catch(err => console.warn('[LIFECYCLE] Interval run warning:', err.message));
  }, intervalMs);

  console.log(`[LIFECYCLE] Session lifecycle worker started (every ${Math.round(intervalMs / 1000)}s)`);
};

const stopLifecycleWorker = () => {
  if (lifecycleTimer) {
    clearInterval(lifecycleTimer);
    lifecycleTimer = null;
  }
};

module.exports = {
  runLifecycleJob,
  startLifecycleWorker,
  stopLifecycleWorker
};
