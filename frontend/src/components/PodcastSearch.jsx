import { useState } from "react";
import axios from "axios";

const PodcastSearch = ({ onPodcastSelect }) => {
    const [searchTerm, setSearchTerm] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [loading, setLoading] = useState(false);

    const handleSearch = async () => {
        if (!searchTerm) return;
        setLoading(true);
        try {
            const response = await axios.get(`https://itunes.apple.com/search`, {
                params: {
                    term: searchTerm,
                    entity: "podcast",
                    limit: 10,
                },
            });
            setSearchResults(response.data.results);
        } catch (error) {
            console.error("❌ Error searching podcasts:", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ marginBottom: "20px" }}>
            <input
                type="text"
                placeholder="Search for podcasts..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ padding: "5px", width: "300px", marginRight: "10px" }}
            />
            <button onClick={handleSearch} style={{ padding: "5px 10px" }}>
                {loading ? "Searching..." : "Search"}
            </button>

            {searchResults.length > 0 && (
                <div style={{ marginTop: "20px" }}>
                    <h3>Search Results:</h3>
                    <ul>
                        {searchResults.map((podcast) => (
                            <li key={podcast.collectionId} style={{ marginBottom: "10px" }}>
                                <strong>{podcast.collectionName}</strong> - {podcast.artistName}
                                <button
                                    style={{ marginLeft: "10px" }}
                                    onClick={() => onPodcastSelect(podcast)}
                                >
                                    Select
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default PodcastSearch;
