import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  clerkId: { type: String, unique: true, required: true },
  fullName: { type: String, required: true },
  email: { type: String, unique: true, required: true, lowercase: true },
  recentFeeds: [
    {
      feedUrl: { type: String, required: true },
      artworkUrl: { type: String },
      artworkUrl600: { type: String },
      collectionName: { type: String },
      artistName: { type: String },
    },
  ],
  recsUsage: {
    date: { type: Date, default: Date.now }, // Tracks the day of usage
    count: { type: Number, default: 0 },    // Number of "Get Recs" uses that day
  },
}, { timestamps: true });

export default mongoose.model("User", userSchema);