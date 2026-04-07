const RUNTIME_ERROR_STORAGE_KEY = "voxis:runtime-errors";
const RUNTIME_ERROR_LIMIT = 40;

function toMessage(value) {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value.message === "string") {
    return value.message;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value || "unknown error");
  }
}

function toStack(value) {
  if (value && typeof value.stack === "string") {
    return value.stack.slice(0, 4000);
  }

  return "";
}

function safeParseStoredErrors() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(RUNTIME_ERROR_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistErrorReport(report) {
  if (typeof window === "undefined") {
    return;
  }

  const existing = safeParseStoredErrors();
  const next = [report, ...existing].slice(0, RUNTIME_ERROR_LIMIT);

  try {
    window.localStorage.setItem(RUNTIME_ERROR_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota/access errors.
  }

  window.__VOXIS_RUNTIME_ERRORS__ = next;
}

function sendRuntimeReport(report) {
  const endpoint = String(import.meta.env.VITE_RUNTIME_TELEMETRY_ENDPOINT || "").trim();
  if (!endpoint || typeof window === "undefined") {
    return;
  }

  const body = JSON.stringify(report);

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(endpoint, blob);
      return;
    }
  } catch {
    // Fall through to fetch.
  }

  void fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
    keepalive: true,
  }).catch(() => {
    // Avoid noisy secondary failures.
  });
}

export function reportRuntimeError(kind, error, metadata = {}) {
  const report = {
    kind: String(kind || "runtime").slice(0, 80),
    message: toMessage(error).slice(0, 1000),
    stack: toStack(error),
    metadata,
    href: typeof window !== "undefined" ? window.location.href : "",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    timestamp: new Date().toISOString(),
  };

  persistErrorReport(report);
  sendRuntimeReport(report);

  console.error("[Voxis] Runtime error captured", report);
  return report;
}

export function installRuntimeGuards() {
  if (typeof window === "undefined") {
    return () => {};
  }

  const onError = (event) => {
    reportRuntimeError("window-error", event?.error || event?.message || event, {
      source: event?.filename || "",
      line: Number(event?.lineno || 0),
      column: Number(event?.colno || 0),
    });
  };

  const onUnhandledRejection = (event) => {
    reportRuntimeError("unhandled-rejection", event?.reason || event, {});
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);

  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}
