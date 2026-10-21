/**
 * Migration Script: Purge Base64 Avatars from User collection (O2)
 * Replaces large data:image base64 strings with an empty string or default URL.
 * Run: node backend/scripts/migrateAvatars.js [--dry-run]
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

const runMigration = async () => {
  const isDryRun = process.argv.includes('--dry-run');
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    console.error('Error: MONGO_URI is missing from environment.');
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoUri);
    console.log(`Connected to MongoDB. Starting avatar migration (dry-run: ${isDryRun})...`);

    const usersWithBase64 = await User.find({
      avatar: { $regex: /^data:image/ }
    }).select('_id name email avatar');

    console.log(`Found ${usersWithBase64.length} user(s) with base64 avatar data.`);

    let migratedCount = 0;
    for (const user of usersWithBase64) {
      console.log(`- User: ${user.name} (${user.email}) - Avatar length: ${user.avatar?.length || 0} chars`);
      if (!isDryRun) {
        user.avatar = '';
        await user.save();
        migratedCount++;
      }
    }

    if (isDryRun) {
      console.log(`[DRY RUN COMPLETE] ${usersWithBase64.length} avatars would be cleaned.`);
    } else {
      console.log(`[MIGRATION COMPLETE] Successfully cleaned ${migratedCount} base64 avatars.`);
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
};

runMigration();
