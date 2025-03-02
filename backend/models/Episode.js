import mongoose from "mongoose";

const episodeSchema = new mongoose.Schema({
  title: String,
  pubDate: Date,
  link: String,
  uniqueId: { type: String, unique: true },
  audioUrl: String,
  feedUrl: String,
  recommendations: {
    summary: String,
    books: [{ title: String, description: String }],
    movies: [{ title: String, description: String }],
  },
}, { timestamps: true });

export default mongoose.model("Episode", episodeSchema);