/**
 * Session-scoped TTS response cache.
 *
 * A clip replays with no provider call when the text, engine, and voice match.
 * Audio spoken by a different engine is not reused for an explicit Cartesia
 * request. A successful clip is also filed under the engine that actually
 * spoke, so a later Cartesia selection can reuse an earlier fallback instead
 * of paying again.
 *
 * Max 80 entries (FIFO eviction) — audio blobs are ~50–500 KB each.
 */

const MAX_ENTRIES = 80;

/** @type {Map<string, { blob: Blob, telemetry?: object|null, sfxTimeline?: Array<object> }>} */
const _cache = new Map();

function normalizeEngine(engine) {
  return String(engine || "auto").trim().toLowerCase();
}

function profileVoiceId(engine, voiceProfile = {}) {
  const eng = normalizeEngine(engine);
  if (eng === "cartesia") return String(voiceProfile?.cartesiaVoiceId || "").trim();
  if (eng === "elevenlabs") return String(voiceProfile?.elevenLabsVoiceId || "").trim();
  return String(voiceProfile?.providerVoice || voiceProfile?.preferredVoice || "").trim();
}

function profileVoiceModel(engine, voiceProfile = {}) {
  const eng = normalizeEngine(engine);
  if (eng === "cartesia") return String(voiceProfile?.cartesiaModel || "").trim();
  if (eng === "elevenlabs") return String(voiceProfile?.elevenLabsModel || "").trim();
  return String(voiceProfile?.providerModel || "").trim();
}

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
    String(vp.cartesiaVoiceId || ""),
    String(vp.cartesiaModel || ""),
    String(vp.elevenLabsVoiceId || ""),
    String(vp.elevenLabsModel || ""),
    String(vp.piperModelPath || ""),
    String(vp.piperSpeaker ?? ""),
    String(Number(vp.pitch || 1).toFixed(2)),
    String(Number(vp.rate || 1).toFixed(2)),
    text.trim(),
  ];
  return parts.join("|");
}

export function buildTtsAliasKey(personalityId, engine, voiceId, model, text) {
  return [
    "chosen",
    String(personalityId),
    normalizeEngine(engine),
    String(voiceId || ""),
    String(model || ""),
    String(text || "").trim(),
  ].join("|");
}

/**
 * Explicit Cartesia never accepts another engine's clip. Other explicit
 * requests still accept their own successful fallback so replay stays free.
 * @param {object|null|undefined} entry
 * @param {string} requestedEngine
 * @returns {boolean}
 */
export function cachedClipMatchesEngine(entry, requestedEngine) {
  const requested = normalizeEngine(requestedEngine);
  if (!requested || requested === "auto") {
    return true;
  }
  const chosen = normalizeEngine(entry?.telemetry?.chosenEngine);
  if (!chosen || chosen === requested) {
    return true;
  }
  if (requested === "cartesia") {
    return false;
  }
  return Boolean(entry?.telemetry?.fallbackUsed);
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
    _cache.delete(key);
  } else if (_cache.size >= MAX_ENTRIES) {
    const oldestKey = _cache.keys().next().value;
    _cache.delete(oldestKey);
  }
  _cache.set(key, entry);
}

/**
 * Read a clip that can be replayed for this request without a provider call.
 * @returns {{ blob: Blob, telemetry?: object|null, sfxTimeline?: Array<object>, fromCache: true }|null}
 */
export function readReusableTtsClip(personalityId, text, voiceProfile = {}) {
  const requested = normalizeEngine(voiceProfile?.engine);
  const direct = getTtsCache(buildTtsCacheKey(personalityId, text, voiceProfile));
  if (direct?.blob instanceof Blob && cachedClipMatchesEngine(direct, requested)) {
    return { ...direct, fromCache: true };
  }

  if (requested && requested !== "auto") {
    const alias = getTtsCache(buildTtsAliasKey(
      personalityId,
      requested,
      profileVoiceId(requested, voiceProfile),
      profileVoiceModel(requested, voiceProfile),
      text,
    ));
    if (alias?.blob instanceof Blob && cachedClipMatchesEngine(alias, requested)) {
      return { ...alias, fromCache: true };
    }
  }

  return null;
}

/**
 * Remember a successful clip. A mismatched explicit Cartesia result is not
 * stored under the Cartesia key. The clip is aliased under the engine that
 * actually spoke so a later selection of that engine replays it free.
 */
export function rememberTtsClip(personalityId, text, voiceProfile = {}, value) {
  const entry = value instanceof Blob ? { blob: value } : value;
  if (!entry || !(entry.blob instanceof Blob)) {
    return;
  }

  const requested = normalizeEngine(voiceProfile?.engine);
  if (cachedClipMatchesEngine(entry, requested)) {
    setTtsCache(buildTtsCacheKey(personalityId, text, voiceProfile), entry);
  }

  const chosen = normalizeEngine(entry?.telemetry?.chosenEngine);
  if (!chosen || chosen === "auto" || chosen === requested) {
    return;
  }

  setTtsCache(buildTtsAliasKey(
    personalityId,
    chosen,
    profileVoiceId(chosen, voiceProfile),
    profileVoiceModel(chosen, voiceProfile),
    text,
  ), entry);
}

/**
 * Manually clear the entire cache (e.g. when voice profile is saved).
 */
export function clearTtsCache() {
  _cache.clear();
}
