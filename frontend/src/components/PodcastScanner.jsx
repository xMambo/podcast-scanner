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
  Alert,
  Form,
  Pagination,
} from "react-bootstrap";
import { UserButton, useUser, useAuth } from "@clerk/clerk-react";
import PodcastSearch from '@/components/PodcastSearch.jsx';
import "./PodcastScanner.css";

const API_BASE_URL = "https://podcast-scanner.onrender.com"; // Change to "http://localhost:5000" for local testing

function PodcastScanner() {
  const [episodes, setEpisodes] = useState([]);
  const [filteredEpisodes, setFilteredEpisodes] = useState([]);
  const [selectedPodcast, setSelectedPodcast] = useState(null);
  const [rssFeedUrl, setRssFeedUrl] = useState("");
  const [recentFeeds, setRecentFeeds] = useState([]);
  const [progressStatus, setProgressStatus] = useState({});
  const [transcriptions, setTranscriptions] = useState({});
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchKeywords, setSearchKeywords] = useState("");

  const EPISODES_PER_PAGE = 20;
  const { user } = useUser();
  const { getToken } = useAuth();

  useEffect(() => {
    if (user) fetchRecentFeeds();
  }, [user]);

  const fetchRecentFeeds = async () => {
    try {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/user/recent-feeds`, {
        headers: { "Authorization": `Bearer ${token}` },
      });

      if (!response.ok) throw new Error(`Failed to fetch feeds: ${response.statusText}`);
      const feeds = await response.json();
      setRecentFeeds(feeds);
    } catch (err) {
      console.error("❌ Error fetching recent feeds:", err);
      setError(err.message);
    }
  };

  const fetchEpisodes = async (feedUrl) => {
    setIsLoading(true);
    setError(null);

    try {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/podcasts/raw?feedUrl=${encodeURIComponent(feedUrl)}`, {
        headers: { "Authorization": `Bearer ${token}` },
      });

      if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
      const data = await response.json();
      setEpisodes(data || []);
      setFilteredEpisodes(data || []);
    } catch (err) {
      console.error("❌ Error fetching episodes:", err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const transcribeEpisode = async (audioUrl) => {
    try {
      setProgressStatus((prev) => ({ ...prev, [audioUrl]: "Transcribing..." }));

      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/podcasts/transcribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ audioUrl }),
      });

      if (!response.ok) throw new Error(`Transcription failed: ${response.statusText}`);

      const data = await response.json();
      setTranscriptions((prev) => ({ ...prev, [audioUrl]: data.transcription }));
      setProgressStatus((prev) => ({ ...prev, [audioUrl]: "Transcription Complete!" }));
    } catch (err) {
      console.error("❌ Error transcribing episode:", err);
      setProgressStatus((prev) => ({ ...prev, [audioUrl]: "Transcription failed" }));
    }
  };

  const indexOfLastEpisode = currentPage * EPISODES_PER_PAGE;
  const indexOfFirstEpisode = indexOfLastEpisode - EPISODES_PER_PAGE;
  const currentEpisodes = filteredEpisodes.slice(indexOfFirstEpisode, indexOfLastEpisode);
  const totalPages = Math.max(1, Math.ceil(filteredEpisodes.length / EPISODES_PER_PAGE));

  return (
    <Container className="py-5">
      <div className="text-left mb-3">
        <UserButton />
      </div>
      <h1 className="text-center mb-4">Podcast Scanner</h1>
      <PodcastSearch onPodcastSelect={(podcast) => {
        setSelectedPodcast(podcast);
        if (podcast.feedUrl) {
          setRssFeedUrl(podcast.feedUrl);
          fetchEpisodes(podcast.feedUrl);
        }
      }} />

      {error && <Alert variant="danger">{error}</Alert>}

      <h2 className="mt-5">Latest Episodes</h2>
      {isLoading && <Spinner animation="border" className="d-block mx-auto" />}
      <ListGroup className="mb-4">
        {currentEpisodes.map((episode, index) => (
          <ListGroup.Item key={episode.uniqueId || index}>
            <h5>{episode.title}</h5>
            <small className="text-muted">{new Date(episode.pubDate).toLocaleDateString()}</small>
            {episode.audioUrl ? (
              <>
                <Button
                  variant="success"
                  size="sm"
                  className="mt-2"
                  onClick={() => transcribeEpisode(episode.audioUrl)}
                >
                  Transcribe
                </Button>
                {progressStatus[episode.audioUrl] && (
                  <Alert variant="info" className="mt-2">{progressStatus[episode.audioUrl]}</Alert>
                )}
                {transcriptions[episode.audioUrl] && (
                  <Card className="mt-2 p-2">
                    <Card.Text>{transcriptions[episode.audioUrl]}</Card.Text>
                  </Card>
                )}
              </>
            ) : (
              <Alert variant="warning" className="mt-2">No audio URL available</Alert>
            )}
          </ListGroup.Item>
        ))}
      </ListGroup>

      {totalPages > 1 && (
        <Pagination className="justify-content-center">
          {Array.from({ length: totalPages }).map((_, index) => (
            <Pagination.Item key={index} active={index + 1 === currentPage} onClick={() => setCurrentPage(index + 1)}>
              {index + 1}
            </Pagination.Item>
          ))}
        </Pagination>
      )}
    </Container>
  );
}

export default PodcastScanner;
