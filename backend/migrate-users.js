// migrate-users.js (in backend/)
import { Clerk } from '@clerk/clerk-sdk-node';
import User from './models/User.js'; // Ensure this path matches your structure
import 'dotenv/config'; // Use dotenv for ES modules

const clerk = new Clerk({ secretKey: process.env.CLERK_SECRET_KEY });

async function migrateUsers() {
  try {
    const users = await User.find().select("clerkId fullName email");
    console.log(`Found ${users.length} users in MongoDB to migrate to Clerk`);

    for (const user of users) {
      try {
        await clerk.users.createUser({
          externalId: user.clerkId, // Store clerkId as external_id for reference
          username: user.fullName.split(" ")[0] || 'user', // Optional, Clerk generates if not provided
          emailAddress: [user.email],
          password: null, // No password needed; users can reset via Clerk
        });
        console.log(`Successfully migrated user ${user.clerkId} to Clerk`);
      } catch (err) {
        console.error(`Failed to migrate user ${user.clerkId}:`, err.message);
        // Continue to next user instead of stopping
      }
    }
    console.log("User migration to Clerk completed");
  } catch (err) {
    console.error("Migration failed:", err);
  }
}

migrateUsers()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("Migration process error:", err);
    process.exit(1);
  });