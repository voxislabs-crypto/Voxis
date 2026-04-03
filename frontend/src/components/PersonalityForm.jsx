import { useState } from "react";

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

  @media (max-width: 720px) {
    .creator-grid {
      grid-template-columns: 1fr;
    }

    .voice-grid {
      grid-template-columns: 1fr;
    }

    .checkbox-row {
      padding-top: 0;
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
};

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

export default function PersonalityForm({ onCreated, onError }) {
  const [form, setForm] = useState(initialForm);
  const [isSaving, setIsSaving] = useState(false);
  const [isResearching, setIsResearching] = useState(false);
  const [researchResult, setResearchResult] = useState(null);
  const [researchSources, setResearchSources] = useState([]);

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
      const response = await fetch("/personality", {
        method: "POST",
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
            pitch: Number(form.voicePitch),
            rate: Number(form.voiceRate),
            preferredVoice: form.preferredVoice,
            providerVoice: form.preferredVoice,
            providerModel: form.providerModel,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save personality.");
      }

      onCreated(data);
      onError({ type: "", message: "" });
      setForm(initialForm);
      setResearchResult(null);
      setResearchSources([]);
    } catch (error) {
      onError({
        type: "error",
        message: error.message || "Failed to save personality.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleResearch() {
    setIsResearching(true);

    try {
      const response = await fetch("/research-profile", {
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

  return (
    <>
      <style>{formStyles}</style>
      <form onSubmit={handleSubmit}>
        <div className="creator-grid">
          <div className="field">
            <label htmlFor="name">Character name</label>
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
            <label htmlFor="creativeContext">Creative context</label>
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
            <label htmlFor="sourceQuery">Research query</label>
            <input
              id="sourceQuery"
              name="sourceQuery"
              placeholder="Lincoln speeches voice mannerisms"
              value={form.sourceQuery}
              onChange={updateField}
            />
          </div>

          <div className="field full">
            <label htmlFor="description">Character brief</label>
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
            <label htmlFor="sourceUrls">Source URLs</label>
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

          <div className="field full">
            <label>Voice profile</label>
            <div className="voice-grid">
              <div className="field">
                <label htmlFor="preferredVoice">Preferred browser voice</label>
                <input
                  id="preferredVoice"
                  name="preferredVoice"
                  placeholder="alloy"
                  value={form.preferredVoice}
                  onChange={updateField}
                />
              </div>

              <div className="field">
                <label htmlFor="providerModel">TTS model</label>
                <input
                  id="providerModel"
                  name="providerModel"
                  placeholder="gpt-4o-mini-tts"
                  value={form.providerModel}
                  onChange={updateField}
                />
              </div>

              <div className="field">
                <label htmlFor="voicePitch">Pitch: {Number(form.voicePitch).toFixed(2)}</label>
                <input
                  className="voice-slider"
                  id="voicePitch"
                  name="voicePitch"
                  type="range"
                  min="0.5"
                  max="1.6"
                  step="0.05"
                  value={form.voicePitch}
                  onChange={updateField}
                />
              </div>

              <div className="field">
                <label htmlFor="voiceRate">Rate: {Number(form.voiceRate).toFixed(2)}</label>
                <input
                  className="voice-slider"
                  id="voiceRate"
                  name="voiceRate"
                  type="range"
                  min="0.6"
                  max="1.6"
                  step="0.05"
                  value={form.voiceRate}
                  onChange={updateField}
                />
              </div>
            </div>
            <div className="voice-grid">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={form.voiceEnabled}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      voiceEnabled: event.target.checked,
                    }))
                  }
                />
                Server-side voice playback enabled
              </label>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={form.voiceAutoplay}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      voiceAutoplay: event.target.checked,
                    }))
                  }
                />
                Auto-play generated replies
              </label>
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
            Run a research pass first if you want Voxis to pull public source notes into the
            character profile before saving it.
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
              {isSaving ? "Saving Personality..." : "Save Personality"}
            </button>
          </div>
        </div>
      </form>
    </>
  );
}
