import mongoose from "mongoose";

const EpisodeSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  image: {
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
  },
  
  // Link to the user that scanned this episode
userId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "User", // References the User model
  required: true
},
scannedAt: {
  type: Date,
  default: Date.now, // store when the user scanned the episode
},

});



export default mongoose.model("Episode", EpisodeSchema);
