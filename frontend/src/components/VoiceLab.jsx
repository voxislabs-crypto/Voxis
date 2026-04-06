import { useEffect, useMemo, useRef, useState } from "react";
import { useAuthFetch } from "../hooks/useAuthFetch.js";

const voiceLabStyles = `
  .voice-lab-shell {
    border: 1px solid rgba(0, 180, 255, 0.12);
    border-radius: 22px;
    background: rgba(6, 14, 28, 0.72);
    overflow: hidden;
  }

  .voice-lab-header {
    padding: 18px 20px;
    border-bottom: 1px solid rgba(0, 180, 255, 0.08);
    background: rgba(0, 180, 255, 0.04);
  }

  .voice-lab-header h3 {
    margin: 0 0 6px;
    font-size: 1.02rem;
  }

  .voice-lab-header p {
    margin: 0;
    color: var(--muted);
    line-height: 1.6;
    font-size: 0.92rem;
  }

  .voice-lab-body {
    padding: 16px 20px 20px;
    display: grid;
    gap: 14px;
  }

  .voice-lab-grid {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .voice-lab-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .voice-lab-field label {
    color: var(--muted);
    font-size: 0.84rem;
    font-weight: 700;
  }

  .voice-lab-field input,
  .voice-lab-field select,
  .voice-lab-field textarea {
    width: 100%;
    padding: 10px 13px;
    border: 1px solid rgba(0, 180, 255, 0.14);
    border-radius: 12px;
    background: rgba(6, 14, 28, 0.90);
    color: var(--text);
  }

  .voice-lab-field textarea {
    min-height: 110px;
    resize: vertical;
  }

  .voice-lab-check {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--muted);
    font-size: 0.92rem;
  }

  .voice-lab-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .voice-lab-actions button {
    padding: 10px 16px;
    border: 0;
    border-radius: 999px;
    background: linear-gradient(135deg, var(--accent), var(--accent-deep));
    color: #fff;
    font-weight: 700;
    font-size: 0.9rem;
  }

  .voice-lab-actions button.secondary {
    background: rgba(0, 180, 255, 0.06);
    border: 1px solid rgba(0, 180, 255, 0.18);
    color: var(--accent);
  }

  .voice-lab-actions button:disabled {
    opacity: 0.55;
    cursor: wait;
  }

  .voice-lab-player {
    width: 100%;
    margin-top: 4px;
  }

  .voice-lab-empty {
    border: 1px solid rgba(0, 180, 255, 0.12);
    border-radius: 22px;
    background: rgba(6, 14, 28, 0.72);
    padding: 24px;
    color: var(--muted);
    line-height: 1.7;
  }

  .voice-lab-link {
    margin-top: 14px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--accent);
    font-weight: 700;
  }

  @media (max-width: 720px) {
    .voice-lab-grid {
      grid-template-columns: 1fr;
    }
  }
`;

export default function VoiceLab({
  personality,
  messages,
  onSaveVoiceProfile,
  onStatus,
  onJumpToBuilder,
}) {
  const authFetch = useAuthFetch();
  const [voiceProfile, setVoiceProfile] = useState({
    enabled: true,
    autoplay: false,
    engine: "auto",
    pitch: 1,
    rate: 1,
    preferredVoice: "alloy",
    providerVoice: "alloy",
    providerModel: "gpt-4o-mini-tts",
    piperModelPath: "",
    piperSpeaker: "",
  });
  const [sampleText, setSampleText] = useState("");
  const [isSavingVoice, setIsSavingVoice] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [piperVoices, setPiperVoices] = useState([]);
  const [isLoadingPiperVoices, setIsLoadingPiperVoices] = useState(false);
  const [piperVoiceError, setPiperVoiceError] = useState("");
  const audioRef = useRef(null);

  const latestAssistantMessage = useMemo(
    () => [...(messages || [])].reverse().find((message) => message.role === "assistant") || null,
    [messages],
  );

  const selectedPiperVoice = useMemo(
    () =>
      piperVoices.find(
        (voice) =>
          voice.path === voiceProfile.piperModelPath ||
          voice.id === voiceProfile.providerVoice ||
          voice.id === voiceProfile.preferredVoice,
      ) || null,
    [piperVoices, voiceProfile.piperModelPath, voiceProfile.preferredVoice, voiceProfile.providerVoice],
  );

  useEffect(() => {
    if (!personality) {
      return;
    }

    setVoiceProfile({
      enabled: personality.voiceProfile?.enabled !== false,
      autoplay: Boolean(personality.voiceProfile?.autoplay),
      engine: personality.voiceProfile?.engine || "auto",
      pitch: Number(personality.voiceProfile?.pitch) || 1,
      rate: Number(personality.voiceProfile?.rate) || 1,
      preferredVoice:
        personality.voiceProfile?.preferredVoice || personality.voiceProfile?.providerVoice || "alloy",
      providerVoice:
        personality.voiceProfile?.providerVoice || personality.voiceProfile?.preferredVoice || "alloy",
      providerModel: personality.voiceProfile?.providerModel || "gpt-4o-mini-tts",
      piperModelPath: personality.voiceProfile?.piperModelPath || "",
      piperSpeaker:
        personality.voiceProfile?.piperSpeaker === null || personality.voiceProfile?.piperSpeaker === undefined
          ? ""
          : String(personality.voiceProfile?.piperSpeaker),
    });
  }, [personality]);

  useEffect(() => {
    if (!personality || voiceProfile.engine !== "piper") {
      return;
    }

    let ignore = false;

    async function loadPiperVoices() {
      setIsLoadingPiperVoices(true);
      setPiperVoiceError("");

      try {
        const response = await authFetch("/tts/piper-voices");
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to load Piper voices.");
        }

        if (ignore) {
          return;
        }

        const voices = Array.isArray(data.voices) ? data.voices : [];
        setPiperVoices(voices);

        setVoiceProfile((current) => {
          const currentMatch = voices.find((voice) => voice.path === current.piperModelPath);
          if (currentMatch) {
            return {
              ...current,
              providerVoice: currentMatch.id,
              preferredVoice: currentMatch.id,
            };
          }

          const defaultVoice = voices.find((voice) => voice.isDefault) || voices[0];
          if (!defaultVoice || current.piperModelPath) {
            return current;
          }

          return {
            ...current,
            piperModelPath: defaultVoice.path,
            providerVoice: defaultVoice.id,
            preferredVoice: defaultVoice.id,
          };
        });
      } catch (error) {
        if (!ignore) {
          setPiperVoices([]);
          setPiperVoiceError(error.message || "Failed to load Piper voices.");
        }
      } finally {
        if (!ignore) {
          setIsLoadingPiperVoices(false);
        }
      }
    }

    void loadPiperVoices();

    return () => {
      ignore = true;
    };
  }, [authFetch, personality?.id, voiceProfile.engine]);

  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  function updateVoiceField(name, value) {
    setVoiceProfile((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function handlePiperVoiceChange(nextPath) {
    const nextVoice = piperVoices.find((voice) => voice.path === nextPath);

    if (!nextVoice) {
      updateVoiceField("piperModelPath", nextPath);
      return;
    }

    setVoiceProfile((current) => ({
      ...current,
      piperModelPath: nextVoice.path,
      providerVoice: nextVoice.id,
      preferredVoice: nextVoice.id,
      piperSpeaker:
        nextVoice.speakers?.length === 1 && (current.piperSpeaker === "" || current.piperSpeaker === null)
          ? String(nextVoice.speakers[0].id)
          : current.piperSpeaker,
    }));
  }

  function stopSpeaking() {
    if (audioRef.current instanceof HTMLAudioElement) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }

  async function generateAudio(text) {
    if (!voiceProfile.enabled || !text?.trim() || !personality) {
      return;
    }

    setIsGeneratingAudio(true);

    try {
      const response = await authFetch(`/personality/${personality.id}/tts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          voiceProfile,
        }),
      });

      if (!response.ok) {
        let errorMessage = "Failed to generate speech.";

        try {
          const errorPayload = await response.json();
          errorMessage = errorPayload.error || errorMessage;
        } catch {
          errorMessage = await response.text();
        }

        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      const nextAudioUrl = URL.createObjectURL(blob);

      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }

      setAudioUrl(nextAudioUrl);

      requestAnimationFrame(() => {
        if (audioRef.current instanceof HTMLAudioElement) {
          void audioRef.current.play().catch(() => {});
        }
      });
    } catch (error) {
      onStatus?.({
        type: "error",
        message: error.message || "Failed to generate speech.",
      });
    } finally {
      setIsGeneratingAudio(false);
    }
  }

  async function handleSaveVoiceProfile() {
    setIsSavingVoice(true);

    try {
      await onSaveVoiceProfile({
        enabled: voiceProfile.enabled,
        autoplay: voiceProfile.autoplay,
        engine: voiceProfile.engine,
        pitch: Number(voiceProfile.pitch),
        rate: Number(voiceProfile.rate),
        preferredVoice: voiceProfile.preferredVoice,
        providerVoice: voiceProfile.providerVoice || voiceProfile.preferredVoice,
        providerModel: voiceProfile.providerModel,
        piperModelPath: voiceProfile.piperModelPath,
        piperSpeaker: voiceProfile.piperSpeaker === "" ? null : Number(voiceProfile.piperSpeaker),
      });
    } finally {
      setIsSavingVoice(false);
    }
  }

  if (!personality) {
    return (
      <>
        <style>{voiceLabStyles}</style>
        <div className="voice-lab-empty">
          Select a saved personality or create a new one before opening Voice Lab.
          <div>
            <button type="button" className="voice-lab-link" onClick={onJumpToBuilder}>
              Go to Character Request
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{voiceLabStyles}</style>
      <div className="voice-lab-shell">
        <div className="voice-lab-header">
          <h3>Voice Lab: {personality.name}</h3>
          <p>
            Tune full TTS settings, test sample lines, and save profile defaults. Quick play/autoplay remains in Chat.
          </p>
        </div>

        <div className="voice-lab-body">
          <div className="voice-lab-grid">
            <div className="voice-lab-field">
              <label htmlFor="voice-lab-engine">TTS engine</label>
              <select
                id="voice-lab-engine"
                value={voiceProfile.engine}
                onChange={(event) => updateVoiceField("engine", event.target.value)}
              >
                <option value="auto">auto (prefer Piper, fallback cloud)</option>
                <option value="cloud">cloud</option>
                <option value="piper">piper</option>
              </select>
            </div>

            <div className="voice-lab-field">
              <label htmlFor={voiceProfile.engine === "piper" ? "voice-lab-piper-voice" : "voice-lab-voice"}>
                {voiceProfile.engine === "piper" ? "Piper voice" : "TTS voice"}
              </label>
              {voiceProfile.engine === "piper" ? (
                <>
                  <select
                    id="voice-lab-piper-voice"
                    value={selectedPiperVoice?.path || voiceProfile.piperModelPath || ""}
                    onChange={(event) => handlePiperVoiceChange(event.target.value)}
                    disabled={isLoadingPiperVoices || piperVoices.length === 0}
                  >
                    <option value="">
                      {isLoadingPiperVoices
                        ? "Scanning local Piper voices..."
                        : piperVoices.length
                          ? "Select a Piper voice"
                          : "No Piper voices found"}
                    </option>
                    {piperVoices.map((voice) => (
                      <option key={voice.path} value={voice.path}>
                        {voice.label}{voice.isDefault ? " (default)" : ""}
                      </option>
                    ))}
                  </select>
                  <small>
                    {piperVoiceError
                      ? piperVoiceError
                      : piperVoices.length
                        ? `Found ${piperVoices.length} local Piper voice${piperVoices.length === 1 ? "" : "s"}.`
                        : "No local Piper models were detected yet. Run the Piper installer or set PIPER_MODEL_PATH."}
                  </small>
                </>
              ) : (
                <input
                  id="voice-lab-voice"
                  value={voiceProfile.providerVoice || voiceProfile.preferredVoice}
                  onChange={(event) => {
                    updateVoiceField("providerVoice", event.target.value);
                    updateVoiceField("preferredVoice", event.target.value);
                  }}
                  placeholder="alloy"
                />
              )}
            </div>

            <div className="voice-lab-field">
              <label htmlFor="voice-lab-model">TTS model</label>
              <input
                id="voice-lab-model"
                value={voiceProfile.providerModel}
                onChange={(event) => updateVoiceField("providerModel", event.target.value)}
                placeholder={voiceProfile.engine === "piper" ? "Optional cloud fallback model" : "gpt-4o-mini-tts"}
              />
            </div>

            {voiceProfile.engine === "piper" ? (
              <>
                <div className="voice-lab-field">
                  <label htmlFor="voice-lab-piper-model">Piper model path (advanced)</label>
                  <input
                    id="voice-lab-piper-model"
                    value={voiceProfile.piperModelPath}
                    onChange={(event) => updateVoiceField("piperModelPath", event.target.value)}
                    placeholder="/opt/piper/models/en_US-lessac-medium.onnx"
                  />
                </div>

                <div className="voice-lab-field">
                  <label htmlFor="voice-lab-piper-speaker">
                    {selectedPiperVoice?.speakers?.length > 1 ? "Piper speaker" : "Piper speaker id (optional)"}
                  </label>
                  {selectedPiperVoice?.speakers?.length > 1 ? (
                    <select
                      id="voice-lab-piper-speaker"
                      value={String(voiceProfile.piperSpeaker ?? "")}
                      onChange={(event) => updateVoiceField("piperSpeaker", event.target.value)}
                    >
                      <option value="">Use default speaker</option>
                      {selectedPiperVoice.speakers.map((speaker) => (
                        <option key={`${selectedPiperVoice.id}-${speaker.id}`} value={String(speaker.id)}>
                          {speaker.label} ({speaker.id})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id="voice-lab-piper-speaker"
                      value={voiceProfile.piperSpeaker}
                      onChange={(event) => updateVoiceField("piperSpeaker", event.target.value)}
                      placeholder="0"
                    />
                  )}
                </div>
              </>
            ) : null}

            <div className="voice-lab-field">
              <label htmlFor="voice-lab-pitch">Pitch: {Number(voiceProfile.pitch).toFixed(2)}</label>
              <input
                id="voice-lab-pitch"
                type="range"
                min="0.5"
                max="1.6"
                step="0.05"
                value={voiceProfile.pitch}
                onChange={(event) => updateVoiceField("pitch", Number(event.target.value))}
              />
            </div>

            <div className="voice-lab-field">
              <label htmlFor="voice-lab-rate">Rate: {Number(voiceProfile.rate).toFixed(2)}</label>
              <input
                id="voice-lab-rate"
                type="range"
                min="0.6"
                max="1.6"
                step="0.05"
                value={voiceProfile.rate}
                onChange={(event) => updateVoiceField("rate", Number(event.target.value))}
              />
            </div>
          </div>

          <div className="voice-lab-grid" style={{ alignItems: "end" }}>
            <label className="voice-lab-check">
              <input
                type="checkbox"
                checked={voiceProfile.enabled}
                onChange={(event) => updateVoiceField("enabled", event.target.checked)}
              />
              Enable voice playback
            </label>

            <label className="voice-lab-check">
              <input
                type="checkbox"
                checked={voiceProfile.autoplay}
                onChange={(event) => updateVoiceField("autoplay", event.target.checked)}
              />
              Auto-play assistant replies
            </label>
          </div>

          <div className="voice-lab-field">
            <label htmlFor="voice-lab-sample">Sample text</label>
            <textarea
              id="voice-lab-sample"
              value={sampleText}
              onChange={(event) => setSampleText(event.target.value)}
              placeholder="Type a line to preview this voice profile..."
            />
          </div>

          <div className="voice-lab-actions">
            <button
              type="button"
              onClick={() => void generateAudio(sampleText)}
              disabled={isGeneratingAudio || !sampleText.trim()}
            >
              {isGeneratingAudio ? "Generating..." : "Generate Sample Audio"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => void generateAudio(latestAssistantMessage?.content || "")}
              disabled={isGeneratingAudio || !latestAssistantMessage}
            >
              Generate Latest Reply Audio
            </button>
            <button type="button" className="secondary" onClick={stopSpeaking}>
              Stop Audio
            </button>
            <button type="button" className="secondary" onClick={handleSaveVoiceProfile}>
              {isSavingVoice ? "Saving Voice..." : "Save Voice Profile"}
            </button>
          </div>

          {audioUrl ? (
            <audio ref={audioRef} className="voice-lab-player" controls src={audioUrl} />
          ) : null}
        </div>
      </div>
    </>
  );
}