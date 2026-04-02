import { useEffect, useMemo, useRef, useState } from "react";

const chatStyles = `
  .chat-shell {
    display: grid;
    gap: 16px;
  }

  .chat-placeholder,
  .chat-card {
    border: 1px solid rgba(0, 180, 255, 0.12);
    border-radius: 22px;
    background: rgba(6, 14, 28, 0.72);
    overflow: hidden;
  }

  .chat-placeholder {
    padding: 24px;
    color: var(--muted);
    line-height: 1.7;
  }

  .chat-header {
    padding: 18px 20px;
    border-bottom: 1px solid rgba(0, 180, 255, 0.08);
    background: rgba(0, 180, 255, 0.04);
  }

  .chat-header h3 {
    margin: 0 0 6px;
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--text);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .mood-dot {
    display: inline-block;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .chat-header p {
    margin: 0;
    color: var(--muted);
    font-size: 0.88rem;
    line-height: 1.6;
  }

  .message-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 380px;
    max-height: 520px;
    padding: 20px;
    overflow-y: auto;
  }

  .message-bubble {
    max-width: min(85%, 720px);
    padding: 13px 16px;
    border-radius: 18px;
    line-height: 1.7;
    white-space: pre-wrap;
    font-size: 0.95rem;
  }

  .message-bubble.user {
    align-self: flex-end;
    background: linear-gradient(135deg, rgba(0, 160, 255, 0.22), rgba(0, 80, 220, 0.20));
    border: 1px solid rgba(0, 180, 255, 0.24);
    color: var(--text);
    border-bottom-right-radius: 6px;
  }

  .message-bubble.assistant {
    align-self: flex-start;
    background: rgba(16, 24, 44, 0.88);
    border: 1px solid rgba(0, 180, 255, 0.08);
    color: var(--text);
    border-bottom-left-radius: 6px;
  }

  .message-role {
    display: block;
    margin-bottom: 6px;
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    opacity: 0.6;
    color: var(--accent);
  }

  .empty-chat {
    color: var(--muted);
    line-height: 1.7;
    font-size: 0.93rem;
  }

  .composer {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
    padding: 16px 20px 18px;
    border-top: 1px solid rgba(0, 180, 255, 0.08);
    background: rgba(0, 180, 255, 0.02);
  }

  .composer textarea {
    width: 100%;
    min-height: 88px;
    padding: 13px 16px;
    border: 1px solid rgba(0, 180, 255, 0.14);
    border-radius: 16px;
    background: rgba(6, 14, 28, 0.90);
    color: var(--text);
    resize: vertical;
  }

  .composer textarea::placeholder {
    color: var(--muted);
  }

  .composer textarea:focus {
    outline: none;
    border-color: rgba(0, 180, 255, 0.42);
    box-shadow: 0 0 0 3px rgba(0, 180, 255, 0.08);
  }

  .composer button {
    align-self: end;
    padding: 13px 22px;
    border: 0;
    border-radius: 999px;
    background: linear-gradient(135deg, var(--accent), var(--accent-deep));
    color: #fff;
    font-weight: 800;
    box-shadow: 0 4px 16px rgba(0, 160, 255, 0.28);
    transition: opacity 180ms, transform 180ms;
  }

  .composer button:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  .composer button:disabled {
    opacity: 0.55;
    cursor: wait;
  }

  .text-button {
    margin-top: 14px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--accent);
    font-weight: 700;
  }

  .voice-panel {
    padding: 16px 20px 0;
  }

  .voice-grid {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .voice-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .voice-field label {
    color: var(--muted);
    font-size: 0.85rem;
    font-weight: 700;
  }

  .voice-field input,
  .voice-field select {
    width: 100%;
    padding: 10px 13px;
    border: 1px solid rgba(0, 180, 255, 0.14);
    border-radius: 12px;
    background: rgba(6, 14, 28, 0.90);
    color: var(--text);
  }

  .voice-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 12px;
  }

  .voice-actions button {
    padding: 10px 16px;
    border: 0;
    border-radius: 999px;
    background: linear-gradient(135deg, var(--accent), var(--accent-deep));
    color: #fff;
    font-weight: 700;
    font-size: 0.9rem;
  }

  .voice-actions button.secondary {
    background: rgba(0, 180, 255, 0.06);
    border: 1px solid rgba(0, 180, 255, 0.18);
    color: var(--accent);
  }

  .audio-player {
    width: 100%;
    margin-top: 12px;
  }

  .voice-checkbox {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-top: 30px;
    color: var(--muted);
    font-size: 0.92rem;
  }

  @media (max-width: 720px) {
    .composer {
      grid-template-columns: 1fr;
    }

    .composer button {
      width: 100%;
    }

    .message-bubble {
      max-width: 100%;
    }

    .voice-grid {
      grid-template-columns: 1fr;
    }

    .voice-checkbox {
      padding-top: 0;
    }
  }
`;

export default function ChatWindow({
  personality,
  messages,
  isLoadingMessages,
  isSending,
  onSend,
  onSaveVoiceProfile,
  onJumpToBuilder,
}) {
  const [draft, setDraft] = useState("");
  const [voiceProfile, setVoiceProfile] = useState({
    enabled: true,
    autoplay: false,
    pitch: 1,
    rate: 1,
    preferredVoice: "alloy",
    providerVoice: "alloy",
    providerModel: "gpt-4o-mini-tts",
  });
  const [isSavingVoice, setIsSavingVoice] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const lastGeneratedRef = useRef("");

  const latestAssistantMessage = useMemo(
    () => [...messages].reverse().find((message) => message.role === "assistant") || null,
    [messages],
  );

  useEffect(() => {
    if (!personality) {
      return;
    }

    setVoiceProfile({
      enabled: personality.voiceProfile?.enabled !== false,
      autoplay: Boolean(personality.voiceProfile?.autoplay),
      pitch: Number(personality.voiceProfile?.pitch) || 1,
      rate: Number(personality.voiceProfile?.rate) || 1,
      preferredVoice:
        personality.voiceProfile?.preferredVoice || personality.voiceProfile?.providerVoice || "alloy",
      providerVoice:
        personality.voiceProfile?.providerVoice || personality.voiceProfile?.preferredVoice || "alloy",
      providerModel: personality.voiceProfile?.providerModel || "gpt-4o-mini-tts",
    });
  }, [personality]);

  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  useEffect(() => {
    if (!voiceProfile.enabled || !voiceProfile.autoplay || !latestAssistantMessage) {
      return;
    }

    const stamp = `${personality?.id || "none"}:${latestAssistantMessage.content}`;
    if (lastGeneratedRef.current === stamp) {
      return;
    }

    void generateAudio(latestAssistantMessage.content);
    lastGeneratedRef.current = stamp;
  }, [latestAssistantMessage, personality?.id, voiceProfile]);

  function updateVoiceField(name, value) {
    setVoiceProfile((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function stopSpeaking() {
    const audioElement = document.getElementById("voxis-audio-player");
    if (audioElement instanceof HTMLAudioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
    }
  }

  async function generateAudio(text) {
    if (!voiceProfile.enabled || !text.trim() || !personality) {
      return;
    }

    setIsGeneratingAudio(true);

    try {
      const response = await fetch(`/personality/${personality.id}/tts`, {
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
        const audioElement = document.getElementById("voxis-audio-player");
        if (audioElement instanceof HTMLAudioElement) {
          void audioElement.play().catch(() => {});
        }
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
        pitch: Number(voiceProfile.pitch),
        rate: Number(voiceProfile.rate),
        preferredVoice: voiceProfile.preferredVoice,
        providerVoice: voiceProfile.providerVoice || voiceProfile.preferredVoice,
        providerModel: voiceProfile.providerModel,
      });
    } finally {
      setIsSavingVoice(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const message = draft.trim();
    if (!message || isSending) {
      return;
    }

    setDraft("");
    await onSend(message);
  }

  if (!personality) {
    return (
      <>
        <style>{chatStyles}</style>
        <div className="chat-placeholder">
          Select a saved personality or create a new one before opening chat.
          <div>
            <button type="button" className="text-button" onClick={onJumpToBuilder}>
              Go to Character Request
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{chatStyles}</style>
      <div className="chat-shell">
        <div className="chat-card">
          <div className="chat-header">
            <h3>
              {personality.moodState && (
                <span
                  className="mood-dot"
                  title={personality.moodLabel || ""}
                  style={{
                    background:
                      personality.moodState.valence > 0.2
                        ? "#4ade80"
                        : personality.moodState.valence < -0.2
                        ? "#f87171"
                        : "#fbbf24",
                  }}
                />
              )}
              {personality.name}
            </h3>
            <p>{personality.description}</p>
          </div>

          <div className="voice-panel">
            <div className="voice-grid">
              <div className="voice-field">
                <label htmlFor="voice-select">TTS voice</label>
                <input
                  id="voice-select"
                  value={voiceProfile.providerVoice || voiceProfile.preferredVoice}
                  onChange={(event) => {
                    updateVoiceField("providerVoice", event.target.value);
                    updateVoiceField("preferredVoice", event.target.value);
                  }}
                  placeholder="alloy"
                />
              </div>

              <div className="voice-field">
                <label htmlFor="voice-model">TTS model</label>
                <input
                  id="voice-model"
                  value={voiceProfile.providerModel}
                  onChange={(event) => updateVoiceField("providerModel", event.target.value)}
                  placeholder="gpt-4o-mini-tts"
                />
              </div>

              <div className="voice-field">
                <label htmlFor="voice-pitch">
                  Pitch: {Number(voiceProfile.pitch).toFixed(2)}
                </label>
                <input
                  id="voice-pitch"
                  type="range"
                  min="0.5"
                  max="1.6"
                  step="0.05"
                  value={voiceProfile.pitch}
                  onChange={(event) => updateVoiceField("pitch", Number(event.target.value))}
                />
              </div>

              <div className="voice-field">
                <label htmlFor="voice-rate">
                  Rate: {Number(voiceProfile.rate).toFixed(2)}
                </label>
                <input
                  id="voice-rate"
                  type="range"
                  min="0.6"
                  max="1.6"
                  step="0.05"
                  value={voiceProfile.rate}
                  onChange={(event) => updateVoiceField("rate", Number(event.target.value))}
                />
              </div>

              <label className="voice-checkbox">
                <input
                  type="checkbox"
                  checked={voiceProfile.enabled}
                  onChange={(event) => updateVoiceField("enabled", event.target.checked)}
                />
                Enable voice playback
              </label>

              <label className="voice-checkbox">
                <input
                  type="checkbox"
                  checked={voiceProfile.autoplay}
                  onChange={(event) => updateVoiceField("autoplay", event.target.checked)}
                />
                Auto-play assistant replies
              </label>
            </div>

            <div className="voice-actions">
              <button
                type="button"
                onClick={() => void generateAudio(latestAssistantMessage?.content || "")}
                disabled={isGeneratingAudio || !latestAssistantMessage}
              >
                {isGeneratingAudio ? "Generating Audio..." : "Generate Latest Audio"}
              </button>
              <button type="button" className="secondary" onClick={stopSpeaking}>
                Stop Audio
              </button>
              <button type="button" className="secondary" onClick={handleSaveVoiceProfile}>
                {isSavingVoice ? "Saving Voice..." : "Save Voice Profile"}
              </button>
            </div>

            {audioUrl ? <audio id="voxis-audio-player" className="audio-player" controls src={audioUrl} /> : null}
          </div>

          <div className="message-list">
            {isLoadingMessages ? (
              <div className="empty-chat">Loading persisted conversation history...</div>
            ) : messages.length ? (
              messages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={`message-bubble ${message.role}`}>
                  <span className="message-role">
                    {message.role === "assistant" ? personality.name : "You"}
                  </span>
                  {message.content}
                </div>
              ))
            ) : (
              <div className="empty-chat">
                No conversation yet. Send the first message and Voxis will inject the stored
                system prompt plus the recent message history into the LLM request.
              </div>
            )}
          </div>

          <form className="composer" onSubmit={handleSubmit}>
            <textarea
              placeholder={`Message ${personality.name}...`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button type="submit" disabled={isSending || !draft.trim()}>
              {isSending ? "Sending..." : "Send"}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
