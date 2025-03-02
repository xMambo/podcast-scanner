import { useState, useEffect } from "react";
import PodcastSearch from "./components/PodcastSearch";

function App() {
  const API_BASE_URL = "http://localhost:5000"; // Ensure backend URL is correctly set

  // Main states
  const [message, setMessage] = useState("");
  const [episodes, setEpisodes] = useState([]);
  const [selectedEpisode, setSelectedEpisode] = useState(null);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [recommendations, setRecommendations] = useState({});
  const [progressStatus, setProgressStatus] = useState("");
  const [selectedPodcast, setSelectedPodcast] = useState(null);

  // State for RSS feed input
  const [rssFeedUrl, setRssFeedUrl] = useState("https://feeds.megaphone.fm/GLT1412515089");

  // Handle podcast selection from search
  const handlePodcastSelect = (podcast) => {
    console.log("Selected podcast:", podcast);
    setSelectedPodcast(podcast);
    if (podcast.feedUrl) {
      setRssFeedUrl(podcast.feedUrl);
      fetchEpisodes(podcast.feedUrl);
    } else {
      console.log("❌ No RSS feed URL found for this podcast.");
    }
  };

  // New state for the animated ellipsis version of the status text.
  const [animatedStatus, setAnimatedStatus] = useState("");

  // Function to fetch episodes from the backend using the provided RSS feed URL.
  const fetchEpisodes = (feedUrl) => {
    let url = `${API_BASE_URL}/api/podcasts`;
    if (feedUrl) {
      url += `?feedUrl=${encodeURIComponent(feedUrl)}`;
    }
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        console.log("Fetched episodes:", data);
        setEpisodes(data);

        const storedRecommendations = {};
        data.forEach((episode) => {
          if (episode.recommendations && episode.recommendations.summary) {
            storedRecommendations[episode._id] = episode.recommendations;
          }
        });
        setRecommendations((prevRecs) => ({
          ...prevRecs,
          ...storedRecommendations,
        }));
      })
      .catch((err) => console.error("Error fetching podcast feed:", err));
  };

  // Fetch episodes on component mount using the default feed URL.
  useEffect(() => {
    fetchEpisodes(rssFeedUrl);
  }, []); // Only once on mount

  // Handle form submission to fetch episodes from a new RSS feed.
  const handleFeedSubmit = (e) => {
    e.preventDefault();
    fetchEpisodes(rssFeedUrl);
  };

  // ✅ **Handle fetching recommendations for a given episode.**
  const handleGetRecs = async (episode) => {
    setSelectedEpisode(episode);
    setLoadingRecs(true);
    setProgressStatus("Queued");

    console.time(`[⏳] Time to extract recommendations for: ${episode.title}`);

    if (
      recommendations[episode._id] &&
      recommendations[episode._id].summary &&
      recommendations[episode._id].summary !== "Failed to generate summary."
    ) {
      console.log(`📌 Using cached recommendations for ${episode.title}`);
      setLoadingRecs(false);
      setProgressStatus("Complete");
      console.timeEnd(`[⏳] Time to extract recommendations for: ${episode.title}`);
      return;
    } else if (
      recommendations[episode._id] &&
      recommendations[episode._id].summary === "Failed to generate summary."
    ) {
      console.log(`🔄 Retrying recommendations for ${episode.title} due to previous failure.`);
      delete recommendations[episode._id];  // Clear failed cache for retry
    }

    console.log(`🚀 Fetching recommendations from the backend for ${episode.title}...`);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/episode/${episode._id}/recommendations`
      );
      const data = await response.json();

      if (data.recommendations && data.recommendations.summary) {
        setRecommendations((prevRecs) => ({
          ...prevRecs,
          [episode._id]: data.recommendations,
        }));
        setLoadingRecs(false);
        setProgressStatus("Complete");
      } else {
        console.warn(`[⚠️] No valid recommendations found for ${episode.title}.`);
        setProgressStatus("Failed to generate recommendations. Please try again.");
        setLoadingRecs(false);
      }
    } catch (error) {
      console.error("❌ Fetch error:", error);
      setProgressStatus("Error fetching recommendations. Please try again.");
      setLoadingRecs(false);
    }

    console.timeEnd(`[⏳] Time to extract recommendations for: ${episode.title}`);
  };

  // New useEffect to animate ellipses for loading statuses.
  useEffect(() => {
    const loadingStatuses = ["Queued", "Scanning for recommendations"];
    if (loadingStatuses.includes(progressStatus)) {
      let dotCount = 0;
      const interval = setInterval(() => {
        dotCount = (dotCount + 1) % 4;
        setAnimatedStatus(progressStatus + ".".repeat(dotCount));
      }, 500);
      return () => clearInterval(interval);
    } else {
      setAnimatedStatus(progressStatus);
    }
  }, [progressStatus]);

  console.log("Rendering episodes:", episodes);
  console.log("Fetched episodes from backend:", episodes);
  console.log("Fetched recommendations:", recommendations);

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>Podcast Scanner</h1>
      <p>{message}</p>

      <PodcastSearch onPodcastSelect={handlePodcastSelect} />

      <h2>Latest Episodes</h2>

      {episodes.length > 0 ? (
        <ul>
          {episodes.map((episode, index) => (
            <li key={episode._id || index} style={{ marginBottom: "10px" }}>
              <strong>{episode.title}</strong> -{" "}
              {new Date(episode.pubDate).toLocaleDateString()}
              <button onClick={() => handleGetRecs(episode)}>Get Recs</button>

              {selectedEpisode && selectedEpisode._id === episode._id && (
                <div style={{ marginTop: "10px" }}>
                  <p>Status: {animatedStatus || progressStatus}</p>
                </div>
              )}

              {recommendations[episode._id] && (
                <div>
                  <h3>Recommendations from: {episode.title}</h3>
                  <p>
                    <strong>Summary:</strong> {recommendations[episode._id].summary}
                  </p>
                  {recommendations[episode._id].books?.length > 0 && (
                    <div>
                      <h4 style={{ color: "blue" }}>📚 Books:</h4>
                      <ul>
                        {recommendations[episode._id].books.map((book, i) => (
                          <li key={i}>
                            <strong>{book.title}</strong> - {book.description}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {recommendations[episode._id].movies?.length > 0 && (
                    <div>
                      <h4 style={{ color: "red" }}>🎬 Movies:</h4>
                      <ul>
                        {recommendations[episode._id].movies.map((movie, i) => (
                          <li key={i}>
                            <strong>{movie.title}</strong> - {movie.description}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p>No episodes to display.</p>
      )}
    </div>
  );
}

export default App;
