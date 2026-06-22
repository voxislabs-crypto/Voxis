import { getPersonalityById } from "../models/personalityModel.js";
import {
  generateSpeechAudio,
  getTtsHealthStatus,
  isTtsConfigured,
  listPiperVoiceOptions,
  listKokoroVoices,
  listProviderStatus,
  listProviderOptions,
} from "../services/ttsService.js";
import { sanitizeVoiceProfile } from "../services/voiceProfileSanitizer.js";

function setEncodedHeader(res, name, value, { maxBytes = 1800 } = {}) {
  const normalized = String(value || "");
  if (!normalized) {
    return;
  }

  if (Buffer.byteLength(normalized, "utf8") > maxBytes) {
    return;
  }

  res.setHeader(name, normalized);
}

function setEncodedJsonHeader(res, name, payload, options) {
  try {
    setEncodedHeader(res, name, encodeURIComponent(JSON.stringify(payload ?? {})), options);
  } catch {
    // Optional debug headers should never fail the audio response.
  }
}

// Read env at call time — NOT at module load time — so dotenv has already run
// regardless of ESM module evaluation order.
function isTtsDebugLockEnabled() {
  return String(process.env.TTS_DEBUG_PROVIDER_LOCK ?? "true").trim().toLowerCase() !== "false";
}

const DEFAULT_TTS_REQUEST_TIMEOUT_MS = 60_000;

function getTtsRequestTimeoutMs() {
  const configured = Number(process.env.TTS_REQUEST_TIMEOUT_MS || DEFAULT_TTS_REQUEST_TIMEOUT_MS);
  if (!Number.isFinite(configured)) {
    return DEFAULT_TTS_REQUEST_TIMEOUT_MS;
  }
  return Math.max(8_000, Math.min(120_000, Math.round(configured)));
}

function inferRequestedEngine(voiceProfile = {}) {
  const envEngine = String(process.env.TTS_ENGINE || "").trim().toLowerCase();
  if (envEngine && envEngine !== "auto") {
    return envEngine;
  }

  return String(voiceProfile?.engine || "auto").trim().toLowerCase() || "auto";
}

async function generateSpeechAudioWithTimeout(options, timeoutMs) {
  let timer = null;

  try {
    return await Promise.race([
      generateSpeechAudio(options),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(
            `Speech synthesis timed out after ${timeoutMs}ms before the provider returned audio. Try shorter text, enable sentence chunking in playback, or increase TTS_REQUEST_TIMEOUT_MS.`,
          );
          error.statusCode = 504;
          error.ttsProvider = inferRequestedEngine(options?.voiceProfile);
          error.ttsProviderCode = "backend_timeout";
          error.providerStatus = 504;
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function summarizeRouting(health = null) {
  const allowedEngines = Array.isArray(health?.routing?.allowedEngines)
    ? health.routing.allowedEngines.map((engine) => String(engine || "").trim().toLowerCase()).filter(Boolean)
    : [];

  const debugLockEnabled = Boolean(health?.routing?.debugLockEnabled);
  const requestedEngine = String(health?.routing?.requestedEngine || inferRequestedEngine()).trim().toLowerCase();
  const cartesiaAvailable = Boolean(health?.engines?.cartesia?.available);

  return {
    debugLockEnabled,
    allowedEngines,
    requestedEngine,
    cartesiaAvailable,
    cartesiaOnly: debugLockEnabled && allowedEngines.length === 1 && allowedEngines[0] === "cartesia",
  };
}

export async function listPiperVoicesHandler(req, res, next) {
  try {
    const payload = await listPiperVoiceOptions();
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
}

export function listKokoroVoicesHandler(req, res) {
  return res.json(listKokoroVoices());
}

export function listProviderStatusHandler(req, res) {
  return res.json(listProviderStatus());
}

export async function listProviderOptionsHandler(req, res, next) {
  try {
    const provider = String(req.query.provider || "").trim().toLowerCase();
    if (!provider) {
      return res.status(400).json({ error: "provider query param is required." });
    }

    const payload = await listProviderOptions(provider);
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
}

export async function generateSpeechHandler(req, res, next) {
  try {
    const personalityId = Number(req.params.id);
    const text = String(req.body.text || "").trim();
    const speechHint = String(req.body?.speechHint || "").trim();

    if (!Number.isInteger(personalityId)) {
      return res.status(400).json({ error: "A valid personality id is required." });
    }

    if (!text) {
      return res.status(400).json({ error: "Text is required for speech generation." });
    }

    const personality = getPersonalityById(personalityId);

    if (!personality) {
      return res.status(404).json({ error: "Personality not found." });
    }

    const voiceProfile = sanitizeVoiceProfile(req.body.voiceProfile, personality.voiceProfile);
    const ttsHealth = await getTtsHealthStatus();
    const routing = summarizeRouting(ttsHealth);

    if (!isTtsConfigured(voiceProfile)) {
      return res.status(500).json({
        error:
          isTtsDebugLockEnabled()
            ? "TTS debug lock is active and no allowed engine is configured. Configure Cartesia credentials (Settings -> Voice Provider Credentials) or use Kokoro."
            : "TTS is not configured. Configure cloud TTS (TTS_API_KEY/TTS_BASE_URL) or Piper (PIPER_MODEL_PATH) in backend/.env.",
      });
    }

    if (routing.cartesiaOnly && !routing.cartesiaAvailable) {
      return res.status(503).json({
        error:
          "TTS debug lock currently allows only Cartesia, but Cartesia is not available. " +
          "Add Cartesia credentials/settings or disable TTS_DEBUG_PROVIDER_LOCK to allow fallback engines.",
        details: {
          provider: "cartesia",
          providerCode: "locked_provider_unavailable",
          providerStatus: 503,
        },
      });
    }

    const audio = await generateSpeechAudioWithTimeout({
      personality,
      text,
      voiceProfile,
      speechHint,
    }, getTtsRequestTimeoutMs());

    res.setHeader("Content-Type", audio.contentType);
    res.setHeader("Cache-Control", "no-store");
    setEncodedHeader(res, "X-Voxis-Directed-Text", encodeURIComponent(audio.directedText || text), { maxBytes: 1200 });
    setEncodedHeader(res, "X-Voxis-Synthesis-Text", encodeURIComponent(audio.synthesisText || audio.directedText || text), { maxBytes: 1200 });
    res.setHeader("X-Voxis-Tts-Engine", audio.engine || "unknown");
    setEncodedJsonHeader(res, "X-Voxis-Adjusted-Voice", audio.adjustedVoiceProfile || voiceProfile, { maxBytes: 1400 });
    setEncodedJsonHeader(res, "X-Voxis-Prosody", audio.prosodyEnvelope || {}, { maxBytes: 1400 });
    setEncodedJsonHeader(res, "X-Voxis-Tts-Telemetry", audio.telemetry || {}, { maxBytes: 1400 });
    setEncodedHeader(res, "X-Voxis-Tts-Realism-Chain", encodeURIComponent(String(audio?.realism?.chain || "disabled")), { maxBytes: 1200 });
    setEncodedJsonHeader(res, "X-Voxis-Tts-Realism", audio.realism || {}, { maxBytes: 1400 });
    // New SFX timeline header with timing data
    setEncodedJsonHeader(res, "X-Voxis-Tts-Sfx-Timeline", Array.isArray(audio.sfx) ? audio.sfx : [], { maxBytes: 800 });
    // Backward compatibility: keep old header name
    setEncodedJsonHeader(res, "X-Voxis-Tts-Sfx", Array.isArray(audio.sfx) ? audio.sfx : [], { maxBytes: 800 });
    return res.send(audio.buffer);
  } catch (error) {
    if (error?.ttsProvider) {
      const provider = String(error.ttsProvider || "unknown").trim().toLowerCase();
      const providerCode = String(error.ttsProviderCode || "").trim().toLowerCase();
      const providerStatus = Number(error.providerStatus || 0);
      console.warn("[TTS] Provider synthesis failure", {
        provider,
        providerCode,
        providerStatus,
        statusCode: Number(error.statusCode || 0),
        message: String(error.message || ""),
      });
      const shouldAttachLockHint =
        isTtsDebugLockEnabled() &&
        provider === "cartesia" &&
        (providerCode === "timeout" || providerCode === "network_error" || providerCode === "backend_timeout");

      const lockHint = shouldAttachLockHint
        ? " Debug lock is enabled and Cartesia is currently the active route; " +
          "disable TTS_DEBUG_PROVIDER_LOCK=false (or enable Kokoro) to allow fallback while Cartesia is unstable."
        : "";

      return res.status(Number(error.statusCode || 502)).json({
        error: `${String(error.message || "Speech generation failed.")}${lockHint}`.trim(),
        details: {
          provider,
          providerCode,
          providerStatus,
        },
      });
    }

    return next(error);
  }
}