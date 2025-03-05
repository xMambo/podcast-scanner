import { useState, useEffect } from "react";
import axios from "axios";

const PopularPodcasts = ({ onPodcastSelect }) => {
    const [podcasts, setPodcasts] = useState([]);

    useEffect(() => {
        const fetchPopularPodcasts = async () => {
            try {
                const response = await axios.get(`https://itunes.apple.com/us/rss/toppodcasts/limit=10/json`);
                setPodcasts(response.data.feed.entry);
            } catch (error) {
                console.error("❌ Error fetching popular podcasts:", error);
            }
        };
        fetchPopularPodcasts();
    }, []);

    return (
        <div>
            <h3>Popular Podcasts</h3>
            <ul>
                {podcasts.map((podcast, index) => (
                    <li key={index} style={{ marginBottom: "10px" }}>
                        <strong>{podcast["im:name"].label}</strong> - {podcast["im:artist"].label}
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
    );
};

export default PopularPodcasts;
