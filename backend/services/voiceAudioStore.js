import { randomBytes } from "crypto";

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const MAX_CLIPS = 32;

const clips = new Map();

export function resetVoiceAudioStore() {
  clips.clear();
}

function sweep(now) {
  for (const [id, clip] of clips) {
    if (clip.expiresAt <= now) {
      clips.delete(id);
    }
  }
}

// In-memory only. A process restart drops unplayed clips. That matches the
// phone turn: the audio URL is for the live stream, not a library.
export function storeVoiceAudio({
  buffer,
  contentType,
  now = Date.now(),
  ttlMs = DEFAULT_TTL_MS,
} = {}) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (bytes.length === 0) {
    throw new Error("Refusing to store empty voice audio.");
  }

  sweep(now);
  while (clips.size >= MAX_CLIPS) {
    const oldest = clips.keys().next().value;
    clips.delete(oldest);
  }

  const id = randomBytes(16).toString("hex");
  clips.set(id, {
    buffer: bytes,
    contentType: String(contentType || "application/octet-stream"),
    expiresAt: now + ttlMs,
  });
  return id;
}

export function readVoiceAudio(id, now = Date.now()) {
  sweep(now);
  const key = String(id || "");
  const clip = clips.get(key);
  if (!clip) {
    return null;
  }
  if (clip.expiresAt <= now) {
    clips.delete(key);
    return null;
  }
  return clip;
}
