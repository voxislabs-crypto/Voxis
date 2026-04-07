import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

  .assistant-normal-main {
    white-space: pre-wrap;
  }

  .assistant-next-questions {
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px dashed rgba(0, 180, 255, 0.2);
    color: rgba(188, 220, 245, 0.84);
    font-size: 0.8rem;
    line-height: 1.5;
  }

  .assistant-next-questions strong {
    display: block;
    margin-bottom: 3px;
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(123, 223, 255, 0.86);
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

  /* ── Quick Voice Panel ─────────────────────────────────────── */
  .voice-panel {
    padding: 14px 20px 0;
    border-top: 1px solid rgba(0, 180, 255, 0.07);
    background: rgba(0, 20, 46, 0.28);
  }

  .voice-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 12px;
  }

  .voice-panel-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.67rem;
    font-weight: 800;
    letter-spacing: 0.17em;
    text-transform: uppercase;
    color: rgba(0, 200, 255, 0.50);
    font-family: "JetBrains Mono", "Courier New", monospace;
  }

  .voice-panel-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 6px var(--accent);
    animation: vcp-blink 1.6s ease-in-out infinite;
  }

  @keyframes vcp-blink {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.2; }
  }

  .voice-open-lab {
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid rgba(0, 180, 255, 0.22);
    background: rgba(0, 180, 255, 0.06);
    color: var(--accent);
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background 150ms ease, box-shadow 150ms ease;
  }

  .voice-open-lab:hover {
    background: rgba(0, 180, 255, 0.12);
    box-shadow: 0 0 10px rgba(0, 200, 255, 0.14);
  }

  .voice-toggles {
    display: flex;
    flex-wrap: wrap;
    gap: 18px;
    margin-bottom: 12px;
  }

  .voice-toggle {
    display: flex;
    align-items: center;
    gap: 9px;
    cursor: pointer;
    user-select: none;
  }

  .voice-toggle input[type="checkbox"] {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .voice-toggle-track {
    position: relative;
    flex-shrink: 0;
    width: 34px;
    height: 19px;
    border-radius: 10px;
    background: rgba(0, 180, 255, 0.09);
    border: 1px solid rgba(0, 180, 255, 0.18);
    transition: background 200ms ease, border-color 200ms ease, box-shadow 200ms ease;
  }

  .voice-toggle-track::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 13px;
    height: 13px;
    border-radius: 50%;
    background: rgba(0, 180, 255, 0.30);
    transition: transform 200ms ease, background 200ms ease, box-shadow 200ms ease;
  }

  .voice-toggle input:checked + .voice-toggle-track {
    background: rgba(0, 200, 255, 0.16);
    border-color: rgba(0, 200, 255, 0.50);
    box-shadow: 0 0 8px rgba(0, 200, 255, 0.20);
  }

  .voice-toggle input:checked + .voice-toggle-track::after {
    transform: translateX(15px);
    background: var(--accent);
    box-shadow: 0 0 7px rgba(0, 200, 255, 0.75);
  }

  .voice-toggle-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--muted);
  }

  .voice-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 9px;
    padding-bottom: 14px;
  }

  .voice-btn {
    padding: 9px 15px;
    border: none;
    border-radius: 9px;
    background: linear-gradient(135deg, var(--accent), var(--accent-deep));
    color: #fff;
    font-weight: 800;
    font-size: 0.8rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    box-shadow: 0 3px 12px rgba(0, 160, 255, 0.24);
    cursor: pointer;
    transition: box-shadow 160ms ease, transform 100ms ease;
  }

  .voice-btn:hover {
    box-shadow: 0 5px 18px rgba(0, 160, 255, 0.38);
    transform: translateY(-1px);
  }

  .voice-btn:active { transform: translateY(0); }

  .voice-btn.sec {
    background: rgba(0, 180, 255, 0.06);
    border: 1px solid rgba(0, 180, 255, 0.20);
    color: var(--accent);
    box-shadow: none;
  }

  .voice-btn.sec:hover {
    background: rgba(0, 180, 255, 0.10);
    box-shadow: 0 0 10px rgba(0, 200, 255, 0.12);
  }

  .voice-btn:disabled {
    opacity: 0.40;
    cursor: not-allowed;
    transform: none !important;
    box-shadow: none !important;
  }

  .audio-player {
    width: 100%;
    margin-top: 10px;
    margin-bottom: 2px;
    border-radius: 8px;
    accent-color: var(--accent);
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

    .voice-toggles {
      flex-direction: column;
      gap: 12px;
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
    grid-template-columns: 190px minmax(0, 1fr) 280px;
    border-radius: 24px;
    border: 1px solid rgba(16, 226, 255, 0.16);
    background: linear-gradient(180deg, rgba(3, 10, 20, 0.96), rgba(3, 8, 18, 0.92));
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45), 0 0 18px rgba(0, 234, 255, 0.04);
  }

  /* ── Ambient Avatar Panel ───────────────────────────────────── */
  .avatar-panel {
    grid-column: 1;
    grid-row: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 0;
    padding: 22px 12px 18px;
    border-right: 1px solid rgba(0, 234, 255, 0.08);
    background: linear-gradient(180deg,
      rgba(0, 234, 255, 0.03) 0%,
      rgba(180, 60, 248, 0.03) 60%,
      rgba(3, 8, 18, 0.0) 100%);
    position: relative;
    overflow: hidden;
  }

  .avatar-panel::before {
    content: "";
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(0, 234, 255, 0.18), transparent);
  }

  .avatar-panel-orb {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 110px;
    height: 110px;
    flex-shrink: 0;
  }

  .avatar-panel-orb .avatar-core {
    --size: 96px !important;
  }

  .avatar-panel-name {
    margin-top: 14px;
    font-size: 0.82rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #c8f0ff;
    text-align: center;
  }

  .avatar-panel-mood {
    margin-top: 5px;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.10em;
    text-transform: uppercase;
    color: rgba(0, 234, 255, 0.52);
    text-align: center;
  }

  .avatar-panel-divider {
    width: 48px;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(0, 234, 255, 0.22), transparent);
    margin: 16px 0 12px;
    flex-shrink: 0;
  }

  .avatar-panel-stats {
    display: flex;
    flex-direction: column;
    gap: 7px;
    width: 100%;
    padding: 0 4px;
  }

  .avatar-panel-stat {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .avatar-panel-stat-label {
    font-size: 0.60rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(0, 200, 255, 0.38);
  }

  .avatar-panel-bar-track {
    height: 3px;
    border-radius: 999px;
    background: rgba(0, 200, 255, 0.08);
    overflow: hidden;
  }

  .avatar-panel-bar-fill {
    height: 100%;
    border-radius: 999px;
    transition: width 600ms ease;
  }

  .avatar-panel-phase {
    margin-top: auto;
    padding-top: 14px;
    width: 100%;
    text-align: center;
  }

  .avatar-panel-phase-badge {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid rgba(0, 234, 255, 0.14);
    background: rgba(0, 234, 255, 0.05);
    font-size: 0.62rem;
    font-weight: 800;
    letter-spacing: 0.10em;
    text-transform: uppercase;
    color: rgba(0, 234, 255, 0.55);
    transition: color 300ms, border-color 300ms, background 300ms;
  }

  .avatar-panel-phase-badge.active {
    color: #00eaff;
    border-color: rgba(0, 234, 255, 0.38);
    background: rgba(0, 234, 255, 0.10);
    box-shadow: 0 0 12px rgba(0, 234, 255, 0.18);
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
    grid-column: 2;
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
    grid-column: 3;
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

  /* ── Neural activity sync — chat-card glow + avatar tilt ───── */
  @keyframes neuralCardPulse {
    0%, 100% { box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45), 0 0 18px rgba(0, 234, 255, 0.04); }
    50% { box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45), 0 0 32px rgba(0, 234, 255, 0.22), 0 0 0 1px rgba(0, 234, 255, 0.14); }
  }

  @keyframes avatarTiltThink {
    0%, 100% { transform: rotate(-2deg) scale(1.0); }
    50% { transform: rotate(2deg) scale(1.02); }
  }

  .chat-card.neural-active {
    animation: neuralCardPulse 1.4s ease-in-out infinite;
    border-color: rgba(0, 234, 255, 0.26);
  }

  .avatar-panel-orb.thinking-tilt {
    animation: avatarTiltThink 1.6s ease-in-out infinite;
  }

  @media (max-width: 980px) {
    .chat-card {
      grid-template-columns: 1fr;
    }

    .avatar-panel {
      display: none;
    }

    .message-list {
      grid-column: 1;
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

function formatAssistantContentForMode(content, mode) {
  const text = String(content || "");
  if (mode !== "normal" || !text.trim()) {
    return { main: text, nextQuestions: "" };
  }

  let main = text
    .replace(/^\s*(?:1\)\s*)?Answer\s*:?\s*\n?/i, "")
    .trim();

  main = main
    .replace(/\n?\s*2\)\s*Evidence\s*[\s\S]*?(?=\n\s*3\)\s*Uncertainty|\n\s*4\)\s*Next Questions|$)/i, "")
    .replace(/\n?\s*3\)\s*Uncertainty\s*[\s\S]*?(?=\n\s*4\)\s*Next Questions|$)/i, "")
    .trim();

  const nextQuestionsMatch = main.match(/\n\s*4\)\s*Next Questions\s*\n([\s\S]*)$/i);
  if (!nextQuestionsMatch) {
    return { main, nextQuestions: "" };
  }

  const nextQuestions = String(nextQuestionsMatch[1] || "").trim();
  const nextQuestionsStart = Number(nextQuestionsMatch.index || 0);
  return {
    main: main.slice(0, nextQuestionsStart).trim(),
    nextQuestions,
  };
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
  onOpenPersonaEditor,
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
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [speechEnergy, setSpeechEnergy] = useState(0);
  const [debugMode, setDebugMode] = useState(true);
  const lastGeneratedRef = useRef("");
  const lastNarrationRef = useRef("");
  const messageListRef = useRef(null);
  const audioRef = useRef(null);
  const speechEnergyTimerRef = useRef(null);
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

  // ── Neural activity: combines real brain heartbeat + phase signals ───────
  const [brainActivity, setBrainActivity] = useState(0);
  const prevActivityRef = useRef(0);
  const [activitySpike, setActivitySpike] = useState(false);
  const spikeTimerRef = useRef(null);

  const handleBrainActivity = useCallback((activity) => {
    setBrainActivity(activity);
  }, []);

  const neuralActivity = useMemo(() => {
    const arousalBase = Math.min(0.4, Math.abs(neuralSignal.arousal) * 0.4);
    const phaseBoost = ["intent", "generation", "reply", "memory", "memory-write", "user-memory-write", "prompt", "token"].includes(livePhase) ? 0.55 : 0;
    const memBoost = neuralSignal.memoryActive ? 0.2 : 0;
    const intentBoost = neuralSignal.intentActive ? 0.18 : 0;
    return Math.min(1, Math.max(brainActivity, arousalBase + phaseBoost + memBoost + intentBoost));
  }, [brainActivity, livePhase, neuralSignal]);

  // Spike detection — fires a 400ms flash when activity jumps sharply
  useEffect(() => {
    const delta = neuralActivity - prevActivityRef.current;
    prevActivityRef.current = neuralActivity;
    if (delta > 0.25) {
      setActivitySpike(true);
      if (spikeTimerRef.current) clearTimeout(spikeTimerRef.current);
      spikeTimerRef.current = window.setTimeout(() => setActivitySpike(false), 400);
    }
    return () => { if (spikeTimerRef.current) clearTimeout(spikeTimerRef.current); };
  }, [neuralActivity]);

  // Pre-response micro-animation state — fires just before text appears
  const [preResponseState, setPreResponseState] = useState(null);
  const preResponseTimerRef = useRef(null);
  useEffect(() => {
    if (livePhase === "intent" || livePhase === "generation") {
      setPreResponseState("thinking");
      if (preResponseTimerRef.current) clearTimeout(preResponseTimerRef.current);
      preResponseTimerRef.current = window.setTimeout(() => setPreResponseState(null), 400);
    }
    return () => { if (preResponseTimerRef.current) clearTimeout(preResponseTimerRef.current); };
  }, [livePhase]);

  // Mood CSS variables — whole UI breathes with personality emotion
  useEffect(() => {
    const arousal = Number(avatarMood.arousal || 0);
    const valence = Number(avatarMood.valence || 0);
    document.documentElement.style.setProperty("--mood-glow", `${(0.2 + Math.abs(arousal) * 0.5).toFixed(3)}`);
    document.documentElement.style.setProperty("--mood-hue", `${Math.round(180 + valence * 60)}`);
    document.documentElement.style.setProperty("--mood-valence", valence.toFixed(3));
  }, [avatarMood.arousal, avatarMood.valence]);

  // Reply pulse — micro-trigger on new messages arriving
  useEffect(() => {
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last?.role === "assistant") {
      setActivitySpike(true);
      if (spikeTimerRef.current) clearTimeout(spikeTimerRef.current);
      spikeTimerRef.current = window.setTimeout(() => setActivitySpike(false), 400);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

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
      if (speechEnergyTimerRef.current) {
        window.clearInterval(speechEnergyTimerRef.current);
        speechEnergyTimerRef.current = null;
      }

      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  useEffect(() => {
    if (speechEnergyTimerRef.current) {
      window.clearInterval(speechEnergyTimerRef.current);
      speechEnergyTimerRef.current = null;
    }

    if (!isAudioPlaying) {
      setSpeechEnergy(0);
      return;
    }

    speechEnergyTimerRef.current = window.setInterval(() => {
      const audioElement = audioRef.current;
      if (!(audioElement instanceof HTMLAudioElement)) {
        setSpeechEnergy(0);
        return;
      }

      const t = Number(audioElement.currentTime || 0);
      const pulseA = Math.abs(Math.sin(t * 17.5));
      const pulseB = Math.abs(Math.sin(t * 39.2 + 0.85));
      const pulseC = Math.abs(Math.sin(t * 6.8 + 0.23));
      const combined = 0.2 + pulseA * 0.45 + pulseB * 0.25 + pulseC * 0.1;
      setSpeechEnergy(Math.min(1, combined));
    }, 42);

    return () => {
      if (speechEnergyTimerRef.current) {
        window.clearInterval(speechEnergyTimerRef.current);
        speechEnergyTimerRef.current = null;
      }
    };
  }, [isAudioPlaying]);

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
    const audioElement = audioRef.current;
    if (audioElement instanceof HTMLAudioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
    }

    setIsAudioPlaying(false);
    setSpeechEnergy(0);
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
        const audioElement = audioRef.current;
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

  async function handleNeuralMemoryUpdate({ memoryId, content, memoryType }) {
    if (!memoryId) {
      onStatus?.({ type: "error", message: "Memory id is missing for inline edit." });
      return;
    }

    const response = await authFetch(`/memory/${memoryId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
        memoryType,
      }),
    });

    if (!response.ok) {
      onStatus?.({ type: "error", message: "Failed to update memory." });
      return;
    }

    onStatus?.({ type: "success", message: "Memory updated." });
  }

  function handleOpenEditorTarget(target) {
    onOpenPersonaEditor?.(target);
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

  const avatarSpeaking = Boolean(liveReply) || isAudioPlaying;

  return (
    <>
      <style>{chatStyles}</style>
      <div className="chat-shell">
        <div className={`chat-card${neuralActivity > 0.4 ? " neural-active" : ""}`}>
          <NeuralCore
            personality={personality}
            mode={activeMode || "scientist"}
            latestDebug={displayDebug}
            livePhase={livePhase}
            liveSeq={liveSeq}
            performanceTier={performanceTier}
            voiceNarrationEnabled={Boolean(neuralProfile?.voiceNarrationEnabled)}
            onActivityUpdate={handleBrainActivity}
            onUpdateMemory={handleNeuralMemoryUpdate}
            onOpenPersonaEditor={handleOpenEditorTarget}
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
                    speaking={avatarSpeaking}
                    mode={activeMode || "scientist"}
                    personalitySeed={`${personality.id}:${personality.name}:${personality.creativeContext || "default"}`}
                    expressionProfile={personality.expressionProfile}
                    expressionPreset={personality.expressionProfile?.preset || "auto"}
                    neuralActivity={neuralActivity}
                    activitySpike={activitySpike}
                    preResponseState={preResponseState}
                    speechEnergy={speechEnergy}
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
            <div className="voice-panel-header">
              <div className="voice-panel-label">
                <span className="voice-panel-dot" />
                QUICK VOICE
              </div>
              <button type="button" className="voice-open-lab" onClick={onOpenVoiceLab}>
                ⚗ Full Voice Lab
              </button>
            </div>

            <div className="voice-toggles">
              <label className="voice-toggle">
                <input
                  type="checkbox"
                  checked={voiceProfile.enabled}
                  onChange={(event) => updateVoiceField("enabled", event.target.checked)}
                />
                <span className="voice-toggle-track" />
                <span className="voice-toggle-label">Voice playback</span>
              </label>
              <label className="voice-toggle">
                <input
                  type="checkbox"
                  checked={voiceProfile.autoplay}
                  onChange={(event) => updateVoiceField("autoplay", event.target.checked)}
                />
                <span className="voice-toggle-track" />
                <span className="voice-toggle-label">Auto-play replies</span>
              </label>
            </div>

            <div className="voice-actions">
              <button
                type="button"
                className="voice-btn"
                onClick={() => void generateAudio(latestAssistantMessage?.content || "")}
                disabled={isGeneratingAudio || !latestAssistantMessage}
              >
                {isGeneratingAudio ? "Generating…" : "▶ Play Latest Reply"}
              </button>
              <button type="button" className="voice-btn sec" onClick={stopSpeaking}>
                ■ Stop
              </button>
              <button type="button" className="voice-btn sec" onClick={handleSaveVoiceProfile}>
                {isSavingVoice ? "Saving…" : "✦ Save Quick Voice"}
              </button>
            </div>

            {audioUrl ? (
              <audio
                id="voxis-audio-player"
                ref={audioRef}
                className="audio-player"
                controls
                src={audioUrl}
                onPlay={() => setIsAudioPlaying(true)}
                onPause={() => setIsAudioPlaying(false)}
                onEnded={() => setIsAudioPlaying(false)}
              />
            ) : null}
          </div>

          {/* ── Ambient Avatar Panel ──────────────────────────────── */}
          <div className="avatar-panel">
            <div className={`avatar-panel-orb${neuralActivity > 0.45 ? " thinking-tilt" : ""}`}>
              <AvatarCore
                size="large"
                valence={avatarMood.valence}
                arousal={avatarMood.arousal}
                phase={livePhase}
                speaking={avatarSpeaking}
                mode={activeMode || "scientist"}
                personalitySeed={`${personality.id}:${personality.name}:${personality.creativeContext || "default"}`}
                expressionProfile={personality.expressionProfile}
                expressionPreset={personality.expressionProfile?.preset || "auto"}
                neuralActivity={neuralActivity}
                activitySpike={activitySpike}
                preResponseState={preResponseState}
                speechEnergy={speechEnergy}
              />
            </div>
            <div className="avatar-panel-name">{personality.name}</div>
            <div className="avatar-panel-mood">
              {avatarMood.valence > 0.15
                ? "Positive"
                : avatarMood.valence < -0.15
                ? "Negative"
                : "Neutral"}
            </div>
            <div className="avatar-panel-divider" />
            <div className="avatar-panel-stats">
              <div className="avatar-panel-stat">
                <div className="avatar-panel-stat-label">Valence</div>
                <div className="avatar-panel-bar-track">
                  <div
                    className="avatar-panel-bar-fill"
                    style={{
                      width: `${Math.round((Number(avatarMood.valence || 0) + 1) / 2 * 100)}%`,
                      background: "linear-gradient(90deg, #00d4ff, #4ade80)",
                    }}
                  />
                </div>
              </div>
              <div className="avatar-panel-stat">
                <div className="avatar-panel-stat-label">Arousal</div>
                <div className="avatar-panel-bar-track">
                  <div
                    className="avatar-panel-bar-fill"
                    style={{
                      width: `${Math.round(Math.abs(Number(avatarMood.arousal || 0)) * 100)}%`,
                      background: "linear-gradient(90deg, #9b59ff, #ff2d78)",
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="avatar-panel-phase">
              <span className={`avatar-panel-phase-badge${livePhase ? " active" : ""}`}>
                {livePhase || "idle"}
              </span>
            </div>
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
                    ) : message.role === "assistant" ? (
                      (() => {
                        const formatted = formatAssistantContentForMode(message.content, activeMode);
                        return (
                          <>
                            <div className="assistant-normal-main">{formatted.main}</div>
                            {formatted.nextQuestions ? (
                              <div className="assistant-next-questions">
                                <strong>Next Questions</strong>
                                {formatted.nextQuestions}
                              </div>
                            ) : null}
                          </>
                        );
                      })()
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
