import mongoose from "mongoose";

const EpisodeSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  pubDate: {
    type: Date,
    required: true,
  },
  link: {
    type: String,
    required: true,
  },
  uniqueId: {
    type: String,
    required: true,
    unique: true,
  },
  audioUrl: String,
  // New field: the RSS feed URL this episode came from
  feedUrl: {
    type: String,
    required: true,
  },
  recommendations: {
    summary: String,
    books: [
      {
        title: String,
        description: String,
      }
    ],
    movies: [
      {
        title: String,
        description: String,
      }
    ]
  }
});

export default mongoose.model("Episode", EpisodeSchema);
