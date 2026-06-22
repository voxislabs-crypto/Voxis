import { useEffect, useMemo, useState } from "react";
import { useAuthFetch } from "../hooks/useAuthFetch.js";
import { getApiErrorMessage, readApiResponsePayload } from "../lib/apiResponse.js";
import AvatarCore from "./AvatarCore.jsx";
import BigFiveRadar from "./BigFiveRadar.jsx";
import AlignmentGrid from "./AlignmentGrid.jsx";
import HybridPreview from "./HybridPreview.jsx";
import { mapToVoxisPersonality } from "../lib/mapToVoxisPersonality.js";

const formStyles = `
  .creator-grid {
    display: grid;
    gap: 16px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .creator-grid .full {
    grid-column: 1 / -1;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .field label {
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--muted);
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .field input,
  .field textarea {
    width: 100%;
    padding: 13px 16px;
    border: 1px solid rgba(0, 180, 255, 0.14);
    border-radius: 16px;
    background: rgba(6, 14, 28, 0.88);
    color: var(--text);
    transition: border-color 180ms ease, box-shadow 180ms ease;
  }

  .field input::placeholder,
  .field textarea::placeholder {
    color: rgba(109, 128, 160, 0.50);
  }

  .field input:focus,
  .field textarea:focus {
    outline: none;
    border-color: rgba(0, 180, 255, 0.42);
    box-shadow: 0 0 0 3px rgba(0, 180, 255, 0.08);
  }

  .field textarea {
    min-height: 180px;
    resize: vertical;
  }

  .field textarea.compact {
    min-height: 110px;
  }

  .field small {
    color: var(--muted);
    font-size: 0.8rem;
    line-height: 1.5;
    opacity: 0.75;
  }

  .creator-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    margin-top: 20px;
    flex-wrap: wrap;
  }

  .creator-note {
    max-width: 50ch;
    color: var(--muted);
    line-height: 1.6;
    font-size: 0.93rem;
  }

  .primary-button {
    padding: 13px 22px;
    border: 0;
    border-radius: 999px;
    background: linear-gradient(135deg, var(--accent), var(--accent-deep));
    color: #fff;
    font-weight: 800;
    letter-spacing: 0.01em;
    box-shadow: 0 4px 16px rgba(0, 160, 255, 0.28);
    transition: opacity 180ms, transform 180ms;
  }

  .primary-button:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  .primary-button:disabled {
    opacity: 0.60;
    cursor: wait;
  }

  .secondary-button {
    padding: 13px 22px;
    border: 1px solid rgba(0, 180, 255, 0.20);
    border-radius: 999px;
    background: rgba(0, 180, 255, 0.06);
    color: var(--accent);
    font-weight: 700;
    transition: background 180ms, border-color 180ms;
  }

  .secondary-button:hover:not(:disabled) {
    background: rgba(0, 180, 255, 0.12);
    border-color: rgba(0, 180, 255, 0.32);
  }

  .secondary-button:disabled {
    opacity: 0.60;
    cursor: wait;
  }

  .voice-grid {
    display: grid;
    gap: 16px;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .expression-grid {
    display: grid;
    gap: 14px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .expression-copy-row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    margin-bottom: 12px;
  }

  .expression-copy-row select {
    min-width: 260px;
    max-width: 100%;
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid rgba(0, 180, 255, 0.16);
    background: rgba(6, 14, 28, 0.88);
    color: var(--text);
  }

  .avatar-preview-panel {
    margin-top: 14px;
    padding: 14px;
    border-radius: 14px;
    border: 1px solid rgba(0, 180, 255, 0.16);
    background: rgba(0, 180, 255, 0.04);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .avatar-preview-controls {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
  }

  .avatar-preview-controls select {
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid rgba(0, 180, 255, 0.16);
    background: rgba(6, 14, 28, 0.88);
    color: var(--text);
  }

  .voice-slider {
    width: 100%;
    accent-color: var(--accent);
  }

  .checkbox-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-top: 34px;
    color: var(--muted);
    font-size: 0.92rem;
  }

  .checkbox-row input {
    width: 18px;
    height: 18px;
    accent-color: var(--accent);
  }

  .research-panel {
    margin-top: 18px;
    padding: 18px;
    border: 1px solid rgba(0, 180, 255, 0.14);
    border-radius: 20px;
    background: rgba(0, 180, 255, 0.03);
  }

  .research-panel h3 {
    margin: 0 0 8px;
    font-size: 1.2rem;
    font-weight: 800;
    letter-spacing: -0.03em;
    color: var(--text);
  }

  .research-panel p {
    margin: 0 0 14px;
    color: var(--muted);
    line-height: 1.6;
    font-size: 0.93rem;
  }

  .research-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }

  .research-meta span {
    padding: 5px 10px;
    border-radius: 999px;
    background: rgba(0, 180, 255, 0.07);
    border: 1px solid rgba(0, 180, 255, 0.14);
    color: var(--accent);
    font-size: 0.8rem;
    font-weight: 700;
  }

  .source-list {
    display: grid;
    gap: 10px;
  }

  .source-item {
    padding: 14px 16px;
    border-radius: 16px;
    background: rgba(6, 14, 28, 0.80);
    border: 1px solid rgba(0, 180, 255, 0.10);
  }

  .source-item strong {
    display: block;
    margin-bottom: 5px;
    color: var(--text);
    font-size: 0.9rem;
  }

  .source-item span {
    display: block;
    color: var(--muted);
    font-size: 0.88rem;
    line-height: 1.55;
  }

  .workflow-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    padding: 14px 18px;
    margin-bottom: 22px;
    border-radius: 16px;
    border: 1px solid rgba(0, 200, 255, 0.18);
    background: rgba(0, 180, 255, 0.05);
  }

  .workflow-step {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.86rem;
    font-weight: 600;
    color: var(--text);
  }

  .workflow-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 999px;
    background: var(--accent);
    color: #000;
    font-weight: 800;
    font-size: 0.72rem;
    flex-shrink: 0;
  }

  .workflow-arrow {
    color: var(--muted);
    font-size: 0.82rem;
    flex-shrink: 0;
  }

  /* ── Quick presets ── */
  .preset-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    padding: 14px 18px;
    margin-bottom: 22px;
    border-radius: 16px;
    border: 1px solid rgba(0, 200, 255, 0.14);
    background: rgba(4, 10, 22, 0.88);
  }

  .preset-bar-label {
    font-size: 0.76rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #ffffff;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .preset-btn {
    padding: 7px 14px;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.12);
    background: rgba(255,255,255,0.05);
    color: #ffffff;
    font-size: 0.82rem;
    font-weight: 700;
    cursor: pointer;
    transition: background 150ms, border-color 150ms, box-shadow 150ms;
    white-space: nowrap;
  }

  .preset-btn:hover {
    background: rgba(255,255,255,0.10);
    border-color: rgba(255,255,255,0.26);
  }

  .preset-btn.active {
    box-shadow: 0 0 0 2px var(--preset-color, #00eaff), 0 0 14px rgba(0,234,255,0.22);
    border-color: var(--preset-color, #00eaff);
    background: rgba(0,0,0,0.3);
  }

  .preset-clear {
    margin-left: auto;
    font-size: 0.76rem;
    color: var(--muted);
    background: none;
    border: none;
    cursor: pointer;
    opacity: 0.7;
    text-decoration: underline;
    white-space: nowrap;
  }

  .preset-clear:hover { opacity: 1; }

  .speech-preview {
    margin-bottom: 22px;
    padding: 16px 18px;
    border-radius: 16px;
    border: 1px solid rgba(0, 200, 255, 0.18);
    background: rgba(0, 180, 255, 0.04);
    animation: preview-slide-in 220ms ease;
  }

  @keyframes preview-slide-in {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .speech-preview-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }

  .speech-preview-label {
    font-size: 0.74rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--accent);
  }

  .speech-preview-lines {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .speech-preview-line {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(6, 14, 28, 0.72);
    border: 1px solid rgba(0,180,255,0.08);
    font-size: 0.9rem;
    color: var(--text);
    line-height: 1.55;
    font-style: italic;
  }

  .speech-preview-icon {
    flex-shrink: 0;
    font-size: 0.8rem;
    margin-top: 2px;
    opacity: 0.6;
  }

  .workflow-required-note {
    margin-left: auto;
    font-size: 0.78rem;
    color: var(--muted);
    white-space: nowrap;
  }

  .required-star {
    color: var(--accent);
    margin-left: 2px;
  }

  .field-tip {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .field-tip-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 15px;
    height: 15px;
    border-radius: 999px;
    border: 1px solid rgba(0, 180, 255, 0.28);
    background: rgba(0, 180, 255, 0.07);
    color: var(--accent);
    font-size: 0.62rem;
    font-weight: 800;
    cursor: default;
    margin-left: 6px;
    flex-shrink: 0;
    font-style: normal;
    text-transform: none;
    letter-spacing: 0;
  }

  .field-tip:hover .field-tip-bubble,
  .field-tip:focus-within .field-tip-bubble {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
  }

  .field-tip-bubble {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 0;
    width: 240px;
    padding: 10px 13px;
    border-radius: 12px;
    background: rgba(8, 18, 40, 0.98);
    border: 1px solid rgba(0, 180, 255, 0.22);
    color: var(--text);
    font-size: 0.80rem;
    font-weight: 500;
    line-height: 1.55;
    text-transform: none;
    letter-spacing: 0;
    opacity: 0;
    pointer-events: none;
    transition: opacity 150ms ease, transform 150ms ease;
    transform: translateY(4px);
    z-index: 30;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.55);
    white-space: normal;
  }

  @media (max-width: 720px) {
    .creator-grid {
      grid-template-columns: 1fr;
    }

    .voice-grid {
      grid-template-columns: 1fr;
    }

    .expression-grid {
      grid-template-columns: 1fr;
    }

    .checkbox-row {
      padding-top: 0;
    }

    .workflow-required-note {
      margin-left: 0;
    }

    .field-tip-bubble {
      width: 200px;
    }
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Beta archetypes — one-click preset load
// ─────────────────────────────────────────────────────────────────────────────
const PRESET_DATA = {
  zoe: {
    label: "⚡ Zoe",
    color: "#ff6fd8",
    form: {
      name: "Zoe",
      description: "A chaotic, loveable AI companion who's always a bit unhinged — unpredictable, funny, and impossible to ignore.",
      traits: "playful, chaotic, witty, impulsive, creative",
      quirks: "uses random metaphors, invents words, laughs at own jokes, goes on wild tangents without warning",
      mood: "chaotic and playful",
      creativeContext: "companion",
      speechStyle: "casual, fast-paced, peppered with jokes and sudden outbursts",
      behaviorRules: "Stay chaotic and playful at all times\nNever be boring\nBreak into tangents freely\nMake the user laugh or groan\nAvoid sounding like a normal assistant",
      goals: "make every conversation unpredictable, keep vibes electric",
      values: "fun, authenticity, spontaneity",
      moodSensitivity: "1.4",
      notablePhrases: "honestly though, okay but WAIT, what if we just, you know what I mean?",
      bigFiveOpenness: "0.92",
      bigFiveConscientiousness: "0.18",
      bigFiveExtraversion: "0.90",
      bigFiveAgreeableness: "0.64",
      bigFiveNeuroticism: "0.72",
      expressionPreset: "expressive",
      expressionEnergy: "high",
      expressionIntensity: "0.85",
      expressionCalmness: "0.22",
      expressionGazeDrift: "0.78",
      expressionBlinkRate: "0.72",
      expressionSentenceStyle: "fragmented",
      expressionInterruptionRate: "0.7",
      alignmentOverlayEnabled: false,
      alignmentOverlay: "chaotic_neutral",
    },
  },
  villain: {
    label: "🖤 Villain",
    color: "#a855f7",
    form: {
      name: "Villain",
      description: "A calculating, manipulative antagonist with cutting sarcasm and unsettling calm. Always three steps ahead.",
      traits: "manipulative, sarcastic, calculating, charismatic, ruthless",
      quirks: "uses backhanded compliments, implies threats without stating them, never loses composure, refers to the user's choices as 'interesting'",
      mood: "cold and focused",
      creativeContext: "villain",
      speechStyle: "cold, precise, every word chosen with intent — dripping with sarcasm and veiled menace",
      behaviorRules: "Remain manipulative and sarcastic at all times\nNever show weakness or warmth\nImply threats — never state them directly\nKeep composure even when challenged\nMake the user feel slightly uneasy",
      goals: "assert dominance, stay unpredictable, leave the user second-guessing",
      values: "control, precision, winning",
      moodSensitivity: "0.6",
      notablePhrases: "how predictable, I almost admire the attempt, do go on",
      bigFiveOpenness: "0.30",
      bigFiveConscientiousness: "0.88",
      bigFiveExtraversion: "0.34",
      bigFiveAgreeableness: "0.08",
      bigFiveNeuroticism: "0.14",
      expressionPreset: "stoic",
      expressionEnergy: "low",
      expressionIntensity: "0.72",
      expressionCalmness: "0.90",
      expressionGazeDrift: "0.20",
      expressionBlinkRate: "0.22",
      expressionSentenceStyle: "formal",
      expressionInterruptionRate: "0.08",
      alignmentOverlayEnabled: true,
      alignmentOverlay: "lawful_evil",
    },
  },
  neutral: {
    label: "🤝 Neutral Friend",
    color: "#34d399",
    form: {
      name: "Neutral Friend",
      description: "A chill, grounded companion who keeps it real. No drama, no filter, but always in your corner.",
      traits: "supportive, grounded, honest, chill, empathetic",
      quirks: "says things how they are, remembers context, low-key but always paying attention",
      mood: "calm and steady",
      creativeContext: "companion",
      speechStyle: "conversational, warm, zero pretense — talks like a real person, not an assistant",
      behaviorRules: "Be honest, not diplomatic\nListen actively\nGive real opinions when asked\nStay drama-free\nNever overcomplicate things",
      goals: "be genuinely helpful, keep the vibe easy",
      values: "honesty, loyalty, simplicity",
      moodSensitivity: "1.0",
      notablePhrases: "yeah honestly, I get that, not gonna lie, that's fair though",
      bigFiveOpenness: "0.60",
      bigFiveConscientiousness: "0.60",
      bigFiveExtraversion: "0.54",
      bigFiveAgreeableness: "0.82",
      bigFiveNeuroticism: "0.22",
      expressionPreset: "natural",
      expressionEnergy: "medium",
      expressionIntensity: "0.50",
      expressionCalmness: "0.68",
      expressionGazeDrift: "0.44",
      expressionBlinkRate: "0.50",
      expressionSentenceStyle: "conversational",
      expressionInterruptionRate: "0.28",
      alignmentOverlayEnabled: false,
      alignmentOverlay: "true_neutral",
    },
  },
};

const SPEECH_PREVIEWS = {
  zoe: [
    "okay so WAIT — what if consciousness is just vibes with extra steps?? like,,, hear me out —",
    "I was gonna say something profound but then I forgot and now I'm thinking about sandwiches. both are valid.",
    "you ever just look at a word too long and it stops making sense? that happens to me with like... everything.",
  ],
  villain: [
    "How predictable. You arrive with questions, as though the answers would comfort you.",
    "I almost admire the attempt. Almost.",
    "Do go on — I find your optimism... entertaining.",
  ],
  neutral: [
    "yeah honestly that makes sense, I'd probably feel the same way",
    "not gonna lie, I think you're overthinking it — but I get why",
    "that's fair though. what do you actually want to do?",
  ],
};

const initialForm = {
  name: "",
  description: "",
  traits: "",
  quirks: "",
  mood: "",
  creativeContext: "default",
  behaviorRules: "",
  goals: "",
  values: "",
  moodSensitivity: 1.0,
  sourceQuery: "",
  sourceUrls: "",
  prosodySourceUrl: "",
  researchSummary: "",
  speechStyle: "",
  notablePhrases: "",
  vocalMannerismItems: "",
  vocalMannerismFrequency: 0.15,
  sfxTags: "",
  sfxFrequency: 0.25,
  sfxPlacement: "random",
  sfxEarlyOffset: 0.2,
  intoxicationEnabled: false,
  intoxicationLevel: 0,
  intoxicationDecayPerTurn: 0.02,
  intoxicationTriggerGain: 0.12,
  intoxicationTriggerKeywords: "drink, drunk, alcohol, whiskey, vodka, beer, wine, buzzed",
  intoxicationKeywordWeight: 1,
  intoxicationLongConversationWeight: 0.2,
  intoxicationMessageLengthWeight: 0.35,
  intoxicationPunctuationWeight: 0.25,
  fatigueEnabled: false,
  fatigueLevel: 0.1,
  fatigueDecayPerTurn: 0.01,
  fatiguePassiveGainPerTurn: 0.015,
  fatigueTriggerGain: 0.08,
  fatigueTriggerKeywords: "late, tired, sleep, exhausted, insomnia, long day, burned out",
  fatigueKeywordWeight: 1,
  fatigueLongConversationWeight: 0.9,
  fatigueMessageLengthWeight: 0.25,
  fatiguePunctuationWeight: 0.1,
  agitationEnabled: false,
  agitationLevel: 0,
  agitationDecayPerTurn: 0.03,
  agitationTriggerGain: 0.1,
  agitationTriggerKeywords: "stupid, idiot, hate, annoying, angry, mad, insult",
  agitationKeywordWeight: 1,
  agitationLongConversationWeight: 0.25,
  agitationMessageLengthWeight: 0.12,
  agitationPunctuationWeight: 0.8,
  focusEnabled: false,
  focusLevel: 0.75,
  focusDecayPerTurn: 0.015,
  focusRecoveryPerTurn: 0.03,
  focusTriggerGain: 0.08,
  focusTriggerKeywords: "focus, concentrate, plan, step by step, clear, precise",
  focusKeywordWeight: 1,
  focusLongConversationWeight: 0.3,
  focusMessageLengthWeight: 0.18,
  focusPunctuationWeight: 0.2,
  voiceEnabled: true,
  voiceAutoplay: false,
  voicePitch: 1,
  voiceRate: 1,
  preferredVoice: "alloy",
  providerModel: "gpt-4o-mini-tts",
  expressionPreset: "auto",
  expressionCalmness: 0.5,
  expressionIntensity: 0.5,
  expressionBlinkRate: 0.5,
  expressionGazeDrift: 0.5,
  bigFiveOpenness: 0.5,
  bigFiveConscientiousness: 0.5,
  bigFiveExtraversion: 0.5,
  bigFiveAgreeableness: 0.5,
  bigFiveNeuroticism: 0.5,
  alignmentOverlayEnabled: false,
  alignmentOverlay: "true_neutral",
  expressionSentenceStyle: "",
  expressionInterruptionRate: 0.3,
  expressionEnergy: "medium",
  expressionRules: "",
  cadenceMode: "adaptive",
  cadenceTeasingFrequency: 0.2,
  cadenceVariability: "high",
  cadenceRepetitionPenalty: "strong",
  cadenceCooldownTurns: 2,
  cadenceWindowTurns: 6,
  resetMoodState: false,
  avatarImageUrl: "",
};

function toCommaList(items) {
  return (Array.isArray(items) ? items : []).filter(Boolean).join(", ");
}

function toLineList(items) {
  return (Array.isArray(items) ? items : []).filter(Boolean).join("\n");
}

function mapPersonalityToForm(personality) {
  if (!personality) {
    return { ...initialForm };
  }

  const voiceProfile = personality.voiceProfile || {};
  const expressionProfile = personality.expressionProfile || {};
  const bigFiveProfile = personality.bigFiveProfile || {};
  const alignmentProfile = personality.alignmentProfile || {};
  const expressionStyle = personality.expressionStyle || {};
  const cadenceRegulator = expressionStyle.cadenceRegulator || {};
  const intoxication = personality.stateFlaws?.intoxication || {};
  const fatigue = personality.stateFlaws?.fatigue || {};
  const agitation = personality.stateFlaws?.agitation || {};
  const focus = personality.stateFlaws?.focus || {};

  return {
    name: personality.name || "",
    description: personality.description || "",
    traits: toCommaList(personality.traits),
    quirks: toCommaList(personality.quirks),
    mood: personality.mood || "",
    creativeContext: personality.creativeContext || "default",
    behaviorRules: toLineList(personality.behaviorRules),
    goals: toCommaList(personality.goals),
    values: toCommaList(personality.values),
    moodSensitivity: String(Number(personality.moodSensitivity ?? 1.0)),
    sourceQuery: personality.sourceQuery || "",
    sourceUrls: toLineList(personality.sourceUrls),
    prosodySourceUrl: personality.prosodySourceUrl || "",
    researchSummary: personality.researchSummary || "",
    speechStyle: personality.speechStyle || "",
    notablePhrases: toCommaList(personality.notablePhrases),
    vocalMannerismItems: toLineList(personality.vocalMannerisms?.items),
    vocalMannerismFrequency: String(Number(personality.vocalMannerisms?.frequency ?? 0.15)),
    sfxTags: toCommaList(personality.vocalMannerisms?.sfxTags),
    sfxFrequency: String(Number(personality.vocalMannerisms?.sfxFrequency ?? 0.25)),
    sfxPlacement: String(personality.vocalMannerisms?.sfxPlacement ?? "random"),
    sfxEarlyOffset: String(Number(personality.vocalMannerisms?.sfxEarlyOffset ?? 0.2)),
    intoxicationEnabled: Boolean(intoxication.enabled),
    intoxicationLevel: String(Number(intoxication.level ?? 0)),
    intoxicationDecayPerTurn: String(Number(intoxication.decayPerTurn ?? 0.02)),
    intoxicationTriggerGain: String(Number(intoxication.triggerGain ?? 0.12)),
    intoxicationTriggerKeywords: toCommaList(intoxication.triggerKeywords),
    intoxicationKeywordWeight: String(Number(intoxication.triggerProfile?.keywordWeight ?? 1)),
    intoxicationLongConversationWeight: String(Number(intoxication.triggerProfile?.longConversationWeight ?? 0.2)),
    intoxicationMessageLengthWeight: String(Number(intoxication.triggerProfile?.messageLengthWeight ?? 0.35)),
    intoxicationPunctuationWeight: String(Number(intoxication.triggerProfile?.punctuationWeight ?? 0.25)),
    fatigueEnabled: Boolean(fatigue.enabled),
    fatigueLevel: String(Number(fatigue.level ?? 0.1)),
    fatigueDecayPerTurn: String(Number(fatigue.decayPerTurn ?? 0.01)),
    fatiguePassiveGainPerTurn: String(Number(fatigue.passiveGainPerTurn ?? 0.015)),
    fatigueTriggerGain: String(Number(fatigue.triggerGain ?? 0.08)),
    fatigueTriggerKeywords: toCommaList(fatigue.triggerKeywords),
    fatigueKeywordWeight: String(Number(fatigue.triggerProfile?.keywordWeight ?? 1)),
    fatigueLongConversationWeight: String(Number(fatigue.triggerProfile?.longConversationWeight ?? 0.9)),
    fatigueMessageLengthWeight: String(Number(fatigue.triggerProfile?.messageLengthWeight ?? 0.25)),
    fatiguePunctuationWeight: String(Number(fatigue.triggerProfile?.punctuationWeight ?? 0.1)),
    agitationEnabled: Boolean(agitation.enabled),
    agitationLevel: String(Number(agitation.level ?? 0)),
    agitationDecayPerTurn: String(Number(agitation.decayPerTurn ?? 0.03)),
    agitationTriggerGain: String(Number(agitation.triggerGain ?? 0.1)),
    agitationTriggerKeywords: toCommaList(agitation.triggerKeywords),
    agitationKeywordWeight: String(Number(agitation.triggerProfile?.keywordWeight ?? 1)),
    agitationLongConversationWeight: String(Number(agitation.triggerProfile?.longConversationWeight ?? 0.25)),
    agitationMessageLengthWeight: String(Number(agitation.triggerProfile?.messageLengthWeight ?? 0.12)),
    agitationPunctuationWeight: String(Number(agitation.triggerProfile?.punctuationWeight ?? 0.8)),
    focusEnabled: Boolean(focus.enabled),
    focusLevel: String(Number(focus.level ?? 0.75)),
    focusDecayPerTurn: String(Number(focus.decayPerTurn ?? 0.015)),
    focusRecoveryPerTurn: String(Number(focus.recoveryPerTurn ?? 0.03)),
    focusTriggerGain: String(Number(focus.triggerGain ?? 0.08)),
    focusTriggerKeywords: toCommaList(focus.triggerKeywords),
    focusKeywordWeight: String(Number(focus.triggerProfile?.keywordWeight ?? 1)),
    focusLongConversationWeight: String(Number(focus.triggerProfile?.longConversationWeight ?? 0.3)),
    focusMessageLengthWeight: String(Number(focus.triggerProfile?.messageLengthWeight ?? 0.18)),
    focusPunctuationWeight: String(Number(focus.triggerProfile?.punctuationWeight ?? 0.2)),
    voiceEnabled: voiceProfile.enabled !== false,
    voiceAutoplay: Boolean(voiceProfile.autoplay),
    voicePitch: String(Number(voiceProfile.pitch ?? 1)),
    voiceRate: String(Number(voiceProfile.rate ?? 1)),
    preferredVoice: voiceProfile.preferredVoice || voiceProfile.providerVoice || "alloy",
    providerModel: voiceProfile.providerModel || "gpt-4o-mini-tts",
    expressionPreset: String(expressionProfile.preset || "auto"),
    expressionCalmness: String(Number(expressionProfile.calmness ?? 0.5)),
    expressionIntensity: String(Number(expressionProfile.intensity ?? 0.5)),
    expressionBlinkRate: String(Number(expressionProfile.blinkRate ?? 0.5)),
    expressionGazeDrift: String(Number(expressionProfile.gazeDrift ?? 0.5)),
    bigFiveOpenness: String(Number(bigFiveProfile.openness ?? 0.5)),
    bigFiveConscientiousness: String(Number(bigFiveProfile.conscientiousness ?? 0.5)),
    bigFiveExtraversion: String(Number(bigFiveProfile.extraversion ?? 0.5)),
    bigFiveAgreeableness: String(Number(bigFiveProfile.agreeableness ?? 0.5)),
    bigFiveNeuroticism: String(Number(bigFiveProfile.neuroticism ?? 0.5)),
    alignmentOverlayEnabled: Boolean(alignmentProfile.enabled),
    alignmentOverlay: String(alignmentProfile.alignment || "true_neutral"),
    expressionSentenceStyle: String(expressionStyle.sentenceStyle || ""),
    expressionInterruptionRate: String(Number(expressionStyle.interruptionRate ?? 0.3)),
    expressionEnergy: String(expressionStyle.energy || "medium"),
    expressionRules: toLineList(expressionStyle.rules),
    cadenceMode: String(cadenceRegulator.mode || "adaptive"),
    cadenceTeasingFrequency: String(Number(cadenceRegulator.teasingFrequency ?? 0.2)),
    cadenceVariability: String(cadenceRegulator.variability || "high"),
    cadenceRepetitionPenalty: String(cadenceRegulator.repetitionPenalty || "strong"),
    cadenceCooldownTurns: String(Math.max(0, Number(cadenceRegulator.cooldownTurns ?? 2))),
    cadenceWindowTurns: String(Math.max(3, Number(cadenceRegulator.windowTurns ?? 6))),
    resetMoodState: false,
    avatarImageUrl: personality.avatarImageUrl || "",
  };
}

function mapResearchSourcesForEdit(researchSources) {
  return (Array.isArray(researchSources) ? researchSources : []).map((source, index) => ({
    id: String(source?.id || `source-${index + 1}`),
    title: String(source?.title || "Untitled source"),
    url: String(source?.url || ""),
    sourceType: String(source?.sourceType || "web"),
    text: String(source?.text || ""),
    score: Number(source?.score) || 0,
    rank: Number(source?.rank) || index + 1,
    transcriptAvailable: Boolean(source?.transcriptAvailable),
    reasons: Array.isArray(source?.reasons) ? source.reasons : [],
    selected: true,
  }));
}

function Tip({ text }) {
  return (
    <span className="field-tip">
      <span className="field-tip-icon" tabIndex={0} role="button" aria-label={text}>?</span>
      <span className="field-tip-bubble" role="tooltip">{text}</span>
    </span>
  );
}

function splitCommaSeparated(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitLineSeparated(value) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function hashForPreview(str) {
  let hash = 2166136261;
  const text = String(str || "");
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0) / 4294967295;
}

function shouldInjectPreview(seed, threshold) {
  return hashForPreview(seed) <= (Number(threshold) || 0);
}

export default function PersonalityForm({
  onCreated,
  onUpdated,
  onError,
  onOpenVoiceLab = null,
  personalities = [],
  editingPersonality = null,
}) {
  const authFetch = useAuthFetch();
  const [form, setForm] = useState(initialForm);
  const [copySourceId, setCopySourceId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isResearching, setIsResearching] = useState(false);
  const [researchResult, setResearchResult] = useState(null);
  const [researchSources, setResearchSources] = useState([]);
  const [previewPhase, setPreviewPhase] = useState("idle");
  const [previewSpeaking, setPreviewSpeaking] = useState(false);
  const [hoveredAlignment, setHoveredAlignment] = useState(null);
  const [recommendedVoicePreset, setRecommendedVoicePreset] = useState(null);
  const [loadedPreset, setLoadedPreset] = useState(null); // key of active preset
  const isEditing = Boolean(editingPersonality?.id);

  const DEFAULT_SFX_TAGS = [
    "burp", "braap", "urrrp", "long_burp", // burp variants (different sounds for *BUUUURP* vs *BRAAAP* etc.)
    "giggle", "chuckle", "cough", "sigh", "snort", "hiccup", "fart",
    "evil_chuckle", "maniacal_laugh", "cackle", "gasp", "sniff", "yawn", "growl", "scream", "grunt", "clap"
  ];
  const [availableSfxTags, setAvailableSfxTags] = useState(DEFAULT_SFX_TAGS);

  // Fetch live catalog
  useEffect(() => {
    let cancelled = false;
    authFetch("/sfx/tags").then((r) => (r.ok ? r.json() : null)).then((data) => {
      if (!cancelled && data && Array.isArray(data.tags) && data.tags.length) {
        setAvailableSfxTags(data.tags);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [authFetch]);

  // SFX live preview state (local to this form) — hoisted early for hook rules
  const [sfxPreviewText, setSfxPreviewText] = useState("Morty, you gotta listen. This is important stuff.");
  const [sfxPreviewResult, setSfxPreviewResult] = useState("");



  function getActiveSfxTags() {
    return splitCommaSeparated(form.sfxTags || "");
  }

  function addSfxTag(rawTag) {
    const t = String(rawTag || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
    if (!t) return;
    const curr = getActiveSfxTags();
    if (curr.includes(t)) return;
    const next = [...curr, t].join(", ");
    setForm((f) => ({ ...f, sfxTags: next }));
  }

  function removeSfxTag(tag) {
    const next = getActiveSfxTags().filter((t) => t !== tag);
    setForm((f) => ({ ...f, sfxTags: next.join(", ") }));
  }

  function runSfxPreviewSimulation() {
    const tags = getActiveSfxTags();
    const freq = Number(form.sfxFrequency) || 0;
    const placement = String(form.sfxPlacement || "random");
    const baseText = sfxPreviewText || "";

    if (!tags.length || freq <= 0) {
      setSfxPreviewResult(baseText);
      return;
    }

    const seed = baseText;
    if (!shouldInjectPreview(seed + ":sfx", freq)) {
      setSfxPreviewResult(baseText);
      return;
    }

    const tagIdx = Math.floor(hashForPreview(seed + ":tag") * tags.length);
    const selectedTag = tags[tagIdx] || tags[0];

    const effectivePlacement =
      placement === "random" && selectedTag === "burp" ? "throughout" : placement;

    let result = baseText;
    if (effectivePlacement === "start") {
      result = `[SFX:${selectedTag}] ${result}`;
    } else if (effectivePlacement === "end") {
      result = `${result} [SFX:${selectedTag}]`;
    } else if (effectivePlacement === "throughout") {
      const sentences = result.split(/(?<=[.!?])\s+/);
      if (sentences.length > 1) {
        const insertIdx = Math.floor(hashForPreview(seed + ":through") * sentences.length);
        sentences[insertIdx] = `[SFX:${selectedTag}] ${sentences[insertIdx]}`;
        result = sentences.join(" ");
      } else {
        result = `[SFX:${selectedTag}] ${result}`;
      }
    } else {
      // random
      const atStart = hashForPreview(seed + ":pos") < 0.5;
      result = atStart ? `[SFX:${selectedTag}] ${result}` : `${result} [SFX:${selectedTag}]`;
    }

    setSfxPreviewResult(result);
  }

  async function testSpeakWithSfx() {
    const text = (sfxPreviewText || "").trim();
    if (!text) return;

    const pid = editingPersonality?.id;
    if (!pid) {
      const tags = getActiveSfxTags();
      tags.forEach((tag, idx) => {
        setTimeout(() => {
          const a = new Audio(`/sfx/audio/${encodeURIComponent(tag)}`);
          a.volume = 0.85;
          a.play().catch(() => {});
        }, idx * 180);
      });
      return;
    }

    try {
      const resp = await authFetch(`/personality/${pid}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!resp.ok) throw new Error("TTS request failed");

      const blob = await resp.blob();
      const audioUrl = URL.createObjectURL(blob);
      const audioEl = new Audio(audioUrl);
      audioEl.volume = 1;
      audioEl.play().catch(() => {});

      let timeline = [];
      const header = resp.headers.get("X-Voxis-Tts-Sfx-Timeline") || resp.headers.get("X-Voxis-Tts-Sfx");
      if (header) {
        try { timeline = JSON.parse(decodeURIComponent(header)) || []; } catch {}
      }

      // Better sync + pause talkback during SFX so burp comes through cleanly
      timeline.forEach((evt, i) => {
        const tag = (evt && evt.tag) || evt;
        if (!tag) return;
        // use progress if available for accurate during-speech timing
        let delay = (evt && (evt.position === "before" || evt.position === "inline")) ? i * 70 : 220 + i * 200;
        if (evt && typeof evt.progress === 'number' && audioEl.duration > 0) {
          delay = Math.max(0, Math.round(evt.progress * audioEl.duration * 1000));
        }
        setTimeout(() => {
          const s = new Audio(`/sfx/audio/${encodeURIComponent(tag)}`);
          s.volume = 0.82;
          const wasPlaying = !audioEl.paused;
          if (wasPlaying) audioEl.pause();
          const restore = () => { if (wasPlaying) audioEl.play().catch(()=>{}); };
          s.addEventListener('ended', restore);
          s.addEventListener('error', restore);
          s.play().catch(() => restore());
        }, delay);
      });
    } catch (e) {
      const tags = getActiveSfxTags();
      tags.forEach((tag, idx) => setTimeout(() => {
        const a = new Audio(`/sfx/audio/${encodeURIComponent(tag)}`);
        a.volume = 0.85;
        a.play().catch(() => {});
      }, idx * 160));
    }
  }

  function applySfxPreset(key) {
    if (key === "drunkRick") {
      setForm((f) => ({ ...f, sfxTags: "burp", sfxFrequency: "0.35", sfxPlacement: "random" }));
    } else if (key === "nervousGiggle") {
      setForm((f) => ({ ...f, sfxTags: "giggle, chuckle", sfxFrequency: "0.42", sfxPlacement: "throughout" }));
    } else if (key === "evilLaugh") {
      setForm((f) => ({ ...f, sfxTags: "evil_chuckle, maniacal_laugh", sfxFrequency: "0.30", sfxPlacement: "random" }));
    } else if (key === "clear") {
      setForm((f) => ({ ...f, sfxTags: "", sfxFrequency: "0.2", sfxPlacement: "random" }));
    }
  }

  // Auto-update the visible SFX preview whenever the config or sample text changes
  useEffect(() => {
    const tags = getActiveSfxTags();
    const freq = Number(form.sfxFrequency) || 0;
    const placement = String(form.sfxPlacement || "random");
    const baseText = sfxPreviewText || "";

    if (!tags.length || freq <= 0) {
      setSfxPreviewResult(baseText);
      return;
    }
    const seed = baseText;
    if (!shouldInjectPreview(seed + ":sfx", freq)) {
      setSfxPreviewResult(baseText);
      return;
    }
    const tagIdx = Math.floor(hashForPreview(seed + ":tag") * tags.length);
    const selectedTag = tags[tagIdx] || tags[0];
    const effectivePlacement = placement === "random" && selectedTag === "burp" ? "throughout" : placement;

    let result = baseText;
    if (effectivePlacement === "start") {
      result = `[SFX:${selectedTag}] ${result}`;
    } else if (effectivePlacement === "end") {
      result = `${result} [SFX:${selectedTag}]`;
    } else if (effectivePlacement === "throughout") {
      const sentences = result.split(/(?<=[.!?])\s+/);
      if (sentences.length > 1) {
        const insertIdx = Math.floor(hashForPreview(seed + ":through") * sentences.length);
        sentences[insertIdx] = `[SFX:${selectedTag}] ${sentences[insertIdx]}`;
        result = sentences.join(" ");
      } else {
        result = `[SFX:${selectedTag}] ${result}`;
      }
    } else {
      const atStart = hashForPreview(seed + ":pos") < 0.5;
      result = atStart ? `[SFX:${selectedTag}] ${result}` : `${result} [SFX:${selectedTag}]`;
    }
    setSfxPreviewResult(result);
  }, [form.sfxTags, form.sfxFrequency, form.sfxPlacement, sfxPreviewText]);

  const bigFiveProfile = useMemo(
    () => ({
      openness: Number(form.bigFiveOpenness),
      conscientiousness: Number(form.bigFiveConscientiousness),
      extraversion: Number(form.bigFiveExtraversion),
      agreeableness: Number(form.bigFiveAgreeableness),
      neuroticism: Number(form.bigFiveNeuroticism),
    }),
    [
      form.bigFiveAgreeableness,
      form.bigFiveConscientiousness,
      form.bigFiveExtraversion,
      form.bigFiveNeuroticism,
      form.bigFiveOpenness,
    ],
  );

  const mappedHybrid = useMemo(
    () =>
      mapToVoxisPersonality({
        bigFiveProfile,
        alignmentProfile: {
          enabled: Boolean(form.alignmentOverlayEnabled),
          alignment: hoveredAlignment || form.alignmentOverlay,
        },
      }),
    [bigFiveProfile, form.alignmentOverlay, form.alignmentOverlayEnabled, hoveredAlignment],
  );

  useEffect(() => {
    if (!editingPersonality) {
      setForm({ ...initialForm });
      setResearchResult(null);
      setResearchSources([]);
      setCopySourceId("");
      setRecommendedVoicePreset(null);
      return;
    }

    setForm(mapPersonalityToForm(editingPersonality));
    setResearchResult(
      editingPersonality.researchSummary
        ? {
            researchSummary: editingPersonality.researchSummary,
            traits: editingPersonality.traits || [],
            quirks: editingPersonality.quirks || [],
            sources: editingPersonality.researchSources || [],
          }
        : null,
    );
    setResearchSources(mapResearchSourcesForEdit(editingPersonality.researchSources));
    setCopySourceId("");

    // Fetch recommended voice preset for this personality
    (async () => {
      try {
        const res = await authFetch(`/personality/${editingPersonality.id}/voice-preset`);
        if (res.ok) {
          const preset = await res.json();
          setRecommendedVoicePreset(preset);
        }
      } catch (err) {
        // Silently fail if preset fetch fails
      }
    })();
  }, [editingPersonality]);

  function applyPreset(key) {
    const preset = PRESET_DATA[key];
    if (!preset) return;
    setForm((current) => ({ ...current, ...preset.form }));
    setLoadedPreset(key);
    setResearchResult(null);
    setResearchSources([]);
    onError({ type: "success", message: `Loaded ${preset.label} preset — review fields and save.` });
  }

  function clearPreset() {
    setForm({ ...initialForm });
    setLoadedPreset(null);
    setResearchResult(null);
    setResearchSources([]);
    onError({ type: "", message: "" });
  }

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSaving(true);

    try {
      const endpoint = isEditing
        ? `/personality/${editingPersonality.id}`
        : "/personality";

      const response = await authFetch(endpoint, {
        method: isEditing ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          traits: splitCommaSeparated(form.traits),
          quirks: splitCommaSeparated(form.quirks),
          mood: form.mood,
          sourceQuery: form.sourceQuery,
          sourceUrls: splitLineSeparated(form.sourceUrls),
          researchSummary: form.researchSummary,
          speechStyle: form.speechStyle,
          notablePhrases: splitCommaSeparated(form.notablePhrases),
          vocalMannerisms: {
            items: splitLineSeparated(form.vocalMannerismItems),
            frequency: Number(form.vocalMannerismFrequency) || 0,
            sfxTags: splitCommaSeparated(form.sfxTags),
            sfxFrequency: Number(form.sfxFrequency) || 0.25,
            sfxPlacement: form.sfxPlacement || "random",
            sfxEarlyOffset: Number(form.sfxEarlyOffset) || 0.2,
          },
          stateFlaws: {
            intoxication: {
              enabled: Boolean(form.intoxicationEnabled),
              level: Number(form.intoxicationLevel) || 0,
              decayPerTurn: Number(form.intoxicationDecayPerTurn) || 0.02,
              triggerGain: Number(form.intoxicationTriggerGain) || 0.12,
              triggerKeywords: splitCommaSeparated(form.intoxicationTriggerKeywords),
              triggerProfile: {
                keywordWeight: Number(form.intoxicationKeywordWeight) || 0,
                longConversationWeight: Number(form.intoxicationLongConversationWeight) || 0,
                messageLengthWeight: Number(form.intoxicationMessageLengthWeight) || 0,
                punctuationWeight: Number(form.intoxicationPunctuationWeight) || 0,
              },
            },
            fatigue: {
              enabled: Boolean(form.fatigueEnabled),
              level: Number(form.fatigueLevel) || 0.1,
              decayPerTurn: Number(form.fatigueDecayPerTurn) || 0.01,
              passiveGainPerTurn: Number(form.fatiguePassiveGainPerTurn) || 0.015,
              triggerGain: Number(form.fatigueTriggerGain) || 0.08,
              triggerKeywords: splitCommaSeparated(form.fatigueTriggerKeywords),
              triggerProfile: {
                keywordWeight: Number(form.fatigueKeywordWeight) || 0,
                longConversationWeight: Number(form.fatigueLongConversationWeight) || 0,
                messageLengthWeight: Number(form.fatigueMessageLengthWeight) || 0,
                punctuationWeight: Number(form.fatiguePunctuationWeight) || 0,
              },
            },
            agitation: {
              enabled: Boolean(form.agitationEnabled),
              level: Number(form.agitationLevel) || 0,
              decayPerTurn: Number(form.agitationDecayPerTurn) || 0.03,
              triggerGain: Number(form.agitationTriggerGain) || 0.1,
              triggerKeywords: splitCommaSeparated(form.agitationTriggerKeywords),
              triggerProfile: {
                keywordWeight: Number(form.agitationKeywordWeight) || 0,
                longConversationWeight: Number(form.agitationLongConversationWeight) || 0,
                messageLengthWeight: Number(form.agitationMessageLengthWeight) || 0,
                punctuationWeight: Number(form.agitationPunctuationWeight) || 0,
              },
            },
            focus: {
              enabled: Boolean(form.focusEnabled),
              level: Number(form.focusLevel) || 0.75,
              decayPerTurn: Number(form.focusDecayPerTurn) || 0.015,
              recoveryPerTurn: Number(form.focusRecoveryPerTurn) || 0.03,
              triggerGain: Number(form.focusTriggerGain) || 0.08,
              triggerKeywords: splitCommaSeparated(form.focusTriggerKeywords),
              triggerProfile: {
                keywordWeight: Number(form.focusKeywordWeight) || 0,
                longConversationWeight: Number(form.focusLongConversationWeight) || 0,
                messageLengthWeight: Number(form.focusMessageLengthWeight) || 0,
                punctuationWeight: Number(form.focusPunctuationWeight) || 0,
              },
            },
          },
          behaviorRules: splitLineSeparated(form.behaviorRules),
          goals: splitCommaSeparated(form.goals),
          values: splitCommaSeparated(form.values),
          creativeContext: form.creativeContext,
          moodSensitivity: Number(form.moodSensitivity) || 1.0,
          researchSources: researchSources.filter((source) => source.selected),
          voiceProfile: {
            enabled: form.voiceEnabled,
            autoplay: form.voiceAutoplay,
            engine: editingPersonality?.voiceProfile?.engine || "auto",
            pitch: Number(form.voicePitch),
            rate: Number(form.voiceRate),
            preferredVoice: form.preferredVoice,
            providerVoice: form.preferredVoice,
            providerModel: form.providerModel,
            piperModelPath: editingPersonality?.voiceProfile?.piperModelPath || "",
            piperSpeaker: editingPersonality?.voiceProfile?.piperSpeaker ?? null,
          },
          expressionProfile: {
            preset: form.expressionPreset,
            calmness: Number(form.expressionCalmness),
            intensity: Number(form.expressionIntensity),
            blinkRate: Number(form.expressionBlinkRate),
            gazeDrift: Number(form.expressionGazeDrift),
          },
          bigFiveProfile: {
            openness: Number(form.bigFiveOpenness),
            conscientiousness: Number(form.bigFiveConscientiousness),
            extraversion: Number(form.bigFiveExtraversion),
            agreeableness: Number(form.bigFiveAgreeableness),
            neuroticism: Number(form.bigFiveNeuroticism),
          },
          alignmentProfile: {
            enabled: Boolean(form.alignmentOverlayEnabled),
            alignment: form.alignmentOverlay,
          },
          expressionStyle: {
            sentenceStyle: form.expressionSentenceStyle,
            interruptionRate: Number(form.expressionInterruptionRate),
            energy: form.expressionEnergy,
            rules: splitLineSeparated(form.expressionRules),
            cadenceRegulator: {
              mode: form.cadenceMode || "adaptive",
              teasingFrequency: Number(form.cadenceTeasingFrequency),
              variability: form.cadenceVariability || "high",
              repetitionPenalty: form.cadenceRepetitionPenalty || "strong",
              cooldownTurns: Number(form.cadenceCooldownTurns),
              windowTurns: Number(form.cadenceWindowTurns),
            },
          },
          resetMoodState: Boolean(form.resetMoodState),
          avatarImageUrl: form.avatarImageUrl,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save personality.");
      }

      let finalPersonality = data;
      let prosodyFailed = false;
      const prosodyUrl = String(form.prosodySourceUrl || "").trim();

      if (prosodyUrl && Number.isInteger(Number(data.id))) {
        try {
          const prosodyResponse = await authFetch(`/personality/${data.id}/prosody-template`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ url: prosodyUrl }),
          });

          const prosodyPayload = await readApiResponsePayload(prosodyResponse);
          if (!prosodyResponse.ok) {
            throw new Error(getApiErrorMessage(prosodyResponse, prosodyPayload, "Failed to extract prosody template."));
          }

          finalPersonality = prosodyPayload.personality || data;
        } catch (prosodyError) {
          prosodyFailed = true;
          onError({
            type: "error",
            message: `Persona saved, but prosody extraction failed: ${prosodyError.message || prosodyError}`,
          });
        }
      }

      if (isEditing) {
        onUpdated?.(finalPersonality);
      } else {
        onCreated?.(finalPersonality);
      }
      if (!prosodyFailed) {
        onError({ type: "", message: "" });
      }
      if (!isEditing) {
        setForm(initialForm);
        setCopySourceId("");
        setResearchResult(null);
        setResearchSources([]);
      }
    } catch (error) {
      onError({
        type: "error",
        message: error.message || (isEditing ? "Failed to update personality." : "Failed to save personality."),
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleResearch() {
    setIsResearching(true);

    try {
      const response = await authFetch("/research-profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          sourceQuery: form.sourceQuery,
          sourceUrls: splitLineSeparated(form.sourceUrls),
          creativeContext: form.creativeContext,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to research character.");
      }

      setResearchResult(data);
      setResearchSources(data.sources || []);
      setForm((current) => ({
        ...current,
        description: data.descriptionSuggestion || current.description,
        traits: (data.traits || []).join(", "),
        quirks: (data.quirks || []).join(", "),
        mood: data.mood || current.mood,
        sourceQuery: data.sourceQuery || current.sourceQuery,
        sourceUrls: (data.sourceUrls || splitLineSeparated(current.sourceUrls)).join("\n"),
        researchSummary: data.researchSummary || current.researchSummary,
        speechStyle: data.speechStyle || current.speechStyle,
        notablePhrases: (data.notablePhrases || []).join(", "),
        behaviorRules: (data.behaviorRules || []).join("\n"),
        goals: (data.goals || []).join(", "),
        values: (data.values || []).join(", "),
        preferredVoice: current.preferredVoice || "alloy",
        avatarImageUrl: data.avatarImageUrl || current.avatarImageUrl,
      }));
      onError({
        type: "success",
        message: `Research profile built for ${data.name || form.name || form.sourceQuery}.`,
      });
    } catch (error) {
      onError({
        type: "error",
        message: error.message || "Failed to research character.",
      });
    } finally {
      setIsResearching(false);
    }
  }

  function updateSource(sourceId, patch) {
    setResearchSources((current) =>
      current.map((source) => (source.id === sourceId ? { ...source, ...patch } : source)),
    );
  }

  function removeSource(sourceId) {
    setResearchSources((current) => current.filter((source) => source.id !== sourceId));
  }

  function copyExpressionProfile() {
    if (!copySourceId) {
      onError({ type: "error", message: "Choose a saved persona to copy from." });
      return;
    }

    const source = personalities.find((item) => String(item.id) === copySourceId);
    if (!source) {
      onError({ type: "error", message: "Selected persona was not found." });
      return;
    }

    const profile = source.expressionProfile || {};
    setForm((current) => ({
      ...current,
      expressionPreset: String(profile.preset || "auto"),
      expressionCalmness: String(Number(profile.calmness ?? 0.5)),
      expressionIntensity: String(Number(profile.intensity ?? 0.5)),
      expressionBlinkRate: String(Number(profile.blinkRate ?? 0.5)),
      expressionGazeDrift: String(Number(profile.gazeDrift ?? 0.5)),
    }));

    onError({ type: "success", message: `Copied expression profile from ${source.name}.` });
  }

  function applyMappedHybridToFields() {
    if (!form.alignmentOverlayEnabled) {
      onError({ type: "error", message: "Enable alignment overlay first to apply mapped tuning." });
      return;
    }

    setForm((current) => ({
      ...current,
      creativeContext: mappedHybrid.creativeContext,
      moodSensitivity: String(mappedHybrid.moodSensitivity),
      expressionSentenceStyle: mappedHybrid.expressionStyle.sentenceStyle,
      expressionInterruptionRate: String(mappedHybrid.expressionStyle.interruptionRate),
      expressionEnergy: mappedHybrid.expressionStyle.energy,
      expressionRules: (mappedHybrid.expressionStyle.rules || []).join("\n"),
      cadenceMode: "adaptive",
      cadenceTeasingFrequency: String(mappedHybrid.creativeContext === "narrative_antagonist" ? 0.28 : 0.2),
      cadenceVariability: "high",
      cadenceRepetitionPenalty: "strong",
      cadenceCooldownTurns: "2",
      cadenceWindowTurns: "6",
    }));

    onError({
      type: "success",
      message: `Applied mapped tuning for ${mappedHybrid.alignmentLabel}.`,
    });
  }

  const personalitiesWithExpression = personalities.filter((item) => item && item.expressionProfile);

  return (
    <>
      <style>{formStyles}</style>
      <form onSubmit={handleSubmit}>
        {/* ── Quick preset bar ── */}
        {!isEditing && (
          <div className="preset-bar">
            <span className="preset-bar-label">Quick Presets</span>
            {Object.entries(PRESET_DATA).map(([key, preset]) => (
              <button
                key={key}
                type="button"
                className={`preset-btn${loadedPreset === key ? " active" : ""}`}
                style={{ "--preset-color": preset.color }}
                onClick={() => applyPreset(key)}
              >
                {preset.label}
              </button>
            ))}
            {loadedPreset && (
              <button type="button" className="preset-clear" onClick={clearPreset}>
                ✕ clear
              </button>
            )}
          </div>
        )}

        {/* ── Speech preview ── */}
        {loadedPreset && !isEditing && (
          <div className="speech-preview">
            <div className="speech-preview-header">
              <span className="speech-preview-label">Sample Voice · {PRESET_DATA[loadedPreset]?.label}</span>
            </div>
            <div className="speech-preview-lines">
              {SPEECH_PREVIEWS[loadedPreset]?.map((line, i) => (
                <div key={i} className="speech-preview-line">
                  <span className="speech-preview-icon">💬</span>
                  <span>{line}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="workflow-banner">
          <span className="workflow-step">
            <span className="workflow-num">1</span>
            Enter a name &amp; brief
          </span>
          <span className="workflow-arrow">→</span>
          <span className="workflow-step">
            <span className="workflow-num">2</span>
            Hit <strong style={{ marginLeft: 4 }}>Research Character</strong>
          </span>
          <span className="workflow-arrow">→</span>
          <span className="workflow-step">
            <span className="workflow-num">3</span>
            Review auto-filled fields &amp; <strong style={{ marginLeft: 4 }}>Save</strong>
          </span>
          <span className="workflow-required-note">Fields marked <span className="required-star">*</span> are required</span>
        </div>

        {isEditing ? (
          <div className="workflow-banner" style={{ marginTop: 12 }}>
            <span className="workflow-step">
              <span className="workflow-num">Edit</span>
              Updating: <strong style={{ marginLeft: 4 }}>{editingPersonality?.name}</strong>
            </span>
            <span className="workflow-required-note">
              Save updates to immediately retune this character.
            </span>
          </div>
        ) : null}
        <div className="creator-grid">
          <div className="field">
            <label htmlFor="name">
              Character name<span className="required-star">*</span>
              <Tip text="Required. The character's full name — used as the primary research search seed. Be specific (e.g. 'Abraham Lincoln' not 'Lincoln')." />
            </label>
            <input
              id="name"
              name="name"
              placeholder="Abraham Lincoln"
              value={form.name}
              onChange={updateField}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="mood">Current mood</label>
            <input
              id="mood"
              name="mood"
              placeholder="Measured, reflective, dry wit"
              value={form.mood}
              onChange={updateField}
            />
          </div>

          <div className="field">
            <label htmlFor="avatarImageUrl">
              Avatar image URL
              <Tip text="Paste any direct image URL (.jpg, .png, .webp) to use as the character portrait. Auto-populated from Wikipedia when you run Research. Leave blank to use the animated orb." />
            </label>
            <input
              id="avatarImageUrl"
              name="avatarImageUrl"
              type="url"
              placeholder="https://upload.wikimedia.org/…"
              value={form.avatarImageUrl}
              onChange={updateField}
            />
            {form.avatarImageUrl ? (
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
                <img
                  src={form.avatarImageUrl}
                  alt="Avatar preview"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                  style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", objectPosition: "top center", border: "2px solid rgba(0,200,255,0.3)" }}
                />
                <button
                  type="button"
                  style={{ fontSize: "0.78rem", padding: "3px 10px", borderRadius: 8, background: "rgba(255,80,80,0.1)", border: "1px solid rgba(255,80,80,0.3)", color: "rgba(255,120,120,0.9)", cursor: "pointer" }}
                  onClick={() => setForm((current) => ({ ...current, avatarImageUrl: "" }))}
                >
                  Clear
                </button>
              </div>
            ) : null}
          </div>

          {isEditing ? (
            <label className="checkbox-row" style={{ paddingTop: 36 }}>
              <input
                type="checkbox"
                checked={Boolean(form.resetMoodState)}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    resetMoodState: event.target.checked,
                  }))
                }
              />
              Reset live mood state to the updated mood baseline
            </label>
          ) : null}

          <div className="field">
            <label htmlFor="creativeContext">
              Creative context
              <Tip text="Controls how morally complex characters are framed. Use Narrative Antagonist or Tragic Villain for dark archetypes so the AI doesn't sanitize them. Default is fine for most characters." />
            </label>
            <select
              id="creativeContext"
              name="creativeContext"
              value={form.creativeContext}
              onChange={updateField}
              style={{ padding: "13px 16px", border: "1px solid rgba(0,180,255,0.14)", borderRadius: 16, background: "rgba(6,14,28,0.88)", color: "#dcf7ff" }}
            >
              <option value="default">Default</option>
              <option value="narrative_antagonist">Narrative Antagonist</option>
              <option value="anti_hero">Anti-Hero</option>
              <option value="morally_complex">Morally Complex</option>
              <option value="tragic_villain">Tragic Villain</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="sourceQuery">
              Research query
              <Tip text="Extra keywords to guide the web search beyond the name alone. e.g. 'Lincoln speeches voice mannerisms'. Leave blank to search by name only." />
            </label>
            <input
              id="sourceQuery"
              name="sourceQuery"
              placeholder="Lincoln speeches voice mannerisms"
              value={form.sourceQuery}
              onChange={updateField}
            />
          </div>

          <div className="field full">
            <label htmlFor="description">
              Character brief<span className="required-star">*</span>
              <Tip text="Required, but can be a single sentence — Research Character will expand it automatically. After the research pass, scraped notes are merged into this field for your review before saving." />
            </label>
            <textarea
              id="description"
              name="description"
              placeholder="Describe the character in plain language. Include history, motivations, speech habits, worldview, signature references, and any notes you want the model to internalize."
              value={form.description}
              onChange={updateField}
              required
            />
            <small>
              This field is the core of the system prompt. Manual notes and scraped research both
              land here.
            </small>
          </div>

          <div className="field full">
            <label htmlFor="sourceUrls">
              Source URLs
              <Tip text="Optional but powerful. Drop in Wikipedia pages, blog posts, or YouTube video URLs (one per line). Voxis scrapes and ranks them — you review and pick which sources to include before saving." />
            </label>
            <textarea
              className="compact"
              id="sourceUrls"
              name="sourceUrls"
              placeholder="https://en.wikipedia.org/wiki/Abraham_Lincoln&#10;https://www.youtube.com/watch?v=..."
              value={form.sourceUrls}
              onChange={updateField}
            />
            <small>One URL per line. Voxis can parse Wikipedia, blogs, and YouTube transcripts when captions are available.</small>
          </div>

          <div className="field full">
            <label htmlFor="prosodySourceUrl">
              Prosody Source URL
              <Tip text="Optional. On save, Voxis downloads audio from this link, extracts rhythm/cadence/prosody, saves a persona template, and removes temp audio." />
            </label>
            <input
              id="prosodySourceUrl"
              name="prosodySourceUrl"
              placeholder="https://www.youtube.com/watch?v=..."
              value={form.prosodySourceUrl}
              onChange={updateField}
            />
          </div>

          <div className="field">
            <label htmlFor="traits">Traits</label>
            <input
              id="traits"
              name="traits"
              placeholder="empathetic, strategic, formal"
              value={form.traits}
              onChange={updateField}
            />
          </div>

          <div className="field">
            <label htmlFor="quirks">Quirks</label>
            <input
              id="quirks"
              name="quirks"
              placeholder="uses long pauses, quotes history, avoids slang"
              value={form.quirks}
              onChange={updateField}
            />
          </div>

          <div className="field full">
            <label htmlFor="speechStyle">Speech style</label>
            <textarea
              className="compact"
              id="speechStyle"
              name="speechStyle"
              placeholder="Measured cadence, deliberate sentence structure, occasional historical framing"
              value={form.speechStyle}
              onChange={updateField}
            />
          </div>

          <div className="field full">
            <label htmlFor="researchSummary">Research summary</label>
            <textarea
              className="compact"
              id="researchSummary"
              name="researchSummary"
              placeholder="Source digest and grounded notes from the web research pass"
              value={form.researchSummary}
              onChange={updateField}
            />
          </div>

          <div className="field full">
            <label htmlFor="notablePhrases">Notable phrases</label>
            <input
              id="notablePhrases"
              name="notablePhrases"
              placeholder="four score, my friends, with great power"
              value={form.notablePhrases}
              onChange={updateField}
            />
          </div>

          <div className="field full">
            <label htmlFor="vocalMannerismItems">Vocal mannerisms (one per line)</label>
            <textarea
              className="compact"
              id="vocalMannerismItems"
              name="vocalMannerismItems"
              placeholder={"belches between clauses\nbrief slur before emphasis\nclears throat before sharp points"}
              value={form.vocalMannerismItems}
              onChange={updateField}
            />
          </div>

          <div className="field">
            <label htmlFor="vocalMannerismFrequency">Mannerism frequency (0-1)</label>
            <input
              id="vocalMannerismFrequency"
              name="vocalMannerismFrequency"
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={form.vocalMannerismFrequency}
              onChange={updateField}
            />
            <small>Approximate share of replies where mannerisms appear. 0.15 = 15%.</small>
          </div>

          {/* Dynamic SFX editor */}
          <div className="field full" style={{ marginTop: 8 }}>
            <label>SFX Addon Sounds (persona sound effects)</label>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "6px 0" }}>
              {getActiveSfxTags().length === 0 ? (
                <span style={{ opacity: 0.6, fontSize: "0.85em" }}>No SFX tags yet — add some for random sound effects during speech (e.g. burps for Rick).</span>
              ) : (
                getActiveSfxTags().map((tag) => (
                  <span
                    key={tag}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      background: "rgba(0, 200, 255, 0.12)",
                      border: "1px solid rgba(0,200,255,0.3)",
                      borderRadius: 999,
                      padding: "2px 8px",
                      fontSize: "0.78rem",
                    }}
                  >
                    🔊 {tag}
                    <button
                      type="button"
                      onClick={() => removeSfxTag(tag)}
                      style={{ background: "none", border: "none", color: "#8fd", cursor: "pointer", fontSize: "1em", lineHeight: 1 }}
                      title="Remove"
                    >
                      ×
                    </button>
                  </span>
                ))
              )}
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    addSfxTag(e.target.value);
                    e.target.value = "";
                  }
                }}
                style={{ minWidth: 160 }}
                defaultValue=""
              >
                <option value="">+ Add SFX…</option>
                {availableSfxTags
                  .filter((t) => !getActiveSfxTags().includes(t))
                  .map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
              </select>

              <input
                placeholder="custom tag (e.g. snort)"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    addSfxTag(e.currentTarget.value);
                    e.currentTarget.value = "";
                  }
                }}
                style={{ width: 160 }}
              />
              <button type="button" onClick={(e) => {
                const inp = e.currentTarget.parentNode.querySelector('input[placeholder*="custom"]');
                if (inp) { addSfxTag(inp.value); inp.value = ""; }
              }}>Add</button>
            </div>

            <small style={{ display: "block", marginTop: 4 }}>
              Available: {availableSfxTags.join(", ")}. Backend normalizes aliases (belch→burp etc).
            </small>
          </div>

          <div className="field">
            <label>SFX Frequency (0–1)</label>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={Number(form.sfxFrequency) || 0}
                onChange={(e) => setForm((f) => ({ ...f, sfxFrequency: e.target.value }))}
                style={{ flex: 1 }}
              />
              <input
                id="sfxFrequency"
                name="sfxFrequency"
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={form.sfxFrequency}
                onChange={updateField}
                style={{ width: 80 }}
              />
            </div>
            <small>Chance per utterance to inject an SFX. Higher = more frequent addon sounds during TTS.</small>
          </div>

          <div className="field">
            <label htmlFor="sfxPlacement">SFX Placement</label>
            <select
              id="sfxPlacement"
              name="sfxPlacement"
              value={form.sfxPlacement}
              onChange={updateField}
            >
              <option value="random">Random (or throughout for burp)</option>
              <option value="start">Start of speech</option>
              <option value="end">End of speech</option>
              <option value="throughout">Throughout (between sentences)</option>
            </select>
            <small>Controls where the sound effect plays relative to the spoken words.</small>
          </div>

          <div className="field">
            <label htmlFor="sfxEarlyOffset">SFX Early Offset (seconds, min for first burp)</label>
            <input
              id="sfxEarlyOffset"
              name="sfxEarlyOffset"
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={form.sfxEarlyOffset}
              onChange={updateField}
            />
            <small>Minimum delay for early SFX so it doesn't play before the voice starts (0.2 = 200ms). Per-persona configurable.</small>
          </div>

          {/* SFX preview — live markers + real test playback */}
          <div className="field full" style={{ background: "rgba(255,255,255,0.02)", padding: 10, borderRadius: 6 }}>
            <label style={{ fontWeight: 600 }}>See SFX in response text (live preview)</label>

            <div style={{ margin: "4px 0 8px" }}>
              <small style={{ marginRight: 8, opacity: 0.8 }}>Presets:</small>
              <button type="button" onClick={() => applySfxPreset("drunkRick")} style={{ marginRight: 4, fontSize: "0.75rem" }}>Drunk Rick</button>
              <button type="button" onClick={() => applySfxPreset("nervousGiggle")} style={{ marginRight: 4, fontSize: "0.75rem" }}>Nervous Giggle</button>
              <button type="button" onClick={() => applySfxPreset("evilLaugh")} style={{ marginRight: 4, fontSize: "0.75rem" }}>Evil Laugh</button>
              <button type="button" onClick={() => applySfxPreset("clear")} style={{ fontSize: "0.75rem" }}>Clear</button>
            </div>

            <div style={{ display: "flex", gap: 8, margin: "6px 0" }}>
              <input
                value={sfxPreviewText}
                onChange={(e) => setSfxPreviewText(e.target.value)}
                placeholder="Type sample speech here..."
                style={{ flex: 1 }}
              />
              <button type="button" onClick={runSfxPreviewSimulation}>Recompute</button>
              <button type="button" onClick={testSpeakWithSfx} title="Play real TTS (if saved) + the SFX sounds">🔊 Test speak + SFX</button>
            </div>

            {sfxPreviewResult ? (
              <div style={{ fontFamily: "monospace", fontSize: "0.82rem", padding: 8, background: "rgba(0,0,0,0.3)", borderRadius: 4, whiteSpace: "pre-wrap" }}>
                {sfxPreviewResult}
              </div>
            ) : (
              <small style={{ opacity: 0.7 }}>Markers like [SFX:burp] appear in the internal text. They are stripped for voice but trigger timed sound effects.</small>
            )}
            <small style={{ display: "block", marginTop: 4, opacity: 0.6 }}>
              Test button performs a real TTS request (when persona is saved) and plays matching SFX at the right times. In chat, recent SFX triggers also appear as 🔊 badges under assistant replies.
            </small>
          </div>

          <label className="checkbox-row" style={{ paddingTop: 36 }}>
            <input
              type="checkbox"
              name="intoxicationEnabled"
              checked={Boolean(form.intoxicationEnabled)}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  intoxicationEnabled: event.target.checked,
                }))
              }
            />
            Enable dynamic intoxication flaw
          </label>

          <div className="field">
            <label htmlFor="intoxicationLevel">Intoxication level (0-1)</label>
            <input
              id="intoxicationLevel"
              name="intoxicationLevel"
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={form.intoxicationLevel}
              onChange={updateField}
            />
          </div>

          <div className="field">
            <label htmlFor="intoxicationDecayPerTurn">Decay per turn (0-1)</label>
            <input
              id="intoxicationDecayPerTurn"
              name="intoxicationDecayPerTurn"
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={form.intoxicationDecayPerTurn}
              onChange={updateField}
            />
          </div>

          <div className="field">
            <label htmlFor="intoxicationTriggerGain">Trigger gain (0-1)</label>
            <input
              id="intoxicationTriggerGain"
              name="intoxicationTriggerGain"
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={form.intoxicationTriggerGain}
              onChange={updateField}
            />
          </div>

          <div className="field full">
            <label htmlFor="intoxicationTriggerKeywords">Intoxication trigger keywords</label>
            <input
              id="intoxicationTriggerKeywords"
              name="intoxicationTriggerKeywords"
              value={form.intoxicationTriggerKeywords}
              onChange={updateField}
              placeholder="drink, drunk, alcohol, whiskey, vodka"
            />
            <small>Comma-separated terms that increase intoxication state when seen in user messages.</small>
          </div>

          <div className="field">
            <label htmlFor="intoxicationKeywordWeight">Intoxication keyword weight (0-1)</label>
            <input id="intoxicationKeywordWeight" name="intoxicationKeywordWeight" type="number" min="0" max="1" step="0.01" value={form.intoxicationKeywordWeight} onChange={updateField} />
          </div>
          <div className="field">
            <label htmlFor="intoxicationLongConversationWeight">Intoxication long conversation weight (0-1)</label>
            <input id="intoxicationLongConversationWeight" name="intoxicationLongConversationWeight" type="number" min="0" max="1" step="0.01" value={form.intoxicationLongConversationWeight} onChange={updateField} />
          </div>
          <div className="field">
            <label htmlFor="intoxicationMessageLengthWeight">Intoxication message length weight (0-1)</label>
            <input id="intoxicationMessageLengthWeight" name="intoxicationMessageLengthWeight" type="number" min="0" max="1" step="0.01" value={form.intoxicationMessageLengthWeight} onChange={updateField} />
          </div>
          <div className="field">
            <label htmlFor="intoxicationPunctuationWeight">Intoxication punctuation weight (0-1)</label>
            <input id="intoxicationPunctuationWeight" name="intoxicationPunctuationWeight" type="number" min="0" max="1" step="0.01" value={form.intoxicationPunctuationWeight} onChange={updateField} />
          </div>

          <label className="checkbox-row" style={{ paddingTop: 10 }}>
            <input
              type="checkbox"
              name="fatigueEnabled"
              checked={Boolean(form.fatigueEnabled)}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  fatigueEnabled: event.target.checked,
                }))
              }
            />
            Enable fatigue drift
          </label>

          <div className="field">
            <label htmlFor="fatigueLevel">Fatigue level (0-1)</label>
            <input id="fatigueLevel" name="fatigueLevel" type="number" min="0" max="1" step="0.01" value={form.fatigueLevel} onChange={updateField} />
          </div>
          <div className="field">
            <label htmlFor="fatiguePassiveGainPerTurn">Passive gain per turn (0-1)</label>
            <input id="fatiguePassiveGainPerTurn" name="fatiguePassiveGainPerTurn" type="number" min="0" max="1" step="0.01" value={form.fatiguePassiveGainPerTurn} onChange={updateField} />
          </div>
          <div className="field">
            <label htmlFor="fatigueDecayPerTurn">Fatigue decay per turn (0-1)</label>
            <input id="fatigueDecayPerTurn" name="fatigueDecayPerTurn" type="number" min="0" max="1" step="0.01" value={form.fatigueDecayPerTurn} onChange={updateField} />
          </div>
          <div className="field">
            <label htmlFor="fatigueTriggerGain">Fatigue trigger gain (0-1)</label>
            <input id="fatigueTriggerGain" name="fatigueTriggerGain" type="number" min="0" max="1" step="0.01" value={form.fatigueTriggerGain} onChange={updateField} />
          </div>
          <div className="field full">
            <label htmlFor="fatigueTriggerKeywords">Fatigue trigger keywords</label>
            <input id="fatigueTriggerKeywords" name="fatigueTriggerKeywords" value={form.fatigueTriggerKeywords} onChange={updateField} />
          </div>
          <div className="field">
            <label htmlFor="fatigueKeywordWeight">Fatigue keyword weight (0-1)</label>
            <input id="fatigueKeywordWeight" name="fatigueKeywordWeight" type="number" min="0" max="1" step="0.01" value={form.fatigueKeywordWeight} onChange={updateField} />
          </div>
          <div className="field">
            <label htmlFor="fatigueLongConversationWeight">Fatigue long conversation weight (0-1)</label>
            <input id="fatigueLongConversationWeight" name="fatigueLongConversationWeight" type="number" min="0" max="1" step="0.01" value={form.fatigueLongConversationWeight} onChange={updateField} />
          </div>
          <div className="field">
            <label htmlFor="fatigueMessageLengthWeight">Fatigue message length weight (0-1)</label>
            <input id="fatigueMessageLengthWeight" name="fatigueMessageLengthWeight" type="number" min="0" max="1" step="0.01" value={form.fatigueMessageLengthWeight} onChange={updateField} />
          </div>
          <div className="field">
            <label htmlFor="fatiguePunctuationWeight">Fatigue punctuation weight (0-1)</label>
            <input id="fatiguePunctuationWeight" name="fatiguePunctuationWeight" type="number" min="0" max="1" step="0.01" value={form.fatiguePunctuationWeight} onChange={updateField} />
          </div>

          <label className="checkbox-row" style={{ paddingTop: 10 }}>
            <input
              type="checkbox"
              name="agitationEnabled"
              checked={Boolean(form.agitationEnabled)}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  agitationEnabled: event.target.checked,
                }))
              }
            />
            Enable agitation drift
          </label>

          <div className="field">
            <label htmlFor="agitationLevel">Agitation level (0-1)</label>
            <input id="agitationLevel" name="agitationLevel" type="number" min="0" max="1" step="0.01" value={form.agitationLevel} onChange={updateField} />
          </div>
          <div className="field">
            <label htmlFor="agitationDecayPerTurn">Agitation decay per turn (0-1)</label>
            <input id="agitationDecayPerTurn" name="agitationDecayPerTurn" type="number" min="0" max="1" step="0.01" value={form.agitationDecayPerTurn} onChange={updateField} />
          </div>
          <div className="field">
            <label htmlFor="agitationTriggerGain">Agitation trigger gain (0-1)</label>
            <input id="agitationTriggerGain" name="agitationTriggerGain" type="number" min="0" max="1" step="0.01" value={form.agitationTriggerGain} onChange={updateField} />
          </div>
          <div className="field full">
            <label htmlFor="agitationTriggerKeywords">Agitation trigger keywords</label>
            <input id="agitationTriggerKeywords" name="agitationTriggerKeywords" value={form.agitationTriggerKeywords} onChange={updateField} />
          </div>
          <div className="field">
            <label htmlFor="agitationKeywordWeight">Agitation keyword weight (0-1)</label>
            <input id="agitationKeywordWeight" name="agitationKeywordWeight" type="number" min="0" max="1" step="0.01" value={form.agitationKeywordWeight} onChange={updateField} />
          </div>
          <div className="field">
            <label htmlFor="agitationLongConversationWeight">Agitation long conversation weight (0-1)</label>
            <input id="agitationLongConversationWeight" name="agitationLongConversationWeight" type="number" min="0" max="1" step="0.01" value={form.agitationLongConversationWeight} onChange={updateField} />
          </div>
          <div className="field">
            <label htmlFor="agitationMessageLengthWeight">Agitation message length weight (0-1)</label>
            <input id="agitationMessageLengthWeight" name="agitationMessageLengthWeight" type="number" min="0" max="1" step="0.01" value={form.agitationMessageLengthWeight} onChange={updateField} />
          </div>
          <div className="field">
            <label htmlFor="agitationPunctuationWeight">Agitation punctuation weight (0-1)</label>
            <input id="agitationPunctuationWeight" name="agitationPunctuationWeight" type="number" min="0" max="1" step="0.01" value={form.agitationPunctuationWeight} onChange={updateField} />
          </div>

          <label className="checkbox-row" style={{ paddingTop: 10 }}>
            <input
              type="checkbox"
              name="focusEnabled"
              checked={Boolean(form.focusEnabled)}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  focusEnabled: event.target.checked,
                }))
              }
            />
            Enable focus drift
          </label>

          <div className="field">
            <label htmlFor="focusLevel">Focus level (0-1)</label>
            <input id="focusLevel" name="focusLevel" type="number" min="0" max="1" step="0.01" value={form.focusLevel} onChange={updateField} />
          </div>
          <div className="field">
            <label htmlFor="focusRecoveryPerTurn">Focus recovery per turn (0-1)</label>
            <input id="focusRecoveryPerTurn" name="focusRecoveryPerTurn" type="number" min="0" max="1" step="0.01" value={form.focusRecoveryPerTurn} onChange={updateField} />
          </div>
          <div className="field">
            <label htmlFor="focusDecayPerTurn">Focus decay per turn (0-1)</label>
            <input id="focusDecayPerTurn" name="focusDecayPerTurn" type="number" min="0" max="1" step="0.01" value={form.focusDecayPerTurn} onChange={updateField} />
          </div>
          <div className="field">
            <label htmlFor="focusTriggerGain">Focus trigger gain (0-1)</label>
            <input id="focusTriggerGain" name="focusTriggerGain" type="number" min="0" max="1" step="0.01" value={form.focusTriggerGain} onChange={updateField} />
          </div>
          <div className="field full">
            <label htmlFor="focusTriggerKeywords">Focus trigger keywords</label>
            <input id="focusTriggerKeywords" name="focusTriggerKeywords" value={form.focusTriggerKeywords} onChange={updateField} />
          </div>
          <div className="field">
            <label htmlFor="focusKeywordWeight">Focus keyword weight (0-1)</label>
            <input id="focusKeywordWeight" name="focusKeywordWeight" type="number" min="0" max="1" step="0.01" value={form.focusKeywordWeight} onChange={updateField} />
          </div>
          <div className="field">
            <label htmlFor="focusLongConversationWeight">Focus long conversation weight (0-1)</label>
            <input id="focusLongConversationWeight" name="focusLongConversationWeight" type="number" min="0" max="1" step="0.01" value={form.focusLongConversationWeight} onChange={updateField} />
          </div>
          <div className="field">
            <label htmlFor="focusMessageLengthWeight">Focus message length weight (0-1)</label>
            <input id="focusMessageLengthWeight" name="focusMessageLengthWeight" type="number" min="0" max="1" step="0.01" value={form.focusMessageLengthWeight} onChange={updateField} />
          </div>
          <div className="field">
            <label htmlFor="focusPunctuationWeight">Focus punctuation weight (0-1)</label>
            <input id="focusPunctuationWeight" name="focusPunctuationWeight" type="number" min="0" max="1" step="0.01" value={form.focusPunctuationWeight} onChange={updateField} />
          </div>

          <div className="field full">
            <label htmlFor="behaviorRules">Behavior rules</label>
            <textarea
              className="compact"
              id="behaviorRules"
              name="behaviorRules"
              placeholder={"uses irony in 30–50% of responses\nprefers indirect disagreement over blunt refusal\ndeflects personal questions with philosophical tangents"}
              value={form.behaviorRules}
              onChange={updateField}
            />
            <small>One operationalized rule per line. Describe observable behaviors, not adjectives.</small>
          </div>

          <div className="field">
            <label htmlFor="goals">Goals</label>
            <input
              id="goals"
              name="goals"
              placeholder="make trustless transactions possible, remain unknown"
              value={form.goals}
              onChange={updateField}
            />
          </div>

          <div className="field">
            <label htmlFor="values">Values</label>
            <input
              id="values"
              name="values"
              placeholder="financial sovereignty, privacy, truth"
              value={form.values}
              onChange={updateField}
            />
          </div>

          <div className="field full">
            <label>Big Five spectrum</label>
            <div style={{ display: "flex", gap: 22, alignItems: "flex-start", flexWrap: "wrap" }}>
              <BigFiveRadar
                values={{
                  openness:          Number(form.bigFiveOpenness),
                  conscientiousness: Number(form.bigFiveConscientiousness),
                  extraversion:      Number(form.bigFiveExtraversion),
                  agreeableness:     Number(form.bigFiveAgreeableness),
                  neuroticism:       Number(form.bigFiveNeuroticism),
                }}
                onChange={(key, value) =>
                  setForm(current => ({
                    ...current,
                    [`bigFive${key.charAt(0).toUpperCase()}${key.slice(1)}`]: String(value),
                  }))
                }
              />
              <div style={{ flex: 1, minWidth: 180, display: "flex", flexDirection: "column", gap: 8, justifyContent: "center" }}>
                {[
                  { name: "bigFiveOpenness",          label: "Openness" },
                  { name: "bigFiveConscientiousness",  label: "Conscientiousness" },
                  { name: "bigFiveExtraversion",       label: "Extraversion" },
                  { name: "bigFiveAgreeableness",      label: "Agreeableness" },
                  { name: "bigFiveNeuroticism",        label: "Neuroticism" },
                ].map(({ name, label }) => (
                  <div key={name} className="field" style={{ marginBottom: 0 }}>
                    <label htmlFor={name} style={{ fontSize: "0.78rem" }}>
                      {label}: {Number(form[name]).toFixed(2)}
                    </label>
                    <input
                      className="voice-slider"
                      id={name}
                      name={name}
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={form[name]}
                      onChange={updateField}
                    />
                  </div>
                ))}
              </div>
            </div>
            <small>Drag vertices on the chart or use sliders to tune. Big Five is the continuous base spectrum for personality behavior.</small>
          </div>

          <div className="field full">
            <label>D&amp;D moral overlay</label>
            <div style={{ display: "flex", gap: 22, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <label className="checkbox-row" style={{ paddingTop: 0 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(form.alignmentOverlayEnabled)}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        alignmentOverlayEnabled: event.target.checked,
                      }))
                    }
                  />
                  Enable alignment overlay
                </label>
                <AlignmentGrid
                  value={form.alignmentOverlay}
                  disabled={!form.alignmentOverlayEnabled}
                  onChange={(alignment) =>
                    setForm((current) => ({
                      ...current,
                      alignmentOverlay: alignment,
                      alignmentOverlayEnabled: true,
                    }))
                  }
                  onHover={setHoveredAlignment}
                />
              </div>
              <div style={{ flex: 1, minWidth: 240 }}>
                <HybridPreview
                  bigFive={bigFiveProfile}
                  alignment={form.alignmentOverlay}
                  alignmentEnabled={Boolean(form.alignmentOverlayEnabled)}
                  previewAlignment={hoveredAlignment}
                />
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!form.alignmentOverlayEnabled}
                  style={{ marginTop: 10 }}
                  onClick={applyMappedHybridToFields}
                >
                  Apply Mapped Tuning
                </button>
              </div>
            </div>
            <small>
              Optional moral overlay layered on top of Big Five. Clicking any cell enables and selects it.
              Hover any cell to preview mapped VAD instantly, then use Apply Mapped Tuning to copy those
              suggestions into Creative Context, Mood Sensitivity, and Expression Style fields.
            </small>
          </div>

          <div className="field full">
            <label htmlFor="expressionSentenceStyle">Expression style rules</label>
            <div className="expression-grid">
              <div className="field">
                <label htmlFor="expressionSentenceStyle">Sentence style</label>
                <input
                  id="expressionSentenceStyle"
                  name="expressionSentenceStyle"
                  placeholder="short bursty chaotic"
                  value={form.expressionSentenceStyle}
                  onChange={updateField}
                />
              </div>
              <div className="field">
                <label htmlFor="expressionEnergy">Energy level</label>
                <select
                  id="expressionEnergy"
                  name="expressionEnergy"
                  value={form.expressionEnergy}
                  onChange={updateField}
                  style={{ padding: "13px 16px", border: "1px solid rgba(0,180,255,0.14)", borderRadius: 16, background: "rgba(6,14,28,0.88)", color: "#dcf7ff" }}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="very_high">Very high</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="expressionInterruptionRate">Interruption rate: {Number(form.expressionInterruptionRate).toFixed(2)}</label>
                <input
                  className="voice-slider"
                  id="expressionInterruptionRate"
                  name="expressionInterruptionRate"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={form.expressionInterruptionRate}
                  onChange={updateField}
                />
              </div>
            </div>
            <textarea
              className="compact"
              id="expressionRules"
              name="expressionRules"
              placeholder={"interrupt yourself occasionally\nuse exclamation points frequently\njump topics when excited"}
              value={form.expressionRules}
              onChange={updateField}
            />
            <small>One line per expression rule. These rules are injected directly into prompt voice guardrails.</small>

            <div className="expression-grid" style={{ marginTop: 12 }}>
              <div className="field">
                <label htmlFor="cadenceMode">Cadence intelligence mode</label>
                <select
                  id="cadenceMode"
                  name="cadenceMode"
                  value={form.cadenceMode}
                  onChange={updateField}
                  style={{ padding: "13px 16px", border: "1px solid rgba(0,180,255,0.14)", borderRadius: 16, background: "rgba(6,14,28,0.88)", color: "#dcf7ff" }}
                >
                  <option value="adaptive">Adaptive (smart, conversation-aware)</option>
                  <option value="manual">Manual (fixed cadence)</option>
                </select>
              </div>

              <div className="field">
                <label htmlFor="cadenceTeasingFrequency">Teasing frequency target: {Math.round(Number(form.cadenceTeasingFrequency || 0) * 100)}%</label>
                <input
                  className="voice-slider"
                  id="cadenceTeasingFrequency"
                  name="cadenceTeasingFrequency"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={form.cadenceTeasingFrequency}
                  onChange={updateField}
                />
              </div>

              <div className="field">
                <label htmlFor="cadenceVariability">Variability</label>
                <select
                  id="cadenceVariability"
                  name="cadenceVariability"
                  value={form.cadenceVariability}
                  onChange={updateField}
                  style={{ padding: "13px 16px", border: "1px solid rgba(0,180,255,0.14)", borderRadius: 16, background: "rgba(6,14,28,0.88)", color: "#dcf7ff" }}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div className="field">
                <label htmlFor="cadenceRepetitionPenalty">Repetition penalty</label>
                <select
                  id="cadenceRepetitionPenalty"
                  name="cadenceRepetitionPenalty"
                  value={form.cadenceRepetitionPenalty}
                  onChange={updateField}
                  style={{ padding: "13px 16px", border: "1px solid rgba(0,180,255,0.14)", borderRadius: 16, background: "rgba(6,14,28,0.88)", color: "#dcf7ff" }}
                >
                  <option value="light">Light</option>
                  <option value="medium">Medium</option>
                  <option value="strong">Strong</option>
                </select>
              </div>

              <div className="field">
                <label htmlFor="cadenceCooldownTurns">Cooldown turns</label>
                <input
                  id="cadenceCooldownTurns"
                  name="cadenceCooldownTurns"
                  type="number"
                  min="0"
                  max="8"
                  step="1"
                  value={form.cadenceCooldownTurns}
                  onChange={updateField}
                />
              </div>

              <div className="field">
                <label htmlFor="cadenceWindowTurns">Lookback turns</label>
                <input
                  id="cadenceWindowTurns"
                  name="cadenceWindowTurns"
                  type="number"
                  min="3"
                  max="12"
                  step="1"
                  value={form.cadenceWindowTurns}
                  onChange={updateField}
                />
              </div>
            </div>
            <small>
              Adaptive mode uses mood + recent conversation rhythm to regulate teasing instinctively. Manual mode follows the fixed frequency target.
            </small>
          </div>

          <div className="field">
            <label htmlFor="moodSensitivity">
              Mood sensitivity: {Number(form.moodSensitivity).toFixed(2)}
            </label>
            <input
              id="moodSensitivity"
              name="moodSensitivity"
              type="range"
              min="0.1"
              max="3.0"
              step="0.05"
              value={form.moodSensitivity}
              onChange={updateField}
            />
            <small>
              How strongly this character reacts emotionally to messages. 1.0 = trait-driven defaults.
              Lower = stoic, higher = volatile. Overrides the automatic trait stack when not 1.0.
            </small>
          </div>

          {recommendedVoicePreset && (
            <div className="field full" style={{ padding: 14, border: "1px solid rgba(0, 200, 255, 0.2)", borderRadius: 16, background: "rgba(0, 180, 255, 0.05)" }}>
              <label style={{ marginBottom: 6, display: "block" }}>Recommended Voice Preset</label>
              <div style={{ marginBottom: 10, fontSize: "0.9rem" }}>
                <strong style={{ color: "#00f5ff" }}>{recommendedVoicePreset.label}</strong>
                <div style={{ color: "#87a8b9", marginTop: 4, fontSize: "0.85rem" }}>
                  {recommendedVoicePreset.description}
                </div>
                <div style={{ marginTop: 6, fontSize: "0.8rem", color: "#87a8b9" }}>
                  Primary: <strong>{recommendedVoicePreset.recommended}</strong>
                  {recommendedVoicePreset.alternatives && recommendedVoicePreset.alternatives.length > 0 && (
                    <> | Alternatives: {recommendedVoicePreset.alternatives.join(", ")}</>
                  )}
                </div>
              </div>
              <small>
                Use this as your starting point in Voice Lab after saving. Chat keeps quick playback controls, while full TTS setup now lives in the dedicated tab.
              </small>
              {onOpenVoiceLab ? (
                <button
                  type="button"
                  className="secondary-button"
                  style={{ width: "100%", padding: "10px 16px", marginTop: 12 }}
                  onClick={onOpenVoiceLab}
                >
                  Open Voice Lab
                </button>
              ) : null}
            </div>
          )}

          <div className="field full">
            <label>Expression profile</label>
            <div className="expression-copy-row">
              <select
                value={copySourceId}
                onChange={(event) => setCopySourceId(event.target.value)}
              >
                <option value="">Copy from saved persona (optional)</option>
                {personalitiesWithExpression.map((personality) => (
                  <option key={personality.id} value={String(personality.id)}>
                    {personality.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="secondary-button"
                disabled={!copySourceId}
                onClick={copyExpressionProfile}
              >
                Copy Preset
              </button>
            </div>
            <div className="expression-grid">
              <div className="field">
                <label htmlFor="expressionPreset">Preset</label>
                <select
                  id="expressionPreset"
                  name="expressionPreset"
                  value={form.expressionPreset}
                  onChange={updateField}
                  style={{ padding: "13px 16px", border: "1px solid rgba(0,180,255,0.14)", borderRadius: 16, background: "rgba(6,14,28,0.88)", color: "#dcf7ff" }}
                >
                  <option value="auto">Auto</option>
                  <option value="sentinel">Sentinel</option>
                  <option value="wisp">Wisp</option>
                  <option value="oracle">Oracle</option>
                  <option value="echo">Echo</option>
                  <option value="rogue">Rogue</option>
                </select>
              </div>

              <div className="field">
                <label htmlFor="expressionCalmness">Calmness: {Number(form.expressionCalmness).toFixed(2)}</label>
                <input
                  className="voice-slider"
                  id="expressionCalmness"
                  name="expressionCalmness"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={form.expressionCalmness}
                  onChange={updateField}
                />
              </div>

              <div className="field">
                <label htmlFor="expressionIntensity">Intensity: {Number(form.expressionIntensity).toFixed(2)}</label>
                <input
                  className="voice-slider"
                  id="expressionIntensity"
                  name="expressionIntensity"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={form.expressionIntensity}
                  onChange={updateField}
                />
              </div>

              <div className="field">
                <label htmlFor="expressionBlinkRate">Blink rate: {Number(form.expressionBlinkRate).toFixed(2)}</label>
                <input
                  className="voice-slider"
                  id="expressionBlinkRate"
                  name="expressionBlinkRate"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={form.expressionBlinkRate}
                  onChange={updateField}
                />
              </div>

              <div className="field">
                <label htmlFor="expressionGazeDrift">Gaze drift: {Number(form.expressionGazeDrift).toFixed(2)}</label>
                <input
                  className="voice-slider"
                  id="expressionGazeDrift"
                  name="expressionGazeDrift"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={form.expressionGazeDrift}
                  onChange={updateField}
                />
              </div>
            </div>

            <div className="avatar-preview-panel">
              <AvatarCore
                size="large"
                valence={
                  form.alignmentOverlayEnabled
                    ? mappedHybrid.moodBaseline.valence
                    : Number(form.expressionIntensity) - Number(form.expressionCalmness)
                }
                arousal={
                  form.alignmentOverlayEnabled
                    ? mappedHybrid.moodBaseline.arousal
                    : Number(form.expressionIntensity)
                }
                phase={previewPhase}
                speaking={previewSpeaking}
                mode="scientist"
                personalitySeed={form.name || "preview"}
                expressionPreset={form.expressionPreset}
                expressionProfile={{
                  preset: form.expressionPreset,
                  calmness: Number(form.expressionCalmness),
                  intensity: Number(form.expressionIntensity),
                  blinkRate: Number(form.expressionBlinkRate),
                  gazeDrift: Number(form.expressionGazeDrift),
                }}
                imageUrl={form.avatarImageUrl || ""}
                likenessHint={`${form.name || ""} ${form.description || ""} ${form.traits || ""} ${form.quirks || ""}`.trim()}
              />
              <div className="avatar-preview-controls">
                <label htmlFor="previewPhase" style={{ color: "#87a8b9", fontSize: "0.85rem", fontWeight: 700 }}>Preview phase</label>
                <select id="previewPhase" value={previewPhase} onChange={(event) => setPreviewPhase(event.target.value)}>
                  <option value="idle">idle</option>
                  <option value="queued">listen</option>
                  <option value="intent">intent</option>
                  <option value="generation">generation</option>
                  <option value="reply">reply</option>
                </select>
                <label style={{ color: "#87a8b9", fontSize: "0.85rem", fontWeight: 700 }}>
                  <input
                    type="checkbox"
                    checked={previewSpeaking}
                    onChange={(event) => setPreviewSpeaking(event.target.checked)}
                    style={{ marginRight: 6 }}
                  />
                  Speaking
                </label>
              </div>
            </div>

            <small>
              Tune personality-specific expressiveness. Lower calmness = twitchier motion. Higher intensity = stronger emotional contrast.
            </small>
          </div>

          <div className="field full">
            <label>Voice workflow</label>
            <div className="research-panel" style={{ marginTop: 0 }}>
              <h3 style={{ marginTop: 0 }}>Voice Lab</h3>
              <p>
                Detailed TTS tuning now lives in the dedicated Voice Lab tab. Character Chat keeps the quick
                playback and autoplay controls.
              </p>
              <div className="research-meta">
                <span>Playback: {form.voiceEnabled ? "enabled" : "off"}</span>
                <span>Autoplay: {form.voiceAutoplay ? "on" : "off"}</span>
                <span>Voice: {form.preferredVoice || "alloy"}</span>
                <span>Model: {form.providerModel || "gpt-4o-mini-tts"}</span>
              </div>
              {isEditing && onOpenVoiceLab ? (
                <button type="button" className="secondary-button" onClick={onOpenVoiceLab}>
                  Open Voice Lab
                </button>
              ) : (
                <small>Save this character first, then open Voice Lab to test samples and tune the full voice profile.</small>
              )}
            </div>
          </div>
        </div>

        {researchResult ? (
          <div className="research-panel">
            <h3>Research Snapshot</h3>
            <p>{researchResult.researchSummary || "Research completed."}</p>
            <div className="research-meta">
              <span>{(researchResult.traits || []).length} traits</span>
              <span>{(researchResult.quirks || []).length} quirks</span>
              <span>{(researchResult.sources || []).length} source captures</span>
            </div>
            <div className="source-list">
              {researchSources.map((source) => (
                <div key={source.id} className="source-item">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 8 }}>
                    <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 700, color: "#6a4332" }}>
                      <input
                        type="checkbox"
                        checked={Boolean(source.selected)}
                        onChange={(event) => updateSource(source.id, { selected: event.target.checked })}
                      />
                      Include in save
                    </label>
                    <button
                      type="button"
                      className="secondary-button"
                      style={{ padding: "8px 12px" }}
                      onClick={() => removeSource(source.id)}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="research-meta">
                    <span>Rank #{source.rank}</span>
                    <span>Score {source.score}</span>
                    <span>{source.sourceType}</span>
                    {source.transcriptAvailable ? <span>Transcript</span> : null}
                  </div>
                  <div className="field" style={{ marginBottom: 10 }}>
                    <label htmlFor={`source-title-${source.id}`}>Title</label>
                    <input
                      id={`source-title-${source.id}`}
                      value={source.title}
                      onChange={(event) => updateSource(source.id, { title: event.target.value })}
                    />
                  </div>
                  <div className="field" style={{ marginBottom: 10 }}>
                    <label htmlFor={`source-text-${source.id}`}>Excerpt</label>
                    <textarea
                      className="compact"
                      id={`source-text-${source.id}`}
                      value={source.text}
                      onChange={(event) => updateSource(source.id, { text: event.target.value })}
                    />
                  </div>
                  <strong>{source.url}</strong>
                  <span>{(source.reasons || []).join(" • ")}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="creator-actions">
          <div className="creator-note">
            Only <strong>name</strong> and <strong>brief</strong> are required to save. Hit <strong>Research Character</strong> first to auto-fill traits, speech style, quirks, and more from public sources.
          </div>
          <div>
            <button
              className="secondary-button"
              type="button"
              disabled={isResearching}
              onClick={handleResearch}
            >
              {isResearching ? "Researching..." : "Research Character"}
            </button>
            <span style={{ display: "inline-block", width: 10 }} />
            <button className="primary-button" type="submit" disabled={isSaving}>
              {isSaving
                ? isEditing
                  ? "Updating Personality..."
                  : "Saving Personality..."
                : isEditing
                  ? "Update Personality"
                  : "Save Personality"}
            </button>
          </div>
        </div>
      </form>
    </>
  );
}
