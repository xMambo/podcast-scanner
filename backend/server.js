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

app.use(cors({ 
  origin: process.env.FRONTEND_URL || "http://localhost:5173", 
  credentials: true 
}));
app.use(express.json());
app.use(ClerkExpressWithAuth({
  secretKey: process.env.CLERK_SECRET_KEY, // Use production key here if deployed
  publishableKey: process.env.CLERK_PUBLISHABLE_KEY, // Use production key here if deployed
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

// Transcribe audio using AssemblyAI, defaulting to Nano model with Best fallback
async function transcribeAudio(audioUrl, useNano = true) {
  const assemblyApiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!assemblyApiKey) {
    throw new Error("AssemblyAI API key is not set in .env");
  }

  console.log(`🎤 Sending audio to AssemblyAI for transcription: ${audioUrl} (Model: ${useNano ? "Nano" : "Best"})`);
  const config = {
    audio_url: audioUrl,
    speech_model: useNano ? "nano" : "best" // Use Nano by default, fall back to Best if needed
  };

  const transcriptResponse = await axios.post(
    "https://api.assemblyai.com/v2/transcript",
    config,
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
      console.log(`✅ Transcription completed for ${transcriptId} (Model: ${useNano ? "Nano" : "Best"})`);
      return pollingResponse.data.text;
    } else if (status === "error") {
      console.error(`❌ Transcription error: ${pollingResponse.data.error}`);
      if (useNano) {
        console.warn("Retrying with Best model due to Nano failure...");
        return transcribeAudio(audioUrl, false); // Fallback to Best if Nano fails
      }
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
    You are an expert analyst tasked with extracting detailed insights from a podcast episode titled "${title}". Analyze the entire following transcript and provide:
    - A 2-5 sentence **summary** that captures the main topics, specific issues, arguments, or perspectives discussed, avoiding vague phrases like "explores related topics." **Exclude any content related to advertisements, sponsor messages, or product promotions (e.g., "This episode is brought to you by...", mentions of specific products or services for sale, or promotional segues unrelated to the core discussion). Focus only on the substantive conversation.**
    - A comprehensive list of **books** that are explicitly mentioned, referenced, or implied in the transcript, with no cap on the number. For each book, include:
      - The **title**.
      - A detailed **description** (up to 5 sentences) summarizing its content and relevance.
      - **Context** (up to 5 sentences) explaining why the book was brought up in the episode, including the speaker, discussion topic, and any specific quotes or reasons given.
    - A comprehensive list of **movies**, **films**, **documentaries**, and **TV shows** (e.g., "Mary Tyler Moore") that are explicitly mentioned, referenced, implied, or discussed in any context in the transcript, with no cap on the number. For each item, include:
      - The **title**.
      - A detailed **description** (up to 5 sentences) summarizing its content and relevance.
      - **Context** (up to 5 sentences) explaining why the item was brought up in the episode, including the speaker, discussion topic, and any specific quotes or reasons given, even if mentioned casually or as an example (e.g., cultural references, trivia, or recent releases like a Bob Dylan movie or "Indiana Jones").
    Respond in strict, valid JSON format with fields: "summary" (string), "books" (array of {title, description, context}), and "media" (array of {title, description, context} for movies, films, documentaries, and TV shows).

    Transcript:
    "${transcript.substring(0, 24000)}" (first 24000 characters provided to capture more media references, adjust if needed)
  `;

  try {
    console.log("Sending request to OpenAI");
    const response = await openAI.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 4000,
      temperature: 0.7,
    });

    let content = response.choices[0]?.message?.content?.trim() || "";
    if (!content) {
      throw new Error("OpenAI response content is empty or undefined");
    }

    console.log(`Raw OpenAI response:`, content);
    content = content.replace(/```json\n/, "").replace(/\n```/, "").replace(/```/, "").trim();
    
    let recommendations;
    try {
      recommendations = JSON.parse(content);
    } catch (parseError) {
      console.error(`❌ JSON parsing error:`, parseError.message, "Raw content:", content);
      throw new Error(`Invalid JSON response from OpenAI: ${parseError.message}`);
    }

    if (!recommendations.summary || !Array.isArray(recommendations.books) || !Array.isArray(recommendations.media)) {
      throw new Error("OpenAI response missing required fields: summary, books, or media");
    }

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
app.get("/api/episode/:uniqueId/recommendations", async (req, res) => {
  console.log(
    "GET /api/episode/:uniqueId/recommendations - Request headers:",
    req.headers
  );
  console.log("Request auth:", req.auth); // Log Clerk auth for debugging
  const { uniqueId } = req.params;
  const clerkId = req.auth?.userId;
  const ownerClerkId = "user_2tjQfte8BQov14RMeDEQVsLuxC8";

  if (!clerkId) {
    console.log("No clerkId found in request");
    return res.status(401).json({ error: "Unauthorized: Missing Clerk ID" });
  }

  try {
    console.log(`🔄 Fetching recommendations for episode uniqueId: ${uniqueId}, clerkId: ${clerkId}`);
    // Decode the URL-encoded uniqueId to handle special characters (e.g., colons, slashes)
    const decodedId = decodeURIComponent(uniqueId);
    console.log(`Decoded uniqueId: ${decodedId}`);
    
    let episode = await Episode.findOne({ uniqueId: decodedId });
    if (!episode) {
      console.warn(`❌ Episode not found for uniqueId: ${decodedId}`);
      return res.status(404).json({ error: "Episode not found" });
    }

    // Log episode details for debugging, especially for Matt and Shane's Secret Podcast
    if (episode.feedUrl === "https://feeds.megaphone.fm/GLT1158789509") {
      console.log(`🔍 Processing episode from Matt and Shane's Secret Podcast: ${episode.title}, uniqueId: ${decodedId}, audioUrl: ${episode.audioUrl}`);
    }

    if (episode.recommendations && episode.recommendations.summary && 
        (episode.recommendations.books.length > 0 || episode.recommendations.media.length > 0)) {
      console.log(`✅ Returning existing recommendations for episode: ${episode.title}`);
      return res.json({ recommendations: episode.recommendations });
    }

    if (clerkId !== ownerClerkId) {
      let user = await User.findOne({ clerkId });
      if (!user) {
        console.log(`Creating new user for clerkId: ${clerkId}`);
        user = await User.findOneAndUpdate(
          { clerkId },
          {
            $setOnInsert: {
              clerkId,
              fullName: "Guest",
              email: `${clerkId}@guest.com`,
              recsUsage: { date: new Date(), count: 0 },
              recentFeeds: [],
            },
          },
          { upsert: true, new: true }
        );
      }

      resetDailyCountIfNeeded(user);

      if (user.recsUsage.count >= 5) {
        console.log(`❌ User ${clerkId} exceeded 5 recs/day limit`);
        return res.status(429).json({ error: "Daily 'Get Recs' limit of 5 reached" });
      }

      const updatedUser = await User.findOneAndUpdate(
        { clerkId },
        {
          $inc: { "recsUsage.count": 1 },
          $set: { "recsUsage.date": user.recsUsage.date },
        },
        { new: true }
      );
      console.log(`Updated recsUsage for ${clerkId}: ${updatedUser.recsUsage.count}`);
    } else {
      console.log(`Skipping rate limit for owner clerkId: ${clerkId}`);
    }

    console.log(`⚙️ Generating new recommendations for episode: ${episode.title}`);
    if (!episode.audioUrl) {
      console.warn(`⚠️ No audio URL for episode: ${episode.title} (feed: ${episode.feedUrl})`);
      return res.status(400).json({ error: "No audio URL available" });
    }

    const transcription = await transcribeAudio(episode.audioUrl, true);
    const newRecommendations = await extractRecommendations(transcription, episode.title);

    await Episode.updateOne(
      { uniqueId: decodedId },
      { $set: { recommendations: newRecommendations } }
    );
    console.log(`✅ Saved recommendations for: ${episode.title} (uniqueId: ${decodedId})`);

    res.json({ recommendations: newRecommendations });
  } catch (error) {
    console.error("❌ Error in /api/episode/:uniqueId/recommendations:", error.stack);
    res.status(500).json({ error: error.message || "Server error" });
  }
});

// Fetch episodes from MongoDB
app.get("/api/podcasts", async (req, res) => {
  console.log("GET /api/podcasts - Request query:", req.query);
  const { feedUrl } = req.query;
  try {
    const episodes = await Episode.find({ feedUrl })
      .select("title pubDate link uniqueId _id image audioUrl recommendations")
      .sort({ pubDate: -1 })
      .limit(50);

    console.log(`✅ Fetched ${episodes.length} episodes from MongoDB for feedUrl: ${feedUrl}`);
    res.json(episodes);
  } catch (error) {
    console.error("❌ Error in GET /api/podcasts:", error.stack);
    res.status(500).json({ error: "Failed to fetch episodes" });
  }
});

// Fetch raw episodes from RSS feed without storing in MongoDB
app.get("/api/podcasts/raw", async (req, res) => {
  console.log("GET /api/podcasts/raw - Request query:", req.query);
  const { feedUrl } = req.query;
  if (!feedUrl) {
    console.error("❌ No feedUrl provided in request query");
    return res.status(400).json({ error: "feedUrl is required" });
  }

  try {
    const feed = await parser.parseURL(feedUrl);
    console.log(`✅ Successfully parsed RSS feed with ${feed.items.length} items from ${feedUrl}`);
    const episodes = feed.items.map(item => {
      const uniqueId = item.guid || `guid-${Math.random().toString(36).substr(2, 9)}`;
      const audioUrl = item.enclosure?.url || "";
      console.log(`Parsed episode: ${item.title || "Untitled"}, uniqueId: ${uniqueId}, audioUrl: ${audioUrl}`);
      return {
        title: item.title || "Untitled Episode",
        pubDate: new Date(item.pubDate),
        link: item.link || `https://fallback.example.com/${uniqueId}`,
        uniqueId,
        audioUrl,
        feedUrl,
      };
    });
    console.log(`✅ Returned ${episodes.length} raw episodes from RSS feed`);
    res.json(episodes.slice(0, 100));
  } catch (error) {
    console.error("❌ Error in GET /api/podcasts/raw for feedUrl:", feedUrl, error.stack);
    res.status(500).json({ error: "Failed to fetch raw episodes from RSS feed" });
  }
});

// Save a single episode to MongoDB
app.post("/api/podcasts/single", async (req, res) => {
  console.log("POST /api/podcasts/single - Request body:", req.body);
  const { title, pubDate, link, uniqueId, audioUrl, feedUrl } = req.body;
  if (!uniqueId || !feedUrl) {
    console.error("❌ uniqueId and feedUrl are required in request body");
    return res.status(400).json({ error: "uniqueId and feedUrl are required" });
  }

  try {
    const updatedEpisode = await Episode.findOneAndUpdate(
      { uniqueId },
      {
        $set: {
          title: title || "Untitled Episode",
          pubDate: new Date(pubDate),
          link: link || `https://fallback.example.com/${uniqueId}`,
          audioUrl: audioUrl || "",
          feedUrl,
        },
        $setOnInsert: {
          recommendations: { summary: "", books: [], media: [] },
        },
      },
      {
        upsert: true,
        new: true,
      }
    );

    console.log(`✅ Saved episode to MongoDB: ${updatedEpisode.uniqueId} (feed: ${feedUrl})`, updatedEpisode);
    res.json(updatedEpisode);
  } catch (error) {
    console.error("❌ Error in POST /api/podcasts/single for uniqueId:", uniqueId, error.stack);
    res.status(500).json({ error: "Failed to save episode" });
  }
});

// Save all episodes from RSS feed
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
    const episodesFromFeed = [];

    if (feed.items.length === 0) {
      console.warn(`⚠️ No items found in RSS feed: ${feedUrl}`);
      return res.status(404).json({ error: "No episodes found in RSS feed" });
    }

    for (const item of feed.items) {
      const link = item.link || `https://fallback.example.com/${item.guid}`;
      const uniqueId = item.guid || `guid-${Math.random().toString(36).substr(2, 9)}`;
      const audioUrl = item.enclosure?.url || "";
      console.log(`Processing episode: ${item.title || "Untitled"} (uniqueId: ${uniqueId}, audioUrl: ${audioUrl})`);
      const updatedEpisode = await Episode.findOneAndUpdate(
        { uniqueId },
        {
          $set: {
            title: item.title || "Untitled Episode",
            pubDate: new Date(item.pubDate),
            link,
            audioUrl,
            feedUrl,
          },
          $setOnInsert: {
            recommendations: { summary: "", books: [], media: [] },
          },
        },
        {
          upsert: true,
          new: true,
        }
      );

      episodesFromFeed.push(updatedEpisode);
    }

    console.log(`✅ Processed ${episodesFromFeed.length} episodes from RSS feed: ${feedUrl}`);
    res.json(episodesFromFeed);
  } catch (error) {
    console.error("❌ Error in POST /api/podcasts for feedUrl:", feedUrl, error.stack);
    res.status(500).json({ error: "Failed to fetch episodes from RSS feed" });
  }
});

// Search episodes by guest name
app.get("/api/podcasts/search", async (req, res) => {
  console.log("GET /api/podcasts/search - Request query:", req.query);
  const { feedUrl, guest } = req.query;
  if (!feedUrl || !guest) {
    console.error("❌ feedUrl and guest are required in request query");
    return res.status(400).json({ error: "feedUrl and guest are required" });
  }

  const clerkId = req.auth?.userId;
  if (!clerkId) {
    console.log("No clerkId found in request");
    return res.status(401).json({ error: "Unauthorized: Missing Clerk ID" });
  }

  try {
    let episodes = await Episode.find({ feedUrl })
      .select("title pubDate link uniqueId _id image audioUrl recommendations")
      .sort({ pubDate: -1 });

    const lowerCaseGuest = guest.toLowerCase();
    episodes = episodes.filter(episode => {
      return (
        episode.title.toLowerCase().includes(lowerCaseGuest) ||
        (episode.recommendations?.summary?.toLowerCase()?.includes(lowerCaseGuest) || false)
      );
    });

    if (episodes.length === 0) {
      console.warn(`⚠️ No episodes found for feed: ${feedUrl} with guest: ${guest}`);
      return res.status(404).json({ error: "No episodes found for this guest" });
    }

    console.log(`✅ Fetched ${episodes.length} episodes for guest: ${guest} from MongoDB`);
    res.json(episodes);
  } catch (error) {
    console.error("❌ Error in GET /api/podcasts/search:", error.stack);
    res.status(500).json({ error: "Failed to search episodes" });
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
      return res.json([]);
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
    console.log(`Saving recent feeds for clerkId: ${clerkId}, data:`, recentFeeds);
    const user = await User.findOneAndUpdate(
      { clerkId },
      { $set: { recentFeeds } },
      { upsert: true, new: true }
    );
    console.log(`Saved recent feeds:`, user.recentFeeds);
    res.json(user.recentFeeds);
  } catch (error) {
    console.error("❌ Error in POST /api/user/recent-feeds:", error.stack);
    res.status(500).json({ error: "Failed to save recent feeds" });
  }
});

// Catch-all route to ensure JSON responses
app.use((req, res) => {
  console.log(`Unhandled route: ${req.method} ${req.url}`);
  res.status(404).json({ error: "Route not found" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));