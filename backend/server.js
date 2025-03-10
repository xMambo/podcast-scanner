import mongoose from "mongoose";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import RSSParser from "rss-parser";
import Episode from "./models/Episode.js";
import User from "./models/User.js";
import saveUserRouter from "./api/saveUser.js";
import OpenAI from "openai";
import { ClerkExpressWithAuth } from "@clerk/clerk-sdk-node";
import { v4 as uuidv4 } from "uuid";
import NodeCache from "node-cache";
import { createHash } from "crypto";
import fs from "fs";
import axios from "axios";
import { execSync } from "child_process"; // For running Python scripts

dotenv.config();

const app = express();
const parser = new RSSParser();
const openAI = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const cache = new NodeCache({ stdTTL: 1800 });

app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = [
      process.env.FRONTEND_URL || "http://localhost:5173",
      "https://www.podsandrecs.com",
    ];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));
app.use(express.json());
app.use(ClerkExpressWithAuth({
  secretKey: process.env.CLERK_SECRET_KEY,
  publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
}));
app.use("/api", saveUserRouter);

mongoose.set("strictQuery", true);
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log(`✅ MongoDB connected`))
  .catch((err) => console.error(`❌ MongoDB connection error:`, err.stack));

app.get("/", (req, res) => {
  res.send("Podcast Scanner Backend Running");
});

// 🆕 Transcribe audio using Whisper (Python)
async function transcribeAudio(audioUrl) {
  const audioFilePath = "downloaded_audio.mp3";
  console.log(`🎤 Downloading audio file from ${audioUrl}`);
  const response = await axios.get(audioUrl, { responseType: "stream" });
  const writer = fs.createWriteStream(audioFilePath);
  response.data.pipe(writer);

  await new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });

  console.log("✅ Download complete.");

  // Run Whisper Python script for transcription
  console.log("📝 Transcribing audio using Whisper...");
  const transcription = execSync(`python transcribe.py ${audioFilePath}`).toString();
  fs.unlinkSync(audioFilePath);

  console.log(`✅ Transcription completed.`);
  return transcription.trim();
}

// 🆕 Route to get recommendations for an episode
app.get("/api/episode/:uniqueId/recommendations", async (req, res) => {
  const { uniqueId } = req.params;
  console.log(`🔍 Fetching recommendations for episode ID: ${uniqueId}`);

  try {
    const episode = await Episode.findOne({ uniqueId });
    if (!episode) {
      return res.status(404).json({ error: "Episode not found" });
    }

    if (episode.recommendations?.summary) {
      console.log(`✅ Returning cached recommendations.`);
      return res.json({ recommendations: episode.recommendations });
    }

    if (!episode.audioUrl) {
      return res.status(400).json({ error: "No audio URL available" });
    }

    const transcription = await transcribeAudio(episode.audioUrl);

    // Extract recommendations (dummy function here for example)
    const newRecommendations = {
      summary: `Transcription summary for episode ${episode.title}`,
      books: [],
      movies: [],
      media: []
    };

    await Episode.updateOne(
      { uniqueId },
      { $set: { recommendations: newRecommendations } }
    );

    console.log(`✅ Recommendations saved for episode: ${uniqueId}`);
    res.json({ recommendations: newRecommendations });
  } catch (error) {
    console.error("❌ Error fetching recommendations:", error.stack);
    res.status(500).json({ error: "Failed to fetch recommendations" });
  }
});

// 🆕 Route to test transcription
app.get("/api/test-transcription", async (req, res) => {
  const testAudioUrl = "https://traffic.megaphone.fm/APO1708413358.mp3";

  try {
    console.log(`🎧 Testing Whisper transcription for URL: ${testAudioUrl}`);
    const transcription = await transcribeAudio(testAudioUrl);
    res.json({ transcription });
  } catch (error) {
    console.error(`❌ Error in test-transcription route:`, error.stack);
    res.status(500).json({ error: error.message });
  }
});

// Error handler for invalid JSON response
app.use((err, req, res, next) => {
  console.error("❌ Error handler:", err.stack);
  res.status(500).json({ error: "Internal Server Error" });
});

// Catch-all route for undefined endpoints
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
