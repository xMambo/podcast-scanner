import mongoose from "mongoose";

const EpisodeSchema = new mongoose.Schema({
  title: { type: String, required: true },
  pubDate: { type: Date, required: true },
  link: { type: String, required: true },
  uniqueId: { type: String, required: true, unique: true },
  audioUrl: { type: String, default: "" },
  feedUrl: { type: String, required: true, index: true },
  recommendations: {
    summary: { type: String, default: "" },
    books: [{ title: { type: String, default: "" }, description: { type: String, default: "" }, context: { type: String, default: "" } }],
    movies: [{ title: { type: String, default: "" }, description: { type: String, default: "" }, context: { type: String, default: "" } }],
    media: [{ title: { type: String, default: "" }, description: { type: String, default: "" }, context: { type: String, default: "" } }]
  },
  image: { type: String, default: "" },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  scannedAt: { type: Date, default: Date.now },
});

export default mongoose.model("Episode", EpisodeSchema);