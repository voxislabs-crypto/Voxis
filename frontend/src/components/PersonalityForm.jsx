import { useEffect, useMemo, useState } from "react";
import { useAuthFetch } from "../hooks/useAuthFetch.js";
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
  researchSummary: "",
  speechStyle: "",
  notablePhrases: "",
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
  resetMoodState: false,
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
    researchSummary: personality.researchSummary || "",
    speechStyle: personality.speechStyle || "",
    notablePhrases: toCommaList(personality.notablePhrases),
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
    resetMoodState: false,
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
  const isEditing = Boolean(editingPersonality?.id);

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
  }, [editingPersonality, authFetch]);

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
          },
          resetMoodState: Boolean(form.resetMoodState),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save personality.");
      }

      if (isEditing) {
        onUpdated?.(data);
      } else {
        onCreated?.(data);
      }
      onError({ type: "", message: "" });
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
              style={{ padding: "13px 16px", border: "1px solid rgba(0,180,255,0.14)", borderRadius: 16, background: "rgba(6,14,28,0.88)", color: "var(--text)" }}
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
                  style={{ padding: "13px 16px", border: "1px solid rgba(0,180,255,0.14)", borderRadius: 16, background: "rgba(6,14,28,0.88)", color: "var(--text)" }}
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
                <strong style={{ color: "var(--accent)" }}>{recommendedVoicePreset.label}</strong>
                <div style={{ color: "var(--muted)", marginTop: 4, fontSize: "0.85rem" }}>
                  {recommendedVoicePreset.description}
                </div>
                <div style={{ marginTop: 6, fontSize: "0.8rem", color: "var(--muted)" }}>
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
                  style={{ padding: "13px 16px", border: "1px solid rgba(0,180,255,0.14)", borderRadius: 16, background: "rgba(6,14,28,0.88)", color: "var(--text)" }}
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
              />
              <div className="avatar-preview-controls">
                <label htmlFor="previewPhase" style={{ color: "var(--muted)", fontSize: "0.85rem", fontWeight: 700 }}>Preview phase</label>
                <select id="previewPhase" value={previewPhase} onChange={(event) => setPreviewPhase(event.target.value)}>
                  <option value="idle">idle</option>
                  <option value="queued">listen</option>
                  <option value="intent">intent</option>
                  <option value="generation">generation</option>
                  <option value="reply">reply</option>
                </select>
                <label style={{ color: "var(--muted)", fontSize: "0.85rem", fontWeight: 700 }}>
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
              <h3 style={{ marginTop: 0 }}>Voice Lab handoff</h3>
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
                  Open Voice Lab for TTS
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
