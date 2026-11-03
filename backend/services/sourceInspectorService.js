import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const SERVICE_DIR = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULT_REPO_ROOT = path.resolve(SERVICE_DIR, "..", "..");

export const LIMITS = {
  maxFileBytes: 256 * 1024,
  maxReadLines: 400,
  maxDiscoverFiles: 500,
  defaultDiscoverFiles: 200,
  maxSearchResults: 50,
  defaultSearchResults: 20,
  maxFilesScanned: 1500,
  maxQueryChars: 200,
  minQueryChars: 2,
  maxExcerptChars: 240,
  maxPathChars: 500,
  maxDepth: 40,
};

const DENIED_SEGMENTS = new Set([
  "node_modules",
  ".git",
  "mcps",
  "voice-samples",
  "voice-services",
  "dist",
  "build",
  "coverage",
  ".next",
  "sfx-cache",
  "loop-cache",
  ".dropstone",
  "music",
  "videos",
  "melotts",
  "openvoice",
]);

const SENSITIVE_BASENAMES = new Set([
  ".env",
  "id_rsa",
  "id_rsa.pub",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
  "credentials.json",
  "secrets.json",
]);

const SENSITIVE_EXTENSIONS = new Set([
  ".pem",
  ".key",
  ".p12",
  ".pfx",
  ".kdbx",
  ".sqlite",
  ".sqlite3",
  ".db",
]);

const SOURCE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".json",
  ".md",
  ".css",
  ".html",
  ".yml",
  ".yaml",
  ".rhai",
  ".ps1",
  ".sh",
  ".txt",
  ".sql",
  ".toml",
  ".xml",
]);

const SOURCE_BASENAMES = new Set(["dockerfile", "makefile", "license"]);

export class InspectorError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = "InspectorError";
    this.statusCode = statusCode;
  }
}

function fail(message, statusCode) {
  throw new InspectorError(message, statusCode);
}

export function redactSensitiveText(input) {
  let text = String(input ?? "");
  text = text.replace(
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    "[redacted]",
  );
  text = text.replace(
    /\b(api[_-]?key|secret|password|passwd|token|private[_-]?key|access[_-]?key)\b(\s*[:=]\s*)(['"])[^'"]*\3/gi,
    (_, name, separator, quote) => `${name}${separator}${quote}[redacted]${quote}`,
  );
  text = text.replace(/\bBearer\s+[A-Za-z0-9._-]{8,}/g, "Bearer [redacted]");
  text = text.replace(/\bAKIA[0-9A-Z]{16}\b/g, "[redacted]");
  text = text.replace(/\bsk-[A-Za-z0-9]{8,}\b/g, "[redacted]");
  return text;
}

function plainRequest(request) {
  if (request == null) return {};
  if (typeof request !== "object" || Array.isArray(request)) {
    fail("Request body must be an object.", 400);
  }
  return request;
}

function optionalString(value, label) {
  if (value == null) return "";
  if (typeof value !== "string") fail(`${label} must be a string.`, 400);
  return value;
}

function positiveInteger(value, label, fallback, max) {
  if (value == null) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    fail(`${label} must be a positive integer.`, 400);
  }
  return Math.min(value, max);
}

function toPosix(relativePath) {
  return String(relativePath || "").split(path.sep).join("/");
}

function isSensitiveBasename(name) {
  const lower = String(name || "").toLowerCase();
  if (!lower) return false;
  if (lower === ".env" || lower.startsWith(".env.")) return true;
  if (SENSITIVE_BASENAMES.has(lower)) return true;
  return SENSITIVE_EXTENSIONS.has(path.posix.extname(lower));
}

function isSourceBasename(name) {
  const lower = String(name || "").toLowerCase();
  if (SOURCE_BASENAMES.has(lower)) return true;
  return SOURCE_EXTENSIONS.has(path.posix.extname(lower));
}

function classifyRelative(relativePosix) {
  const parts = String(relativePosix || "").split("/").filter(Boolean);
  if (parts.some((part) => DENIED_SEGMENTS.has(part.toLowerCase()) || isSensitiveBasename(part))) {
    return "denied";
  }
  const base = parts[parts.length - 1] || "";
  if (!isSourceBasename(base)) return "ineligible";
  return "source";
}

function assertAvailable(relativePosix) {
  const kind = classifyRelative(relativePosix);
  if (kind !== "source") {
    fail("Path is not available to the source inspector.", 403);
  }
}

function lexicalParts(relativePath) {
  const raw = optionalString(relativePath, "path");
  if (raw.length > LIMITS.maxPathChars) {
    fail("path must be 500 characters or fewer.", 400);
  }
  if (raw.includes("\0")) fail("Path is outside the repository root.", 400);
  if (path.win32.isAbsolute(raw) || path.posix.isAbsolute(raw)) {
    fail("Path is outside the repository root.", 400);
  }
  if (/^[a-zA-Z]:/.test(raw)) fail("Path is outside the repository root.", 400);

  const parts = raw.split(/[\\/]+/).filter(Boolean);
  if (parts.length > LIMITS.maxDepth) fail("Path is outside the repository root.", 400);
  if (parts.some((part) => part === "..")) {
    fail("Path is outside the repository root.", 400);
  }
  return parts.filter((part) => part !== ".");
}

function isInsideRoot(rootReal, candidateReal) {
  const relative = path.relative(rootReal, candidateReal);
  if (relative === "") return true;
  if (relative.startsWith("..") || path.isAbsolute(relative)) return false;
  return !relative.split(path.sep).includes("..");
}

function assertInside(rootReal, candidateReal) {
  if (!isInsideRoot(rootReal, candidateReal)) {
    fail("Path is outside the repository root.", 400);
  }
}

function splitLines(text) {
  const lines = String(text ?? "").split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
}

function excerpt(line) {
  const redacted = redactSensitiveText(line);
  if (redacted.length <= LIMITS.maxExcerptChars) return redacted;
  return `${redacted.slice(0, LIMITS.maxExcerptChars)}…`;
}

export function createSourceInspector({ root = DEFAULT_REPO_ROOT } = {}) {
  let rootReal;
  try {
    const stat = fs.lstatSync(root);
    if (!stat.isDirectory() && !stat.isSymbolicLink()) {
      fail("Repository root is not available.", 500);
    }
    rootReal = fs.realpathSync(root);
    const rootStat = fs.statSync(rootReal);
    if (!rootStat.isDirectory()) fail("Repository root is not available.", 500);
  } catch (error) {
    if (error instanceof InspectorError) throw error;
    fail("Repository root is not available.", 500);
  }

  function resolveInside(relativePath) {
    const parts = lexicalParts(relativePath);
    let current = rootReal;
    for (const part of parts) {
      const next = path.join(current, part);
      let stat;
      try {
        stat = fs.lstatSync(next);
      } catch (error) {
        if (error?.code === "ENOENT") fail("File not found.", 404);
        fail("File not found.", 404);
      }
      if (stat.isSymbolicLink()) {
        let target;
        try {
          target = fs.realpathSync(next);
        } catch {
          fail("Path is outside the repository root.", 400);
        }
        assertInside(rootReal, target);
        current = target;
      } else {
        current = next;
      }
    }

    let resolved;
    try {
      resolved = fs.realpathSync(current);
    } catch (error) {
      if (error instanceof InspectorError) throw error;
      fail("File not found.", 404);
    }
    assertInside(rootReal, resolved);
    return {
      relativePath: toPosix(path.relative(rootReal, resolved)),
      requestedPath: parts.join("/"),
      realPath: resolved,
    };
  }

  function listFiles(directoryReal, relativePosix, files, limit) {
    let entries;
    try {
      entries = fs.readdirSync(directoryReal, { withFileTypes: true });
    } catch {
      return false;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (files.length >= limit) return true;
      if (entry.isSymbolicLink()) continue;
      const relative = relativePosix ? `${relativePosix}/${entry.name}` : entry.name;
      if (classifyRelative(relative) === "denied" && entry.isDirectory()) continue;
      const full = path.join(directoryReal, entry.name);
      if (entry.isDirectory()) {
        if (listFiles(full, relative, files, limit)) return true;
        continue;
      }
      if (!entry.isFile()) continue;
      if (classifyRelative(relative) !== "source") continue;
      let bytes = 0;
      try {
        bytes = fs.statSync(full).size;
      } catch {
        continue;
      }
      files.push({ path: relative, bytes });
    }
    return false;
  }

  function discover(request) {
    const body = plainRequest(request);
    const dir = optionalString(body.dir, "dir");
    const limit = positiveInteger(
      body.limit,
      "limit",
      LIMITS.defaultDiscoverFiles,
      LIMITS.maxDiscoverFiles,
    );
    const requested = dir ? lexicalParts(dir).join("/") : "";
    if (requested && classifyRelative(`${requested}/placeholder.js`) === "denied") {
      fail("Path is not available to the source inspector.", 403);
    }
    const resolved = resolveInside(requested);
    let stat;
    try {
      stat = fs.statSync(resolved.realPath);
    } catch {
      fail("File not found.", 404);
    }
    if (!stat.isDirectory()) fail("dir must be a directory.", 400);

    const files = [];
    const truncated = listFiles(resolved.realPath, resolved.relativePath, files, limit);
    files.sort((left, right) => left.path.localeCompare(right.path));
    return { files, truncated, limit };
  }

  function read(request) {
    const body = plainRequest(request);
    const requested = optionalString(body.path, "path");
    if (!requested.trim()) fail("path is required.", 400);
    const parts = lexicalParts(requested);
    const relative = parts.join("/");
    assertAvailable(relative);

    const resolved = resolveInside(relative);
    assertAvailable(resolved.relativePath || resolved.requestedPath);
    let stat;
    try {
      stat = fs.lstatSync(resolved.realPath);
    } catch {
      fail("File not found.", 404);
    }
    if (stat.isSymbolicLink()) fail("Path is outside the repository root.", 400);
    if (!stat.isFile()) fail("path must be a file.", 400);
    if (stat.size > LIMITS.maxFileBytes) {
      fail("File exceeds the source inspector size limit.", 413);
    }

    let raw;
    try {
      raw = fs.readFileSync(resolved.realPath);
    } catch {
      fail("File not found.", 404);
    }
    if (raw.includes(0)) fail("Path is not available to the source inspector.", 403);

    const lines = splitLines(raw.toString("utf8"));
    const totalLines = lines.length;
    const startLine = positiveInteger(body.startLine, "startLine", 1, Number.MAX_SAFE_INTEGER);
    if (totalLines === 0) {
      return {
        path: relative,
        startLine: 1,
        endLine: 0,
        totalLines: 0,
        truncated: false,
        content: "",
      };
    }
    if (startLine > totalLines) fail("startLine is past the end of the file.", 400);
    const requestedEnd = positiveInteger(
      body.endLine,
      "endLine",
      totalLines,
      Number.MAX_SAFE_INTEGER,
    );
    if (requestedEnd < startLine) {
      fail("endLine must be greater than or equal to startLine.", 400);
    }
    const cappedEnd = Math.min(requestedEnd, totalLines, startLine + LIMITS.maxReadLines - 1);
    const slice = lines.slice(startLine - 1, cappedEnd).map((line) => redactSensitiveText(line));
    return {
      path: relative,
      startLine,
      endLine: cappedEnd,
      totalLines,
      truncated: cappedEnd < Math.min(requestedEnd, totalLines),
      content: slice.join("\n"),
    };
  }

  function search(request) {
    const body = plainRequest(request);
    const query = optionalString(body.query, "query");
    if (!query.trim()) fail("query is required.", 400);
    if (query.length < LIMITS.minQueryChars) fail("query must be at least 2 characters.", 400);
    if (query.length > LIMITS.maxQueryChars) fail("query must be 200 characters or fewer.", 400);
    const dir = optionalString(body.dir, "dir");
    const limit = positiveInteger(
      body.limit,
      "limit",
      LIMITS.defaultSearchResults,
      LIMITS.maxSearchResults,
    );
    const discovered = discover({ dir, limit: LIMITS.maxDiscoverFiles });
    const matches = [];
    let scanned = 0;
    let truncated = discovered.truncated;

    for (const file of discovered.files) {
      if (scanned >= LIMITS.maxFilesScanned || matches.length >= limit) {
        truncated = true;
        break;
      }
      scanned += 1;
      if (file.bytes > LIMITS.maxFileBytes) continue;
      let resolved;
      try {
        resolved = resolveInside(file.path);
        assertAvailable(resolved.relativePath || resolved.requestedPath);
      } catch {
        continue;
      }
      let stat;
      try {
        stat = fs.lstatSync(resolved.realPath);
      } catch {
        continue;
      }
      if (stat.isSymbolicLink() || !stat.isFile() || stat.size > LIMITS.maxFileBytes) continue;
      let raw;
      try {
        raw = fs.readFileSync(resolved.realPath);
      } catch {
        continue;
      }
      if (raw.includes(0)) continue;
      const lines = splitLines(raw.toString("utf8"));
      for (let index = 0; index < lines.length; index += 1) {
        if (!lines[index].includes(query)) continue;
        matches.push({
          path: file.path,
          line: index + 1,
          text: excerpt(lines[index]),
        });
        if (matches.length >= limit) {
          truncated = index < lines.length - 1 || scanned < discovered.files.length;
          break;
        }
      }
    }

    return { matches, truncated, limit, scanned };
  }

  return { discover, read, search, root: rootReal };
}

let defaultInspector;

function sharedInspector() {
  if (!defaultInspector) defaultInspector = createSourceInspector({ root: DEFAULT_REPO_ROOT });
  return defaultInspector;
}

export function discoverSource(request) {
  return sharedInspector().discover(request);
}

export function readSource(request) {
  return sharedInspector().read(request);
}

export function searchSource(request) {
  return sharedInspector().search(request);
}
