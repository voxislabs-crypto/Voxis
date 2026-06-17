import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import { useAuthFetch } from "../hooks/useAuthFetch.js";
import { getApiErrorMessage, readApiResponsePayload } from "../lib/apiResponse.js";
import { buildTtsCacheKey, getTtsCache, setTtsCache } from "../utils/ttsCache.js";
import NeuralCore from "./NeuralCore.jsx";
import AvatarCore from "./AvatarCore.jsx";
import PerformancePlayer from "./PerformancePlayer.jsx";
import usePrefersReducedMotion from "../hooks/usePrefersReducedMotion.js";
import { interpretEmotionSpectrum } from "../lib/emotionSpectrum.js";

const TTS_DEBUG_PROVIDER_LOCK = String(import.meta.env.VITE_TTS_DEBUG_PROVIDER_LOCK ?? "true").trim().toLowerCase() !== "false";
const TTS_DISABLE_KOKORO = String(import.meta.env.VITE_TTS_DISABLE_KOKORO ?? "false").trim().toLowerCase() === "true";
const DEFAULT_DISABLE_NEURONMAP_3D = String(import.meta.env.VITE_DISABLE_NEURONMAP_3D ?? "true").trim().toLowerCase() !== "false";
const VOICE_CAPTURE_RESTART_DELAY_MS = 220;
const VOICE_CAPTURE_SILENCE_MIN_MS = 3_000;
const VOICE_CAPTURE_SILENCE_MAX_MS = 7_000;
const VOICE_CAPTURE_SILENCE_TIMEOUT_MS = Math.max(
  VOICE_CAPTURE_SILENCE_MIN_MS,
  Math.min(
    VOICE_CAPTURE_SILENCE_MAX_MS,
    Number(import.meta.env.VITE_VOICE_CAPTURE_SILENCE_TIMEOUT_MS ?? 5_000) || 5_000,
  ),
);
const CUSTOM_CARTESIA_VOICE_OPTION = "__custom_cartesia_voice__";
const CUSTOM_ELEVENLABS_VOICE_OPTION = "__custom_elevenlabs_voice__";
const CUSTOM_ELEVENLABS_MODEL_OPTION = "__custom_elevenlabs_model__";
const CARTESIA_QUICK_VOICE_OPTIONS = [
  { id: "a0e99841-438c-4a64-b679-ae501e7d6091", label: "Sonic default" },
  { id: "694f9389-aac1-45b6-b726-9d9369183238", label: "Warm Narrator" },
  { id: "2ee87190-8f84-4925-97da-e52547f9462c", label: "Balanced Voice" },
];
const ELEVENLABS_QUICK_VOICE_OPTIONS = [
  { id: "21m00Tcm4TlvDq8ikWAM", label: "Rachel (default)" },
  { id: "EXAVITQu4vr4xnSDxMaL", label: "Bella" },
  { id: "TxGEqnHWrfWFTfGW9XjX", label: "Josh" },
  { id: "VR6AewLTigWG4xSOukaG", label: "Arnold" },
  { id: "ErXwobaYiN019PkySvjV", label: "Antoni" },
];
const ELEVENLABS_QUICK_MODEL_OPTIONS = [
  { id: "eleven_multilingual_v2", label: "Multilingual v2 (default)" },
];

function normalizeVoiceEngineForDebug(engine) {
  const normalized = String(engine || "auto").trim().toLowerCase();
  if (!TTS_DEBUG_PROVIDER_LOCK) {
    if (TTS_DISABLE_KOKORO && normalized === "kokoro") {
      return "auto";
    }
    return normalized || "auto";
  }

  if (TTS_DISABLE_KOKORO) {
    return ["auto", "cartesia"].includes(normalized) ? normalized : "auto";
  }

  return ["auto", "kokoro", "cartesia"].includes(normalized) ? normalized : "auto";
}

// Lightweight EPF detection — mirrors backend isPerformanceOutput
function isEPF(text) {
  const raw = String(text || "");
  return /\[\[[A-Za-z]+\d+\]\]/.test(raw) && (/^\[:\]/m.test(raw) || /^\[\d+(?:\.\d+)?:\]\s+[^\n]+/m.test(raw));
}

function stripInlineMetadataTokens(text) {
  const source = String(text || "");
  const metadataPattern = /\b(?:mosic|music|bpm|duration_secs|good_crop)\s*:\s*-?\d+(?:\.\d+)?/gi;
  const first = metadataPattern.exec(source);
  if (!first) {
    return source.trim();
  }
  return source.slice(0, first.index).trim();
}

function extractEPFDialogue(text) {
  const dialogueLines = String(text || "")
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => {
      // Plain continuation line: [:]
      if (line.startsWith("[:]") && line.length > 3) return true;
      // Timestamp line with trailing text: [12.0:] Spoken lyric here
      // Long trailing text (> 200 chars) is audio-direction prose — skip it.
      const tm = line.match(/^\[[\d.]+:\]\s+(.+)/);
      return tm && tm[1].length < 200;
    })
    .map((line) => stripInlineMetadataTokens(line.replace(/^\[(?::|[\d.]+):\]\s*/, "")))
    .filter(Boolean);

  return dialogueLines.join("\n");
}

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
    box-shadow: 0 0 10px var(--mood-dot-glow, rgba(0, 234, 255, 0.45));
  }

  .chat-header p {
    margin: 0;
    color: var(--muted);
    font-size: 0.88rem;
    line-height: 1.6;
  }

  .mood-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid rgba(0, 180, 255, 0.07);
  }

  .mood-zone-badge {
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    flex-shrink: 0;
  }

  .mood-emotion-label {
    font-size: 0.72rem;
    color: rgba(190, 230, 255, 0.75);
    flex-shrink: 0;
  }

  .mood-vad-pair {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }

  .mood-vad-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
  }

  .mood-vad-label {
    font-size: 0.52rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(0, 180, 255, 0.45);
  }

  .mood-vad-value {
    font-size: 0.7rem;
    font-weight: 800;
    color: rgba(200, 240, 255, 0.9);
    font-family: monospace;
    min-width: 3ch;
    text-align: center;
  }

  .mood-drift-svg {
    flex: 1;
    min-width: 48px;
    max-width: 120px;
    height: 18px;
    opacity: 0.75;
  }

  .sys-observer {
    border-bottom: 1px solid rgba(0, 180, 255, 0.07);
    background: rgba(3, 10, 22, 0.92);
  }

  .sys-observer-inner {
    padding: 14px 20px 16px;
  }

  .sys-observer-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 10px;
  }

  .sys-observer-card {
    background: rgba(0, 180, 255, 0.04);
    border: 1px solid rgba(0, 180, 255, 0.1);
    border-radius: 10px;
    padding: 8px 10px;
  }

  .sys-observer-card-title {
    font-size: 0.56rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(0, 180, 255, 0.5);
    margin-bottom: 6px;
    font-weight: 700;
  }

  .sys-observer-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 6px;
    margin-bottom: 3px;
  }

  .sys-observer-label {
    font-size: 0.62rem;
    color: rgba(180, 220, 245, 0.5);
    flex-shrink: 0;
  }

  .sys-observer-value {
    font-size: 0.66rem;
    font-family: monospace;
    color: rgba(200, 240, 255, 0.85);
    text-align: right;
    word-break: break-all;
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sys-observer-status {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.62rem;
    font-weight: 700;
  }

  .sys-observer-status::before {
    content: "";
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.8;
  }

  .sys-observer-status.ok { color: #34d399; }
  .sys-observer-status.warn { color: #fbbf24; }
  .sys-observer-status.off { color: rgba(180, 180, 180, 0.5); }

  .sys-observer-bar-wrap {
    margin-top: 5px;
  }

  .sys-observer-bar-track {
    height: 4px;
    border-radius: 999px;
    background: rgba(0, 180, 255, 0.1);
    overflow: hidden;
  }

  .sys-observer-bar-fill {
    height: 100%;
    border-radius: 999px;
    transition: width 400ms ease;
  }

  .sys-observer-bar-label {
    font-size: 0.56rem;
    color: rgba(160, 210, 240, 0.45);
    margin-top: 2px;
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
    max-width: 100%;
    padding: 13px 16px;
    border-radius: 18px;
    line-height: 1.7;
    white-space: pre-wrap;
    font-size: 0.95rem;
  }

  .message-bubble.user {
    align-self: flex-end;
    max-width: min(85%, 720px);
    background: linear-gradient(135deg, rgba(0, 160, 255, 0.22), rgba(0, 80, 220, 0.20));
    border: 1px solid rgba(0, 180, 255, 0.24);
    color: var(--text);
    border-bottom-right-radius: 6px;
  }

  .message-bubble.assistant {
    align-self: stretch;
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
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
  .debug-summary {
    margin-top: 10px;
    padding: 12px;
    border-radius: 12px;
    border: 1px solid rgba(0, 180, 255, 0.18);
    background: rgba(2, 16, 28, 0.88);
    color: #b6ecff;
  }

  .debug-summary-title {
    display: block;
    margin-bottom: 6px;
    color: #7fdfff;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .debug-summary-body {
    margin: 0;
    font-size: 0.82rem;
    line-height: 1.6;
  }

  .debug-summary-meta {
    margin-top: 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .debug-summary-chip {
    padding: 3px 8px;
    border-radius: 999px;
    border: 1px solid rgba(0, 180, 255, 0.16);
    background: rgba(0, 180, 255, 0.08);
    color: #8ddfff;
    font-size: 0.72rem;
    font-weight: 700;
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

  .composer.dragging {
    border-color: rgba(0, 180, 255, 0.4);
    background: rgba(0, 180, 255, 0.08);
  }

  .composer-input-wrap {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .composer textarea {
    width: 100%;
    min-height: 88px;
    padding: 13px 16px;
    padding-right: 100px;
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

  .composer-actions {
    position: absolute;
    right: 12px;
    top: 12px;
    display: flex;
    gap: 8px;
  }

  .composer-icon-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(0, 180, 255, 0.2);
    border-radius: 8px;
    background: rgba(0, 180, 255, 0.06);
    color: var(--accent);
    cursor: pointer;
    transition: background 150ms, border-color 150ms, transform 100ms;
  }

  .composer-icon-btn:hover {
    background: rgba(0, 180, 255, 0.12);
    border-color: rgba(0, 180, 255, 0.4);
    transform: translateY(-1px);
  }

  .composer-icon-btn.recording {
    background: rgba(255, 96, 96, 0.2);
    border-color: rgba(255, 96, 96, 0.5);
    color: #ff6060;
    animation: recordingPulse 1.5s ease-in-out infinite;
  }

  @keyframes recordingPulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(255, 96, 96, 0.4); }
    50% { box-shadow: 0 0 0 8px rgba(255, 96, 96, 0); }
  }

  .composer-icon-btn svg {
    width: 18px;
    height: 18px;
  }

  .composer-file-preview {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 8px;
    background: rgba(0, 180, 255, 0.06);
    border: 1px solid rgba(0, 180, 255, 0.2);
    font-size: 0.8rem;
    color: var(--text);
  }

  .composer-file-preview-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .composer-file-preview-remove {
    padding: 4px 8px;
    border: none;
    border-radius: 4px;
    background: rgba(255, 96, 96, 0.15);
    color: #ff6060;
    font-size: 0.7rem;
    font-weight: 700;
    cursor: pointer;
    transition: background 150ms;
  }

  .composer-file-preview-remove:hover {
    background: rgba(255, 96, 96, 0.25);
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

  .voice-provider-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 4px 9px;
    border-radius: 999px;
    border: 1px solid rgba(0, 180, 255, 0.2);
    background: rgba(0, 180, 255, 0.06);
    color: rgba(140, 224, 255, 0.9);
    font-size: 0.63rem;
    font-weight: 800;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .voice-provider-badge.pending {
    border-color: rgba(255, 210, 120, 0.35);
    background: rgba(255, 190, 60, 0.12);
    color: rgba(255, 222, 152, 0.95);
  }

  .voice-provider-badge.ok {
    border-color: rgba(62, 216, 164, 0.42);
    background: rgba(22, 190, 132, 0.16);
    color: rgba(144, 244, 210, 0.95);
  }

  .voice-provider-badge.alert {
    border-color: rgba(255, 115, 115, 0.55);
    background: rgba(255, 96, 96, 0.16);
    color: rgba(255, 188, 188, 0.98);
    box-shadow: 0 0 12px rgba(255, 96, 96, 0.2);
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

  .voice-telemetry {
    margin-top: -4px;
    margin-bottom: 12px;
    font-size: 0.66rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(168, 224, 255, 0.8);
    line-height: 1.45;
  }

  @keyframes personality-event-fadein {
    from { opacity: 0; transform: translateY(6px) scale(0.96); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  .personality-events {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }

  .personality-event-chip {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 5px 10px 5px 9px;
    border-radius: 20px;
    border: 1px solid rgba(255, 200, 80, 0.3);
    background: rgba(255, 175, 40, 0.08);
    color: rgba(255, 215, 100, 0.9);
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    animation: personality-event-fadein 220ms ease forwards;
    box-shadow: 0 0 10px rgba(255, 200, 60, 0.10);
    max-width: 100%;
  }

  .personality-event-chip.catchphrase {
    border-color: rgba(255, 200, 80, 0.34);
    background: rgba(255, 175, 40, 0.1);
  }

  .personality-event-chip.voice-tag {
    border-color: rgba(90, 210, 255, 0.34);
    background: rgba(50, 180, 255, 0.1);
    color: rgba(170, 235, 255, 0.92);
  }

  .personality-event-label {
    font-size: 0.58rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: rgba(255, 220, 150, 0.66);
    white-space: nowrap;
  }

  .personality-event-chip.voice-tag .personality-event-label {
    color: rgba(150, 225, 255, 0.72);
  }

  .personality-event-text {
    font-style: italic;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 220px;
  }

  .personality-event-count {
    margin-left: 4px;
    padding: 0 5px;
    border-radius: 999px;
    font-size: 0.56rem;
    letter-spacing: 0.08em;
    border: 1px solid rgba(255, 220, 150, 0.35);
    color: rgba(255, 235, 190, 0.9);
    background: rgba(255, 220, 150, 0.1);
  }

  .expressive-speech {
    margin-top: 2px;
    margin-bottom: 10px;
    padding: 6px 11px;
    border-left: 2px solid rgba(180, 130, 255, 0.45);
    background: rgba(150, 90, 255, 0.06);
    border-radius: 0 7px 7px 0;
    font-size: 0.78rem;
    font-style: italic;
    color: rgba(210, 180, 255, 0.88);
    line-height: 1.4;
    letter-spacing: 0.01em;
  }

  .expressive-speech-label {
    display: block;
    font-size: 0.56rem;
    font-style: normal;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: rgba(180, 130, 255, 0.55);
    margin-bottom: 3px;
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

  .speed-control {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 5px;
  }

  .speed-control-label {
    font-size: 0.68rem;
    letter-spacing: 0.10em;
    text-transform: uppercase;
    color: rgba(180, 130, 255, 0.55);
    margin-right: 3px;
  }

  .speed-btn {
    padding: 3px 9px;
    border: 1px solid rgba(0, 180, 255, 0.20);
    border-radius: 6px;
    background: rgba(0, 180, 255, 0.04);
    color: var(--accent);
    font-size: 0.72rem;
    font-weight: 700;
    cursor: pointer;
    transition: background 120ms, border-color 120ms;
  }

  .speed-btn:hover {
    background: rgba(0, 180, 255, 0.10);
  }

  .speed-btn.active {
    background: rgba(0, 180, 255, 0.15);
    border-color: rgba(0, 180, 255, 0.50);
    color: #fff;
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
    grid-template-rows: auto minmax(680px, auto) auto;
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
    margin-top: 10px;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 7px;
    text-align: center;
  }

  .avatar-panel-zone-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 0.62rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    border: 1px solid var(--zone-border, rgba(0, 234, 255, 0.25));
    color: var(--zone-text, rgba(0, 234, 255, 0.8));
    background: var(--zone-surface, rgba(0, 234, 255, 0.08));
    box-shadow: 0 0 14px var(--zone-glow, rgba(0, 234, 255, 0.2));
  }

  @keyframes zoneShiftPulse {
    0% { transform: scale(1); box-shadow: 0 0 0 rgba(255, 255, 255, 0); }
    48% { transform: scale(1.05); box-shadow: 0 0 16px var(--zone-glow, rgba(0, 234, 255, 0.35)); }
    100% { transform: scale(1); box-shadow: 0 0 14px var(--zone-glow, rgba(0, 234, 255, 0.2)); }
  }

  .avatar-panel-zone-pill.zone-shift {
    animation: zoneShiftPulse 520ms ease;
  }

  .avatar-panel-emotion {
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: rgba(212, 235, 255, 0.94);
    line-height: 1.45;
  }

  .avatar-panel-spectrum {
    margin-top: 2px;
    width: 100%;
    padding: 0 6px;
  }

  .avatar-panel-spectrum-track {
    position: relative;
    height: 6px;
    width: 100%;
    border-radius: 999px;
    overflow: hidden;
    border: 1px solid rgba(196, 224, 255, 0.18);
    background: linear-gradient(90deg,
      rgba(96, 165, 250, 0.8) 0%,
      rgba(52, 211, 153, 0.86) 36%,
      rgba(251, 191, 36, 0.9) 66%,
      rgba(251, 113, 133, 0.9) 100%);
  }

  .avatar-panel-spectrum-marker {
    position: absolute;
    top: 50%;
    width: 10px;
    height: 10px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.85);
    background: var(--zone-accent, #00eaff);
    box-shadow: 0 0 12px var(--zone-glow, rgba(0, 234, 255, 0.4));
    transform: translate(-50%, -50%);
    transition: left 420ms ease;
  }

  @keyframes zoneMarkerFlash {
    0% { transform: translate(-50%, -50%) scale(1); }
    50% { transform: translate(-50%, -50%) scale(1.2); }
    100% { transform: translate(-50%, -50%) scale(1); }
  }

  .avatar-panel-spectrum-marker.zone-shift {
    animation: zoneMarkerFlash 520ms ease;
  }

  .avatar-panel-intensity {
    margin-top: 4px;
    font-size: 0.56rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(188, 220, 245, 0.72);
  }

  .avatar-panel-drift {
    width: 100%;
    margin-top: 6px;
    border: 1px solid rgba(134, 205, 255, 0.2);
    border-radius: 10px;
    background: rgba(3, 16, 34, 0.6);
    padding: 4px 6px 5px;
  }

  .avatar-panel-drift-label {
    font-size: 0.52rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(169, 216, 252, 0.64);
    margin-bottom: 2px;
  }

  .avatar-panel-drift svg {
    width: 100%;
    height: 24px;
    display: block;
  }

  .avatar-panel-drift-axis {
    stroke: rgba(160, 200, 236, 0.32);
    stroke-width: 1;
    stroke-dasharray: 2 2;
  }

  .avatar-panel-drift-line {
    fill: none;
    stroke: #8de8ff;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
    filter: drop-shadow(0 0 4px rgba(141, 232, 255, 0.45));
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
    min-height: 680px;
    max-height: min(88vh, 980px);
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

  .context-meter {
    position: absolute;
    right: 14px;
    bottom: 96px;
    z-index: 4;
    width: min(280px, calc(100% - 28px));
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid rgba(0, 234, 255, 0.22);
    background: rgba(4, 12, 26, 0.9);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.32);
    backdrop-filter: blur(4px);
  }

  .context-meter.warn {
    border-color: rgba(255, 177, 77, 0.45);
  }

  .context-meter.danger {
    border-color: rgba(255, 107, 120, 0.58);
  }

  .context-meter-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 8px;
  }

  .context-meter-actions {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .context-meter-label {
    font-size: 0.68rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #87deff;
    font-weight: 700;
  }

  .context-meter-value {
    font-size: 0.78rem;
    color: #d4f4ff;
    font-variant-numeric: tabular-nums;
  }

  .context-meter-track {
    width: 100%;
    height: 8px;
    border-radius: 999px;
    background: rgba(148, 220, 255, 0.14);
    overflow: hidden;
  }

  .context-meter-fill {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #16c9ff 0%, #55efc4 58%, #ffc76b 100%);
    transition: width 160ms ease;
  }

  .context-meter-meta {
    margin-top: 8px;
    display: flex;
    justify-content: space-between;
    gap: 10px;
    font-size: 0.7rem;
    color: #8fb3c8;
    font-variant-numeric: tabular-nums;
  }

  .context-meter-info {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border: 1px solid rgba(135, 222, 255, 0.28);
    border-radius: 999px;
    background: rgba(10, 26, 44, 0.92);
    color: #8fe8ff;
    font-size: 0.68rem;
    font-weight: 800;
    cursor: help;
  }

  .context-meter-info:focus-visible {
    outline: 2px solid rgba(120, 224, 255, 0.8);
    outline-offset: 2px;
  }

  .context-meter-details {
    position: absolute;
    right: 0;
    bottom: calc(100% + 8px);
    width: min(260px, calc(100vw - 44px));
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid rgba(0, 234, 255, 0.2);
    background: rgba(3, 10, 22, 0.96);
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.34);
    opacity: 0;
    pointer-events: none;
    transform: translateY(4px);
    transition: opacity 140ms ease, transform 140ms ease;
  }

  .context-meter:hover .context-meter-details,
  .context-meter:focus-within .context-meter-details {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
  }

  .context-meter-details-title {
    margin-bottom: 8px;
    color: #d8f6ff;
    font-size: 0.73rem;
    font-weight: 700;
  }

  .context-meter-details-grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 10px;
    font-size: 0.72rem;
    line-height: 1.4;
  }

  .context-meter-details-grid dt {
    color: #81bad1;
  }

  .context-meter-details-grid dd {
    margin: 0;
    color: #eefbff;
    text-align: right;
    word-break: break-word;
  }

  .avatar-panel-orb.thinking-tilt {
    animation: avatarTiltThink 1.6s ease-in-out infinite;
  }

  @media (max-width: 980px) {
    .chat-card {
      grid-template-columns: 1fr;
      grid-template-rows: auto;
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

    .context-meter {
      left: 14px;
      right: 14px;
      width: auto;
      bottom: 92px;
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

  const answerSection = text.match(
    /(?:^|\n)\s*(?:1\)\s*)?Answer\s*:?\s*\n([\s\S]*?)(?=\n\s*2\)\s*Evidence|\n\s*3\)\s*Uncertainty|\n\s*4\)\s*Next Questions|$)/i,
  );

  if (answerSection?.[1]) {
    return { main: String(answerSection[1]).trim(), nextQuestions: "" };
  }

  const stripped = text
    .replace(/\n?\s*2\)\s*Evidence\s*[\s\S]*?(?=\n\s*3\)\s*Uncertainty|\n\s*4\)\s*Next Questions|$)/i, "")
    .replace(/\n?\s*3\)\s*Uncertainty\s*[\s\S]*?(?=\n\s*4\)\s*Next Questions|$)/i, "")
    .replace(/\n?\s*4\)\s*Next Questions\s*[\s\S]*$/i, "")
    .replace(/^\s*(?:1\)\s*)?Answer\s*:?\s*\n?/i, "")
    .trim();

  return { main: stripped, nextQuestions: "" };
}

function getAssistantDisplayContent(message, mode) {
  const rawContent = String(message?.content || "");
  const plannedDisplay = String(message?.utterancePlan?.displayText || "");
  const displayContent = String(message?.displayContent || plannedDisplay || "");
  const chatVisibleContent = mode === "scientist"
    ? rawContent
    : displayContent || extractEPFDialogue(rawContent) || rawContent;

  return formatAssistantContentForMode(chatVisibleContent, mode);
}

function getAssistantSpeechContent(message) {
  const rawContent = String(message?.content || "");
  const plannedSpeech = String(message?.utterancePlan?.speechText || "");
  return plannedSpeech || String(message?.displayContent || "") || extractEPFDialogue(rawContent) || rawContent;
}

function getResponseLensSummary(debug) {
  const lens = debug?.responseLens;
  const label = String(lens?.label || lens?.id || "").trim();
  if (!label) {
    return null;
  }

  const source = String(lens?.source || "default").trim();
  const score = Number(lens?.score);
  const priorities = Array.isArray(lens?.priority)
    ? lens.priority.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const reasons = Array.isArray(lens?.reasons)
    ? lens.reasons.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  let body = `This reply was routed through the ${label} lens.`;
  if (priorities.length > 0) {
    body += ` That means the model was pushed to ${priorities[0]}.`;
  }
  if (reasons.length > 0) {
    body += ` It was selected because ${reasons[0].charAt(0).toLowerCase()}${reasons[0].slice(1)}.`;
  } else if (source === "default") {
    body += " No stronger lens matched, so the system fell back to the persona's default focus.";
  }

  const chips = [
    `lens: ${label}`,
    `source: ${source}`,
  ];

  if (Number.isFinite(score)) {
    chips.push(`score: ${score.toFixed(2)}`);
  }

  if (debug?.flags?.embeddingsConfigured === false) {
    chips.push("memory embeddings: disabled");
    body += " Semantic memory embeddings are currently disabled, so recall ranking may be less precise.";
  }

  return {
    title: "Response Lens",
    body,
    chips,
  };
}

function buildTtsErrorMessage(error) {
  const base = String(error?.message || "Failed to generate speech.").trim();
  const provider = String(error?.ttsProvider || "").trim().toLowerCase();
  const providerCode = String(error?.ttsProviderCode || "").trim().toLowerCase();
  const providerStatus = Number(error?.ttsProviderStatus || 0);
  const httpStatus = Number(error?.httpStatus || 0);
  const isHtmlErrorPage = Boolean(error?.isHtmlErrorPage);
  const ttsHealthSnapshot = error?.ttsHealthSnapshot;

  const getRoutingHint = () => {
    if (!ttsHealthSnapshot || typeof ttsHealthSnapshot !== "object") {
      return "";
    }

    const debugLockEnabled = Boolean(ttsHealthSnapshot?.routing?.debugLockEnabled);
    const allowedEngines = Array.isArray(ttsHealthSnapshot?.routing?.allowedEngines)
      ? ttsHealthSnapshot.routing.allowedEngines.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    const requestedEngine = String(ttsHealthSnapshot?.routing?.requestedEngine || "").trim().toLowerCase();
    const cartesiaConnected = Boolean(ttsHealthSnapshot?.engines?.cartesia?.connected);
    const cartesiaError = String(ttsHealthSnapshot?.engines?.cartesia?.error || "").trim();

    const parts = [];
    if (debugLockEnabled) {
      parts.push(`debug lock is on (allowed: ${allowedEngines.length ? allowedEngines.join(", ") : "none"})`);
    }
    if (requestedEngine) {
      parts.push(`requested engine=${requestedEngine}`);
    }
    if (cartesiaConnected) {
      parts.push("cartesia reports connected");
    } else if (cartesiaError) {
      parts.push(`cartesia health error: ${cartesiaError}`);
    }

    return parts.length ? ` Live TTS health: ${parts.join("; ")}.` : "";
  };

  if (isHtmlErrorPage && httpStatus === 502) {
    const effectiveLockEnabled = ttsHealthSnapshot && typeof ttsHealthSnapshot === "object"
      ? Boolean(ttsHealthSnapshot?.routing?.debugLockEnabled)
      : TTS_DEBUG_PROVIDER_LOCK;

    const lockHint = effectiveLockEnabled
      ? " Debug lock is enabled, so fallback engines may be blocked; verify the active provider credentials/voice/model or temporarily disable the lock for fallback."
      : "";

    return [
      "Speech request failed with an upstream HTML 502 before Voxis could return provider diagnostics.",
      "This usually means the reverse proxy/gateway failed while waiting on backend TTS.",
      getRoutingHint().trim(),
      "Check backend PM2 logs and nginx error logs.",
      lockHint.trim(),
      "Quick checks: /health and /health/tts.",
    ].filter(Boolean).join(" ");
  }

  if (!provider) {
    return base;
  }

  const hint = provider === "cartesia"
    ? providerStatus === 401 || providerStatus === 403
      ? "Cartesia auth failed. Re-save your Cartesia API key in Voice Provider Credentials."
      : providerStatus === 429
        ? "Cartesia rate limit hit. Retry in a moment or switch providers."
        : providerStatus === 504 || providerCode === "timeout"
          ? "Cartesia timed out. Try shorter text or verify model/voice settings."
          : providerStatus === 400 || /voice|model|invalid/.test(providerCode)
            ? "Cartesia rejected the voice/model combo. Verify voice ID (UUID) and model."
            : "Cartesia request failed. Verify provider credentials and voice/model settings."
    : provider === "elevenlabs"
      ? providerStatus === 429
        ? "ElevenLabs is rate limited. Retry shortly or use another engine."
        : "ElevenLabs request failed. Verify API key and selected voice."
      : provider === "cloud"
        ? providerStatus === 401 || providerStatus === 403
          ? "Cloud TTS auth failed. Verify TTS/OpenAI API key configuration."
          : providerStatus === 429
            ? "Cloud TTS rate limit hit. Retry shortly."
            : "Cloud TTS request failed. Verify provider settings."
        : provider === "kokoro"
          ? "Kokoro failed during synthesis. Check model preload and server resources."
          : provider === "piper"
            ? "Piper failed. Verify model path, binary, and synthesis timeout settings."
            : "TTS provider request failed. Verify provider settings.";

  const detailSuffix = ` [provider=${provider}${providerCode ? ` code=${providerCode}` : ""}${providerStatus ? ` status=${providerStatus}` : ""}]`;
  return `${base} ${hint}${detailSuffix}`.trim();
}

async function fetchTtsHealthSnapshot(authFetch) {
  if (typeof authFetch !== "function") {
    return null;
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 1800);

  try {
    const response = await authFetch("/health/tts", {
      method: "GET",
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    if (!payload || typeof payload !== "object") {
      return null;
    }

    return {
      routing: {
        debugLockEnabled: Boolean(payload?.routing?.debugLockEnabled),
        allowedEngines: Array.isArray(payload?.routing?.allowedEngines)
          ? payload.routing.allowedEngines
          : [],
        requestedEngine: String(payload?.routing?.requestedEngine || "").trim().toLowerCase(),
      },
      engines: {
        cartesia: {
          connected: Boolean(payload?.engines?.cartesia?.connected),
          error: String(payload?.engines?.cartesia?.error || "").trim(),
        },
      },
    };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

const MAX_STREAM_READY_AUDIO = 3;
const MAX_STREAM_SENTENCE_CHARS = 260;
const DOT_PLACEHOLDER = "__VOXIS_DOT__";
const COMMON_ABBREVIATIONS = [
  "Mr.",
  "Mrs.",
  "Ms.",
  "Dr.",
  "Prof.",
  "Sr.",
  "Jr.",
  "St.",
  "vs.",
  "etc.",
  "i.e.",
  "e.g.",
  "U.S.",
  "U.K.",
  "No.",
];

function escapeRegex(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitCompleteSentences(text) {
  const source = String(text || "");
  if (!source.trim()) {
    return { sentences: [], remainder: "" };
  }

  let protectedSource = source;
  for (const abbr of COMMON_ABBREVIATIONS) {
    protectedSource = protectedSource.replace(
      new RegExp(escapeRegex(abbr), "g"),
      abbr.replace(/\./g, DOT_PLACEHOLDER),
    );
  }

  const sentences = [];
  const matcher = /[^.!?\n]+[.!?]+["')\]]*\s*/g;
  let match = null;
  let consumedEnd = 0;

  while ((match = matcher.exec(protectedSource)) !== null) {
    const sentence = String(match[0] || "")
      .replace(new RegExp(DOT_PLACEHOLDER, "g"), ".")
      .trim();
    if (sentence) {
      sentences.push(sentence);
    }
    consumedEnd = matcher.lastIndex;
  }

  return {
    sentences,
    remainder: protectedSource
      .slice(consumedEnd)
      .replace(new RegExp(DOT_PLACEHOLDER, "g"), ".")
      .trim(),
  };
}

function normalizeSpeechChunk(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitLongSpeechChunk(text, maxChars = MAX_STREAM_SENTENCE_CHARS) {
  const normalized = normalizeSpeechChunk(text);
  if (!normalized) {
    return [];
  }

  if (normalized.length <= maxChars) {
    return [normalized];
  }

  const chunks = [];
  let remaining = normalized;

  while (remaining.length > maxChars) {
    let splitAt = remaining.lastIndexOf(",", maxChars);
    if (splitAt < Math.floor(maxChars * 0.4)) {
      splitAt = remaining.lastIndexOf(" ", maxChars);
    }
    if (splitAt <= 0) {
      splitAt = maxChars;
    }

    const part = remaining.slice(0, splitAt).trim();
    if (part) {
      chunks.push(part);
    }
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

function coalescePersonalityEvents(events, nowMs = Date.now()) {
  const map = new Map();

  for (const rawEvent of Array.isArray(events) ? events : []) {
    const type = String(rawEvent?.type || "event").trim().toLowerCase();
    const delivery = String(rawEvent?.delivery || "overlay").trim().toLowerCase();
    const spoken = Boolean(rawEvent?.spoken);
    const text = String(rawEvent?.text || "").trim();
    const tag = String(rawEvent?.tag || "").trim();
    const labelText = text || tag;

    if (!labelText) {
      continue;
    }

    const key = `${type}:${delivery}:${spoken ? "spoken" : "silent"}:${labelText.toLowerCase()}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      existing.lastSeenMs = nowMs;
      continue;
    }

    map.set(key, {
      key,
      type,
      delivery,
      spoken,
      tag,
      text,
      count: 1,
      lastSeenMs: nowMs,
    });
  }

  return Array.from(map.values());
}

export default function ChatWindow({
  personality,
  messages,
  liveDebug,
  stateDriftHistory = [],
  livePhase,
  liveSeq,
  liveReply,
  liveUsage,
  liveVoiceAdjustments = null,
  liveSingingActive = false,
  activeMode,
  neuralProfile,
  disableNeuronMap3d = DEFAULT_DISABLE_NEURONMAP_3D,
  isLoadingMessages,
  isSending,
  onSend,
  onSaveVoiceProfile,
  onJumpToBuilder,
  onOpenVoiceLab,
  onStatus,
  onUpdateMemory,
  onOpenPersonaEditor,
}) {
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const authFetch = useAuthFetch();
  const [draft, setDraft] = useState("");
  const [attachedFile, setAttachedFile] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [voiceProfile, setVoiceProfile] = useState({
    enabled: true,
    autoplay: false,
    engine: "auto",
    pitch: 1,
    rate: 1,
    preferredVoice: "alloy",
    providerVoice: "alloy",
    kokoroVoice: "af_heart",
    elevenLabsVoiceId: "21m00Tcm4TlvDq8ikWAM",
    elevenLabsModel: "eleven_multilingual_v2",
    providerModel: "gpt-4o-mini-tts",
    cartesiaVoiceId: "",
    cartesiaModel: "sonic-3",
    sfxVolume: 0.85,
    piperModelPath: "",
    piperSpeaker: null,
  });
  const [isSavingVoice, setIsSavingVoice] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [speechPlaybackRate, setSpeechPlaybackRate] = useState(1);
  const [cartesiaVoiceOptions, setCartesiaVoiceOptions] = useState(CARTESIA_QUICK_VOICE_OPTIONS);
  const [elevenLabsVoiceOptions, setElevenLabsVoiceOptions] = useState(ELEVENLABS_QUICK_VOICE_OPTIONS);
  const [elevenLabsModelOptions, setElevenLabsModelOptions] = useState(ELEVENLABS_QUICK_MODEL_OPTIONS);
  const [speechEnergy, setSpeechEnergy] = useState(0);
  const [voiceTelemetry, setVoiceTelemetry] = useState(null);
  const [activePersonalityEvents, setActivePersonalityEvents] = useState([]);
  const [debugMode, setDebugMode] = useState(false);
  const [sysObserverOpen, setSysObserverOpen] = useState(false);
  const [performanceText, setPerformanceText] = useState(null); // EPF text to perform
  const [emotionDrift, setEmotionDrift] = useState([]);
  const [zoneShiftActive, setZoneShiftActive] = useState(false);
  const lastGeneratedRef = useRef("");
  const lastNarrationRef = useRef("");
  const messageListRef = useRef(null);
  const audioRef = useRef(null);
  const speechPlaybackRateRef = useRef(1);
  const speechEnergyTimerRef = useRef(null);
  const ttsRequestAbortRef = useRef(null);
  const shouldAutoScrollRef = useRef(true);
  const zoneShiftTimerRef = useRef(null);
  const personalityEventsTimerRef = useRef(null);
  const streamAutoplaySessionRef = useRef(null);
  const streamSentenceCursorRef = useRef(0);
  const streamQueuedSentenceKeysRef = useRef(new Set());
  const streamPendingSentenceQueueRef = useRef([]);
  const streamReadyAudioQueueRef = useRef([]);
  const streamQueueProcessingRef = useRef(false);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const recognitionRestartTimerRef = useRef(null);
  const recognitionInactivityTimerRef = useRef(null);
  const recordingRequestedRef = useRef(false);
  const draftRef = useRef("");
  const pendingSfxTimelineRef = useRef([]);
  const pendingAfterSfxTagsRef = useRef([]);
  const activeSfxTimeoutsRef = useRef([]);
  const activeSfxPlayersRef = useRef([]);
  const lastSfxPlaybackKeyRef = useRef("");
  const streamPlaybackActiveRef = useRef(false);
  const streamAutoplayUsedRef = useRef(false);
  const autoplayAssistantBaselineRef = useRef(0);
  const prevZoneKeyRef = useRef("");
  // Tracks the latest voice adjustments from the chat pipeline — applied to TTS requests
  const pendingVoiceAdjustmentsRef = useRef(null);
  const pendingSingingActiveRef = useRef(false);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const latestAssistantMessage = useMemo(
    () => [...messages].reverse().find((message) => message.role === "assistant") || null,
    [messages],
  );

  const latestAssistantDebug = useMemo(
    () => [...messages].reverse().find((message) => message.role === "assistant" && message.debug)?.debug || null,
    [messages],
  );

  const latestAssistantUsage = useMemo(
    () => [...messages].reverse().find((message) => message.role === "assistant" && message.usage)?.usage || null,
    [messages],
  );

  const latestAssistantSpeechText = useMemo(
    () => getAssistantSpeechContent(latestAssistantMessage),
    [latestAssistantMessage],
  );

  const assistantMessageCount = useMemo(
    () => messages.reduce((count, message) => count + (message?.role === "assistant" ? 1 : 0), 0),
    [messages],
  );

  const activeUsage = liveUsage || latestAssistantUsage;
  const usagePercent = useMemo(() => {
    const ratio = Number(activeUsage?.percentUsed);
    if (Number.isFinite(ratio) && ratio >= 0) {
      return Math.min(100, Math.max(0, Math.round(ratio * 100)));
    }

    const total = Number(activeUsage?.totalTokens);
    const max = Number(activeUsage?.maxTokens);
    if (Number.isFinite(total) && Number.isFinite(max) && max > 0) {
      return Math.min(100, Math.max(0, Math.round((total / max) * 100)));
    }

    return 0;
  }, [activeUsage]);
  const usageModelLabel = useMemo(() => {
    const model = String(activeUsage?.model || "").trim();
    return model || "Unknown";
  }, [activeUsage]);
  const usageSourceLabel = useMemo(() => {
    return activeUsage?.source === "provider" ? "Provider-reported" : "Live estimate";
  }, [activeUsage]);

  const providerBadge = useMemo(() => {
    const chosenEngine = String(
      voiceTelemetry?.chosenEngine || voiceTelemetry?.requested || voiceProfile.engine || "auto",
    ).trim().toLowerCase() || "auto";

    if (!voiceProfile.enabled) {
      return {
        tone: "",
        label: "Voice Off",
      };
    }

    if (voiceTelemetry?.fallbackUsed) {
      return {
        tone: "alert",
        label: `Fallback -> ${chosenEngine}`,
      };
    }

    if (isGeneratingAudio) {
      return {
        tone: "pending",
        label: `Generating ${chosenEngine}`,
      };
    }

    return {
      tone: voiceTelemetry ? "ok" : "",
      label: `Provider ${chosenEngine}`,
    };
  }, [isGeneratingAudio, voiceProfile.enabled, voiceProfile.engine, voiceTelemetry]);

  const selectedCartesiaVoiceOption = useMemo(() => {
    const currentVoiceId = String(voiceProfile.cartesiaVoiceId || "").trim();
    if (!currentVoiceId) {
      return cartesiaVoiceOptions[0]?.id || CUSTOM_CARTESIA_VOICE_OPTION;
    }

    const knownVoice = cartesiaVoiceOptions.some((voice) => voice.id === currentVoiceId);
    // If in the fetched list, return the ID directly; otherwise return the ID itself
    // so the injected "(saved)" option renders as selected instead of "Custom voice ID..."
    return knownVoice ? currentVoiceId : currentVoiceId;
  }, [voiceProfile.cartesiaVoiceId, cartesiaVoiceOptions]);

  const selectedElevenLabsVoiceOption = useMemo(() => {
    const currentVoiceId = String(voiceProfile.elevenLabsVoiceId || "").trim();
    if (!currentVoiceId) {
      return elevenLabsVoiceOptions[0]?.id || CUSTOM_ELEVENLABS_VOICE_OPTION;
    }

    const knownVoice = elevenLabsVoiceOptions.some((voice) => voice.id === currentVoiceId);
    return knownVoice ? currentVoiceId : currentVoiceId;
  }, [voiceProfile.elevenLabsVoiceId, elevenLabsVoiceOptions]);

  const selectedElevenLabsModelOption = useMemo(() => {
    const currentModel = String(voiceProfile.elevenLabsModel || "").trim();
    if (!currentModel) {
      return elevenLabsModelOptions[0]?.id || CUSTOM_ELEVENLABS_MODEL_OPTION;
    }

    const knownModel = elevenLabsModelOptions.some((model) => model.id === currentModel);
    return knownModel ? currentModel : currentModel;
  }, [voiceProfile.elevenLabsModel, elevenLabsModelOptions]);

  const displayDebug = liveDebug || latestAssistantDebug;

  // Keep voice adjustment refs in sync with incoming live props so they're
  // available inside requestSpeechAudio without needing a re-render.
  useEffect(() => {
    pendingVoiceAdjustmentsRef.current = liveVoiceAdjustments;
  }, [liveVoiceAdjustments]);

  useEffect(() => {
    pendingSingingActiveRef.current = liveSingingActive;
  }, [liveSingingActive]);

  // Fetch Cartesia voice catalog when the engine is Cartesia (or auto w/ debug lock).
  // Falls back to CARTESIA_QUICK_VOICE_OPTIONS when API key is missing or the call fails.
  useEffect(() => {
    if (!authLoaded || !isSignedIn) {
      return;
    }

    const isCartesiaActive =
      voiceProfile.engine === "cartesia" ||
      (TTS_DEBUG_PROVIDER_LOCK && voiceProfile.engine === "auto");

    if (!isCartesiaActive) {
      return;
    }

    let cancelled = false;

    authFetch("/api/tts/provider-options?provider=cartesia")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(String(data?.error || "Failed to load Cartesia voices."));
        }
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        const voices = Array.isArray(data?.voices) && data.voices.length
          ? data.voices.map((v) => ({ id: String(v.id || ""), label: String(v.label || v.id || "") }))
          : CARTESIA_QUICK_VOICE_OPTIONS;
        setCartesiaVoiceOptions(voices);
      })
      .catch((error) => {
        console.warn("[ChatWindow] Cartesia voice catalog fallback:", error?.message || error);
        if (!cancelled) setCartesiaVoiceOptions(CARTESIA_QUICK_VOICE_OPTIONS);
      });

    return () => { cancelled = true; };
  }, [authFetch, authLoaded, isSignedIn, voiceProfile.engine]);

  // Fetch ElevenLabs voice catalog when ElevenLabs is selected in quick voice.
  // Falls back to ELEVENLABS_QUICK_VOICE_OPTIONS when API key is missing or the call fails.
  useEffect(() => {
    if (!authLoaded || !isSignedIn) {
      return;
    }

    if (voiceProfile.engine !== "elevenlabs") {
      return;
    }

    let cancelled = false;

    authFetch("/api/tts/provider-options?provider=elevenlabs")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(String(data?.error || "Failed to load ElevenLabs voices."));
        }
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        const voices = Array.isArray(data?.voices) && data.voices.length
          ? data.voices.map((v) => ({ id: String(v.id || ""), label: String(v.label || v.id || "") }))
          : ELEVENLABS_QUICK_VOICE_OPTIONS;
        const models = Array.isArray(data?.models) && data.models.length
          ? data.models.map((m) => ({ id: String(m.id || ""), label: String(m.label || m.id || "") }))
          : ELEVENLABS_QUICK_MODEL_OPTIONS;
        setElevenLabsVoiceOptions(voices);
        setElevenLabsModelOptions(models);
      })
      .catch((error) => {
        console.warn("[ChatWindow] ElevenLabs voice catalog fallback:", error?.message || error);
        if (!cancelled) setElevenLabsVoiceOptions(ELEVENLABS_QUICK_VOICE_OPTIONS);
        if (!cancelled) setElevenLabsModelOptions(ELEVENLABS_QUICK_MODEL_OPTIONS);
      });

    return () => { cancelled = true; };
  }, [authFetch, authLoaded, isSignedIn, voiceProfile.engine]);

  const pendingAssistantMessage = useMemo(() => {
    if (!isSending && !liveReply) {
      return null;
    }

    return {
      role: "assistant",
      content: liveReply || "",
      displayContent: extractEPFDialogue(liveReply || "") || liveReply || "",
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
    const debugMood = displayDebug?.mood?.after;
    const personalityMood = personality?.moodState;
    
    // Parse personality.moodState if it's a JSON string
    let parsedPersonalityMood = personalityMood;
    if (typeof personalityMood === 'string') {
      try {
        parsedPersonalityMood = JSON.parse(personalityMood);
      } catch (e) {
        parsedPersonalityMood = {};
      }
    }
    
    const mood = debugMood || parsedPersonalityMood || { valence: 0, arousal: 0, dominance: 0 };
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

  const avatarMood = useMemo(() => {
    const debugMood = displayDebug?.mood?.after;
    const personalityMood = personality?.moodState;
    
    // Parse personality.moodState if it's a JSON string
    let parsedPersonalityMood = personalityMood;
    if (typeof personalityMood === 'string') {
      try {
        parsedPersonalityMood = JSON.parse(personalityMood);
      } catch (e) {
        parsedPersonalityMood = {};
      }
    }
    
    return debugMood || parsedPersonalityMood || { valence: 0, arousal: 0, dominance: 0 };
  }, [displayDebug, personality?.moodState]);

  const emotionSpectrum = useMemo(
    () => interpretEmotionSpectrum(avatarMood),
    [avatarMood],
  );

  const emotionDriftPath = useMemo(() => {
    if (emotionDrift.length <= 1) {
      return "";
    }

    const width = 100;
    const height = 24;
    return emotionDrift
      .map((value, index) => {
        const x = (index / (emotionDrift.length - 1)) * width;
        const y = ((1 - (Number(value || 0) + 1) / 2) * (height - 2)) + 1;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  }, [emotionDrift]);

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

    const nextEngine = normalizeVoiceEngineForDebug(personality.voiceProfile?.engine || "auto");

    setVoiceProfile({
      enabled: personality.voiceProfile?.enabled !== false,
      autoplay: Boolean(personality.voiceProfile?.autoplay),
      engine: nextEngine,
      pitch: Number(personality.voiceProfile?.pitch) || 1,
      rate: Number(personality.voiceProfile?.rate) || 1,
      preferredVoice:
        personality.voiceProfile?.preferredVoice || personality.voiceProfile?.providerVoice || "alloy",
      providerVoice:
        personality.voiceProfile?.providerVoice || personality.voiceProfile?.preferredVoice || "alloy",
      kokoroVoice: personality.voiceProfile?.kokoroVoice || "af_heart",
      elevenLabsVoiceId: personality.voiceProfile?.elevenLabsVoiceId || "21m00Tcm4TlvDq8ikWAM",
      elevenLabsModel: personality.voiceProfile?.elevenLabsModel || "eleven_multilingual_v2",
      providerModel: personality.voiceProfile?.providerModel || "gpt-4o-mini-tts",
      cartesiaVoiceId: personality.voiceProfile?.cartesiaVoiceId || "",
      cartesiaModel: personality.voiceProfile?.cartesiaModel || "sonic-3",
      sfxVolume: Number(personality.voiceProfile?.sfxVolume ?? 0.85),
      piperModelPath: personality.voiceProfile?.piperModelPath || "",
      piperSpeaker: personality.voiceProfile?.piperSpeaker ?? null,
    });
  }, [personality]);

  useEffect(() => {
    setVoiceTelemetry(null);
    setActivePersonalityEvents([]);
    streamAutoplaySessionRef.current = null;
    clearStreamingAutoplayQueues({ revokeQueuedAudio: true });
    autoplayAssistantBaselineRef.current = assistantMessageCount;
    lastGeneratedRef.current = `${personality?.id || "none"}:${latestAssistantSpeechText}`;
    if (personalityEventsTimerRef.current) {
      window.clearTimeout(personalityEventsTimerRef.current);
    }
    setEmotionDrift([]);
    prevZoneKeyRef.current = "";
  }, [assistantMessageCount, latestAssistantSpeechText, personality?.id]);

  useEffect(() => {
    if (!voiceProfile.autoplay) {
      return;
    }

    // Arming autoplay should not immediately replay the latest historical assistant
    // response just because the tab/component became active.
    autoplayAssistantBaselineRef.current = assistantMessageCount;
    lastGeneratedRef.current = `${personality?.id || "none"}:${latestAssistantSpeechText}`;
  }, [voiceProfile.autoplay, assistantMessageCount, latestAssistantSpeechText, personality?.id]);

  useEffect(() => {
    const nextValence = Number(avatarMood?.valence || 0);
    setEmotionDrift((current) => {
      const appended = [...current, Math.max(-1, Math.min(1, nextValence))];
      return appended.slice(-28);
    });
  }, [avatarMood?.valence]);

  useEffect(() => {
    const currentZoneKey = String(emotionSpectrum?.zone?.key || "");
    if (!currentZoneKey) {
      return;
    }

    if (!prevZoneKeyRef.current) {
      prevZoneKeyRef.current = currentZoneKey;
      return;
    }

    if (prevZoneKeyRef.current !== currentZoneKey) {
      setZoneShiftActive(true);
      if (zoneShiftTimerRef.current) {
        window.clearTimeout(zoneShiftTimerRef.current);
      }
      zoneShiftTimerRef.current = window.setTimeout(() => {
        setZoneShiftActive(false);
      }, 540);
      prevZoneKeyRef.current = currentZoneKey;
    }
  }, [emotionSpectrum?.zone?.key]);

  // Show structured personality events from telemetry, coalesce duplicates, and auto-dismiss.
  useEffect(() => {
    const events = Array.isArray(voiceTelemetry?.personalityEvents)
      ? voiceTelemetry.personalityEvents
      : [];

    const nowMs = Date.now();
    const normalizedEvents = coalescePersonalityEvents(events, nowMs);

    if (normalizedEvents.length === 0) {
      setActivePersonalityEvents((current) => {
        const pruned = current.filter((event) => nowMs - Number(event?.lastSeenMs || 0) < 7000);
        return pruned;
      });
      return;
    }

    setActivePersonalityEvents((current) => {
      const merged = new Map();

      for (const event of current) {
        if (nowMs - Number(event?.lastSeenMs || 0) < 7000) {
          merged.set(event.key, event);
        }
      }

      for (const event of normalizedEvents) {
        const existing = merged.get(event.key);
        if (existing) {
          merged.set(event.key, {
            ...existing,
            count: Number(existing.count || 1) + Number(event.count || 1),
            lastSeenMs: nowMs,
            // Keep latest payload text/tag for display if it changed casing.
            text: event.text || existing.text,
            tag: event.tag || existing.tag,
          });
        } else {
          merged.set(event.key, event);
        }
      }

      return Array.from(merged.values())
        .sort((a, b) => Number(b.lastSeenMs || 0) - Number(a.lastSeenMs || 0))
        .slice(0, 4);
    });

    if (personalityEventsTimerRef.current) {
      window.clearTimeout(personalityEventsTimerRef.current);
    }
    personalityEventsTimerRef.current = window.setTimeout(() => {
      const cutoff = Date.now() - 7000;
      setActivePersonalityEvents((current) =>
        current.filter((event) => Number(event?.lastSeenMs || 0) >= cutoff),
      );
    }, 7000);
  }, [voiceTelemetry?.personalityEvents]);

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
    if (!voiceProfile.enabled || !voiceProfile.autoplay || !personality) {
      return;
    }

    const sessionKey = `${personality.id}:${messages.length}`;

    if (isSending) {
      if (streamAutoplaySessionRef.current !== sessionKey) {
        streamAutoplaySessionRef.current = sessionKey;
        clearStreamingAutoplayQueues({ revokeQueuedAudio: true });
      }

      const { sentences } = splitCompleteSentences(liveReply || "");
      if (sentences.length < streamSentenceCursorRef.current) {
        clearStreamingAutoplayQueues({ revokeQueuedAudio: true });
      }

      for (let index = streamSentenceCursorRef.current; index < sentences.length; index += 1) {
        const parts = splitLongSpeechChunk(sentences[index]);
        for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
          const sentence = normalizeSpeechChunk(parts[partIndex]);
          if (!sentence) {
            continue;
          }

          const sentenceKey = `${sessionKey}:${index}:${partIndex}:${sentence}`;
          if (streamQueuedSentenceKeysRef.current.has(sentenceKey)) {
            continue;
          }

          streamQueuedSentenceKeysRef.current.add(sentenceKey);
          streamPendingSentenceQueueRef.current.push({
            text: sentence,
            segmentIndex: index,
            segmentKey: sentenceKey,
          });
          streamAutoplayUsedRef.current = true;
        }
      }

      streamSentenceCursorRef.current = Math.max(streamSentenceCursorRef.current, sentences.length);

      if (streamPendingSentenceQueueRef.current.length > 0) {
        void processStreamingSentenceQueue();
      }

      return;
    }

    // Finalize trailing text once stream ends (even if it lacked punctuation).
    if (streamAutoplaySessionRef.current === sessionKey && streamAutoplayUsedRef.current) {
      const { sentences, remainder } = splitCompleteSentences(latestAssistantSpeechText);
      const finalized = [...sentences];
      const tail = normalizeSpeechChunk(remainder);
      if (tail) {
        finalized.push(tail);
      }

      for (let index = streamSentenceCursorRef.current; index < finalized.length; index += 1) {
        const parts = splitLongSpeechChunk(finalized[index]);
        for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
          const sentence = normalizeSpeechChunk(parts[partIndex]);
          if (!sentence) {
            continue;
          }

          const sentenceKey = `${sessionKey}:${index}:${partIndex}:${sentence}`;
          if (streamQueuedSentenceKeysRef.current.has(sentenceKey)) {
            continue;
          }

          streamQueuedSentenceKeysRef.current.add(sentenceKey);
          streamPendingSentenceQueueRef.current.push({
            text: sentence,
            segmentIndex: index,
            segmentKey: sentenceKey,
          });
        }
      }

      streamSentenceCursorRef.current = finalized.length;

      if (streamPendingSentenceQueueRef.current.length > 0) {
        void processStreamingSentenceQueue();
      }

      return;
    }

    // Fallback path for non-streamed assistant updates.
    if (!latestAssistantMessage) {
      return;
    }

    // Only autoplay after a newly generated assistant turn in this session.
    if (assistantMessageCount <= autoplayAssistantBaselineRef.current) {
      return;
    }

    const stamp = `${personality?.id || "none"}:${latestAssistantSpeechText}`;
    if (lastGeneratedRef.current === stamp) {
      return;
    }

    void generateAudio(latestAssistantSpeechText, { silentAutoplayBlock: true });
    lastGeneratedRef.current = stamp;
  }, [
    isSending,
    liveReply,
    latestAssistantMessage,
    latestAssistantSpeechText,
    assistantMessageCount,
    messages.length,
    personality?.id,
    voiceProfile.autoplay,
    voiceProfile.enabled,
  ]);

  useEffect(() => {
    const debugMood = latestAssistantDebug?.mood?.after;
    const personalityMood = personality?.moodState;
    
    // Parse personality.moodState if it's a JSON string
    let parsedPersonalityMood = personalityMood;
    if (typeof personalityMood === 'string') {
      try {
        parsedPersonalityMood = JSON.parse(personalityMood);
      } catch (e) {
        parsedPersonalityMood = {};
      }
    }
    
    const valence = Number(debugMood?.valence ?? parsedPersonalityMood?.valence ?? 0);
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

    const narrationStamp = `${personality?.id || "none"}:${latestAssistantSpeechText}:${valence.toFixed(2)}`;
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
    latestAssistantSpeechText,
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

  function clearStreamingAutoplayQueues({ revokeQueuedAudio = true } = {}) {
    streamPendingSentenceQueueRef.current = [];
    streamQueuedSentenceKeysRef.current = new Set();
    streamSentenceCursorRef.current = 0;
    streamAutoplayUsedRef.current = false;
    streamPlaybackActiveRef.current = false;

    if (revokeQueuedAudio) {
      for (const item of streamReadyAudioQueueRef.current) {
        if (item?.url) {
          URL.revokeObjectURL(item.url);
        }
      }
    }

    streamReadyAudioQueueRef.current = [];
  }

  function clearActiveSfxPlayback() {
    for (const timeoutId of activeSfxTimeoutsRef.current) {
      window.clearTimeout(timeoutId);
    }
    activeSfxTimeoutsRef.current = [];

    for (const player of activeSfxPlayersRef.current) {
      try {
        player.pause();
      } catch {
        /* ignore */
      }
    }
    activeSfxPlayersRef.current = [];
  }

  function computeSfxDelayMs(event, index) {
    const explicitMs = Number(event?.ms);
    if (Number.isFinite(explicitMs) && explicitMs >= 0) {
      return Math.round(explicitMs);
    }

    const position = String(event?.position || "inline").trim().toLowerCase();
    if (position === "before") {
      return 0;
    }
    if (position === "throughout") {
      const wordIndex = Number(event?.wordIndex);
      if (Number.isFinite(wordIndex) && wordIndex >= 0) {
        return Math.round(wordIndex * 320);
      }
      return 260 + (index * 220);
    }
    if (position === "after") {
      return -1;
    }
    return 140 + (index * 180);
  }

  function playSfxTag(tag) {
    const normalized = String(tag || "").trim().toLowerCase();
    if (!normalized) {
      return;
    }

    const player = new Audio(`/api/sfx/audio/${encodeURIComponent(normalized)}`);
    player.preload = "auto";
    player.volume = Math.max(0, Math.min(1, Number(voiceProfile.sfxVolume ?? 0.85)));
    activeSfxPlayersRef.current.push(player);

    void player.play().catch(() => {
      /* optional SFX; ignore playback failures */
    });
  }

  function queueSfxTimelinePlayback(timeline) {
    clearActiveSfxPlayback();
    pendingAfterSfxTagsRef.current = [];

    const events = Array.isArray(timeline) ? timeline : [];
    events.forEach((event, index) => {
      const tag = String(event?.tag || "").trim().toLowerCase();
      if (!tag) {
        return;
      }

      const delayMs = computeSfxDelayMs(event, index);
      if (delayMs < 0) {
        pendingAfterSfxTagsRef.current.push(tag);
        return;
      }

      const timeoutId = window.setTimeout(() => {
        playSfxTag(tag);
      }, delayMs);
      activeSfxTimeoutsRef.current.push(timeoutId);
    });
  }

  function triggerSfxForCurrentPlayback(audioElement) {
    if (!(audioElement instanceof HTMLAudioElement)) {
      return;
    }

    const sourceKey = String(audioElement.currentSrc || audioElement.src || "");
    if (!sourceKey) {
      return;
    }

    if (lastSfxPlaybackKeyRef.current === sourceKey) {
      return;
    }

    lastSfxPlaybackKeyRef.current = sourceKey;
    queueSfxTimelinePlayback(pendingSfxTimelineRef.current);
  }

  function getStreamQueueDepth() {
    return streamPendingSentenceQueueRef.current.length + streamReadyAudioQueueRef.current.length;
  }

  async function requestSpeechAudio(text, controller, meta = {}) {
    const requestStartedAt = performance.now();
    const cacheKey = buildTtsCacheKey(personality.id, text, voiceProfile);
    const cachedBlob = getTtsCache(cacheKey);
    if (cachedBlob) {
      return {
        url: URL.createObjectURL(cachedBlob),
        telemetry: null,
      };
    }
    const response = await authFetch(`/personality/${personality.id}/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        text,
        voiceProfile: {
          ...voiceProfile,
          // Merge emotion-graph voice adjustments so Cartesia receives speed/emotion controls
          voiceAdjustments: pendingVoiceAdjustmentsRef.current || undefined,
          singingActive: pendingSingingActiveRef.current || false,
        },
      }),
    });

    if (!response.ok) {
      const payload = await readApiResponsePayload(response);
      const baseError = getApiErrorMessage(
        response,
        payload,
        "Failed to generate speech.",
      );

      const isHtmlErrorPage =
        payload && typeof payload === "object" && typeof payload.rawText === "string"
          ? /^\s*</.test(payload.rawText)
          : false;

      let ttsHealthSnapshot = null;
      if (isHtmlErrorPage && Number(response.status) === 502) {
        ttsHealthSnapshot = await fetchTtsHealthSnapshot(authFetch);
      }

      const provider = String(payload?.details?.provider || "").trim().toLowerCase();
      const providerCode = String(payload?.details?.providerCode || "").trim().toLowerCase();
      const providerStatus = Number(payload?.details?.providerStatus || 0);

      const suffix = provider
        ? ` [provider=${provider}${providerCode ? ` code=${providerCode}` : ""}${providerStatus ? ` status=${providerStatus}` : ""}]`
        : "";
      const error = new Error(`${baseError}${suffix}`.trim());
      error.ttsProvider = provider;
      error.ttsProviderCode = providerCode;
      error.ttsProviderStatus = providerStatus;
      error.httpStatus = Number(response.status || 0);
      error.isHtmlErrorPage = isHtmlErrorPage;
      error.ttsHealthSnapshot = ttsHealthSnapshot;
      throw error;
    }

    const ttsTelemetryHeader = response.headers.get("X-Voxis-Tts-Telemetry");
    let parsedTelemetry = null;
    if (ttsTelemetryHeader) {
      try {
        parsedTelemetry = JSON.parse(decodeURIComponent(ttsTelemetryHeader));
      } catch {
        parsedTelemetry = null;
      }
    }

    const ttsSfxTimelineHeader = response.headers.get("X-Voxis-Tts-Sfx-Timeline");
    const ttsSfxHeader = response.headers.get("X-Voxis-Tts-Sfx");
    let parsedSfxTimeline = [];
    
    // Try new timeline header first, fall back to old header for backward compatibility
    if (ttsSfxTimelineHeader) {
      try {
        parsedSfxTimeline = JSON.parse(decodeURIComponent(ttsSfxTimelineHeader));
      } catch {
        parsedSfxTimeline = [];
      }
    } else if (ttsSfxHeader) {
      // Backward compatibility: convert old simple array to timeline format
      try {
        const oldSfx = JSON.parse(decodeURIComponent(ttsSfxHeader));
        if (Array.isArray(oldSfx)) {
          parsedSfxTimeline = oldSfx.map((tag, index) => ({ tag, position: "inline", ms: index * 100 }));
        }
      } catch {
        parsedSfxTimeline = [];
      }
    }

    const blob = await response.blob();
    setTtsCache(cacheKey, blob);
    const nextAudioUrl = URL.createObjectURL(blob);
    const requestMs = Math.round(performance.now() - requestStartedAt);

    if (Array.isArray(parsedSfxTimeline) && parsedSfxTimeline.length > 0) {
      onStatus?.({
        type: "info",
        message: `SFX timeline: ${parsedSfxTimeline.map((s) => s.tag).join(", ")}`,
      });
    }

    const telemetry = parsedTelemetry
      ? {
          ...parsedTelemetry,
          requestMs,
          sentenceChars: String(text || "").length,
          segmentIndex: Number(meta?.segmentIndex ?? -1),
          queueDepthAtRequest: Number(meta?.queueDepthAtRequest ?? 0),
          streamingSegment: Boolean(meta?.streamingSegment),
        }
      : parsedTelemetry;

    return {
      url: nextAudioUrl,
      telemetry,
      sfxTimeline: parsedSfxTimeline.length > 0 ? parsedSfxTimeline : undefined,
    };
  }

  function playNextQueuedStreamAudio({ silentAutoplayBlock = true } = {}) {
    const nextItem = streamReadyAudioQueueRef.current.shift();
    if (!nextItem?.url) {
      streamPlaybackActiveRef.current = false;
      return;
    }

    streamPlaybackActiveRef.current = true;
    setVoiceTelemetry(nextItem.telemetry || null);

    if (nextItem.telemetry?.fallbackUsed) {
      const fallbackFrom = String(nextItem.telemetry.fallbackFrom || "primary engine");
      const chosenEngine = String(nextItem.telemetry.chosenEngine || "fallback engine");
      onStatus?.({
        type: "success",
        message: `TTS fallback active: ${fallbackFrom} failed, switched to ${chosenEngine}.`,
      });
    }

    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }

    pendingSfxTimelineRef.current = Array.isArray(nextItem.sfxTimeline) ? nextItem.sfxTimeline : [];
    pendingAfterSfxTagsRef.current = [];
    lastSfxPlaybackKeyRef.current = "";
    setAudioUrl(nextItem.url);

    requestAnimationFrame(() => {
      const audioElement = audioRef.current;
      if (audioElement instanceof HTMLAudioElement) {
        audioElement.muted = false;
        audioElement.volume = 1;
        audioElement.playbackRate = speechPlaybackRateRef.current;
        void audioElement.play().catch((playError) => {
          if (!silentAutoplayBlock) {
            onStatus?.({
              type: "info",
              message: `Audio ready — press play on the audio control below. ${playError?.message ? `(${playError.message})` : ""}`.trim(),
            });
          }
        });
      }
    });
  }

  async function processStreamingSentenceQueue() {
    if (streamQueueProcessingRef.current || !voiceProfile.enabled || !personality) {
      return;
    }

    streamQueueProcessingRef.current = true;
    setIsGeneratingAudio(true);

    try {
      while (streamPendingSentenceQueueRef.current.length > 0) {
        if (streamReadyAudioQueueRef.current.length >= MAX_STREAM_READY_AUDIO && streamPlaybackActiveRef.current) {
          break;
        }

        const nextSentence = streamPendingSentenceQueueRef.current.shift();
        const normalized = normalizeSpeechChunk(nextSentence?.text || "");
        if (!normalized || !nextSentence?.segmentKey) {
          continue;
        }

        const controller = new AbortController();
        ttsRequestAbortRef.current = controller;

        const audioResult = await requestSpeechAudio(normalized, controller, {
          segmentIndex: nextSentence.segmentIndex,
          queueDepthAtRequest: getStreamQueueDepth(),
          streamingSegment: true,
        });
        streamReadyAudioQueueRef.current.push(audioResult);

        if (!streamPlaybackActiveRef.current && !isAudioPlaying) {
          playNextQueuedStreamAudio({ silentAutoplayBlock: true });
        }
      }
    } catch (error) {
      if (error?.name !== "AbortError") {
        const statusPayload = {
          type: "error",
          message: buildTtsErrorMessage(error),
        };
        if (Boolean(error?.isHtmlErrorPage) && Number(error?.httpStatus || 0) === 502) {
          statusPayload.actionId = "run-connectivity-diagnostics";
          statusPayload.actionLabel = "Run diagnostics";
        }
        onStatus?.(statusPayload);
      }
    } finally {
      if (ttsRequestAbortRef.current) {
        ttsRequestAbortRef.current = null;
      }
      streamQueueProcessingRef.current = false;
      setIsGeneratingAudio(false);

      if (streamPendingSentenceQueueRef.current.length > 0 && !streamPlaybackActiveRef.current) {
        void processStreamingSentenceQueue();
      }
    }
  }

  function handlePlaybackRateChange(rate) {
    speechPlaybackRateRef.current = rate;
    setSpeechPlaybackRate(rate);
    const audioElement = audioRef.current;
    if (audioElement instanceof HTMLAudioElement) {
      audioElement.playbackRate = rate;
    }
  }

  function stopSpeaking() {
    const hadPendingRequest = Boolean(ttsRequestAbortRef.current);
    const audioElement = audioRef.current;
    const hadActivePlayback = Boolean(
      audioElement instanceof HTMLAudioElement &&
      !audioElement.paused &&
      !audioElement.ended,
    );

    if (ttsRequestAbortRef.current) {
      ttsRequestAbortRef.current.abort();
      ttsRequestAbortRef.current = null;
    }

    streamAutoplaySessionRef.current = null;
    clearStreamingAutoplayQueues({ revokeQueuedAudio: true });

    if (audioElement instanceof HTMLAudioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
    }

    setIsGeneratingAudio(false);
    setIsAudioPlaying(false);
    setSpeechEnergy(0);
    clearActiveSfxPlayback();
    pendingAfterSfxTagsRef.current = [];
    pendingSfxTimelineRef.current = [];
    lastSfxPlaybackKeyRef.current = "";

    if (hadPendingRequest || hadActivePlayback || isGeneratingAudio || isAudioPlaying) {
      onStatus?.({
        type: "info",
        message: "Voice stopped. Any pending TTS generation was canceled.",
      });
    }
  }

  async function generateAudio(text, { silentAutoplayBlock = false } = {}) {
    if (!voiceProfile.enabled || !text.trim() || !personality) {
      return;
    }

    // Manual/single-shot playback takes ownership from streaming queue mode.
    streamAutoplaySessionRef.current = null;
    clearStreamingAutoplayQueues({ revokeQueuedAudio: true });

    setIsGeneratingAudio(true);
    const controller = new AbortController();
    ttsRequestAbortRef.current = controller;

    try {
      const audioResult = await requestSpeechAudio(text, controller);
      const nextAudioUrl = audioResult.url;

      setVoiceTelemetry(audioResult.telemetry);

      if (audioResult.telemetry?.fallbackUsed) {
        const fallbackFrom = String(audioResult.telemetry.fallbackFrom || "primary engine");
        const chosenEngine = String(audioResult.telemetry.chosenEngine || "fallback engine");
        onStatus?.({
          type: "success",
          message: `TTS fallback active: ${fallbackFrom} failed, switched to ${chosenEngine}.`,
        });
      }

      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }

      clearActiveSfxPlayback();
      pendingAfterSfxTagsRef.current = [];
      pendingSfxTimelineRef.current = [];
      lastSfxPlaybackKeyRef.current = "";

      pendingSfxTimelineRef.current = Array.isArray(audioResult.sfxTimeline) ? audioResult.sfxTimeline : [];
      pendingAfterSfxTagsRef.current = [];
      lastSfxPlaybackKeyRef.current = "";
      setAudioUrl(nextAudioUrl);

      requestAnimationFrame(() => {
        const audioElement = audioRef.current;
        if (audioElement instanceof HTMLAudioElement) {
          audioElement.muted = false;
          audioElement.volume = 1;
          audioElement.playbackRate = speechPlaybackRateRef.current;
          void audioElement.play().catch((playError) => {
            if (!silentAutoplayBlock) {
              onStatus?.({
                type: "info",
                message: `Audio ready — press play on the audio control below. ${playError?.message ? `(${playError.message})` : ""}`.trim(),
              });
            }
          });
        }
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        return;
      }

      const statusPayload = {
        type: "error",
        message: buildTtsErrorMessage(error),
      };
      if (Boolean(error?.isHtmlErrorPage) && Number(error?.httpStatus || 0) === 502) {
        statusPayload.actionId = "run-connectivity-diagnostics";
        statusPayload.actionLabel = "Run diagnostics";
      }
      onStatus?.(statusPayload);
    } finally {
      if (ttsRequestAbortRef.current === controller) {
        ttsRequestAbortRef.current = null;
      }
      setIsGeneratingAudio(false);
    }
  }

  function handleAudioEnded() {
    setIsAudioPlaying(false);

    const afterTags = [...pendingAfterSfxTagsRef.current];
    pendingAfterSfxTagsRef.current = [];
    for (const tag of afterTags) {
      playSfxTag(tag);
    }
    clearActiveSfxPlayback();

    if (streamReadyAudioQueueRef.current.length > 0) {
      playNextQueuedStreamAudio({ silentAutoplayBlock: true });
      if (streamPendingSentenceQueueRef.current.length > 0 && !streamQueueProcessingRef.current) {
        void processStreamingSentenceQueue();
      }
      return;
    }

    streamPlaybackActiveRef.current = false;
    if (streamPendingSentenceQueueRef.current.length > 0 && !streamQueueProcessingRef.current) {
      void processStreamingSentenceQueue();
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
        kokoroVoice: voiceProfile.kokoroVoice || "af_heart",
        elevenLabsVoiceId: voiceProfile.elevenLabsVoiceId || "",
        elevenLabsModel: voiceProfile.elevenLabsModel || "eleven_multilingual_v2",
        providerModel: voiceProfile.providerModel,
        cartesiaVoiceId: voiceProfile.cartesiaVoiceId || "",
        cartesiaModel: voiceProfile.cartesiaModel || "sonic-3",
        sfxVolume: Number(voiceProfile.sfxVolume ?? 0.85),
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

    if (onUpdateMemory) {
      const ok = await onUpdateMemory({ memoryId, content, memoryType });
      if (!ok) {
        onStatus?.({ type: "error", message: "Failed to update memory." });
        return;
      }
      onStatus?.({ type: "success", message: "Memory updated." });
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
    setAttachedFile(null);
    await onSend(message);
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit(event);
    }
  }

  function handleFileSelect(event) {
    const file = event.target.files?.[0];
    if (file) {
      setAttachedFile(file);
    }
  }

  function handleFileButtonClick() {
    fileInputRef.current?.click();
  }

  function handleRemoveFile() {
    setAttachedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    const file = event.dataTransfer.files?.[0];
    if (file) {
      setAttachedFile(file);
    }
  }

  const clearRecognitionTimers = useCallback(() => {
    if (recognitionRestartTimerRef.current) {
      window.clearTimeout(recognitionRestartTimerRef.current);
      recognitionRestartTimerRef.current = null;
    }
    if (recognitionInactivityTimerRef.current) {
      window.clearTimeout(recognitionInactivityTimerRef.current);
      recognitionInactivityTimerRef.current = null;
    }
  }, []);

  const stopRecognitionSession = useCallback((clearRequested = false) => {
    if (clearRequested) {
      recordingRequestedRef.current = false;
    }
    clearRecognitionTimers();

    const activeRecognition = recognitionRef.current;
    recognitionRef.current = null;
    if (activeRecognition) {
      try {
        activeRecognition.stop();
      } catch {
        /* ignore */
      }
    }

    if (clearRequested) {
      setIsRecording(false);
    }
  }, [clearRecognitionTimers]);

  const resetRecognitionInactivityTimer = useCallback(() => {
    if (recognitionInactivityTimerRef.current) {
      window.clearTimeout(recognitionInactivityTimerRef.current);
      recognitionInactivityTimerRef.current = null;
    }

    recognitionInactivityTimerRef.current = window.setTimeout(() => {
      if (recordingRequestedRef.current) {
        stopRecognitionSession(true);
      }
    }, VOICE_CAPTURE_SILENCE_TIMEOUT_MS);
  }, [stopRecognitionSession]);

  const startRecognitionSession = useCallback(() => {
    if (!recordingRequestedRef.current || recognitionRef.current || isAudioPlaying || isGeneratingAudio) {
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      recordingRequestedRef.current = false;
      setIsRecording(false);
      onStatus?.({ type: "error", message: "Speech recognition is not supported in this browser." });
      return;
    }

    clearRecognitionTimers();
    const recognition = new SpeechRecognition();
    const draftPrefix = String(draftRef.current || "").trim();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      resetRecognitionInactivityTimer();
    };

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => String(result?.[0]?.transcript || "").trim())
        .filter(Boolean)
        .join(" ")
        .trim();

      if (!transcript) {
        return;
      }

      const nextDraft = [draftPrefix, transcript].filter(Boolean).join(" ").trim();
      setDraft(nextDraft);
      resetRecognitionInactivityTimer();
    };

    recognition.onerror = (event) => {
      recognitionRef.current = null;
      clearRecognitionTimers();

      const code = String(event?.error || "").toLowerCase();
      if (code && !["aborted", "no-speech"].includes(code)) {
        console.error("Speech recognition error:", code);
      }
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      clearRecognitionTimers();

      if (!recordingRequestedRef.current) {
        setIsRecording(false);
        return;
      }

      if (isAudioPlaying || isGeneratingAudio) {
        return;
      }

      recognitionRestartTimerRef.current = window.setTimeout(() => {
        startRecognitionSession();
      }, VOICE_CAPTURE_RESTART_DELAY_MS);
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
      setIsRecording(true);
    } catch {
      recognitionRef.current = null;
      setIsRecording(false);
    }
  }, [clearRecognitionTimers, isAudioPlaying, isGeneratingAudio, onStatus, resetRecognitionInactivityTimer]);

  useEffect(() => {
    if (isAudioPlaying || isGeneratingAudio) {
      if (recognitionRef.current) {
        stopRecognitionSession(false);
      }
      return;
    }

    if (recordingRequestedRef.current && !recognitionRef.current) {
      startRecognitionSession();
    }
  }, [isAudioPlaying, isGeneratingAudio, startRecognitionSession, stopRecognitionSession]);

  useEffect(() => {
    return () => {
      recordingRequestedRef.current = false;
      stopRecognitionSession(true);

      if (speechEnergyTimerRef.current) {
        window.clearInterval(speechEnergyTimerRef.current);
        speechEnergyTimerRef.current = null;
      }

      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }

      if (zoneShiftTimerRef.current) {
        window.clearTimeout(zoneShiftTimerRef.current);
      }

      if (personalityEventsTimerRef.current) {
        window.clearTimeout(personalityEventsTimerRef.current);
      }

      clearStreamingAutoplayQueues({ revokeQueuedAudio: true });
    };
  }, [audioUrl, stopRecognitionSession]);

  function toggleRecording() {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      onStatus?.({ type: "error", message: "Speech recognition is not supported in this browser." });
      return;
    }

    if (recordingRequestedRef.current) {
      stopRecognitionSession(true);
    } else {
      recordingRequestedRef.current = true;
      startRecognitionSession();
    }
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

  const phaseSuggestsSpeech = ["generation", "reply", "token"].includes(String(livePhase || "").trim().toLowerCase());
  const avatarSpeaking = phaseSuggestsSpeech || isAudioPlaying;

  return (
    <>
      <style>{chatStyles}</style>
      {performanceText && (
        <PerformancePlayer
          personalityId={personality.id}
          text={performanceText}
          voiceProfile={voiceProfile}
          onClose={() => setPerformanceText(null)}
        />
      )}
      <div className="chat-shell">
        <div className={`chat-card${!disableNeuronMap3d && neuralActivity > 0.4 ? " neural-active" : ""}`}>
          <NeuralCore
            personality={personality}
            mode={activeMode || "scientist"}
            latestDebug={displayDebug}
            livePhase={livePhase}
            liveSeq={liveSeq}
            performanceTier={performanceTier}
            voiceNarrationEnabled={Boolean(neuralProfile?.voiceNarrationEnabled)}
            allowThreeD={!disableNeuronMap3d}
            defaultLayoutView={disableNeuronMap3d}
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
                      title={emotionSpectrum.displayLabel}
                      style={{
                        background: emotionSpectrum.zone.accent,
                        "--mood-dot-glow": emotionSpectrum.zone.glow,
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
                    imageUrl={personality?.avatarImageUrl || ""}
                  />
                  <span>{personality.name}</span>
                </span>
              </h3>
              <button type="button" className="debug-toggle" onClick={() => setDebugMode((value) => !value)}>
                {debugMode ? "Hide Debug" : "Show Debug"}
              </button>
              <button type="button" className="debug-toggle" onClick={() => setSysObserverOpen((v) => !v)} style={{ marginLeft: 6 }}>
                {sysObserverOpen ? "Hide System" : "⬡ System"}
              </button>
            </div>
            <p>{personality.description}</p>
            {personality.moodState && (
              <div className="mood-bar">
                <span
                  className="mood-zone-badge"
                  style={{
                    background: emotionSpectrum.zone.accent + "22",
                    color: emotionSpectrum.zone.accent,
                    border: `1px solid ${emotionSpectrum.zone.accent}55`,
                  }}
                >
                  {emotionSpectrum.zone.label}
                </span>
                <span className="mood-emotion-label">{emotionSpectrum.displayLabel}</span>
                <div className="mood-vad-pair">
                  <div className="mood-vad-stat">
                    <span className="mood-vad-label">V</span>
                    <span className="mood-vad-value">{(avatarMood.valence >= 0 ? "+" : "") + Number(avatarMood.valence || 0).toFixed(2)}</span>
                  </div>
                  <div className="mood-vad-stat">
                    <span className="mood-vad-label">A</span>
                    <span className="mood-vad-value">{(avatarMood.arousal >= 0 ? "+" : "") + Number(avatarMood.arousal || 0).toFixed(2)}</span>
                  </div>
                </div>
                {emotionDriftPath && (
                  <svg className="mood-drift-svg" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
                    <line x1="0" y1="12" x2="100" y2="12" stroke="rgba(0,180,255,0.18)" strokeWidth="1" strokeDasharray="2 2" />
                    <polyline
                      points={emotionDriftPath}
                      fill="none"
                      stroke={emotionSpectrum.zone.accent}
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
            )}
          </div>

          <div className="voice-panel">
            <div className="voice-panel-header">
              <div className="voice-panel-label">
          {sysObserverOpen && (
            <div className="sys-observer">
              <div className="sys-observer-inner">
                <div className="sys-observer-grid">

                  {/* LLM */}
                  <div className="sys-observer-card">
                    <div className="sys-observer-card-title">LLM</div>
                    <div className="sys-observer-row">
                      <span className="sys-observer-label">model</span>
                      <span className="sys-observer-value" title={activeUsage?.model || "unknown"}>
                        {activeUsage?.model ? activeUsage.model.split("/").pop() : "—"}
                      </span>
                    </div>
                    <div className="sys-observer-row">
                      <span className="sys-observer-label">tokens in</span>
                      <span className="sys-observer-value">{activeUsage ? Number(activeUsage.inputTokens || 0).toLocaleString() : "—"}</span>
                    </div>
                    <div className="sys-observer-row">
                      <span className="sys-observer-label">tokens out</span>
                      <span className="sys-observer-value">{activeUsage ? Number(activeUsage.outputTokens || 0).toLocaleString() : "—"}</span>
                    </div>
                    <div className="sys-observer-row">
                      <span className="sys-observer-label">source</span>
                      <span className="sys-observer-value">{activeUsage?.source === "provider" ? "provider" : "estimate"}</span>
                    </div>
                  </div>

                  {/* Prompt Budget */}
                  <div className="sys-observer-card">
                    <div className="sys-observer-card-title">Prompt Budget</div>
                    {(() => {
                      const budget = displayDebug?.prompt?.promptBudget;
                      const util = budget ? Math.round((budget.utilization || 0) * 100) : null;
                      const fillColor = util == null ? "#4ade80" : util >= 90 ? "#fb7185" : util >= 75 ? "#fbbf24" : "#4ade80";
                      return budget ? (
                        <>
                          <div className="sys-observer-row">
                            <span className="sys-observer-label">chars used</span>
                            <span className="sys-observer-value">{Number(budget.charCount || 0).toLocaleString()} / {Number(budget.charBudget || 0).toLocaleString()}</span>
                          </div>
                          <div className="sys-observer-row">
                            <span className="sys-observer-label">~tokens</span>
                            <span className="sys-observer-value">{Number(budget.approxTokens || 0).toLocaleString()}</span>
                          </div>
                          <div className="sys-observer-bar-wrap">
                            <div className="sys-observer-bar-track">
                              <div className="sys-observer-bar-fill" style={{ width: `${util}%`, background: fillColor }} />
                            </div>
                            <div className="sys-observer-bar-label">{util}% utilized</div>
                          </div>
                        </>
                      ) : <span className="sys-observer-label">No prompt data yet</span>;
                    })()}
                  </div>

                  {/* Memory */}
                  <div className="sys-observer-card">
                    <div className="sys-observer-card-title">Memory</div>
                    <div className="sys-observer-row">
                      <span className="sys-observer-label">embeddings</span>
                      {displayDebug?.flags?.embeddingsConfigured === false ? (
                        <span className="sys-observer-status warn">disabled</span>
                      ) : displayDebug?.flags?.embeddingsConfigured === true ? (
                        <span className="sys-observer-status ok">active</span>
                      ) : (
                        <span className="sys-observer-status off">unknown</span>
                      )}
                    </div>
                    <div className="sys-observer-row">
                      <span className="sys-observer-label">injected</span>
                      <span className="sys-observer-value">{displayDebug?.memoryInjected ? displayDebug.memoryInjected.length : "—"}</span>
                    </div>
                    <div className="sys-observer-row">
                      <span className="sys-observer-label">user memories</span>
                      <span className="sys-observer-value">{displayDebug?.userMemoryRetrieved ? displayDebug.userMemoryRetrieved.length : "—"}</span>
                    </div>
                    <div className="sys-observer-row">
                      <span className="sys-observer-label">conflicts</span>
                      <span className="sys-observer-value">{displayDebug?.memoryConflicts ? displayDebug.memoryConflicts.length : "—"}</span>
                    </div>
                  </div>

                  {/* Mood Adjudication */}
                  <div className="sys-observer-card">
                    <div className="sys-observer-card-title">Mood Adjudication</div>
                    {(() => {
                      const adj = displayDebug?.mood?.adjudication;
                      const runtime = displayDebug?.mood?.runtime;
                      return adj ? (
                        <>
                          <div className="sys-observer-row">
                            <span className="sys-observer-label">method</span>
                            <span className="sys-observer-value">{String(adj.method || adj.source || "vad-decay")}</span>
                          </div>
                          <div className="sys-observer-row">
                            <span className="sys-observer-label">Δ valence</span>
                            <span className="sys-observer-value">
                              {Number.isFinite(adj.delta?.valence) ? (adj.delta.valence >= 0 ? "+" : "") + adj.delta.valence.toFixed(3) : "—"}
                            </span>
                          </div>
                          <div className="sys-observer-row">
                            <span className="sys-observer-label">Δ arousal</span>
                            <span className="sys-observer-value">
                              {Number.isFinite(adj.delta?.arousal) ? (adj.delta.arousal >= 0 ? "+" : "") + adj.delta.arousal.toFixed(3) : "—"}
                            </span>
                          </div>
                          {runtime != null && (
                            <div className="sys-observer-row">
                              <span className="sys-observer-label">runtime</span>
                              <span className="sys-observer-value">{String(runtime)}</span>
                            </div>
                          )}
                        </>
                      ) : <span className="sys-observer-label">No adjudication data yet</span>;
                    })()}
                  </div>

                  {/* Persona State Monitor */}
                  <div className="sys-observer-card">
                    <div className="sys-observer-card-title">Live State Monitor</div>
                    {(() => {
                      const runtime = displayDebug?.stateRuntime;
                      const snapshot = runtime?.snapshot;
                      const directives = runtime?.directives;
                      const stability = Number(runtime?.stabilityIndex);
                      const channels = [
                        { key: "intoxication", label: "intoxication", value: Number(snapshot?.intoxication || 0), hue: "#ff9f43" },
                        { key: "fatigue", label: "fatigue", value: Number(snapshot?.fatigue || 0), hue: "#feca57" },
                        { key: "agitation", label: "agitation", value: Number(snapshot?.agitation || 0), hue: "#ff6b6b" },
                        { key: "focus", label: "focus", value: Number(snapshot?.focus || 0), hue: "#2ed573" },
                      ];

                      function Sparkline({ dataKey, hue }) {
                        const pts = stateDriftHistory.map((e) => e[dataKey] ?? 0);
                        if (pts.length < 2) return null;
                        const w = 60, h = 14, pad = 1;
                        const xs = pts.map((_, i) => pad + (i / (pts.length - 1)) * (w - pad * 2));
                        const ys = pts.map((v) => pad + (1 - Math.max(0, Math.min(1, v))) * (h - pad * 2));
                        const d = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
                        return (
                          <svg width={w} height={h} style={{ display: "block", flexShrink: 0, opacity: 0.85 }}>
                            <polyline points={pts.map((v, i) => `${xs[i].toFixed(1)},${ys[i].toFixed(1)}`).join(" ")} fill="none" stroke={hue} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
                          </svg>
                        );
                      }

                      if (!snapshot) {
                        return <span className="sys-observer-label">No state runtime data yet. Enable a channel and send a message.</span>;
                      }

                      return (
                        <>
                          {channels.map((item) => (
                            <div key={item.key} style={{ marginBottom: "6px" }}>
                              <div className="sys-observer-row" style={{ marginBottom: "2px" }}>
                                <span className="sys-observer-label">{item.label}</span>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                  <Sparkline dataKey={item.key} hue={item.hue} />
                                  <span className="sys-observer-value">{Math.round(Math.max(0, Math.min(1, item.value)) * 100)}%</span>
                                </div>
                              </div>
                              <div className="sys-observer-bar-track">
                                <div
                                  className="sys-observer-bar-fill"
                                  style={{
                                    width: `${Math.round(Math.max(0, Math.min(1, item.value)) * 100)}%`,
                                    background: item.hue,
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                          <div style={{ marginTop: "8px", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "6px" }}>
                            <div className="sys-observer-row">
                              <span className="sys-observer-label">stability index</span>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <Sparkline dataKey="stabilityIndex" hue="#a29bfe" />
                                <span className="sys-observer-value">{Number.isFinite(stability) ? `${Math.round(Math.max(0, Math.min(1, stability)) * 100)}%` : "—"}</span>
                              </div>
                            </div>
                            {[
                              { k: "coherencePenalty", label: "coherence penalty" },
                              { k: "fragmentation", label: "fragmentation" },
                              { k: "interruptions", label: "interruptions" },
                              { k: "tangentChance", label: "tangent chance" },
                              { k: "fillerRate", label: "filler rate" },
                              { k: "impulseBurpChance", label: "burp impulse" },
                            ].map(({ k, label }) => {
                              const val = Number(directives?.[k]);
                              return (
                                <div className="sys-observer-row" key={k}>
                                  <span className="sys-observer-label">{label}</span>
                                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <Sparkline dataKey={k} hue="#74b9ff" />
                                    <span className="sys-observer-value">{Number.isFinite(val) ? `${Math.round(Math.max(0, Math.min(1, val)) * 100)}%` : "—"}</span>
                                  </div>
                                </div>
                              );
                            })}
                            {stateDriftHistory.length > 0 && (
                              <div className="sys-observer-row" style={{ marginTop: "4px" }}>
                                <span className="sys-observer-label" style={{ opacity: 0.5 }}>turns tracked</span>
                                <span className="sys-observer-value" style={{ opacity: 0.5 }}>{stateDriftHistory.length}</span>
                              </div>
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {/* TTS */}
                  <div className="sys-observer-card">
                    <div className="sys-observer-card-title">TTS</div>
                    <div className="sys-observer-row">
                      <span className="sys-observer-label">engine</span>
                      <span className="sys-observer-value">{voiceTelemetry ? String(voiceTelemetry.chosenEngine || "—") : "—"}</span>
                    </div>
                    <div className="sys-observer-row">
                      <span className="sys-observer-label">requested</span>
                      <span className="sys-observer-value">{voiceTelemetry ? String(voiceTelemetry.requestedRaw || voiceTelemetry.requested || "auto") : "—"}</span>
                    </div>
                    <div className="sys-observer-row">
                      <span className="sys-observer-label">fallback</span>
                      {voiceTelemetry ? (
                        voiceTelemetry.fallbackUsed ? (
                          <span className="sys-observer-status warn">from {String(voiceTelemetry.fallbackFrom || "primary")}</span>
                        ) : (
                          <span className="sys-observer-status ok">none</span>
                        )
                      ) : <span className="sys-observer-value">—</span>}
                    </div>
                    {voiceTelemetry?.fallbackUsed && voiceTelemetry.fallbackReason ? (
                      <div className="sys-observer-row">
                        <span className="sys-observer-label">reason</span>
                        <span className="sys-observer-value" title={String(voiceTelemetry.fallbackReason)}>
                          {String(voiceTelemetry.fallbackReason).slice(0, 24)}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  {/* Rate Limit */}
                  <div className="sys-observer-card">
                    <div className="sys-observer-card-title">Rate Limit</div>
                    {(() => {
                      const rl = displayDebug?.rateLimit;
                      return rl ? (
                        <>
                          <div className="sys-observer-row">
                            <span className="sys-observer-label">hit</span>
                            {rl.hit ? <span className="sys-observer-status warn">yes</span> : <span className="sys-observer-status ok">no</span>}
                          </div>
                          {rl.retryAttempted ? (
                            <div className="sys-observer-row">
                              <span className="sys-observer-label">retry</span>
                              {rl.retrySucceeded ? <span className="sys-observer-status ok">ok</span> : <span className="sys-observer-status warn">failed</span>}
                            </div>
                          ) : null}
                          {rl.fallbackDelivered ? (
                            <div className="sys-observer-row">
                              <span className="sys-observer-label">fallback</span>
                              <span className="sys-observer-status warn">delivered</span>
                            </div>
                          ) : null}
                        </>
                      ) : <span className="sys-observer-label">No rate limit events</span>;
                    })()}
                  </div>

                </div>
              </div>
            </div>
          )}
                <span className="voice-panel-dot" />
                QUICK VOICE
              </div>
              <span className={`voice-provider-badge ${providerBadge.tone}`.trim()}>{providerBadge.label}</span>
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

            <div className="voice-selector">
              <label htmlFor="voice-engine-select">Engine:</label>
              <select
                id="voice-engine-select"
                value={voiceProfile.engine || "auto"}
                onChange={(event) => updateVoiceField("engine", normalizeVoiceEngineForDebug(event.target.value))}
                style={{ marginBottom: 6 }}
              >
                {TTS_DEBUG_PROVIDER_LOCK ? (
                  <>
                    <option value="auto">{TTS_DISABLE_KOKORO ? "Auto (cartesia only)" : "Auto (cartesia → kokoro)"}</option>
                    {TTS_DISABLE_KOKORO ? null : <option value="kokoro">Kokoro (local, free)</option>}
                    <option value="cartesia">Cartesia</option>
                  </>
                ) : (
                  <>
                    <option value="auto">Auto (server default)</option>
                    <option value="cloud">Cloud (OpenAI)</option>
                    <option value="kokoro">Kokoro (local, free)</option>
                    <option value="piper">Piper (local)</option>
                    <option value="elevenlabs">ElevenLabs</option>
                    <option value="cartesia">Cartesia</option>
                  </>
                )}
              </select>
              <label htmlFor="voice-quick-select">Voice:</label>
              {voiceProfile.engine === "kokoro" ? (
                <select
                  id="voice-quick-select"
                  value={voiceProfile.kokoroVoice || "af_heart"}
                  onChange={(event) => updateVoiceField("kokoroVoice", event.target.value)}
                >
                  <option value="af_heart">af_heart — warm female</option>
                  <option value="af_nova">af_nova — energetic female</option>
                  <option value="af_sarah">af_sarah — casual female</option>
                  <option value="af_sky">af_sky — light female</option>
                  <option value="am_adam">am_adam — warm male</option>
                  <option value="am_onyx">am_onyx — deep male</option>
                  <option value="am_michael">am_michael — mid male</option>
                  <option value="bf_alice">bf_alice — British female</option>
                  <option value="bf_emma">bf_emma — expressive British female</option>
                  <option value="bm_george">bm_george — engaging British male</option>
                  <option value="bm_lewis">bm_lewis — calm British male</option>
                </select>
              ) : voiceProfile.engine === "cartesia" || (TTS_DEBUG_PROVIDER_LOCK && voiceProfile.engine === "auto") ? (
                <>
                  <select
                    id="voice-quick-select"
                    value={selectedCartesiaVoiceOption}
                    onChange={(event) => {
                      const nextValue = String(event.target.value || "");
                      if (nextValue === CUSTOM_CARTESIA_VOICE_OPTION) {
                        if (!String(voiceProfile.cartesiaVoiceId || "").trim()) {
                          updateVoiceField("cartesiaVoiceId", "");
                        }
                        return;
                      }
                      updateVoiceField("cartesiaVoiceId", nextValue);
                    }}
                  >
                    {cartesiaVoiceOptions.map((voice) => (
                      <option key={voice.id} value={voice.id}>{voice.label}</option>
                    ))}
                    {/* If the saved voice is not in the fetched list, show it explicitly */}
                    {voiceProfile.cartesiaVoiceId &&
                      !cartesiaVoiceOptions.some((v) => v.id === voiceProfile.cartesiaVoiceId) ? (
                      <option value={voiceProfile.cartesiaVoiceId}>
                        {voiceProfile.cartesiaVoiceId} (saved)
                      </option>
                    ) : null}
                    <option value={CUSTOM_CARTESIA_VOICE_OPTION}>Custom voice ID...</option>
                  </select>
                  {selectedCartesiaVoiceOption === CUSTOM_CARTESIA_VOICE_OPTION ? (
                    <input
                      type="text"
                      placeholder="Cartesia voice ID (UUID)"
                      value={voiceProfile.cartesiaVoiceId || ""}
                      onChange={(event) => updateVoiceField("cartesiaVoiceId", event.target.value)}
                      style={{ marginTop: 8, fontFamily: "monospace", fontSize: "0.78rem", padding: "4px 8px", borderRadius: "6px", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(0,234,255,0.2)", color: "#88ecff", width: "100%", boxSizing: "border-box" }}
                    />
                  ) : null}
                </>
              ) : voiceProfile.engine === "elevenlabs" ? (
                <>
                  <select
                    id="voice-quick-select"
                    value={selectedElevenLabsVoiceOption}
                    onChange={(event) => {
                      const nextValue = String(event.target.value || "");
                      if (nextValue === CUSTOM_ELEVENLABS_VOICE_OPTION) {
                        if (!String(voiceProfile.elevenLabsVoiceId || "").trim()) {
                          updateVoiceField("elevenLabsVoiceId", "");
                        }
                        return;
                      }
                      updateVoiceField("elevenLabsVoiceId", nextValue);
                    }}
                  >
                    {elevenLabsVoiceOptions.map((voice) => (
                      <option key={voice.id} value={voice.id}>{voice.label}</option>
                    ))}
                    {voiceProfile.elevenLabsVoiceId &&
                      !elevenLabsVoiceOptions.some((v) => v.id === voiceProfile.elevenLabsVoiceId) ? (
                      <option value={voiceProfile.elevenLabsVoiceId}>
                        {voiceProfile.elevenLabsVoiceId} (saved)
                      </option>
                    ) : null}
                    <option value={CUSTOM_ELEVENLABS_VOICE_OPTION}>Custom voice ID...</option>
                  </select>
                  {selectedElevenLabsVoiceOption === CUSTOM_ELEVENLABS_VOICE_OPTION ? (
                    <input
                      type="text"
                      placeholder="ElevenLabs voice ID"
                      value={voiceProfile.elevenLabsVoiceId || ""}
                      onChange={(event) => updateVoiceField("elevenLabsVoiceId", event.target.value)}
                      style={{ marginTop: 8, fontFamily: "monospace", fontSize: "0.78rem", padding: "4px 8px", borderRadius: "6px", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(0,234,255,0.2)", color: "#88ecff", width: "100%", boxSizing: "border-box" }}
                    />
                  ) : null}
                  <label htmlFor="elevenlabs-model-select" style={{ display: "block", marginTop: 8 }}>Model:</label>
                  <select
                    id="elevenlabs-model-select"
                    value={selectedElevenLabsModelOption}
                    onChange={(event) => {
                      const nextValue = String(event.target.value || "");
                      if (nextValue === CUSTOM_ELEVENLABS_MODEL_OPTION) {
                        if (!String(voiceProfile.elevenLabsModel || "").trim()) {
                          updateVoiceField("elevenLabsModel", "");
                        }
                        return;
                      }
                      updateVoiceField("elevenLabsModel", nextValue);
                    }}
                  >
                    {elevenLabsModelOptions.map((model) => (
                      <option key={model.id} value={model.id}>{model.label}</option>
                    ))}
                    {voiceProfile.elevenLabsModel &&
                      !elevenLabsModelOptions.some((m) => m.id === voiceProfile.elevenLabsModel) ? (
                      <option value={voiceProfile.elevenLabsModel}>
                        {voiceProfile.elevenLabsModel} (saved)
                      </option>
                    ) : null}
                    <option value={CUSTOM_ELEVENLABS_MODEL_OPTION}>Custom model...</option>
                  </select>
                  {selectedElevenLabsModelOption === CUSTOM_ELEVENLABS_MODEL_OPTION ? (
                    <input
                      type="text"
                      placeholder="ElevenLabs model ID"
                      value={voiceProfile.elevenLabsModel || ""}
                      onChange={(event) => updateVoiceField("elevenLabsModel", event.target.value)}
                      style={{ marginTop: 8, fontFamily: "monospace", fontSize: "0.78rem", padding: "4px 8px", borderRadius: "6px", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(0,234,255,0.2)", color: "#88ecff", width: "100%", boxSizing: "border-box" }}
                    />
                  ) : null}
                </>
              ) : (
                <select
                  id="voice-quick-select"
                  value={voiceProfile.providerVoice || "alloy"}
                  onChange={(event) => updateVoiceField("providerVoice", event.target.value)}
                >
                  <option value="alloy">Alloy — neutral, balanced</option>
                  <option value="echo">Echo — steady, expressive</option>
                  <option value="fable">Fable — warm, engaging</option>
                  <option value="onyx">Onyx — deep, authoritative</option>
                  <option value="nova">Nova — bright, dynamic</option>
                  <option value="shimmer">Shimmer — crisp, energetic</option>
                  <option value="ash">Ash — measured</option>
                  <option value="sage">Sage — calm female</option>
                </select>
              )}
            </div>

            <div className="voice-actions">
              <button
                type="button"
                  className="voice-btn"
                  onClick={() => void generateAudio(latestAssistantSpeechText)}
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

            {voiceTelemetry?.emotionFrame ? (
              <div className="voice-telemetry">
                Voice emotion: {String(voiceTelemetry.emotionFrame.displayLabel || "Neutral")} | Zone:
                {` ${String(voiceTelemetry.emotionFrame.zone?.label || "Green Zone")}`} | Intensity:
                {` ${Math.round(Number(voiceTelemetry.emotionFrame.intensity || 0) * 100)}%`}
              </div>
            ) : null}

            {voiceTelemetry ? (
              <div className="voice-telemetry">
                TTS engine: {String(voiceTelemetry.requestedRaw || voiceTelemetry.requested || "auto")}
                {voiceTelemetry.requestedCoerced ? ` -> ${String(voiceTelemetry.requested || "auto")}` : ""}
                {` -> ${String(voiceTelemetry.chosenEngine || "unknown")}`}
                {voiceTelemetry.fallbackUsed
                  ? ` (fallback from ${String(voiceTelemetry.fallbackFrom || "primary")})`
                  : ""}
                {voiceTelemetry.fallbackUsed && voiceTelemetry.fallbackReason
                  ? ` | reason: ${String(voiceTelemetry.fallbackReason)}`
                  : ""}
                {Array.isArray(voiceTelemetry.attemptedEngines) && voiceTelemetry.attemptedEngines.length > 0
                  ? ` | attempts: ${voiceTelemetry.attemptedEngines.map((item) => String(item || "").trim()).filter(Boolean).join(" -> ")}`
                  : ""}
              </div>
            ) : null}

            {voiceTelemetry?.expressiveText ? (
              <div className="expressive-speech">
                <span className="expressive-speech-label">voice rendering</span>
                {String(voiceTelemetry.expressiveText)}
              </div>
            ) : null}

            {activePersonalityEvents.length > 0 ? (
              <div className="personality-events" role="status" aria-live="polite">
                {activePersonalityEvents.map((event) => {
                  const eventTypeClass = event.type === "voice-tag" ? "voice-tag" : "catchphrase";
                  const label = event.type === "voice-tag"
                    ? "voice tag"
                    : event.spoken
                      ? "spoken phrase"
                      : "overlay phrase";
                  const text = event.text || event.tag;

                  return (
                    <div key={event.key} className={`personality-event-chip ${eventTypeClass}`}>
                      <span className="personality-event-label">{label}</span>
                      <span className="personality-event-text">&ldquo;{text}&rdquo;</span>
                      {Number(event.count || 1) > 1 ? (
                        <span className="personality-event-count">x{Number(event.count)}</span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}

            {audioUrl ? (
              <audio
                id="voxis-audio-player"
                ref={audioRef}
                className="audio-player"
                controls
                src={audioUrl}
                onPlay={() => {
                  setIsAudioPlaying(true);
                  triggerSfxForCurrentPlayback(audioRef.current);
                }}
                onPause={() => setIsAudioPlaying(false)}
                onEnded={handleAudioEnded}
              />
            ) : null}

            {audioUrl ? (
              <div className="speed-control">
                <span className="speed-control-label">speed</span>
                {[0.75, 1, 1.25, 1.5].map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    className={`speed-btn${speechPlaybackRate === rate ? " active" : ""}`}
                    onClick={() => handlePlaybackRateChange(rate)}
                  >
                    {rate}×
                  </button>
                ))}
              </div>
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
                imageUrl={personality?.avatarImageUrl || ""}
              />
            </div>
            <div className="avatar-panel-name">{personality.name}</div>
            <div className="avatar-panel-mood">
              <span
                className={`avatar-panel-zone-pill${zoneShiftActive ? " zone-shift" : ""}`}
                style={{
                  "--zone-border": emotionSpectrum.zone.border,
                  "--zone-text": emotionSpectrum.zone.text,
                  "--zone-glow": emotionSpectrum.zone.glow,
                  "--zone-surface": emotionSpectrum.zone.surface,
                }}
              >
                {emotionSpectrum.zone.label}
              </span>
              <span className="avatar-panel-emotion">{emotionSpectrum.displayLabel}</span>
              <div className="avatar-panel-spectrum">
                <div className="avatar-panel-spectrum-track">
                  <span
                    className={`avatar-panel-spectrum-marker${zoneShiftActive ? " zone-shift" : ""}`}
                    style={{
                      left: `${Math.round(((emotionSpectrum.normalized.valence + 1) / 2) * 100)}%`,
                      "--zone-accent": emotionSpectrum.zone.accent,
                      "--zone-glow": emotionSpectrum.zone.glow,
                    }}
                  />
                </div>
                <div className="avatar-panel-intensity">
                  Intensity {Math.round(emotionSpectrum.intensity * 100)}%
                </div>
                <div className="avatar-panel-drift">
                  <div className="avatar-panel-drift-label">Emotional Drift</div>
                  <svg viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
                    <line className="avatar-panel-drift-axis" x1="0" y1="12" x2="100" y2="12" />
                    {emotionDriftPath ? <polyline className="avatar-panel-drift-line" points={emotionDriftPath} /> : null}
                  </svg>
                </div>
              </div>
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
                        {activeMode === "scientist"
                          ? message.content || "Thinking..."
                          : message.displayContent || message.content || "Thinking..."}
                      </>
                    ) : message.role === "assistant" ? (
                      (() => {
                        const formatted = getAssistantDisplayContent(message, activeMode);
                        const canPerform = !message.live && Boolean(message.isPerformanceOutput || isEPF(message.content));
                        return (
                          <>
                            <div className="assistant-normal-main">{formatted.main}</div>
                            {formatted.nextQuestions ? (
                              <div className="assistant-next-questions">
                                <strong>Next Questions</strong>
                                {formatted.nextQuestions}
                              </div>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => void generateAudio(getAssistantSpeechContent(message))}
                              disabled={isGeneratingAudio || !voiceProfile.enabled}
                              title="Replay this response"
                              style={{
                                marginTop: "6px",
                                padding: "2px 7px",
                                borderRadius: "999px",
                                border: "1px solid rgba(0,180,255,0.2)",
                                background: "rgba(0,180,255,0.06)",
                                color: "#8fdfff",
                                fontWeight: 700,
                                fontSize: "0.62rem",
                                letterSpacing: "0.06em",
                                textTransform: "uppercase",
                                cursor: isGeneratingAudio || !voiceProfile.enabled ? "not-allowed" : "pointer",
                                opacity: isGeneratingAudio || !voiceProfile.enabled ? 0.5 : 1,
                              }}
                            >
                              Replay
                            </button>
                            {canPerform && (
                              <button
                                type="button"
                                style={{
                                  marginTop: "10px",
                                  padding: "6px 14px",
                                  borderRadius: "999px",
                                  border: "1px solid rgba(0,234,255,0.30)",
                                  background: "rgba(0,234,255,0.08)",
                                  color: "#00eaff",
                                  fontWeight: 800,
                                  fontSize: "0.75rem",
                                  letterSpacing: "0.12em",
                                  textTransform: "uppercase",
                                  cursor: "pointer",
                                }}
                                onClick={() => setPerformanceText(message.content)}
                              >
                                ▶ Perform
                              </button>
                            )}
                          </>
                        );
                      })()
                    ) : (
                      message.content
                    )}
                    {debugMode && message.role === "assistant" && message.debug ? (
                      (() => {
                        const lensSummary = getResponseLensSummary(message.debug);
                        return (
                          <>
                            {lensSummary ? (
                              <div className="debug-summary">
                                <span className="debug-summary-title">{lensSummary.title}</span>
                                <p className="debug-summary-body">{lensSummary.body}</p>
                                <div className="debug-summary-meta">
                                  {lensSummary.chips.map((chip) => (
                                    <span key={chip} className="debug-summary-chip">{chip}</span>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                            <pre className="debug-panel">{JSON.stringify(message.debug, null, 2)}</pre>
                          </>
                        );
                      })()
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

          {activeUsage ? (
            <div
              className={`context-meter${usagePercent >= 90 ? " danger" : usagePercent >= 75 ? " warn" : ""}`}
              title="Estimated context window usage for this chat turn."
            >
              <div className="context-meter-header">
                <span className="context-meter-label">Context Window</span>
                <span className="context-meter-actions">
                  <span className="context-meter-value">{usagePercent}%</span>
                  <button
                    type="button"
                    className="context-meter-info"
                    aria-label="Show context usage details"
                  >
                    i
                  </button>
                </span>
              </div>
              <div className="context-meter-track" aria-hidden="true">
                <div className="context-meter-fill" style={{ width: `${usagePercent}%` }} />
              </div>
              <div className="context-meter-meta">
                <span>{Number(activeUsage.totalTokens || 0).toLocaleString()} / {Number(activeUsage.maxTokens || 0).toLocaleString()} tokens</span>
                <span>{String(activeUsage.source || "estimate")}</span>
              </div>
              <div className="context-meter-details" role="tooltip">
                <div className="context-meter-details-title">Turn Usage Breakdown</div>
                <dl className="context-meter-details-grid">
                  <dt>Model</dt>
                  <dd>{usageModelLabel}</dd>
                  <dt>Input</dt>
                  <dd>{Number(activeUsage.inputTokens || 0).toLocaleString()} tokens</dd>
                  <dt>Output</dt>
                  <dd>{Number(activeUsage.outputTokens || 0).toLocaleString()} tokens</dd>
                  <dt>Total</dt>
                  <dd>{Number(activeUsage.totalTokens || 0).toLocaleString()} tokens</dd>
                  <dt>Source</dt>
                  <dd>{usageSourceLabel}</dd>
                </dl>
              </div>
            </div>
          ) : null}

          <form 
            className={`composer ${isDragging ? "dragging" : ""}`}
            onSubmit={handleSubmit}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="composer-input-wrap">
              <textarea
                placeholder={`Message ${personality.name}...`}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleKeyDown}
              />
              <div className="composer-actions">
                <button
                  type="button"
                  className={`composer-icon-btn ${isRecording ? "recording" : ""}`}
                  onClick={toggleRecording}
                  title={isRecording ? "End call" : "Start call"}
                  aria-label={isRecording ? "End call" : "Start call"}
                >
                  {isRecording ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 21l5.7-5.7" />
                      <path d="M15.3 15.3l5.7 5.7" />
                      <path d="M16.4 8.6a9 9 0 0 0-8.8 0l-2.2-2.2a12 12 0 0 1 13.2 0z" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.61a2 2 0 0 1-.45 2.11L8 9.73a16 16 0 0 0 6.27 6.27l1.29-1.28a2 2 0 0 1 2.11-.45c.83.29 1.71.5 2.61.62A2 2 0 0 1 22 16.92z" />
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  className="composer-icon-btn"
                  onClick={handleFileButtonClick}
                  title="Attach file"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  style={{ display: "none" }}
                  onChange={handleFileSelect}
                />
              </div>
              {attachedFile && (
                <div className="composer-file-preview">
                  <span className="composer-file-preview-name">{attachedFile.name}</span>
                  <button
                    type="button"
                    className="composer-file-preview-remove"
                    onClick={handleRemoveFile}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
            <button type="submit" disabled={isSending || !draft.trim()}>
              {isSending ? "Sending..." : "Send"}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
