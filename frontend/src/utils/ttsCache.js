/**
 * Session-scoped TTS response cache.
 *
 * A clip replays with no provider call when the text, engine, and voice match.
 * Audio spoken by a different engine is not reused for an explicit Cartesia
 * or Piper request. A successful clip is also filed under the engine that actually
 * spoke, so a later Cartesia selection can reuse an earlier fallback instead
 * of paying again.
 *
 * Session clips are capped at 80. Retained playbacks are separate: the last 3
 * per persona per provider, stored in IndexedDB so a provider switch or a
 * refresh can still replay them. A fourth retained clip drops the oldest.
 */

const MAX_ENTRIES = 80;
export const MAX_RETAINED_PLAYBACKS = 3;
const DB_NAME = "voxis-tts-playback";
const DB_STORE = "clips";

/** @type {Map<string, { blob: Blob, telemetry?: object|null, sfxTimeline?: Array<object>, retained?: boolean, storedAt?: number }>} */
const _cache = new Map();
/** @type {Map<string, Array<{ id: string, keys: string[], storedAt: number }>>} */
const _retainedBuckets = new Map();
let _playbackCacheReady = null;

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
 * Explicit Cartesia and Piper never accept another engine's clip. An
 * ElevenLabs quota fallback to Cartesia still replays for that request.
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
  if (requested === "cartesia" || requested === "piper") {
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
function sessionEntryCount() {
  let count = 0;
  for (const entry of _cache.values()) {
    if (!entry?.retained) {
      count += 1;
    }
  }
  return count;
}

function evictOldestSessionEntry() {
  for (const [key, entry] of _cache) {
    if (!entry?.retained) {
      _cache.delete(key);
      return;
    }
  }
}

export function setTtsCache(key, value) {
  const entry = value instanceof Blob ? { blob: value } : value;
  if (!entry || !(entry.blob instanceof Blob)) {
    return;
  }

  if (_cache.has(key)) {
    _cache.delete(key);
  } else if (!entry.retained && sessionEntryCount() >= MAX_ENTRIES) {
    evictOldestSessionEntry();
  }
  _cache.set(key, entry);
}

function bucketId(personalityId, provider) {
  return `${personalityId}|${normalizeEngine(provider)}`;
}

function clipProvider(entry, voiceProfile = {}) {
  const chosen = normalizeEngine(entry?.telemetry?.chosenEngine);
  if (chosen && chosen !== "auto") {
    return chosen;
  }
  return normalizeEngine(voiceProfile?.engine) || "auto";
}

function openPlaybackDb() {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function persistRetainedClip(record) {
  return openPlaybackDb().then((db) => {
    if (!db || !record?.id) {
      return;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }).catch(() => {});
}

function deletePersistedClip(id) {
  return openPlaybackDb().then((db) => {
    if (!db || !id) {
      return;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }).catch(() => {});
}

function rememberRetainedSlot({ personalityId, provider, responseKey, keys }) {
  const usableKeys = [...new Set(keys.filter(Boolean))];
  if (!usableKeys.length) {
    return;
  }
  const bucket = bucketId(personalityId, provider);
  const responseId = String(responseKey || usableKeys[0]);
  const storedAt = Date.now();
  const current = _retainedBuckets.get(bucket) || [];
  const previous = current.find((slot) => slot.id === responseId);
  const mergedKeys = [...new Set([...(previous?.keys || []), ...usableKeys])];
  const slots = current.filter((slot) => slot.id !== responseId);
  slots.push({ id: responseId, keys: mergedKeys, storedAt });
  while (slots.length > MAX_RETAINED_PLAYBACKS) {
    const oldest = slots.shift();
    for (const key of oldest?.keys || []) {
      const cached = _cache.get(key);
      if (cached?.retained) {
        _cache.delete(key);
      }
      void deletePersistedClip(key);
    }
  }
  _retainedBuckets.set(bucket, slots);
  for (const key of mergedKeys) {
    const cached = _cache.get(key);
    if (cached) {
      cached.retained = true;
      cached.storedAt = storedAt;
    }
  }
  for (const key of usableKeys) {
    const cached = _cache.get(key);
    if (!cached?.blob) {
      continue;
    }
    void persistRetainedClip({
      id: key,
      responseId,
      bucket,
      personalityId: String(personalityId),
      provider: normalizeEngine(provider),
      storedAt,
      blob: cached.blob,
      telemetry: cached.telemetry || null,
      sfxTimeline: Array.isArray(cached.sfxTimeline) ? cached.sfxTimeline : [],
    });
  }
}

async function hydratePlaybackCache() {
  const db = await openPlaybackDb();
  if (!db) {
    return;
  }
  const records = await new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const request = tx.objectStore(DB_STORE).getAll();
    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
    request.onerror = () => reject(request.error);
  });
  const grouped = new Map();
  for (const record of records) {
    if (!record?.id || !(record.blob instanceof Blob)) {
      continue;
    }
    const clipKey = String(record.id);
    if (!_cache.has(clipKey)) {
      _cache.set(clipKey, {
        blob: record.blob,
        telemetry: record.telemetry || null,
        sfxTimeline: Array.isArray(record.sfxTimeline) ? record.sfxTimeline : [],
        retained: true,
        storedAt: Number(record.storedAt) || 0,
      });
    }
    const bucket = String(record.bucket || "");
    if (!bucket) {
      continue;
    }
    const responseId = String(record.responseId || clipKey);
    const slots = grouped.get(bucket) || [];
    const existingSlot = slots.find((slot) => slot.id === responseId);
    if (existingSlot) {
      if (!existingSlot.keys.includes(clipKey)) {
        existingSlot.keys.push(clipKey);
      }
      existingSlot.storedAt = Math.max(existingSlot.storedAt, Number(record.storedAt) || 0);
    } else {
      slots.push({
        id: responseId,
        keys: [clipKey],
        storedAt: Number(record.storedAt) || 0,
      });
    }
    grouped.set(bucket, slots);
  }
  for (const [bucket, slots] of grouped) {
    slots.sort((a, b) => a.storedAt - b.storedAt);
    const existing = _retainedBuckets.get(bucket) || [];
    const known = new Set(existing.map((slot) => slot.id));
    for (const slot of slots) {
      if (!known.has(slot.id)) {
        existing.push(slot);
      }
    }
    existing.sort((a, b) => a.storedAt - b.storedAt);
    _retainedBuckets.set(bucket, existing.slice(-MAX_RETAINED_PLAYBACKS));
  }
}

export function ensureTtsPlaybackCache() {
  if (!_playbackCacheReady) {
    _playbackCacheReady = hydratePlaybackCache().catch(() => null);
  }
  return _playbackCacheReady;
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
export function rememberTtsClip(personalityId, text, voiceProfile = {}, value, options = {}) {
  const entry = value instanceof Blob ? { blob: value } : value;
  if (!entry || !(entry.blob instanceof Blob)) {
    return;
  }

  const requested = normalizeEngine(voiceProfile?.engine);
  const keys = [];
  if (cachedClipMatchesEngine(entry, requested)) {
    const primaryKey = buildTtsCacheKey(personalityId, text, voiceProfile);
    setTtsCache(primaryKey, entry);
    keys.push(primaryKey);
  }

  const chosen = normalizeEngine(entry?.telemetry?.chosenEngine);
  if (chosen && chosen !== "auto" && chosen !== requested) {
    const aliasKey = buildTtsAliasKey(
      personalityId,
      chosen,
      profileVoiceId(chosen, voiceProfile),
      profileVoiceModel(chosen, voiceProfile),
      text,
    );
    setTtsCache(aliasKey, entry);
    keys.push(aliasKey);
  }

  if (!options.retain || !keys.length) {
    return;
  }

  const provider = clipProvider(entry, voiceProfile);
  const retainKeys = keys.filter((key) => {
    const cached = _cache.get(key);
    return cached && cachedClipMatchesEngine(cached, provider);
  });
  rememberRetainedSlot({
    personalityId,
    provider,
    responseKey: options.responseKey,
    keys: retainKeys.length ? retainKeys : keys,
  });
}

/**
 * Manually clear the entire cache (e.g. when voice profile is saved).
 */
export function clearTtsCache() {
  _cache.clear();
  _retainedBuckets.clear();
  _playbackCacheReady = Promise.resolve(null);
  void openPlaybackDb().then((db) => {
    if (!db) {
      return;
    }
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).clear();
  }).catch(() => {});
}
