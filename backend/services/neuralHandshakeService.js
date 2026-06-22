/**
 * First-pass Neural Handshake: Perception → Emotion
 * Generic, bidirectional-ready layer for the Voxis guide and overall cognition.
 * 
 * Perception: Ingests raw input + context, extracts intent, entities, emotional signals.
 * Emotion: Produces state that shapes response tone and can feed back cues (e.g. for SFX).
 *
 * Future layers (Memory, Intent, Response) will negotiate upward/downward.
 */

export function runPerception(inputText, context = {}) {
  const text = String(inputText || "").trim();
  if (!text) {
    return {
      intent: "unknown",
      entities: [],
      signals: [],
      raw: text,
    };
  }

  const lower = text.toLowerCase();

  // Simple intent detection for guide actions
  let intent = "chat";
  if (/create.*persona|make a new|build a character/i.test(lower)) intent = "create_persona";
  else if (/modify|update|make.*more|change|adjust.*(rick|persona)/i.test(lower)) intent = "modify_persona";
  else if (/how do|explain|what is|teach me/i.test(lower)) intent = "learn";

  // Extract persona-related entities
  const entities = [];
  const personaMatch = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g) || [];
  personaMatch.forEach(name => {
    if (name.length > 2 && !["The", "You", "I"].includes(name)) {
      entities.push({ type: "persona", value: name });
    }
  });

  // Emotional signals from text
  const signals = [];
  if (/sarcastic|more sarcastic|biting|witty/i.test(lower)) signals.push({ type: "sarcasm", strength: 0.8 });
  if (/chaotic|wild|unpredictable/i.test(lower)) signals.push({ type: "chaos", strength: 0.7 });
  if (/calm|serious|thoughtful/i.test(lower)) signals.push({ type: "calm", strength: 0.6 });

  return {
    intent,
    entities,
    signals,
    raw: text,
    contextSummary: context.selectedPersona ? `modifying ${context.selectedPersona.name}` : "general",
  };
}

export function runEmotion(perception, previousEmotion = {}) {
  const { intent, signals = [] } = perception;

  let valence = previousEmotion.valence || 0.3;   // -1 sad to +1 excited
  let arousal = previousEmotion.arousal || 0.5;   // 0 calm to 1 energetic
  let dominant = previousEmotion.dominant || ["curious"];

  // Adjust based on intent
  if (intent === "create_persona") {
    valence = Math.min(0.9, valence + 0.4);
    arousal = Math.min(0.95, arousal + 0.3);
    dominant = ["creative", "excited"];
  } else if (intent === "modify_persona") {
    valence = 0.6;
    arousal = 0.65;
    dominant = ["focused", "playful"];
  }

  // Incorporate signals
  signals.forEach(sig => {
    if (sig.type === "sarcasm") {
      valence = Math.max(-0.2, valence - 0.1);
      dominant = ["sarcastic", ...dominant];
    }
    if (sig.type === "chaos") arousal = Math.min(1, arousal + 0.25);
  });

  // Suggested cues for SFX / prosody (response layer feedback)
  const suggestedCues = [];
  if (arousal > 0.75) suggestedCues.push({ type: "sfx", tag: "giggle", intensity: arousal });
  if (valence < 0) suggestedCues.push({ type: "sfx", tag: "sigh", intensity: 0.6 });
  if (dominant.includes("sarcastic")) suggestedCues.push({ type: "sfx", tag: "burp", intensity: 0.4 });

  return {
    valence: Number(valence.toFixed(2)),
    arousal: Number(arousal.toFixed(2)),
    dominant: Array.from(new Set(dominant)).slice(0, 3),
    intensity: Math.min(1, (Math.abs(valence) + arousal) / 2),
    suggestedCues,
    negotiation: `Perception saw "${perception.intent}" → Emotion tuned for engagement.`,
  };
}

export function runPerceptionEmotionHook(inputText, context = {}) {
  const perception = runPerception(inputText, context);
  const emotion = runEmotion(perception, context.lastEmotion || {});

  return {
    perception,
    emotion,
    // Can be extended: memory, intent...
    timestamp: Date.now(),
  };
}

/**
 * Simple Response layer stub (part of full handshake).
 * Takes the emotion + original perception and produces actionable output
 * like suggested SFX cues, tone adjustments, etc.
 * This is the "feed back down" part you mentioned.
 */
export function runResponseLayer(perception, emotion) {
  const cues = emotion.suggestedCues || [];

  // Example: boost or filter cues based on intent
  let finalCues = [...cues];
  if (perception.intent === "create_persona") {
    // When creating, suggest 1-2 default SFX tags for the new persona
    if (!finalCues.some(c => c.tag === "burp" || c.tag === "sigh")) {
      finalCues.push({ type: "sfx", tag: "burp", intensity: 0.5 });
    }
  }

  return {
    suggestedSfxCues: finalCues,
    toneModifiers: {
      sarcasmBoost: perception.signals.some(s => s.type === "sarcasm") ? 0.3 : 0,
      energy: emotion.arousal,
    },
    negotiationNote: `Response layer: using ${emotion.dominant.join("/")} emotion to shape output and cues.`,
  };
}

export default { 
  runPerceptionEmotionHook, 
  runPerception, 
  runEmotion,
  runResponseLayer 
};
