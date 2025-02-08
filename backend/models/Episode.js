import mongoose from "mongoose";

const episodeSchema = new mongoose.Schema({
  title: { type: String, required: true },
  pubDate: { type: Date, required: true },
  link: { type: String, required: true },
  uniqueId: { type: String, required: true, unique: true },
  transcription: { type: String }, // if you're storing transcriptions
  audioUrl: { type: String } // new field for the audio file URL
});

export default mongoose.model("Episode", episodeSchema);
