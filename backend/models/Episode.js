// models/Episode.js
import mongoose from "mongoose";

const EpisodeSchema = new mongoose.Schema({
  title: { type: String, required: true },
  pubDate: { type: Date, required: true },
  link: { type: String, required: true },
  uniqueId: { type: String, required: true, unique: true, index: true },
  audioUrl: { type: String, default: "" },
  feedUrl: { type: String, required: true, index: true },
  transcription: { type: String },
  recommendations: {
    summary: { type: String, default: "" },
    books: [{ title: { type: String }, description: { type: String } }],
    movies: [{ title: { type: String }, description: { type: String } }],
  },
  image: { type: String, default: "" },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  scannedAt: { type: Date, default: Date.now },
  duration: { type: Number, default: 0 },
  transcriptionStatus: { 
    type: String, 
    enum: ["pending", "completed", "failed"], 
    default: "pending" 
  },
  recommendationStatus: { 
    type: String, 
    enum: ["pending", "completed", "failed"], 
    default: "pending" 
  },
});

export default mongoose.model("Episode", EpisodeSchema);