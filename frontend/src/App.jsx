import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth, UserButton, SignIn, SignUp } from "@clerk/react";

import { useAuthFetch } from "./hooks/useAuthFetch.js";
import usePrefersReducedMotion from "./hooks/usePrefersReducedMotion.js";
import QuickPersonalityCreator from "./components/QuickPersonalityCreator.jsx";
import PersonalityForm from "./components/PersonalityForm.jsx";
import PersonalityList from "./components/PersonalityList.jsx";
import VoxisTab from "./components/VoxisTab.jsx";
import PersonaBrowser from "./components/PersonaBrowser.jsx";
import ChatWindow from "./components/ChatWindow.jsx";
import VoiceLab from "./components/VoiceLab.jsx";
import MemoryJournal from "./components/MemoryJournal.jsx";
import PersonaEditor from "./components/PersonaEditor.jsx";
import HarnessReport from "./components/HarnessReport.jsx";
import LlmSettingsPanel from "./components/LlmSettingsPanel.jsx";
import MoodRuntimeSettings from "./components/MoodRuntimeSettings.jsx";
import ExpressionSamplingSettings from "./components/ExpressionSamplingSettings.jsx";
import CognitionLoopSettings from "./components/CognitionLoopSettings.jsx";
import ProfaneFilterSettings from "./components/ProfaneFilterSettings.jsx";
import CompanionAliasSettings from "./components/CompanionAliasSettings.jsx";
import ApiDiagnosticsPanel from "./components/ApiDiagnosticsPanel.jsx";
import BrainTab from "./components/BrainTab.jsx";
import { PersonaStateProvider } from "./state/PersonaStateContext.jsx";
import { getApiErrorMessage, readApiResponsePayload } from "./lib/apiResponse.js";
import "./styles/futuristic-ui-kit.css";

const DEFAULT_DISABLE_NEURONMAP_3D = String(import.meta.env.VITE_DISABLE_NEURONMAP_3D ?? "true").trim().toLowerCase() !== "false";

function normalizeChatMessage(message) {
  const role = String(message?.role || "").trim().toLowerCase();
  const content = String(message?.content || "");
  const displayContent = String(message?.displayContent || message?.displayReply || content);
  const utterancePlan = message?.utterancePlan && typeof message.utterancePlan === "object"
    ? message.utterancePlan
    : {
        rawText: content,
        displayText: displayContent,
        speechText: displayContent,
        isPerformanceOutput: Boolean(message?.isPerformanceOutput),
      };

  return {
    ...message,
    role,
    content,
    displayContent,
    utterancePlan,
    isPerformanceOutput: Boolean(message?.isPerformanceOutput),
    debug: message?.debug || null,
    usage: message?.usage || null,
  };
}

const appStyles = `
  :root {
    color-scheme: dark;
    /* ── Point old tokens at futuristic-kit values ─── */
    --bg: var(--fx-space-black);
    --bg-strong: #0b1020;
    --panel: rgba(14, 22, 38, 0.80);
    --panel-strong: rgba(10, 16, 32, 0.96);
    --border: var(--fx-border);
    --text: var(--fx-text);
    --muted: var(--fx-muted);
    --accent: var(--fx-electric-cyan);
    --accent-deep: #0050e0;
    --accent-soft: rgba(0, 245, 255, 0.10);
    --accent-warm: #ff7a38;
    --accent-magenta: var(--fx-neon-magenta);
    --shadow: 0 24px 64px rgba(0, 40, 120, 0.40);
    --glass-bg: linear-gradient(180deg, rgba(0, 245, 255, 0.10), rgba(18, 42, 76, 0.22));
    --glass-border: rgba(0, 245, 255, 0.30);
    --glass-specular: rgba(255, 255, 255, 0.22);
    --glass-shadow: 0 10px 28px rgba(0, 18, 42, 0.4);
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
    grid-template-columns: 380px minmax(0, 1fr);
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

  .status-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }

  .status-action {
    border: 1px solid rgba(0, 180, 255, 0.28);
    border-radius: 999px;
    background: rgba(0, 180, 255, 0.08);
    color: #b9efff;
    padding: 6px 12px;
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .status.error .status-action {
    border-color: rgba(255, 122, 122, 0.42);
    background: rgba(255, 98, 98, 0.16);
    color: #ffd3d3;
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
    opacity: 0.34;
    filter: blur(4px) saturate(1.1) contrast(1.06);
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
    background: var(--glass-bg), rgba(2, 10, 24, 0.96);
    border-color: var(--glass-border);
    box-shadow:
      inset 0 1px 0 var(--glass-specular),
      inset 0 -12px 22px rgba(0, 0, 0, 0.24),
      var(--glass-shadow);
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
    grid-template-columns: 380px minmax(0, 1fr);
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
    border: 1px solid var(--glass-border);
    border-radius: 12px;
    background: var(--glass-bg), linear-gradient(135deg, rgba(0, 234, 255, 0.1), rgba(34, 94, 255, 0.16));
    color: #9cecff;
    font-weight: 800;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 10px 10px;
    box-shadow:
      inset 0 1px 0 var(--glass-specular),
      inset 0 -10px 18px rgba(0, 0, 0, 0.22),
      var(--glass-shadow);
    transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
  }

  .sidebar-toggle:hover {
    transform: translateY(-2px);
    border-color: rgba(165, 241, 255, 0.52);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.34),
      inset 0 -10px 18px rgba(0, 0, 0, 0.2),
      0 14px 28px rgba(0, 160, 255, 0.22);
  }

  .sidebar-toggle:active {
    transform: translateY(1px) scale(0.995);
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
    background: var(--glass-bg), rgba(0, 234, 255, 0.04);
    border-color: var(--glass-border);
    color: #8ca6c8;
    box-shadow:
      inset 0 1px 0 var(--glass-specular),
      inset 0 -8px 16px rgba(0, 0, 0, 0.2),
      0 8px 18px rgba(0, 14, 34, 0.32);
    transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease, color 160ms ease;
  }

  .tab:hover {
    transform: translateY(-2px);
    color: #d8f4ff;
    border-color: rgba(176, 244, 255, 0.48);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.36),
      inset 0 -8px 16px rgba(0, 0, 0, 0.16),
      0 14px 26px rgba(0, 168, 255, 0.18);
  }

  .tab:active {
    transform: translateY(1px) scale(0.995);
  }

  .tab.active {
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.24), transparent 34%),
      linear-gradient(135deg, rgba(0, 234, 255, 0.96), rgba(168, 84, 255, 0.92));
    color: #04111c;
    border-color: rgba(206, 244, 255, 0.38);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.46),
      0 0 24px rgba(0, 234, 255, 0.16),
      0 14px 28px rgba(0, 168, 255, 0.22);
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

  /* Full-system holographic upgrade pass */
  .section-heading {
    font-family: "Space Grotesk", "Manrope", system-ui, sans-serif;
  }

  .main-panel {
    position: relative;
    overflow: hidden;
  }

  .main-panel::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0.14;
    background-image: linear-gradient(to bottom, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
    background-size: 100% 3px;
  }

  .main-content :is(input, select, textarea):not([type="range"]):not([type="checkbox"]) {
    border-radius: 12px;
    border: 1px solid rgba(0, 245, 255, 0.26);
    background: linear-gradient(180deg, rgba(7, 16, 30, 0.9), rgba(4, 10, 20, 0.95));
    color: var(--text);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.12),
      inset 0 -10px 20px rgba(0, 0, 0, 0.26);
    transition: border-color 200ms ease, box-shadow 220ms ease, transform 200ms ease;
  }

  .main-content :is(input, select, textarea):focus {
    outline: none;
    border-color: rgba(0, 245, 255, 0.62);
    box-shadow:
      0 0 0 3px rgba(0, 245, 255, 0.16),
      0 0 20px rgba(0, 245, 255, 0.18),
      inset 0 1px 0 rgba(255, 255, 255, 0.14);
  }

  .main-content select option,
  .main-content select optgroup {
    color: #dbe7ff;
    background: #0a1323;
  }

  .main-content button:not(.tab):not(.sidebar-toggle):not(.debug-toggle):not(.context-meter-info):not(.popup-close-btn) {
    border-radius: 12px;
    border: 1px solid rgba(0, 245, 255, 0.3);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.24), transparent 34%),
      linear-gradient(145deg, rgba(0, 224, 255, 0.9), rgba(110, 58, 255, 0.88));
    color: #031019;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.42),
      inset 0 -10px 18px rgba(0, 0, 0, 0.16),
      0 12px 26px rgba(0, 140, 255, 0.22);
    transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
  }

  .main-content button:not(.tab):not(.sidebar-toggle):not(.debug-toggle):not(.context-meter-info):not(.popup-close-btn):hover {
    transform: translateY(-2px);
    border-color: rgba(170, 245, 255, 0.68);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.48),
      0 16px 30px rgba(0, 140, 255, 0.28),
      0 0 20px rgba(0, 245, 255, 0.24);
  }

  .main-content button:not(.tab):not(.sidebar-toggle):not(.debug-toggle):not(.context-meter-info):not(.popup-close-btn):active {
    transform: translateY(1px) scale(0.992);
  }

  .app-shell .chat-shell,
  .app-shell .vlab-shell,
  .app-shell .journal-shell,
  .app-shell .llm-settings {
    position: relative;
    border-radius: 18px;
  }

  .app-shell .chat-shell::before,
  .app-shell .vlab-shell::before,
  .app-shell .journal-shell::before,
  .app-shell .llm-settings::before {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    border-radius: inherit;
    border: 1px solid rgba(0, 245, 255, 0.08);
    box-shadow: inset 0 0 30px rgba(0, 245, 255, 0.05);
  }

  .app-shell .voice-btn.sec,
  .app-shell .vlab-btn.sec,
  .app-shell .btn-icon,
  .app-shell .secondary-button,
  .app-shell .preset-btn,
  .app-shell .preset-clear,
  .app-shell .filter-pill {
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.16), transparent 34%),
      linear-gradient(145deg, rgba(8, 24, 44, 0.96), rgba(6, 14, 30, 0.94));
    color: #9ceeff;
    border-color: rgba(0, 245, 255, 0.24);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.26),
      inset 0 -10px 16px rgba(0, 0, 0, 0.24),
      0 10px 20px rgba(0, 18, 42, 0.34);
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
  const BACKGROUND_VIDEO_SRC = "/cyberpunk-bg.mp4?v=20260407";

  const storedSidebarOpen =
    typeof window !== "undefined" && window.localStorage
      ? window.localStorage.getItem("voxis:sidebar-open")
      : null;
  const storedBackgroundFx =
    typeof window !== "undefined" && window.localStorage
      ? window.localStorage.getItem("voxis:background-fx")
      : null;
  const storedNeuronMap3d =
    typeof window !== "undefined" && window.localStorage
      ? window.localStorage.getItem("voxis:disable-neuronmap-3d")
      : null;

  const LAST_PERSONA_STORAGE_KEY = "voxis:last-persona-id";
  const storedLastPersonaId =
    typeof window !== "undefined" && window.localStorage
      ? window.localStorage.getItem(LAST_PERSONA_STORAGE_KEY)
      : null;

  const [personalities, setPersonalities] = useState([]);
  const [legacyPersonaCount, setLegacyPersonaCount] = useState(0);
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
  const [selectedId, setSelectedId] = useState(
    storedLastPersonaId != null ? Number(storedLastPersonaId) : null,
  );
  const [activeView, setActiveView] = useState("chat");
  const [personaEditorTarget, setPersonaEditorTarget] = useState(null);
  const [builderMode, setBuilderMode] = useState("create");
  const [chatLogs, setChatLogs] = useState({});
  const [personaMemoryById, setPersonaMemoryById] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isClaimingLegacyPersonas, setIsClaimingLegacyPersonas] = useState(false);
  const [isImportingPersonas, setIsImportingPersonas] = useState(false);
  const [personaImportMode, setPersonaImportMode] = useState("append");
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [liveChatState, setLiveChatState] = useState({});
  const [status, setStatus] = useState({ type: "", message: "" });
  const [diagnosticsRunToken, setDiagnosticsRunToken] = useState(0);
  const [neuralToast, setNeuralToast] = useState(null);
  const [backgroundVideoReady, setBackgroundVideoReady] = useState(false);
  const [backgroundVideoPlaying, setBackgroundVideoPlaying] = useState(false);
  const [backgroundVideoError, setBackgroundVideoError] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(storedSidebarOpen != null ? storedSidebarOpen === "1" : false);
  const [backgroundFxIntensity, setBackgroundFxIntensity] = useState(
    storedBackgroundFx === "off" || storedBackgroundFx === "low" || storedBackgroundFx === "full"
      ? storedBackgroundFx
      : "full",
  );
  const [disableNeuronMap3d, setDisableNeuronMap3d] = useState(
    storedNeuronMap3d === "1"
      ? true
      : storedNeuronMap3d === "0"
        ? false
        : DEFAULT_DISABLE_NEURONMAP_3D,
  );
  const backgroundCanvasRef = useRef(null);
  const backgroundVideoRef = useRef(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  function handleStatusAction(actionId) {
    const normalized = String(actionId || "").trim().toLowerCase();
    if (!normalized) {
      return;
    }

    if (normalized === "run-connectivity-diagnostics") {
      setActiveView("settings");
      setDiagnosticsRunToken((current) => current + 1);
      setStatus({
        type: "info",
        message: "Running diagnostics in Settings...",
      });
    }
  }

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
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }
    window.localStorage.setItem("voxis:disable-neuronmap-3d", disableNeuronMap3d ? "1" : "0");
  }, [disableNeuronMap3d]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }
    if (selectedId != null) {
      window.localStorage.setItem(LAST_PERSONA_STORAGE_KEY, String(selectedId));
    } else {
      window.localStorage.removeItem(LAST_PERSONA_STORAGE_KEY);
    }
  }, [selectedId]);

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
    
    // Parse personality.moodState if it's a JSON string
    let parsedMood = rawMood;
    if (typeof rawMood === 'string') {
      try {
        parsedMood = JSON.parse(rawMood);
      } catch (e) {
        parsedMood = {};
      }
    }
    
    return {
      valence: clamp(Number(parsedMood.valence || 0), -1, 1),
      arousal: clamp(Number(parsedMood.arousal || 0.35), 0, 1),
      dominance: clamp(Number(parsedMood.dominance || 0), -1, 1),
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

  useEffect(() => {
    const video = backgroundVideoRef.current;
    if (!video || backgroundFxIntensity === "off" || backgroundVideoError) {
      return;
    }

    const playVideo = () => {
      const result = video.play();
      if (result && typeof result.catch === "function") {
        result.catch(() => {
          setBackgroundVideoPlaying(false);
        });
      }
    };

    playVideo();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        playVideo();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [backgroundFxIntensity, backgroundVideoError, backgroundVideoReady]);

  const videoOpacity = backgroundVideoReady
    ? backgroundFxIntensity === "low"
      ? 0.42
      : 0.58
    : 0;

  const shaderOpacity = backgroundFxIntensity === "off"
    ? 0
    : backgroundVideoReady && backgroundVideoPlaying
    ? backgroundFxIntensity === "low"
      ? 0.24
      : 0.34
    : backgroundFxIntensity === "low"
    ? 0.46
    : 0.72;

  const backgroundLayer = (
    <div className="background-stack" aria-hidden="true">
      {backgroundFxIntensity !== "off" && !backgroundVideoError ? (
        <video
          ref={backgroundVideoRef}
          className="cyberpunk-bg-video"
          src={BACKGROUND_VIDEO_SRC}
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          tabIndex={-1}
          onLoadedData={() => {
            setBackgroundVideoReady(true);
            setBackgroundVideoError(false);
          }}
          onPlay={() => setBackgroundVideoPlaying(true)}
          onPause={() => setBackgroundVideoPlaying(false)}
          onError={() => {
            setBackgroundVideoReady(false);
            setBackgroundVideoPlaying(false);
            setBackgroundVideoError(true);
          }}
          style={{ opacity: videoOpacity }}
        />
      ) : null}
      <canvas
        ref={backgroundCanvasRef}
        className="cyberpunk-bg-shader"
        style={{ opacity: shaderOpacity }}
      />
    </div>
  );

  async function loadCurrentUser() {
    try {
      const response = await authFetch("/me");
      const data = await readApiResponsePayload(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data, "Failed to load current user."));
      }

      const me = data?.user || data;
      if (!me || !Number.isInteger(Number(me.id))) {
        throw new Error("Failed to resolve current user id.");
      }

      setUsers([me]);
      setSelectedUserId(Number(me.id));

      const profileResponse = await authFetch(`/users/${Number(me.id)}/profile`);
      const profileData = await readApiResponsePayload(profileResponse);
      if (!profileResponse.ok) {
        throw new Error(getApiErrorMessage(profileResponse, profileData, "Failed to load user profile."));
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
      setLegacyPersonaCount(Math.max(0, Number(data?.legacyPersonaCount) || 0));

      // Persist last selected persona across sessions.
      // Prefer a previously saved ID if it's still valid; otherwise fall back to first.
      if (personalityList.length > 0) {
        const currentIsStillValid =
          selectedId != null && personalityList.some((p) => p.id === selectedId);
        if (!currentIsStillValid) {
          setSelectedId(personalityList[0].id);
        }
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

  async function handleClaimLegacyPersonalities() {
    if (isClaimingLegacyPersonas) {
      return;
    }

    setIsClaimingLegacyPersonas(true);

    try {
      const response = await authFetch("/personalities/claim-legacy", {
        method: "POST",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to claim legacy personas.");
      }

      const claimedPersonalities = Array.isArray(data?.personalities) ? data.personalities : [];
      const claimedCount = Math.max(0, Number(data?.claimedCount) || 0);

      setPersonalities(claimedPersonalities);
      setLegacyPersonaCount(Math.max(0, Number(data?.legacyPersonaCount) || 0));

      if (claimedPersonalities.length) {
        setSelectedId((current) => current || claimedPersonalities[0].id);
      }

      setStatus({
        type: "success",
        message:
          claimedCount > 0
            ? `Claimed ${claimedCount} legacy persona${claimedCount === 1 ? "" : "s"} into your account.`
            : "No legacy personas were waiting to be claimed.",
      });
    } catch (error) {
      setStatus({
        type: "error",
        message: error.message || "Failed to claim legacy personas.",
      });
    } finally {
      setIsClaimingLegacyPersonas(false);
    }
  }

  function buildPersonaExportPayload() {
    const list = Array.isArray(personalities) ? personalities : [];
    const personaTemplates = list.map((personality) => ({
      name: String(personality?.name || "").trim(),
      description: String(personality?.description || "").trim(),
      mood: String(personality?.mood || "calm").trim() || "calm",
      traits: Array.isArray(personality?.traits) ? personality.traits : [],
      quirks: Array.isArray(personality?.quirks) ? personality.quirks : [],
      sourceQuery: String(personality?.sourceQuery || personality?.name || "").trim(),
      sourceUrls: Array.isArray(personality?.sourceUrls) ? personality.sourceUrls : [],
      researchSummary: String(personality?.researchSummary || "").trim(),
      speechStyle: String(personality?.speechStyle || "").trim(),
      notablePhrases: Array.isArray(personality?.notablePhrases) ? personality.notablePhrases : [],
      researchSources: Array.isArray(personality?.researchSources) ? personality.researchSources : [],
      behaviorRules: Array.isArray(personality?.behaviorRules) ? personality.behaviorRules : [],
      goals: Array.isArray(personality?.goals) ? personality.goals : [],
      values: Array.isArray(personality?.values) ? personality.values : [],
      voiceProfile: personality?.voiceProfile && typeof personality.voiceProfile === "object" ? personality.voiceProfile : {},
      expressionProfile: personality?.expressionProfile && typeof personality.expressionProfile === "object" ? personality.expressionProfile : {},
      bigFiveProfile: personality?.bigFiveProfile && typeof personality.bigFiveProfile === "object" ? personality.bigFiveProfile : {},
      alignmentProfile: personality?.alignmentProfile && typeof personality.alignmentProfile === "object" ? personality.alignmentProfile : {},
      responseFocusProfile:
        personality?.responseFocusProfile && typeof personality.responseFocusProfile === "object"
          ? personality.responseFocusProfile
          : {},
      expressionStyle: personality?.expressionStyle && typeof personality.expressionStyle === "object" ? personality.expressionStyle : {},
      vocalMannerisms:
        personality?.vocalMannerisms && typeof personality.vocalMannerisms === "object"
          ? personality.vocalMannerisms
          : {},
      stateFlaws:
        personality?.stateFlaws && typeof personality.stateFlaws === "object"
          ? personality.stateFlaws
          : {},
      creativeContext: String(personality?.creativeContext || "default").trim() || "default",
      moodSensitivity: Number(personality?.moodSensitivity) || 1,
      gender: String(personality?.gender || "").trim(),
      avatarImageUrl: String(personality?.avatarImageUrl || "").trim(),
    })).filter((entry) => entry.name && entry.description);

    return {
      format: "voxis-persona-library",
      version: 1,
      exportedAt: new Date().toISOString(),
      count: personaTemplates.length,
      personalities: personaTemplates,
    };
  }

  function handleExportPersonas() {
    try {
      const payload = buildPersonaExportPayload();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `voxis-personas-${Date.now()}.json`;
      link.click();
      window.URL.revokeObjectURL(url);

      setStatus({ type: "success", message: `Exported ${payload.count} persona${payload.count === 1 ? "" : "s"}.` });
    } catch (error) {
      setStatus({ type: "error", message: error.message || "Failed to export personas." });
    }
  }

  async function handleImportPersonas(event, mode = "append") {
    const file = event?.target?.files?.[0];
    if (!file || isImportingPersonas) {
      return;
    }

    setIsImportingPersonas(true);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const personaTemplates = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.personalities)
          ? parsed.personalities
          : [];

      if (!personaTemplates.length) {
        throw new Error("No personas found in the selected file.");
      }

      const created = [];
      const failed = [];
      let skipped = 0;

      const normalizedMode = ["append", "skip", "replace"].includes(String(mode || "").trim().toLowerCase())
        ? String(mode).trim().toLowerCase()
        : "append";

      const existingByName = new Map();
      for (const persona of Array.isArray(personalities) ? personalities : []) {
        const key = String(persona?.name || "").trim().toLowerCase();
        if (!key) {
          continue;
        }
        if (!existingByName.has(key)) {
          existingByName.set(key, []);
        }
        existingByName.get(key).push(persona);
      }

      for (const template of personaTemplates) {
        const payload = {
          name: String(template?.name || "").trim(),
          description: String(template?.description || "").trim(),
          mood: String(template?.mood || "calm").trim() || "calm",
          traits: Array.isArray(template?.traits) ? template.traits : [],
          quirks: Array.isArray(template?.quirks) ? template.quirks : [],
          sourceQuery: String(template?.sourceQuery || template?.name || "").trim(),
          sourceUrls: Array.isArray(template?.sourceUrls) ? template.sourceUrls : [],
          researchSummary: String(template?.researchSummary || "").trim(),
          speechStyle: String(template?.speechStyle || "").trim(),
          notablePhrases: Array.isArray(template?.notablePhrases) ? template.notablePhrases : [],
          researchSources: Array.isArray(template?.researchSources) ? template.researchSources : [],
          behaviorRules: Array.isArray(template?.behaviorRules) ? template.behaviorRules : [],
          goals: Array.isArray(template?.goals) ? template.goals : [],
          values: Array.isArray(template?.values) ? template.values : [],
          voiceProfile: template?.voiceProfile && typeof template.voiceProfile === "object" ? template.voiceProfile : {},
          expressionProfile:
            template?.expressionProfile && typeof template.expressionProfile === "object"
              ? template.expressionProfile
              : {},
          bigFiveProfile: template?.bigFiveProfile && typeof template.bigFiveProfile === "object" ? template.bigFiveProfile : {},
          alignmentProfile:
            template?.alignmentProfile && typeof template.alignmentProfile === "object"
              ? template.alignmentProfile
              : {},
          responseFocusProfile:
            template?.responseFocusProfile && typeof template.responseFocusProfile === "object"
              ? template.responseFocusProfile
              : {},
          expressionStyle: template?.expressionStyle && typeof template.expressionStyle === "object" ? template.expressionStyle : {},
          vocalMannerisms:
            template?.vocalMannerisms && typeof template.vocalMannerisms === "object"
              ? template.vocalMannerisms
              : {},
          stateFlaws:
            template?.stateFlaws && typeof template.stateFlaws === "object"
              ? template.stateFlaws
              : {},
          creativeContext: String(template?.creativeContext || "default").trim() || "default",
          moodSensitivity: Number(template?.moodSensitivity) || 1,
          gender: String(template?.gender || "").trim(),
          avatarImageUrl: String(template?.avatarImageUrl || "").trim(),
        };

        if (!payload.name || !payload.description) {
          failed.push(payload.name || "Unnamed persona");
          continue;
        }

        const nameKey = payload.name.toLowerCase();
        const matchingExisting = existingByName.get(nameKey) || [];

        if (normalizedMode === "skip" && matchingExisting.length > 0) {
          skipped += 1;
          continue;
        }

        if (normalizedMode === "replace" && matchingExisting.length > 0) {
          let replaceFailed = false;
          for (const existingPersona of matchingExisting) {
            const deleteResponse = await authFetch(`/personality/${existingPersona.id}`, {
              method: "DELETE",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ confirmName: existingPersona.name }),
            });
            const deletePayload = await readApiResponsePayload(deleteResponse);
            if (!deleteResponse.ok) {
              replaceFailed = true;
              failed.push(payload.name);
              setStatus({
                type: "warn",
                message: `Could not replace ${payload.name}: ${getApiErrorMessage(deleteResponse, deletePayload, "delete failed")}`,
              });
              break;
            }
          }

          if (replaceFailed) {
            continue;
          }
        }

        const response = await authFetch("/personality", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const data = await readApiResponsePayload(response);
        if (!response.ok) {
          failed.push(payload.name);
          continue;
        }

        created.push(data);
        if (!existingByName.has(nameKey)) {
          existingByName.set(nameKey, []);
        }
        existingByName.set(nameKey, [data]);
      }

      if (created.length) {
        await loadPersonalities();
        setSelectedId((current) => current || created[0]?.id || null);
      }

      if (created.length && !failed.length) {
        setStatus({
          type: skipped ? "info" : "success",
          message: `Imported ${created.length} persona${created.length === 1 ? "" : "s"}.${skipped ? ` Skipped ${skipped} duplicate${skipped === 1 ? "" : "s"}.` : ""}`,
        });
      } else if (created.length && failed.length) {
        setStatus({
          type: "warn",
          message: `Imported ${created.length} persona${created.length === 1 ? "" : "s"}, ${failed.length} failed${skipped ? `, ${skipped} skipped` : ""}.`,
        });
      } else {
        setStatus({ type: "error", message: "No personas were imported. Check file format, merge mode, and required fields." });
      }
    } catch (error) {
      setStatus({ type: "error", message: error.message || "Failed to import personas." });
    } finally {
      setIsImportingPersonas(false);
      if (event?.target) {
        event.target.value = "";
      }
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
        [personalityId]: Array.isArray(data) ? data.map(normalizeChatMessage) : [],
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

  async function fetchPersonalityById(personalityId) {
    const response = await authFetch(`/personality/${personalityId}`);
    const data = await readApiResponsePayload(response);
    if (!response.ok) {
      throw new Error(getApiErrorMessage(response, data, "Failed to load created personality."));
    }
    return data;
  }

  async function triggerPersonaOpener(personality) {
    if (!personality?.id) {
      return;
    }

    try {
      const response = await authFetch(`/personality/${personality.id}/opener`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: selectedUserId,
          mode: selectedMode,
        }),
      });
      const data = await readApiResponsePayload(response);

      if (response.status === 409) {
        return;
      }

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data, "Failed to generate opener."));
      }

      const opener = String(data?.reply || "").trim();
      if (!opener) {
        return;
      }

      setChatLogs((current) => {
        const existing = current[personality.id] || [];
        if (existing.some((entry) => entry.role === "assistant")) {
          return current;
        }

        return {
          ...current,
          [personality.id]: [
            ...existing,
            normalizeChatMessage({ role: "assistant", content: opener }),
          ],
        };
      });
    } catch {
      // Opener generation is best-effort; chat remains usable if this fails.
    }
  }

  async function handlePersonalityCreated(personality) {
    try {
      let resolved = personality;
      if (!resolved?.id) {
        throw new Error("Created personality payload is missing id.");
      }
      if (!resolved?.name || !resolved?.description) {
        resolved = await fetchPersonalityById(resolved.id);
      }

      setPersonalities((current) => {
        const list = Array.isArray(current) ? current : [];
        const withoutDuplicate = list.filter((item) => item.id !== resolved.id);
        return [resolved, ...withoutDuplicate];
      });
      setSelectedId(resolved.id);
      setChatLogs((current) => ({
        ...current,
        [resolved.id]: current[resolved.id] || [],
      }));
      setActiveView("chat");
      setStatus({
        type: "success",
        message: `${resolved.name} is ready. Initiating first contact now.`,
      });

      void triggerPersonaOpener(resolved);
    } catch (error) {
      setStatus({
        type: "error",
        message: error.message || "Persona created, but handoff to chat failed.",
      });
    }
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

  async function handleResetPersonality(personality, confirmName) {
    if (!personality?.id) {
      return;
    }

    try {
      const response = await authFetch(`/personality/${personality.id}/reset`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirmName }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to reset personality memory.");
      }

      const updatedPersonality = data.personality || personality;

      setPersonalities((current) => {
        const list = Array.isArray(current) ? current : [];
        return list.map((item) => (item.id === updatedPersonality.id ? updatedPersonality : item));
      });
      setChatLogs((current) => ({
        ...current,
        [personality.id]: [],
      }));
      setPersonaMemoryById((current) => ({
        ...current,
        [personality.id]: [],
      }));
      setLiveChatState((current) => ({
        ...current,
        [personality.id]: null,
      }));
      setStatus({
        type: "success",
        message: `${updatedPersonality.name} was reset. Learned memory and chat history were cleared.`,
      });
    } catch (error) {
      setStatus({
        type: "error",
        message: error.message || "Failed to reset personality memory.",
      });
      throw error;
    }
  }

  async function handleDeletePersonality(personality, confirmName) {
    if (!personality?.id) {
      return;
    }

    try {
      const response = await authFetch(`/personality/${personality.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirmName }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete personality.");
      }

      let nextSelectedId = selectedId;
      setPersonalities((current) => {
        const list = Array.isArray(current) ? current : [];
        const remaining = list.filter((item) => item.id !== personality.id);
        if (selectedId === personality.id) {
          nextSelectedId = remaining[0]?.id || null;
        }
        return remaining;
      });
      setChatLogs((current) => {
        const next = { ...current };
        delete next[personality.id];
        return next;
      });
      setPersonaMemoryById((current) => {
        const next = { ...current };
        delete next[personality.id];
        return next;
      });
      setLiveChatState((current) => {
        const next = { ...current };
        delete next[personality.id];
        return next;
      });

      if (selectedId === personality.id) {
        setSelectedId(nextSelectedId);
      }

      setStatus({
        type: "success",
        message: `${data.deletedName || personality.name} was deleted.`,
      });
    } catch (error) {
      setStatus({
        type: "error",
        message: error.message || "Failed to delete personality.",
      });
      throw error;
    }
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
    console.log("[VOXIS DEBUG] Personality selected - selectedId:", id);
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
    console.log("[VOXIS DEBUG] Sending message - personalityId:", personalityId, "personality.name:", selectedPersonality.name);

    setStatus({ type: "", message: "" });
    setIsSending(true);
    setLiveChatState((current) => ({
      ...current,
      [personalityId]: {
        phase: "queued",
        debug: null,
        reply: "",
        usage: null,
        finalReceived: false,
        seq: (current[personalityId]?.seq || 0) + 1,
      },
    }));
    setChatLogs((current) => ({
      ...current,
      [personalityId]: [
        ...(current[personalityId] || []),
        normalizeChatMessage({ role: "user", content: message }),
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
          streamBrain: activeView === "brain",
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

            if (type === "brain") {
              setLiveChatState((current) => ({
                ...current,
                [personalityId]: {
                  ...(current[personalityId] || {}),
                  brainEvents: [...(current[personalityId]?.brainEvents || []), payload],
                  seq: (current[personalityId]?.seq || 0) + 1,
                },
              }));
            } else if (type === "debug") {
              const toast = buildNeuralMemoryToast({
                phase: payload.phase,
                debug: payload.debug,
                personalityName: selectedPersonality?.name || "",
              });
              if (toast) {
                setNeuralToast(toast);
              }

              setLiveChatState((current) => {
                const prev = current[personalityId] || {};
                let stateDriftHistory = prev.stateDriftHistory || [];
                if (payload.phase === "state-flaw" && payload.debug?.stateRuntime?.snapshot) {
                  const snap = payload.debug.stateRuntime.snapshot;
                  const directives = payload.debug.stateRuntime.directives || {};
                  const newEntry = {
                    turn: stateDriftHistory.length + 1,
                    intoxication: Number(snap.intoxication || 0),
                    fatigue: Number(snap.fatigue || 0),
                    agitation: Number(snap.agitation || 0),
                    focus: Number(snap.focus || 0),
                    stabilityIndex: Number(payload.debug.stateRuntime.stabilityIndex || 0),
                    coherencePenalty: Number(directives.coherencePenalty || 0),
                    fragmentation: Number(directives.fragmentation || 0),
                    interruptions: Number(directives.interruptions || 0),
                    tangentChance: Number(directives.tangentChance || 0),
                    fillerRate: Number(directives.fillerRate || 0),
                  };
                  stateDriftHistory = [...stateDriftHistory.slice(-49), newEntry];
                }
                return {
                  ...current,
                  [personalityId]: {
                    ...prev,
                    phase: payload.phase,
                    debug: payload.debug,
                    stateDriftHistory,
                    seq: (prev.seq || 0) + 1,
                  },
                };
              });
            } else if (type === "token") {
              setLiveChatState((current) => ({
                ...current,
                [personalityId]: {
                  ...(current[personalityId] || {}),
                  phase: payload.phase || "generation",
                  debug: payload.debug || current[personalityId]?.debug || null,
                  reply: payload.reply || "",
                  usage: payload.usage || current[personalityId]?.usage || null,
                  seq: (current[personalityId]?.seq || 0) + 1,
                },
              }));
            } else if (type === "usage") {
              setLiveChatState((current) => ({
                ...current,
                [personalityId]: {
                  ...(current[personalityId] || {}),
                  usage: payload.usage || null,
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
                    {
                      ...normalizeChatMessage({
                        role: "assistant",
                        content: payload.reply,
                        displayContent: payload.displayReply,
                        utterancePlan: payload.utterancePlan,
                        isPerformanceOutput: payload.isPerformanceOutput,
                        debug: payload.debug || null,
                        usage: payload.usage || null,
                      }),
                    },
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
                    usage: payload.usage || current[personalityId]?.usage || null,
                    voiceAdjustments: payload.voiceAdjustments || null,
                    singingActive: payload.singingActive || false,
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
          data = await readApiResponsePayload(response);
      }

      if (!response.ok) {
          throw new Error(getApiErrorMessage(response, data, "Failed to send chat message."));
      }

      if (!data) {
        throw new Error("Chat stream ended before a final payload was received.");
      }

      if (!contentType.includes("text/event-stream")) {
        setChatLogs((current) => ({
          ...current,
          [personalityId]: [
            ...(current[personalityId] || []),
            {
              ...normalizeChatMessage({
                role: "assistant",
                content: data.reply,
                displayContent: data.displayReply,
                utterancePlan: data.utterancePlan,
                isPerformanceOutput: data.isPerformanceOutput,
                debug: data.debug || null,
                usage: data.usage || null,
              }),
            },
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
      <div className="voxis-futuristic-root app-shell">
        <section className="hero glass-panel holographic-border">
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
          <aside className={`panel sidebar glass-panel holographic-border ${isSidebarOpen ? "" : "collapsed"}`}>
            <button
              type="button"
              className="sidebar-toggle futuristic-btn"
              onClick={() => setIsSidebarOpen((current) => !current)}
            >
              {isSidebarOpen ? "Hide Personas" : `Saved Personas${personalities.length ? ` (${personalities.length})` : ""}`}
            </button>

            {isSidebarOpen ? (
              <PersonalityList
                personalities={personalities}
                activeId={selectedId}
                isLoading={isLoading}
                legacyPersonaCount={legacyPersonaCount}
                isClaimingLegacyPersonas={isClaimingLegacyPersonas}
                isImportingPersonas={isImportingPersonas}
                importMode={personaImportMode}
                onChangeImportMode={setPersonaImportMode}
                onRefresh={loadPersonalities}
                onClaimLegacyPersonas={handleClaimLegacyPersonalities}
                onExportPersonas={handleExportPersonas}
                onImportPersonas={(event) => handleImportPersonas(event, personaImportMode)}
                onSelect={handleSelectPersonality}
                onOpenChat={() => setActiveView("chat")}
                onResetPersona={handleResetPersonality}
                onDeletePersona={handleDeletePersonality}
              />
            ) : (
              <div className="sidebar-mini">
                <strong>{selectedPersonality?.name || "No active persona"}</strong>
                <span>{selectedPersonality ? "Active in chat" : "Open to choose one"}</span>
              </div>
            )}
          </aside>

          <main className="panel main-panel glass-panel holographic-border">
            <div className="tabs">
              <button
                type="button"
                className={`tab futuristic-btn ${activeView === "voxis" ? "active" : ""}`}
                onClick={() => setActiveView("voxis")}
              >
                Voxis AI Guide
              </button>
              <button
                type="button"
                className={`tab futuristic-btn ${activeView === "builder" ? "active" : ""}`}
                onClick={() => setActiveView("builder")}
              >
                Character Request
              </button>
              <button
                type="button"
                className={`tab futuristic-btn ${activeView === "chat" ? "active" : ""}`}
                onClick={() => setActiveView("chat")}
              >
                Character Chat
              </button>
              <button
                type="button"
                className={`tab futuristic-btn ${activeView === "journal" ? "active" : ""}`}
                onClick={() => setActiveView("journal")}
              >
                Memory Journal
              </button>
              <button
                type="button"
                className={`tab futuristic-btn ${activeView === "persona-editor" ? "active" : ""}`}
                onClick={() => setActiveView("persona-editor")}
              >
                Persona Editor
              </button>
              <button
                type="button"
                className={`tab futuristic-btn ${activeView === "voice" ? "active" : ""}`}
                onClick={() => setActiveView("voice")}
              >
                Voice Lab
              </button>
              <button
                type="button"
                className={`tab futuristic-btn ${activeView === "settings" ? "active" : ""}`}
                onClick={() => setActiveView("settings")}
              >
                Settings
              </button>
              <button
                type="button"
                className={`tab futuristic-btn ${activeView === "eval" ? "active" : ""}`}
                onClick={() => setActiveView("eval")}
              >
                Adversarial Eval
              </button>
              <button
                type="button"
                className={`tab futuristic-btn ${activeView === "brain" ? "active" : ""}`}
                onClick={() => setActiveView("brain")}
              >
                Brain Core
              </button>
              <button
                type="button"
                className={`tab futuristic-btn ${activeView === "browser" ? "active" : ""}`}
                onClick={() => setActiveView("browser")}
              >
                3D Browser
              </button>
            </div>

            <div className="main-content">
              {activeView === "voxis" ? (
                <>
                  <h2 className="section-heading">Voxis AI Guide</h2>
                  <p className="section-copy">
                    Talk to Voxis to create new personalities or modify existing ones through natural language. Voxis understands intent and translates it into precise system changes.
                  </p>
                  <VoxisTab
                    selectedPersonality={selectedPersonality}
                    onPersonalityUpdated={handlePersonalityUpdated}
                    onStatus={setStatus}
                  />
                </>
              ) : activeView === "builder" ? (
                <>
                  <h2 className="section-heading">
                    {builderMode === "edit" ? "Refine an existing personality" : "Shape a new personality"}
                  </h2>
                  <p className="section-copy">
                    {builderMode === "edit"
                      ? "Load the selected persona into the form, refine behavior and expression, then save updates in place. Use Voice Lab for dedicated TTS tuning."
                      : "Start with a persona name and optional source URLs, pull research into the form, then save a profile with a stronger system prompt. Voice tuning happens in Voice Lab after save."}
                  </p>
                  <div className="meta-row" style={{ marginBottom: 12 }}>
                    <button
                      type="button"
                      className={`tab ${builderMode === "quick" ? "active" : ""}`}
                      onClick={() => setBuilderMode("quick")}
                    >
                      Quick Create
                    </button>
                    <button
                      type="button"
                      className={`tab ${builderMode === "create" ? "active" : ""}`}
                      onClick={() => setBuilderMode("create")}
                    >
                      Advanced
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
                  {builderMode === "quick" ? (
                    <QuickPersonalityCreator
                      onCreated={handlePersonalityCreated}
                      onCancel={() => setBuilderMode("create")}
                    />
                  ) : (
                    <PersonalityForm
                      onCreated={handlePersonalityCreated}
                      onUpdated={handlePersonalityUpdated}
                      onError={setStatus}
                      onOpenVoiceLab={() => setActiveView("voice")}
                      personalities={personalities}
                      editingPersonality={builderMode === "edit" ? selectedPersonality : null}
                    />
                  )}
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
                    onOpenSettings={() => setActiveView("settings")}
                    onPersonalityUpdated={handlePersonalityUpdated}
                  />
                </>
              ) : activeView === "brain" ? (
                <BrainTab
                  brainEvents={liveChatState[selectedId]?.brainEvents || []}
                  personality={selectedPersonality}
                  livePhase={liveChatState[selectedId]?.phase || ""}
                />
              ) : activeView === "browser" ? (
                <>
                  <h2 className="section-heading">3D Persona Browser</h2>
                  <p className="section-copy">
                    Explore your personas in dramatic 3D space. Click a card to select and enter the neural link.
                  </p>
                  <PersonaBrowser
                    personas={personalities}
                    onSelectPersona={(persona) => {
                      setSelectedId(persona.id);
                      setActiveView("chat");
                      setStatus({
                        type: "success",
                        message: `${persona.name} is ready. Start chatting now.`,
                      });
                    }}
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
                  <h2 className="section-heading">Runtime Settings</h2>
                  <p className="section-copy">
                    Manage platform options, runtime providers, global voice routing, and voice provider credentials in one place.
                  </p>
                  <div className="panel glass-panel holographic-border" style={{ padding: 16, marginBottom: 16 }}>
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
                    <label style={{ display: "inline-flex", gap: 8, marginTop: 12, color: "#87a8b9" }}>
                      <input
                        type="checkbox"
                        checked={disableNeuronMap3d}
                        onChange={(event) => setDisableNeuronMap3d(event.target.checked)}
                      />
                      Disable NeuronMap 3D (form-first mode)
                    </label>
                    <p className="fx-option-note">
                      Keeps Brain tab and in-chat Brain button available, while forcing layout/list mode and hiding 3D rendering.
                    </p>
                  </div>
                  <div className="panel glass-panel holographic-border" style={{ padding: 16, marginBottom: 16 }}>
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

                    <label style={{ display: "inline-flex", gap: 8, marginTop: 12, color: "#87a8b9" }}>
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

                    <label style={{ display: "inline-flex", gap: 8, marginTop: 12, color: "#87a8b9" }}>
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
                  <ApiDiagnosticsPanel onStatus={setStatus} autoRunToken={diagnosticsRunToken} />
                  <div style={{ marginTop: 24 }}>
                    <h3 className="section-heading">Chat Provider Configuration</h3>
                  </div>
                  <LlmSettingsPanel onStatus={setStatus} />
                  <div style={{ marginTop: 24 }}>
                    <h3 className="section-heading">Emotional Engine Tuning</h3>
                    <p className="section-copy">
                      Adjust how your characters experience and recover from emotional states across turns.
                    </p>
                  </div>
                  <MoodRuntimeSettings onStatus={setStatus} />
                  <div style={{ marginTop: 24 }}>
                    <h3 className="section-heading">Expression Sampling</h3>
                    <p className="section-copy">
                      Control phrase variation and realism by adjusting mood-aware sampling per chat mode.
                    </p>
                  </div>
                  <ExpressionSamplingSettings onStatus={setStatus} />
                  <div style={{ marginTop: 24 }}>
                    <h3 className="section-heading">Cognition Loop</h3>
                    <p className="section-copy">
                      Configure background personality reflection, autonomous decision-making, and reach-out delivery settings.
                    </p>
                  </div>
                  <CognitionLoopSettings onStatus={setStatus} />
                  <div style={{ marginTop: 24 }}>
                    <h3 className="section-heading">Profane Filter</h3>
                    <p className="section-copy">
                      Toggle content safety restrictions and customize the disclaimer shown when the filter is disabled.
                    </p>
                  </div>
                  <ProfaneFilterSettings onStatus={setStatus} />
                  <div style={{ marginTop: 24 }}>
                    <h3 className="section-heading">Companion Alias Mapping</h3>
                    <p className="section-copy">
                      Configure which legacy companion names are treated as placeholders and swapped to the active user name at runtime.
                    </p>
                  </div>
                  <CompanionAliasSettings onStatus={setStatus} />
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
                    stateDriftHistory={liveChatState[selectedId]?.stateDriftHistory || []}
                    livePhase={liveChatState[selectedId]?.phase || ""}
                    liveSeq={liveChatState[selectedId]?.seq || 0}
                    liveReply={liveChatState[selectedId]?.reply || ""}
                    liveUsage={liveChatState[selectedId]?.usage || null}
                    liveVoiceAdjustments={liveChatState[selectedId]?.voiceAdjustments || null}
                    liveSingingActive={liveChatState[selectedId]?.singingActive || false}
                    activeMode={chatPolicy?.activeMode || selectedMode}
                    neuralProfile={selectedUserProfile || chatPolicy}
                    disableNeuronMap3d={disableNeuronMap3d}
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
                <div className={`status ${status.type || "success"}`}>
                  <div className="status-row">
                    <span>{status.message}</span>
                    {status.actionLabel && status.actionId ? (
                      <button
                        type="button"
                        className="status-action"
                        onClick={() => handleStatusAction(status.actionId)}
                      >
                        {status.actionLabel}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </main>
        </section>
      </div>
      </PersonaStateProvider>
    </>
  );
}
