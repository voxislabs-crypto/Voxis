import { useEffect, useMemo, useRef, useState } from "react";
import { useAuthFetch } from "../hooks/useAuthFetch.js";
import VoiceSampleSelector from "./VoiceSampleSelector.jsx";

const voiceLabStyles = `
  @keyframes vlab-scanline {
    0%   { transform: translateY(-100%); }
    100% { transform: translateY(100vh); }
  }

  @keyframes vlab-glitch {
    0%,89%,100% { opacity: 1; transform: none; filter: none; }
    90%  { opacity: 0.7; transform: translateX(3px); filter: hue-rotate(40deg); }
    92%  { opacity: 1;   transform: translateX(0); filter: none; }
    96%  { opacity: 0.85; filter: hue-rotate(-20deg); }
    97%  { opacity: 1;   filter: none; }
  }

  @keyframes vlab-blink {
    0%,100% { opacity: 1; }
    50%     { opacity: 0.25; }
  }

  @keyframes vlab-slide-in {
    0%   { opacity: 0; transform: translateY(14px); }
    100% { opacity: 1; transform: translateY(0); }
  }

  @keyframes vlab-pulse-ring {
    0%,100% { box-shadow: 0 0 0   rgba(74, 222, 128, 0.0); }
    50%     { box-shadow: 0 0 10px rgba(74, 222, 128, 0.8); }
  }

  /* ── Shell ────────────────────────────────────────────────── */
  .vlab-shell {
    position: relative;
    border: 1px solid rgba(0, 180, 255, 0.22);
    border-radius: 20px;
    background: rgba(4, 10, 22, 0.97);
    overflow: hidden;
    box-shadow:
      0 0 40px rgba(0, 120, 255, 0.10),
      inset 0 1px 0 rgba(0, 200, 255, 0.07);
    animation: vlab-slide-in 260ms ease;
  }

  /* CRT scan-line texture */
  .vlab-shell::before {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 9;
    border-radius: inherit;
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 3px,
      rgba(0, 0, 0, 0.05) 3px,
      rgba(0, 0, 0, 0.05) 4px
    );
  }

  /* Moving light sweep */
  .vlab-shell::after {
    content: "";
    position: absolute;
    left: 0; right: 0;
    height: 120px;
    background: linear-gradient(180deg, transparent, rgba(0, 200, 255, 0.025) 50%, transparent);
    pointer-events: none;
    z-index: 10;
    animation: vlab-scanline 9s linear infinite;
  }

  /* ── Header ───────────────────────────────────────────────── */
  .vlab-header {
    position: relative;
    z-index: 5;
    padding: 18px 22px 16px;
    border-bottom: 1px solid rgba(0, 200, 255, 0.10);
    background: linear-gradient(135deg, rgba(0, 36, 72, 0.65), rgba(0, 18, 44, 0.85));
  }

  .vlab-eyebrow {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 8px;
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--accent);
    font-family: "JetBrains Mono", "Courier New", monospace;
  }

  .vlab-eyebrow-dot {
    flex-shrink: 0;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 8px var(--accent);
    animation: vlab-blink 1.4s ease-in-out infinite;
  }

  .vlab-title {
    margin: 0;
    font-size: 1.28rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    background: linear-gradient(130deg, #ffffff 30%, var(--accent) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: vlab-glitch 8s ease infinite;
  }

  .vlab-header-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    margin-top: 11px;
  }

  .vlab-meta-pill {
    padding: 3px 9px;
    border-radius: 999px;
    border: 1px solid rgba(0, 180, 255, 0.18);
    background: rgba(0, 180, 255, 0.05);
    color: var(--muted);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    font-family: "JetBrains Mono", "Courier New", monospace;
  }

  .vlab-meta-pill.on {
    color: #4ade80;
    border-color: rgba(74, 222, 128, 0.30);
    background: rgba(74, 222, 128, 0.06);
    box-shadow: 0 0 8px rgba(74, 222, 128, 0.10);
  }

  /* ── Body ─────────────────────────────────────────────────── */
  .vlab-body {
    position: relative;
    z-index: 5;
    padding: 18px 22px 24px;
    display: grid;
    gap: 22px;
  }

  /* ── Section ──────────────────────────────────────────────── */
  .vlab-section {
    display: grid;
    gap: 12px;
  }

  .vlab-section-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.67rem;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--accent);
    opacity: 0.70;
    font-family: "JetBrains Mono", "Courier New", monospace;
  }

  .vlab-section-label::after {
    content: "";
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, rgba(0, 200, 255, 0.18), transparent);
  }

  /* ── Grid & Fields ────────────────────────────────────────── */
  .vlab-grid {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .vlab-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .vlab-field > label {
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .vlab-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .vlab-reload-btn {
    border: 1px solid rgba(0, 180, 255, 0.25);
    background: rgba(0, 180, 255, 0.08);
    color: var(--accent);
    border-radius: 8px;
    padding: 2px 8px;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
    transition: border-color 140ms ease, background 140ms ease;
  }

  .vlab-reload-btn:hover {
    border-color: rgba(0, 200, 255, 0.5);
    background: rgba(0, 180, 255, 0.15);
  }

  .vlab-reload-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .vlab-reload-meta {
    font-size: 0.68rem;
    color: #4ade80;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    font-family: "JetBrains Mono", "Courier New", monospace;
  }

  .vlab-input,
  .vlab-select,
  .vlab-textarea {
    width: 100%;
    padding: 10px 13px;
    border: 1px solid rgba(0, 180, 255, 0.15);
    border-radius: 10px;
    background: rgba(2, 8, 20, 0.92);
    color: var(--text);
    font-family: inherit;
    transition: border-color 170ms ease, box-shadow 170ms ease;
  }

  .vlab-input:focus,
  .vlab-select:focus,
  .vlab-textarea:focus {
    outline: none;
    border-color: rgba(0, 200, 255, 0.48);
    box-shadow: 0 0 0 2px rgba(0, 200, 255, 0.07), 0 0 14px rgba(0, 200, 255, 0.09);
  }

  .vlab-select {
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='7' viewBox='0 0 11 7'%3E%3Cpath d='M1 1l4.5 4.5L10 1' stroke='%2300c8ff' stroke-width='1.4' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
    padding-right: 32px;
  }

  .vlab-textarea {
    min-height: 84px;
    resize: vertical;
    line-height: 1.55;
  }

  .vlab-small {
    margin-top: 3px;
    font-size: 0.75rem;
    color: var(--muted);
    line-height: 1.5;
    font-family: "JetBrains Mono", "Courier New", monospace;
  }

  /* ── Sliders ──────────────────────────────────────────────── */
  .vlab-slider-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .vlab-slider {
    flex: 1;
    -webkit-appearance: none;
    appearance: none;
    height: 3px;
    border-radius: 99px;
    outline: none;
    cursor: pointer;
  }

  .vlab-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 15px;
    height: 15px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 8px rgba(0, 200, 255, 0.70);
    cursor: pointer;
    transition: box-shadow 140ms ease;
  }

  .vlab-slider::-webkit-slider-thumb:hover {
    box-shadow: 0 0 16px rgba(0, 200, 255, 1.0);
  }

  .vlab-slider::-moz-range-thumb {
    width: 15px;
    height: 15px;
    border-radius: 50%;
    background: var(--accent);
    border: none;
    box-shadow: 0 0 8px rgba(0, 200, 255, 0.70);
    cursor: pointer;
  }

  .vlab-slider-readout {
    min-width: 44px;
    text-align: right;
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--accent);
    font-family: "JetBrains Mono", "Courier New", monospace;
  }

  /* ── Toggle Switches ──────────────────────────────────────── */
  .vlab-toggle-row {
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
  }

  .vlab-toggle {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    user-select: none;
  }

  .vlab-toggle input[type="checkbox"] {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .vlab-toggle-track {
    position: relative;
    flex-shrink: 0;
    width: 38px;
    height: 21px;
    border-radius: 11px;
    background: rgba(0, 180, 255, 0.10);
    border: 1px solid rgba(0, 180, 255, 0.20);
    transition: background 200ms ease, border-color 200ms ease, box-shadow 200ms ease;
  }

  .vlab-toggle-track::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 15px;
    height: 15px;
    border-radius: 50%;
    background: rgba(0, 180, 255, 0.35);
    transition: transform 200ms ease, background 200ms ease, box-shadow 200ms ease;
  }

  .vlab-toggle input:checked + .vlab-toggle-track {
    background: rgba(0, 200, 255, 0.18);
    border-color: rgba(0, 200, 255, 0.55);
    box-shadow: 0 0 10px rgba(0, 200, 255, 0.24);
  }

  .vlab-toggle input:checked + .vlab-toggle-track::after {
    transform: translateX(17px);
    background: var(--accent);
    box-shadow: 0 0 8px rgba(0, 200, 255, 0.80);
  }

  .vlab-toggle-label {
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--muted);
  }

  /* ── Waveform canvas ──────────────────────────────────────── */
  .vlab-waveform-wrap {
    position: relative;
    border-radius: 12px;
    border: 1px solid rgba(0, 180, 255, 0.13);
    background: rgba(1, 6, 16, 0.98);
    overflow: hidden;
  }

  .vlab-waveform-tag {
    position: absolute;
    top: 8px;
    left: 12px;
    font-size: 0.63rem;
    font-weight: 800;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: rgba(0, 200, 255, 0.35);
    font-family: "JetBrains Mono", "Courier New", monospace;
    z-index: 2;
    pointer-events: none;
  }

  .vlab-gen-badge {
    position: absolute;
    top: 7px;
    right: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.66rem;
    font-weight: 800;
    letter-spacing: 0.14em;
    color: #4ade80;
    font-family: "JetBrains Mono", "Courier New", monospace;
    z-index: 2;
    pointer-events: none;
  }

  .vlab-gen-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #4ade80;
    animation: vlab-pulse-ring 0.55s ease-in-out infinite;
  }

  .vlab-canvas {
    display: block;
    width: 100%;
    height: 108px;
  }

  .vlab-audio-player {
    width: 100%;
    margin-top: 10px;
    border-radius: 8px;
    accent-color: var(--accent);
  }

  /* ── Action Buttons ───────────────────────────────────────── */
  .vlab-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .vlab-btn {
    padding: 10px 18px;
    border: none;
    border-radius: 10px;
    background: linear-gradient(135deg, var(--accent), var(--accent-deep));
    color: #fff;
    font-weight: 800;
    font-size: 0.84rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    box-shadow: 0 4px 16px rgba(0, 160, 255, 0.26);
    transition: box-shadow 160ms ease, transform 100ms ease;
    cursor: pointer;
  }

  .vlab-btn:hover {
    box-shadow: 0 6px 22px rgba(0, 160, 255, 0.42);
    transform: translateY(-1px);
  }

  .vlab-btn:active {
    transform: translateY(0);
  }

  .vlab-btn.sec {
    background: rgba(0, 180, 255, 0.06);
    border: 1px solid rgba(0, 180, 255, 0.22);
    color: var(--accent);
    box-shadow: none;
  }

  .vlab-btn.sec:hover {
    background: rgba(0, 180, 255, 0.11);
    box-shadow: 0 0 12px rgba(0, 200, 255, 0.14);
  }

  .vlab-btn:disabled {
    opacity: 0.42;
    cursor: not-allowed;
    transform: none !important;
    box-shadow: none !important;
  }

  /* ── Empty state ──────────────────────────────────────────── */
  .vlab-empty {
    padding: 28px 22px;
    text-align: center;
    color: var(--muted);
    font-size: 0.9rem;
    line-height: 1.75;
  }

  .vlab-empty-link {
    display: inline-block;
    margin-top: 12px;
    padding: 0;
    background: transparent;
    border: none;
    color: var(--accent);
    font-weight: 700;
    font-size: 0.9rem;
    cursor: pointer;
    letter-spacing: 0.04em;
  }

  /* ── Responsive ───────────────────────────────────────────── */
  @media (max-width: 720px) {
    .vlab-grid {
      grid-template-columns: 1fr;
    }

    .vlab-toggle-row {
      flex-direction: column;
      gap: 14px;
    }
  }

  /* Cyberpunk control deck overrides */
  .voice-lab-shell {
    border-radius: 24px;
    border: 1px solid rgba(0, 234, 255, 0.16);
    background: linear-gradient(180deg, rgba(3, 10, 22, 0.96), rgba(4, 8, 18, 0.92));
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45), 0 0 18px rgba(0, 234, 255, 0.05);
  }

  .voice-lab-header {
    padding: 16px 18px;
    background: linear-gradient(180deg, rgba(0, 234, 255, 0.04), rgba(255, 62, 207, 0.02));
    border-bottom: 1px solid rgba(0, 234, 255, 0.08);
  }

  .voice-lab-header h3 {
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .voice-lab-header p {
    color: #90a8c8;
  }

  .voice-lab-body {
    padding: 16px 18px 18px;
    gap: 16px;
  }

  .voice-lab-grid {
    gap: 14px;
  }

  .voice-lab-field label {
    color: #8fe9ff;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .voice-lab-field input,
  .voice-lab-field select,
  .voice-lab-field textarea {
    border-radius: 12px;
    border-color: rgba(0, 234, 255, 0.14);
    background: rgba(2, 10, 24, 0.95);
    box-shadow: inset 0 0 14px rgba(0, 234, 255, 0.04);
  }

  .voice-lab-field textarea {
    min-height: 132px;
  }

  .voice-lab-field small {
    color: #8ea7c8;
    line-height: 1.5;
  }

  .voice-lab-check {
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid rgba(0, 234, 255, 0.10);
    background: rgba(0, 234, 255, 0.04);
    color: #9fc5df;
  }

  .voice-lab-actions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 10px;
  }

  .voice-lab-actions button {
    border-radius: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    box-shadow: 0 8px 20px rgba(0, 160, 255, 0.18);
  }

  .voice-lab-actions button.secondary {
    background: rgba(0, 234, 255, 0.06);
    border-color: rgba(0, 234, 255, 0.16);
    color: #8eecff;
  }

  .voice-lab-player {
    width: 100%;
    border-radius: 12px;
    opacity: 0.95;
  }

  .voice-lab-empty {
    border-radius: 24px;
    border-color: rgba(0, 234, 255, 0.16);
    background: linear-gradient(180deg, rgba(3, 10, 22, 0.95), rgba(4, 8, 18, 0.92));
  }
`;

const ELEVENLABS_VOICE_PRESETS = [
  { id: "", label: "Custom voice id" },
  { id: "21m00Tcm4TlvDq8ikWAM", label: "Rachel (default)" },
  { id: "EXAVITQu4vr4xnSDxMaL", label: "Bella" },
  { id: "TxGEqnHWrfWFTfGW9XjX", label: "Josh" },
  { id: "VR6AewLTigWG4xSOukaG", label: "Arnold" },
  { id: "ErXwobaYiN019PkySvjV", label: "Antoni" },
];

const CARTESIA_VOICE_PRESETS = [
  { id: "", label: "Custom voice id" },
  { id: "a0e99841-438c-4a64-b679-ae501e7d6091", label: "Sonic default" },
  { id: "694f9389-aac1-45b6-b726-9d9369183238", label: "Warm Narrator" },
  { id: "2ee87190-8f84-4925-97da-e52547f9462c", label: "Balanced Voice" },
];

const ELEVENLABS_MODEL_PRESETS = [
  { id: "eleven_multilingual_v2", label: "eleven_multilingual_v2" },
  { id: "eleven_turbo_v2_5", label: "eleven_turbo_v2_5" },
  { id: "eleven_flash_v2_5", label: "eleven_flash_v2_5" },
];

const CARTESIA_MODEL_PRESETS = [
  { id: "sonic-2", label: "sonic-2" },
];

const CLOUD_MODEL_PRESETS = [
  { id: "gpt-4o-mini-tts", label: "gpt-4o-mini-tts" },
];

const CUSTOM_OPTION = "__custom__";

export default function VoiceLab({
  personality,
  messages,
  onSaveVoiceProfile,
  onStatus,
  onJumpToBuilder,
  onPersonalityUpdated,
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
    kokoroVoice: "af_heart",
    elevenLabsVoiceId: "",
    elevenLabsModel: "eleven_multilingual_v2",
    stability: 0.5,
    similarityBoost: 0.75,
    style: 0.5,
    cartesiaVoiceId: "",
    cartesiaModel: "sonic-2",
  });
  const [sampleText, setSampleText] = useState("");
  const [prosodyUrl, setProsodyUrl] = useState("");
  const [isExtractingProsody, setIsExtractingProsody] = useState(false);
  const [voiceSamples, setVoiceSamples] = useState(null);
  const [isExtractingVoiceSamples, setIsExtractingVoiceSamples] = useState(false);
  const [isSavingVoice, setIsSavingVoice] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [directedPreview, setDirectedPreview] = useState("");
  const [previewTelemetry, setPreviewTelemetry] = useState(null);
  const [piperVoices, setPiperVoices] = useState([]);
  const [isLoadingPiperVoices, setIsLoadingPiperVoices] = useState(false);
  const [piperVoiceError, setPiperVoiceError] = useState("");
  const [kokoroVoices, setKokoroVoices] = useState([]);
  const [isLoadingKokoroVoices, setIsLoadingKokoroVoices] = useState(false);
  const [kokoroVoiceError, setKokoroVoiceError] = useState("");
  const [providerOptions, setProviderOptions] = useState({
    elevenlabs: {
      voices: ELEVENLABS_VOICE_PRESETS.filter((voice) => voice.id),
      builtinVoices: ELEVENLABS_VOICE_PRESETS.filter((voice) => voice.id),
      customVoices: [],
      models: ELEVENLABS_MODEL_PRESETS,
      error: "",
    },
    cartesia: {
      voices: CARTESIA_VOICE_PRESETS.filter((voice) => voice.id),
      builtinVoices: CARTESIA_VOICE_PRESETS.filter((voice) => voice.id),
      customVoices: [],
      models: CARTESIA_MODEL_PRESETS,
      error: "",
    },
  });
  const [isLoadingProviderOptions, setIsLoadingProviderOptions] = useState(false);
  const [providerOptionsReloadToken, setProviderOptionsReloadToken] = useState(0);
  const [providerLastUpdatedAt, setProviderLastUpdatedAt] = useState({ elevenlabs: 0, cartesia: 0 });
  const [cloudModels, setCloudModels] = useState(CLOUD_MODEL_PRESETS);
  const [isLoadingCloudModels, setIsLoadingCloudModels] = useState(false);
  const [cloudModelError, setCloudModelError] = useState("");
  const [cloudModelsReloadToken, setCloudModelsReloadToken] = useState(0);
  const [cloudLastUpdatedAt, setCloudLastUpdatedAt] = useState(0);

  // Refs
  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const animFrameRef = useRef(null);
  const isGeneratingRef = useRef(false);

  // ── Derived ──────────────────────────────────────────────────────
  const latestAssistantMessage = useMemo(
    () => [...(messages || [])].reverse().find((m) => m.role === "assistant") || null,
    [messages],
  );

  const selectedPiperVoice = useMemo(
    () =>
      piperVoices.find(
        (v) =>
          v.path === voiceProfile.piperModelPath ||
          v.id === voiceProfile.providerVoice ||
          v.id === voiceProfile.preferredVoice,
      ) || null,
    [piperVoices, voiceProfile.piperModelPath, voiceProfile.preferredVoice, voiceProfile.providerVoice],
  );

  const selectedProviderId = voiceProfile.engine === "elevenlabs" || voiceProfile.engine === "cartesia"
    ? voiceProfile.engine
    : "";

  const activeProviderOptions = selectedProviderId
    ? providerOptions[selectedProviderId] || { voices: [], builtinVoices: [], customVoices: [], models: [], error: "" }
    : { voices: [], builtinVoices: [], customVoices: [], models: [], error: "" };

  const activeBuiltinVoices = Array.isArray(activeProviderOptions.builtinVoices)
    ? activeProviderOptions.builtinVoices
    : [];
  const activeCustomVoices = Array.isArray(activeProviderOptions.customVoices)
    ? activeProviderOptions.customVoices
    : [];

  const activeVoiceValue = selectedProviderId === "elevenlabs"
    ? voiceProfile.elevenLabsVoiceId || voiceProfile.providerVoice || ""
    : selectedProviderId === "cartesia"
      ? voiceProfile.cartesiaVoiceId || voiceProfile.providerVoice || ""
      : "";

  const activeModelValue = selectedProviderId === "elevenlabs"
    ? voiceProfile.elevenLabsModel || ""
    : selectedProviderId === "cartesia"
      ? voiceProfile.cartesiaModel || ""
      : voiceProfile.providerModel || "";

  const selectedVoiceOption = activeProviderOptions.voices.some((voice) => voice.id === activeVoiceValue)
    ? activeVoiceValue
    : CUSTOM_OPTION;

  const selectedModelOption = activeProviderOptions.models.some((model) => model.id === activeModelValue)
    ? activeModelValue
    : CUSTOM_OPTION;

  const activeProviderUpdatedAt = selectedProviderId ? Number(providerLastUpdatedAt[selectedProviderId] || 0) : 0;
  const showProviderUpdated = !isLoadingProviderOptions && activeProviderUpdatedAt > 0;
  const showCloudUpdated = !isLoadingCloudModels && cloudLastUpdatedAt > 0;

  const supportsCloudModelCatalog = voiceProfile.engine === "cloud" || voiceProfile.engine === "auto";
  const selectedCloudModelOption = cloudModels.some((model) => model.id === voiceProfile.providerModel)
    ? voiceProfile.providerModel
    : CUSTOM_OPTION;

  // ── Effects ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!personality) return;
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
        personality.voiceProfile?.piperSpeaker == null
          ? ""
          : String(personality.voiceProfile.piperSpeaker),
      kokoroVoice: personality.voiceProfile?.kokoroVoice || "af_heart",
      elevenLabsVoiceId: personality.voiceProfile?.elevenLabsVoiceId || "",
      elevenLabsModel: personality.voiceProfile?.elevenLabsModel || "eleven_multilingual_v2",
      stability: Number(personality.voiceProfile?.stability ?? 0.5),
      similarityBoost: Number(personality.voiceProfile?.similarityBoost ?? 0.75),
      style: Number(personality.voiceProfile?.style ?? 0.5),
      cartesiaVoiceId: personality.voiceProfile?.cartesiaVoiceId || "",
      cartesiaModel: personality.voiceProfile?.cartesiaModel || "sonic-2",
    });
    setProsodyUrl(personality.prosodySourceUrl || "");
    setVoiceSamples(personality.voiceSampleAnalysis || null);
  }, [personality]);

  useEffect(() => {
    setDirectedPreview("");
    setPreviewTelemetry(null);
  }, [sampleText, personality?.id]);

  useEffect(() => {
    if (!personality || voiceProfile.engine !== "piper") return;

    let ignore = false;

    async function loadPiperVoices() {
      setIsLoadingPiperVoices(true);
      setPiperVoiceError("");
      try {
        const response = await authFetch("/tts/piper-voices");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to load Piper voices.");
        if (ignore) return;

        const voices = Array.isArray(data.voices) ? data.voices : [];
        setPiperVoices(voices);

        setVoiceProfile((cur) => {
          const match = voices.find((v) => v.path === cur.piperModelPath);
          if (match) return { ...cur, providerVoice: match.id, preferredVoice: match.id };
          const def = voices.find((v) => v.isDefault) || voices[0];
          if (!def || cur.piperModelPath) return cur;
          return { ...cur, piperModelPath: def.path, providerVoice: def.id, preferredVoice: def.id };
        });
      } catch (error) {
        if (!ignore) {
          setPiperVoices([]);
          setPiperVoiceError(error.message || "Failed to load Piper voices.");
        }
      } finally {
        if (!ignore) setIsLoadingPiperVoices(false);
      }
    }

    void loadPiperVoices();
    return () => { ignore = true; };
  }, [authFetch, personality?.id, voiceProfile.engine]);

  useEffect(() => {
    if (!personality || voiceProfile.engine !== "kokoro") return;

    let ignore = false;

    async function loadKokoroVoices() {
      setIsLoadingKokoroVoices(true);
      setKokoroVoiceError("");
      try {
        const response = await authFetch("/tts/kokoro-voices");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to load Kokoro voices.");
        if (ignore) return;

        const groups = data.voices && typeof data.voices === "object" ? data.voices : {};
        const flattened = Object.entries(groups).flatMap(([group, items]) =>
          (Array.isArray(items) ? items : []).map((voice) => ({
            id: voice.id,
            label: `${voice.label} (${group.replace(/_/g, " ")})`,
          })),
        );

        setKokoroVoices(flattened);
        setVoiceProfile((cur) => {
          if (flattened.some((v) => v.id === cur.kokoroVoice)) {
            return cur;
          }
          const first = flattened[0];
          return first ? { ...cur, kokoroVoice: first.id, providerVoice: first.id, preferredVoice: first.id } : cur;
        });
      } catch (error) {
        if (!ignore) {
          setKokoroVoices([]);
          setKokoroVoiceError(error.message || "Failed to load Kokoro voices.");
        }
      } finally {
        if (!ignore) setIsLoadingKokoroVoices(false);
      }
    }

    void loadKokoroVoices();
    return () => { ignore = true; };
  }, [authFetch, personality?.id, voiceProfile.engine]);

  useEffect(() => {
    if (!personality || !selectedProviderId) return;

    let ignore = false;

    async function loadProviderOptions() {
      setIsLoadingProviderOptions(true);
      try {
        const response = await authFetch(`/tts/provider-options?provider=${encodeURIComponent(selectedProviderId)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to load provider options.");
        if (ignore) return;

        const fallbackVoices = selectedProviderId === "elevenlabs"
          ? ELEVENLABS_VOICE_PRESETS.filter((voice) => voice.id)
          : CARTESIA_VOICE_PRESETS.filter((voice) => voice.id);
        const fallbackModels = selectedProviderId === "elevenlabs"
          ? ELEVENLABS_MODEL_PRESETS
          : CARTESIA_MODEL_PRESETS;

        const voices = Array.isArray(data.voices) && data.voices.length
          ? data.voices
          : fallbackVoices;
        const models = Array.isArray(data.models) && data.models.length
          ? data.models
          : fallbackModels;

        setProviderOptions((cur) => ({
          ...cur,
          [selectedProviderId]: {
            voices,
            builtinVoices: Array.isArray(data.builtinVoices) && data.builtinVoices.length
              ? data.builtinVoices
              : selectedProviderId === "elevenlabs"
                ? voices
                : fallbackVoices,
            customVoices: Array.isArray(data.customVoices) ? data.customVoices : [],
            models,
            error: String(data.error || "").trim(),
          },
        }));
        setProviderLastUpdatedAt((cur) => ({
          ...cur,
          [selectedProviderId]: Date.now(),
        }));

        setVoiceProfile((cur) => {
          if (selectedProviderId === "elevenlabs") {
            const nextVoice = cur.elevenLabsVoiceId || cur.providerVoice || data.defaults?.voiceId || voices[0]?.id || "";
            const nextModel = cur.elevenLabsModel || data.defaults?.model || models[0]?.id || "eleven_multilingual_v2";
            return {
              ...cur,
              elevenLabsVoiceId: nextVoice,
              elevenLabsModel: nextModel,
              providerVoice: nextVoice || cur.providerVoice,
              preferredVoice: nextVoice || cur.preferredVoice,
            };
          }

          const nextVoice = cur.cartesiaVoiceId || cur.providerVoice || data.defaults?.voiceId || voices[0]?.id || "";
          const nextModel = cur.cartesiaModel || data.defaults?.model || models[0]?.id || "sonic-2";
          return {
            ...cur,
            cartesiaVoiceId: nextVoice,
            cartesiaModel: nextModel,
            providerVoice: nextVoice || cur.providerVoice,
            preferredVoice: nextVoice || cur.preferredVoice,
          };
        });
      } catch (error) {
        if (ignore) return;

        setProviderOptions((cur) => ({
          ...cur,
          [selectedProviderId]: {
            ...(cur[selectedProviderId] || { voices: [], builtinVoices: [], customVoices: [], models: [] }),
            error: error.message || "Failed to load provider options.",
          },
        }));
      } finally {
        if (!ignore) setIsLoadingProviderOptions(false);
      }
    }

    void loadProviderOptions();
    return () => { ignore = true; };
  }, [authFetch, personality?.id, selectedProviderId, providerOptionsReloadToken]);

  useEffect(() => {
    if (!personality || !supportsCloudModelCatalog) return;

    let ignore = false;

    async function loadCloudModels() {
      setIsLoadingCloudModels(true);
      setCloudModelError("");
      try {
        const response = await authFetch("/settings/llm");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to load cloud models.");
        if (ignore) return;

        const models = (Array.isArray(data.models) ? data.models : [])
          .map((model) => ({
            id: String(model?.id || "").trim(),
            label: String(model?.name || model?.id || "").trim(),
          }))
          .filter((model) => model.id);

        const nextModels = models.length ? models : CLOUD_MODEL_PRESETS;
        setCloudModels(nextModels);
        setCloudLastUpdatedAt(Date.now());
        setVoiceProfile((cur) => {
          if (nextModels.some((model) => model.id === cur.providerModel) || cur.providerModel) {
            return cur;
          }
          return { ...cur, providerModel: nextModels[0]?.id || cur.providerModel || "gpt-4o-mini-tts" };
        });
      } catch (error) {
        if (ignore) return;
        setCloudModels(CLOUD_MODEL_PRESETS);
        setCloudModelError(error.message || "Failed to load cloud models.");
      } finally {
        if (!ignore) setIsLoadingCloudModels(false);
      }
    }

    void loadCloudModels();
    return () => { ignore = true; };
  }, [authFetch, personality?.id, supportsCloudModelCatalog, cloudModelsReloadToken]);

  useEffect(() => {
    if (!showProviderUpdated || !selectedProviderId) return;
    const timer = setTimeout(() => {
      setProviderLastUpdatedAt((cur) => ({ ...cur, [selectedProviderId]: 0 }));
    }, 7000);
    return () => clearTimeout(timer);
  }, [showProviderUpdated, selectedProviderId]);

  useEffect(() => {
    if (!showCloudUpdated) return;
    const timer = setTimeout(() => {
      setCloudLastUpdatedAt(0);
    }, 7000);
    return () => clearTimeout(timer);
  }, [showCloudUpdated]);

  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  // Sync isGenerating to ref so canvas loop can read it without re-subscribing
  useEffect(() => { isGeneratingRef.current = isGeneratingAudio; }, [isGeneratingAudio]);

  // ── Waveform canvas ───────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = 800;
    canvas.height = 108;

    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;

    function draw(ts) {
      ctx.clearRect(0, 0, W, H);

      // Faint horizontal grid lines
      ctx.strokeStyle = "rgba(0, 180, 255, 0.045)";
      ctx.lineWidth = 1;
      for (const frac of [0.25, 0.5, 0.75]) {
        ctx.beginPath();
        ctx.moveTo(0, frac * H);
        ctx.lineTo(W, frac * H);
        ctx.stroke();
      }

      const analyser = analyserRef.current;
      const audio = audioRef.current;

      if (isGeneratingRef.current) {
        // SYNTHESIZING — fast stochastic bars
        const t = ts * 0.006;
        const count = 52;
        const bw = W / count;
        for (let i = 0; i < count; i++) {
          const v = (Math.sin(i * 0.65 + t) * 0.5 + 0.5) * (0.15 + Math.random() * 0.40);
          const bh = v * H * 0.82;
          const hue = 155 + i * 3.2;
          ctx.fillStyle = `hsla(${hue}, 100%, 62%, 0.75)`;
          ctx.fillRect(i * bw, H - bh, bw - 1, bh);
        }
      } else if (analyser && audio && !audio.paused) {
        // PLAYING — live FFT bars
        const bufLen = analyser.frequencyBinCount;
        const data = new Uint8Array(bufLen);
        analyser.getByteFrequencyData(data);
        const bins = Math.floor(bufLen * 0.68);
        const bw = W / bins;

        for (let i = 0; i < bins; i++) {
          const v = data[i] / 255;
          const bh = v * H * 0.88;
          if (bh < 1) continue;

          const hue = 185 + v * 105;
          const grd = ctx.createLinearGradient(0, H - bh, 0, H);
          grd.addColorStop(0, `hsla(${hue}, 100%, 64%, 0.94)`);
          grd.addColorStop(1, `hsla(220, 80%, 28%, 0.12)`);
          ctx.fillStyle = grd;
          ctx.fillRect(i * bw, H - bh, bw - 1, bh);

          // Bright leading cap
          ctx.fillStyle = `hsla(${hue}, 100%, 86%, 0.88)`;
          ctx.fillRect(i * bw, H - bh - 2, bw - 1, 2);
        }
      } else {
        // IDLE — slow oscilloscope sine
        const phase = ts * 0.00055;
        const amp = 4 + Math.sin(ts * 0.0004) * 2.2;

        // Noise floor micro-bars
        ctx.fillStyle = "rgba(0, 180, 255, 0.06)";
        const nc = 62;
        for (let i = 0; i < nc; i++) {
          const nh = (Math.sin(i * 1.18 + phase * 0.9) * 0.5 + 0.5) * H * 0.09;
          ctx.fillRect(i * (W / nc), H - nh, W / nc - 1, nh);
        }

        // Center sine wave
        ctx.beginPath();
        ctx.strokeStyle = "rgba(0, 200, 255, 0.28)";
        ctx.lineWidth = 1.5;
        for (let px = 0; px <= W; px += 2) {
          const y = H * 0.5 + Math.sin((px / W) * Math.PI * 6 + phase) * amp;
          px === 0 ? ctx.moveTo(px, y) : ctx.lineTo(px, y);
        }
        ctx.stroke();
      }

      animFrameRef.current = requestAnimationFrame(draw);
    }

    animFrameRef.current = requestAnimationFrame(draw);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // ── Web Audio setup (lazy — called on first user-gesture generate) ──
  function setupAnalyser() {
    const audio = audioRef.current;
    if (!audio || sourceNodeRef.current) return;
    try {
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.82;
      const source = ctx.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(ctx.destination);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      sourceNodeRef.current = source;
    } catch {
      // Web Audio unavailable — canvas stays in idle/generating mode
    }
  }

  // ── Handlers ─────────────────────────────────────────────────────
  function updateVoiceField(name, value) {
    setVoiceProfile((cur) => ({ ...cur, [name]: value }));
  }

  function handlePiperVoiceChange(nextPath) {
    const nextVoice = piperVoices.find((v) => v.path === nextPath);
    if (!nextVoice) { updateVoiceField("piperModelPath", nextPath); return; }
    setVoiceProfile((cur) => ({
      ...cur,
      piperModelPath: nextVoice.path,
      providerVoice: nextVoice.id,
      preferredVoice: nextVoice.id,
      piperSpeaker:
        nextVoice.speakers?.length === 1 && (cur.piperSpeaker === "" || cur.piperSpeaker == null)
          ? String(nextVoice.speakers[0].id)
          : cur.piperSpeaker,
    }));
  }

  function stopSpeaking() {
    const audio = audioRef.current;
    if (audio instanceof HTMLAudioElement) {
      audio.pause();
      audio.currentTime = 0;
    }
  }

  async function generateAudio(text) {
    if (!voiceProfile.enabled || !text?.trim() || !personality) return;

    setupAnalyser(); // safe to call on user-gesture; noop after first setup
    setIsGeneratingAudio(true);

    try {
      const response = await authFetch(`/personality/${personality.id}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voiceProfile }),
      });

      if (!response.ok) {
        let msg = "Failed to generate speech.";
        try { const p = await response.json(); msg = p.error || msg; } catch { msg = await response.text(); }
        throw new Error(msg);
      }

      const directedHeader = response.headers.get("X-Voxis-Directed-Text");
      const engineHeader = response.headers.get("X-Voxis-Tts-Engine");
      const adjustedVoiceHeader = response.headers.get("X-Voxis-Adjusted-Voice");
      const prosodyHeader = response.headers.get("X-Voxis-Prosody");
      let adjustedVoice = null;
      let prosodyEnvelope = null;

      if (adjustedVoiceHeader) {
        try {
          adjustedVoice = JSON.parse(decodeURIComponent(adjustedVoiceHeader));
        } catch {
          adjustedVoice = null;
        }
      }

      if (prosodyHeader) {
        try {
          prosodyEnvelope = JSON.parse(decodeURIComponent(prosodyHeader));
        } catch {
          prosodyEnvelope = null;
        }
      }

      setDirectedPreview(directedHeader ? decodeURIComponent(directedHeader) : text);
      setPreviewTelemetry({
        engine: engineHeader || voiceProfile.engine || "auto",
        adjustedVoice,
        prosodyEnvelope,
      });

      const blob = await response.blob();
      const next = URL.createObjectURL(blob);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(next);

      requestAnimationFrame(() => {
        const audio = audioRef.current;
        if (audio instanceof HTMLAudioElement) void audio.play().catch(() => {});
      });
    } catch (error) {
      onStatus?.({ type: "error", message: error.message || "Failed to generate speech." });
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
        kokoroVoice: voiceProfile.kokoroVoice,
        elevenLabsVoiceId: voiceProfile.elevenLabsVoiceId,
        elevenLabsModel: voiceProfile.elevenLabsModel,
        stability: Number(voiceProfile.stability),
        similarityBoost: Number(voiceProfile.similarityBoost),
        style: Number(voiceProfile.style),
        cartesiaVoiceId: voiceProfile.cartesiaVoiceId,
        cartesiaModel: voiceProfile.cartesiaModel,
      });
    } finally {
      setIsSavingVoice(false);
    }
  }

  async function extractProsodyTemplate() {
    if (!personality?.id || !prosodyUrl.trim()) {
      return;
    }

    setIsExtractingProsody(true);

    try {
      const response = await authFetch(`/personality/${personality.id}/prosody-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: prosodyUrl.trim() }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to extract prosody template.");
      }

      onPersonalityUpdated?.(payload.personality);
      setVoiceSamples(payload.voiceSamples || payload.personality?.voiceSampleAnalysis || null);
      onStatus?.({
        type: "success",
        message: `Prosody template extracted for ${payload.personality?.name || personality.name}.`,
      });
    } catch (error) {
      onStatus?.({ type: "error", message: error.message || "Failed to extract prosody template." });
    } finally {
      setIsExtractingProsody(false);
    }
  }

  function sliderStyle(val, min, max) {
    const pct = ((val - min) / (max - min)) * 100;
    return { background: `linear-gradient(90deg, var(--accent) ${pct}%, rgba(0,180,255,0.14) ${pct}%)` };
  }

  // ── Render ────────────────────────────────────────────────────────
  if (!personality) {
    return (
      <>
        <style>{voiceLabStyles}</style>
        <div className="vlab-shell">
          <div className="vlab-empty">
            Select a saved personality or create a new one before opening Voice Lab.
            <div>
              <button type="button" className="vlab-empty-link" onClick={onJumpToBuilder}>
                → Go to Character Request
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{voiceLabStyles}</style>
      <div className="vlab-shell">

        {/* ── Header ── */}
        <div className="vlab-header">
          <div className="vlab-eyebrow">
            <span className="vlab-eyebrow-dot" />
            VOICE SYNTHESIS MODULE
          </div>
          <h3 className="vlab-title">{personality.name} // VOICE LAB</h3>
          <div className="vlab-header-meta">
            <span className={`vlab-meta-pill ${voiceProfile.enabled ? "on" : ""}`}>
              {voiceProfile.enabled ? "● VOICE ON" : "○ VOICE OFF"}
            </span>
            <span className="vlab-meta-pill">ENG:{voiceProfile.engine.toUpperCase()}</span>
            <span className="vlab-meta-pill">PITCH:{Number(voiceProfile.pitch).toFixed(2)}</span>
            <span className="vlab-meta-pill">RATE:{Number(voiceProfile.rate).toFixed(2)}</span>
            {voiceProfile.autoplay && <span className="vlab-meta-pill on">AUTOPLAY</span>}
          </div>
        </div>

        <div className="vlab-body">

          {/* ── Engine Config ── */}
          <div className="vlab-section">
            <div className="vlab-section-label">◈ ENGINE CONFIG</div>
            <div className="vlab-grid">

              <div className="vlab-field">
                <label htmlFor="vlab-engine">TTS Engine</label>
                <select
                  id="vlab-engine"
                  className="vlab-select"
                  value={voiceProfile.engine}
                  onChange={(e) => updateVoiceField("engine", e.target.value)}
                >
                  <option value="auto">auto (cloud -&gt; piper -&gt; kokoro)</option>
                  <option value="cloud">cloud</option>
                  <option value="piper">piper</option>
                  <option value="kokoro">kokoro (free local)</option>
                  <option value="elevenlabs">elevenlabs (BYOK)</option>
                  <option value="cartesia">cartesia (BYOK)</option>
                </select>
              </div>

              <div className="vlab-field">
                <div className="vlab-label-row">
                  <label>
                    {voiceProfile.engine === "piper"
                      ? "Piper Voice"
                      : voiceProfile.engine === "kokoro"
                        ? "Kokoro Voice"
                        : voiceProfile.engine === "elevenlabs"
                          ? "ElevenLabs Voice"
                          : voiceProfile.engine === "cartesia"
                            ? "Cartesia Voice"
                            : "TTS Voice"}
                  </label>
                  {(voiceProfile.engine === "elevenlabs" || voiceProfile.engine === "cartesia") ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {showProviderUpdated ? <span className="vlab-reload-meta">Updated just now</span> : null}
                      <button
                        type="button"
                        className="vlab-reload-btn"
                        onClick={() => setProviderOptionsReloadToken((n) => n + 1)}
                        disabled={isLoadingProviderOptions}
                      >
                        {isLoadingProviderOptions ? "Loading..." : "Reload"}
                      </button>
                    </div>
                  ) : null}
                </div>
                {voiceProfile.engine === "piper" ? (
                  <>
                    <select
                      className="vlab-select"
                      value={selectedPiperVoice?.path || voiceProfile.piperModelPath || ""}
                      onChange={(e) => handlePiperVoiceChange(e.target.value)}
                      disabled={isLoadingPiperVoices || piperVoices.length === 0}
                    >
                      <option value="">
                        {isLoadingPiperVoices
                          ? "SCANNING LOCAL VOICES..."
                          : piperVoices.length
                            ? "Select a Piper voice"
                            : "No Piper voices found"}
                      </option>
                      {piperVoices.map((v) => (
                        <option key={v.path} value={v.path}>
                          {v.label}{v.isDefault ? " (default)" : ""}
                        </option>
                      ))}
                    </select>
                    <small className="vlab-small">
                      {piperVoiceError
                        ? piperVoiceError
                        : piperVoices.length
                          ? `${piperVoices.length} voice${piperVoices.length === 1 ? "" : "s"} detected`
                          : "No local Piper models found. Run installer or set PIPER_MODEL_PATH."}
                    </small>
                  </>
                ) : voiceProfile.engine === "kokoro" ? (
                  <>
                    <select
                      className="vlab-select"
                      value={voiceProfile.kokoroVoice || ""}
                      onChange={(e) => {
                        updateVoiceField("kokoroVoice", e.target.value);
                        updateVoiceField("providerVoice", e.target.value);
                        updateVoiceField("preferredVoice", e.target.value);
                      }}
                      disabled={isLoadingKokoroVoices || kokoroVoices.length === 0}
                    >
                      <option value="">
                        {isLoadingKokoroVoices
                          ? "LOADING KOKORO VOICES..."
                          : kokoroVoices.length
                            ? "Select a Kokoro voice"
                            : "No Kokoro voices loaded"}
                      </option>
                      {kokoroVoices.map((voice) => (
                        <option key={voice.id} value={voice.id}>{voice.label}</option>
                      ))}
                    </select>
                    <small className="vlab-small">
                      {kokoroVoiceError || "Kokoro ships free local voices. First server run downloads model cache once."}
                    </small>
                  </>
                ) : voiceProfile.engine === "elevenlabs" ? (
                  <>
                    <select
                      className="vlab-select"
                      value={selectedVoiceOption}
                      onChange={(e) => {
                        const next = e.target.value;
                        if (next === CUSTOM_OPTION) {
                          updateVoiceField("elevenLabsVoiceId", "");
                          return;
                        }
                        updateVoiceField("elevenLabsVoiceId", next);
                        updateVoiceField("providerVoice", next);
                        updateVoiceField("preferredVoice", next);
                      }}
                    >
                      <option value="" disabled>
                        {isLoadingProviderOptions ? "LOADING PROVIDER VOICES..." : "Select an ElevenLabs voice"}
                      </option>
                      {activeBuiltinVoices.map((voice) => (
                        <option key={voice.id} value={voice.id}>{voice.label}</option>
                      ))}
                      {activeCustomVoices.length ? (
                        <option value="__my_voices__" disabled>My Voices</option>
                      ) : null}
                      {activeCustomVoices.map((voice) => (
                        <option key={voice.id} value={voice.id}>{voice.label}</option>
                      ))}
                      <option value={CUSTOM_OPTION}>Custom voice id</option>
                    </select>
                    {selectedVoiceOption === CUSTOM_OPTION ? (
                      <input
                        className="vlab-input"
                        value={voiceProfile.elevenLabsVoiceId || voiceProfile.providerVoice || ""}
                        onChange={(e) => {
                          updateVoiceField("providerVoice", e.target.value);
                          updateVoiceField("preferredVoice", e.target.value);
                          updateVoiceField("elevenLabsVoiceId", e.target.value);
                        }}
                        placeholder="Paste custom ElevenLabs voice id"
                      />
                    ) : null}
                    <small className="vlab-small">
                      {activeProviderOptions.error || "Auto-loaded from your configured ElevenLabs API key."}
                    </small>
                  </>
                ) : voiceProfile.engine === "cartesia" ? (
                  <>
                    <select
                      className="vlab-select"
                      value={selectedVoiceOption}
                      onChange={(e) => {
                        const next = e.target.value;
                        if (next === CUSTOM_OPTION) {
                          updateVoiceField("cartesiaVoiceId", "");
                          return;
                        }
                        updateVoiceField("cartesiaVoiceId", next);
                        updateVoiceField("providerVoice", next);
                        updateVoiceField("preferredVoice", next);
                      }}
                    >
                      <option value="" disabled>
                        {isLoadingProviderOptions ? "LOADING PROVIDER VOICES..." : "Select a Cartesia voice"}
                      </option>
                      {activeProviderOptions.voices.map((voice) => (
                        <option key={voice.id} value={voice.id}>{voice.label}</option>
                      ))}
                      <option value={CUSTOM_OPTION}>Custom voice id</option>
                    </select>
                    {selectedVoiceOption === CUSTOM_OPTION ? (
                      <input
                        className="vlab-input"
                        value={voiceProfile.cartesiaVoiceId || voiceProfile.providerVoice || ""}
                        onChange={(e) => {
                          updateVoiceField("providerVoice", e.target.value);
                          updateVoiceField("preferredVoice", e.target.value);
                          updateVoiceField("cartesiaVoiceId", e.target.value);
                        }}
                        placeholder="Paste custom Cartesia voice id"
                      />
                    ) : null}
                    <small className="vlab-small">
                      {activeProviderOptions.error || "Auto-loaded from your configured Cartesia API key."}
                    </small>
                  </>
                ) : (
                  <input
                    className="vlab-input"
                    value={voiceProfile.providerVoice || voiceProfile.preferredVoice}
                    onChange={(e) => {
                      updateVoiceField("providerVoice", e.target.value);
                      updateVoiceField("preferredVoice", e.target.value);
                    }}
                    placeholder="alloy"
                  />
                )}
              </div>

              <div className="vlab-field">
                <div className="vlab-label-row">
                  <label htmlFor="vlab-model">TTS Model</label>
                  {(selectedProviderId || supportsCloudModelCatalog) ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {selectedProviderId && showProviderUpdated ? (
                        <span className="vlab-reload-meta">Updated just now</span>
                      ) : null}
                      {!selectedProviderId && showCloudUpdated ? (
                        <span className="vlab-reload-meta">Updated just now</span>
                      ) : null}
                      <button
                        type="button"
                        className="vlab-reload-btn"
                        onClick={() => {
                          if (selectedProviderId) {
                            setProviderOptionsReloadToken((n) => n + 1);
                          } else {
                            setCloudModelsReloadToken((n) => n + 1);
                          }
                        }}
                        disabled={selectedProviderId ? isLoadingProviderOptions : isLoadingCloudModels}
                      >
                        {(selectedProviderId ? isLoadingProviderOptions : isLoadingCloudModels) ? "Loading..." : "Reload"}
                      </button>
                    </div>
                  ) : null}
                </div>
                {selectedProviderId ? (
                  <>
                    <select
                      id="vlab-model"
                      className="vlab-select"
                      value={selectedModelOption}
                      onChange={(e) => {
                        const next = e.target.value;
                        if (next === CUSTOM_OPTION) {
                          if (selectedProviderId === "elevenlabs") {
                            updateVoiceField("elevenLabsModel", "");
                          } else {
                            updateVoiceField("cartesiaModel", "");
                          }
                          return;
                        }

                        if (selectedProviderId === "elevenlabs") {
                          updateVoiceField("elevenLabsModel", next);
                        } else {
                          updateVoiceField("cartesiaModel", next);
                        }
                      }}
                    >
                      <option value="" disabled>
                        {isLoadingProviderOptions ? "LOADING PROVIDER MODELS..." : "Select a model"}
                      </option>
                      {activeProviderOptions.models.map((model) => (
                        <option key={model.id} value={model.id}>{model.label}</option>
                      ))}
                      <option value={CUSTOM_OPTION}>Custom model id</option>
                    </select>
                    {selectedModelOption === CUSTOM_OPTION ? (
                      <input
                        className="vlab-input"
                        value={activeModelValue}
                        onChange={(e) => {
                          if (selectedProviderId === "elevenlabs") {
                            updateVoiceField("elevenLabsModel", e.target.value);
                          } else {
                            updateVoiceField("cartesiaModel", e.target.value);
                          }
                        }}
                        placeholder={selectedProviderId === "elevenlabs" ? "eleven_multilingual_v2" : "sonic-2"}
                      />
                    ) : null}
                    <small className="vlab-small">
                      {activeProviderOptions.error || "Auto-loaded from your configured provider API key."}
                    </small>
                  </>
                ) : supportsCloudModelCatalog ? (
                  <>
                    <select
                      id="vlab-model"
                      className="vlab-select"
                      value={selectedCloudModelOption}
                      onChange={(e) => {
                        const next = e.target.value;
                        if (next === CUSTOM_OPTION) {
                          updateVoiceField("providerModel", "");
                          return;
                        }

                        updateVoiceField("providerModel", next);
                      }}
                    >
                      <option value="" disabled>
                        {isLoadingCloudModels ? "LOADING CLOUD MODELS..." : "Select a cloud model"}
                      </option>
                      {cloudModels.map((model) => (
                        <option key={model.id} value={model.id}>{model.label}</option>
                      ))}
                      <option value={CUSTOM_OPTION}>Custom model id</option>
                    </select>
                    {selectedCloudModelOption === CUSTOM_OPTION ? (
                      <input
                        className="vlab-input"
                        value={voiceProfile.providerModel || ""}
                        onChange={(e) => updateVoiceField("providerModel", e.target.value)}
                        placeholder="gpt-4o-mini-tts"
                      />
                    ) : null}
                    <small className="vlab-small">
                      {cloudModelError || "Auto-loaded from Runtime LLM provider model list."}
                    </small>
                  </>
                ) : (
                  <input
                    id="vlab-model"
                    className="vlab-input"
                    value={voiceProfile.providerModel}
                    onChange={(e) => updateVoiceField("providerModel", e.target.value)}
                    placeholder={
                      voiceProfile.engine === "piper"
                        ? "cloud fallback model"
                        : "gpt-4o-mini-tts"
                    }
                  />
                )}
              </div>

              {voiceProfile.engine === "piper" && (
                <>
                  <div className="vlab-field">
                    <label htmlFor="vlab-piper-path">Model Path (advanced)</label>
                    <input
                      id="vlab-piper-path"
                      className="vlab-input"
                      value={voiceProfile.piperModelPath}
                      onChange={(e) => updateVoiceField("piperModelPath", e.target.value)}
                      placeholder="/opt/piper/models/en_US-lessac-medium.onnx"
                    />
                  </div>

                  <div className="vlab-field">
                    <label>
                      {selectedPiperVoice?.speakers?.length > 1 ? "Speaker" : "Speaker ID (optional)"}
                    </label>
                    {selectedPiperVoice?.speakers?.length > 1 ? (
                      <select
                        className="vlab-select"
                        value={String(voiceProfile.piperSpeaker ?? "")}
                        onChange={(e) => updateVoiceField("piperSpeaker", e.target.value)}
                      >
                        <option value="">Default speaker</option>
                        {selectedPiperVoice.speakers.map((s) => (
                          <option key={`${selectedPiperVoice.id}-${s.id}`} value={String(s.id)}>
                            {s.label} ({s.id})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="vlab-input"
                        value={voiceProfile.piperSpeaker ?? ""}
                        onChange={(e) => updateVoiceField("piperSpeaker", e.target.value)}
                        placeholder="0"
                      />
                    )}
                  </div>
                </>
              )}

              {voiceProfile.engine === "elevenlabs" && (
                <>
                  <div className="vlab-field">
                    <label>Stability</label>
                    <div className="vlab-slider-row">
                      <input
                        type="range"
                        className="vlab-slider"
                        min="0" max="1" step="0.01"
                        value={voiceProfile.stability}
                        onChange={(e) => updateVoiceField("stability", Number(e.target.value))}
                        style={sliderStyle(voiceProfile.stability, 0, 1)}
                      />
                      <span className="vlab-slider-readout">{Number(voiceProfile.stability).toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="vlab-field">
                    <label>Similarity Boost</label>
                    <div className="vlab-slider-row">
                      <input
                        type="range"
                        className="vlab-slider"
                        min="0" max="1" step="0.01"
                        value={voiceProfile.similarityBoost}
                        onChange={(e) => updateVoiceField("similarityBoost", Number(e.target.value))}
                        style={sliderStyle(voiceProfile.similarityBoost, 0, 1)}
                      />
                      <span className="vlab-slider-readout">{Number(voiceProfile.similarityBoost).toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="vlab-field">
                    <label>Style</label>
                    <div className="vlab-slider-row">
                      <input
                        type="range"
                        className="vlab-slider"
                        min="0" max="1" step="0.01"
                        value={voiceProfile.style}
                        onChange={(e) => updateVoiceField("style", Number(e.target.value))}
                        style={sliderStyle(voiceProfile.style, 0, 1)}
                      />
                      <span className="vlab-slider-readout">{Number(voiceProfile.style).toFixed(2)}</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── Synthesis Parameters ── */}
          <div className="vlab-section">
            <div className="vlab-section-label">◈ SYNTHESIS PARAMETERS</div>
            <div className="vlab-grid">
              <div className="vlab-field">
                <label>Pitch Modifier</label>
                <div className="vlab-slider-row">
                  <input
                    type="range"
                    className="vlab-slider"
                    min="0.5" max="1.6" step="0.05"
                    value={voiceProfile.pitch}
                    onChange={(e) => updateVoiceField("pitch", Number(e.target.value))}
                    style={sliderStyle(voiceProfile.pitch, 0.5, 1.6)}
                  />
                  <span className="vlab-slider-readout">{Number(voiceProfile.pitch).toFixed(2)}×</span>
                </div>
              </div>
              <div className="vlab-field">
                <label>Rate Modifier</label>
                <div className="vlab-slider-row">
                  <input
                    type="range"
                    className="vlab-slider"
                    min="0.6" max="1.6" step="0.05"
                    value={voiceProfile.rate}
                    onChange={(e) => updateVoiceField("rate", Number(e.target.value))}
                    style={sliderStyle(voiceProfile.rate, 0.6, 1.6)}
                  />
                  <span className="vlab-slider-readout">{Number(voiceProfile.rate).toFixed(2)}×</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Voice Flags ── */}
          <div className="vlab-section">
            <div className="vlab-section-label">◈ VOICE FLAGS</div>
            <div className="vlab-toggle-row">
              <label className="vlab-toggle">
                <input
                  type="checkbox"
                  checked={voiceProfile.enabled}
                  onChange={(e) => updateVoiceField("enabled", e.target.checked)}
                />
                <span className="vlab-toggle-track" />
                <span className="vlab-toggle-label">Enable voice playback</span>
              </label>
              <label className="vlab-toggle">
                <input
                  type="checkbox"
                  checked={voiceProfile.autoplay}
                  onChange={(e) => updateVoiceField("autoplay", e.target.checked)}
                />
                <span className="vlab-toggle-track" />
                <span className="vlab-toggle-label">Auto-play assistant replies</span>
              </label>
            </div>
          </div>

          {/* ── Signal Tester ── */}
          <div className="vlab-section">
            <div className="vlab-section-label">◈ SIGNAL TESTER</div>
            <div className="vlab-field">
              <label htmlFor="vlab-prosody-url">Prosody Source URL</label>
              <input
                id="vlab-prosody-url"
                className="vlab-input"
                value={prosodyUrl}
                onChange={(e) => setProsodyUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
              />
              <div className="vlab-actions" style={{ marginTop: 6 }}>
                <button
                  type="button"
                  className="vlab-btn sec"
                  onClick={() => void extractProsodyTemplate()}
                  disabled={isExtractingProsody || !prosodyUrl.trim()}
                >
                  {isExtractingProsody ? "EXTRACTING…" : "EXTRACT PROSODY"}
                </button>
              </div>
              <div className="vlab-small">
                Downloads source audio, extracts cadence/rhythm template, attaches it to this persona, and removes temp audio.
              </div>
            </div>
            <div className="vlab-field">
              <label htmlFor="vlab-sample">Sample Transmission Text</label>
              <textarea
                id="vlab-sample"
                className="vlab-textarea"
                value={sampleText}
                onChange={(e) => setSampleText(e.target.value)}
                placeholder="Type a line to synthesize and preview…"
              />
              <div className="vlab-small">
                Sample preview runs through the same Speech Director pipeline as live TTS replies.
              </div>
              {directedPreview ? (
                <div className="vlab-small" style={{ marginTop: 8 }}>
                  Directed preview: <strong>{directedPreview}</strong>
                  {previewTelemetry?.adjustedVoice ? (
                    <>
                      {" "}
                      | Engine: {String(previewTelemetry.engine || "auto").toUpperCase()} | Rate:
                      {` ${Number(previewTelemetry.adjustedVoice.rate ?? voiceProfile.rate).toFixed(2)}x`} | Pitch:
                      {` ${Number(previewTelemetry.adjustedVoice.pitch ?? voiceProfile.pitch).toFixed(2)}x`}
                    </>
                  ) : null}
                  {previewTelemetry?.prosodyEnvelope ? (
                    <>
                      {" "}
                      | Phrasing: {String(previewTelemetry.prosodyEnvelope.phrasing || "balanced")} | Intensity:
                      {` ${Number(previewTelemetry.prosodyEnvelope.intensity ?? 0.5).toFixed(2)}`} | Confidence:
                      {` ${Number(previewTelemetry.prosodyEnvelope.confidence ?? 0).toFixed(2)}`} | Emphasis:
                      {` ${(previewTelemetry.prosodyEnvelope.emphasis?.words || []).map((item) => item.term).join(", ") || "none"}`}
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {/* ── Voice Sample Selection ── */}
          {voiceSamples && (
            <VoiceSampleSelector
              personality={personality}
              voiceSamples={voiceSamples}
              isLoading={isExtractingVoiceSamples}
              onSampleSelected={(updatedPersonality) => {
                onPersonalityUpdated?.(updatedPersonality);
                setVoiceSamples(null); // Clear after selection
              }}
              onStatus={onStatus}
            />
          )}

          {/* ── Waveform Monitor ── */}
          <div className="vlab-section">
            <div className="vlab-section-label">◈ WAVEFORM MONITOR</div>
            <div className="vlab-waveform-wrap">
              <div className="vlab-waveform-tag">FREQUENCY SPECTRUM</div>
              {isGeneratingAudio && (
                <div className="vlab-gen-badge">
                  <span className="vlab-gen-dot" />
                  SYNTHESIZING
                </div>
              )}
              <canvas ref={canvasRef} className="vlab-canvas" />
            </div>
            {/* Always render audio element so Web Audio API can attach to it */}
            <audio
              ref={audioRef}
              className="vlab-audio-player"
              controls
              src={audioUrl || undefined}
              style={{ display: audioUrl ? "block" : "none" }}
            />
          </div>

          {/* ── Controls ── */}
          <div className="vlab-section">
            <div className="vlab-section-label">◈ CONTROLS</div>
            <div className="vlab-actions">
              <button
                type="button"
                className="vlab-btn"
                onClick={() => void generateAudio(sampleText)}
                disabled={isGeneratingAudio || !sampleText.trim()}
              >
                {isGeneratingAudio ? "SYNTHESIZING…" : "⟴ GENERATE SAMPLE"}
              </button>
              <button
                type="button"
                className="vlab-btn sec"
                onClick={() => void generateAudio(latestAssistantMessage?.content || "")}
                disabled={isGeneratingAudio || !latestAssistantMessage}
              >
                ⟳ LATEST REPLY
              </button>
              <button type="button" className="vlab-btn sec" onClick={stopSpeaking}>
                ■ STOP
              </button>
              <button
                type="button"
                className="vlab-btn sec"
                onClick={() => void handleSaveVoiceProfile()}
                disabled={isSavingVoice}
              >
                {isSavingVoice ? "SAVING…" : "✦ SAVE PROFILE"}
              </button>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
