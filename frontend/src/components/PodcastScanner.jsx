import { useState, useEffect } from "react";
import {
  Container,
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
import "./PodcastScanner.css"; // Optional: Create a CSS file for custom styles

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

  const fetchRecentFeeds = async () => {
    try {
      const token = await getToken();
      console.log("Fetching recent feeds with token:", token);
      const response = await fetch(`${API_BASE_URL}/api/user/recent-feeds`, {
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to fetch recent feeds: ${errorData.error || response.statusText}`);
      }
      const feeds = await response.json();
      console.log("Fetched recent feeds:", feeds);
      setRecentFeeds(feeds);
    } catch (err) {
      console.error("❌ Error fetching recent feeds:", err);
      setError(err.message);
    }
  };

  const saveRecentFeeds = async (updatedFeeds) => {
    try {
      const token = await getToken();
      console.log("Saving recent feeds with token:", token);
      console.log("Saving recent feeds data:", updatedFeeds);
      const response = await fetch(`${API_BASE_URL}/api/user/recent-feeds`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ recentFeeds: updatedFeeds }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to save recent feeds: ${errorData.error || response.statusText}`);
      }
      const savedFeeds = await response.json();
      console.log("Saved recent feeds:", savedFeeds);
      setRecentFeeds(savedFeeds);
    } catch (err) {
      console.error("❌ Error saving recent feeds:", err);
      setError(err.message);
    }
  };

  const handlePodcastSelect = (podcast) => {
    console.log("Podcast object from search:", podcast);
    setSelectedPodcast(podcast);
    if (podcast.feedUrl) {
      setRssFeedUrl(podcast.feedUrl);
      fetchEpisodes(podcast.feedUrl);
      setRecentFeeds((prev) => {
        const newFeed = {
          feedUrl: podcast.feedUrl,
          artworkUrl: podcast.artworkUrl100 || podcast.artworkUrl600 || podcast.artwork || "https://via.placeholder.com/60",
          artworkUrl600: podcast.artworkUrl600 || podcast.artwork || "https://via.placeholder.com/250",
          collectionName: podcast.collectionName,
          artistName: podcast.artistName,
        };
        const updatedFeeds = [newFeed, ...prev.filter((item) => item.feedUrl !== podcast.feedUrl)].slice(0, 5);
        saveRecentFeeds(updatedFeeds);
        return updatedFeeds;
      });
    }
  };

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
          // No transcription field here, as it's no longer stored
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

  const handleRecentFeedClick = (feedUrl) => {
    setRssFeedUrl(feedUrl);
    fetchEpisodes(feedUrl);
    const selectedFeed = recentFeeds.find((feed) => feed.feedUrl === feedUrl);
    if (selectedFeed) {
      setSelectedPodcast({
        feedUrl: selectedFeed.feedUrl,
        collectionName: selectedFeed.collectionName,
        artistName: selectedFeed.artistName,
        artworkUrl600: selectedFeed.artworkUrl600,
      });
    }
  };

  const handleGetRecs = async (episode) => {
    const episodeId = episode._id || episode.uniqueId;
    if (!episode || !episodeId) {
      console.error("❌ Invalid episode or missing _id/uniqueId:", episode);
      setProgressStatus("Invalid episode data.");
      return;
    }

    setExpandedEpisodes((prev) => ({ ...prev, [episodeId]: !prev[episodeId] }));

    if (
      recommendations[episodeId]?.summary &&
      (recommendations[episodeId]?.books?.length > 0 || recommendations[episodeId]?.movies?.length > 0)
    ) {
      setProgressStatus("Complete");
      return;
    }

    setLoadingRecs((prev) => ({ ...prev, [episodeId]: true }));
    setProgressStatus("Queued");

    try {
      const token = await getToken();
      const response = await fetch(
        `${API_BASE_URL}/api/episode/${episodeId}/recommendations`,
        {
          headers: {
            "Authorization": `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
      console.log(`📢 Fetched recommendations for episode ID: ${episodeId}`, data);

      if (data.recommendations) {
        const { summary, books, movies } = data.recommendations;
        if (!summary && books.length === 0 && movies.length === 0) {
          console.warn("⚠️ Recommendations are empty.");
          setProgressStatus("No recommendations available.");
        } else {
          setRecommendations((prev) => ({ ...prev, [episodeId]: data.recommendations }));
          setProgressStatus("Complete");
        }
      } else {
        console.warn("⚠️ No recommendations found in response.");
        setProgressStatus("No recommendations available.");
      }
    } catch (error) {
      console.error("❌ Error fetching recommendations:", error);
      setProgressStatus(error.message);
    } finally {
      setLoadingRecs((prev) => ({ ...prev, [episodeId]: false }));
    }
  };

  // Function to handle audio playback
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
                  <button
                    onClick={() => handlePlayAudio(episode)}
                    className="play-button me-2"
                    aria-label={playingAudio === episode.audioUrl ? "Pause" : "Play"}
                  >
                    {playingAudio === episode.audioUrl ? "⏸" : "▶"}
                  </button>
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

              {/* Audio Player (Simple HTML Audio) */}
              {playingAudio === episode.audioUrl && (
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
              )}
            </ListGroup.Item>
          );
        })}
      </ListGroup>
    </Container>
  );
}

export default PodcastScanner;