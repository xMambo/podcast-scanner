// Imports
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
const cache = new NodeCache({ stdTTL: 1800 }); // Cache for 30 minutes

// Middleware
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

// MongoDB Connection
mongoose.set("strictQuery", true);
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log(`✅ MongoDB connected`))
  .catch((err) => console.error(`❌ MongoDB connection error:`, err.stack));

// Health Check
app.get("/", (req, res) => {
  console.log("GET / request received");
  res.send("Podcast Scanner Backend Running");
});

// Transcribe audio using Whisper (Python) with caching
async function transcribeAudio(audioUrl) {
    const cacheKey = `transcription:${audioUrl}`;
    const cachedTranscription = cache.get(cacheKey);

    if (cachedTranscription) {
        console.log(`✅ Using cached transcription for URL: ${audioUrl}`);
        return cachedTranscription;  // Return cached result if available
    }

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

    // Cache the transcription result for 30 minutes (1800 seconds)
    cache.set(cacheKey, transcription.trim(), 1800);
    console.log(`✅ Cached transcription for URL: ${audioUrl}`);

    // Clean up the downloaded file
    setTimeout(() => {
        if (fs.existsSync(audioFilePath)) {
            fs.unlinkSync(audioFilePath);
            console.log(`🗑️ Deleted file: ${audioFilePath}`);
        } else {
            console.warn(`⚠️ Warning: File not found for deletion: ${audioFilePath}`);
        }
    }, 5000);  // Delay deletion by 5 seconds

    console.log("✅ Transcription completed.");
    return transcription.trim();
}

// Test transcription endpoint
app.get("/api/test-transcription", async (req, res) => {
  const testAudioUrl = "https://traffic.megaphone.fm/APO1708413358.mp3";

  try {
    console.log(`🎧 Testing Whisper transcription for URL: ${testAudioUrl}`);
    const transcription = await transcribeAudio(testAudioUrl);
    console.log(`✅ Transcription result:`, transcription);
    res.json({ transcription });
  } catch (error) {
    console.error(`❌ Error in test-transcription route:`, error.stack);
    res.status(500).json({ error: error.message });
  }
});

// Fetch and generate recommendations with Whisper transcription
app.get("/api/episode/:uniqueId/recommendations", async (req, res) => {
  console.log("GET /api/episode/:uniqueId/recommendations - Request headers:", req.headers);
  const { uniqueId } = req.params;
  const clerkId = req.auth?.userId;

  if (!clerkId) {
    return res.status(401).json({ error: "Unauthorized: Missing Clerk ID" });
  }

  try {
    console.log(`🔄 Fetching recommendations for episode uniqueId: ${uniqueId}`);
    const decodedId = decodeURIComponent(uniqueId);
    const episode = await Episode.findOne({ uniqueId: decodedId });

    if (!episode) {
      return res.status(404).json({ error: "Episode not found" });
    }

    if (episode.recommendations?.summary) {
      console.log(`✅ Returning existing recommendations.`);
      return res.json({ recommendations: episode.recommendations });
    }

    if (!episode.audioUrl) {
      return res.status(400).json({ error: "No audio URL available" });
    }

    const transcription = await transcribeAudio(episode.audioUrl);
    const newRecommendations = await extractRecommendations(transcription, episode.title);

    await Episode.updateOne(
      { uniqueId: decodedId },
      { $set: { recommendations: newRecommendations } }
    );

    res.json({ recommendations: newRecommendations });
  } catch (error) {
    console.error("❌ Error generating recommendations:", error.stack);
    res.status(500).json({ error: "Failed to generate recommendations" });
  }
});

// Catch-all route to ensure JSON responses
app.use((req, res) => {
  console.log(`Unhandled route: ${req.method} ${req.url}`);
  res.status(404).json({ error: "Route not found" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
