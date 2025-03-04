import { useState, useEffect, useCallback } from "react";
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
  Form,
  Pagination,
} from "react-bootstrap";
import { UserButton, useUser, useAuth } from "@clerk/clerk-react";
import PodcastSearch from "../components/PodcastSearch"; // Fixed path: "../components/PodcastSearch"
import "../PodcastScanner.css"; // Adjusted path assuming CSS is in src/

const API_BASE_URL = "https://podcast-scanner.onrender.com";

function App() {
  const [episodes, setEpisodes] = useState([]);
  const [filteredEpisodes, setFilteredEpisodes] = useState([]);
  const [selectedPodcast, setSelectedPodcast] = useState(null);
  const [rssFeedUrl, setRssFeedUrl] = useState("");
  const [recentFeeds, setRecentFeeds] = useState([]);
  const [loadingRecs, setLoadingRecs] = useState({});
  const [recommendations, setRecommendations] = useState({});
  const [progressStatus, setProgressStatus] = useState("");
  const [expandedEpisodes, setExpandedEpisodes] = useState({});
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [playingAudio, setPlayingAudio] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchKeywords, setSearchKeywords] = useState("");

  const EPISODES_PER_PAGE = 20;

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
      setSearchKeywords("");
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
    const url = `${API_BASE_URL}/api/podcasts/raw?feedUrl=${encodeURIComponent(feedUrl)}`;
    console.log(`Fetching raw episodes from ${url}`);
    setIsLoading(true);
    setError(null);
    setProgressStatus("Fetching episodes from RSS feed...");

    try {
      const token = await getToken();
      const response = await fetch(url, {
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
      console.log("Received raw data from API:", data);
      setEpisodes(data || []);
      setFilteredEpisodes(data || []);
      setProgressStatus("");
    } catch (err) {
      console.error("❌ Error fetching raw episodes from API:", err);
      setError(err.message || "Failed to fetch episodes. Please try again.");
      setProgressStatus("");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecentFeedClick = (feedUrl) => {
    console.log("Recent feed clicked, feedUrl:", feedUrl);
    const selectedFeed = recentFeeds.find((feed) => feed.feedUrl === feedUrl);
    if (selectedFeed) {
      setSelectedPodcast(selectedFeed);
      setRssFeedUrl(feedUrl);
      setSearchKeywords("");
      fetchEpisodes(feedUrl);
    } else {
      console.warn("❌ No matching feed found for feedUrl:", feedUrl);
      setError("Failed to load recent feed. Please try again.");
    }
  };

  const handleKeywordsSearch = (e) => {
    const value = e.target.value;
    console.log("Keywords search value (entire list):", value);
    setSearchKeywords(value);
    filterEpisodes();
  };

  const filterEpisodes = useCallback(() => {
    let filtered = [...episodes];

    if (searchKeywords.trim()) {
      const lowerCaseKeywords = searchKeywords.toLowerCase().split(/\s+/).filter(Boolean);
      filtered = filtered.filter(episode => {
        const title = episode.title?.toLowerCase() || "";
        const summary = episode.recommendations?.summary?.toLowerCase() || "";
        return lowerCaseKeywords.some(keyword =>
          title.includes(keyword) || summary.includes(keyword)
        );
      });
    }

    console.log("Filtered episodes (entire list):", filtered.map(ep => ep.title));
    setFilteredEpisodes(filtered);
    setCurrentPage(1);
  }, [episodes, searchKeywords]);

  const handleGetRecs = async (episode) => {
    const episodeId = episode.uniqueId;
    if (!episode || !episodeId) {
      console.error("❌ Invalid episode or missing uniqueId:", episode);
      setProgressStatus("Invalid episode data.");
      return;
    }

    setExpandedEpisodes((prev) => ({ ...prev, [episodeId]: !prev[episodeId] }));

    if (
      recommendations[episodeId]?.summary &&
      (recommendations[episodeId]?.books?.length > 0 || recommendations[episodeId]?.media?.length > 0)
    ) {
      setProgressStatus("Complete");
      return;
    }

    setLoadingRecs((prev) => ({ ...prev, [episodeId]: true }));
    setProgressStatus("Saving episode and fetching recommendations...");

    try {
      const token = await getToken();
      console.log("Token for request:", token);

      const saveResponse = await fetch(`${API_BASE_URL}/api/podcasts/single`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ ...episode, feedUrl: rssFeedUrl }),
      });
      if (!saveResponse.ok) {
        const errorData = await saveResponse.json();
        throw new Error(`Failed to save episode: ${errorData.error || saveResponse.statusText}`);
      }
      const savedEpisode = await saveResponse.json();
      console.log("Episode saved:", savedEpisode);

      const recResponse = await fetch(
        `${API_BASE_URL}/api/episode/${episodeId}/recommendations`,
        {
          headers: {
            "Authorization": `Bearer ${token}`,
          },
        }
      );
      if (!recResponse.ok) {
        const errorData = await recResponse.json();
        throw new Error(errorData.error || `HTTP error! Status: ${recResponse.status}`);
      }
      const data = await recResponse.json();
      console.log(`📢 Fetched recommendations for episode ID: ${episodeId}`, data);

      if (data.recommendations) {
        const { summary, books, media } = data.recommendations;
        if (!summary && books.length === 0 && media.length === 0) {
          console.warn("⚠️ Recommendations are empty.");
          setProgressStatus("No recommendations available.");
        } else {
          setRecommendations((prev) => ({ ...prev, [episodeId]: data.recommendations }));
          setProgressStatus("Complete");
        }
      } else {
        console.warn("❌ No recommendations found in response.");
        setProgressStatus("No recommendations available.");
      }
    } catch (error) {
      console.error("❌ Error in handleGetRecs:", error);
      setProgressStatus(`Error: ${error.message}`);
    } finally {
      setLoadingRecs((prev) => ({ ...prev, [episodeId]: false }));
    }
  };

  const handlePlayAudio = (episode) => {
    const audioUrl = episode.audioUrl;
    if (!audioUrl) {
      setError("No audio URL available for this episode.");
      return;
    }
    setPlayingAudio(audioUrl === playingAudio ? null : audioUrl);
  };

  const indexOfLastEpisode = currentPage * EPISODES_PER_PAGE;
  const indexOfFirstEpisode = indexOfLastEpisode - EPISODES_PER_PAGE;
  const currentEpisodes = filteredEpisodes.slice(indexOfFirstEpisode, indexOfLastEpisode);
  const totalPages = Math.ceil(filteredEpisodes.length / EPISODES_PER_PAGE);

  const handlePageChange = (pageNumber) => {
    console.log("Changing page to:", pageNumber);
    setCurrentPage(pageNumber);
  };

  return (
    <Container className="py-5">
      <div className="text-left mb-3">
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

      <Form className="mb-3">
        <Row>
          <Col md={4}>
            <Form.Group controlId="keywordsSearch">
              <Form.Control
                type="text"
                placeholder="Search keywords..."
                value={searchKeywords}
                onChange={handleKeywordsSearch}
                onKeyPress={(e) => e.key === 'Enter' && handleKeywordsSearch({ target: { value: searchKeywords } })}
                style={{ fontSize: "0.9rem" }}
              />
            </Form.Group>
          </Col>
        </Row>
      </Form>

      {error && <Alert variant="danger">{error}</Alert>}
      {progressStatus && <Alert variant="info">{progressStatus}</Alert>}

      <h2 className="mt-5">Latest Episodes</h2>
      {isLoading && <Spinner animation="border" className="d-block mx-auto" />}
      {!isLoading && filteredEpisodes.length === 0 && !error && (
        <p>Select a podcast or search keywords to see episodes.</p>
      )}
      <ListGroup className="mb-4">
        {currentEpisodes.map((episode, index) => {
          const episodeId = episode.uniqueId;
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
                <Col xs={4} className="text-end d-flex justify-content-end align-items-center">
                  <button
                    onClick={() => handlePlayAudio(episode)}
                    className="play-button mr-2"
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
                    recommendations[episodeId]?.media?.length > 0) && (
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
                                  <strong>{book.title}</strong> - 
                                  <div>{book.description}</div>
                                  <div><em>Context:</em> {book.context}</div>
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                        {recommendations[episodeId]?.media?.length > 0 && (
                          <>
                            <h6>Movies, Films, Documentaries, & TV Shows:</h6>
                            <ul>
                              {recommendations[episodeId].media.map((item, idx) => (
                                <li key={`media-${idx}`}>
                                  <strong>{item.title}</strong> - 
                                  <div>{item.description}</div>
                                  <div><em>Context:</em> {item.context}</div>
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

      {filteredEpisodes.length > EPISODES_PER_PAGE && (
        <Pagination className="justify-content-center">
          <Pagination.Prev
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
          />
          {Array.from({ length: totalPages }, (_, index) => (
            <Pagination.Item
              key={index + 1}
              active={index + 1 === currentPage}
              onClick={() => handlePageChange(index + 1)}
            >
              {index + 1}
            </Pagination.Item>
          ))}
          <Pagination.Next
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          />
        </Pagination>
      )}
    </Container>
  );
}

export default App;