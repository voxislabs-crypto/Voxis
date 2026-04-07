import { useEffect, useMemo, useState } from "react";
import { useAuthFetch } from "../hooks/useAuthFetch.js";
import MemoryJournal from "./MemoryJournal.jsx";

const editorStyles = `
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

  .persona-editor-actions {
    margin-top: 14px;
    display: flex;
    justify-content: flex-end;
  }

  .persona-save-btn {
    border: 0;
    border-radius: 999px;
    padding: 10px 16px;
    background: linear-gradient(135deg, var(--accent), var(--accent-deep));
    color: #fff;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
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

function buildDraft(personality) {
  if (!personality) {
    return null;
  }

  return {
    name: personality.name || "",
    description: personality.description || "",
    systemPrompt: personality.systemPrompt || "",
    speechStyle: personality.speechStyle || "",
    creativeContext: personality.creativeContext || "default",
    mood: personality.mood || "neutral",
    moodLabel: personality.moodLabel || "",
    traits: listToText(personality.traits),
    quirks: listToText(personality.quirks),
    goals: listToText(personality.goals),
    values: listToText(personality.values),
    behaviorRules: listToText(personality.behaviorRules),
    moodSensitivity: String(personality.moodSensitivity ?? 1),
    baselineValence: String(personality.moodBaseline?.valence ?? 0),
    baselineArousal: String(personality.moodBaseline?.arousal ?? 0),
    baselineDominance: String(personality.moodBaseline?.dominance ?? 0),
    expressionPreset: personality.expressionProfile?.preset || "auto",
    expressionCalmness: String(personality.expressionProfile?.calmness ?? 0.5),
    expressionIntensity: String(personality.expressionProfile?.intensity ?? 0.5),
    expressionBlinkRate: String(personality.expressionProfile?.blinkRate ?? 0.5),
    expressionGazeDrift: String(personality.expressionProfile?.gazeDrift ?? 0.5),
  };
}

export default function PersonaEditor({ personality, onUpdated, onStatus }) {
  const authFetch = useAuthFetch();
  const [draft, setDraft] = useState(() => buildDraft(personality));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDraft(buildDraft(personality));
  }, [personality]);

  const hasPersonality = Boolean(personality && draft);

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
      creativeContext: draft.creativeContext,
      mood: draft.mood,
      moodLabel: draft.moodLabel,
      traits: textToList(draft.traits),
      quirks: textToList(draft.quirks),
      goals: textToList(draft.goals),
      values: textToList(draft.values),
      behaviorRules: textToList(draft.behaviorRules),
      moodSensitivity: toNumber(draft.moodSensitivity, 1),
      moodBaseline: {
        ...(personality.moodBaseline || {}),
        valence: toNumber(draft.baselineValence, 0),
        arousal: toNumber(draft.baselineArousal, 0),
        dominance: toNumber(draft.baselineDominance, 0),
      },
      expressionProfile: {
        ...(personality.expressionProfile || {}),
        preset: draft.expressionPreset || "auto",
        calmness: toNumber(draft.expressionCalmness, 0.5),
        intensity: toNumber(draft.expressionIntensity, 0.5),
        blinkRate: toNumber(draft.expressionBlinkRate, 0.5),
        gazeDrift: toNumber(draft.expressionGazeDrift, 0.5),
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

      onUpdated?.(data);
      onStatus?.({
        type: "success",
        message: `${data.name} was updated from Persona Editor.`,
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
      <h2 className="section-heading">Persona Editor</h2>
      <p className="section-copy">
        Edit high-impact personality fields, neural-core expression settings, and memory behavior in one place.
      </p>

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

        <div className="persona-field">
          <label>Speech Style</label>
          <input
            value={draft.speechStyle}
            onChange={(event) => setDraft((current) => ({ ...current, speechStyle: event.target.value }))}
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
      </div>

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
            <label>Expression Calmness</label>
            <input
              type="number"
              step="0.01"
              value={draft.expressionCalmness}
              onChange={(event) => setDraft((current) => ({ ...current, expressionCalmness: event.target.value }))}
            />
          </div>
          <div className="persona-field">
            <label>Expression Intensity</label>
            <input
              type="number"
              step="0.01"
              value={draft.expressionIntensity}
              onChange={(event) => setDraft((current) => ({ ...current, expressionIntensity: event.target.value }))}
            />
          </div>
          <div className="persona-field">
            <label>Blink Rate</label>
            <input
              type="number"
              step="0.01"
              value={draft.expressionBlinkRate}
              onChange={(event) => setDraft((current) => ({ ...current, expressionBlinkRate: event.target.value }))}
            />
          </div>
          <div className="persona-field">
            <label>Gaze Drift</label>
            <input
              type="number"
              step="0.01"
              value={draft.expressionGazeDrift}
              onChange={(event) => setDraft((current) => ({ ...current, expressionGazeDrift: event.target.value }))}
            />
          </div>
        </div>
      </div>

      <div className="persona-editor-actions">
        <button type="button" className="persona-save-btn" onClick={savePersona} disabled={isSaving}>
          {isSaving ? "Saving" : "Save Persona"}
        </button>
      </div>

      <div className="persona-block">
        <h3>Memory Controls</h3>
        <MemoryJournal personality={personality} />
      </div>
    </>
  );
}
