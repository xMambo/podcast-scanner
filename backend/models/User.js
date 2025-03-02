// backend/models/User.js
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
}, { timestamps: true });

export default mongoose.model("User", userSchema);