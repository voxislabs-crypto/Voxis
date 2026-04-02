const DEFAULT_TTS_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_TTS_MODEL = "gpt-4o-mini-tts";
const DEFAULT_TTS_VOICE = "alloy";
const DEFAULT_TTS_FORMAT = "mp3";

function getTtsConfig() {
  return {
    baseUrl: (process.env.TTS_BASE_URL || process.env.LLM_BASE_URL || DEFAULT_TTS_BASE_URL).replace(
      /\/$/,
      "",
    ),
    apiKey: process.env.TTS_API_KEY || process.env.LLM_API_KEY || "",
    model: process.env.TTS_MODEL || DEFAULT_TTS_MODEL,
    voice: process.env.TTS_DEFAULT_VOICE || DEFAULT_TTS_VOICE,
    format: process.env.TTS_RESPONSE_FORMAT || DEFAULT_TTS_FORMAT,
  };
}

export function isTtsConfigured() {
  const { apiKey, baseUrl } = getTtsConfig();
  return Boolean(apiKey) || baseUrl !== DEFAULT_TTS_BASE_URL;
}

function getContentType(format) {
  switch (format) {
    case "wav":
      return "audio/wav";
    case "opus":
      return "audio/ogg";
    case "aac":
      return "audio/aac";
    case "flac":
      return "audio/flac";
    case "pcm":
      return "audio/L16";
    case "mp3":
    default:
      return "audio/mpeg";
  }
}

export async function generateSpeechAudio({ personality, text, voiceProfile }) {
  const config = getTtsConfig();

  if (!config.apiKey && config.baseUrl === DEFAULT_TTS_BASE_URL) {
    const error = new Error(
      "TTS_API_KEY is missing. Copy backend/.env.example to backend/.env and provide TTS_API_KEY or a compatible TTS_BASE_URL.",
    );
    error.statusCode = 500;
    throw error;
  }

  const response = await fetch(`${config.baseUrl}/audio/speech`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: voiceProfile.providerModel || config.model,
      voice: voiceProfile.providerVoice || config.voice,
      input: text,
      response_format: config.format,
      speed: Math.min(1.25, Math.max(0.7, Number(voiceProfile.rate) || 1)),
      instructions: [
        `Speak as ${personality.name}.`,
        personality.speechStyle || "Maintain the saved character tone.",
        personality.researchSummary || "",
      ]
        .filter(Boolean)
        .join(" "),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(`TTS request failed with ${response.status}: ${errorText}`);
    error.statusCode = 502;
    throw error;
  }

  const arrayBuffer = await response.arrayBuffer();

  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: response.headers.get("content-type") || getContentType(config.format),
  };
}