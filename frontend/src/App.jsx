import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth, UserButton, SignIn, SignUp } from "@clerk/react";

import { useAuthFetch } from "./hooks/useAuthFetch.js";
import usePrefersReducedMotion from "./hooks/usePrefersReducedMotion.js";
import PersonalityForm from "./components/PersonalityForm.jsx";
import PersonalityList from "./components/PersonalityList.jsx";
import ChatWindow from "./components/ChatWindow.jsx";
import VoiceLab from "./components/VoiceLab.jsx";
import MemoryJournal from "./components/MemoryJournal.jsx";
import PersonaEditor from "./components/PersonaEditor.jsx";
import HarnessReport from "./components/HarnessReport.jsx";
import LlmSettingsPanel from "./components/LlmSettingsPanel.jsx";
import { PersonaStateProvider } from "./state/PersonaStateContext.jsx";

const appStyles = `
  :root {
    color-scheme: dark;
    --bg: #060c18;
    --bg-strong: #0a1220;
    --panel: rgba(10, 18, 34, 0.80);
    --panel-strong: rgba(12, 22, 42, 0.96);
    --border: rgba(0, 180, 255, 0.14);
    --text: #dde6f2;
    --muted: #6d80a0;
    --accent: #00c8ff;
    --accent-deep: #0050e0;
    --accent-soft: rgba(0, 200, 255, 0.10);
    --accent-warm: #ff7a38;
    --accent-magenta: #b83cf8;
    --shadow: 0 24px 64px rgba(0, 40, 120, 0.40);
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    min-width: 320px;
    min-height: 100vh;
    font-family: "Manrope", sans-serif;
    color: var(--text);
    background:
      radial-gradient(ellipse 60% 40% at 10% 5%, rgba(0, 80, 180, 0.16), transparent),
      radial-gradient(ellipse 50% 35% at 88% 90%, rgba(140, 20, 210, 0.12), transparent),
      linear-gradient(160deg, #040810 0%, #060c18 55%, #07091a 100%);
  }

  button,
  input,
  textarea {
    font: inherit;
  }

  button {
    cursor: pointer;
  }

  #root {
    position: relative;
    min-height: 100vh;
  }

  .app-shell {
    width: min(1380px, calc(100vw - 32px));
    margin: 0 auto;
    padding: 28px 0 32px;
  }

  .hero {
    position: relative;
    overflow: hidden;
    margin-bottom: 20px;
    padding: 28px 32px;
    border: 1px solid rgba(0, 180, 255, 0.22);
    border-radius: 28px;
    background: linear-gradient(135deg, rgba(8, 18, 38, 0.92), rgba(6, 14, 30, 0.88));
    box-shadow: var(--shadow), inset 0 1px 0 rgba(0, 200, 255, 0.07);
    backdrop-filter: blur(16px);
  }

  .hero::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(135deg, rgba(0, 180, 255, 0.06), rgba(160, 32, 240, 0.05), transparent 60%);
    pointer-events: none;
  }

  .hero::after {
    content: "";
    position: absolute;
    inset: auto -80px -110px auto;
    width: 280px;
    height: 280px;
    border-radius: 999px;
    background: radial-gradient(circle, rgba(0, 180, 255, 0.09), transparent 65%);
    pointer-events: none;
  }

  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 7px 14px;
    border-radius: 999px;
    background: rgba(0, 180, 255, 0.08);
    border: 1px solid rgba(0, 180, 255, 0.24);
    color: var(--accent);
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .hero-grid {
    position: relative;
    z-index: 1;
    display: grid;
    gap: 24px;
    grid-template-columns: 1.4fr 0.8fr;
    align-items: end;
  }

  .hero h1 {
    margin: 16px 0 12px;
    max-width: 12ch;
    font-size: clamp(2.8rem, 5vw, 5rem);
    font-weight: 800;
    line-height: 0.94;
    letter-spacing: -0.05em;
    background: linear-gradient(135deg, #ffffff 30%, var(--accent) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .hero p {
    margin: 0;
    max-width: 62ch;
    color: var(--muted);
    font-size: 1rem;
    line-height: 1.65;
  }

  .profile-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .profile-label {
    color: var(--muted);
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .profile-select {
    min-width: 140px;
    padding: 8px 12px;
    border-radius: 999px;
    border: 1px solid rgba(0, 180, 255, 0.2);
    background: rgba(5, 14, 26, 0.88);
    color: var(--text);
  }

  .hero-callout {
    padding: 20px;
    border-radius: 22px;
    background: rgba(0, 180, 255, 0.05);
    border: 1px solid rgba(0, 180, 255, 0.14);
  }

  .hero-callout strong {
    display: block;
    margin-bottom: 8px;
    color: var(--accent);
    font-size: 0.85rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .hero-callout span {
    display: block;
    line-height: 1.7;
    color: var(--muted);
  }

  .workspace {
    display: grid;
    grid-template-columns: 340px minmax(0, 1fr);
    gap: 20px;
  }

  .panel {
    border: 1px solid var(--border);
    border-radius: 26px;
    background: var(--panel);
    box-shadow: var(--shadow);
    backdrop-filter: blur(16px);
  }

  .sidebar {
    padding: 20px;
  }

  .main-panel {
    overflow: hidden;
  }

  .tabs {
    display: flex;
    gap: 8px;
    padding: 20px 20px 0;
    flex-wrap: wrap;
  }

  .tab {
    padding: 11px 18px;
    border: 1px solid rgba(0, 180, 255, 0.14);
    border-radius: 999px;
    background: rgba(0, 180, 255, 0.04);
    color: var(--muted);
    font-weight: 700;
    transition: transform 180ms ease, background 180ms ease, color 180ms ease, border-color 180ms ease;
  }

  .tab:hover {
    transform: translateY(-1px);
    border-color: rgba(0, 180, 255, 0.28);
    color: var(--text);
  }

  .tab.active {
    background: linear-gradient(135deg, var(--accent), var(--accent-deep));
    border-color: transparent;
    color: #fff;
    box-shadow: 0 4px 16px rgba(0, 160, 255, 0.30);
  }

  @keyframes softPulse {
    0% { box-shadow: 0 0 0 rgba(0, 200, 255, 0.0); }
    50% { box-shadow: 0 0 24px rgba(0, 200, 255, 0.18); }
    100% { box-shadow: 0 0 0 rgba(0, 200, 255, 0.0); }
  }

  .main-content {
    padding: 20px;
  }

  .status {
    margin-top: 16px;
    padding: 12px 16px;
    border-radius: 16px;
    font-size: 0.95rem;
  }

  .status.error {
    background: rgba(240, 40, 40, 0.08);
    color: #ff7272;
    border: 1px solid rgba(240, 40, 40, 0.18);
  }

  .status.success {
    background: rgba(0, 200, 120, 0.08);
    color: #3ae0a0;
    border: 1px solid rgba(0, 200, 120, 0.18);
  }

  .global-toast-stack {
    position: fixed;
    right: 16px;
    bottom: 18px;
    z-index: 1400;
    pointer-events: none;
  }

  .global-toast {
    min-width: min(420px, calc(100vw - 28px));
    max-width: min(520px, calc(100vw - 28px));
    padding: 12px 14px;
    border-radius: 14px;
    border: 1px solid rgba(0, 180, 255, 0.24);
    background: rgba(6, 16, 30, 0.92);
    color: var(--text);
    box-shadow: 0 18px 34px rgba(0, 18, 42, 0.44);
    backdrop-filter: blur(10px);
    animation: toastSlideIn 200ms ease;
  }

  .global-toast.added {
    border-color: rgba(66, 210, 144, 0.34);
  }

  .global-toast.updated {
    border-color: rgba(255, 184, 72, 0.34);
  }

  .global-toast.info {
    border-color: rgba(0, 180, 255, 0.34);
  }

  .global-toast.warn {
    border-color: rgba(255, 184, 72, 0.34);
  }

  .global-toast.error {
    border-color: rgba(255, 98, 98, 0.40);
  }

  .global-toast-title {
    font-size: 0.82rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #9fe7ff;
  }

  .global-toast-location {
    margin-top: 4px;
    color: var(--muted);
    font-size: 0.78rem;
  }

  .global-toast-body {
    margin-top: 6px;
    font-size: 0.9rem;
    line-height: 1.45;
    color: #dbe6f6;
  }

  .section-heading {
    margin: 0 0 8px;
    font-size: 1.8rem;
    font-weight: 800;
    letter-spacing: -0.04em;
    background: linear-gradient(135deg, #ffffff 40%, var(--accent));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .section-copy {
    margin: 0 0 20px;
    color: var(--muted);
    line-height: 1.6;
  }

  .meta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 20px;
  }

  .meta-pill {
    padding: 8px 14px;
    border-radius: 999px;
    background: rgba(0, 180, 255, 0.07);
    border: 1px solid rgba(0, 180, 255, 0.16);
    color: var(--accent);
    font-size: 0.88rem;
    font-weight: 700;
  }

  @media (max-width: 1024px) {
    .hero-grid,
    .workspace {
      grid-template-columns: 1fr;
    }

    .hero h1 {
      max-width: none;
    }
  }

  @media (max-width: 720px) {
    .app-shell {
      width: min(100vw - 20px, 1380px);
      padding-top: 18px;
    }

    .hero,
    .sidebar,
    .main-content {
      padding: 18px;
    }

    .tabs {
      padding: 18px 18px 0;
      overflow-x: auto;
    }

    .global-toast-stack {
      right: 10px;
      bottom: 12px;
    }

    .global-toast {
      min-width: min(94vw, 520px);
    }
  }

  @keyframes toastSlideIn {
    0% { transform: translateY(8px); opacity: 0; }
    100% { transform: translateY(0); opacity: 1; }
  }

  /* Cyberpunk control deck pass */
  body {
    position: relative;
    background:
      radial-gradient(circle at 18% 14%, rgba(0, 234, 255, 0.16), transparent 0, transparent 34%),
      radial-gradient(circle at 84% 10%, rgba(255, 62, 207, 0.12), transparent 36%),
      linear-gradient(180deg, #01040c 0%, #030815 48%, #020611 100%);
    background-attachment: fixed;
  }

  body::before {
    content: "";
    position: fixed;
    inset: 0;
    pointer-events: none;
    opacity: 0.2;
    background:
      linear-gradient(rgba(0, 234, 255, 0.05) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0, 234, 255, 0.05) 1px, transparent 1px);
    background-size: 36px 36px;
    mask-image: radial-gradient(circle at center, black 40%, transparent 100%);
  }

  .background-stack {
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    overflow: hidden;
  }

  .cyberpunk-bg-video {
    position: absolute;
    inset: -4%;
    width: 108%;
    height: 108%;
    object-fit: cover;
    opacity: 0.22;
    filter: blur(8px) saturate(1.06) contrast(1.05);
    transform: scale(1.05);
    animation: bgDrift 22s ease-in-out infinite alternate;
  }

  .cyberpunk-bg-shader {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0.72;
    mix-blend-mode: screen;
  }

  @keyframes bgDrift {
    0% { transform: scale(1.05) translate3d(-1.2%, -0.8%, 0); }
    50% { transform: scale(1.09) translate3d(1.2%, 0.6%, 0); }
    100% { transform: scale(1.07) translate3d(-0.4%, 1.1%, 0); }
  }

  .app-shell {
    position: relative;
    z-index: 2;
    width: min(1500px, calc(100vw - 24px));
    padding: 18px 0 26px;
  }

  .hero {
    margin-bottom: 14px;
    padding: 20px 22px;
    border-radius: 24px;
    border: 1px solid rgba(33, 230, 255, 0.20);
    background: linear-gradient(135deg, rgba(4, 13, 27, 0.96), rgba(6, 14, 28, 0.88));
    box-shadow:
      0 0 0 1px rgba(112, 224, 255, 0.04) inset,
      0 24px 80px rgba(1, 9, 24, 0.78),
      0 0 22px rgba(0, 234, 255, 0.08);
  }

  .hero::before {
    background:
      linear-gradient(135deg, rgba(0, 234, 255, 0.08), rgba(255, 62, 207, 0.06), transparent 62%);
  }

  .hero::after {
    width: 360px;
    height: 220px;
    inset: auto -40px -80px auto;
    background: radial-gradient(circle, rgba(255, 62, 207, 0.10), transparent 68%);
  }

  .eyebrow {
    border-radius: 10px;
    border-color: rgba(0, 234, 255, 0.22);
    background: rgba(0, 234, 255, 0.08);
    color: #8ef2ff;
    letter-spacing: 0.12em;
  }

  .hero-grid {
    grid-template-columns: 1.15fr 0.85fr;
    gap: 18px;
    align-items: stretch;
  }

  .hero h1 {
    max-width: 14ch;
    font-size: clamp(2.4rem, 4.3vw, 4rem);
    text-transform: uppercase;
  }

  .hero p {
    max-width: 70ch;
    color: #90a8c8;
  }

  .profile-row {
    margin-top: 18px;
    gap: 10px;
  }

  .profile-select {
    border-radius: 12px;
    background: rgba(2, 10, 24, 0.96);
    border-color: rgba(0, 234, 255, 0.18);
    box-shadow: inset 0 0 14px rgba(0, 234, 255, 0.05);
  }

  .hero-callout {
    display: grid;
    align-content: start;
    gap: 8px;
    border-radius: 20px;
    background: linear-gradient(180deg, rgba(7, 18, 34, 0.94), rgba(5, 11, 24, 0.84));
    border-color: rgba(255, 62, 207, 0.18);
    box-shadow: inset 0 0 24px rgba(255, 62, 207, 0.04);
  }

  .workspace {
    grid-template-columns: 320px minmax(0, 1fr);
    gap: 14px;
    align-items: start;
  }

  .workspace.sidebar-collapsed {
    grid-template-columns: 86px minmax(0, 1fr);
  }

  .panel {
    position: relative;
    border-radius: 24px;
    background: linear-gradient(180deg, rgba(4, 11, 24, 0.96), rgba(2, 8, 18, 0.90));
    border: 1px solid rgba(22, 226, 255, 0.18);
    box-shadow:
      0 0 0 1px rgba(124, 231, 255, 0.04) inset,
      0 18px 50px rgba(0, 0, 0, 0.46),
      0 0 18px rgba(0, 234, 255, 0.05);
  }

  .panel::before {
    content: "";
    position: absolute;
    inset: 8px;
    border-radius: 18px;
    border: 1px solid rgba(0, 234, 255, 0.05);
    pointer-events: none;
  }

  .sidebar {
    position: sticky;
    top: 16px;
    max-height: calc(100vh - 32px);
    overflow: auto;
    padding: 18px;
  }

  .sidebar-toggle {
    width: 100%;
    border: 1px solid rgba(0, 234, 255, 0.18);
    border-radius: 12px;
    background: linear-gradient(135deg, rgba(0, 234, 255, 0.10), rgba(34, 94, 255, 0.14));
    color: #9cecff;
    font-weight: 800;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 10px 10px;
  }

  .sidebar.collapsed {
    display: grid;
    gap: 10px;
    align-content: start;
    justify-items: stretch;
    padding: 12px;
    overflow: hidden;
  }

  .sidebar-mini {
    display: grid;
    gap: 8px;
    color: #8fa6c5;
    text-align: center;
    font-size: 0.72rem;
  }

  .sidebar-mini strong {
    color: #b8f5ff;
    font-size: 0.74rem;
    line-height: 1.25;
  }

  .fx-option-note {
    margin-top: 6px;
    color: #7f95b3;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .tabs {
    gap: 10px;
    padding: 16px 16px 0;
    border-bottom: 1px solid rgba(0, 234, 255, 0.08);
    background: linear-gradient(180deg, rgba(0, 234, 255, 0.03), transparent);
  }

  .tab {
    padding: 10px 14px;
    border-radius: 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.76rem;
    background: rgba(0, 234, 255, 0.04);
    border-color: rgba(0, 234, 255, 0.12);
    color: #8ca6c8;
  }

  .tab.active {
    background: linear-gradient(135deg, rgba(0, 234, 255, 0.96), rgba(168, 84, 255, 0.92));
    color: #04111c;
    box-shadow: 0 0 24px rgba(0, 234, 255, 0.16);
  }

  .main-content {
    padding: 18px 18px 22px;
  }

  .section-heading {
    font-size: 1.42rem;
    text-transform: uppercase;
    letter-spacing: 0.07em;
  }

  .section-copy {
    max-width: 74ch;
    color: #8fa6c5;
  }

  .meta-pill {
    border-radius: 10px;
    background: rgba(0, 234, 255, 0.06);
    border-color: rgba(0, 234, 255, 0.14);
    color: #90ecff;
    font-size: 0.76rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .status {
    border-radius: 12px;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  @media (max-width: 1024px) {
    .workspace {
      grid-template-columns: 1fr;
    }

    .workspace.sidebar-collapsed {
      grid-template-columns: 1fr;
    }

    .sidebar {
      position: static;
      max-height: none;
    }

    .sidebar.collapsed {
      justify-items: start;
    }

    .sidebar-toggle {
      width: auto;
      min-width: 200px;
    }

    .sidebar-mini {
      text-align: left;
    }
  }

  @media (max-width: 720px) {
    .cyberpunk-bg-video {
      opacity: 0.17;
      filter: blur(6px) saturate(1.04);
    }

    .cyberpunk-bg-shader {
      opacity: 0.6;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .cyberpunk-bg-video {
      animation: none;
    }

    .cyberpunk-bg-shader {
      opacity: 0.48;
    }
  }
`;

export default function App() {
  const storedSidebarOpen =
    typeof window !== "undefined" && window.localStorage
      ? window.localStorage.getItem("voxis:sidebar-open")
      : null;
  const storedBackgroundFx =
    typeof window !== "undefined" && window.localStorage
      ? window.localStorage.getItem("voxis:background-fx")
      : null;

  const [personalities, setPersonalities] = useState([]);
  const [users, setUsers] = useState([]);
  const [userProfiles, setUserProfiles] = useState({});
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedMode, setSelectedMode] = useState("normal");
  const [chatPolicy, setChatPolicy] = useState(null);
  const [profileDraft, setProfileDraft] = useState({
    defaultMode: "normal",
    safetyTier: "standard",
    performanceTier: "balanced",
    voiceNarrationEnabled: false,
    supervisedAdvancedMode: false,
  });
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [activeView, setActiveView] = useState("chat");
  const [personaEditorTarget, setPersonaEditorTarget] = useState(null);
  const [builderMode, setBuilderMode] = useState("create");
  const [chatLogs, setChatLogs] = useState({});
  const [personaMemoryById, setPersonaMemoryById] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [liveChatState, setLiveChatState] = useState({});
  const [status, setStatus] = useState({ type: "", message: "" });
  const [neuralToast, setNeuralToast] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(storedSidebarOpen != null ? storedSidebarOpen === "1" : false);
  const [backgroundFxIntensity, setBackgroundFxIntensity] = useState(
    storedBackgroundFx === "off" || storedBackgroundFx === "low" || storedBackgroundFx === "full"
      ? storedBackgroundFx
      : "full",
  );
  const backgroundCanvasRef = useRef(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function parseSseEvent(chunk) {
    const lines = String(chunk || "").split("\n");
    let eventName = "message";
    const dataLines = [];

    for (const line of lines) {
      if (!line || line.startsWith(":")) {
        continue;
      }

      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim() || "message";
        continue;
      }

      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      }
    }

    if (!dataLines.length) {
      return null;
    }

    return {
      type: eventName,
      payload: JSON.parse(dataLines.join("\n")),
    };
  }

  function clipText(text, max = 72) {
    const normalized = String(text || "").replace(/\s+/g, " ").trim();
    if (!normalized) {
      return "";
    }
    if (normalized.length <= max) {
      return normalized;
    }
    return `${normalized.slice(0, max - 1)}…`;
  }

  function buildNeuralMemoryToast({ phase, debug, personalityName }) {
    const personalityLabel = personalityName ? ` · ${personalityName}` : "";

    if (phase === "memory-write") {
      const extracted = Array.isArray(debug?.memoryExtracted) ? debug.memoryExtracted : [];
      if (!extracted.length) {
        return null;
      }
      const first = extracted[0];
      const more = extracted.length > 1 ? ` +${extracted.length - 1} more` : "";
      return {
        id: Date.now() + Math.random(),
        kind: "added",
        title: `Added: New Memory${personalityLabel}`,
        location: "Neural Core > Personality Memory",
        body: `"${clipText(first?.content || "Memory captured")}"${more}`,
      };
    }

    if (phase === "user-memory-write") {
      const extracted = Array.isArray(debug?.userMemoryExtracted) ? debug.userMemoryExtracted : [];
      if (!extracted.length) {
        return null;
      }
      const first = extracted[0];
      const more = extracted.length > 1 ? ` +${extracted.length - 1} more` : "";
      return {
        id: Date.now() + Math.random(),
        kind: "updated",
        title: `Updated: Memory${personalityLabel}`,
        location: "Neural Core > User Memory",
        body: `"${clipText(first?.content || "User memory updated")}"${more}`,
      };
    }

    if (phase === "mood") {
      const label = String(debug?.mood?.label || "").trim();
      const before = debug?.mood?.before;
      const after = debug?.mood?.after;
      if (!label && !after) {
        return null;
      }

      const beforeSummary = before
        ? `V:${Number(before.valence || 0).toFixed(2)} A:${Number(before.arousal || 0).toFixed(2)} D:${Number(before.dominance || 0).toFixed(2)}`
        : "-";
      const afterSummary = after
        ? `V:${Number(after.valence || 0).toFixed(2)} A:${Number(after.arousal || 0).toFixed(2)} D:${Number(after.dominance || 0).toFixed(2)}`
        : "-";

      return {
        id: Date.now() + Math.random(),
        kind: "info",
        title: `Mood Shift${personalityLabel}${label ? ` · ${label}` : ""}`,
        location: "Neural Core > Mood Engine",
        body: `${beforeSummary} → ${afterSummary}`,
      };
    }

    if (phase === "intent") {
      const goal = String(debug?.goal?.goal || "").trim();
      if (!goal) {
        return null;
      }

      return {
        id: Date.now() + Math.random(),
        kind: "info",
        title: `Intent Selected${personalityLabel}`,
        location: "Neural Core > Intent Engine",
        body: `"${clipText(goal)}"`,
      };
    }

    if ((phase === "prompt" || phase === "intent") && debug?.flags?.reconditioned) {
      return {
        id: Date.now() + Math.random(),
        kind: "warn",
        title: `Reconditioning Triggered${personalityLabel}`,
        location: "Neural Core > Identity Anchor",
        body: "Persona anchor injected to reduce drift.",
      };
    }

    if (phase === "reply" && debug?.scientist) {
      const validation = debug.scientist.validation;
      const repairAttempted = Boolean(debug.scientist.repairAttempted);
      const violations = Array.isArray(validation?.violations) ? validation.violations : [];

      if (repairAttempted || violations.length > 0) {
        return {
          id: Date.now() + Math.random(),
          kind: violations.length > 0 ? "warn" : "info",
          title: `Scientist Validation${personalityLabel}`,
          location: "Neural Core > Evidence Layer",
          body: violations.length > 0
            ? `Repair attempted. Issues: ${clipText(violations.join(", "), 92)}`
            : "Repair pass applied successfully.",
        };
      }
    }

    if (phase === "rate-limit") {
      return {
        id: Date.now() + Math.random(),
        kind: "warn",
        title: `Rate Limit Hit${personalityLabel}`,
        location: "Neural Core > Recovery",
        body: "Primary generation throttled. Retrying with compact prompt.",
      };
    }

    if (phase === "rate-limit-retry") {
      return {
        id: Date.now() + Math.random(),
        kind: "info",
        title: `Rate Limit Recovered${personalityLabel}`,
        location: "Neural Core > Recovery",
        body: "Retry succeeded using reduced context.",
      };
    }

    if (phase === "rate-limit-fallback") {
      return {
        id: Date.now() + Math.random(),
        kind: "error",
        title: `Rate Limit Fallback${personalityLabel}`,
        location: "Neural Core > Recovery",
        body: "Fallback response delivered after retry exhaustion.",
      };
    }

    return null;
  }

  useEffect(() => {
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }
    window.localStorage.setItem("voxis:sidebar-open", isSidebarOpen ? "1" : "0");
  }, [isSidebarOpen]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }
    window.localStorage.setItem("voxis:background-fx", backgroundFxIntensity);
  }, [backgroundFxIntensity]);

  useEffect(() => {
    if (!neuralToast) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setNeuralToast(null);
    }, 4200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [neuralToast]);

  const { isSignedIn, isLoaded } = useAuth();
  const authFetch = useAuthFetch();

  const selectedPersonality = useMemo(() => {
    const list = Array.isArray(personalities) ? personalities : [];
    return list.find((personality) => personality.id === selectedId) || null;
  }, [personalities, selectedId]);

  const selectedMemoryItems = useMemo(
    () => (selectedId ? personaMemoryById[selectedId] || [] : []),
    [personaMemoryById, selectedId],
  );

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) || null,
    [users, selectedUserId],
  );

  const selectedUserProfile = useMemo(
    () => (selectedUserId ? userProfiles[selectedUserId] || null : null),
    [selectedUserId, userProfiles],
  );

  const backgroundMood = useMemo(() => {
    const rawMood = selectedPersonality?.moodState || {};
    return {
      valence: clamp(Number(rawMood.valence || 0), -1, 1),
      arousal: clamp(Number(rawMood.arousal || 0.35), 0, 1),
      dominance: clamp(Number(rawMood.dominance || 0), -1, 1),
    };
  }, [selectedPersonality]);

  const activePhase = selectedId ? liveChatState[selectedId]?.phase || "" : "";
  const initialPersonaSection = useMemo(() => {
    const category = personaEditorTarget?.category;
    if (category === "memory") {
      return "memory";
    }
    if (category === "mood") {
      return "neural";
    }
    if (category === "traits" || category === "quirks" || category === "sayings") {
      return "behavior";
    }
    return personaEditorTarget?.section || "basic";
  }, [personaEditorTarget]);

  const backgroundFxMultiplier =
    backgroundFxIntensity === "off"
      ? 0
      : backgroundFxIntensity === "low"
      ? 0.55
      : 1;

  const authPath = useMemo(() => {
    if (typeof window === "undefined") {
      return "/";
    }

    return window.location.pathname || "/";
  }, []);

  const allowedModes = useMemo(() => {
    if (!selectedUser) {
      return ["normal", "scientist"];
    }

    if (selectedUser.ageBand === "child") {
      return ["kids"];
    }

    if (selectedUser.ageBand === "teen") {
      if (selectedUserProfile?.supervisedAdvancedMode) {
        return ["kids", "normal", "scientist"];
      }

      return ["kids"];
    }

    return ["kids", "normal", "scientist"];
  }, [selectedUser, selectedUserProfile]);

  useEffect(() => {
    if (!isSignedIn) return;
    void loadCurrentUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);

  useEffect(() => {
    if (!isSignedIn) return;
    void loadPersonalities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);

  useEffect(() => {
    if (!selectedId) {
      return;
    }

    void loadChatHistory(selectedId);
    void loadPersonalityMemory(selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (!allowedModes.includes(selectedMode)) {
      setSelectedMode(allowedModes[0] || "scientist");
    }
  }, [allowedModes, selectedMode]);

  useEffect(() => {
    if (!selectedUserId) {
      return;
    }

    const preferredMode = selectedUserProfile?.defaultMode;
    if (preferredMode && allowedModes.includes(preferredMode)) {
      setSelectedMode(preferredMode);
      return;
    }

    if (allowedModes.length) {
      setSelectedMode(allowedModes[0]);
    }
  }, [selectedUserId, selectedUserProfile?.defaultMode, allowedModes]);

  useEffect(() => {
    if (!selectedUserProfile) {
      return;
    }

    setProfileDraft({
      defaultMode: selectedUserProfile.defaultMode || "scientist",
      safetyTier: selectedUserProfile.safetyTier || "standard",
      performanceTier: selectedUserProfile.performanceTier || "balanced",
      voiceNarrationEnabled: Boolean(selectedUserProfile.voiceNarrationEnabled),
      supervisedAdvancedMode: Boolean(selectedUserProfile.supervisedAdvancedMode),
    });
  }, [selectedUserProfile]);

  useEffect(() => {
    const canvas = backgroundCanvasRef.current;
    if (!canvas) {
      return undefined;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return undefined;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let frameId = 0;

    function resize() {
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.scale(dpr, dpr);
    }

    function paint(timeMs) {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const time = timeMs * 0.001;

      if (backgroundFxMultiplier <= 0) {
        context.clearRect(0, 0, width, height);
        return;
      }

      const phaseToken = String(activePhase || "");
      const normalizedPhase = phaseToken.startsWith("memory")
        ? "memory"
        : phaseToken.startsWith("rate-limit")
        ? "rate-limit"
        : phaseToken || "idle";
      const phasePalette = {
        idle: { hueShift: 0, energy: 0.92 },
        thinking: { hueShift: 14, energy: 1.02 },
        llm: { hueShift: 18, energy: 1.1 },
        prompt: { hueShift: 26, energy: 1.08 },
        intent: { hueShift: 36, energy: 1.12 },
        memory: { hueShift: -22, energy: 0.88 },
        mood: { hueShift: -8, energy: 0.94 },
        reply: { hueShift: 10, energy: 1.18 },
        "rate-limit": { hueShift: 54, energy: 1.34 },
      };
      const phaseStyle = phasePalette[normalizedPhase] || phasePalette.idle;

      const hueA = 194 + backgroundMood.valence * 44 + phaseStyle.hueShift;
      const hueB = 306 + backgroundMood.dominance * 36 + phaseStyle.hueShift * 0.55;
      const drift = (0.12 + backgroundMood.arousal * 0.38) * phaseStyle.energy * backgroundFxMultiplier;
      const fxAlpha = 0.65 * backgroundFxMultiplier;

      context.clearRect(0, 0, width, height);

      const gradient = context.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, `hsla(${hueA.toFixed(1)}, 88%, 42%, ${(0.14 * fxAlpha).toFixed(3)})`);
      gradient.addColorStop(0.55, `hsla(${(hueA + 20).toFixed(1)}, 78%, 38%, ${(0.1 * fxAlpha).toFixed(3)})`);
      gradient.addColorStop(1, `hsla(${hueB.toFixed(1)}, 76%, 48%, ${(0.13 * fxAlpha).toFixed(3)})`);
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);

      const orbCount = prefersReducedMotion
        ? Math.max(1, Math.round(2 * backgroundFxMultiplier))
        : Math.max(2, Math.round(5 * backgroundFxMultiplier));
      for (let i = 0; i < orbCount; i += 1) {
        const ratio = (i + 1) / (orbCount + 1);
        const wobbleX = Math.sin(time * (0.3 + ratio * drift) + i * 1.7);
        const wobbleY = Math.cos(time * (0.28 + ratio * drift) + i * 2.1);
        const cx = width * ratio + wobbleX * width * 0.08;
        const cy = height * (0.26 + ratio * 0.48) + wobbleY * height * 0.08;
        const radius = Math.max(width, height) * (0.1 + ratio * 0.08) * (0.75 + backgroundFxMultiplier * 0.45);
        const orb = context.createRadialGradient(cx, cy, radius * 0.06, cx, cy, radius);
        orb.addColorStop(0, `hsla(${(hueA + i * 10).toFixed(1)}, 98%, 70%, ${(0.18 * fxAlpha).toFixed(3)})`);
        orb.addColorStop(0.44, `hsla(${(hueB - i * 8).toFixed(1)}, 84%, 58%, ${(0.08 * fxAlpha).toFixed(3)})`);
        orb.addColorStop(1, "rgba(0, 0, 0, 0)");
        context.fillStyle = orb;
        context.beginPath();
        context.arc(cx, cy, radius, 0, Math.PI * 2);
        context.fill();
      }

      if (!prefersReducedMotion) {
        frameId = window.requestAnimationFrame(paint);
      }
    }

    resize();
    window.addEventListener("resize", resize);

    if (prefersReducedMotion) {
      paint(0);
    } else {
      frameId = window.requestAnimationFrame(paint);
    }

    return () => {
      window.removeEventListener("resize", resize);
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [activePhase, backgroundMood, backgroundFxMultiplier, prefersReducedMotion]);

  const backgroundLayer = (
    <div className="background-stack" aria-hidden="true">
      {!prefersReducedMotion && backgroundFxIntensity !== "off" ? (
        <video
          className="cyberpunk-bg-video"
          src="/cyberpunk-bg.mp4"
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          tabIndex={-1}
        />
      ) : null}
      <canvas
        ref={backgroundCanvasRef}
        className="cyberpunk-bg-shader"
        style={{ opacity: backgroundFxIntensity === "off" ? 0 : backgroundFxIntensity === "low" ? 0.46 : 0.72 }}
      />
    </div>
  );

  async function loadCurrentUser() {
    try {
      const response = await authFetch("/me");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load current user.");
      }

      const me = data?.user || data;
      if (!me || !Number.isInteger(Number(me.id))) {
        throw new Error("Failed to resolve current user id.");
      }

      setUsers([me]);
      setSelectedUserId(Number(me.id));

      const profileResponse = await authFetch(`/users/${Number(me.id)}/profile`);
      const profileData = await profileResponse.json();
      if (!profileResponse.ok) {
        throw new Error(profileData.error || "Failed to load user profile.");
      }

      setUserProfiles({ [Number(me.id)]: profileData.profile });
    } catch (error) {
      setStatus({
        type: "error",
        message: error.message || "Failed to load user.",
      });
    }
  }

  async function saveSelectedUserProfile() {
    if (!selectedUserId) {
      return;
    }

    setIsSavingProfile(true);
    try {
      const response = await authFetch(`/users/${selectedUserId}/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(profileDraft),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to save user profile.");
      }

      setUserProfiles((current) => ({
        ...current,
        [selectedUserId]: data.profile,
      }));
      setStatus({ type: "success", message: "User policy profile saved." });
    } catch (error) {
      setStatus({ type: "error", message: error.message || "Failed to save user profile." });
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function loadPersonalities() {
    setIsLoading(true);

    try {
      const response = await authFetch("/personalities");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load personalities.");
      }

      const personalityList = Array.isArray(data)
        ? data
        : Array.isArray(data?.personalities)
        ? data.personalities
        : [];

      setPersonalities(personalityList);

      if (!selectedId && personalityList.length) {
        setSelectedId(personalityList[0].id);
      }
    } catch (error) {
      setStatus({
        type: "error",
        message: error.message || "Failed to load personalities.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function loadChatHistory(personalityId) {
    setIsLoadingMessages(true);

    try {
      const response = await authFetch(`/personality/${personalityId}/messages`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load chat history.");
      }

      setChatLogs((current) => ({
        ...current,
        [personalityId]: data,
      }));
    } catch (error) {
      setStatus({
        type: "error",
        message: error.message || "Failed to load chat history.",
      });
    } finally {
      setIsLoadingMessages(false);
    }
  }

  async function loadPersonalityMemory(personalityId) {
    try {
      const response = await authFetch(`/personality/${personalityId}/memory`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load personality memory.");
      }

      setPersonaMemoryById((current) => ({
        ...current,
        [personalityId]: Array.isArray(data) ? data : [],
      }));
    } catch {
      setPersonaMemoryById((current) => ({
        ...current,
        [personalityId]: current[personalityId] || [],
      }));
    }
  }

  function handlePersonalityCreated(personality) {
    setPersonalities((current) => [personality, ...(Array.isArray(current) ? current : [])]);
    setSelectedId(personality.id);
    setChatLogs((current) => ({
      ...current,
      [personality.id]: [],
    }));
    setActiveView("chat");
    setStatus({
      type: "success",
      message: `${personality.name} is ready. Start chatting now, or open Voice Lab to dial in TTS.`,
    });
  }

  function handlePersonalityUpdated(personality) {
    setPersonalities((current) => {
      const list = Array.isArray(current) ? current : [];
      return list.map((item) => (item.id === personality.id ? personality : item));
    });
    setSelectedId(personality.id);
    setStatus({
      type: "success",
      message: `${personality.name} was updated.`,
    });
  }

  function handlePersonaFieldUpdate({ field, index, value }) {
    if (!selectedId || !field) {
      return;
    }

    setPersonalities((current) => {
      const list = Array.isArray(current) ? current : [];
      return list.map((item) => {
        if (item.id !== selectedId) {
          return item;
        }

        if (Number.isInteger(index)) {
          const source = Array.isArray(item[field]) ? item[field] : [];
          const next = [...source];
          next[index] = value;
          return { ...item, [field]: next };
        }

        return { ...item, [field]: value };
      });
    });
  }

  async function handlePersonaMemoryUpdate({ memoryId, content, memoryType }) {
    if (!selectedId || !memoryId) {
      return false;
    }

    setPersonaMemoryById((current) => ({
      ...current,
      [selectedId]: (current[selectedId] || []).map((item) =>
        item.id === memoryId
          ? {
              ...item,
              content,
              memory_type: memoryType || item.memory_type,
            }
          : item,
      ),
    }));

    const response = await authFetch(`/memory/${memoryId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
        memoryType,
      }),
    });

    if (!response.ok) {
      await loadPersonalityMemory(selectedId);
      return false;
    }

    const updated = await response.json();
    setPersonaMemoryById((current) => ({
      ...current,
      [selectedId]: (current[selectedId] || []).map((item) =>
        item.id === memoryId ? updated : item,
      ),
    }));

    return true;
  }

  async function handleVoiceProfileChange(nextVoiceProfile) {
    if (!selectedPersonality) {
      return;
    }

    try {
      const response = await authFetch(`/personality/${selectedPersonality.id}/voice`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          voiceProfile: nextVoiceProfile,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save voice profile.");
      }

      setPersonalities((current) => {
        const list = Array.isArray(current) ? current : [];
        return list.map((personality) => (personality.id === data.id ? data : personality));
      });
      setStatus({
        type: "success",
        message: `Saved voice settings for ${data.name}.`,
      });
    } catch (error) {
      setStatus({
        type: "error",
        message: error.message || "Failed to save voice profile.",
      });
    }
  }

  function handleSelectPersonality(id) {
    setSelectedId(id);
    setStatus({ type: "", message: "" });
  }

  async function handleSendMessage(message) {
    if (!selectedPersonality) {
      setStatus({
        type: "error",
        message: "Create or select a personality before sending a message.",
      });
      return;
    }

    const personalityId = selectedPersonality.id;

    setStatus({ type: "", message: "" });
    setIsSending(true);
    setLiveChatState((current) => ({
      ...current,
      [personalityId]: {
        phase: "queued",
        debug: null,
        reply: "",
        finalReceived: false,
        seq: (current[personalityId]?.seq || 0) + 1,
      },
    }));
    setChatLogs((current) => ({
      ...current,
      [personalityId]: [
        ...(current[personalityId] || []),
        { role: "user", content: message },
      ],
    }));

    try {
      const response = await authFetch("/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalityId,
          userId: selectedUserId,
          mode: selectedMode,
          message,
          streamDebug: true,
        }),
      });

      const contentType = response.headers.get("content-type") || "";
      let data = null;

      if (contentType.includes("text/event-stream") && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finalCommitted = false;

        while (true) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

          const events = buffer.split("\n\n");
          buffer = events.pop() || "";

          for (const rawEvent of events) {
            const parsed = parseSseEvent(rawEvent);
            if (!parsed) {
              continue;
            }

            const { type, payload } = parsed;

            if (type === "debug") {
              const toast = buildNeuralMemoryToast({
                phase: payload.phase,
                debug: payload.debug,
                personalityName: selectedPersonality?.name || "",
              });
              if (toast) {
                setNeuralToast(toast);
              }

              setLiveChatState((current) => ({
                ...current,
                [personalityId]: {
                  ...(current[personalityId] || {}),
                  phase: payload.phase,
                  debug: payload.debug,
                  seq: (current[personalityId]?.seq || 0) + 1,
                },
              }));
            } else if (type === "token") {
              setLiveChatState((current) => ({
                ...current,
                [personalityId]: {
                  ...(current[personalityId] || {}),
                  phase: payload.phase || "generation",
                  debug: payload.debug || current[personalityId]?.debug || null,
                  reply: payload.reply || "",
                  seq: (current[personalityId]?.seq || 0) + 1,
                },
              }));
            } else if (type === "error") {
              throw new Error(payload.error || "Failed to send chat message.");
            } else if (type === "final") {
              data = payload;
              if (!finalCommitted) {
                setChatLogs((current) => ({
                  ...current,
                  [personalityId]: [
                    ...(current[personalityId] || []),
                    { role: "assistant", content: payload.reply, debug: payload.debug || null },
                  ],
                }));

                if (payload.moodState || payload.moodLabel) {
                  setPersonalities((current) =>
                    current.map((p) =>
                      p.id === personalityId
                        ? { ...p, moodState: payload.moodState, moodLabel: payload.moodLabel }
                        : p
                    )
                  );
                }

                if (payload.policy) {
                  setChatPolicy(payload.policy);
                }

                setLiveChatState((current) => ({
                  ...current,
                  [personalityId]: {
                    ...(current[personalityId] || {}),
                    phase: "reply-complete",
                    debug: payload.debug || current[personalityId]?.debug || null,
                    reply: "",
                    finalReceived: true,
                    seq: (current[personalityId]?.seq || 0) + 1,
                  },
                }));
                setIsSending(false);
                finalCommitted = true;
              }
            } else if (type === "done") {
              setLiveChatState((current) => ({
                ...current,
                [personalityId]: null,
              }));
            }
          }

          if (done) {
            break;
          }
        }
      } else {
        data = await response.json();
      }

      if (!response.ok) {
        throw new Error(data?.error || "Failed to send chat message.");
      }

      if (!data) {
        throw new Error("Chat stream ended before a final payload was received.");
      }

      if (!contentType.includes("text/event-stream")) {
        setChatLogs((current) => ({
          ...current,
          [personalityId]: [
            ...(current[personalityId] || []),
            { role: "assistant", content: data.reply, debug: data.debug || null },
          ],
        }));

        if (data.moodState || data.moodLabel) {
          setPersonalities((current) =>
            current.map((p) =>
              p.id === personalityId
                ? { ...p, moodState: data.moodState, moodLabel: data.moodLabel }
                : p
            )
          );
        }

        if (data.policy) {
          setChatPolicy(data.policy);
        }

        setLiveChatState((current) => ({
          ...current,
          [personalityId]: null,
        }));
      }
    } catch (error) {
      setChatLogs((current) => ({
        ...current,
        [personalityId]: (current[personalityId] || []).slice(0, -1),
      }));
      setStatus({
        type: "error",
        message: error.message || "Failed to send chat message.",
      });
      setLiveChatState((current) => ({
        ...current,
        [personalityId]: null,
      }));
    } finally {
      setIsSending(false);
    }
  }

  if (!isLoaded) return null;

  if (!isSignedIn) {
    const showSignUp = authPath === "/sign-up";

    return (
      <>
        <style>{appStyles}</style>
        {backgroundLayer}
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", position: "relative", zIndex: 2 }}>
          {showSignUp ? (
            <SignUp
              routing="virtual"
              signInUrl="/sign-in"
              forceRedirectUrl="/"
            />
          ) : (
            <SignIn
              routing="virtual"
              signUpUrl="/sign-up"
              forceRedirectUrl="/"
            />
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <style>{appStyles}</style>
      {backgroundLayer}
      {neuralToast ? (
        <div className="global-toast-stack" aria-live="polite" aria-atomic="true">
          <div className={`global-toast ${neuralToast.kind}`}>
            <div className="global-toast-title">{neuralToast.title}</div>
            <div className="global-toast-location">{neuralToast.location}</div>
            <div className="global-toast-body">{neuralToast.body}</div>
          </div>
        </div>
      ) : null}
      <PersonaStateProvider
        personality={selectedPersonality}
        memoryItems={selectedMemoryItems}
        onUpdatePersonaField={handlePersonaFieldUpdate}
        onUpdateMemoryItem={handlePersonaMemoryUpdate}
        editorTarget={personaEditorTarget}
        setEditorTarget={setPersonaEditorTarget}
      >
      <div className="app-shell">
        <section className="hero">
          <div className="hero-grid">
            <div>
              <span className="eyebrow">Voxis Synaptic OS</span>
              <h1>Neural control deck</h1>
              <p>
                Load a persona, inspect the live neural graph, and drive the full conversation stack from a
                single cyberpunk dashboard. This branch is focused on cinematic control-room UX layered over
                the existing Voxis memory, mood, and voice systems.
              </p>
                <div className="profile-row" style={{ marginTop: 16 }}>
                  <UserButton afterSignOutUrl="/" />
                  {selectedUser && (
                    <span className="profile-label">{selectedUser.displayName}</span>
                  )}
                  <label className="profile-label" htmlFor="mode-select">Mode</label>
                  <select
                    id="mode-select"
                    className="profile-select"
                    value={selectedMode}
                    onChange={(event) => setSelectedMode(event.target.value)}
                  >
                    {allowedModes.map((mode) => (
                      <option key={mode} value={mode}>
                        {mode}
                      </option>
                    ))}
                  </select>
                  <label className="profile-label" htmlFor="background-fx-quick">Background FX</label>
                  <select
                    id="background-fx-quick"
                    className="profile-select"
                    value={backgroundFxIntensity}
                    onChange={(event) => setBackgroundFxIntensity(event.target.value)}
                  >
                    <option value="off">off</option>
                    <option value="low">low</option>
                    <option value="full">full</option>
                  </select>
                </div>
            </div>
            <div className="hero-callout">
              <strong>Deck Notes</strong>
              <span>
                Pick a saved persona from the thumbnail rail, watch the Neural Core react in real time,
                and use Voice Lab for the deeper synthesis controls. The same Voxis internals are running —
                this pass is about the interface and feel.
              </span>
            </div>
          </div>
        </section>

        <section className={`workspace ${isSidebarOpen ? "" : "sidebar-collapsed"}`}>
          <aside className={`panel sidebar ${isSidebarOpen ? "" : "collapsed"}`}>
            <button
              type="button"
              className="sidebar-toggle"
              onClick={() => setIsSidebarOpen((current) => !current)}
            >
              {isSidebarOpen ? "Hide Personas" : `Saved Personas${personalities.length ? ` (${personalities.length})` : ""}`}
            </button>

            {isSidebarOpen ? (
              <PersonalityList
                personalities={personalities}
                activeId={selectedId}
                isLoading={isLoading}
                onRefresh={loadPersonalities}
                onSelect={handleSelectPersonality}
                onOpenChat={() => setActiveView("chat")}
              />
            ) : (
              <div className="sidebar-mini">
                <strong>{selectedPersonality?.name || "No active persona"}</strong>
                <span>{selectedPersonality ? "Active in chat" : "Open to choose one"}</span>
              </div>
            )}
          </aside>

          <main className="panel main-panel">
            <div className="tabs">
              <button
                type="button"
                className={`tab ${activeView === "builder" ? "active" : ""}`}
                onClick={() => setActiveView("builder")}
              >
                Character Request
              </button>
              <button
                type="button"
                className={`tab ${activeView === "chat" ? "active" : ""}`}
                onClick={() => setActiveView("chat")}
              >
                Character Chat
              </button>
              <button
                type="button"
                className={`tab ${activeView === "voice" ? "active" : ""}`}
                onClick={() => setActiveView("voice")}
              >
                Voice Lab
              </button>
              <button
                type="button"
                className={`tab ${activeView === "journal" ? "active" : ""}`}
                onClick={() => setActiveView("journal")}
              >
                Memory Journal
              </button>
              <button
                type="button"
                className={`tab ${activeView === "persona-editor" ? "active" : ""}`}
                onClick={() => setActiveView("persona-editor")}
              >
                Persona Editor
              </button>
              <button
                type="button"
                className={`tab ${activeView === "eval" ? "active" : ""}`}
                onClick={() => setActiveView("eval")}
              >
                Adversarial Eval
              </button>
              <button
                type="button"
                className={`tab ${activeView === "settings" ? "active" : ""}`}
                onClick={() => setActiveView("settings")}
              >
                LLM Settings
              </button>
            </div>

            <div className="main-content">
              {activeView === "builder" ? (
                <>
                  <h2 className="section-heading">
                    {builderMode === "edit" ? "Refine an existing personality" : "Shape a new personality"}
                  </h2>
                  <p className="section-copy">
                    {builderMode === "edit"
                      ? "Load the selected character into the form, refine behavior and expression, then save updates in place. Use Voice Lab for dedicated TTS tuning."
                      : "Start with a character name and optional source URLs, pull research into the form, then save a profile with a stronger system prompt. Voice tuning happens in Voice Lab after save."}
                  </p>
                  <div className="meta-row" style={{ marginBottom: 12 }}>
                    <button
                      type="button"
                      className={`tab ${builderMode === "create" ? "active" : ""}`}
                      onClick={() => setBuilderMode("create")}
                    >
                      Create New
                    </button>
                    <button
                      type="button"
                      className={`tab ${builderMode === "edit" ? "active" : ""}`}
                      onClick={() => setBuilderMode("edit")}
                      disabled={!selectedPersonality}
                    >
                      Edit Selected
                    </button>
                  </div>
                  <PersonalityForm
                    onCreated={handlePersonalityCreated}
                    onUpdated={handlePersonalityUpdated}
                    onError={setStatus}
                    onOpenVoiceLab={() => setActiveView("voice")}
                    personalities={personalities}
                    editingPersonality={builderMode === "edit" ? selectedPersonality : null}
                  />
                </>
              ) : activeView === "journal" ? (
                <MemoryJournal personality={selectedPersonality} />
              ) : activeView === "persona-editor" ? (
                <PersonaEditor
                  personality={selectedPersonality}
                  onUpdated={handlePersonalityUpdated}
                  onStatus={setStatus}
                  initialSection={initialPersonaSection}
                />
              ) : activeView === "voice" ? (
                <>
                  <h2 className="section-heading">Tune voice in Voice Lab</h2>
                  <p className="section-copy">
                    Keep quick playback controls in chat while using this tab for full TTS profile tuning,
                    sample generation, and voice profile saves.
                  </p>
                  <VoiceLab
                    personality={selectedPersonality}
                    messages={chatLogs[selectedId] || []}
                    onSaveVoiceProfile={handleVoiceProfileChange}
                    onStatus={setStatus}
                    onJumpToBuilder={() => setActiveView("builder")}
                  />
                </>
              ) : activeView === "eval" ? (
                <>
                  <h2 className="section-heading">Pressure-test the active character</h2>
                  <p className="section-copy">
                    Run adversarial scenarios against the active personality and inspect transcript,
                    heuristic scoring, prompt-budget telemetry, and judge commentary without mutating chat history.
                  </p>
                  <HarnessReport personality={selectedPersonality} onStatus={setStatus} />
                </>
              ) : activeView === "settings" ? (
                <>
                  <h2 className="section-heading">Configure Runtime LLM</h2>
                  <p className="section-copy">
                    Select your provider first, add key and optional custom base URL,
                    then fetch and choose the active model for all chat, memory, and eval calls.
                  </p>
                  <div className="panel" style={{ padding: 16, marginBottom: 16 }}>
                    <h3 style={{ marginTop: 0 }}>Visual Effects</h3>
                    <p className="section-copy" style={{ marginBottom: 12 }}>
                      Control cyberpunk background intensity. Phase color palettes still react to live chat state at any non-off level.
                    </p>
                    <label style={{ display: "grid", gap: 6, maxWidth: 340 }}>
                      <span className="profile-label">Background FX</span>
                      <select
                        className="profile-select"
                        value={backgroundFxIntensity}
                        onChange={(event) => setBackgroundFxIntensity(event.target.value)}
                      >
                        <option value="off">Off</option>
                        <option value="low">Low</option>
                        <option value="full">Full</option>
                      </select>
                    </label>
                    <p className="fx-option-note">
                      Off: static atmosphere only. Low: lighter motion + lower glow. Full: cinematic video + full shader energy.
                    </p>
                  </div>
                  <div className="panel" style={{ padding: 16, marginBottom: 16 }}>
                    <h3 style={{ marginTop: 0 }}>User Policy Profile</h3>
                    <p className="section-copy" style={{ marginBottom: 12 }}>
                      Configure default mode, Neural Core intensity, and teen supervision controls for the selected profile.
                    </p>

                    <div className="meta-row" style={{ marginBottom: 12 }}>
                      <span className="meta-pill">User: {selectedUser?.displayName || "None"}</span>
                      <span className="meta-pill">Age: {selectedUser?.ageBand || "adult"}</span>
                    </div>

                    <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                      <label style={{ display: "grid", gap: 6 }}>
                        <span className="profile-label">Default Mode</span>
                        <select
                          className="profile-select"
                          value={profileDraft.defaultMode}
                          onChange={(event) =>
                            setProfileDraft((current) => ({
                              ...current,
                              defaultMode: event.target.value,
                            }))
                          }
                        >
                          <option value="kids">kids</option>
                          <option value="normal">normal</option>
                          <option value="scientist">scientist</option>
                        </select>
                      </label>

                      <label style={{ display: "grid", gap: 6 }}>
                        <span className="profile-label">Safety Tier</span>
                        <select
                          className="profile-select"
                          value={profileDraft.safetyTier}
                          onChange={(event) =>
                            setProfileDraft((current) => ({
                              ...current,
                              safetyTier: event.target.value,
                            }))
                          }
                        >
                          <option value="child_strict">child_strict</option>
                          <option value="teen_guarded">teen_guarded</option>
                          <option value="standard">standard</option>
                        </select>
                      </label>
                    </div>

                    <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
                      <label style={{ display: "grid", gap: 6 }}>
                        <span className="profile-label">Neural Core Performance Tier</span>
                        <input
                          type="range"
                          min="0"
                          max="2"
                          step="1"
                          value={
                            profileDraft.performanceTier === "light"
                              ? 0
                              : profileDraft.performanceTier === "full"
                              ? 2
                              : 1
                          }
                          onChange={(event) => {
                            const nextValue = Number(event.target.value);
                            setProfileDraft((current) => ({
                              ...current,
                              performanceTier: nextValue === 0 ? "light" : nextValue === 2 ? "full" : "balanced",
                            }));
                          }}
                        />
                      </label>
                      <div className="meta-row" style={{ marginTop: -2 }}>
                        <span className="meta-pill">Light: CSS-only pulse</span>
                        <span className="meta-pill">Balanced: orbit + ambience</span>
                        <span className="meta-pill">Full: prep for richer Scientist motion</span>
                      </div>
                    </div>

                    <label style={{ display: "inline-flex", gap: 8, marginTop: 12, color: "var(--muted)" }}>
                      <input
                        type="checkbox"
                        checked={profileDraft.voiceNarrationEnabled}
                        onChange={(event) =>
                          setProfileDraft((current) => ({
                            ...current,
                            voiceNarrationEnabled: event.target.checked,
                          }))
                        }
                      />
                      Enable Kids Mode mood narration when the orb brightens positively
                    </label>

                    <label style={{ display: "inline-flex", gap: 8, marginTop: 12, color: "var(--muted)" }}>
                      <input
                        type="checkbox"
                        checked={profileDraft.supervisedAdvancedMode}
                        onChange={(event) =>
                          setProfileDraft((current) => ({
                            ...current,
                            supervisedAdvancedMode: event.target.checked,
                          }))
                        }
                        disabled={selectedUser?.ageBand !== "teen"}
                      />
                      Enable supervised advanced mode for teen profiles
                    </label>

                    <div style={{ marginTop: 12 }}>
                      <button
                        type="button"
                        className="tab active"
                        disabled={!selectedUserId || isSavingProfile}
                        onClick={() => void saveSelectedUserProfile()}
                      >
                        {isSavingProfile ? "Saving..." : "Save Profile Policy"}
                      </button>
                    </div>
                  </div>
                  <LlmSettingsPanel onStatus={setStatus} />
                </>
              ) : (
                <>
                  <h2 className="section-heading">Talk to the active character</h2>
                  <p className="section-copy">
                    Voxis injects the saved system prompt plus the last 10 persisted messages into
                    every LLM call so the personality stays coherent across sessions.
                  </p>

                  {selectedPersonality ? (
                    <div className="meta-row">
                      {(() => {
                        const traitCount = Array.isArray(selectedPersonality.traits)
                          ? selectedPersonality.traits.length
                          : 0;
                        const sourceCount = Array.isArray(selectedPersonality.researchSources)
                          ? selectedPersonality.researchSources.length
                          : Array.isArray(selectedPersonality.sourceUrls)
                          ? selectedPersonality.sourceUrls.length
                          : 0;

                        return (
                          <>
                      <span className="meta-pill">Active: {selectedPersonality.name}</span>
                      {selectedUser ? (
                        <span className="meta-pill">Age band: {selectedUser.ageBand}</span>
                      ) : null}
                      <span className="meta-pill">Mode: {selectedMode}</span>
                      {chatPolicy?.modeAccepted === false ? (
                        <span className="meta-pill">Policy fallback: {chatPolicy.activeMode}</span>
                      ) : null}
                      <span className="meta-pill">
                        Mood: {selectedPersonality.moodLabel || selectedPersonality.mood}
                      </span>
                      {selectedPersonality.creativeContext && selectedPersonality.creativeContext !== "default" && (
                        <span className="meta-pill">{selectedPersonality.creativeContext.replace(/_/g, " ")}</span>
                      )}
                      <span className="meta-pill">
                        Traits: {traitCount}
                      </span>
                      <span className="meta-pill">
                        Sources: {sourceCount}
                      </span>
                          </>
                        );
                      })()}
                    </div>
                  ) : null}

                  <ChatWindow
                    personality={selectedPersonality}
                    messages={chatLogs[selectedId] || []}
                    liveDebug={liveChatState[selectedId]?.debug || null}
                    livePhase={liveChatState[selectedId]?.phase || ""}
                    liveSeq={liveChatState[selectedId]?.seq || 0}
                    liveReply={liveChatState[selectedId]?.reply || ""}
                    activeMode={chatPolicy?.activeMode || selectedMode}
                    neuralProfile={selectedUserProfile || chatPolicy}
                    isLoadingMessages={isLoadingMessages}
                    isSending={isSending}
                    onSend={handleSendMessage}
                    onSaveVoiceProfile={handleVoiceProfileChange}
                    onJumpToBuilder={() => setActiveView("builder")}
                    onOpenVoiceLab={() => setActiveView("voice")}
                    onStatus={setStatus}
                    onUpdateMemory={handlePersonaMemoryUpdate}
                    onOpenPersonaEditor={(target) => {
                      setPersonaEditorTarget(target);
                      setActiveView("persona-editor");
                    }}
                  />
                </>
              )}

              {status.message ? (
                <div className={`status ${status.type || "success"}`}>{status.message}</div>
              ) : null}
            </div>
          </main>
        </section>
      </div>
      </PersonaStateProvider>
    </>
  );
}
