import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/react";

import App from "./App.jsx";
import { installRuntimeGuards, reportRuntimeError } from "./lib/runtimeTelemetry.js";

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
    };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    reportRuntimeError("react-error-boundary", error, {
      componentStack: info?.componentStack || "",
    });
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
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
            Voxis hit a runtime issue
          </h1>
          <p style={{ margin: 0, marginBottom: 14, opacity: 0.84 }}>
            The error was captured locally. Reload to recover.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              border: "1px solid rgba(0, 200, 255, 0.35)",
              background: "rgba(0, 200, 255, 0.1)",
              color: "#cfe6ff",
              borderRadius: 999,
              padding: "10px 16px",
              cursor: "pointer",
            }}
          >
            Reload App
          </button>
        </div>
      </div>
    );
  }
}

installRuntimeGuards();

const clerkPubKey =
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ||
  import.meta.env.VITE_NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
  "";

const clerkKeyPrefix = clerkPubKey
  ? clerkPubKey.startsWith("pk_live_")
    ? "pk_live"
    : clerkPubKey.startsWith("pk_test_")
    ? "pk_test"
    : "pk_unknown"
  : "missing";

console.info(`[Voxis] Clerk publishable key status: ${clerkKeyPrefix}`);

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
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
      </ClerkProvider>
    </React.StrictMode>,
  );
}
