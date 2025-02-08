import { useState, useEffect } from "react";

function App() {
  const [message, setMessage] = useState("");
  const [episodes, setEpisodes] = useState([]);

  useEffect(() => {
    // Fetch the base endpoint to check the backend
    fetch("http://localhost:5000/")
      .then((res) => res.text())
      .then((data) => setMessage(data))
      .catch((err) => console.error("Error fetching base message:", err));

    // Fetch the podcast RSS feed data
    fetch("http://localhost:5000/api/podcasts")
      .then((res) => res.json())
      .then((data) => {
        console.log("Fetched episodes:", data);
        setEpisodes(data);
      })
      .catch((err) => console.error("Error fetching podcast feed:", err));
  }, []);

  return (
    <div>
      <h1>Podcast Scanner</h1>
      <p>{message}</p>
      {episodes.length > 0 ? (
        <div>
          <h2>Latest Episodes</h2>
          <ul>
            {episodes.map((episode, index) => (
              <li key={episode._id || index}>
                <strong>{episode.title}</strong> -{" "}
                {new Date(episode.pubDate).toLocaleDateString()}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p>No episodes to display.</p>
      )}
    </div>
  );
}

export default App;
