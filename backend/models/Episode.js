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
    books: [
      {
        title: String,
        description: String,
        context: String,
      },
    ],
    media: [ // Updated from movies to media for TV shows, movies, films, documentaries
      {
        title: String,
        description: String,
        context: String,
      },
    ],
  },
}, { timestamps: true });

export default mongoose.model("Episode", episodeSchema);