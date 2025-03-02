import React from "react";
import { SignedIn, SignedOut } from "@clerk/clerk-react";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import PodcastScanner from "./components/PodcastScanner";
import Home from "./pages/Home"; // Correct path: src/pages/Home.jsx
import SignInPage from "./pages/SignInPage"; // Correct path: src/pages/SignInPage.jsx

const App = () => {
  console.log("App.jsx rendered");
  return (
    <BrowserRouter>
      <Routes>
        {/* Root route with Home */}
        <Route
          path="/"
          element={
            <>
              <SignedIn>
                {console.log("SignedIn rendered for /")}
                <Home />
              </SignedIn>
              <SignedOut>
                {console.log("SignedOut rendered for /")}
                <Navigate to="/sign-in" replace />
              </SignedOut>
            </>
          }
        />

        {/* Podcasts route */}
        <Route
          path="/podcasts"
          element={
            <>
              <SignedIn>
                {console.log("SignedIn rendered for /podcasts")}
                <PodcastScanner />
              </SignedIn>
              <SignedOut>
                {console.log("SignedOut rendered for /podcasts")}
                <Navigate to="/sign-in" replace />
              </SignedOut>
            </>
          }
        />

        {/* Sign-in route */}
        <Route
          path="/sign-in/*"
          element={<SignInPage />}
        />

        {/* Catch-all route */}
        <Route
          path="*"
          element={
            <>
              <SignedIn>
                {console.log("Catch-all SignedIn rendered")}
                <Navigate to="/podcasts" replace />
              </SignedIn>
              <SignedOut>
                {console.log("Catch-all SignedOut rendered")}
                <Navigate to="/sign-in" replace />
              </SignedOut>
            </>
          }
        />
      </Routes>
    </BrowserRouter>
  );
};

export default App;