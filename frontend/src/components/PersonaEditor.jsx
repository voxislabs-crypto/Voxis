import { useEffect, useMemo, useState, useRef } from "react";
import { useAuthFetch } from "../hooks/useAuthFetch.js";
import { getApiErrorMessage, readApiResponsePayload } from "../lib/apiResponse.js";
import MemoryJournal from "./MemoryJournal.jsx";
import { usePersonaState } from "../state/PersonaStateContext.jsx";
import ControlTree from "./ControlTree.jsx";

const editorStyles = `
  .persona-sync-tree {
    margin: 0 0 16px;
    border: 1px solid rgba(0, 180, 255, 0.14);
    border-radius: 14px;
    background: rgba(6, 14, 28, 0.56);
    overflow: hidden;
  }

  .persona-sync-header {
    padding: 10px 12px;
    border-bottom: 1px solid rgba(0, 180, 255, 0.12);
    color: #9ad9ff;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 0.72rem;
    font-weight: 700;
  }

  .persona-tree-row {
    width: 100%;
    border: 0;
    border-top: 1px solid rgba(255, 255, 255, 0.04);
    background: rgba(2, 10, 22, 0.52);
    color: var(--text);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
    text-align: left;
    transition: background 180ms ease, box-shadow 180ms ease;
  }

  .persona-tree-row.active {
    background: rgba(0, 180, 255, 0.14);
    box-shadow: inset 0 0 0 1px rgba(0, 200, 255, 0.34);
  }

  .persona-tree-row.recent {
    box-shadow: inset 0 0 0 1px rgba(255, 165, 88, 0.6), 0 0 16px rgba(255, 165, 88, 0.18);
  }

  .persona-tree-badge {
    border-radius: 999px;
    border: 1px solid rgba(0, 200, 255, 0.25);
    background: rgba(0, 180, 255, 0.08);
    color: #9be9ff;
    font-size: 0.7rem;
    padding: 2px 8px;
    font-weight: 700;
  }

  .persona-tree-sub {
    border-top: 1px solid rgba(255, 255, 255, 0.03);
    padding-left: 14px;
    animation: personaTreeOpen 180ms ease;
  }

  .persona-tree-item {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px;
    align-items: center;
    margin: 8px 0;
    padding-left: 16px;
  }

  .persona-tree-item button {
    border: 1px solid rgba(0, 180, 255, 0.18);
    background: rgba(4, 12, 22, 0.72);
    color: #dff4ff;
    border-radius: 10px;
    padding: 8px 10px;
    text-align: left;
  }

  .persona-tree-item button.recent {
    box-shadow: inset 0 0 0 1px rgba(255, 165, 88, 0.65), 0 0 14px rgba(255, 165, 88, 0.2);
  }

  .persona-tree-item .jump-btn {
    border-radius: 999px;
    width: 30px;
    height: 30px;
    padding: 0;
    text-align: center;
  }

  .persona-tree-inline {
    margin: 6px 0 0;
    padding-left: 16px;
  }

  .persona-tree-inline input {
    width: 100%;
    border-radius: 10px;
    border: 1px solid rgba(0, 200, 255, 0.24);
    background: rgba(4, 12, 22, 0.82);
    color: var(--text);
    padding: 8px 10px;
  }

  @keyframes personaTreeOpen {
    from { opacity: 0; transform: translateY(-3px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .persona-section-tabs {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 14px;
  }

  .persona-section-tab {
    padding: 8px 12px;
    border-radius: 999px;
    border: 1px solid rgba(134, 232, 255, 0.34);
    background: linear-gradient(180deg, rgba(210, 248, 255, 0.14), rgba(18, 38, 72, 0.24));
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 0.72rem;
    font-weight: 700;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.26),
      inset 0 -8px 14px rgba(0, 0, 0, 0.2),
      0 8px 18px rgba(0, 16, 38, 0.32);
    transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease, color 160ms ease;
  }

  .persona-section-tab:hover {
    transform: translateY(-2px);
    color: #d9f4ff;
    border-color: rgba(176, 244, 255, 0.5);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.34),
      inset 0 -8px 14px rgba(0, 0, 0, 0.16),
      0 12px 22px rgba(0, 164, 255, 0.22);
  }

  .persona-section-tab.active {
    color: #f4fdff;
    border-color: rgba(194, 245, 255, 0.48);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.2), transparent 34%),
      linear-gradient(135deg, var(--accent), var(--accent-deep));
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.42),
      0 14px 26px rgba(0, 164, 255, 0.26);
  }

  .persona-editor-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }

  .persona-editor-grid .full {
    grid-column: 1 / -1;
  }

  .persona-field {
    display: grid;
    gap: 7px;
  }

  .persona-field label {
    color: var(--muted);
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .persona-field input,
  .persona-field textarea,
  .persona-field select {
    width: 100%;
    border-radius: 12px;
    border: 1px solid rgba(0, 180, 255, 0.18);
    background: rgba(4, 13, 28, 0.84);
    color: var(--text);
    padding: 11px 12px;
  }

  .persona-field textarea {
    min-height: 110px;
    resize: vertical;
  }

  .persona-field small {
    color: var(--muted);
    font-size: 0.75rem;
  }

  .persona-editor-actions {
    margin-top: 14px;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
  }

  .persona-editor-hint {
    margin: 0;
    color: var(--muted);
    font-size: 0.82rem;
  }

  .persona-save-btn {
    border: 0;
    border-radius: 999px;
    padding: 10px 16px;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.22), transparent 34%),
      linear-gradient(135deg, var(--accent), var(--accent-deep));
    color: #fff;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    border: 1px solid rgba(194, 245, 255, 0.48);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.42),
      0 12px 22px rgba(0, 172, 255, 0.24);
    transition: transform 160ms ease, box-shadow 160ms ease;
  }

  .persona-save-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.46),
      0 16px 30px rgba(0, 172, 255, 0.3);
  }

  .persona-save-btn:active:not(:disabled) {
    transform: translateY(1px) scale(0.995);
  }

  .persona-save-btn:disabled {
    opacity: 0.65;
  }

  .persona-block {
    margin-top: 16px;
    padding: 14px;
    border-radius: 14px;
    border: 1px solid rgba(0, 180, 255, 0.14);
    background: rgba(0, 180, 255, 0.04);
  }

  .persona-block h3 {
    margin: 0 0 10px;
    font-size: 0.95rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #9ad9ff;
  }

  @media (max-width: 900px) {
    .persona-editor-grid {
      grid-template-columns: 1fr;
    }
  }
`;

function listToText(value) {
  return Array.isArray(value) ? value.join("\n") : "";
}

function textToList(value) {
  return String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeRatio(value, fallback) {
  return Math.max(0, Math.min(1, toNumber(value, fallback)));
}

function parseBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }
  return String(value || "").toLowerCase() === "true";
}

function buildDraft(personality) {
  if (!personality) {
    return null;
  }

  return {
    name: personality.name || "",
    description: personality.description || "",
    systemPrompt: personality.systemPrompt || "",
    speechStyle: personality.speechStyle || "",
    vocalMannerismItems: listToText(personality.vocalMannerisms?.items),
    vocalMannerismFrequency: String(personality.vocalMannerisms?.frequency ?? 0.15),
    sfxTags: (personality.vocalMannerisms?.sfxTags || []).join(", "),
    sfxFrequency: String(personality.vocalMannerisms?.sfxFrequency ?? 0.25),
    sfxPlacement: personality.vocalMannerisms?.sfxPlacement || "random",
    sfxEarlyOffset: String(personality.vocalMannerisms?.sfxEarlyOffset ?? 0.2),
    intoxicationEnabled: String(Boolean(personality.stateFlaws?.intoxication?.enabled)),
    intoxicationLevel: String(personality.stateFlaws?.intoxication?.level ?? 0),
    intoxicationDecayPerTurn: String(personality.stateFlaws?.intoxication?.decayPerTurn ?? 0.02),
    intoxicationTriggerGain: String(personality.stateFlaws?.intoxication?.triggerGain ?? 0.12),
    intoxicationTriggerKeywords: listToText(personality.stateFlaws?.intoxication?.triggerKeywords),
    intoxicationKeywordWeight: String(personality.stateFlaws?.intoxication?.triggerProfile?.keywordWeight ?? 1),
    intoxicationLongConversationWeight: String(personality.stateFlaws?.intoxication?.triggerProfile?.longConversationWeight ?? 0.2),
    intoxicationMessageLengthWeight: String(personality.stateFlaws?.intoxication?.triggerProfile?.messageLengthWeight ?? 0.35),
    intoxicationPunctuationWeight: String(personality.stateFlaws?.intoxication?.triggerProfile?.punctuationWeight ?? 0.25),
    fatigueEnabled: String(Boolean(personality.stateFlaws?.fatigue?.enabled)),
    fatigueLevel: String(personality.stateFlaws?.fatigue?.level ?? 0.1),
    fatigueDecayPerTurn: String(personality.stateFlaws?.fatigue?.decayPerTurn ?? 0.01),
    fatiguePassiveGainPerTurn: String(personality.stateFlaws?.fatigue?.passiveGainPerTurn ?? 0.015),
    fatigueTriggerGain: String(personality.stateFlaws?.fatigue?.triggerGain ?? 0.08),
    fatigueTriggerKeywords: listToText(personality.stateFlaws?.fatigue?.triggerKeywords),
    fatigueKeywordWeight: String(personality.stateFlaws?.fatigue?.triggerProfile?.keywordWeight ?? 1),
    fatigueLongConversationWeight: String(personality.stateFlaws?.fatigue?.triggerProfile?.longConversationWeight ?? 0.9),
    fatigueMessageLengthWeight: String(personality.stateFlaws?.fatigue?.triggerProfile?.messageLengthWeight ?? 0.25),
    fatiguePunctuationWeight: String(personality.stateFlaws?.fatigue?.triggerProfile?.punctuationWeight ?? 0.1),
    agitationEnabled: String(Boolean(personality.stateFlaws?.agitation?.enabled)),
    agitationLevel: String(personality.stateFlaws?.agitation?.level ?? 0),
    agitationDecayPerTurn: String(personality.stateFlaws?.agitation?.decayPerTurn ?? 0.03),
    agitationTriggerGain: String(personality.stateFlaws?.agitation?.triggerGain ?? 0.1),
    agitationTriggerKeywords: listToText(personality.stateFlaws?.agitation?.triggerKeywords),
    agitationKeywordWeight: String(personality.stateFlaws?.agitation?.triggerProfile?.keywordWeight ?? 1),
    agitationLongConversationWeight: String(personality.stateFlaws?.agitation?.triggerProfile?.longConversationWeight ?? 0.25),
    agitationMessageLengthWeight: String(personality.stateFlaws?.agitation?.triggerProfile?.messageLengthWeight ?? 0.12),
    agitationPunctuationWeight: String(personality.stateFlaws?.agitation?.triggerProfile?.punctuationWeight ?? 0.8),
    focusEnabled: String(Boolean(personality.stateFlaws?.focus?.enabled)),
    focusLevel: String(personality.stateFlaws?.focus?.level ?? 0.75),
    focusDecayPerTurn: String(personality.stateFlaws?.focus?.decayPerTurn ?? 0.015),
    focusRecoveryPerTurn: String(personality.stateFlaws?.focus?.recoveryPerTurn ?? 0.03),
    focusTriggerGain: String(personality.stateFlaws?.focus?.triggerGain ?? 0.08),
    focusTriggerKeywords: listToText(personality.stateFlaws?.focus?.triggerKeywords),
    focusKeywordWeight: String(personality.stateFlaws?.focus?.triggerProfile?.keywordWeight ?? 1),
    focusLongConversationWeight: String(personality.stateFlaws?.focus?.triggerProfile?.longConversationWeight ?? 0.3),
    focusMessageLengthWeight: String(personality.stateFlaws?.focus?.triggerProfile?.messageLengthWeight ?? 0.18),
    focusPunctuationWeight: String(personality.stateFlaws?.focus?.triggerProfile?.punctuationWeight ?? 0.2),
    creativeContext: personality.creativeContext || "default",
    mood: personality.mood || "neutral",
    moodLabel: personality.moodLabel || "",
    sourceUrls: listToText(personality.sourceUrls),
    prosodySourceUrl: personality.prosodySourceUrl || "",
    notablePhrases: listToText(personality.notablePhrases),
    traits: listToText(personality.traits),
    quirks: listToText(personality.quirks),
    goals: listToText(personality.goals),
    values: listToText(personality.values),
    behaviorRules: listToText(personality.behaviorRules),
    styleSentence: personality.expressionStyle?.sentenceStyle || "",
    styleRules: listToText(personality.expressionStyle?.rules),
    styleInterruptionRate: String(personality.expressionStyle?.interruptionRate ?? 0.3),
    styleEnergy: personality.expressionStyle?.energy || "medium",
    cadenceMode: personality.expressionStyle?.cadenceRegulator?.mode || "adaptive",
    cadenceTeasingFrequency: String(personality.expressionStyle?.cadenceRegulator?.teasingFrequency ?? 0.2),
    cadenceVariability: personality.expressionStyle?.cadenceRegulator?.variability || "high",
    cadenceRepetitionPenalty: personality.expressionStyle?.cadenceRegulator?.repetitionPenalty || "strong",
    cadenceCooldownTurns: String(personality.expressionStyle?.cadenceRegulator?.cooldownTurns ?? 2),
    cadenceWindowTurns: String(personality.expressionStyle?.cadenceRegulator?.windowTurns ?? 6),
    moodSensitivity: String(personality.moodSensitivity ?? 1),
    baselineValence: String(personality.moodBaseline?.valence ?? 0),
    baselineArousal: String(personality.moodBaseline?.arousal ?? 0),
    baselineDominance: String(personality.moodBaseline?.dominance ?? 0),
    bigFiveOpenness: String(personality.bigFiveProfile?.openness ?? 0.5),
    bigFiveConscientiousness: String(personality.bigFiveProfile?.conscientiousness ?? 0.5),
    bigFiveExtraversion: String(personality.bigFiveProfile?.extraversion ?? 0.5),
    bigFiveAgreeableness: String(personality.bigFiveProfile?.agreeableness ?? 0.5),
    bigFiveNeuroticism: String(personality.bigFiveProfile?.neuroticism ?? 0.5),
    alignmentEnabled: String(Boolean(personality.alignmentProfile?.enabled)),
    alignment: personality.alignmentProfile?.alignment || "true_neutral",
    expressionPreset: personality.expressionProfile?.preset || "auto",
    expressionCalmness: String(personality.expressionProfile?.calmness ?? 0.5),
    expressionIntensity: String(personality.expressionProfile?.intensity ?? 0.5),
    expressionBlinkRate: String(personality.expressionProfile?.blinkRate ?? 0.5),
    expressionGazeDrift: String(personality.expressionProfile?.gazeDrift ?? 0.5),
  };
}

export default function PersonaEditor({ personality, onUpdated, onStatus, initialSection }) {
  const authFetch = useAuthFetch();
  const personaState = usePersonaState();
  const [draft, setDraft] = useState(() => buildDraft(personality));
  const [isSaving, setIsSaving] = useState(false);
  const [activeSection, setActiveSection] = useState(initialSection || "basic");
  const [dirtySections, setDirtySections] = useState({});
  const [activeTreeCategory, setActiveTreeCategory] = useState(null);
  const [expandedSubcategories, setExpandedSubcategories] = useState({});
  const [editingNodeId, setEditingNodeId] = useState(null);
  const [editingValue, setEditingValue] = useState("");
  const [highlightNodeId, setHighlightNodeId] = useState(null);
  const nodeRefMap = useRef(new Map());

  useEffect(() => {
    if (initialSection) setActiveSection(initialSection);
  }, [initialSection]);

  const editorTarget = personaState?.editorTarget;

  useEffect(() => {
    const target = editorTarget;
    if (!target) {
      return;
    }

    const nextCategory = target.category || null;
    if (nextCategory) {
      setActiveTreeCategory(nextCategory);
      if (target.subcategory) {
        setExpandedSubcategories((current) => ({
          ...current,
          [`${nextCategory}:${target.subcategory}`]: true,
        }));
      }
      setActiveSection(nextCategory === "memory" ? "memory" : nextCategory === "mood" ? "neural" : "behavior");
    }

    if (target.itemId) {
      setHighlightNodeId(target.itemId);
      personaState.markRecentlyAccessed?.(target.itemId);
      window.requestAnimationFrame(() => {
        const element = nodeRefMap.current.get(target.itemId);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
    }

    const timeoutId = window.setTimeout(() => setHighlightNodeId(null), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [editorTarget]);

  const lastDraftRef = useRef(null);
  const [pendingSection, setPendingSection] = useState(null);

  function toggleTopCategory(categoryId) {
    setActiveTreeCategory((current) => (current === categoryId ? null : categoryId));
  }

  function toggleSubcategory(categoryId, subId) {
    const key = `${categoryId}:${subId}`;
    setExpandedSubcategories((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }

  function startInlineEdit(node) {
    setEditingNodeId(node.id);
    setEditingValue(node.label || "");
  }

  async function commitInlineEdit(node) {
    const value = String(editingValue || "").trim();
    const dataRef = node?.dataRef;
    if (!dataRef) {
      setEditingNodeId(null);
      return;
    }

    if (dataRef.kind === "memory-item") {
      await personaState?.updateMemoryItem?.({
        memoryId: dataRef.memoryId,
        memoryType: dataRef.memoryType,
        content: value,
      });
    }

    if (dataRef.kind === "persona-array") {
      personaState?.updatePersonaField?.({
        field: dataRef.field,
        index: dataRef.index,
        value,
      });
    }

    if (dataRef.kind === "persona-scalar") {
      personaState?.updatePersonaField?.({
        field: dataRef.field,
        value,
      });
    }

    personaState?.markRecentlyAccessed?.(node.id);
    setEditingNodeId(null);
  }

  useEffect(() => {
    const newDraft = buildDraft(personality);
    setDraft(newDraft);
    lastDraftRef.current = newDraft;
    setDirtySections({});
  }, [personality]);

  const hasPersonality = Boolean(personality && draft);

  // Section field lists for dirty tracking
  const sectionFields = {
    basic: [
      "name", "creativeContext", "mood", "moodLabel", "description", "systemPrompt", "sourceUrls", "prosodySourceUrl", "notablePhrases"
    ],
    behavior: [
      "speechStyle", "styleEnergy", "traits", "quirks", "goals", "values", "behaviorRules", "styleSentence", "styleInterruptionRate", "styleRules", "vocalMannerismItems", "vocalMannerismFrequency", "intoxicationEnabled", "intoxicationLevel", "intoxicationDecayPerTurn", "intoxicationTriggerGain", "intoxicationTriggerKeywords", "intoxicationKeywordWeight", "intoxicationLongConversationWeight", "intoxicationMessageLengthWeight", "intoxicationPunctuationWeight", "fatigueEnabled", "fatigueLevel", "fatigueDecayPerTurn", "fatiguePassiveGainPerTurn", "fatigueTriggerGain", "fatigueTriggerKeywords", "fatigueKeywordWeight", "fatigueLongConversationWeight", "fatigueMessageLengthWeight", "fatiguePunctuationWeight", "agitationEnabled", "agitationLevel", "agitationDecayPerTurn", "agitationTriggerGain", "agitationTriggerKeywords", "agitationKeywordWeight", "agitationLongConversationWeight", "agitationMessageLengthWeight", "agitationPunctuationWeight", "focusEnabled", "focusLevel", "focusDecayPerTurn", "focusRecoveryPerTurn", "focusTriggerGain", "focusTriggerKeywords", "focusKeywordWeight", "focusLongConversationWeight", "focusMessageLengthWeight", "focusPunctuationWeight"
      , "cadenceMode", "cadenceTeasingFrequency", "cadenceVariability", "cadenceRepetitionPenalty", "cadenceCooldownTurns", "cadenceWindowTurns"
    ],
    neural: [
      "baselineValence", "baselineArousal", "baselineDominance", "moodSensitivity", "alignmentEnabled", "alignment",
      "bigFiveOpenness", "bigFiveConscientiousness", "bigFiveExtraversion", "bigFiveAgreeableness", "bigFiveNeuroticism",
      "expressionPreset", "expressionCalmness", "expressionIntensity", "expressionBlinkRate", "expressionGazeDrift"
    ],
    memory: [] // MemoryJournal is managed separately
  };

  // Dirty tracking
  useEffect(() => {
    if (!lastDraftRef.current) return;
    const dirty = {};
    for (const section of Object.keys(sectionFields)) {
      dirty[section] = sectionFields[section].some(
        (field) => draft[field] !== lastDraftRef.current[field]
      );
    }
    setDirtySections(dirty);
  }, [draft]);

  // Unsaved changes guard
  function handleSectionSwitch(nextSection) {
    if (dirtySections[activeSection]) {
      setPendingSection(nextSection);
      if (window.confirm("You have unsaved changes in this section. Save or discard before switching?")) {
        setPendingSection(null);
        setActiveSection(nextSection);
      }
      // else: stay on current section
    } else {
      setActiveSection(nextSection);
    }
  }

  const payload = useMemo(() => {
    if (!hasPersonality) {
      return null;
    }

    return {
      ...personality,
      name: draft.name.trim(),
      description: draft.description.trim(),
      systemPrompt: draft.systemPrompt,
      speechStyle: draft.speechStyle,
      vocalMannerisms: {
        items: textToList(draft.vocalMannerismItems),
        frequency: normalizeRatio(draft.vocalMannerismFrequency, 0.15),
        sfxTags: String(draft.sfxTags || "").split(/[,\s]+/).map(t => t.trim()).filter(Boolean),
        sfxFrequency: normalizeRatio(draft.sfxFrequency, 0.25),
        sfxPlacement: draft.sfxPlacement || "random",
        sfxEarlyOffset: normalizeRatio(draft.sfxEarlyOffset, 0.2),
      },
      stateFlaws: {
        intoxication: {
          enabled: parseBoolean(draft.intoxicationEnabled),
          level: normalizeRatio(draft.intoxicationLevel, 0),
          decayPerTurn: normalizeRatio(draft.intoxicationDecayPerTurn, 0.02),
          triggerGain: normalizeRatio(draft.intoxicationTriggerGain, 0.12),
          triggerKeywords: textToList(draft.intoxicationTriggerKeywords),
          triggerProfile: {
            keywordWeight: normalizeRatio(draft.intoxicationKeywordWeight, 1),
            longConversationWeight: normalizeRatio(draft.intoxicationLongConversationWeight, 0.2),
            messageLengthWeight: normalizeRatio(draft.intoxicationMessageLengthWeight, 0.35),
            punctuationWeight: normalizeRatio(draft.intoxicationPunctuationWeight, 0.25),
          },
        },
        fatigue: {
          enabled: parseBoolean(draft.fatigueEnabled),
          level: normalizeRatio(draft.fatigueLevel, 0.1),
          decayPerTurn: normalizeRatio(draft.fatigueDecayPerTurn, 0.01),
          passiveGainPerTurn: normalizeRatio(draft.fatiguePassiveGainPerTurn, 0.015),
          triggerGain: normalizeRatio(draft.fatigueTriggerGain, 0.08),
          triggerKeywords: textToList(draft.fatigueTriggerKeywords),
          triggerProfile: {
            keywordWeight: normalizeRatio(draft.fatigueKeywordWeight, 1),
            longConversationWeight: normalizeRatio(draft.fatigueLongConversationWeight, 0.9),
            messageLengthWeight: normalizeRatio(draft.fatigueMessageLengthWeight, 0.25),
            punctuationWeight: normalizeRatio(draft.fatiguePunctuationWeight, 0.1),
          },
        },
        agitation: {
          enabled: parseBoolean(draft.agitationEnabled),
          level: normalizeRatio(draft.agitationLevel, 0),
          decayPerTurn: normalizeRatio(draft.agitationDecayPerTurn, 0.03),
          triggerGain: normalizeRatio(draft.agitationTriggerGain, 0.1),
          triggerKeywords: textToList(draft.agitationTriggerKeywords),
          triggerProfile: {
            keywordWeight: normalizeRatio(draft.agitationKeywordWeight, 1),
            longConversationWeight: normalizeRatio(draft.agitationLongConversationWeight, 0.25),
            messageLengthWeight: normalizeRatio(draft.agitationMessageLengthWeight, 0.12),
            punctuationWeight: normalizeRatio(draft.agitationPunctuationWeight, 0.8),
          },
        },
        focus: {
          enabled: parseBoolean(draft.focusEnabled),
          level: normalizeRatio(draft.focusLevel, 0.75),
          decayPerTurn: normalizeRatio(draft.focusDecayPerTurn, 0.015),
          recoveryPerTurn: normalizeRatio(draft.focusRecoveryPerTurn, 0.03),
          triggerGain: normalizeRatio(draft.focusTriggerGain, 0.08),
          triggerKeywords: textToList(draft.focusTriggerKeywords),
          triggerProfile: {
            keywordWeight: normalizeRatio(draft.focusKeywordWeight, 1),
            longConversationWeight: normalizeRatio(draft.focusLongConversationWeight, 0.3),
            messageLengthWeight: normalizeRatio(draft.focusMessageLengthWeight, 0.18),
            punctuationWeight: normalizeRatio(draft.focusPunctuationWeight, 0.2),
          },
        },
      },
      creativeContext: draft.creativeContext,
      mood: draft.mood,
      moodLabel: draft.moodLabel,
      sourceUrls: textToList(draft.sourceUrls),
      notablePhrases: textToList(draft.notablePhrases),
      traits: textToList(draft.traits),
      quirks: textToList(draft.quirks),
      goals: textToList(draft.goals),
      values: textToList(draft.values),
      behaviorRules: textToList(draft.behaviorRules),
      expressionStyle: {
        ...(personality.expressionStyle || {}),
        sentenceStyle: draft.styleSentence,
        interruptionRate: normalizeRatio(draft.styleInterruptionRate, 0.3),
        energy: draft.styleEnergy || "medium",
        rules: textToList(draft.styleRules),
        cadenceRegulator: {
          mode: draft.cadenceMode || "adaptive",
          teasingFrequency: normalizeRatio(draft.cadenceTeasingFrequency, 0.2),
          variability: draft.cadenceVariability || "high",
          repetitionPenalty: draft.cadenceRepetitionPenalty || "strong",
          cooldownTurns: Math.max(0, Math.min(8, Math.round(toNumber(draft.cadenceCooldownTurns, 2)))),
          windowTurns: Math.max(3, Math.min(12, Math.round(toNumber(draft.cadenceWindowTurns, 6)))),
        },
      },
      moodSensitivity: toNumber(draft.moodSensitivity, 1),
      moodBaseline: {
        ...(personality.moodBaseline || {}),
        valence: toNumber(draft.baselineValence, 0),
        arousal: toNumber(draft.baselineArousal, 0),
        dominance: toNumber(draft.baselineDominance, 0),
      },
      bigFiveProfile: {
        ...(personality.bigFiveProfile || {}),
        openness: normalizeRatio(draft.bigFiveOpenness, 0.5),
        conscientiousness: normalizeRatio(draft.bigFiveConscientiousness, 0.5),
        extraversion: normalizeRatio(draft.bigFiveExtraversion, 0.5),
        agreeableness: normalizeRatio(draft.bigFiveAgreeableness, 0.5),
        neuroticism: normalizeRatio(draft.bigFiveNeuroticism, 0.5),
      },
      alignmentProfile: {
        ...(personality.alignmentProfile || {}),
        enabled: parseBoolean(draft.alignmentEnabled),
        alignment: draft.alignment || "true_neutral",
      },
      expressionProfile: {
        ...(personality.expressionProfile || {}),
        preset: draft.expressionPreset || "auto",
        calmness: normalizeRatio(draft.expressionCalmness, 0.5),
        intensity: normalizeRatio(draft.expressionIntensity, 0.5),
        blinkRate: normalizeRatio(draft.expressionBlinkRate, 0.5),
        gazeDrift: normalizeRatio(draft.expressionGazeDrift, 0.5),
      },
    };
  }, [draft, hasPersonality, personality]);

  async function savePersona() {
    if (!payload || !personality) {
      return;
    }

    setIsSaving(true);

    try {
      const response = await authFetch(`/personality/${personality.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save persona.");
      }

      let finalData = data;
      const prosodyUrl = String(draft.prosodySourceUrl || "").trim();

      if (prosodyUrl) {
        const prosodyResponse = await authFetch(`/personality/${personality.id}/prosody-template`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url: prosodyUrl }),
        });

        const prosodyPayload = await readApiResponsePayload(prosodyResponse);
        if (!prosodyResponse.ok) {
          throw new Error(
            getApiErrorMessage(
              prosodyResponse,
              prosodyPayload,
              "Persona saved, but prosody extraction failed.",
            ),
          );
        }

        finalData = prosodyPayload.personality || data;
      }

      onUpdated?.(finalData);
      onStatus?.({
        type: "success",
        message: `${finalData.name} was updated from Persona Editor.`,
      });
    } catch (error) {
      onStatus?.({
        type: "error",
        message: error.message || "Failed to save persona.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  if (!hasPersonality) {
    return <p className="section-copy">Select a persona to edit core profile fields and memory behavior.</p>;
  }

  return (
    <>
      <style>{editorStyles}</style>
      <div className="house-control-panel">
      <h2 className="section-heading">Persona Editor</h2>
      <p className="section-copy">
        Edit high-impact persona attributes in focused sections to speed up iterative tuning.
      </p>

      <div className="persona-sync-tree">
        <div className="persona-sync-header">Synchronized Persona Tree</div>
        {(personaState?.personaTree || []).map((categoryNode) => {
          const isActiveCategory = activeTreeCategory === categoryNode.id;
          const children = Array.isArray(categoryNode.children) ? categoryNode.children : [];

          return (
            <div key={categoryNode.id}>
              <button
                type="button"
                className={`persona-tree-row ${isActiveCategory ? "active" : ""}`}
                onClick={() => toggleTopCategory(categoryNode.id)}
              >
                <span>{categoryNode.label}</span>
                <span className="persona-tree-badge">{children.length}</span>
              </button>

              {isActiveCategory ? (
                <div className="persona-tree-sub">
                  {children.map((childNode) => {
                    const hasGrandchildren = Array.isArray(childNode.children) && childNode.children.length > 0;
                    if (hasGrandchildren) {
                      const key = `${categoryNode.id}:${childNode.id}`;
                      const expanded = Boolean(expandedSubcategories[key]);
                      return (
                        <div key={childNode.id}>
                          <button
                            type="button"
                            className="persona-tree-row"
                            onClick={() => toggleSubcategory(categoryNode.id, childNode.id)}
                          >
                            <span>{childNode.label}</span>
                            <span className="persona-tree-badge">{childNode.children.length}</span>
                          </button>

                          {expanded ? (
                            <div className="persona-tree-sub">
                              {childNode.children.map((itemNode) => {
                                const isRecent = highlightNodeId === itemNode.id || personaState?.recentlyAccessedId === itemNode.id;
                                return (
                                  <div key={itemNode.id} ref={(el) => {
                                    if (el) nodeRefMap.current.set(itemNode.id, el);
                                  }}>
                                    <div className="persona-tree-item">
                                      <button
                                        type="button"
                                        className={isRecent ? "recent" : ""}
                                        onClick={() => startInlineEdit(itemNode)}
                                      >
                                        {itemNode.label}
                                      </button>
                                      <button
                                        type="button"
                                        className="jump-btn"
                                        onClick={() => {
                                          setHighlightNodeId(itemNode.id);
                                          startInlineEdit(itemNode);
                                        }}
                                        title="Focus entry"
                                      >
                                        ↗
                                      </button>
                                    </div>
                                    {editingNodeId === itemNode.id ? (
                                      <div className="persona-tree-inline">
                                        <input
                                          value={editingValue}
                                          onChange={(event) => setEditingValue(event.target.value)}
                                          onBlur={() => void commitInlineEdit(itemNode)}
                                          onKeyDown={(event) => {
                                            if (event.key === "Enter") {
                                              event.preventDefault();
                                              void commitInlineEdit(itemNode);
                                            }
                                          }}
                                          autoFocus
                                        />
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      );
                    }

                    const isRecent = highlightNodeId === childNode.id || personaState?.recentlyAccessedId === childNode.id;
                    return (
                      <div key={childNode.id} ref={(el) => {
                        if (el) nodeRefMap.current.set(childNode.id, el);
                      }}>
                        <div className="persona-tree-item">
                          <button
                            type="button"
                            className={isRecent ? "recent" : ""}
                            onClick={() => startInlineEdit(childNode)}
                          >
                            {childNode.label}
                          </button>
                          <button
                            type="button"
                            className="jump-btn"
                            onClick={() => {
                              setHighlightNodeId(childNode.id);
                              startInlineEdit(childNode);
                            }}
                            title="Focus entry"
                          >
                            ↗
                          </button>
                        </div>
                        {editingNodeId === childNode.id ? (
                          <div className="persona-tree-inline">
                            <input
                              value={editingValue}
                              onChange={(event) => setEditingValue(event.target.value)}
                              onBlur={() => void commitInlineEdit(childNode)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  void commitInlineEdit(childNode);
                                }
                              }}
                              autoFocus
                            />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* House palette tree nav replacing old horizontal tabs */}
      <div className="house-split" style={{ marginTop: "8px", minHeight: "auto" }}>
        <div className="house-tree" style={{ width: "200px" }}>
          <div className="house-tree-root">PERSONA SECTIONS</div>
          {[
            { id: "basic", label: "Basic" },
            { id: "behavior", label: "Behavior" },
            { id: "neural", label: "Neural / Mood" },
            { id: "memory", label: "Memory Journal" },
          ].map((sec) => (
            <button
              key={sec.id}
              type="button"
              className={`house-tree-child ${activeSection === sec.id ? "selected" : ""}`}
              onClick={() => handleSectionSwitch(sec.id)}
            >
              {sec.label}{dirtySections[sec.id] ? " *" : ""}
            </button>
          ))}
        </div>
        <div className="house-content" style={{ padding: "8px 12px", minHeight: "auto" }}>
          {/* main section content renders below */}
        </div>
      </div>

      {activeSection === "basic" ? (
        <div className="persona-editor-grid">
          <div className="persona-field">
            <label>Name</label>
            <input
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            />
          </div>
          <div className="persona-field">
            <label>Creative Context</label>
            <input
              value={draft.creativeContext}
              onChange={(event) => setDraft((current) => ({ ...current, creativeContext: event.target.value }))}
            />
          </div>
          <div className="persona-field">
            <label>Mood</label>
            <input
              value={draft.mood}
              onChange={(event) => setDraft((current) => ({ ...current, mood: event.target.value }))}
            />
          </div>
          <div className="persona-field">
            <label>Mood Label</label>
            <input
              value={draft.moodLabel}
              onChange={(event) => setDraft((current) => ({ ...current, moodLabel: event.target.value }))}
            />
          </div>
          <div className="persona-field full">
            <label>Description</label>
            <textarea
              value={draft.description}
              onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
            />
          </div>
          <div className="persona-field full">
            <label>System Prompt</label>
            <textarea
              value={draft.systemPrompt}
              onChange={(event) => setDraft((current) => ({ ...current, systemPrompt: event.target.value }))}
            />
          </div>
          <div className="persona-field full">
            <label>Source URLs (one per line)</label>
            <textarea
              value={draft.sourceUrls}
              onChange={(event) => setDraft((current) => ({ ...current, sourceUrls: event.target.value }))}
            />
          </div>
          <div className="persona-field full">
            <label>Prosody Source URL</label>
            <input
              value={draft.prosodySourceUrl}
              onChange={(event) => setDraft((current) => ({ ...current, prosodySourceUrl: event.target.value }))}
              placeholder="https://www.youtube.com/watch?v=..."
            />
            <small>
              On save, this link is processed into a persona prosody template and temp audio is cleaned up automatically.
            </small>
          </div>
          <div className="persona-field full">
            <label>Notable Phrases (one per line)</label>
            <textarea
              value={draft.notablePhrases}
              onChange={(event) => setDraft((current) => ({ ...current, notablePhrases: event.target.value }))}
            />
          </div>
        </div>
      ) : null}

      {activeSection === "behavior" ? (
        <div className="persona-editor-grid">
          <div className="persona-field">
            <label>Speech Style</label>
            <input
              value={draft.speechStyle}
              onChange={(event) => setDraft((current) => ({ ...current, speechStyle: event.target.value }))}
            />
          </div>
          <div className="persona-field">
            <label>Expression Energy</label>
            <select
              value={draft.styleEnergy}
              onChange={(event) => setDraft((current) => ({ ...current, styleEnergy: event.target.value }))}
            >
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="very_high">very_high</option>
            </select>
          </div>
          <div className="persona-field full">
            <label>Traits (one per line)</label>
            <textarea
              value={draft.traits}
              onChange={(event) => setDraft((current) => ({ ...current, traits: event.target.value }))}
            />
          </div>
          <div className="persona-field full">
            <label>Quirks (one per line)</label>
            <textarea
              value={draft.quirks}
              onChange={(event) => setDraft((current) => ({ ...current, quirks: event.target.value }))}
            />
          </div>
          <div className="persona-field full">
            <label>Goals (one per line)</label>
            <textarea
              value={draft.goals}
              onChange={(event) => setDraft((current) => ({ ...current, goals: event.target.value }))}
            />
          </div>
          <div className="persona-field full">
            <label>Core Values (one per line)</label>
            <textarea
              value={draft.values}
              onChange={(event) => setDraft((current) => ({ ...current, values: event.target.value }))}
            />
          </div>
          <div className="persona-field full">
            <label>Behavior Rules (one per line)</label>
            <textarea
              value={draft.behaviorRules}
              onChange={(event) => setDraft((current) => ({ ...current, behaviorRules: event.target.value }))}
            />
          </div>
          <div className="persona-field full">
            <label>Vocal Mannerisms (one per line)</label>
            <textarea
              value={draft.vocalMannerismItems}
              onChange={(event) => setDraft((current) => ({ ...current, vocalMannerismItems: event.target.value }))}
            />
          </div>
          <div className="persona-field">
            <label>Mannerism Frequency (0-1)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={draft.vocalMannerismFrequency}
              onChange={(event) => setDraft((current) => ({ ...current, vocalMannerismFrequency: event.target.value }))}
            />
          </div>

          {/* SFX addon sounds - basic text support here; use main PersonalityForm for chips + live preview */}
          <div className="persona-field full">
            <label>SFX Tags (comma separated)</label>
            <input
              value={draft.sfxTags}
              onChange={(event) => setDraft((current) => ({ ...current, sfxTags: event.target.value }))}
              placeholder="burp, braap, giggle"
            />
          </div>
          <div className="persona-field">
            <label>SFX Frequency (0-1)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={draft.sfxFrequency}
              onChange={(event) => setDraft((current) => ({ ...current, sfxFrequency: event.target.value }))}
            />
          </div>
          <div className="persona-field">
            <label>SFX Placement</label>
            <select
              value={draft.sfxPlacement}
              onChange={(event) => setDraft((current) => ({ ...current, sfxPlacement: event.target.value }))}
            >
              <option value="random">random</option>
              <option value="start">start</option>
              <option value="end">end</option>
              <option value="throughout">throughout</option>
            </select>
          </div>

          <div className="persona-field">
            <label>SFX Early Offset (0-1)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={draft.sfxEarlyOffset}
              onChange={(event) => setDraft((current) => ({ ...current, sfxEarlyOffset: event.target.value }))}
            />
            <small>Min delay for first SFX (prevents before-voice burps). Configurable per persona.</small>
          </div>

          <div className="persona-field">
            <label>Intoxication Enabled</label>
            <select
              value={draft.intoxicationEnabled}
              onChange={(event) => setDraft((current) => ({ ...current, intoxicationEnabled: event.target.value }))}
            >
              <option value="false">false</option>
              <option value="true">true</option>
            </select>
          </div>
          <div className="persona-field">
            <label>Intoxication Level (0-1)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={draft.intoxicationLevel}
              onChange={(event) => setDraft((current) => ({ ...current, intoxicationLevel: event.target.value }))}
            />
          </div>
          <div className="persona-field">
            <label>Intoxication Decay Per Turn (0-1)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={draft.intoxicationDecayPerTurn}
              onChange={(event) => setDraft((current) => ({ ...current, intoxicationDecayPerTurn: event.target.value }))}
            />
          </div>
          <div className="persona-field">
            <label>Intoxication Trigger Gain (0-1)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={draft.intoxicationTriggerGain}
              onChange={(event) => setDraft((current) => ({ ...current, intoxicationTriggerGain: event.target.value }))}
            />
          </div>
          <div className="persona-field full">
            <label>Intoxication Trigger Keywords (one per line)</label>
            <textarea
              value={draft.intoxicationTriggerKeywords}
              onChange={(event) => setDraft((current) => ({ ...current, intoxicationTriggerKeywords: event.target.value }))}
            />
          </div>
          <div className="persona-field">
            <label>Intoxication Keyword Weight (0-1)</label>
            <input type="number" step="0.01" min="0" max="1" value={draft.intoxicationKeywordWeight} onChange={(event) => setDraft((current) => ({ ...current, intoxicationKeywordWeight: event.target.value }))} />
          </div>
          <div className="persona-field">
            <label>Intoxication Long Conversation Weight (0-1)</label>
            <input type="number" step="0.01" min="0" max="1" value={draft.intoxicationLongConversationWeight} onChange={(event) => setDraft((current) => ({ ...current, intoxicationLongConversationWeight: event.target.value }))} />
          </div>
          <div className="persona-field">
            <label>Intoxication Message Length Weight (0-1)</label>
            <input type="number" step="0.01" min="0" max="1" value={draft.intoxicationMessageLengthWeight} onChange={(event) => setDraft((current) => ({ ...current, intoxicationMessageLengthWeight: event.target.value }))} />
          </div>
          <div className="persona-field">
            <label>Intoxication Punctuation Weight (0-1)</label>
            <input type="number" step="0.01" min="0" max="1" value={draft.intoxicationPunctuationWeight} onChange={(event) => setDraft((current) => ({ ...current, intoxicationPunctuationWeight: event.target.value }))} />
          </div>

          <div className="persona-field">
            <label>Fatigue Enabled</label>
            <select value={draft.fatigueEnabled} onChange={(event) => setDraft((current) => ({ ...current, fatigueEnabled: event.target.value }))}>
              <option value="false">false</option>
              <option value="true">true</option>
            </select>
          </div>
          <div className="persona-field">
            <label>Fatigue Level (0-1)</label>
            <input type="number" step="0.01" min="0" max="1" value={draft.fatigueLevel} onChange={(event) => setDraft((current) => ({ ...current, fatigueLevel: event.target.value }))} />
          </div>
          <div className="persona-field">
            <label>Fatigue Passive Gain (0-1)</label>
            <input type="number" step="0.01" min="0" max="1" value={draft.fatiguePassiveGainPerTurn} onChange={(event) => setDraft((current) => ({ ...current, fatiguePassiveGainPerTurn: event.target.value }))} />
          </div>
          <div className="persona-field">
            <label>Fatigue Decay (0-1)</label>
            <input type="number" step="0.01" min="0" max="1" value={draft.fatigueDecayPerTurn} onChange={(event) => setDraft((current) => ({ ...current, fatigueDecayPerTurn: event.target.value }))} />
          </div>
          <div className="persona-field">
            <label>Fatigue Trigger Gain (0-1)</label>
            <input type="number" step="0.01" min="0" max="1" value={draft.fatigueTriggerGain} onChange={(event) => setDraft((current) => ({ ...current, fatigueTriggerGain: event.target.value }))} />
          </div>
          <div className="persona-field full">
            <label>Fatigue Trigger Keywords (one per line)</label>
            <textarea value={draft.fatigueTriggerKeywords} onChange={(event) => setDraft((current) => ({ ...current, fatigueTriggerKeywords: event.target.value }))} />
          </div>
          <div className="persona-field">
            <label>Fatigue Keyword Weight (0-1)</label>
            <input type="number" step="0.01" min="0" max="1" value={draft.fatigueKeywordWeight} onChange={(event) => setDraft((current) => ({ ...current, fatigueKeywordWeight: event.target.value }))} />
          </div>
          <div className="persona-field">
            <label>Fatigue Long Conversation Weight (0-1)</label>
            <input type="number" step="0.01" min="0" max="1" value={draft.fatigueLongConversationWeight} onChange={(event) => setDraft((current) => ({ ...current, fatigueLongConversationWeight: event.target.value }))} />
          </div>
          <div className="persona-field">
            <label>Fatigue Message Length Weight (0-1)</label>
            <input type="number" step="0.01" min="0" max="1" value={draft.fatigueMessageLengthWeight} onChange={(event) => setDraft((current) => ({ ...current, fatigueMessageLengthWeight: event.target.value }))} />
          </div>
          <div className="persona-field">
            <label>Fatigue Punctuation Weight (0-1)</label>
            <input type="number" step="0.01" min="0" max="1" value={draft.fatiguePunctuationWeight} onChange={(event) => setDraft((current) => ({ ...current, fatiguePunctuationWeight: event.target.value }))} />
          </div>

          <div className="persona-field">
            <label>Agitation Enabled</label>
            <select value={draft.agitationEnabled} onChange={(event) => setDraft((current) => ({ ...current, agitationEnabled: event.target.value }))}>
              <option value="false">false</option>
              <option value="true">true</option>
            </select>
          </div>
          <div className="persona-field">
            <label>Agitation Level (0-1)</label>
            <input type="number" step="0.01" min="0" max="1" value={draft.agitationLevel} onChange={(event) => setDraft((current) => ({ ...current, agitationLevel: event.target.value }))} />
          </div>
          <div className="persona-field">
            <label>Agitation Decay (0-1)</label>
            <input type="number" step="0.01" min="0" max="1" value={draft.agitationDecayPerTurn} onChange={(event) => setDraft((current) => ({ ...current, agitationDecayPerTurn: event.target.value }))} />
          </div>
          <div className="persona-field">
            <label>Agitation Trigger Gain (0-1)</label>
            <input type="number" step="0.01" min="0" max="1" value={draft.agitationTriggerGain} onChange={(event) => setDraft((current) => ({ ...current, agitationTriggerGain: event.target.value }))} />
          </div>
          <div className="persona-field full">
            <label>Agitation Trigger Keywords (one per line)</label>
            <textarea value={draft.agitationTriggerKeywords} onChange={(event) => setDraft((current) => ({ ...current, agitationTriggerKeywords: event.target.value }))} />
          </div>
          <div className="persona-field">
            <label>Agitation Keyword Weight (0-1)</label>
            <input type="number" step="0.01" min="0" max="1" value={draft.agitationKeywordWeight} onChange={(event) => setDraft((current) => ({ ...current, agitationKeywordWeight: event.target.value }))} />
          </div>
          <div className="persona-field">
            <label>Agitation Long Conversation Weight (0-1)</label>
            <input type="number" step="0.01" min="0" max="1" value={draft.agitationLongConversationWeight} onChange={(event) => setDraft((current) => ({ ...current, agitationLongConversationWeight: event.target.value }))} />
          </div>
          <div className="persona-field">
            <label>Agitation Message Length Weight (0-1)</label>
            <input type="number" step="0.01" min="0" max="1" value={draft.agitationMessageLengthWeight} onChange={(event) => setDraft((current) => ({ ...current, agitationMessageLengthWeight: event.target.value }))} />
          </div>
          <div className="persona-field">
            <label>Agitation Punctuation Weight (0-1)</label>
            <input type="number" step="0.01" min="0" max="1" value={draft.agitationPunctuationWeight} onChange={(event) => setDraft((current) => ({ ...current, agitationPunctuationWeight: event.target.value }))} />
          </div>

          <div className="persona-field">
            <label>Focus Enabled</label>
            <select value={draft.focusEnabled} onChange={(event) => setDraft((current) => ({ ...current, focusEnabled: event.target.value }))}>
              <option value="false">false</option>
              <option value="true">true</option>
            </select>
          </div>
          <div className="persona-field">
            <label>Focus Level (0-1)</label>
            <input type="number" step="0.01" min="0" max="1" value={draft.focusLevel} onChange={(event) => setDraft((current) => ({ ...current, focusLevel: event.target.value }))} />
          </div>
          <div className="persona-field">
            <label>Focus Recovery (0-1)</label>
            <input type="number" step="0.01" min="0" max="1" value={draft.focusRecoveryPerTurn} onChange={(event) => setDraft((current) => ({ ...current, focusRecoveryPerTurn: event.target.value }))} />
          </div>
          <div className="persona-field">
            <label>Focus Decay (0-1)</label>
            <input type="number" step="0.01" min="0" max="1" value={draft.focusDecayPerTurn} onChange={(event) => setDraft((current) => ({ ...current, focusDecayPerTurn: event.target.value }))} />
          </div>
          <div className="persona-field">
            <label>Focus Trigger Gain (0-1)</label>
            <input type="number" step="0.01" min="0" max="1" value={draft.focusTriggerGain} onChange={(event) => setDraft((current) => ({ ...current, focusTriggerGain: event.target.value }))} />
          </div>
          <div className="persona-field full">
            <label>Focus Trigger Keywords (one per line)</label>
            <textarea value={draft.focusTriggerKeywords} onChange={(event) => setDraft((current) => ({ ...current, focusTriggerKeywords: event.target.value }))} />
          </div>
          <div className="persona-field">
            <label>Focus Keyword Weight (0-1)</label>
            <input type="number" step="0.01" min="0" max="1" value={draft.focusKeywordWeight} onChange={(event) => setDraft((current) => ({ ...current, focusKeywordWeight: event.target.value }))} />
          </div>
          <div className="persona-field">
            <label>Focus Long Conversation Weight (0-1)</label>
            <input type="number" step="0.01" min="0" max="1" value={draft.focusLongConversationWeight} onChange={(event) => setDraft((current) => ({ ...current, focusLongConversationWeight: event.target.value }))} />
          </div>
          <div className="persona-field">
            <label>Focus Message Length Weight (0-1)</label>
            <input type="number" step="0.01" min="0" max="1" value={draft.focusMessageLengthWeight} onChange={(event) => setDraft((current) => ({ ...current, focusMessageLengthWeight: event.target.value }))} />
          </div>
          <div className="persona-field">
            <label>Focus Punctuation Weight (0-1)</label>
            <input type="number" step="0.01" min="0" max="1" value={draft.focusPunctuationWeight} onChange={(event) => setDraft((current) => ({ ...current, focusPunctuationWeight: event.target.value }))} />
          </div>
          <div className="persona-field full">
            <label>Sentence Style</label>
            <input
              value={draft.styleSentence}
              onChange={(event) => setDraft((current) => ({ ...current, styleSentence: event.target.value }))}
            />
          </div>
          <div className="persona-field">
            <label>Interruption Rate (0-1)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={draft.styleInterruptionRate}
              onChange={(event) => setDraft((current) => ({ ...current, styleInterruptionRate: event.target.value }))}
            />
          </div>
          <div className="persona-field full">
            <label>Expression Style Rules (one per line)</label>
            <textarea
              value={draft.styleRules}
              onChange={(event) => setDraft((current) => ({ ...current, styleRules: event.target.value }))}
            />
          </div>

          <div className="persona-field">
            <label>Cadence Mode</label>
            <select
              value={draft.cadenceMode}
              onChange={(event) => setDraft((current) => ({ ...current, cadenceMode: event.target.value }))}
            >
              <option value="adaptive">adaptive</option>
              <option value="manual">manual</option>
            </select>
          </div>
          <div className="persona-field">
            <label>Teasing Frequency Target (0-1)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={draft.cadenceTeasingFrequency}
              onChange={(event) => setDraft((current) => ({ ...current, cadenceTeasingFrequency: event.target.value }))}
            />
          </div>
          <div className="persona-field">
            <label>Variability</label>
            <select
              value={draft.cadenceVariability}
              onChange={(event) => setDraft((current) => ({ ...current, cadenceVariability: event.target.value }))}
            >
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </div>
          <div className="persona-field">
            <label>Repetition Penalty</label>
            <select
              value={draft.cadenceRepetitionPenalty}
              onChange={(event) => setDraft((current) => ({ ...current, cadenceRepetitionPenalty: event.target.value }))}
            >
              <option value="light">light</option>
              <option value="medium">medium</option>
              <option value="strong">strong</option>
            </select>
          </div>
          <div className="persona-field">
            <label>Cooldown Turns (0-8)</label>
            <input
              type="number"
              step="1"
              min="0"
              max="8"
              value={draft.cadenceCooldownTurns}
              onChange={(event) => setDraft((current) => ({ ...current, cadenceCooldownTurns: event.target.value }))}
            />
          </div>
          <div className="persona-field">
            <label>Lookback Turns (3-12)</label>
            <input
              type="number"
              step="1"
              min="3"
              max="12"
              value={draft.cadenceWindowTurns}
              onChange={(event) => setDraft((current) => ({ ...current, cadenceWindowTurns: event.target.value }))}
            />
          </div>
        </div>
      ) : null}

      {activeSection === "neural" ? (
        <div className="persona-block">
          <h3>Neural Core Signals</h3>
          <div className="persona-editor-grid">
            <div className="persona-field">
              <label>Baseline Valence</label>
              <input
                type="number"
                step="0.01"
                value={draft.baselineValence}
                onChange={(event) => setDraft((current) => ({ ...current, baselineValence: event.target.value }))}
              />
            </div>
            <div className="persona-field">
              <label>Baseline Arousal</label>
              <input
                type="number"
                step="0.01"
                value={draft.baselineArousal}
                onChange={(event) => setDraft((current) => ({ ...current, baselineArousal: event.target.value }))}
              />
            </div>
            <div className="persona-field">
              <label>Baseline Dominance</label>
              <input
                type="number"
                step="0.01"
                value={draft.baselineDominance}
                onChange={(event) => setDraft((current) => ({ ...current, baselineDominance: event.target.value }))}
              />
            </div>
            <div className="persona-field">
              <label>Mood Sensitivity</label>
              <input
                type="number"
                step="0.01"
                value={draft.moodSensitivity}
                onChange={(event) => setDraft((current) => ({ ...current, moodSensitivity: event.target.value }))}
              />
            </div>
            <div className="persona-field">
              <label>Alignment Enabled</label>
              <select
                value={draft.alignmentEnabled}
                onChange={(event) => setDraft((current) => ({ ...current, alignmentEnabled: event.target.value }))}
              >
                <option value="false">false</option>
                <option value="true">true</option>
              </select>
            </div>
            <div className="persona-field">
              <label>Alignment</label>
              <select
                value={draft.alignment}
                onChange={(event) => setDraft((current) => ({ ...current, alignment: event.target.value }))}
              >
                <option value="lawful_good">lawful_good</option>
                <option value="neutral_good">neutral_good</option>
                <option value="chaotic_good">chaotic_good</option>
                <option value="lawful_neutral">lawful_neutral</option>
                <option value="true_neutral">true_neutral</option>
                <option value="chaotic_neutral">chaotic_neutral</option>
                <option value="lawful_evil">lawful_evil</option>
                <option value="neutral_evil">neutral_evil</option>
                <option value="chaotic_evil">chaotic_evil</option>
              </select>
            </div>

            <div className="persona-field">
              <label>Big Five Openness (0-1)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={draft.bigFiveOpenness}
                onChange={(event) => setDraft((current) => ({ ...current, bigFiveOpenness: event.target.value }))}
              />
            </div>
            <div className="persona-field">
              <label>Conscientiousness (0-1)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={draft.bigFiveConscientiousness}
                onChange={(event) => setDraft((current) => ({ ...current, bigFiveConscientiousness: event.target.value }))}
              />
            </div>
            <div className="persona-field">
              <label>Extraversion (0-1)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={draft.bigFiveExtraversion}
                onChange={(event) => setDraft((current) => ({ ...current, bigFiveExtraversion: event.target.value }))}
              />
            </div>
            <div className="persona-field">
              <label>Agreeableness (0-1)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={draft.bigFiveAgreeableness}
                onChange={(event) => setDraft((current) => ({ ...current, bigFiveAgreeableness: event.target.value }))}
              />
            </div>
            <div className="persona-field">
              <label>Neuroticism (0-1)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={draft.bigFiveNeuroticism}
                onChange={(event) => setDraft((current) => ({ ...current, bigFiveNeuroticism: event.target.value }))}
              />
            </div>

            <div className="persona-field">
              <label>Expression Preset</label>
              <select
                value={draft.expressionPreset}
                onChange={(event) => setDraft((current) => ({ ...current, expressionPreset: event.target.value }))}
              >
                <option value="auto">auto</option>
                <option value="calm">calm</option>
                <option value="energetic">energetic</option>
                <option value="stoic">stoic</option>
                <option value="chaotic">chaotic</option>
              </select>
            </div>
            <div className="persona-field">
              <label>Expression Calmness (0-1)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={draft.expressionCalmness}
                onChange={(event) => setDraft((current) => ({ ...current, expressionCalmness: event.target.value }))}
              />
            </div>
            <div className="persona-field">
              <label>Expression Intensity (0-1)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={draft.expressionIntensity}
                onChange={(event) => setDraft((current) => ({ ...current, expressionIntensity: event.target.value }))}
              />
            </div>
            <div className="persona-field">
              <label>Blink Rate (0-1)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={draft.expressionBlinkRate}
                onChange={(event) => setDraft((current) => ({ ...current, expressionBlinkRate: event.target.value }))}
              />
            </div>
            <div className="persona-field">
              <label>Gaze Drift (0-1)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={draft.expressionGazeDrift}
                onChange={(event) => setDraft((current) => ({ ...current, expressionGazeDrift: event.target.value }))}
              />
            </div>
          </div>
        </div>
      ) : null}

      <div className="persona-editor-actions">
        <p className="persona-editor-hint">
          {Object.values(dirtySections).some(Boolean)
            ? "* Unsaved changes in one or more sections."
            : "Edits are staged across sections and saved together."}
        </p>
        <button type="button" className="persona-save-btn" onClick={() => {
          savePersona();
          lastDraftRef.current = draft;
        }} disabled={isSaving}>
          {isSaving ? "Saving" : "Save Persona"}
        </button>
      </div>

      {activeSection === "memory" ? (
        <div className="persona-block">
          <h3>Memory Controls</h3>
          <MemoryJournal personality={personality} />
        </div>
      ) : null}
      </div> {/* /house-control-panel */}
    </>
  );
}
