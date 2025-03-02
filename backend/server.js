import mongoose from "mongoose";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import RSSParser from "rss-parser";
import Episode from "./models/Episode.js";
import User from "./models/User.js";
import axios from "axios";
import saveUserRouter from "./api/saveUser.js";
import OpenAI from "openai";
import { ClerkExpressWithAuth } from "@clerk/clerk-sdk-node";

dotenv.config();

const app = express();
const parser = new RSSParser();
const openAI = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(cors({ origin: "http://localhost:5173", credentials: true }));
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
  console.log("GET / request received");
  res.send("Podcast Scanner Backend Running");
});

// Transcribe audio using AssemblyAI
async function transcribeAudio(audioUrl) {
  const assemblyApiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!assemblyApiKey) {
    throw new Error("AssemblyAI API key is not set in .env");
  }

  console.log(`🎤 Sending audio to AssemblyAI for transcription: ${audioUrl}`);
  const transcriptResponse = await axios.post(
    "https://api.assemblyai.com/v2/transcript",
    { audio_url: audioUrl },
    { headers: { authorization: assemblyApiKey } }
  );

  const transcriptId = transcriptResponse.data.id;
  console.log(`🕒 Waiting for transcription: ${transcriptId}`);

  while (true) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const pollingResponse = await axios.get(
      `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
      { headers: { authorization: assemblyApiKey } }
    );

    const status = pollingResponse.data.status;
    if (status === "completed") {
      console.log(`✅ Transcription completed for ${transcriptId}`);
      return pollingResponse.data.text;
    } else if (status === "error") {
      console.error(`❌ Transcription error: ${pollingResponse.data.error}`);
      throw new Error(`Transcription error: ${pollingResponse.data.error}`);
    }
  }
}

// Extract detailed recommendations using OpenAI
async function extractRecommendations(transcript, title) {
  const openAiApiKey = process.env.OPENAI_API_KEY;
  if (!openAiApiKey) {
    throw new Error("OpenAI API key is missing in .env");
  }

  console.log(`📌 Extracting recommendations from transcription (length: ${transcript.length} chars)`);

  const prompt = `
    You are an expert analyst tasked with extracting detailed insights from a podcast episode titled "${title}". Analyze the following transcript and provide:
    - A 2-3 sentence **summary** that captures the main topics, specific issues, arguments, or perspectives discussed, avoiding vague phrases like "explores related topics." **Exclude any content related to advertisements, sponsor messages, or product promotions (e.g., "This episode is brought to you by...", mentions of specific products or services for sale, or promotional segues unrelated to the core discussion). Focus only on the substantive conversation.**
    - A list of **books** that are either mentioned in the transcript or highly relevant to the discussion’s themes. Include as many as are appropriate (no fixed limit), each with a title and a detailed description (2-3 sentences) connecting it to the episode's content. If no books are mentioned, suggest relevant ones based on the topics discussed.
    - A list of **movies** that are either mentioned in the transcript or highly relevant to the discussion’s themes. Include as many as are appropriate (no fixed limit), each with a title and a detailed description (2-3 sentences) connecting it to the episode's content. If no movies are mentioned, suggest relevant ones based on the topics discussed.
    Respond in valid JSON format with fields: "summary" (string), "books" (array of {title, description}), and "movies" (array of {title, description}).

    Transcript:
    "${transcript.substring(0, 8000)}" (first 8000 characters provided)
  `;

  try {
    console.log("Sending request to OpenAI");
    const response = await openAI.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1500,
      temperature: 0.7,
    });

    let content = response.choices[0].message.content.trim();
    console.log(`Raw OpenAI response:`, content);
    content = content.replace(/```json\n/, "").replace(/\n```/, "").replace(/```/, "").trim();
    const recommendations = JSON.parse(content);
    console.log(`✅ Extracted detailed recommendations:`, recommendations);
    return recommendations;
  } catch (error) {
    console.error(`❌ OpenAI extraction error:`, error.stack, "Raw content:", content || "No content returned");
    throw error;
  }
}

// Helper to reset daily count if new day
const resetDailyCountIfNeeded = (user) => {
  const today = new Date().setHours(0, 0, 0, 0);
  const usageDate = new Date(user.recsUsage.date).setHours(0, 0, 0, 0);
  if (today > usageDate) {
    console.log(`Resetting recsUsage for user ${user.clerkId} - new day`);
    user.recsUsage.date = new Date();
    user.recsUsage.count = 0;
  }
  return user;
};

// Fetch and generate recommendations with rate limiting
app.get("/api/episode/:id/recommendations", async (req, res) => {
  console.log("GET /api/episode/:id/recommendations - Request headers:", req.headers);
  const { id } = req.params;
  const clerkId = req.auth?.userId;
  const ownerClerkId = "your_clerk_id_here"; // Replace with your Clerk user ID

  if (!clerkId) {
    console.log("No clerkId found in request");
    return res.status(401).json({ error: "Unauthorized: Missing Clerk ID" });
  }

  try {
    console.log(`🔄 Fetching recommendations for episode ID: ${id}, clerkId: ${clerkId}`);
    let episode = await Episode.findOne({ $or: [{ _id: id }, { uniqueId: id }] });
    if (!episode) {
      console.warn(`❌ Episode not found for id: ${id}`);
      return res.status(404).json({ error: "Episode not found" });
    }

    if (clerkId !== ownerClerkId) {
      let user = await User.findOne({ clerkId });
      if (!user) {
        console.log(`Creating new user for clerkId: ${clerkId}`);
        user = new User({
          clerkId,
          fullName: "Guest",
          email: `${clerkId}@guest.com`,
          recsUsage: { date: new Date(), count: 0 },
        });
      }

      resetDailyCountIfNeeded(user);

      if (user.recsUsage.count >= 5) {
        console.log(`❌ User ${clerkId} exceeded 5 recs/day limit`);
        return res.status(429).json({ error: "Daily 'Get Recs' limit of 5 reached" });
      }

      user.recsUsage.count += 1;
      await user.save().catch(err => {
        console.error("❌ Failed to save user recsUsage:", err.stack);
        throw new Error("Failed to update usage count");
      });
      console.log(`Updated recsUsage for ${clerkId}: ${user.recsUsage.count}`);
    } else {
      console.log(`Skipping rate limit for owner clerkId: ${clerkId}`);
    }

    const hasCompleteRecommendations =
      episode.recommendations &&
      episode.recommendations.summary &&
      !episode.recommendations.summary.includes("explores related topics") &&
      (episode.recommendations.books.length > 0 || episode.recommendations.movies.length > 0);

    if (!hasCompleteRecommendations) {
      console.log(`⚙️ Generating new recommendations for episode: ${episode.title}`);
      if (!episode.audioUrl) {
        console.warn(`⚠️ No audio URL for episode: ${episode.title}`);
        return res.status(400).json({ error: "No audio URL available" });
      }

      const transcription = await transcribeAudio(episode.audioUrl);
      const newRecommendations = await extractRecommendations(transcription, episode.title);

      await Episode.updateOne(
        { $or: [{ _id: id }, { uniqueId: id }] },
        { $set: { transcription, recommendations: newRecommendations } }
      );
      episode.transcription = transcription;
      episode.recommendations = newRecommendations;
      console.log(`✅ Saved new recommendations and transcription for: ${episode.title}`);
    } else {
      console.log(`✅ Using existing complete recommendations for: ${episode.title}`);
    }

    res.json({ recommendations: episode.recommendations });
  } catch (error) {
    console.error("❌ Error in /api/episode/:id/recommendations:", error.stack);
    res.status(500).json({ error: error.message || "Server error" });
  }
});

// Fetch episodes from MongoDB
app.get("/api/podcasts", async (req, res) => {
  console.log("GET /api/podcasts - Request query:", req.query);
  const { feedUrl } = req.query;
  try {
    const episodes = await Episode.find({ feedUrl })
      .select("title pubDate link uniqueId image audioUrl transcription recommendations")
      .sort({ pubDate: -1 })
      .limit(50);

    if (episodes.length === 0) {
      console.warn(`⚠️ No episodes found for feed: ${feedUrl}`);
      return res.status(404).json({ error: "No episodes found" });
    }

    console.log(`✅ Fetched ${episodes.length} episodes from MongoDB`);
    res.json(episodes);
  } catch (error) {
    console.error("❌ Error in GET /api/podcasts:", error.stack);
    res.status(500).json({ error: "Failed to fetch episodes" });
  }
});

// Save new episodes from RSS feed
app.post("/api/podcasts", async (req, res) => {
  console.log("POST /api/podcasts - Request body:", req.body);
  const { feedUrl } = req.body;
  if (!feedUrl) {
    console.error("❌ No feedUrl provided in request body");
    return res.status(400).json({ error: "feedUrl is required" });
  }

  console.log(`🔍 Processing RSS feed: ${feedUrl}`);
  try {
    const feed = await parser.parseURL(feedUrl);
    console.log(`✅ Successfully parsed RSS feed with ${feed.items.length} items`);
    const latestItems = feed.items.slice(0, 20);
    const episodesFromFeed = [];

    for (const item of latestItems) {
      const link = item.link || `https://fallback.example.com/${item.guid}`;
      console.log(`Processing episode: ${item.title} (uniqueId: ${item.guid})`);
      const updatedEpisode = await Episode.findOneAndUpdate(
        { uniqueId: item.guid },
        {
          $set: {
            title: item.title || "Untitled Episode",
            pubDate: new Date(item.pubDate),
            link,
            audioUrl: item.enclosure?.url || "",
            feedUrl,
          },
          $setOnInsert: {
            transcription: "",
            recommendations: { summary: "", books: [], movies: [] },
          },
        },
        {
          upsert: true,
          new: true,
        }
      );

      episodesFromFeed.push(updatedEpisode);
    }

    console.log(`✅ Processed ${episodesFromFeed.length} episodes from RSS feed (limited to latest 20)`);
    res.json(episodesFromFeed);
  } catch (error) {
    console.error("❌ Error in POST /api/podcasts:", error.stack);
    res.status(500).json({ error: "Failed to fetch episodes from RSS feed" });
  }
});

// Get user's recent feeds
app.get("/api/user/recent-feeds", async (req, res) => {
  console.log("GET /api/user/recent-feeds - Request headers:", req.headers);
  const clerkId = req.auth?.userId;
  if (!clerkId) {
    console.log("No clerkId found in request");
    return res.status(401).json({ error: "Unauthorized: Missing Clerk ID" });
  }

  try {
    console.log(`Fetching recent feeds for clerkId: ${clerkId}`);
    const user = await User.findOne({ clerkId });
    if (!user) {
      console.log(`No user found for clerkId: ${clerkId}`);
      return res.json([]); // Return empty array for new users
    }
    console.log(`Fetched recent feeds:`, user.recentFeeds || []);
    res.json(user.recentFeeds || []);
  } catch (error) {
    console.error("❌ Error in GET /api/user/recent-feeds:", error.stack);
    res.status(500).json({ error: "Server error" });
  }
});

// Save user's recent feeds
app.post("/api/user/recent-feeds", async (req, res) => {
  console.log("POST /api/user/recent-feeds - Request headers:", req.headers, "Body:", req.body);
  const clerkId = req.auth?.userId;
  const { recentFeeds } = req.body;

  if (!clerkId) {
    console.log("No clerkId found in request");
    return res.status(401).json({ error: "Unauthorized: Missing Clerk ID" });
  }
  if (!Array.isArray(recentFeeds)) {
    console.log("Invalid recentFeeds data - not an array");
    return res.status(400).json({ error: "recentFeeds must be an array" });
  }

  try {
    console.log(`Saving recent feeds for clerkId: ${clerkId}`);
    const user = await User.findOneAndUpdate(
      { clerkId },
      { $set: { recentFeeds } },
      { upsert: true, new: true }
    );
    console.log(`Saved recent feeds:`, user.recentFeeds);
    res.json(user.recentFeeds);
  } catch (error) {
    console.error("❌ Error in POST /api/user/recent-feeds:", error.stack);
    res.status(500).json({ error: "Server error" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));