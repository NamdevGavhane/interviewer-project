const mongoose = require('mongoose');

const jobLockSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  lockedAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  lockedBy: {
    type: String,
    required: true
  },
  expiresAt: {
    type: Date,
    required: true
  }
}, { timestamps: true });

// TTL index to automatically remove expired locks in MongoDB
jobLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/**
 * Acquire distributed lock atomically
 * @param {string} lockName - Unique identifier for the job
 * @param {number} ttlMs - Duration for which the lock is held in ms (default 60s)
 * @param {string} instanceId - Unique identifier of the holding instance/process
 * @returns {Promise<boolean>} True if lock acquired, false otherwise
 */
jobLockSchema.statics.acquire = async function(lockName, ttlMs = 60000, instanceId = `${process.pid}_${Date.now()}`) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);

  try {
    // 1. Try to take over an expired lock
    const updated = await this.findOneAndUpdate(
      {
        name: lockName,
        expiresAt: { $lt: now }
      },
      {
        $set: {
          lockedAt: now,
          lockedBy: instanceId,
          expiresAt
        }
      },
      { new: true }
    );

    if (updated) {
      return { acquired: true, instanceId };
    }

    // 2. Try to create a new lock
    await this.create({
      name: lockName,
      lockedAt: now,
      lockedBy: instanceId,
      expiresAt
    });

    return { acquired: true, instanceId };
  } catch (err) {
    // E11000 duplicate key error means an active lock exists
    return { acquired: false, instanceId: null };
  }
};

/**
 * Release distributed lock safely
 * @param {string} lockName
 * @param {string} instanceId
 */
jobLockSchema.statics.release = async function(lockName, instanceId) {
  if (!instanceId) return;
  try {
    await this.deleteOne({ name: lockName, lockedBy: instanceId });
  } catch (err) {
    console.warn(`[JobLock] Error releasing lock "${lockName}":`, err.message);
  }
};

module.exports = mongoose.model('JobLock', jobLockSchema);
