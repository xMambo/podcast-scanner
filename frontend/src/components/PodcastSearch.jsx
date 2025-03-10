import { useState } from "react";
import axios from "axios";
import { Form, Dropdown, Container, Alert, Spinner } from "react-bootstrap";  // Unified import

const PodcastSearch = ({ onPodcastSelect }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);

  const handleSearchChange = async (e) => {
    const term = e.target.value;
    setSearchTerm(term);

    if (term.trim() === "") {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`https://itunes.apple.com/search`, {
        params: {
          term,
          entity: "podcast",
          limit: 5,  // Limit for dropdown suggestions
        },
      });
      setSearchResults(response.data.results);
      setShowDropdown(true);
    } catch (error) {
      console.error("❌ Error searching podcasts:", error);
      setError("Failed to fetch podcasts. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPodcast = (podcast) => {
    setSearchTerm(podcast.collectionName);
    setShowDropdown(false);
    setSearchResults([]);
    onPodcastSelect(podcast);
  };

  return (
    <Container className="mb-5 position-relative">
      <Form className="mb-3">
        <Form.Group controlId="searchInput" className="position-relative">
          <Form.Control
            type="text"
            placeholder="Search for podcasts..."
            value={searchTerm}
            onChange={handleSearchChange}
            autoComplete="off"
          />
          {loading && (
            <div style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)" }}>
              <Spinner animation="border" size="sm" />
            </div>
          )}
        </Form.Group>
      </Form>

      {error && (
        <Alert variant="danger" className="mt-3">
          {error}
        </Alert>
      )}

      {showDropdown && searchResults.length > 0 && (
        <Dropdown show className="w-100">
          <Dropdown.Menu className="w-100">
            {searchResults.map((podcast) => (
              <Dropdown.Item
                key={podcast.collectionId}
                onClick={() => handleSelectPodcast(podcast)}
              >
                <strong>{podcast.collectionName}</strong>
                <br />
                <small className="text-muted">{podcast.artistName}</small>
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown>
      )}
    </Container>
  );
};

export default PodcastSearch;
