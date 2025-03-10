import { useState, useEffect, useCallback, useMemo } from "react";
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
import PodcastSearch from "../components/PodcastSearch";
import "../components/PodcastScanner.css"; // Updated path

const API_BASE_URL = import.meta.env.MODE === 'production'
  ? "https://podcast-scanner.onrender.com"
  : "http://localhost:5000";

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
    if (user) fetchRecentFeeds();
  }, [user]);

  const fetchRecentFeeds = async () => {
    try {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/user/recent-feeds`, {
        headers: {
          "Authorization": `Bearer ${token}`
        },
        credentials: 'include',
      });
      if (!response.ok) throw new Error(`Failed to fetch recent feeds: ${response.statusText}`);
      const feeds = await response.json();
      setRecentFeeds(feeds);
    } catch (err) {
      console.error("❌ Error fetching recent feeds:", err);
      setError(err.message);
    }
  };

  const saveRecentFeeds = async (updatedFeeds) => {
    try {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/user/recent-feeds`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ recentFeeds: updatedFeeds }),
        credentials: 'include',
      });
      if (!response.ok) throw new Error(`Failed to save recent feeds: ${response.statusText}`);
      const savedFeeds = await response.json();
      setRecentFeeds(savedFeeds);
    } catch (err) {
      console.error("❌ Error saving recent feeds:", err);
      setError(err.message);
    }
  };

  const handlePodcastSelect = (podcast) => {
    setSelectedPodcast(podcast);
    if (podcast.feedUrl) {
      setRssFeedUrl(podcast.feedUrl);
      setSearchKeywords("");
      fetchEpisodes(podcast.feedUrl);
      setRecentFeeds((prev) => {
        const newFeed = {
          feedUrl: podcast.feedUrl,
          artworkUrl: podcast.artworkUrl100 || "https://via.placeholder.com/60",
          artworkUrl600: podcast.artworkUrl600 || "https://via.placeholder.com/250",
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
    setIsLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const response = await fetch(url, {
        headers: { "Authorization": `Bearer ${token}` },
        credentials: 'include',
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

  const handleRecentFeedClick = (feedUrl) => {
    const selectedFeed = recentFeeds.find((feed) => feed.feedUrl === feedUrl);
    if (selectedFeed) {
      setSelectedPodcast(selectedFeed);
      fetchEpisodes(feedUrl);
    } else {
      setError("Failed to load recent feed.");
    }
  };

  const handleKeywordsSearch = (e) => {
    const value = e.target.value;
    setSearchKeywords(value);
    filterEpisodes(value);
  };

  const filterEpisodes = useCallback((searchTerm) => {
    if (!searchTerm.trim()) {
      setFilteredEpisodes(episodes);
      return;
    }
    const lowerCaseKeywords = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = episodes.filter(episode =>
      lowerCaseKeywords.some(keyword => episode.title.toLowerCase().includes(keyword))
    );
    setFilteredEpisodes(filtered);
  }, [episodes]);

  const handlePageChange = (pageNumber) => setCurrentPage(pageNumber);

  const indexOfLastEpisode = currentPage * EPISODES_PER_PAGE;
  const indexOfFirstEpisode = indexOfLastEpisode - EPISODES_PER_PAGE;
  const currentEpisodes = useMemo(() => filteredEpisodes.slice(indexOfFirstEpisode, indexOfLastEpisode), [filteredEpisodes, indexOfFirstEpisode, indexOfLastEpisode]);

  const totalPages = Math.max(1, Math.ceil(filteredEpisodes.length / EPISODES_PER_PAGE));

  return (
    <Container className="py-5">
      <div className="text-left mb-3">
        <UserButton />
      </div>
      <h1 className="text-center mb-4">Podcast Scanner</h1>
      <PodcastSearch onPodcastSelect={handlePodcastSelect} />

      <h2 className="mt-5">Latest Episodes</h2>
      {isLoading && <Spinner animation="border" className="d-block mx-auto" />}
      <ListGroup className="mb-4">
        {currentEpisodes.map((episode, index) => (
          <ListGroup.Item key={`${episode.uniqueId}-${index}`}>
            <h5>{episode.title}</h5>
          </ListGroup.Item>
        ))}
      </ListGroup>

      {totalPages > 1 && (
        <Pagination className="justify-content-center">
          {Array.from({ length: totalPages }).map((_, index) => (
            <Pagination.Item key={index} active={index + 1 === currentPage} onClick={() => handlePageChange(index + 1)}>
              {index + 1}
            </Pagination.Item>
          ))}
        </Pagination>
      )}
    </Container>
  );
}

export default App;
