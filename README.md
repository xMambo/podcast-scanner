# Podcast Scanner

Podcast Scanner is a full-stack application that allows users to scan podcast episodes for book and movie recommendations. The app transcribes podcast audio, extracts relevant recommendations using OpenAI, and stores them in a database so that future users can access cached recommendations instead of making repeated API calls.

---

## Features

- **Fetch Latest Episodes** – Retrieves podcast episodes from an RSS feed.
- **Audio Transcription** – Uses AssemblyAI to transcribe episodes.
- **AI-Powered Recommendation Extraction** – Extracts book and movie mentions using OpenAI.
- **Database Caching** – Stores recommendations in MongoDB to reduce API usage.
- **Frontend UI** – Displays episodes and recommendations using React.
- **Real-Time Updates** – Uses SSE (Server-Sent Events) for live transcription status.

---

## Future Plans

- **User Accounts** – Allow users to search and scan any podcast episode from any RSS feed.
- **Community-Driven Database** – If an episode has already been scanned by another user, the app will pull the recommendations from the database instead of making a new API request.
- **Enhanced Search & Filtering** – Users will be able to filter episodes based on recommendations.
- **Mobile-Friendly UI** – Improve responsiveness for better mobile experience.

---

## Technologies Used

### Backend:

- Node.js with Express
- MongoDB with Mongoose
- OpenAI API (GPT-4)
- AssemblyAI (for transcription)
- RSS Parsing with `rss-parser`

### Frontend:

- React with Vite
- Fetch API for data requests

---

## Installation & Setup

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/podcast-scanner.git
cd podcast-scanner
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the backend folder and add:

```
MONGODB_URI=your_mongo_db_connection
OPENAI_API_KEY=your_openai_api_key
ASSEMBLYAI_API_KEY=your_assemblyai_api_key
PORT=5000
```

### 4. Run the Backend Server

```bash
npm run dev
```

### 5. Start the Frontend

```bash
cd frontend
npm run dev
```

---

## API Endpoints

- `GET /api/podcasts` – Fetches the latest podcast episodes.
- `GET /api/episodes/with-recommendations` – Retrieves episodes that have cached recommendations.
- `GET /api/episode/:id/recommendations` – Fetches recommendations for a specific episode (if cached, otherwise transcribes & extracts recommendations).
- `GET /api/episode/:id/recommendations/stream` – SSE endpoint for real-time transcription progress.

---



