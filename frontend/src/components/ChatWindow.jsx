import { useEffect, useMemo, useRef, useState } from "react";

const chatStyles = `
  .chat-shell {
    display: grid;
    gap: 16px;
  }

  .chat-placeholder,
  .chat-card {
    border: 1px solid rgba(127, 45, 18, 0.1);
    border-radius: 24px;
    background: rgba(255, 252, 247, 0.9);
    overflow: hidden;
  }

  .chat-placeholder {
    padding: 24px;
    color: #795540;
    line-height: 1.7;
  }

  .chat-header {
    padding: 18px 20px;
    border-bottom: 1px solid rgba(127, 45, 18, 0.08);
    background: rgba(255, 246, 231, 0.75);
  }

  .chat-header h3 {
    margin: 0 0 6px;
    font-size: 1.1rem;
  }

  .chat-header p {
    margin: 0;
    color: #795540;
    line-height: 1.6;
  }

  .message-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-height: 380px;
    max-height: 520px;
    padding: 20px;
    overflow-y: auto;
  }

  .message-bubble {
    max-width: min(85%, 720px);
    padding: 14px 16px;
    border-radius: 18px;
    line-height: 1.7;
    white-space: pre-wrap;
  }

  .message-bubble.user {
    align-self: flex-end;
    background: linear-gradient(135deg, #bf5a2a, #7f2d12);
    color: #fff9f5;
    border-bottom-right-radius: 6px;
  }

  .message-bubble.assistant {
    align-self: flex-start;
    background: rgba(245, 232, 212, 0.9);
    color: #2f1c11;
    border-bottom-left-radius: 6px;
  }

  .message-role {
    display: block;
    margin-bottom: 6px;
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.72;
  }

  .empty-chat {
    color: #795540;
    line-height: 1.7;
  }

  .composer {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
    padding: 18px 20px 20px;
    border-top: 1px solid rgba(127, 45, 18, 0.08);
    background: rgba(255, 250, 242, 0.82);
  }

  .composer textarea {
    width: 100%;
    min-height: 98px;
    padding: 14px 16px;
    border: 1px solid rgba(75, 48, 22, 0.12);
    border-radius: 18px;
    background: rgba(255, 252, 246, 0.98);
    color: #2f1c11;
    resize: vertical;
  }

  .composer textarea:focus {
    outline: none;
    border-color: rgba(191, 90, 42, 0.55);
    box-shadow: 0 0 0 4px rgba(191, 90, 42, 0.12);
  }

  .composer button {
    align-self: end;
    padding: 14px 22px;
    border: 0;
    border-radius: 999px;
    background: #2f1c11;
    color: #fff8f2;
    font-weight: 800;
  }

  .composer button:disabled {
    opacity: 0.7;
    cursor: wait;
  }

  .text-button {
    margin-top: 14px;
    padding: 0;
    border: 0;
    background: transparent;
    color: #7f2d12;
    font-weight: 800;
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
    color: #6a4332;
    font-size: 0.88rem;
    font-weight: 700;
  }

  .voice-field input,
  .voice-field select {
    width: 100%;
    padding: 11px 13px;
    border: 1px solid rgba(75, 48, 22, 0.12);
    border-radius: 14px;
    background: rgba(255, 252, 246, 0.98);
    color: #2f1c11;
  }

  .voice-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 12px;
  }

  .voice-actions button {
    padding: 11px 16px;
    border: 0;
    border-radius: 999px;
    background: rgba(47, 28, 17, 0.92);
    color: #fff8f2;
    font-weight: 800;
  }

  .voice-actions button.secondary {
    background: rgba(255, 250, 242, 0.9);
    border: 1px solid rgba(127, 45, 18, 0.14);
    color: #7f2d12;
  }

  .voice-checkbox {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-top: 30px;
    color: #795540;
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
    preferredVoice: "",
  });
  const [voices, setVoices] = useState([]);
  const [isSavingVoice, setIsSavingVoice] = useState(false);
  const lastSpokenRef = useRef("");

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
      preferredVoice: personality.voiceProfile?.preferredVoice || "",
    });
  }, [personality]);

  useEffect(() => {
    if (!("speechSynthesis" in window)) {
      return undefined;
    }

    const loadVoices = () => {
      setVoices(window.speechSynthesis.getVoices());
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  useEffect(() => {
    if (!voiceProfile.enabled || !voiceProfile.autoplay || !latestAssistantMessage) {
      return;
    }

    const stamp = `${personality?.id || "none"}:${latestAssistantMessage.content}`;
    if (lastSpokenRef.current === stamp) {
      return;
    }

    speak(latestAssistantMessage.content);
    lastSpokenRef.current = stamp;
  }, [latestAssistantMessage, personality?.id, voiceProfile]);

  function updateVoiceField(name, value) {
    setVoiceProfile((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function stopSpeaking() {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }

  function speak(text) {
    if (!("speechSynthesis" in window) || !voiceProfile.enabled || !text.trim()) {
      return;
    }

    stopSpeaking();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.pitch = Number(voiceProfile.pitch) || 1;
    utterance.rate = Number(voiceProfile.rate) || 1;

    if (voiceProfile.preferredVoice) {
      const matchedVoice = voices.find((voice) => voice.name === voiceProfile.preferredVoice);
      if (matchedVoice) {
        utterance.voice = matchedVoice;
      }
    }

    window.speechSynthesis.speak(utterance);
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
            <h3>{personality.name}</h3>
            <p>{personality.systemPrompt}</p>
          </div>

          <div className="voice-panel">
            <div className="voice-grid">
              <div className="voice-field">
                <label htmlFor="voice-select">Browser voice</label>
                <select
                  id="voice-select"
                  value={voiceProfile.preferredVoice}
                  onChange={(event) => updateVoiceField("preferredVoice", event.target.value)}
                >
                  <option value="">Default browser voice</option>
                  {voices.map((voice) => (
                    <option key={`${voice.name}-${voice.lang}`} value={voice.name}>
                      {voice.name} ({voice.lang})
                    </option>
                  ))}
                </select>
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
              <button type="button" onClick={() => speak(latestAssistantMessage?.content || "")}>
                Speak Latest Reply
              </button>
              <button type="button" className="secondary" onClick={stopSpeaking}>
                Stop Audio
              </button>
              <button type="button" className="secondary" onClick={handleSaveVoiceProfile}>
                {isSavingVoice ? "Saving Voice..." : "Save Voice Profile"}
              </button>
            </div>
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
