import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/react";

import App from "./App.jsx";

const clerkPubKey =
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ||
  import.meta.env.VITE_NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
  "";

if (!clerkPubKey) {
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#05070f",
          color: "#cfe6ff",
          fontFamily: "Manrope, sans-serif",
          padding: 24,
          textAlign: "center",
        }}
      >
        <div>
          <h1 style={{ margin: 0, marginBottom: 10, fontSize: "1.4rem" }}>
            Clerk publishable key missing at build time
          </h1>
          <p style={{ margin: 0, opacity: 0.84 }}>
            Set VITE_CLERK_PUBLISHABLE_KEY in frontend/.env, rebuild frontend, and reload.
          </p>
        </div>
      </div>
    </React.StrictMode>,
  );
} else {
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <ClerkProvider
        publishableKey={clerkPubKey}
        afterSignOutUrl="/"
        signInUrl="/sign-in"
        signUpUrl="/sign-up"
      >
        <App />
      </ClerkProvider>
    </React.StrictMode>,
  );
}
