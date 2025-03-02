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
    origin: "http://localhost:5173", // Ensure only your frontend can access
    credentials: true,
  })
);

app.use(express.json());
app.use("/api", saveUserRouter);

mongoose.set('strictQuery', true);
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

// ✅ **New Search Route for iTunes API**
app.get("/api/search/podcasts", async (req, res) => {
  const query = req.query.query;
  if (!query) {
    return res.status(400).json({ error: "Query parameter is required" });
  }

  console.log(`[${new Date().toISOString()}] 🔍 Searching for podcasts with query: ${query}`);

  try {
    const response = await axios.get("https://itunes.apple.com/search", {
      params: {
        term: query,
        media: "podcast",
        limit: 10,
      },
    });

    if (response.data && response.data.results) {
      console.log(`[${new Date().toISOString()}] ✅ Found ${response.data.results.length} podcasts`);
      res.json(response.data.results);
    } else {
      console.log(`[${new Date().toISOString()}] ❌ No podcasts found`);
      res.json([]);
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Error searching podcasts:`, error);
    res.status(500).json({ error: "Failed to search podcasts" });
  }
});

// ✅ **Existing Route for Fetching Episodes**
app.get("/api/podcasts", async (req, res) => {
  try {
    const feedUrl = req.query.feedUrl || "https://lexfridman.com/feed/podcast/";
    const feed = await parser.parseURL(feedUrl);
    const sortedItems = feed.items.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    const latestEpisodes = sortedItems.slice(0, 20);

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
          feedUrl,
        },
        { upsert: true, new: true }
      ).exec();
    }

    const query = req.query.feedUrl ? { feedUrl } : {};
    const episodes = await Episode.find(query).sort({ pubDate: -1 }).limit(20).lean();
    res.json(episodes);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Error fetching episodes:`, error);
    res.status(500).send("Error fetching podcast feed");
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
