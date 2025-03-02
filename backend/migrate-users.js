// migrate-users.js
const { Clerk } = require('@clerk/clerk-sdk-node');
const User = require('./models/User'); // Adjust path if necessary (e.g., "./models/User.js")

// Load environment variables (ensure .env is in this directory or use Render's env vars)
require('dotenv').config();

const clerk = new Clerk({ secretKey: process.env.CLERK_SECRET_KEY });

async function migrateUsers() {
  try {
    const users = await User.find().select("clerkId fullName email");
    console.log(`Found ${users.length} users in MongoDB to migrate to Clerk`);

    for (const user of users) {
      try {
        await clerk.users.createUser({
          externalId: user.clerkId, // Store legacy clerkId as external_id for reference
          username: user.fullName.split(" ")[0] || 'user', // Optional, Clerk generates if not provided
          emailAddress: [user.email],
          password: null, // No password needed; users can reset via Clerk
        });
        console.log(`Successfully migrated user ${user.clerkId} to Clerk`);
      } catch (err) {
        console.error(`Failed to migrate user ${user.clerkId}:`, err.message);
        // Optionally, continue to next user instead of stopping
      }
    }
    console.log("User migration to Clerk completed");
  } catch (err) {
    console.error("Migration failed:", err);
  }
}

migrateUsers().then(() => process.exit(0)).catch(err => {
  console.error("Migration process error:", err);
  process.exit(1);
});