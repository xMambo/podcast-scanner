// main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import "bootstrap/dist/css/bootstrap.min.css";
import { ClerkProvider } from "@clerk/clerk-react";
import App from "./App";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

console.log("Clerk Publishable Key in main.jsx:", PUBLISHABLE_KEY); // Debug log

if (!PUBLISHABLE_KEY) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in .env");
}

const rootElement = document.getElementById("root");

if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
        <App />
      </ClerkProvider>
    </React.StrictMode>
  );
} else {
  console.error("❌ Error: Root element not found!");
}