import { getSpeechProfile } from "./speechProfiles.js";
import { isValidSfxTag, getAvailableSfxTags, normalizeSfxTag } from "./sfxCacheService.js";

const DEFAULT_STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "if",
  "then",
  "that",
  "this",
  "with",
  "from",
  "your",
  "their",
  "about",
  "into",
  "just",
  "really",
  "very",
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function hashString(input) {
  let hash = 2166136261;
  const text = String(input || "");

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }

  return (hash >>> 0) / 4294967295;
}

function shouldInject(seed, threshold) {
  return hashString(seed) <= threshold;
}

function shouldInjectNotablePhrase(options = {}) {
  const channel = String(options?.channel || "").trim().toLowerCase();
  const ttsEngine = String(options?.ttsEngine || "").trim().toLowerCase();

  // V1 safety: avoid catchphrase append for Kokoro synthesis, which can add
  // extra sentence chunks and increase already-slow local CPU latency.
  if (channel === "tts" && ttsEngine === "kokoro") {
    return false;
  }

  return true;
}

function detectEmotionLabel({ mood = {}, signals = {} } = {}) {
  const arousal = Number(mood?.arousal);
  const dominance = Number(mood?.dominance);

  if (Number.isFinite(arousal) && arousal >= 0.55) {
    return signals?.sarcastic ? "playful" : "excited";
  }

  if (Number.isFinite(arousal) && arousal <= -0.35) {
    return "calm";
  }

  if (Number.isFinite(dominance) && dominance >= 0.5) {
    return "assertive";
  }

  return "neutral";
}

function normalizeMood(personality = {}, moodOverride = null) {
  if (moodOverride && typeof moodOverride === "object") {
    return moodOverride;
  }

  if (personality.moodState && typeof personality.moodState === "object") {
    return personality.moodState;
  }

  if (personality.moodBaseline && typeof personality.moodBaseline === "object") {
    return personality.moodBaseline;
  }

  return {};
}

function collectSignals(personality = {}, profile = null) {
  const traits = asArray(personality.traits).map((item) => String(item || "").toLowerCase());
  const behaviorRules = asArray(personality.behaviorRules).map((item) => String(item || "").toLowerCase());
  const expressionRules = asArray(personality.expressionStyle?.rules).map((item) => String(item || "").toLowerCase());
  const speechStyle = String(personality.speechStyle || "").toLowerCase();
  const sentenceStyle = String(personality.expressionStyle?.sentenceStyle || "").toLowerCase();
  const energy = String(personality.expressionStyle?.energy || "medium").toLowerCase();

  const joined = [speechStyle, sentenceStyle, ...traits, ...behaviorRules, ...expressionRules].join(" ");

  return {
    sarcastic: Boolean(profile?.flags?.sarcastic) || /sarcastic|dry wit|snark|mocking/.test(joined),
    dramatic: Boolean(profile?.flags?.villain) || /dramatic|theatrical|menace|showman/.test(joined),
    chaotic: Boolean(profile?.flags?.chaotic) || /chaotic|bursty|erratic|unpredictable/.test(joined),
    assertive: /assertive|dominant|commanding|confident/.test(joined),
    calm: Boolean(profile?.flags?.calm) || /calm|measured|soft|gentle|deliberate/.test(joined),
    energy,
  };
}

function collectEmphasisTerms(personality = {}) {
  const phraseWords = asArray(personality.notablePhrases)
    .flatMap((phrase) => String(phrase || "").split(/\s+/g))
    .map((word) => word.replace(/[^a-zA-Z']/g, "").toLowerCase())
    .filter((word) => word.length >= 5 && !DEFAULT_STOP_WORDS.has(word));

  const behaviorWords = asArray(personality.behaviorRules)
    .flatMap((rule) => String(rule || "").split(/\s+/g))
    .map((word) => word.replace(/[^a-zA-Z']/g, "").toLowerCase())
    .filter((word) => word.length >= 6 && !DEFAULT_STOP_WORDS.has(word));

  const baseWords = ["exactly", "obviously", "clearly", "never", "always", "listen", "genius"];

  return Array.from(new Set([...baseWords, ...phraseWords, ...behaviorWords])).slice(0, 12);
}

function emphasizeTerms(text, terms, maxReplacements = 3) {
  let output = text;
  let replacements = 0;

  for (const term of terms) {
    if (replacements >= maxReplacements) {
      break;
    }

    const pattern = new RegExp(`\\b${term}\\b`, "gi");
    output = output.replace(pattern, (match) => {
      if (replacements >= maxReplacements) {
        return match;
      }

      replacements += 1;
      return match.toUpperCase();
    });
  }

  return output;
}

function stripSpeechMarkup(text) {
  return String(text || "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/_([^_\n]+)_/g, "$1")
    .replace(/`[^`\n]+`/g, (match) => match.slice(1, -1))
    .replace(/^#{1,6}\s+/gm, "");
}

/**
 * Builds the expressive display variant of speech.
 * Applied on top of the already-stylized `speech` string.
 * Returns `null` when no visual transformation is produced (avoids displaying duplicates).
 */
function buildExpressiveText(speech, emotion, signals, mood) {
  if (!speech) return null;

  let out = speech;
  const arousal = Number(mood?.arousal);

  // High arousal / excited: amplify terminal punctuation
  if (emotion === "excited" || (Number.isFinite(arousal) && arousal >= 0.65)) {
    out = out.replace(/!$/, "!!");
    // Upgrade a plain sentence-final period to ! for very high arousal
    if (Number.isFinite(arousal) && arousal >= 0.75) {
      out = out.replace(/([a-z])\.$/i, "$1!");
    }
  }

  // Chaotic: replace ellipsis pauses with em-dashes for visual punch
  if (signals.chaotic) {
    out = out.replace(/\.\.\. /g, " — ");
  }

  // Dramatic: trailing period becomes an em-dash
  if (signals.dramatic && out.endsWith(".")) {
    out = `${out.slice(0, -1)}—`;
  }

  // Sarcastic: append trailing ellipsis when there isn't one, suggesting dry trailing thought
  if (signals.sarcastic && !out.endsWith("...") && !out.endsWith("—")) {
    out = `${out}...`;
  }

  // Calm: soften any terminal ! to ...
  if (signals.calm && out.endsWith("!") && !out.endsWith("!!")) {
    out = `${out.slice(0, -1)}...`;
  }

  // Return null when unchanged — no point sending an identical string
  return out !== speech ? out : null;
}

function inferExpressiveStyle(emotion, signals) {
  const styles = [];
  if (signals.chaotic) styles.push("chaotic");
  if (signals.dramatic) styles.push("dramatic");
  if (signals.sarcastic) styles.push("dry");
  if (signals.calm) styles.push("measured");
  if (signals.assertive) styles.push("sharp");
  if (emotion === "excited") styles.push("excited");
  if (emotion === "playful") styles.push("playful");
  return styles.length ? styles : ["neutral"];
}

function calculateExpressiveIntensity(mood, signals) {
  let base = 0.3;
  const arousal = Number(mood?.arousal);
  const dominance = Number(mood?.dominance);
  if (Number.isFinite(arousal)) base += Math.abs(arousal) * 0.4;
  if (Number.isFinite(dominance) && dominance > 0) base += dominance * 0.15;
  if (signals.dramatic) base += 0.1;
  if (signals.chaotic) base += 0.1;
  return Math.max(0, Math.min(1, base));
}

function buildVoiceTagEvent(signals = {}, emotion = "neutral") {
  if (signals.sarcastic) {
    return {
      type: "voice-tag",
      tag: "dry-wit",
      delivery: "overlay",
      intensity: 0.58,
      emotion,
    };
  }

  if (signals.chaotic) {
    return {
      type: "voice-tag",
      tag: "chaotic-burst",
      delivery: "overlay",
      intensity: 0.66,
      emotion,
    };
  }

  if (signals.dramatic) {
    return {
      type: "voice-tag",
      tag: "dramatic-rise",
      delivery: "overlay",
      intensity: 0.62,
      emotion,
    };
  }

  if (signals.assertive) {
    return {
      type: "voice-tag",
      tag: "assertive-tone",
      delivery: "overlay",
      intensity: 0.7,
      emotion,
    };
  }

  if (signals.calm) {
    return {
      type: "voice-tag",
      tag: "calm-focus",
      delivery: "overlay",
      intensity: 0.4,
      emotion,
    };
  }

  return null;
}

function buildPersonalityEvents({ injectedPhrase, appendInjectedPhrase, channel, emotion, signals }) {
  const events = [];

  if (injectedPhrase) {
    events.push({
      type: "catchphrase",
      text: injectedPhrase,
      delivery: appendInjectedPhrase ? "spoken" : "overlay",
      spoken: Boolean(appendInjectedPhrase),
      channel: String(channel || "tts"),
      intensity: 0.62,
    });
  }

  const voiceTagEvent = buildVoiceTagEvent(signals, emotion);
  if (voiceTagEvent) {
    events.push(voiceTagEvent);
  }

  return events;
}

/**
 * Inject SFX markers into speech based on persona's vocalMannerisms configuration
 * @param {string} text - The speech text
 * @param {object} personality - The personality object
 * @param {string} inputSeed - Seed for deterministic RNG
 * @param {boolean} precisionMode - Whether precision mode is enabled
 * @returns {object} { text: string, sfxEvents: array }
 */
function injectSfxMarkers(text, personality, inputSeed, precisionMode) {
  const vocalMannerisms = personality.vocalMannerisms || {};
  const sfxTags = Array.isArray(vocalMannerisms.sfxTags) ? vocalMannerisms.sfxTags : [];
  const sfxFrequency = Number(vocalMannerisms.sfxFrequency) ?? 0.25;
  const sfxPlacement = String(vocalMannerisms.sfxPlacement || "random").toLowerCase();

  // Filter to valid SFX tags only
  const validTags = Array.from(new Set(
    sfxTags
      .map((tag) => normalizeSfxTag(tag))
      .filter((tag) => isValidSfxTag(tag)),
  ));

  if (!validTags.length || precisionMode) {
    return { text, sfxEvents: [] };
  }

  // Determine if SFX should be injected based on frequency
  if (!shouldInject(`${inputSeed}:sfx`, sfxFrequency)) {
    return { text, sfxEvents: [] };
  }

  // Select a random SFX tag from valid tags
  const tagIndex = Math.floor(hashString(`${inputSeed}:sfx:tag`) * validTags.length);
  const selectedTag = validTags[tagIndex];
  const effectivePlacement = sfxPlacement === "random" && selectedTag === "burp"
    ? "throughout"
    : sfxPlacement;

  const sfxEvents = [];
  let output = text;

  // Handle placement modes
  switch (effectivePlacement) {
    case "start":
      output = `[SFX:${selectedTag}] ${output}`;
      sfxEvents.push({ tag: selectedTag, position: "before", ms: 0 });
      break;

    case "end":
      output = `${output} [SFX:${selectedTag}]`;
      sfxEvents.push({ tag: selectedTag, position: "after", ms: 0 });
      break;

    case "throughout": {
      // Split into sentences and inject randomly throughout
      const sentences = output.split(/(?<=[.!?])\s+/);
      const injectCount = Math.max(1, Math.floor(sentences.length * 0.3));
      const injectIndices = new Set();
      const sentenceCharCounts = sentences.map((sentence) => String(sentence || "").length);
      const totalChars = sentenceCharCounts.reduce((sum, len) => sum + len, 0) || 1;
      
      while (injectIndices.size < Math.min(injectCount, sentences.length)) {
        const idx = Math.floor(hashString(`${inputSeed}:sfx:throughout:${injectIndices.size}`) * sentences.length);
        injectIndices.add(idx);
      }

      injectIndices.forEach((idx) => {
        if (sentences[idx]) {
          sentences[idx] = `[SFX:${selectedTag}] ${sentences[idx]}`;
          const charOffset = sentenceCharCounts
            .slice(0, idx)
            .reduce((sum, len) => sum + len, 0);
          const progress = Math.max(0, Math.min(0.98, (charOffset + (sentenceCharCounts[idx] * 0.25)) / totalChars));
          sfxEvents.push({
            tag: selectedTag,
            position: "throughout",
            wordIndex: idx,
            sentenceIndex: idx,
            progress: Number(progress.toFixed(3)),
          });
        }
      });

      output = sentences.join(" ");
      break;
    }

    case "random":
    default:
      // Random position: 50% chance at start, 50% at end
      const atStart = hashString(`${inputSeed}:sfx:random`) < 0.5;
      if (atStart) {
        output = `[SFX:${selectedTag}] ${output}`;
        sfxEvents.push({ tag: selectedTag, position: "before", ms: 0 });
      } else {
        output = `${output} [SFX:${selectedTag}]`;
        sfxEvents.push({ tag: selectedTag, position: "after", ms: 0 });
      }
      break;
  }

  return { text: output, sfxEvents };
}

export function buildSpeechPacket(rawText, personality = {}, moodOverride = null, options = {}) {
  const input = String(rawText || "").replace(/\s+/g, " ").trim();
  if (!input) {
    return {
      speech: "",
      emotion: "neutral",
      expressive: { text: null, style: ["neutral"], intensity: 0 },
      events: [],
      overlays: [],
      sfx: [],
      gestures: [],
      injectedPhrase: null,
      tts: {
        enabled: true,
        priority: String(options?.priority || "normal"),
        channel: String(options?.channel || "tts"),
        engine: String(options?.ttsEngine || "auto"),
      },
    };
  }

  const mood = normalizeMood(personality, moodOverride);
  const profile = getSpeechProfile(personality);
  const styleMode = String(options?.styleMode || "performance").trim().toLowerCase();
  const precisionMode = styleMode === "precision";
  const channel = String(options?.channel || "tts").trim().toLowerCase();
  const appendInjectedPhrase = options?.appendInjectedPhrase !== false;
  const ttsEngine = String(options?.ttsEngine || "auto").trim().toLowerCase();
  const arousal = Number(mood.arousal);
  const dominance = Number(mood.dominance);
  const signals = collectSignals(personality, profile);
  const isHighArousal = Number.isFinite(arousal) && arousal >= 0.55;
  const isLowArousal = Number.isFinite(arousal) && arousal <= -0.3;
  const isHighDominance = Number.isFinite(dominance) && dominance >= 0.35;

  let output = input;

  if (!precisionMode && (signals.chaotic || signals.energy === "very_high" || isHighArousal || profile.pacing === "fast")) {
    output = output.replace(/,\s*/g, "... ").replace(/;\s*/g, "... ");
  }

  if (!precisionMode && signals.sarcastic) {
    output = output.replace(/\b(yeah|sure|right|okay|fine)\b(?!\.\.\.)/gi, "$1...");
  }

  if (!precisionMode && (signals.calm || signals.energy === "low" || isLowArousal)) {
    output = output.replace(/!+/g, ".").replace(/\?{2,}/g, "?");
    output = output.replace(/\.\s+(?=[A-Z])/g, "... ");
    if (output.endsWith(".")) {
      output = `${output.slice(0, -1)}...`;
    }
  }

  if (!precisionMode && (signals.assertive || signals.dramatic || isHighDominance)) {
    const emphasisTerms = Array.from(new Set([
      ...collectEmphasisTerms(personality),
      ...asArray(profile.emphasisWords).map((term) => String(term || "").toLowerCase()),
    ]));
    output = emphasizeTerms(output, emphasisTerms, 4);
  }

  if (!precisionMode && (signals.energy === "very_high" || isHighArousal)) {
    output = output.replace(/\.\s+(?=[A-Z])/g, "! ");
    if (output.endsWith(".")) {
      output = `${output.slice(0, -1)}!`;
    }
  }

  if (!precisionMode && Number.isFinite(dominance) && dominance > 0.5) {
    output = output.replace(/\b(i think|maybe|perhaps)\b/gi, "").replace(/\s{2,}/g, " ");
  }

  if (!precisionMode && Number.isFinite(dominance) && dominance < -0.4) {
    output = output.replace(/\./g, "...");
  }

  const notablePhrases = asArray(personality.notablePhrases)
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  const shouldAppendNotablePhrase = shouldInjectNotablePhrase({
    channel,
    ttsEngine,
  });

  let injectedPhrase = null;

  if (!precisionMode && shouldAppendNotablePhrase && notablePhrases.length > 0) {
    const injectSeed = `${personality.name || "anon"}:${input}`;
    if (shouldInject(injectSeed, 0.3)) {
      const index = Math.floor(hashString(`${injectSeed}:idx`) * notablePhrases.length);
      injectedPhrase = notablePhrases[index];
      if (appendInjectedPhrase) {
        output = `${output} ${injectedPhrase}`.trim();
      }
    }
  }

  const lowerTraits = asArray(personality.traits).map((item) => String(item || "").toLowerCase());
  const isErratic = lowerTraits.includes("erratic") || lowerTraits.includes("unstable");
  if (!precisionMode && isErratic && shouldInject(`${input}:stutter`, 0.2)) {
    output = output.replace(/\b([A-Za-z][A-Za-z']{3,})\b/, (word) => `${word[0]}-${word}`);
  }

  // Backward compatibility: Rick personas without sfxTags configured get the old burp behavior
  const isRick = String(personality.name || "").toLowerCase().includes("rick");
  const hasSfxTags = Array.isArray(personality.vocalMannerisms?.sfxTags) && personality.vocalMannerisms.sfxTags.length > 0;
  
  if (!precisionMode && isRick && !hasSfxTags && shouldInject(`${input}:rick`, 0.28)) {
    output = output.replace(/\bI\b/g, "I-uh-I");
    output = `[BURP] ${output}`;  // marker stripped in ttsService before reaching TTS engine
  }

  // New tag-based SFX system
  const sfxInjection = injectSfxMarkers(output, personality, input, precisionMode);
  output = sfxInjection.text;
  const sfxEvents = sfxInjection.sfxEvents;

  output = stripSpeechMarkup(output);

  output = output
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/\.{4,}/g, "...")
    .replace(/!{2,}/g, "!")
    .trim();

  const emotion = detectEmotionLabel({ mood, signals });

  const expressive = precisionMode
    ? { text: null, style: ["neutral"], intensity: 0 }
    : {
        text: buildExpressiveText(output, emotion, signals, mood),
        style: inferExpressiveStyle(emotion, signals),
        intensity: calculateExpressiveIntensity(mood, signals),
      };

  const events = buildPersonalityEvents({
    injectedPhrase,
    appendInjectedPhrase,
    channel,
    emotion,
    signals,
  });

  return {
    speech: output,
    emotion,
    expressive,
    events,
    overlays: [],
    sfx: sfxEvents,
    gestures: [],
    injectedPhrase,
    tts: {
      enabled: true,
      priority: String(options?.priority || "normal"),
      channel,
      engine: ttsEngine,
    },
  };
}

export function stylizeSpeech(rawText, personality = {}, moodOverride = null, options = {}) {
  return buildSpeechPacket(rawText, personality, moodOverride, options).speech;
}