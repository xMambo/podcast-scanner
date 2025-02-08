import { useState, useEffect } from "react";

function App() {
  const [message, setMessage] = useState("");
  const [episodes, setEpisodes] = useState([]);
  const [selectedEpisode, setSelectedEpisode] = useState(null);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [recommendations, setRecommendations] = useState({ summary: "", books: [], movies: [] });
  const [progressStatus, setProgressStatus] = useState("");

  useEffect(() => {
    fetch("http://localhost:5000/")
      .then((res) => res.text())
      .then((data) => setMessage(data))
      .catch((err) => console.error("Error fetching base message:", err));

    fetch("http://localhost:5000/api/podcasts")
      .then((res) => res.json())
      .then((data) => setEpisodes(data))
      .catch((err) => console.error("Error fetching podcast feed:", err));
  }, []);

  const handleGetRecs = (episode) => {
    setSelectedEpisode(episode);
    setLoadingRecs(true);
    setProgressStatus("Queued");
    setRecommendations({ summary: "", books: [], movies: [] });

    const eventSource = new EventSource(
      `http://localhost:5000/api/episode/${episode._id}/recommendations/stream`
    );

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.status) {
          setProgressStatus(data.status.charAt(0).toUpperCase() + data.status.slice(1));
        }

        if (data.status === "complete" && data.recommendations) {
          setRecommendations(data.recommendations);
          setLoadingRecs(false);
          eventSource.close();
        }

        if (data.status === "error") {
          setProgressStatus("Error");
          setLoadingRecs(false);
          eventSource.close();
        }
      } catch (err) {
        console.error("Error parsing SSE data:", err);
      }
    };

    eventSource.onerror = (err) => {
      console.error("SSE Error:", err);
      setProgressStatus("Error");
      setLoadingRecs(false);
      eventSource.close();
    };
  };

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>Podcast Scanner</h1>
      <p>{message}</p>
      <h2>Latest Episodes</h2>

      {episodes.length > 0 ? (
        <ul>
          {episodes.map((episode, index) => (
            <li key={episode._id || index} style={{ marginBottom: "10px" }}>
              <strong>{episode.title}</strong> - {new Date(episode.pubDate).toLocaleDateString()}

              {episode.audioUrl && (
                <div>
                  <audio src={episode.audioUrl} controls style={{ margin: "10px 0" }} />
                </div>
              )}

              <button onClick={() => handleGetRecs(episode)}>Get Recs</button>

              {selectedEpisode && selectedEpisode._id === episode._id && (
                <div style={{ marginTop: "10px" }}>
                  <p>Status: <span>{progressStatus === "Processing" ? "Scanning for recommendations..." : progressStatus}</span></p>
                </div>
              )}

              {selectedEpisode && selectedEpisode._id === episode._id && (
                <div>
                  <h3>Recommendations from: {selectedEpisode.title}</h3>
                  <p><strong>Summary:</strong> {recommendations.summary}</p>
                  
                  {loadingRecs ? (
                    <p>Scanning for recommendations...</p>
                  ) : (
                    <div>
                      {recommendations.books.length > 0 && (
                        <div>
                          <h4 style={{ color: "blue" }}>📚 Books:</h4>
                          <ul>
                            {recommendations.books.map((book, i) => (
                              <li key={i}>
                                <strong>{book.title}</strong> - {book.description}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {recommendations.movies.length > 0 && (
                        <div>
                          <h4 style={{ color: "red" }}>🎬 Movies:</h4>
                          <ul>
                            {recommendations.movies.map((movie, i) => (
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
