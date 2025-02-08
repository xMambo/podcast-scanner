import mongoose from "mongoose";

const episodeSchema = new mongoose.Schema({
  title: { type: String, required: true },
  pubDate: { type: Date, required: true },
  link: { type: String, required: true },
  uniqueId: { type: String, required: true, unique: true }, // Added field
});

export default mongoose.model("Episode", episodeSchema);
