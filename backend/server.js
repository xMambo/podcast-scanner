import mongoose from "mongoose";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import RSSParser from "rss-parser"; // Import rss-parser
import Episode from "./models/Episode.js"; // Import your model
import axios from "axios";

dotenv.config();

// Debug by Logging the Value:
console.log("MongoDB URI:", process.env.MONGODB_URI);

const app = express();
const parser = new RSSParser(); // Instantiate the parser

app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose
    .connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    })
    .then(() => console.log("MongoDB connected"))
    .catch((err) => console.error("MongoDB connection error:", err));

app.get("/", (req, res) => {
    res.send("Podcast Scanner Backend Running");
});

async function extractRecommendations(transcription) {
    const openAiApiKey = process.env.OPENAI_API_KEY;
    if (!openAiApiKey) {
        throw new Error("OpenAI API key is missing in .env");
    }

    // **Step 1: Extract only relevant sentences**
    const keywords = ["book", "movie", "film", "documentary"];
    const sentences = transcription.match(/[^.!?]+[.!?]/g) || []; // Splits transcript into sentences
    let relevantSentences = sentences.filter(sentence =>
        keywords.some(keyword => sentence.toLowerCase().includes(keyword))
    );

    console.log("Before filtering DraftKings:", relevantSentences);

    // **Step 2: Remove any sentences mentioning "DraftKings"**
    relevantSentences = relevantSentences.filter(sentence =>
        !sentence.toLowerCase().includes("draftkings")
    );

    console.log("After filtering DraftKings:", relevantSentences);

    // **Step 3: Limit to 40 relevant sentences max (further reduces API load)**
    const limitedSentences = relevantSentences.slice(0, 40).join(" ");

    // If no relevant sentences, return early
    if (!limitedSentences) {
        console.log("No relevant mentions found in the transcript.");
        return { summary: "No books or movies were mentioned.", books: [], movies: [] };
    }

    // **Step 4: Optimized OpenAI Prompt**
    const prompt = `
    The following sentences were extracted from a podcast transcript. 
    Identify any book or movie titles mentioned and provide a summary of the conversation about them.

    - Extract the books and movies mentioned.
    - Provide a short 2-3 sentence **summary** of what was said about them.
    - Give a **brief description** of each recommended book/movie.

    Extracted sentences:
    "${limitedSentences}"

    **Example Response Format (JSON)**:
    {
      "summary": "The discussion covered classic sci-fi books and movies...",
      "books": [
        { "title": "Dune", "description": "A sci-fi epic about politics and survival on the desert planet Arrakis." }
      ],
      "movies": [
        { "title": "Blade Runner", "description": "A neo-noir film about artificial intelligence and identity." }
      ]
    }
    `;

    try {
        const response = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
                model: "gpt-4o-mini", // Optimized for cost and speed
                messages: [{ role: "system", content: prompt }],
                max_tokens: 500, // Increase slightly for summary + descriptions
            },
            {
                headers: { Authorization: `Bearer ${openAiApiKey}` },
            }
        );

        const recommendations = JSON.parse(response.data.choices[0].message.content);

        // 🎉 Final Cool Console Log

        console.log("Books Found:", recommendations.books);
        console.log("Movies Found:", recommendations.movies);
        console.log("-----------------------------------\n");
        console.log("\n🎉 Recommendation Analysis Complete! 🎬📚");
        return recommendations;
    } catch (error) {
        console.error("AI Extraction Error:", error);
        return { summary: "Failed to generate summary.", books: [], movies: [] };
    }
}

// Endpoint: Fetch RSS feed, store the latest episodes, and return them
app.get("/api/podcasts", async (req, res) => {
    try {
        const feedUrl = "https://feeds.megaphone.fm/GLT1412515089"; // Replace with your chosen feed
        const feed = await parser.parseURL(feedUrl);

        if (!feed || !feed.items) {
            throw new Error("Invalid feed data");
        }

        // Sort items by pubDate in descending order (most recent first)
        const sortedItems = feed.items.sort(
            (a, b) => new Date(b.pubDate) - new Date(a.pubDate)
        );

        console.log("Sorted items count:", sortedItems.length);

        // Get the latest 10 episodes
        const latestEpisodes = sortedItems.slice(0, 10);
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

        // Loop over the latest episodes and upsert into MongoDB
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
                },
                { upsert: true, new: true }
            ).exec();
        }

        // Retrieve stored episodes from MongoDB
        const episodes = await Episode.find().sort({ pubDate: -1 }).limit(10);
        res.json(episodes);
    } catch (error) {
        console.error("Error fetching or saving episodes:", error);
        res.status(500).send("Error fetching podcast feed");
    }
});

// SSE Endpoint for real-time transcription updates
app.get("/api/episode/:id/recommendations/stream", async (req, res) => {
    res.set({
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
    });
    res.flushHeaders();

    const episodeId = req.params.id;
    const episode = await Episode.findById(episodeId);
    if (!episode || !episode.audioUrl) {
        res.write(
            `data: ${JSON.stringify({ error: "Episode or audio not found" })}\n\n`
        );
        return res.end();
    }

    try {
        const transcriptText = await transcribeAudioSSE(episode.audioUrl, res);
        const recommendations = await extractRecommendations(transcriptText);

        res.write(
            `data: ${JSON.stringify({ status: "complete", recommendations })}\n\n`
        );
        res.end();
    } catch (error) {
        res.write(
            `data: ${JSON.stringify({ status: "error", error: error.message })}\n\n`
        );
        res.end();
    }
});

// Transcription function for SSE updates
async function transcribeAudioSSE(audioUrl, res) {
    const assemblyApiKey = process.env.ASSEMBLYAI_API_KEY;
    if (!assemblyApiKey) {
        throw new Error("AssemblyAI API key is not set in .env");
    }

    const transcriptResponse = await axios.post(
        "https://api.assemblyai.com/v2/transcript",
        { audio_url: audioUrl },
        { headers: { authorization: assemblyApiKey } }
    );
    const transcriptId = transcriptResponse.data.id;

    console.log("Transcript ID:", transcriptId);

    res.write(`data: ${JSON.stringify({ status: "queued" })}\n\n`);

    let transcriptText = null;
    while (true) {
        const pollingResponse = await axios.get(
            `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
            { headers: { authorization: assemblyApiKey } }
        );

        console.log(`Polling status: ${pollingResponse.data.status}`);

        const status = pollingResponse.data.status;
        res.write(`data: ${JSON.stringify({ status })}\n\n`);

        if (status === "completed") {
            transcriptText = pollingResponse.data.text;
            break;
        } else if (status === "error") {
            throw new Error("Transcription error: " + pollingResponse.data.error);
        }
        await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    return transcriptText;
}

// **FIXED: Define transcribeAudio for non-SSE endpoint**
async function transcribeAudio(audioUrl) {
    const assemblyApiKey = process.env.ASSEMBLYAI_API_KEY;
    if (!assemblyApiKey) {
        throw new Error("AssemblyAI API key is not set in .env");
    }

    const transcriptResponse = await axios.post(
        "https://api.assemblyai.com/v2/transcript",
        { audio_url: audioUrl },
        { headers: { authorization: assemblyApiKey } }
    );
    const transcriptId = transcriptResponse.data.id;

    console.log("Transcript ID:", transcriptId);

    let transcriptText = null;
    while (true) {
        const pollingResponse = await axios.get(
            `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
            { headers: { authorization: assemblyApiKey } }
        );

        console.log(`Polling status: ${pollingResponse.data.status}`);

        const status = pollingResponse.data.status;
        if (status === "completed") {
            transcriptText = pollingResponse.data.text;
            break;
        } else if (status === "error") {
            throw new Error("Transcription error: " + pollingResponse.data.error);
        }
        await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    return transcriptText;
}

// // Helper function: Extract recommendations from transcription
// async function extractRecommendations(transcription) {
//     const keywords = ["book", "movie", "film", "documentary"];
//     const sentences = transcription.match(/[^.!?]+[.!?]/g) || []; // Split transcript into sentences
//     const matchedSentences = [];

//     sentences.forEach((sentence, index) => {
//         const lowerCaseSentence = sentence.toLowerCase();
//         if (keywords.some(keyword => lowerCaseSentence.includes(keyword))) {
//             // Capture surrounding context
//             const context = [
//                 sentences[index - 1] || "", // Previous sentence (if exists)
//                 sentence, // Matched sentence
//                 sentences[index + 1] || "" // Next sentence (if exists)
//             ].join(" ");

//             // Find and highlight the keywords
//             let highlightedSentence = sentence;
//             keywords.forEach(keyword => {
//                 const regex = new RegExp(`\\b(${keyword})\\b`, "gi");
//                 highlightedSentence = highlightedSentence.replace(regex, "**$1**"); // Mark for highlighting
//             });

//             matchedSentences.push(highlightedSentence.trim());
//         }
//     });

//     return matchedSentences;
// }

// ✅ **Updated Route to Use AI Extraction**
app.get("/api/episode/:id/recommendations", async (req, res) => {
    try {
        const episodeId = req.params.id;
        const episode = await Episode.findById(episodeId);
        if (!episode || !episode.audioUrl) {
            return res.status(404).json({ error: "Episode or audio not found" });
        }

        const transcription = await transcribeAudio(episode.audioUrl);
        console.log("Transcription:", transcription);

        const recommendations = await extractRecommendations(transcription);

        res.json({ recommendations });
    } catch (error) {
        console.error("Error extracting recommendations:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
