// Imports
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import RSSParser from "rss-parser";
import OpenAI from "openai";
import { ClerkExpressWithAuth, requireAuth } from "@clerk/clerk-sdk-node";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import Episode from "./models/Episode.js"; // MongoDB Episode model
import User from "./models/User.js"; // MongoDB User model
import saveUserRouter from "./api/saveUser.js";

dotenv.config();
const app = express();
const parser = new RSSParser();

// Middleware
app.use(cors({
  origin: [
    "https://www.podsandrecs.com",
    "https://podsandrecs.com",
    process.env.FRONTEND_URL || "http://localhost:5173"
  ],
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
  res.send("Podcast Scanner Backend Running");
});

// 🛠 Save episode to MongoDB
app.post("/api/podcasts/single", requireAuth, async (req, res) => {
  const episodeData = req.body;
  if (!episodeData.uniqueId) {
    return res.status(400).json({ error: "Missing episode uniqueId" });
  }
  try {
    let episode = await Episode.findOne({ uniqueId: episodeData.uniqueId });
    if (!episode) {
      episode = new Episode(episodeData);
      await episode.save();
    }
    res.json(episode);
  } catch (error) {
    console.error("❌ Error saving episode:", error.stack);
    res.status(500).json({ error: "Failed to save episode" });
  }
});

// 🛠 Fetch recommendations for an episode
app.get("/api/episode/:uniqueId/recommendations", requireAuth, async (req, res) => {
  const { uniqueId } = req.params;
  try {
    const episode = await Episode.findOne({ uniqueId });
    if (!episode) {
      return res.status(404).json({ error: "Episode not found" });
    }
    res.json({ recommendations: episode.recommendations || {} });
  } catch (error) {
    console.error("❌ Error fetching recommendations:", error.stack);
    res.status(500).json({ error: "Failed to fetch recommendations" });
  }
});

// Fetch recent feeds
app.get("/api/user/recent-feeds", requireAuth, async (req, res) => {
  const clerkId = req.auth.userId;
  try {
    const user = await User.findOne({ clerkId });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(user.recentFeeds || []);
  } catch (error) {
    console.error("❌ Error fetching recent feeds:", error.stack);
    res.status(500).json({ error: "Failed to fetch recent feeds" });
  }
});

// Save recent feeds
app.post("/api/user/recent-feeds", requireAuth, async (req, res) => {
  const clerkId = req.auth.userId;
  const { recentFeeds } = req.body;
  try {
    const user = await User.findOneAndUpdate(
      { clerkId },
      { $set: { recentFeeds } },
      { upsert: true, new: true }
    );
    res.json(user.recentFeeds);
  } catch (error) {
    console.error("❌ Error saving recent feeds:", error.stack);
    res.status(500).json({ error: "Failed to save recent feeds" });
  }
});

// 🛠 Fetch episodes from RSS feed
app.get("/api/podcasts/raw", async (req, res) => {
  const { feedUrl } = req.query;
  if (!feedUrl) {
    return res.status(400).json({ error: "Missing feed URL" });
  }
  try {
    const parsedFeed = await parser.parseURL(feedUrl);
    const episodes = parsedFeed.items.map((item) => ({
      title: item.title,
      pubDate: item.pubDate,
      audioUrl: item.enclosure?.url || null,
      description: item.contentSnippet || "",
      uniqueId: item.guid || uuidv4(),
    }));
    res.json(episodes);
  } catch (error) {
    console.error("❌ Error fetching raw episodes:", error.stack);
    res.status(500).json({ error: "Failed to fetch episodes" });
  }
});

// 🛠 Transcribe episode audio using Assembly AI
app.post("/api/podcasts/transcribe", requireAuth, async (req, res) => {
  const { audioUrl } = req.body;
  if (!audioUrl) {
    return res.status(400).json({ error: "Missing audio URL" });
  }

  try {
    console.log(`📢 Sending ${audioUrl} to Assembly AI`);

    // Step 1: Request transcription
    const response = await axios.post(
      "https://api.assemblyai.com/v2/transcript",
      { audio_url: audioUrl },
      { headers: { authorization: process.env.ASSEMBLY_AI_API_KEY } }
    );

    const transcriptId = response.data.id;

    // Step 2: Poll for transcription completion
    let transcript;
    while (true) {
      const status = await axios.get(
        `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
        { headers: { authorization: process.env.ASSEMBLY_AI_API_KEY } }
      );

      if (status.data.status === "completed") {
        transcript = status.data.text;
        break;
      } else if (status.data.status === "failed") {
        throw new Error("Assembly AI transcription failed.");
      }

      console.log("🔄 Transcription in progress... Retrying in 5 seconds");
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    // Return transcription result
    res.json({ transcription: transcript });
  } catch (error) {
    console.error("❌ Error transcribing audio:", error.stack);
    res.status(500).json({ error: "Transcription failed" });
  }
});

// Catch-all route
app.use((req, res) => {
  console.log(`Unhandled route: ${req.method} ${req.url}`);
  res.status(404).json({ error: "Route not found" });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
