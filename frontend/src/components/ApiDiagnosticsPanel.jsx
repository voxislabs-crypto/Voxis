import { useState } from "react";
import { useAuthFetch } from "../hooks/useAuthFetch.js";

const styles = `
  .diag-shell {
    border: 1px solid rgba(255, 126, 126, 0.2);
    border-radius: 18px;
    background: rgba(34, 10, 14, 0.62);
    padding: 14px;
    margin-bottom: 16px;
    display: grid;
    gap: 10px;
  }

  .diag-shell h3 {
    margin: 0;
    color: #ffd6d6;
    font-size: 1rem;
  }

  .diag-shell p {
    margin: 0;
    color: #f0b8b8;
    font-size: 0.88rem;
    line-height: 1.55;
  }

  .diag-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .diag-actions button {
    border: 1px solid rgba(255, 126, 126, 0.35);
    border-radius: 999px;
    background: rgba(255, 95, 95, 0.12);
    color: #ffdcdc;
    padding: 7px 12px;
    font-size: 0.8rem;
    font-weight: 700;
  }

  .diag-actions button:disabled {
    opacity: 0.6;
    cursor: wait;
  }

  .diag-grid {
    display: grid;
    gap: 8px;
  }

  .diag-row {
    border: 1px solid rgba(255, 126, 126, 0.18);
    border-radius: 10px;
    background: rgba(18, 4, 6, 0.5);
    padding: 9px 10px;
    display: grid;
    gap: 4px;
    font-size: 0.8rem;
  }

  .diag-row.ok {
    border-color: rgba(74, 222, 128, 0.4);
    background: rgba(15, 38, 23, 0.5);
  }

  .diag-row.warn {
    border-color: rgba(255, 195, 80, 0.4);
    background: rgba(44, 32, 10, 0.48);
  }

  .diag-main {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    color: #ffdcdc;
  }

  .diag-main strong {
    color: #fff;
  }

  .diag-code {
    font-family: "JetBrains Mono", "Courier New", monospace;
    opacity: 0.95;
  }

  .diag-detail {
    color: #e9bfbf;
    word-break: break-word;
    white-space: pre-wrap;
  }
`;

function compact(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > 220 ? `${text.slice(0, 219)}...` : text;
}

export default function ApiDiagnosticsPanel({ onStatus }) {
  const authFetch = useAuthFetch();
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState([]);

  async function runSingle({ id, label, withAuth }) {
    const started = performance.now();
    try {
      const response = withAuth ? await authFetch(id) : await fetch(id, { credentials: "include" });
      const ms = Math.round(performance.now() - started);
      let payload = "";
      try {
        const data = await response.json();
        payload = compact(JSON.stringify(data));
      } catch {
        payload = compact(await response.text());
      }

      return {
        id,
        label,
        ok: response.ok,
        status: response.status,
        ms,
        payload,
      };
    } catch (error) {
      const ms = Math.round(performance.now() - started);
      return {
        id,
        label,
        ok: false,
        status: 0,
        ms,
        payload: compact(error?.message || "Network/unknown error"),
      };
    }
  }

  async function runDiagnostics() {
    setRunning(true);
    try {
      const checks = [
        { id: "/health", label: "Backend health", withAuth: false },
        { id: "/health/tts", label: "TTS health", withAuth: false },
        { id: "/me", label: "Auth /me", withAuth: true },
        { id: "/personalities", label: "Auth /personalities", withAuth: true },
      ];

      const next = [];
      for (const check of checks) {
        // Run sequentially so the order is deterministic for support screenshots.
        // eslint-disable-next-line no-await-in-loop
        next.push(await runSingle(check));
      }

      setResults(next);

      const health = next.find((item) => item.id === "/health");
      const ttsHealth = next.find((item) => item.id === "/health/tts");
      const me = next.find((item) => item.id === "/me");

      if (!health?.ok) {
        onStatus?.({ type: "error", message: "Backend health check failed. This is likely PM2/Nginx upstream, not Clerk." });
      } else if (ttsHealth && !ttsHealth.ok) {
        onStatus?.({ type: "error", message: "TTS health failed. Check optional engine install state and backend logs." });
      } else if (health.ok && me && me.status === 401) {
        onStatus?.({ type: "error", message: "Auth failed: check Clerk live/test key pairing in backend and frontend env." });
      } else if (next.every((item) => item.ok)) {
        onStatus?.({ type: "success", message: "Diagnostics passed: backend, TTS, and auth routes are reachable." });
      }
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="diag-shell">
      <style>{styles}</style>
      <h3>Connectivity Diagnostics</h3>
      <p>
        Runs quick checks against <strong>/health</strong>, <strong>/me</strong>, and <strong>/personalities</strong>
        to separate backend-upstream issues from auth configuration issues.
      </p>
      <div className="diag-actions">
        <button type="button" onClick={() => void runDiagnostics()} disabled={running}>
          {running ? "Running diagnostics..." : "Run diagnostics"}
        </button>
      </div>
      {results.length ? (
        <div className="diag-grid">
          {results.map((result) => (
            <div
              key={result.id}
              className={`diag-row ${result.ok ? "ok" : result.status >= 500 || result.status === 0 ? "warn" : ""}`}
            >
              <div className="diag-main">
                <strong>{result.label}</strong>
                <span className="diag-code">{result.id} · {result.status || "ERR"} · {result.ms}ms</span>
              </div>
              <div className="diag-detail">{result.payload || "No body"}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
