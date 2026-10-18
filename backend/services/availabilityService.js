const Availability = require('../models/Availability');
const AvailabilityRule = require('../models/AvailabilityRule');
const Settings = require('../models/Settings');
const Interview = require('../models/Interview');

/**
 * Convert time string "10:00 AM" or "10:00" to hours and minutes
 */
const parseTimeString = (timeStr) => {
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
 * Generate bookable Availability slots for an interviewer for the next N days (N from Settings)
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

  for (let i = 0; i <= bookingWindowDays; i++) {
    const targetDate = new Date();
    targetDate.setDate(now.getDate() + i);
    const dayOfWeek = targetDate.getDay();

    const matchingRules = rules.filter(r => r.dayOfWeek === dayOfWeek);
    const dateStr = targetDate.toISOString().split('T')[0];

    for (const rule of matchingRules) {
      const parsedStart = parseTimeString(rule.startTime);
      const parsedEnd = parseTimeString(rule.endTime);
      if (!parsedStart || !parsedEnd) continue;

      const slotStart = new Date(Date.UTC(
        targetDate.getFullYear(),
        targetDate.getMonth(),
        targetDate.getDate(),
        parsedStart.hours,
        parsedStart.minutes,
        0
      ));

      const slotEnd = new Date(Date.UTC(
        targetDate.getFullYear(),
        targetDate.getMonth(),
        targetDate.getDate(),
        parsedEnd.hours,
        parsedEnd.minutes,
        0
      ));

      // Don't create slots in the past
      if (slotStart <= now) continue;

      try {
        // Upsert slot without overwriting isBooked if it's already booked
        const slot = await Availability.findOneAndUpdate(
          { interviewerId, startTime: slotStart },
          {
            $setOnInsert: {
              interviewerId,
              date: dateStr,
              slotLabel: rule.slotLabel || `${rule.startTime} - ${rule.endTime}`,
              startTime: slotStart,
              endTime: slotEnd,
              timezone: rule.timezone || 'UTC',
              isBooked: false,
              interviewId: null
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
 * Atomically book a slot - guarantees no two candidates can ever double-book the same slot
 */
const atomicBookSlot = async ({ interviewerId, slotId, interviewId }) => {
  const bookedSlot = await Availability.findOneAndUpdate(
    {
      _id: slotId,
      interviewerId,
      isBooked: false,
      startTime: { $gt: new Date() }
    },
    {
      $set: {
        isBooked: true,
        interviewId
      }
    },
    { new: true }
  );

  return bookedSlot;
};

/**
 * Release a booked slot on interview cancellation or reschedule
 */
const releaseSlotForInterview = async (interviewId) => {
  return Availability.findOneAndUpdate(
    { interviewId },
    {
      $set: {
        isBooked: false,
        interviewId: null
      }
    },
    { new: true }
  );
};

module.exports = {
  generateSlotsForInterviewer,
  atomicBookSlot,
  releaseSlotForInterview,
  parseTimeString
};
