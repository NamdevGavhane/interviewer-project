const { DateTime } = require('luxon');
const Availability = require('../models/Availability');
const AvailabilityRule = require('../models/AvailabilityRule');
const Settings = require('../models/Settings');
const Interview = require('../models/Interview');

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
 * Generate bookable Availability slots for an interviewer for the next N days
 * Interprets AvailabilityRule strictly within rule.timezone using Luxon,
 * outputting pure UTC Date instances for startTime and endTime.
 */
const generateSlotsForInterviewer = async (interviewerId) => {
  const settings = await Settings.getSettings();
  const bookingWindowDays = settings.bookingWindowDays || 14;

  const rules = await AvailabilityRule.find({ interviewerId, isActive: true });
  if (!rules || rules.length === 0) {
    return [];
  }

  const now = new Date();
  const createdSlots = [];

  for (const rule of rules) {
    const tz = rule.timezone && DateTime.now().setZone(rule.timezone).isValid ? rule.timezone : 'UTC';
    const parsedStart = parseTimeString(rule.startTime);
    const parsedEnd = parseTimeString(rule.endTime);
    if (!parsedStart || !parsedEnd) continue;

    // Loop through days 0..bookingWindowDays in rule's timezone
    for (let i = 0; i <= bookingWindowDays; i++) {
      const baseInZone = DateTime.now().setZone(tz).plus({ days: i });
      // Luxon weekday: 1 (Mon) .. 7 (Sun). Mongoose rule dayOfWeek: 0 (Sun) .. 6 (Sat)
      const jsDayOfWeek = baseInZone.weekday === 7 ? 0 : baseInZone.weekday;

      if (rule.dayOfWeek !== jsDayOfWeek) continue;

      const slotStartDt = baseInZone.set({
        hour: parsedStart.hours,
        minute: parsedStart.minutes,
        second: 0,
        millisecond: 0
      });

      const slotEndDt = baseInZone.set({
        hour: parsedEnd.hours,
        minute: parsedEnd.minutes,
        second: 0,
        millisecond: 0
      });

      const slotStart = slotStartDt.toJSDate();
      const slotEnd = slotEndDt.toJSDate();

      // Don't create slots in the past
      if (slotStart <= now) continue;

      const dateStr = baseInZone.toISODate(); // YYYY-MM-DD in the rule's timezone

      try {
        const slot = await Availability.findOneAndUpdate(
          { interviewerId, startTime: slotStart },
          {
            $setOnInsert: {
              interviewerId,
              date: dateStr,
              slotLabel: rule.slotLabel || `${rule.startTime} - ${rule.endTime}`,
              startTime: slotStart,
              endTime: slotEnd,
              timezone: tz,
              isBooked: false,
              interviewId: null,
              reservedBy: null,
              reservedUntil: null
            }
          },
          { upsert: true, new: true }
        );
        createdSlots.push(slot);
      } catch (err) {
        // Ignore duplicate key race conditions
      }
    }
  }

  return createdSlots;
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
  reserveSlotForCandidate,
  confirmBookedSlot,
  atomicBookSlot,
  releaseSlotForInterview,
  releaseExpiredReservations,
  parseTimeString
};
