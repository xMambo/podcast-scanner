import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import RSSParser from "rss-parser"; // Import rss-parser

dotenv.config();
const app = express();
const parser = new RSSParser(); // Insantiate the parser

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.send("Podcast Scanner Backend Running");
});

// New endpoint to fetch a podcast RSS feed
app.get("/api/podcasts", async (req, res) => {
    try {
        // this is the RSS feed URL for testing, (right now its the JRE) test other RSS feeds also
        const feedUrl = "https://feeds.megaphone.fm/GLT1412515089";
        const feed = await parser.parseURL(feedUrl);

        // i only wanted the last 10 episodes so im implenting sortedItems
        // Sort the items by pubDate in descending order (most recent first)
        const sortedItems = feed.items.sort(
            (a, b) => new Date(b.pubdate) - new Date(a.pubDate)
        );

        // Limit to the 10 most recent episodes
        feed.items = sortedItems.slice(0, 10);

        res.json(feed);
    } catch (error) {
        console.error("Error fetching RSS feed:", error);
        res.status(500).send("Error fetching podcast feed");
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
