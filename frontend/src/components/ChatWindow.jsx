import { useEffect, useMemo, useRef, useState } from "react";
import { useAuthFetch } from "../hooks/useAuthFetch.js";
import NeuralCore from "./NeuralCore.jsx";
import AvatarCore from "./AvatarCore.jsx";
import usePrefersReducedMotion from "../hooks/usePrefersReducedMotion.js";

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

  .chat-card {
    position: relative;
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

  .chat-header-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
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

  .header-avatar-wrap {
    display: inline-flex;
    align-items: center;
    gap: 10px;
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

  .debug-toggle {
    padding: 8px 12px;
    border-radius: 999px;
    border: 1px solid rgba(0, 180, 255, 0.18);
    background: rgba(0, 180, 255, 0.06);
    color: var(--accent);
    font-size: 0.8rem;
    font-weight: 700;
  }

  .message-list {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 380px;
    max-height: 520px;
    padding: 20px;
    overflow-y: auto;
  }

  .chat-neural-bg {
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0.34;
  }

  .chat-neural-bg line {
    stroke: rgba(0, 200, 255, 0.22);
    stroke-width: 1;
  }

  .chat-neural-bg line.active {
    stroke: rgba(255, 132, 72, 0.44);
    stroke-width: 1.4;
  }

  .chat-neural-bg circle {
    fill: rgba(140, 214, 255, 0.42);
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

  .message-bubble.live {
    border-style: dashed;
    border-color: rgba(0, 240, 255, 0.28);
    background:
      linear-gradient(135deg, rgba(0, 240, 255, 0.08), rgba(160, 32, 240, 0.10)),
      rgba(10, 18, 34, 0.92);
    box-shadow: 0 0 32px rgba(0, 200, 255, 0.12);
  }

  .live-phase {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
    color: #93ecff;
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .live-phase::before {
    content: "";
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: #00f0ff;
    box-shadow: 0 0 16px rgba(0, 240, 255, 0.8);
    animation: livePulse 1.1s ease-in-out infinite;
  }

  .debug-panel {
    margin-top: 10px;
    padding: 12px;
    border-radius: 12px;
    border: 1px solid rgba(0, 200, 120, 0.18);
    background: rgba(4, 18, 10, 0.88);
    color: #9ef0b8;
    font-size: 0.78rem;
    line-height: 1.55;
    overflow: auto;
    max-height: 260px;
    white-space: pre-wrap;
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

  .voice-quick-copy {
    margin: 0;
    color: var(--muted);
    line-height: 1.6;
    font-size: 0.88rem;
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

  @keyframes livePulse {
    0% { transform: scale(0.85); opacity: 0.55; }
    50% { transform: scale(1.12); opacity: 1; }
    100% { transform: scale(0.85); opacity: 0.55; }
  }

  /* Cyberpunk control deck overrides */
  .chat-card {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    border-radius: 24px;
    border: 1px solid rgba(16, 226, 255, 0.16);
    background: linear-gradient(180deg, rgba(3, 10, 20, 0.96), rgba(3, 8, 18, 0.92));
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45), 0 0 18px rgba(0, 234, 255, 0.04);
  }

  .chat-header {
    grid-column: 1 / -1;
    padding: 16px 18px;
    border-bottom: 1px solid rgba(0, 234, 255, 0.10);
    background: linear-gradient(180deg, rgba(0, 234, 255, 0.04), rgba(255, 62, 207, 0.02));
  }

  .chat-header h3 {
    font-size: 1rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .chat-header p {
    color: #90a8c8;
  }

  .debug-toggle {
    border-radius: 12px;
    border-color: rgba(0, 234, 255, 0.16);
    background: rgba(0, 234, 255, 0.05);
    color: #8eecff;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .message-list {
    grid-column: 1;
    min-height: 460px;
    max-height: 620px;
    padding: 16px 18px;
    background:
      linear-gradient(180deg, rgba(1, 7, 18, 0.82), rgba(4, 10, 22, 0.72)),
      radial-gradient(circle at top left, rgba(0, 234, 255, 0.06), transparent 40%);
  }

  .message-bubble {
    border-radius: 16px;
    backdrop-filter: blur(8px);
  }

  .message-bubble.user {
    background: linear-gradient(135deg, rgba(128, 53, 235, 0.34), rgba(39, 81, 190, 0.28));
    border-color: rgba(191, 125, 255, 0.22);
  }

  .message-bubble.assistant {
    background: linear-gradient(135deg, rgba(6, 22, 42, 0.95), rgba(9, 18, 36, 0.82));
    border-color: rgba(0, 234, 255, 0.10);
  }

  .message-role {
    color: #88f0ff;
  }

  .voice-panel {
    grid-column: 2;
    grid-row: 2;
    align-self: start;
    margin: 16px 16px 0 0;
    padding: 14px;
    border-radius: 18px;
    border: 1px solid rgba(0, 234, 255, 0.12);
    background: linear-gradient(180deg, rgba(5, 14, 28, 0.96), rgba(4, 10, 22, 0.90));
    box-shadow: inset 0 0 18px rgba(0, 234, 255, 0.04);
  }

  .voice-quick-copy {
    color: #9ac0d8;
  }

  .voice-grid {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .voice-checkbox {
    padding-top: 0;
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid rgba(0, 234, 255, 0.10);
    background: rgba(0, 234, 255, 0.04);
  }

  .voice-actions {
    flex-direction: column;
  }

  .voice-actions button {
    width: 100%;
    border-radius: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .audio-player {
    border-radius: 12px;
    opacity: 0.92;
  }

  .composer {
    grid-column: 1 / -1;
    padding: 14px 18px 18px;
    border-top: 1px solid rgba(0, 234, 255, 0.08);
    background: rgba(0, 234, 255, 0.02);
  }

  .composer textarea {
    border-radius: 14px;
    background: rgba(2, 10, 24, 0.96);
  }

  .composer button {
    min-width: 150px;
    border-radius: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  @media (max-width: 980px) {
    .chat-card {
      grid-template-columns: 1fr;
    }

    .voice-panel {
      grid-column: 1;
      grid-row: auto;
      margin: 0 16px 16px;
    }
  }
`;

function resolvePerformanceTier(profile, mode, prefersReducedMotion) {
  if (prefersReducedMotion) {
    return "light";
  }

  const tier = String(profile?.performanceTier || "").trim().toLowerCase();
  if (["light", "balanced", "full"].includes(tier)) {
    return tier;
  }

  return mode === "kids" ? "light" : "balanced";
}

export default function ChatWindow({
  personality,
  messages,
  liveDebug,
  livePhase,
  liveSeq,
  liveReply,
  activeMode,
  neuralProfile,
  isLoadingMessages,
  isSending,
  onSend,
  onSaveVoiceProfile,
  onJumpToBuilder,
  onOpenVoiceLab,
  onStatus,
}) {
  const authFetch = useAuthFetch();
  const [draft, setDraft] = useState("");
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
    piperSpeaker: null,
  });
  const [isSavingVoice, setIsSavingVoice] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [debugMode, setDebugMode] = useState(true);
  const lastGeneratedRef = useRef("");
  const lastNarrationRef = useRef("");
  const messageListRef = useRef(null);
  const shouldAutoScrollRef = useRef(true);
  const prefersReducedMotion = usePrefersReducedMotion();

  const latestAssistantMessage = useMemo(
    () => [...messages].reverse().find((message) => message.role === "assistant") || null,
    [messages],
  );

  const latestAssistantDebug = useMemo(
    () => [...messages].reverse().find((message) => message.role === "assistant" && message.debug)?.debug || null,
    [messages],
  );

  const displayDebug = liveDebug || latestAssistantDebug;
  const pendingAssistantMessage = useMemo(() => {
    if (!isSending && !liveReply) {
      return null;
    }

    return {
      role: "assistant",
      content: liveReply || "",
      debug: displayDebug,
      live: true,
      phase: livePhase,
    };
  }, [displayDebug, livePhase, liveReply]);

  const renderedMessages = useMemo(() => {
    if (!pendingAssistantMessage) {
      return messages;
    }

    return [...messages, pendingAssistantMessage];
  }, [messages, pendingAssistantMessage]);

  const performanceTier = useMemo(
    () => resolvePerformanceTier(neuralProfile, activeMode, prefersReducedMotion),
    [neuralProfile, activeMode, prefersReducedMotion],
  );

  const neuralSignal = useMemo(() => {
    const mood = displayDebug?.mood?.after || personality?.moodState || { valence: 0, arousal: 0, dominance: 0 };
    const memoryActive = ((displayDebug?.memoryInjected || []).length + (displayDebug?.userMemoryRetrieved || []).length) > 0;
    const intentActive = Boolean(displayDebug?.goal?.goal);
    const identityActive = Boolean(displayDebug?.flags?.reconditioned);

    return {
      valence: Number(mood?.valence || 0),
      arousal: Number(mood?.arousal || 0),
      memoryActive,
      intentActive,
      identityActive,
    };
  }, [displayDebug, personality?.moodState]);

  const avatarMood = useMemo(
    () => displayDebug?.mood?.after || personality?.moodState || { valence: 0, arousal: 0, dominance: 0 },
    [displayDebug, personality?.moodState],
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
      piperSpeaker: personality.voiceProfile?.piperSpeaker ?? null,
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

  useEffect(() => {
    const valence = Number(latestAssistantDebug?.mood?.after?.valence ?? personality?.moodState?.valence ?? 0);
    const canNarrate =
      activeMode === "kids" &&
      Boolean(neuralProfile?.voiceNarrationEnabled) &&
      !prefersReducedMotion &&
      !(voiceProfile.enabled && voiceProfile.autoplay) &&
      latestAssistantMessage &&
      valence > 0.35 &&
      typeof window !== "undefined" &&
      "speechSynthesis" in window;

    if (!canNarrate) {
      return;
    }

    const narrationStamp = `${personality?.id || "none"}:${latestAssistantMessage.content}:${valence.toFixed(2)}`;
    if (lastNarrationRef.current === narrationStamp) {
      return;
    }

    const utterance = new SpeechSynthesisUtterance(
      "My brain is lighting up because I'm happy about our story!",
    );
    utterance.rate = 1;
    utterance.pitch = 1.1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    lastNarrationRef.current = narrationStamp;

    return () => {
      window.speechSynthesis.cancel();
    };
  }, [
    activeMode,
    latestAssistantDebug,
    latestAssistantMessage,
    neuralProfile?.voiceNarrationEnabled,
    personality?.id,
    personality?.moodState?.valence,
    prefersReducedMotion,
    voiceProfile.autoplay,
    voiceProfile.enabled,
  ]);

  useEffect(() => {
    const messageList = messageListRef.current;
    if (!messageList) {
      return;
    }

    messageList.scrollTop = messageList.scrollHeight;
    shouldAutoScrollRef.current = true;
  }, [personality?.id]);

  useEffect(() => {
    const messageList = messageListRef.current;
    if (!messageList || !shouldAutoScrollRef.current) {
      return;
    }

    messageList.scrollTop = messageList.scrollHeight;
  }, [renderedMessages, liveReply, liveSeq]);

  function handleMessageListScroll(event) {
    const target = event.currentTarget;
    const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 48;
  }

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
        const audioElement = document.getElementById("voxis-audio-player");
        if (audioElement instanceof HTMLAudioElement) {
          void audioElement.play().catch(() => {});
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
        piperSpeaker: voiceProfile.piperSpeaker,
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
          <NeuralCore
            personality={personality}
            mode={activeMode || "scientist"}
            latestDebug={displayDebug}
            livePhase={livePhase}
            liveSeq={liveSeq}
            performanceTier={performanceTier}
            voiceNarrationEnabled={Boolean(neuralProfile?.voiceNarrationEnabled)}
          />
          <div className="chat-header">
            <div className="chat-header-top">
              <h3>
                <span className="header-avatar-wrap">
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
                  <AvatarCore
                    size="compact"
                    valence={avatarMood.valence}
                    arousal={avatarMood.arousal}
                    phase={livePhase}
                    speaking={Boolean(liveReply)}
                    mode={activeMode || "scientist"}
                    personalitySeed={`${personality.id}:${personality.name}:${personality.creativeContext || "default"}`}
                    expressionProfile={personality.expressionProfile}
                    expressionPreset={personality.expressionProfile?.preset || "auto"}
                  />
                  <span>{personality.name}</span>
                </span>
              </h3>
              <button type="button" className="debug-toggle" onClick={() => setDebugMode((value) => !value)}>
                {debugMode ? "Hide Debug" : "Show Debug"}
              </button>
            </div>
            <p>{personality.description}</p>
          </div>

          <div className="voice-panel">
            <p className="voice-quick-copy">
              Quick play and autoplay stay in chat. Open Voice Lab for full TTS tuning.
            </p>

            <div className="voice-grid">
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
                {isGeneratingAudio ? "Generating Audio..." : "Play Latest Reply"}
              </button>
              <button type="button" className="secondary" onClick={stopSpeaking}>
                Stop Audio
              </button>
              <button type="button" className="secondary" onClick={handleSaveVoiceProfile}>
                {isSavingVoice ? "Saving..." : "Save Quick Voice"}
              </button>
              <button type="button" className="secondary" onClick={onOpenVoiceLab}>
                Open Voice Lab
              </button>
            </div>

            {audioUrl ? <audio id="voxis-audio-player" className="audio-player" controls src={audioUrl} /> : null}
          </div>

          <div className="message-list" ref={messageListRef} onScroll={handleMessageListScroll}>
            {performanceTier !== "light" ? (
              <svg className="chat-neural-bg" viewBox="0 0 100 100" preserveAspectRatio="none">
                <line x1="48" y1="40" x2="24" y2="20" className={neuralSignal.memoryActive ? "active" : ""} />
                <line x1="48" y1="40" x2="78" y2="24" className={neuralSignal.intentActive ? "active" : ""} />
                <line x1="48" y1="40" x2="72" y2="72" className={neuralSignal.identityActive ? "active" : ""} />
                <line x1="48" y1="40" x2="22" y2="70" className={Math.abs(neuralSignal.valence) > 0.2 ? "active" : ""} />

                <circle cx="48" cy="40" r={2.4 + Math.abs(neuralSignal.arousal) * (performanceTier === "full" ? 2.2 : 1.5)} />
                <circle cx="24" cy="20" r="1.6" />
                <circle cx="78" cy="24" r="1.7" />
                <circle cx="72" cy="72" r="1.5" />
                <circle cx="22" cy="70" r="1.5" />
              </svg>
            ) : null}

            {isLoadingMessages ? (
              <div className="empty-chat">Loading persisted conversation history...</div>
            ) : renderedMessages.length ? (
              <>
                {renderedMessages.map((message, index) => (
                  <div key={`${message.role}-${index}`} className={`message-bubble ${message.role}${message.live ? " live" : ""}`}>
                    <span className="message-role">
                      {message.role === "assistant" ? personality.name : "You"}
                    </span>
                    {message.live ? (
                      <>
                        <span className="live-phase">{message.phase || "processing"}</span>
                        {message.content || "Thinking..."}
                      </>
                    ) : (
                      message.content
                    )}
                    {debugMode && message.role === "assistant" && message.debug ? (
                      <pre className="debug-panel">{JSON.stringify(message.debug, null, 2)}</pre>
                    ) : null}
                  </div>
                ))}
              </>
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
