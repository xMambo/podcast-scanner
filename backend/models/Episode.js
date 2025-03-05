import mongoose from "mongoose";

const episodeSchema = new mongoose.Schema(
  {
    title: { type: String, default: "Untitled Episode", trim: true },
    pubDate: { type: Date, default: Date.now, required: true },
    link: { type: String, default: "", trim: true },
    uniqueId: {
      type: String,
      unique: true,
      required: [true, "uniqueId is required"],
      trim: true,
    },
    audioUrl: { type: String, default: "", trim: true },
    feedUrl: { type: String, required: [true, "feedUrl is required"], trim: true },
    recommendations: {
      summary: { type: String, default: "", trim: true },
      books: [
        {
          title: { type: String, required: true, trim: true },
          description: { type: String, maxlength: 500, trim: true },
          context: { type: String, maxlength: 500, trim: true },
        },
      ],
      movies: [ // Changed from "media" to "movies" to match database data
        {
          title: { type: String, required: true, trim: true },
          description: { type: String, maxlength: 500, trim: true },
          context: { type: String, maxlength: 500, trim: true },
        },
      ],
    },
  },
  { timestamps: true }
);

// Add indexes for performance
episodeSchema.index({ uniqueId: 1 });
episodeSchema.index({ feedUrl: 1, pubDate: -1 });

export default mongoose.model("Episode", episodeSchema);