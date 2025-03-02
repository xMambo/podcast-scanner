import { useState, useEffect } from "react";
import {
  Container,
  Button,
  Row,
  Col,
  ListGroup,
  Spinner,
  Card,
  Image,
  Collapse,
  Alert,
} from "react-bootstrap";
import { UserButton, useUser, useAuth } from "@clerk/clerk-react";
import PodcastSearch from "./PodcastSearch";

// Optionally, install react-audio-player for a better UI (npm install react-audio-player)
import ReactAudioPlayer from "react-audio-player"; // If you choose to use this

const API_BASE_URL = "https://podcast-scanner.onrender.com";

function PodcastScanner() {
  const [episodes, setEpisodes] = useState([]);
  const [selectedPodcast, setSelectedPodcast] = useState(null);
  const [rssFeedUrl, setRssFeedUrl] = useState("");
  const [recentFeeds, setRecentFeeds] = useState([]);
  const [loadingRecs, setLoadingRecs] = useState({});
  const [recommendations, setRecommendations] = useState({});
  const [progressStatus, setProgressStatus] = useState("");
  const [expandedEpisodes, setExpandedEpisodes] = useState({});
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [playingAudio, setPlayingAudio] = useState(null); // State for current playing audio

  const { user } = useUser();
  const { getToken } = useAuth();

  useEffect(() => {
    if (user) {
      fetchRecentFeeds();
    }
  }, [user]);

  // ... (keep fetchRecentFeeds, saveRecentFeeds, handlePodcastSelect as is)

  const fetchEpisodes = async (feedUrl) => {
    const url = `${API_BASE_URL}/api/podcasts`;
    console.log("Fetching episodes from RSS feed:", url);
    setIsLoading(true);
    setError(null);
    setEpisodes([]);

    try {
      const token = await getToken();
      console.log("Fetching episodes with token:", token);
      const rssResponse = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ feedUrl }),
      });

      if (!rssResponse.ok) {
        const errData = await rssResponse.json();
        throw new Error(errData.error || `HTTP error! Status: ${rssResponse.status}`);
      }

      const rssData = await rssResponse.json();
      console.log("Received data from RSS feed:", rssData);
      setEpisodes(rssData);

      const mongoResponse = await fetch(`${url}?feedUrl=${encodeURIComponent(feedUrl)}`, {
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      if (!mongoResponse.ok) {
        console.warn("MongoDB fetch failed, using RSS data only");
        return;
      }

      const mongoData = await mongoResponse.json();
      console.log("Received MongoDB data:", mongoData);

      const mergedEpisodes = rssData.map((rssEpisode) => {
        const mongoEpisode = mongoData.find((m) => m.uniqueId === rssEpisode.uniqueId);
        return {
          ...rssEpisode,
          recommendations: mongoEpisode?.recommendations || { summary: "", books: [], movies: [] },
          transcription: mongoEpisode?.transcription || "",
        };
      });

      setEpisodes(mergedEpisodes);
      const storedRecommendations = {};
      mergedEpisodes.forEach((episode) => {
        const episodeId = episode._id || episode.uniqueId;
        if (episode.recommendations?.summary && episodeId) {
          storedRecommendations[episodeId] = episode.recommendations;
        }
      });
      setRecommendations((prev) => ({ ...prev, ...storedRecommendations }));
    } catch (err) {
      console.error("❌ Error fetching episodes from RSS feed:", err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // ... (keep handleRecentFeedClick, other functions as is)

  const handleGetRecs = async (episode) => {
    // ... (keep as is)
  };

  // New function to handle audio playback
  const handlePlayAudio = (episode) => {
    const audioUrl = episode.audioUrl;
    if (!audioUrl) {
      setError("No audio URL available for this episode.");
      return;
    }
    setPlayingAudio(audioUrl === playingAudio ? null : audioUrl); // Toggle playback
  };

  return (
    <Container className="py-5">
      {/* Remove DEBUG text if still present */}
      <div className="text-right mb-3">
        <UserButton />
      </div>
      <h1 className="text-center mb-4">Podcast Scanner</h1>
      <PodcastSearch onPodcastSelect={handlePodcastSelect} />

      {recentFeeds.length > 0 && (
        <div className="my-3">
          <h5>Recently Searched Feeds:</h5>
          <div>
            {recentFeeds
              .filter((feed) => feed.feedUrl !== rssFeedUrl)
              .map((feed, index) => (
                <Image
                  key={index}
                  src={feed.artworkUrl}
                  alt="Podcast artwork"
                  rounded
                  style={{ width: "60px", height: "60px", cursor: "pointer", margin: "0 5px 5px 0" }}
                  onClick={() => handleRecentFeedClick(feed.feedUrl)}
                  onError={(e) => { e.target.src = "https://via.placeholder.com/60"; }}
                />
              ))}
          </div>
        </div>
      )}

      {selectedPodcast && (
        <Card className="text-center my-4">
          <Card.Body>
            <Card.Title>{selectedPodcast.collectionName}</Card.Title>
            <Card.Text>{selectedPodcast.artistName}</Card.Text>
            {selectedPodcast.artworkUrl600 && (
              <Image
                src={selectedPodcast.artworkUrl600}
                alt="Podcast Art"
                rounded
                style={{ maxWidth: "250px" }}
              />
            )}
          </Card.Body>
        </Card>
      )}

      {error && <Alert variant="danger">{error}</Alert>}

      <h2 className="mt-5">Latest Episodes</h2>
      {isLoading && <Spinner animation="border" className="d-block mx-auto" />}
      {!isLoading && episodes.length === 0 && !error && (
        <p>Select a podcast to see episodes.</p>
      )}
      <ListGroup className="mb-4">
        {episodes.map((episode, index) => {
          const episodeId = episode._id || episode.uniqueId;
          const isExpanded = expandedEpisodes[episodeId];
          const isLoadingRec = loadingRecs[episodeId];

          return (
            <ListGroup.Item key={episodeId || index} className="mb-2">
              <Row className="align-items-center">
                <Col xs={8}>
                  <h5>{episode.title}</h5>
                  <small className="text-muted">
                    {new Date(episode.pubDate).toLocaleDateString()}
                  </small>
                </Col>
                <Col xs={4} className="text-end">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handlePlayAudio(episode)}
                    className="me-2"
                  >
                    {playingAudio === episode.audioUrl ? "Pause" : "Play"}
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleGetRecs(episode)}
                  >
                    {isExpanded ? "Hide Recs" : "Get Recs"}
                  </Button>
                </Col>
              </Row>

              <Collapse in={isExpanded}>
                <div className="mt-3">
                  {isLoadingRec ? (
                    <Spinner animation="border" size="sm" />
                  ) : (
                    <p>Status: {progressStatus || "No recommendations available."}</p>
                  )}
                  {(recommendations[episodeId]?.summary ||
                    recommendations[episodeId]?.books?.length > 0 ||
                    recommendations[episodeId]?.movies?.length > 0) && (
                    <Card className="mt-2">
                      <Card.Body>
                        {recommendations[episodeId]?.summary && (
                          <Card.Text>{recommendations[episodeId].summary}</Card.Text>
                        )}
                        {recommendations[episodeId]?.books?.length > 0 && (
                          <>
                            <h6>Books:</h6>
                            <ul>
                              {recommendations[episodeId].books.map((book, idx) => (
                                <li key={`book-${idx}`}>
                                  <strong>{book.title}</strong> - {book.description}
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                        {recommendations[episodeId]?.movies?.length > 0 && (
                          <>
                            <h6>Movies:</h6>
                            <ul>
                              {recommendations[episodeId].movies.map((movie, idx) => (
                                <li key={`movie-${idx}`}>
                                  <strong>{movie.title}</strong> - {movie.description}
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                      </Card.Body>
                    </Card>
                  )}
                </div>
              </Collapse>

              {/* Audio Player (Simple HTML Audio or ReactAudioPlayer) */}
              {playingAudio === episode.audioUrl && (
                // Option 1: Simple HTML Audio (No library needed)
                <audio
                  controls
                  src={playingAudio}
                  autoPlay
                  onEnded={() => setPlayingAudio(null)}
                  style={{ width: "100%", marginTop: "10px" }}
                  onError={(e) => setError("Failed to load audio. Check the audio URL.")}
                >
                  Your browser does not support the audio element.
                </audio>
                // Option 2: Using react-audio-player (if installed)
                /*
                <ReactAudioPlayer
                  src={playingAudio}
                  autoPlay
                  controls
                  onEnded={() => setPlayingAudio(null)}
                  onError={(e) => setError("Failed to load audio. Check the audio URL.")}
                />
                */
              )}
            </ListGroup.Item>
          );
        })}
      </ListGroup>
    </Container>
  );
}

export default PodcastScanner;