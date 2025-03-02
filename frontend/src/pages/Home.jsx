import { SignedIn, SignedOut } from "@clerk/clerk-react";
import AuthButtons from "../components/AuthButtons"; // Adjust path as needed

const Home = () => (
  <div>
    <h1>Podcast Scanner</h1>
    <SignedIn>
      <p>Welcome! Go to <a href="/podcasts">Podcasts</a> to start scanning.</p>
    </SignedIn>
    <SignedOut>
      <AuthButtons />
    </SignedOut>
  </div>
);

export default Home;