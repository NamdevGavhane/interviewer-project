const Razorpay = require('razorpay');
const Interview = require('../models/Interview');
const Payment = require('../models/Payment');
const Settings = require('../models/Settings');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { sendCancellationEmail, sendRefundProcessedEmail } = require('../utils/mailer');
const { getFrontendBaseUrl } = require('../utils/urlHelper');
const { releaseSlotForInterview } = require('./availabilityService');

const getRazorpayInstance = () => {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (key_id && key_secret) {
    try {
      return new Razorpay({ key_id, key_secret });
    } catch (e) {
      console.warn('Razorpay initialization warning in refundService:', e.message);
    }
  }
  return null;
};

/**
 * Unified interview refund and cancellation processor
 * Enforces Settings.refundWindowHours, distinguishes candidate vs interviewer/admin,
 * executes payment gateway refund, updates DB state, and releases availability slot.
 */
const processInterviewRefund = async ({ interviewId, requestedByUserId, userRole, reason }) => {
  const interview = await Interview.findById(interviewId);
  if (!interview) {
    return { success: false, status: 404, message: 'Interview session not found.' };
  }

  const isCandidate = String(interview.candidateId) === String(requestedByUserId);
  const isInterviewer = String(interview.interviewerId) === String(requestedByUserId);
  const isAdmin = userRole === 'admin';

  if (!isCandidate && !isInterviewer && !isAdmin) {
    return { success: false, status: 403, message: 'Forbidden: You do not have permission to cancel or refund this interview.' };
  }

  if (interview.status === 'cancelled') {
    return { success: false, status: 400, message: 'This interview session is already cancelled.' };
  }

  if (interview.status === 'completed') {
    return { success: false, status: 400, message: 'Completed interviews cannot be cancelled or refunded.' };
  }

  const settings = await Settings.getSettings();
  const refundWindowHours = Number(settings.refundWindowHours) || 24;

  // Determine refund eligibility:
  // Admin or interviewer cancellation -> ALWAYS 100% eligible regardless of window
  // Candidate cancellation -> check if (startTime - now) >= refundWindowHours
  let isEligibleForRefund = false;
  let nonRefundableCandidatePolicy = false;

  if (isAdmin || isInterviewer) {
    isEligibleForRefund = true;
  } else if (isCandidate) {
    if (interview.startTime) {
      const hoursUntilStart = (new Date(interview.startTime).getTime() - Date.now()) / (3600 * 1000);
      if (hoursUntilStart >= refundWindowHours) {
        isEligibleForRefund = true;
      } else {
        isEligibleForRefund = false;
        nonRefundableCandidatePolicy = true;
      }
    } else {
      isEligibleForRefund = true;
    }
  }

  const payment = await Payment.findOne({ interviewId: interview._id });

  // Handle outside-window candidate cancellation: cancel session and release slot, but do NOT refund
  if (nonRefundableCandidatePolicy) {
    interview.status = 'cancelled';
    interview.cancelledAt = new Date();
    interview.cancellationReason = reason || `Cancelled by candidate within ${refundWindowHours}h policy window (non-refundable)`;
    interview.refundAmount = 0;
    await interview.save();
    await releaseSlotForInterview(interview._id);

    await dispatchCancellationAlerts({
      interview,
      reason: interview.cancellationReason,
      requestedByUserId,
      refundAmount: 0
    });

    return {
      success: true,
      refunded: false,
      refundAmount: 0,
      message: `Interview cancelled. Per platform policy, cancellations within ${refundWindowHours} hours of session start time are non-refundable.`,
      interview
    };
  }

  // Handle free session or zero-cost booking
  if (!payment || payment.paymentMethod === 'free' || payment.amount === 0) {
    if (payment) {
      payment.refundStatus = 'processed';
      payment.refundAmount = 0;
      payment.refundedAt = new Date();
      await payment.save();
    }

    interview.status = 'cancelled';
    interview.cancelledAt = new Date();
    interview.cancellationReason = reason || 'Cancelled by user';
    interview.refundAmount = 0;
    interview.paymentStatus = 'refunded';
    await interview.save();
    await releaseSlotForInterview(interview._id);

    await dispatchCancellationAlerts({
      interview,
      reason: interview.cancellationReason,
      requestedByUserId,
      refundAmount: 0
    });

    return {
      success: true,
      refunded: true,
      refundAmount: 0,
      message: 'Free session booking cancelled and slot released successfully.',
      interview
    };
  }

  // Handle paid gateway refund: Atomically claim refund lock to prevent concurrent double-refund (2h)
  const claimedPayment = await Payment.findOneAndUpdate(
    { _id: payment._id, refundStatus: { $nin: ['pending', 'processed'] } },
    { $set: { refundStatus: 'pending' } },
    { new: true }
  );

  if (!claimedPayment) {
    return {
      success: false,
      status: 409,
      message: 'A refund for this transaction is already processing or has already been completed.'
    };
  }

  const rzp = getRazorpayInstance();
  if (!rzp) {
    await Payment.findByIdAndUpdate(payment._id, { $set: { refundStatus: 'none' } });
    return {
      success: false,
      status: 503,
      message: 'Payment gateway unconfigured. Cannot process automated refund. Please contact platform support.'
    };
  }

  try {
    const refund = await rzp.payments.refund(payment.paymentId, {
      amount: Math.round(payment.amount * 100),
      notes: {
        interviewId: String(interview._id),
        cancelledBy: String(requestedByUserId),
        reason: reason || 'Interview cancelled'
      }
    });

    payment.refundStatus = 'processed';
    payment.refundId = refund.id;
    payment.refundAmount = payment.amount;
    payment.refundedAt = new Date();
    payment.status = 'refunded';
    await payment.save();

    interview.status = 'cancelled';
    interview.cancelledAt = new Date();
    interview.cancellationReason = reason || 'Cancelled';
    interview.refundAmount = payment.amount;
    interview.paymentStatus = 'refunded';
    await interview.save();

    await releaseSlotForInterview(interview._id);

    await dispatchCancellationAlerts({
      interview,
      reason: interview.cancellationReason,
      requestedByUserId,
      refundAmount: payment.amount,
      refundId: refund.id
    });

    return {
      success: true,
      refunded: true,
      refundAmount: payment.amount,
      refundId: refund.id,
      message: `Full refund of ₹${payment.amount} processed successfully.`,
      interview,
      payment
    };
  } catch (gatewayErr) {
    console.error('Razorpay refund API call error:', gatewayErr);
    await Payment.findByIdAndUpdate(payment._id, { $set: { refundStatus: 'failed' } });
    return {
      success: false,
      status: 502,
      message: `Gateway refund failed: ${gatewayErr.message || 'Razorpay refund rejected'}`
    };
  }
};

const dispatchCancellationAlerts = async ({ interview, reason, requestedByUserId, refundAmount = 0, refundId = '' }) => {
  try {
    const [candidate, interviewer, requester] = await Promise.all([
      User.findById(interview.candidateId).select('name email'),
      User.findById(interview.interviewerId).select('name email'),
      User.findById(requestedByUserId).select('name')
    ]);

    const cancelledByName = requester?.name || 'A participant';
    const frontendBaseUrl = getFrontendBaseUrl();

    // In-app notifications
    if (candidate) {
      await Notification.create({
        userId: candidate._id,
        interviewId: interview._id,
        type: 'interview_cancelled',
        title: 'Interview Cancelled',
        message: `Your session on "${interview.topic}" (${interview.date}) has been cancelled by ${cancelledByName}.${refundAmount > 0 ? ` Full refund of ₹${refundAmount} initiated.` : ''}`,
        link: '/interviews'
      });

      await sendCancellationEmail({
        recipientName: candidate.name,
        recipientEmail: candidate.email,
        topic: interview.topic,
        date: interview.date,
        timeSlot: interview.timeSlot,
        reason,
        cancelledByName,
        refundAmount,
        frontendBaseUrl
      });

      if (refundAmount > 0) {
        await sendRefundProcessedEmail({
          recipientName: candidate.name,
          recipientEmail: candidate.email,
          topic: interview.topic,
          refundAmount,
          refundId,
          frontendBaseUrl
        });
      }
    }

    if (interviewer) {
      await Notification.create({
        userId: interviewer._id,
        interviewId: interview._id,
        type: 'interview_cancelled',
        title: 'Interview Cancelled',
        message: `The session on "${interview.topic}" (${interview.date}) with candidate ${candidate?.name || 'Candidate'} was cancelled by ${cancelledByName}.`,
        link: '/interviews'
      });

      await sendCancellationEmail({
        recipientName: interviewer.name,
        recipientEmail: interviewer.email,
        topic: interview.topic,
        date: interview.date,
        timeSlot: interview.timeSlot,
        reason,
        cancelledByName,
        refundAmount: 0,
        frontendBaseUrl
      });
    }
  } catch (alertErr) {
    console.warn('Cancellation alert dispatch warning:', alertErr.message);
  }
};

module.exports = {
  processInterviewRefund
};
