import mongoose from "mongoose";

const EpisodeSchema = new mongoose.Schema({
  title: String,
  pubDate: Date,
  link: String,
  uniqueId: String,
  audioUrl: String,
  recommendations: {
    summary: String,
    books: [{ title: String, description: String }],
    movies: [{ title: String, description: String }]
  }
});

export default mongoose.model("Episode", EpisodeSchema);
