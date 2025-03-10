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
import { ClerkExpressWithAuth, requireAuth } from "@clerk/clerk-sdk-node";
import { v4 as uuidv4 } from "uuid";
import NodeCache from "node-cache";
import { createHash } from "crypto";
import fs from "fs";
import axios from "axios";
import { exec } from "child_process";

dotenv.config();

const app = express();
const parser = new RSSParser();
const openAI = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const cache = new NodeCache({ stdTTL: 1800 });

const API_BASE_URL = "/api";

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

// 🛠 Fix: Save episode to MongoDB
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

// 🛠 Fix: Get episode recommendations
app.get("/api/episode/:uniqueId/recommendations", requireAuth, async (req, res) => {
  const { uniqueId } = req.params;
  try {
    const decodedId = decodeURIComponent(uniqueId);
    const episode = await Episode.findOne({ uniqueId: decodedId });
    if (!episode) {
      return res.status(404).json({ error: "Episode not found" });
    }
    res.json({ recommendations: episode.recommendations || {} });
  } catch (error) {
    console.error("❌ Error fetching recommendations:", error.stack);
    res.status(500).json({ error: "Failed to fetch recommendations" });
  }
});

// Get recent feeds
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

// Fetch raw episodes from RSS feed
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

// Catch-all route to ensure JSON responses
app.use((req, res) => {
  console.log(`Unhandled route: ${req.method} ${req.url}`);
  res.status(404).json({ error: "Route not found" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
