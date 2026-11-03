const FEMALE_TOKENS = new Set([
  "amy",
  "alba",
  "cori",
  "jenny",
  "kathleen",
  "kristin",
  "ljspeech",
]);

const MALE_TOKENS = new Set([
  "alan",
  "bryce",
  "danny",
  "joe",
  "john",
  "lessac",
  "norman",
  "ryan",
]);

const FEMALE_CLOUD_VOICES = new Set(["nova", "sage", "shimmer"]);

const USE_CASES = new Map([
  ["amy", "calm everyday chat and a steady assistant"],
  ["lessac", "smooth narration for long replies and stories"],
  ["kristin", "American female for reading stories aloud"],
  ["alba", "British female for a UK character"],
  ["ryan", "conversational American male replies"],
  ["ljspeech", "audiobook-style reading"],
  ["cori", "clear British narration"],
  ["alan", "formal British character"],
  ["jenny", "younger British character"],
  ["joe", "plain spoken replies"],
  ["kathleen", "short, direct lines"],
]);

function voiceTokens(value) {
  return String(value || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function piperPresentation(voice) {
  const tokens = voiceTokens(`${voice?.id || ""} ${voice?.path || ""}`);
  if (tokens.includes("female") || tokens.some((token) => FEMALE_TOKENS.has(token))) {
    return "female";
  }
  if (tokens.includes("male") || tokens.some((token) => MALE_TOKENS.has(token))) {
    return "male";
  }
  return "";
}

export function isFemaleCloudVoice(voiceId) {
  return FEMALE_CLOUD_VOICES.has(String(voiceId || "").trim().toLowerCase());
}

export function piperUseCase(voice) {
  const tokens = voiceTokens(`${voice?.id || ""} ${voice?.path || ""}`);
  if (tokens.includes("hfc") && tokens.includes("female")) {
    return "neutral American female assistant";
  }
  if (tokens.includes("hfc") && tokens.includes("male")) {
    return "neutral American male assistant";
  }
  if (tokens.includes("northern") && tokens.includes("english") && tokens.includes("male")) {
    return "northern English character";
  }
  for (const token of tokens) {
    const useCase = USE_CASES.get(token);
    if (useCase) {
      return useCase;
    }
  }
  return "";
}

export function formatQuickPiperLabel(voice) {
  const label = String(voice?.label || voice?.id || "Piper voice").trim();
  const presentation = piperPresentation(voice);
  const useCase = piperUseCase(voice);
  const named = presentation ? `${label} (${presentation})` : label;
  return useCase ? `${named} — ${useCase}` : named;
}

export function choosePiperVoice(voices, profile) {
  const list = Array.isArray(voices) ? voices : [];
  const modelPath = String(profile?.piperModelPath || "").trim();
  const providerVoice = String(profile?.providerVoice || profile?.preferredVoice || "").trim();
  const matchedPath = list.find((voice) => voice?.path && voice.path === modelPath);
  if (matchedPath) {
    return { voice: matchedPath, reason: "saved-model" };
  }
  const matchedId = list.find((voice) => voice?.id && (voice.id === providerVoice || voice.id === profile?.preferredVoice));
  if (matchedId) {
    return { voice: matchedId, reason: "saved-id" };
  }
  if (!modelPath && isFemaleCloudVoice(providerVoice)) {
    const females = list.filter((voice) => piperPresentation(voice) === "female");
    const amy = females.find((voice) => voiceTokens(voice?.id).includes("amy"));
    const female = amy || females[0];
    if (female) {
      return { voice: female, reason: "cloud-female" };
    }
  }
  return { voice: null, reason: "none" };
}
