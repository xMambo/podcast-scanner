import React from "react";
import { SignedIn, SignedOut, SignIn } from "@clerk/clerk-react";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import PodcastScanner from "./components/PodcastScanner";

const App = () => {
  console.log("App.jsx rendered");
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/podcasts"
          element={
            <>
              <SignedIn>
                <PodcastScanner />
              </SignedIn>
              <SignedOut>
                <SignIn
                  routing="path"
                  path="/sign-in"
                  afterSignInUrl="/podcasts"
                  afterSignOutUrl="/sign-in"
                />
              </SignedOut>
            </>
          }
        />
        <Route
          path="/sign-in/*"
          element={
            <SignIn
              routing="path"
              path="/sign-in"
              afterSignInUrl="/podcasts"
              afterSignOutUrl="/sign-in"
            />
          }
        />
        <Route
          path="/"
          element={
            <>
              <SignedIn>
                <PodcastScanner />
              </SignedIn>
              <SignedOut>
                <SignIn
                  routing="path"
                  path="/sign-in"
                  afterSignInUrl="/"
                  afterSignOutUrl="/sign-in"
                />
              </SignedOut>
            </>
          }
        />
        <Route path="*" element={<SignedOut><Navigate to="/sign-in" replace /></SignedOut>} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;