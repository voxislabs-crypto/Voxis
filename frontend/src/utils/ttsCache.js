/**
 * Session-scoped TTS response cache.
 *
 * Stores response entries keyed by a hash of (personalityId, text, voiceProfile).
 * Callers should create a new object URL from the cached Blob on each hit so
 * the URL lifecycle stays under their control.
 *
 * Max 80 entries (FIFO eviction) — audio blobs are ~50–500 KB each.
 */

const MAX_ENTRIES = 80;

/** @type {Map<string, { blob: Blob, telemetry?: object|null, sfxTimeline?: Array<object> }>} */
const _cache = new Map();

/**
 * Build a stable string cache key from the fields that affect audio output.
 * @param {number|string} personalityId
 * @param {string} text
 * @param {object} voiceProfile
 * @returns {string}
 */
export function buildTtsCacheKey(personalityId, text, voiceProfile = {}) {
  const vp = voiceProfile || {};
  const parts = [
    String(personalityId),
    String(vp.engine || "auto"),
    String(vp.providerVoice || vp.preferredVoice || ""),
    String(vp.providerModel || ""),
    String(vp.piperModelPath || ""),
    String(vp.piperSpeaker ?? ""),
    String(Number(vp.pitch || 1).toFixed(2)),
    String(Number(vp.rate || 1).toFixed(2)),
    text.trim(),
  ];
  return parts.join("|");
}

/**
 * Retrieve a cached entry, or null on miss.
 * @param {string} key
 * @returns {{ blob: Blob, telemetry?: object|null, sfxTimeline?: Array<object> }|null}
 */
export function getTtsCache(key) {
  return _cache.get(key) ?? null;
}

/**
 * Store a response entry in the cache (evicts oldest entry when full).
 * @param {string} key
 * @param {Blob|object} value
 */
export function setTtsCache(key, value) {
  const entry = value instanceof Blob ? { blob: value } : value;
  if (!entry || !(entry.blob instanceof Blob)) {
    return;
  }

  if (_cache.has(key)) {
    // Refresh position by deleting then re-inserting
    _cache.delete(key);
  } else if (_cache.size >= MAX_ENTRIES) {
    // FIFO eviction
    const oldestKey = _cache.keys().next().value;
    _cache.delete(oldestKey);
  }
  _cache.set(key, entry);
}

/**
 * Manually clear the entire cache (e.g. when voice profile is saved).
 */
export function clearTtsCache() {
  _cache.clear();
}
