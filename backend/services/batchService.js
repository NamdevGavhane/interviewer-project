const Batch = require('../models/Batch');
const User = require('../models/User');
const Interview = require('../models/Interview');
const Notification = require('../models/Notification');

/**
 * Activate a candidate's batch upon verified payment and snapshot validity days (Requirements 2 & 3).
 * Idempotent: If a batch for this orderId already exists, returns the existing batch safely.
 */
const activateBatchForCandidate = async ({ candidateId, interviewerId, interviewId, orderId, paymentId }) => {
  if (orderId) {
    const existing = await Batch.findOne({ orderId });
    if (existing) {
      if (interviewId && !existing.interviewId) {
        existing.interviewId = interviewId;
        await existing.save();
      }
      return existing;
    }
  }

  const interviewer = await User.findById(interviewerId).select('batchValidityDays name email');
  const validityDaysSnapshot = Number(interviewer?.batchValidityDays) > 0 
    ? Number(interviewer.batchValidityDays) 
    : 30;

  const activatedAt = new Date();
  const expiresAt = new Date(activatedAt.getTime() + validityDaysSnapshot * 24 * 60 * 60 * 1000);

  const batch = await Batch.create({
    candidateId,
    interviewerId,
    interviewId: interviewId || null,
    orderId: orderId || null,
    paymentId: paymentId || null,
    validityDaysSnapshot,
    activatedAt,
    expiresAt,
    status: 'active',
    extensions: []
  });

  return batch;
};

/**
 * Extend batch expiry by 7 days when a professional cancels a confirmed interview (Requirements 6, 7 & 8).
 * Guards against duplicate extensions using the extension history log.
 */
const extendBatchForProfessionalCancellation = async ({ interviewId, reason }) => {
  const interview = await Interview.findById(interviewId);
  if (!interview) {
    return { success: false, message: 'Interview not found.' };
  }

  // Find linked batch by interviewId, interview.batchId, or candidate/interviewer match
  let batch = null;
  if (interview.batchId) {
    batch = await Batch.findById(interview.batchId);
  }
  if (!batch) {
    batch = await Batch.findOne({ interviewId: interview._id });
  }
  if (!batch) {
    batch = await Batch.findOne({
      candidateId: interview.candidateId,
      interviewerId: interview.interviewerId
    }).sort({ createdAt: -1 });
  }

  if (!batch) {
    return { success: false, message: 'No associated batch found for this interview.' };
  }

  // Idempotency Guard (Requirement 7): Prevent duplicate extensions for the same interview
  const alreadyExtended = batch.extensions.some(
    ext => String(ext.interviewId) === String(interview._id)
  );
  if (alreadyExtended) {
    return {
      success: true,
      extended: false,
      message: 'Batch validity has already been extended for this cancelled interview.',
      batch
    };
  }

  // Calculate new expiry (+7 days)
  const previousExpiresAt = new Date(batch.expiresAt);
  const now = new Date();
  // Ensure the candidate gets a full 7 days from now if batch was already expired, or 7 days from existing expiry
  const baseTimestamp = previousExpiresAt > now ? previousExpiresAt.getTime() : now.getTime();
  const newExpiresAt = new Date(baseTimestamp + 7 * 24 * 60 * 60 * 1000);

  batch.expiresAt = newExpiresAt;
  batch.status = 'active'; // Reactivate if it had expired
  batch.extensions.push({
    extendedByDays: 7,
    reason: reason || `Interviewer cancelled scheduled session: ${interview.topic || 'Mock Interview'}`,
    interviewId: interview._id,
    previousExpiresAt,
    newExpiresAt,
    extendedAt: new Date()
  });

  await batch.save();

  // Create notification for candidate
  try {
    await Notification.create({
      userId: batch.candidateId,
      interviewId: interview._id,
      type: 'system',
      title: 'Batch Validity Extended (+7 Days)',
      message: `Your mock interview on "${interview.topic}" was cancelled by the interviewer. Your batch validity has been extended by 7 days until ${newExpiresAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.`,
      link: '/interviews'
    });
  } catch (notifErr) {
    console.warn('[BATCH SERVICE] Notification dispatch notice:', notifErr.message);
  }

  return {
    success: true,
    extended: true,
    message: 'Batch validity extended by 7 days.',
    batch
  };
};

/**
 * Sweep and expire active batches that have surpassed their expiry timestamp (Requirement 4).
 */
const sweepExpiredBatches = async () => {
  const now = new Date();
  const result = await Batch.updateMany(
    {
      status: 'active',
      expiresAt: { $lte: now }
    },
    {
      $set: { status: 'expired' }
    }
  );

  return result.modifiedCount || 0;
};

/**
 * Validate if a candidate has an active unexpired batch when booking or rescheduling.
 * Confirmed scheduled interviews remain valid (Requirement 5).
 */
const checkCandidateBatchValidity = async ({ candidateId, interviewerId }) => {
  const batch = await Batch.findOne({
    candidateId,
    interviewerId
  }).sort({ createdAt: -1 });

  if (!batch) {
    return { hasBatch: false, isValid: true, batch: null };
  }

  const isExpired = batch.status === 'expired' || new Date() > batch.expiresAt;
  return {
    hasBatch: true,
    isValid: !isExpired,
    isExpired,
    batch
  };
};

module.exports = {
  activateBatchForCandidate,
  extendBatchForProfessionalCancellation,
  sweepExpiredBatches,
  checkCandidateBatchValidity
};
