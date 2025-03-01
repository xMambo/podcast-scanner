import mongoose from "mongoose";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import RSSParser from "rss-parser";
import Episode from "./models/Episode.js";
import axios from "axios";
import saveUserRouter from "./api/saveUser.js";


dotenv.config();

console.log(`[${new Date().toISOString()}] MongoDB URI:`, process.env.MONGODB_URI);

const app = express();
const parser = new RSSParser();

app.use(
  cors({
    origin: "http://localhost:5173", // Allow Vite's development server
    credentials: true,
  })
);
app.use(express.json());

app.use("/api", saveUserRouter);  // Mount the route with /api prefix

// ✅ **Connect to MongoDB**
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log(`[${new Date().toISOString()}] ✅ MongoDB connected`))
  .catch((err) => console.error(`[${new Date().toISOString()}] ❌ MongoDB connection error:`, err));

app.get("/", (req, res) => {
  res.send("Podcast Scanner Backend Running");
});

// ✅ **Fetch latest podcast episodes**
app.get("/api/podcasts", async (req, res) => {
  try {
    console.log(`[${new Date().toISOString()}] 🔄 Fetching latest podcast episodes...`);

    // Use the user-provided feedUrl or fall back to the default feed
    const feedUrl = req.query.feedUrl || "https://lexfridman.com/feed/podcast/";
    console.log(`[${new Date().toISOString()}] 🔗 Using feed URL: ${feedUrl}`);

    // Validate that feedUrl is a proper URL
    try {
      new URL(feedUrl);
    } catch (err) {
      return res.status(400).json({ error: "Invalid feed URL" });
    }

    const feed = await parser.parseURL(feedUrl);

    if (!feed || !feed.items) {
      throw new Error("Invalid feed data");
    }

    // Sort items by publication date (newest first)
    const sortedItems = feed.items.sort(
      (a, b) => new Date(b.pubDate) - new Date(a.pubDate)
    );

    // Limit to the latest 20 episodes
    const latestEpisodes = sortedItems.slice(0, 20);

    // Update or insert episodes in the database
    for (const item of latestEpisodes) {
      const uniqueId = item.guid || `${item.link}_${item.pubDate}`;
      const audioUrl = item.enclosure ? item.enclosure.url : null;

      await Episode.findOneAndUpdate(
        { uniqueId },
        {
          title: item.title,
          pubDate: new Date(item.pubDate),
          link: item.link,
          uniqueId,
          audioUrl,
          feedUrl, // Save the feedUrl for later filtering if needed
        },
        { upsert: true, new: true }
      ).exec();
    }

    // If a custom feed URL was provided, you might want to filter the DB query.
    // Otherwise, this will return the latest 20 episodes overall.
    const query = req.query.feedUrl ? { feedUrl } : {};
    const episodes = await Episode.find(query).sort({ pubDate: -1 }).limit(20).lean();

    console.log(`[${new Date().toISOString()}] 📝 Episodes from DB:`, episodes);

    res.json(episodes);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Error fetching episodes:`, error);
    res.status(500).send("Error fetching podcast feed");
  }
});

// ✅ **Fetch episodes with recommendations only**
app.get("/api/episodes/with-recommendations", async (req, res) => {
  try {
    const episodes = await Episode.find({ "recommendations.summary": { $exists: true } })
      .sort({ pubDate: -1 })
      .lean();
    
    res.json(episodes);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Error fetching episodes with recommendations:`, error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ **Fetch recommendations for a specific episode**
app.get("/api/episode/:id/recommendations", async (req, res) => {
  try {
    const episodeId = req.params.id;
    const episode = await Episode.findById(episodeId).lean();

    if (!episode || !episode.audioUrl) {
      return res.status(404).json({ error: "Episode or audio not found" });
    }

    // ✅ Return cached recommendations if available
    if (episode.recommendations && episode.recommendations.summary) {
      console.log(`[${new Date().toISOString()}] 🛑 Using cached recommendations for episode: ${episode.title}`);
      return res.json({ recommendations: episode.recommendations });
    }

    console.log(`[${new Date().toISOString()}] 🔍 Transcribing audio for: ${episode.title}`);
    const transcription = await transcribeAudio(episode.audioUrl);

    console.log(`[${new Date().toISOString()}] 📌 Extracting recommendations from transcription...`);
    const recommendations = await extractRecommendations(transcription);

    // ✅ Save recommendations in DB
    await Episode.findByIdAndUpdate(episodeId, { recommendations }, { new: true });

    res.json({ recommendations });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Error extracting recommendations:`, error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ **Extract recommendations using OpenAI**
async function extractRecommendations(transcription) {
  const openAiApiKey = process.env.OPENAI_API_KEY;
  if (!openAiApiKey) {
    throw new Error("OpenAI API key is missing in .env");
  }

  console.log(`[${new Date().toISOString()}] 📌 Extracting recommendations from transcription...`);

  const prompt = `
    The following sentences were extracted from a podcast transcript. 
    Identify any book or movie titles mentioned and provide a summary.

    **Respond strictly in valid JSON format.**
    {
      "summary": "Brief summary of the discussion.",
      "books": [
        { "title": "Book Title", "description": "Short description of the book." }
      ],
      "movies": [
        { "title": "Movie Title", "description": "Short description of the movie." }
      ]
    }

    Extracted sentences:
    "${transcription}"
    `;

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You extract book and movie recommendations from podcast transcripts." },
          { role: "user", content: prompt },
        ],
        max_tokens: 500,
      },
      {
        headers: { Authorization: `Bearer ${openAiApiKey}` },
      }
    );

    console.log(`[${new Date().toISOString()}] 🛑 OpenAI Rate Limit Info:`, response.headers);

    let content = response.data.choices[0].message.content.trim();

    // ✅ Remove Markdown Code Block if present
    content = content.replace(/^```json\s*/, "").replace(/```$/, "").trim();

    if (!content.startsWith("{") || !content.endsWith("}")) {
      console.error(`[${new Date().toISOString()}] ❌ OpenAI response is not valid JSON:`, content);
      return { summary: "Failed to generate summary.", books: [], movies: [] };
    }

    const recommendations = JSON.parse(content);
    console.log(`[${new Date().toISOString()}] ✅ Extracted Recommendations:`, recommendations);

    return recommendations;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ AI Extraction Error:`, error.response?.data || error.message);
    return { summary: "Failed to generate summary.", books: [], movies: [] };
  }
}

// ✅ **Helper function: Transcribe Audio**
async function transcribeAudio(audioUrl) {
  const assemblyApiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!assemblyApiKey) {
    throw new Error("AssemblyAI API key is not set in .env");
  }

  console.log(`[${new Date().toISOString()}] 🎤 Sending audio to AssemblyAI for transcription...`);

  const transcriptResponse = await axios.post(
    "https://api.assemblyai.com/v2/transcript",
    { audio_url: audioUrl },
    { headers: { authorization: assemblyApiKey } }
  );

  const transcriptId = transcriptResponse.data.id;
  console.log(`[${new Date().toISOString()}] 🕒 Waiting for transcription: ${transcriptId}`);

  while (true) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const pollingResponse = await axios.get(
      `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
      { headers: { authorization: assemblyApiKey } }
    );

    if (pollingResponse.data.status === "completed") {
      return pollingResponse.data.text;
    }
  }
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
