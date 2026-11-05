const Availability = require('../models/Availability');
const AvailabilityRule = require('../models/AvailabilityRule');
const Settings = require('../models/Settings');

/**
 * Convert time string "10:00 AM", "10:00", "09:30 PM" to hours and minutes
 */
const parseTimeString = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const clean = timeStr.trim();
  const match = clean.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3] ? match[3].toUpperCase() : null;

  if (period === 'PM' && hours < 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;

  return { hours, minutes };
};

/**
 * Retired rule system (TASK S1): stop using generateSlotsForInterviewer.
 * Professionals create their own slots via POST /api/availability/slots.
 */
const generateSlotsForInterviewer = async () => {
  return [];
};

/**
 * One-time cleanup at server start (TASK S1)
 * Guarded by Settings.legacySlotsCleared so it runs only once.
 * Deletes future slots that are unbooked and not reserved.
 * Deletes all AvailabilityRule documents.
 * Never touches booked or reserved slots.
 * Logs only counts.
 */
const runLegacySlotsCleanup = async () => {
  try {
    const settings = await Settings.getSettings();
    if (settings.legacySlotsCleared) {
      return { skipped: true };
    }

    const now = new Date();
    // Delete future slots that are unbooked and not reserved
    const deleteSlotsQuery = {
      startTime: { $gt: now },
      isBooked: false,
      $or: [
        { reservedUntil: null },
        { reservedUntil: { $lte: now } }
      ]
    };

    const deletedSlots = await Availability.deleteMany(deleteSlotsQuery);
    const deletedRules = await AvailabilityRule.deleteMany({});

    settings.legacySlotsCleared = true;
    await settings.save();

    console.log(`[CLEANUP] Legacy availability cleanup: deleted ${deletedSlots.deletedCount || 0} unbooked future slots and ${deletedRules.deletedCount || 0} availability rules.`);
    return {
      success: true,
      deletedSlotsCount: deletedSlots.deletedCount || 0,
      deletedRulesCount: deletedRules.deletedCount || 0
    };
  } catch (err) {
    console.error('[CLEANUP ERROR] Failed to run legacy availability cleanup:', err.message);
    throw err;
  }
};

/**
 * Atomically reserve an availability slot for a candidate during order checkout
 * Guarantees no two candidates can proceed to payment for the same slot concurrently.
 */
const reserveSlotForCandidate = async ({ slotId, interviewerId, candidateId, holdMinutes = 15 }) => {
  const now = new Date();
  const reservedUntil = new Date(Date.now() + holdMinutes * 60 * 1000);

  const query = {
    _id: slotId,
    interviewerId,
    isBooked: false,
    startTime: { $gt: now },
    $or: [
      { reservedUntil: null },
      { reservedUntil: { $lt: now } },
      { reservedBy: candidateId }
    ]
  };

  const update = {
    $set: {
      reservedBy: candidateId,
      reservedUntil
    }
  };

  return await Availability.findOneAndUpdate(query, update, { new: true });
};

/**
 * Atomically confirm a booked slot upon successful payment verification.
 * Clears reservation locks and marks slot as permanently booked.
 */
const confirmBookedSlot = async ({ slotId, candidateId, interviewId }) => {
  const now = new Date();

  return await Availability.findOneAndUpdate(
    {
      _id: slotId,
      isBooked: false,
      $or: [
        { reservedBy: candidateId },
        { reservedUntil: null },
        { reservedUntil: { $lt: now } }
      ]
    },
    {
      $set: {
        isBooked: true,
        interviewId,
        reservedBy: null,
        reservedUntil: null
      }
    },
    { new: true }
  );
};

/**
 * Backward compatible alias for atomicBookSlot
 */
const atomicBookSlot = async ({ interviewerId, slotId, interviewId, candidateId }) => {
  const query = {
    _id: slotId,
    interviewerId,
    isBooked: false,
    startTime: { $gt: new Date() }
  };
  if (candidateId) {
    query.$or = [
      { reservedBy: candidateId },
      { reservedUntil: null },
      { reservedUntil: { $lt: new Date() } }
    ];
  }

  return await Availability.findOneAndUpdate(
    query,
    {
      $set: {
        isBooked: true,
        interviewId,
        reservedBy: null,
        reservedUntil: null
      }
    },
    { new: true }
  );
};

/**
 * Release a booked slot on interview cancellation or reschedule
 */
const releaseSlotForInterview = async (interviewId) => {
  return await Availability.findOneAndUpdate(
    { interviewId },
    {
      $set: {
        isBooked: false,
        interviewId: null,
        reservedBy: null,
        reservedUntil: null
      }
    },
    { new: true }
  );
};

/**
 * Release expired slot reservations (e.g., checkout abandoned)
 */
const releaseExpiredReservations = async () => {
  const now = new Date();
  const result = await Availability.updateMany(
    {
      isBooked: false,
      reservedUntil: { $ne: null, $lt: now }
    },
    {
      $set: {
        reservedBy: null,
        reservedUntil: null
      }
    }
  );
  return result.modifiedCount || 0;
};

module.exports = {
  generateSlotsForInterviewer,
  runLegacySlotsCleanup,
  reserveSlotForCandidate,
  confirmBookedSlot,
  atomicBookSlot,
  releaseSlotForInterview,
  releaseExpiredReservations,
  parseTimeString
};
