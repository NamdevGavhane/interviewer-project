/**
 * Migration Script: Hash / Invalidate Plaintext Tokens (S1)
 * 
 * Usage:
 *   node scripts/migrateTokens.js --dry-run
 *   node scripts/migrateTokens.js --confirm
 */

const mongoose = require('mongoose');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const User = require('../models/User');

const isDryRun = process.argv.includes('--dry-run');
const isConfirmed = process.argv.includes('--confirm');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/interviewpro';

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function isSha256(str) {
  return typeof str === 'string' && str.length === 64 && /^[0-9a-fA-F]{64}$/.test(str);
}

async function runMigration() {
  if (!isDryRun && !isConfirmed) {
    console.error('ERROR: Migration requires either --dry-run or --confirm flag to execute.');
    process.exit(1);
  }

  console.log(`\n==================================================`);
  console.log(`Starting Token Migration (Mode: ${isDryRun ? 'DRY-RUN (No changes applied)' : 'LIVE EXECUTION'})`);
  console.log(`==================================================\n`);

  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB successfully.');

  // Find users that have any of the 3 token fields populated
  const users = await User.find({
    $or: [
      { resetPasswordToken: { $exists: true, $ne: null } },
      { emailVerificationToken: { $exists: true, $ne: null } },
      { invitationToken: { $exists: true, $ne: null } }
    ]
  }).select('+resetPasswordToken +emailVerificationToken +invitationToken +resetPasswordExpires +emailVerificationExpires +invitationExpires');

  console.log(`Found ${users.length} users with active or legacy token fields.`);

  let updatedCount = 0;
  let invalidatedCount = 0;
  let skippedCount = 0;

  for (const user of users) {
    let modified = false;

    // 1. Reset Password Token
    if (user.resetPasswordToken) {
      if (isSha256(user.resetPasswordToken)) {
        skippedCount++;
      } else if (user.resetPasswordExpires && user.resetPasswordExpires < new Date()) {
        console.log(`[User: ${user.email}] Invalidating expired plaintext resetPasswordToken`);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        modified = true;
        invalidatedCount++;
      } else {
        console.log(`[User: ${user.email}] Hashing plaintext resetPasswordToken to SHA-256`);
        user.resetPasswordToken = hashToken(user.resetPasswordToken);
        modified = true;
        updatedCount++;
      }
    }

    // 2. Email Verification Token
    if (user.emailVerificationToken) {
      if (isSha256(user.emailVerificationToken)) {
        skippedCount++;
      } else if (user.emailVerificationExpires && user.emailVerificationExpires < new Date()) {
        console.log(`[User: ${user.email}] Invalidating expired plaintext emailVerificationToken`);
        user.emailVerificationToken = undefined;
        user.emailVerificationExpires = undefined;
        modified = true;
        invalidatedCount++;
      } else {
        console.log(`[User: ${user.email}] Hashing plaintext emailVerificationToken to SHA-256`);
        user.emailVerificationToken = hashToken(user.emailVerificationToken);
        modified = true;
        updatedCount++;
      }
    }

    // 3. Invitation Token
    if (user.invitationToken) {
      if (isSha256(user.invitationToken)) {
        skippedCount++;
      } else if (user.invitationExpires && user.invitationExpires < new Date()) {
        console.log(`[User: ${user.email}] Invalidating expired plaintext invitationToken`);
        user.invitationToken = undefined;
        user.invitationExpires = undefined;
        modified = true;
        invalidatedCount++;
      } else {
        console.log(`[User: ${user.email}] Hashing plaintext invitationToken to SHA-256`);
        user.invitationToken = hashToken(user.invitationToken);
        modified = true;
        updatedCount++;
      }
    }

    if (modified && !isDryRun) {
      await user.save();
    }
  }

  console.log(`\nMigration Summary:`);
  console.log(`- Tokens Hashed: ${updatedCount}`);
  console.log(`- Expired Tokens Invalidated: ${invalidatedCount}`);
  console.log(`- Already SHA-256 (Skipped): ${skippedCount}`);
  console.log(`\nMigration completed successfully.`);

  await mongoose.disconnect();
  process.exit(0);
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
