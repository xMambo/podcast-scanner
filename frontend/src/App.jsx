import { useState, useEffect } from "react";

function App() {
  const API_BASE_URL = "http://localhost:5000"; // Ensure backend URL is correctly set

  // Main states
  const [message, setMessage] = useState("");
  const [episodes, setEpisodes] = useState([]);
  const [selectedEpisode, setSelectedEpisode] = useState(null);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [recommendations, setRecommendations] = useState({});
  const [progressStatus, setProgressStatus] = useState("");

  // State for RSS feed input
  const [rssFeedUrl, setRssFeedUrl] = useState("https://lexfridman.com/feed/podcast/");

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

        // Collect any recommendations already cached in the episodes.
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

  // Handle fetching recommendations for a given episode.
  const handleGetRecs = async (episode) => {
    setSelectedEpisode(episode);
    setLoadingRecs(true);
    setProgressStatus("Queued");

    console.time(`[⏳] Time to extract recommendations for: ${episode.title}`);

    // Check if recommendations already exist in state.
    if (recommendations[episode._id]) {
      console.log(`📌 Using cached recommendations for ${episode.title}`);
      setLoadingRecs(false);
      setProgressStatus("Complete");
      console.timeEnd(`[⏳] Time to extract recommendations for: ${episode.title}`);
      return;
    }

    console.log(`🚀 Fetching recommendations from the backend for ${episode.title}...`);

    try {
      const response = await fetch(`${API_BASE_URL}/api/episode/${episode._id}/recommendations`);
      const data = await response.json();

      if (data.recommendations && data.recommendations.summary) {
        setRecommendations((prevRecs) => ({
          ...prevRecs,
          [episode._id]: data.recommendations,
        }));
        setLoadingRecs(false);
        setProgressStatus("Complete");
      } else {
        setProgressStatus("No recommendations found.");
        setLoadingRecs(false);
        console.timeEnd(`[⏳] Time to extract recommendations for: ${episode.title}`);
      }
    } catch (error) {
      console.error("❌ Fetch error:", error);
      setProgressStatus("Error fetching recommendations.");
      setLoadingRecs(false);
      console.timeEnd(`[⏳] Time to extract recommendations for: ${episode.title}`);
    }
  };

  // New useEffect to animate ellipses for loading statuses.
  useEffect(() => {
    // Define which statuses should be animated.
    const loadingStatuses = ["Queued", "Scanning for recommendations"];
    // If progressStatus is one of these, start an interval.
    if (loadingStatuses.includes(progressStatus)) {
      let dotCount = 0;
      const interval = setInterval(() => {
        dotCount = (dotCount + 1) % 4; // cycles through 0,1,2,3
        setAnimatedStatus(progressStatus + ".".repeat(dotCount));
      }, 500); // update every 500ms
      return () => clearInterval(interval);
    } else {
      // For non-loading statuses, just display the plain text.
      setAnimatedStatus(progressStatus);
    }
  }, [progressStatus]);

  console.log("Rendering episodes:", episodes);

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>Podcast Scanner</h1>
      <p>{message}</p>

      {/* RSS Feed URL Input Form */}
      <form onSubmit={handleFeedSubmit} style={{ marginBottom: "20px" }}>
        <input
          type="text"
          value={rssFeedUrl}
          onChange={(e) => setRssFeedUrl(e.target.value)}
          placeholder="Enter RSS Feed URL"
          style={{ width: "300px", marginRight: "10px", padding: "5px" }}
        />
        <button type="submit" style={{ padding: "5px 10px" }}>
          Scan Feed
        </button>
      </form>

      <h2>Latest Episodes</h2>

      {episodes.length > 0 ? (
        <ul>
          {episodes.map((episode, index) => (
            <li key={episode._id || index} style={{ marginBottom: "10px" }}>
              <strong>{episode.title}</strong> -{" "}
              {new Date(episode.pubDate).toLocaleDateString()}

              {episode.audioUrl && (
                <div>
                  <audio src={episode.audioUrl} controls style={{ margin: "10px 0" }} />
                </div>
              )}

              <button onClick={() => handleGetRecs(episode)}>Get Recs</button>

              {selectedEpisode && selectedEpisode._id === episode._id && (
                <div style={{ marginTop: "10px" }}>
                  <p>
                    Status:{" "}
                    <span>
                      {/* Show animatedStatus if the status is loading; otherwise, show progressStatus */}
                      {(progressStatus === "Queued" ||
                        progressStatus === "Scanning for recommendations") 
                        ? animatedStatus 
                        : progressStatus}
                    </span>
                  </p>
                </div>
              )}

              {recommendations[episode._id] && (
                <div>
                  <h3>Recommendations from: {episode.title}</h3>
                  <p>
                    <strong>Summary:</strong> {recommendations[episode._id].summary}
                  </p>

                  {loadingRecs ? (
                    <p>Scanning for recommendations...</p>
                  ) : (
                    <div>
                      {recommendations[episode._id].books.length > 0 && (
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

                      {recommendations[episode._id].movies.length > 0 && (
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
