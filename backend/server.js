import mongoose from "mongoose";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import RSSParser from "rss-parser"; // Import rss-parser
import Episode from "./models/Episode.js"; // Import your model

dotenv.config();

// Debug by Logging the Value:
console.log("MongoDB URI:", process.env.MONGODB_URI);

const app = express();
const parser = new RSSParser(); // Insantiate the parser

app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MongoDB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => console.log("MongoDB connected"))
    .catch(err => console.error("MongoDB connection error:", err));

app.get("/", (req, res) => {
    res.send("Podcast Scanner Backend Running");
});

// Endpoint: Fetch RSS feed, store the latest episodes, and return them
app.get("/api/podcasts", async (req, res) => {
    try {
        // this is the RSS feed URL for testing, (right now its the JRE) test other RSS feeds also
        const feedUrl = "https://feeds.megaphone.fm/GLT1412515089";  // Replace with your chosen feed
        const feed = await parser.parseURL(feedUrl);

        // temp log to see how many items are coming from the feed
        // console.log("Total items in feed:", feed.items.length);

        

        //Ensure feed and feed.items are valid
        if (!feed || !feed.items) {
            throw new Error("Invalid feed data");
        }

        // i only wanted the last 10 episodes so im implenting sortedItems
        // Sort the items by pubDate in descending order (most recent first)
        
        const sortedItems = feed.items.sort(
            (a, b) => new Date(b.pubDate) - new Date(a.pubDate)
        );

        console.log("Sorted items count", sortedItems.length);

        // Now declare latestEspisodes by slicing the first 10 items
        const latestEpisodes = sortedItems.slice(0,10);
        console.log("Latest episodes count:", latestEpisodes.length);

        // Debug: log details of each episode
    latestEpisodes.forEach((item, index) => {
        console.log(`Episode ${index + 1}:`, {
          title: item.title,
          link: item.link,
          guid: item.guid,
          pubDate: item.pubDate,
        });
      });

        // Limit to the 10 most recent episodes
        feed.items = sortedItems.slice(0, 10);

        // Loop over the latestEpisodes and upsert into MongoDB
    for (const item of latestEpisodes) {
        const uniqueId = item.guid || (item.link + "_" + item.pubDate);

        await Episode.findOneAndUpdate(
        { uniqueId: uniqueId },
        {
          title: item.title,
          pubDate: new Date(item.pubDate),
          link: item.link,
          uniqueId: uniqueId,
        },
        { upsert: true, new: true }
      ).exec();
    }
  
      // Retrieve the stored episodes from MongoDB
      const episodes = await Episode.find().sort({ pubDate: -1 }).limit(10);
      res.json(episodes);
    } catch (error) {
      console.error("Error fetching or saving episodes:", error);
      res.status(500).send("Error fetching podcast feed");
    }
  });

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));