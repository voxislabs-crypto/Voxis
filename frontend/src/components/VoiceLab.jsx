import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import { useAuthFetch } from "../hooks/useAuthFetch.js";
import { getApiErrorMessage, readApiResponsePayload } from "../lib/apiResponse.js";
import { buildTtsCacheKey, getTtsCache, setTtsCache } from "../utils/ttsCache.js";
import { interpretEmotionSpectrum } from "../lib/emotionSpectrum.js";
import VoiceSampleSelector from "./VoiceSampleSelector.jsx";
import VoiceCloneTab from "./VoiceCloneTab.jsx";

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

  /* ── Tab Bar ───────────────────────────────────────────────── */
  .vlab-tab-bar {
    display: flex;
    gap: 0;
    border-bottom: 1px solid rgba(0, 200, 255, 0.12);
    background: rgba(0, 10, 24, 0.6);
    position: relative;
    z-index: 4;
  }

  .vlab-tab-btn {
    flex: 1;
    padding: 0.55rem 1rem;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    font-size: 0.68rem;
    letter-spacing: 0.1em;
    color: rgba(100, 180, 210, 0.55);
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }

  .vlab-tab-btn:hover {
    color: rgba(125, 249, 255, 0.75);
    background: rgba(0, 180, 255, 0.04);
  }

  .vlab-tab-btn.active {
    color: #7df9ff;
    border-bottom-color: #00b4ff;
    background: rgba(0, 180, 255, 0.06);
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

  .vlab-callout {
    grid-column: 1 / -1;
    padding: 14px;
    border: 1px solid rgba(0, 180, 255, 0.16);
    border-radius: 12px;
    background: rgba(0, 180, 255, 0.05);
    display: grid;
    gap: 12px;
  }

  /* Amber warning variant */
  .vlab-callout.warn {
    border-color: rgba(251, 191, 36, 0.35);
    background: rgba(251, 191, 36, 0.06);
  }
  .vlab-callout.warn .vlab-callout-title { color: #fcd34d; }

  /* Green info variant */
  .vlab-callout.ok {
    border-color: rgba(74, 222, 128, 0.30);
    background: rgba(74, 222, 128, 0.05);
  }
  .vlab-callout.ok .vlab-callout-title { color: #86efac; }

  .vlab-callout-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .vlab-callout-title {
    margin: 0;
    font-size: 0.82rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #9fe7ff;
  }

  .vlab-callout-copy {
    margin: 4px 0 0;
    font-size: 0.8rem;
    line-height: 1.55;
    color: var(--muted);
  }

  .vlab-inline-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .vlab-key-hint {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 0.72rem;
    color: #7fe7b1;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    font-family: "JetBrains Mono", "Courier New", monospace;
  }

  .vlab-doc-link {
    color: var(--accent);
    text-decoration: none;
    font-weight: 700;
  }

  .vlab-doc-link:hover {
    text-decoration: underline;
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

  .vlab-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(2, 6, 16, 0.72);
    backdrop-filter: blur(6px);
    z-index: 1200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }

  .vlab-modal {
    width: min(880px, 100%);
    max-height: 86vh;
    overflow: auto;
    border-radius: 16px;
    border: 1px solid rgba(0, 180, 255, 0.24);
    background: rgba(4, 10, 24, 0.98);
    box-shadow: 0 22px 56px rgba(0, 0, 0, 0.55);
    padding: 18px;
    display: grid;
    gap: 14px;
  }

  .vlab-modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }

  .vlab-modal-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 800;
    letter-spacing: 0.03em;
    color: var(--text);
  }

  .vlab-modal-copy {
    margin: 6px 0 0;
    color: var(--muted);
    font-size: 0.82rem;
    line-height: 1.55;
  }

  .vlab-modal-close {
    border: 1px solid rgba(0, 180, 255, 0.22);
    border-radius: 8px;
    background: rgba(0, 180, 255, 0.08);
    color: var(--accent);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 6px 10px;
    cursor: pointer;
  }

  .vlab-progress-panel {
    border: 1px solid rgba(0, 180, 255, 0.18);
    border-radius: 12px;
    background: rgba(0, 180, 255, 0.05);
    padding: 12px;
    display: grid;
    gap: 8px;
  }

  .vlab-progress-step {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--muted);
    font-size: 0.78rem;
    letter-spacing: 0.03em;
  }

  .vlab-progress-step.active {
    color: #9fe7ff;
    font-weight: 700;
  }

  .vlab-progress-step.done {
    color: #7fe7b1;
  }

  .vlab-progress-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1px solid rgba(0, 180, 255, 0.40);
    background: transparent;
  }

  .vlab-progress-step.active .vlab-progress-dot {
    background: var(--accent);
    box-shadow: 0 0 10px rgba(0, 200, 255, 0.65);
  }

  .vlab-progress-step.done .vlab-progress-dot {
    background: #4ade80;
    border-color: #4ade80;
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

  /* ─────────────────────────────────────────────────────────────
     NEW HOUSE-INSPIRED TREE NAV (blue-gray siding, brick, pink)
  ───────────────────────────────────────────────────────────── */
  .vlab-split {
    display: flex;
    gap: 0;
    min-height: 520px;
    border-radius: 16px;
    overflow: hidden;
    background: #0a111a;
    border: 1px solid #3f4f5f;
  }

  .vlab-tree {
    width: 260px;
    min-width: 220px;
    max-width: 280px;
    background: #0e1620;
    border-right: 1px solid #2f3f4f;
    padding: 14px 0;
    overflow-y: auto;
    flex-shrink: 0;
    font-family: "JetBrains Mono", "Courier New", monospace;
  }

  .vlab-tree-root {
    padding: 8px 18px 10px;
    font-size: 0.95rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: #b8c9d9;
    text-transform: uppercase;
    border-bottom: 1px solid #2a3747;
    margin-bottom: 6px;
  }

  .vlab-tree-parent {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 9px 18px 8px;
    font-size: 0.82rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: #9fb4c8;
    background: none;
    border: 0;
    text-align: left;
    cursor: pointer;
    transition: background 120ms ease, color 120ms ease;
  }

  .vlab-tree-parent:hover {
    background: rgba(79, 99, 116, 0.12);
    color: #c6d6e4;
  }

  .vlab-tree-parent .chev {
    width: 14px;
    display: inline-block;
    transition: transform 140ms ease;
    color: #5f7285;
  }

  .vlab-tree-parent.expanded .chev {
    transform: rotate(90deg);
  }

  .vlab-tree-parent.active-parent {
    color: #d2e1ee;
    background: rgba(79, 99, 116, 0.08);
  }

  .vlab-tree-children {
    padding-left: 26px;
    padding-bottom: 4px;
  }

  .vlab-tree-child {
    display: block;
    width: 100%;
    padding: 5px 12px 5px 10px;
    font-size: 0.73rem;
    color: #8a9aa9;
    text-align: left;
    background: none;
    border: 0;
    cursor: pointer;
    border-radius: 4px;
    transition: all 120ms ease;
  }

  .vlab-tree-child:hover {
    background: rgba(60, 72, 84, 0.25);
    color: #b7c8d9;
  }

  .vlab-tree-child.selected {
    font-weight: 800;
    color: #e6e4dc;
    background: rgba(140, 95, 74, 0.22); /* brick accent */
    border-left: 3px solid #b36b55;
    padding-left: 7px;
  }

  .vlab-content {
    flex: 1;
    padding: 18px 22px;
    overflow-y: auto;
    background: #0b121b;
  }

  .vlab-section-header {
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #a8b9c9;
    margin-bottom: 14px;
    padding-bottom: 6px;
    border-bottom: 1px solid #2f3f4f;
  }

  /* Permanent gentle status bar (house trim + subtle) */
  .vlab-permanent-status {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    padding: 8px 16px;
    background: #0f1721;
    border-bottom: 1px solid #2a3747;
    font-family: "JetBrains Mono", "Courier New", monospace;
    font-size: 0.68rem;
    letter-spacing: 0.07em;
    color: #8fa4b8;
  }

  .vlab-status-pill {
    padding: 2px 9px;
    border-radius: 999px;
    background: rgba(79, 99, 116, 0.2);
    border: 1px solid rgba(79, 99, 116, 0.35);
    color: #a8b9c9;
    font-weight: 600;
  }

  .vlab-status-pill.on {
    background: rgba(140, 95, 74, 0.18);
    border-color: rgba(179, 107, 85, 0.4);
    color: #d9b8a8;
  }

  .vlab-status-pill.accent {
    background: rgba(217, 106, 140, 0.12);
    border-color: rgba(217, 106, 140, 0.35);
    color: #e8b8c8;
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
  { id: "sonic-3", label: "sonic-3" },
  { id: "sonic-3-latest", label: "sonic-3-latest" },
  { id: "sonic-2", label: "sonic-2" },
  { id: "sonic-turbo", label: "sonic-turbo" },
];

const CARTESIA_MODEL_QUICK_PICKS = ["sonic-3", "sonic-3-latest", "sonic-turbo"];

const CLOUD_MODEL_PRESETS = [
  { id: "gpt-4o-mini-tts", label: "gpt-4o-mini-tts" },
];

const CLOUD_VOICE_PRESETS = [
  { id: "alloy", label: "Alloy" },
  { id: "ash", label: "Ash" },
  { id: "ballad", label: "Ballad" },
  { id: "coral", label: "Coral" },
  { id: "echo", label: "Echo" },
  { id: "fable", label: "Fable" },
  { id: "nova", label: "Nova" },
  { id: "onyx", label: "Onyx" },
  { id: "sage", label: "Sage" },
  { id: "shimmer", label: "Shimmer" },
  { id: "__custom__", label: "Custom voice id" },
];

const REALISM_PRESETS = [
  {
    id: "conversational",
    label: "Conversational",
    description: "Balanced cleanup for everyday dialogue.",
  },
  {
    id: "cinematic",
    label: "Cinematic",
    description: "Polished body with a tiny room tail.",
  },
  {
    id: "intimate",
    label: "Intimate",
    description: "Soft de-essing and close-mic presence.",
  },
  {
    id: "energetic",
    label: "Energetic",
    description: "Punchier compression with brighter edge.",
  },
];

const CUSTOM_OPTION = "__custom__";
const TTS_DEBUG_PROVIDER_LOCK = String(import.meta.env.VITE_TTS_DEBUG_PROVIDER_LOCK ?? "true").trim().toLowerCase() !== "false";
const PROSODY_PROGRESS_STEPS = [
  "Scraping source audio",
  "Analyzing cadence and rhythm",
  "Detecting representative voices",
  "Preparing voice previews",
];

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}

function normalizeVoiceEngineForDebug(engine) {
  const normalized = String(engine || "auto").trim().toLowerCase();
  if (!TTS_DEBUG_PROVIDER_LOCK) {
    return normalized || "auto";
  }
  return ["auto", "kokoro", "cartesia"].includes(normalized) ? normalized : "auto";
}

function getProviderCatalogMeta(options) {
  return options?.catalog && typeof options.catalog === "object"
    ? options.catalog
    : { voices: { source: "unavailable", count: 0 }, models: { source: "unavailable", count: 0 } };
}

function getProviderVoiceHelpText(providerId, options) {
  if (providerId === "cartesia") {
    const catalog = getProviderCatalogMeta(options);
    if (options?.error) {
      return options.error;
    }
    if (catalog.voices?.source === "api") {
      return `Loaded ${catalog.voices.count || 0} Cartesia voices from your API key.`;
    }
    return "Cartesia voice discovery is unavailable right now. Use a saved voice, or switch to Custom voice id.";
  }

  return options?.error || "Auto-loaded from your configured ElevenLabs API key.";
}

function getProviderModelHelpText(providerId, options) {
  if (providerId === "cartesia") {
    const catalog = getProviderCatalogMeta(options);
    if (options?.error) {
      return options.error;
    }
    if (catalog.models?.source === "api") {
      return `Loaded ${catalog.models.count || 0} Cartesia models from live discovery.`;
    }
    return "Showing fallback Cartesia models because live discovery returned no model catalog. Use Custom model id for snapshots or newly released IDs.";
  }

  return options?.error || "Auto-loaded from your configured provider API key.";
}

export default function VoiceLab({
  personality,
  messages,
  onSaveVoiceProfile,
  onStatus,
  onJumpToBuilder,
  onOpenSettings,
  onPersonalityUpdated,
}) {
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
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
    cartesiaModel: "sonic-3",
    sfxVolume: 0.85,
    realismEnabled: false,
    realismPreset: "conversational",
  });
  const [isPrefetchingSfx, setIsPrefetchingSfx] = useState(false);
  const [vlabTab, setVlabTab] = useState("config"); // "config" | "clone"

  // New tree navigation state for the requested split UI
  const [selectedVoiceSection, setSelectedVoiceSection] = useState("engine-main");
  const [expandedVoiceSections, setExpandedVoiceSections] = useState(() => new Set(["engine", "synthesis", "flags"]));

  // File-system style tree definition for Voice Lab
  const voiceTree = [
    {
      id: "engine",
      label: "ENGINE CONFIG",
      children: [
        { id: "engine-main", label: "Engine Selection" },
        { id: "provider-voices", label: "Provider Voices" },
        { id: "models", label: "Models" },
        { id: "provider-auth", label: "Provider Credentials" },
      ],
    },
    {
      id: "synthesis",
      label: "SYNTHESIS PARAMETERS",
      children: [
        { id: "pitch-rate", label: "Pitch & Rate" },
        { id: "sfx-volume", label: "SFX Volume" },
        { id: "realism", label: "Realism Post-Processing" },
      ],
    },
    {
      id: "flags",
      label: "VOICE FLAGS",
      children: [
        { id: "voice-toggle", label: "Voice Enable" },
        { id: "autoplay-flag", label: "Autoplay" },
      ],
    },
    {
      id: "testing",
      label: "TESTING & PROSODY",
      children: [
        { id: "signal-tester", label: "Signal Tester" },
        { id: "waveform", label: "Waveform Monitor" },
        { id: "sample-preview", label: "Sample Preview" },
      ],
    },
    {
      id: "profiles",
      label: "SAVED PROFILES",
      children: [
        { id: "voice-maps", label: "Voice Maps" },
        { id: "save-apply", label: "Save & Apply" },
      ],
    },
  ];

  function toggleVoiceParent(parentId) {
    setExpandedVoiceSections((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) {
        next.delete(parentId);
      } else {
        next.add(parentId);
      }
      return next;
    });
  }

  function selectVoiceSection(sectionId, parentId) {
    setSelectedVoiceSection(sectionId);
    if (parentId && !expandedVoiceSections.has(parentId)) {
      setExpandedVoiceSections((prev) => new Set(prev).add(parentId));
    }
  }

  // Render the right-hand content based on selected tree leaf
  function renderVoiceContent(sectionId) {
    const sectionTitleMap = {
      "engine-main": "ENGINE CONFIG — Engine Selection",
      "provider-voices": "ENGINE CONFIG — Provider Voices",
      "models": "ENGINE CONFIG — Models",
      "provider-auth": "ENGINE CONFIG — Provider Credentials",
      "pitch-rate": "SYNTHESIS PARAMETERS — Pitch & Rate",
      "sfx-volume": "SYNTHESIS PARAMETERS — SFX Volume",
      "realism": "SYNTHESIS PARAMETERS — Realism",
      "voice-toggle": "VOICE FLAGS — Enable",
      "autoplay-flag": "VOICE FLAGS — Autoplay",
      "signal-tester": "TESTING & PROSODY — Signal Tester",
      "waveform": "TESTING & PROSODY — Waveform",
      "sample-preview": "TESTING & PROSODY — Sample Preview",
      "voice-maps": "SAVED PROFILES — Voice Maps",
      "save-apply": "SAVED PROFILES — Save & Apply",
    };

    const title = sectionTitleMap[sectionId] || "CONFIGURATION";

    return (
      <div>
        <div className="house-content-header">{title}</div>

        {/* ENGINE SELECTION */}
        {(sectionId === "engine-main" || sectionId === "provider-voices" || sectionId === "models") && (
          <>
            <div className="vlab-field" style={{ marginBottom: 16 }}>
              <label htmlFor="vlab-engine">TTS Engine</label>
              <select
                id="vlab-engine"
                className="vlab-select"
                value={voiceProfile.engine}
                onChange={(e) => updateVoiceField("engine", normalizeVoiceEngineForDebug(e.target.value))}
                style={{ width: "100%", padding: "8px 10px" }}
              >
                {TTS_DEBUG_PROVIDER_LOCK ? (
                  <>
                    <option value="auto">auto (cartesia → kokoro)</option>
                    <option value="kokoro">kokoro (free local)</option>
                    <option value="openvoice">openvoice (voice clone)</option>
                    <option value="kokoro-rvc">kokoro + rvc</option>
                    <option value="cartesia">cartesia (saved key)</option>
                  </>
                ) : (
                  <>
                    <option value="auto">auto</option>
                    <option value="cloud">cloud</option>
                    <option value="elevenlabs">elevenlabs</option>
                    <option value="cartesia">cartesia</option>
                    <option value="kokoro">kokoro</option>
                    <option value="piper">piper</option>
                  </>
                )}
              </select>
            </div>

            {/* Provider voice selection simplified for tree view */}
            {sectionId === "provider-voices" && (
              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: "0.72rem", textTransform: "uppercase", color: "#8fa4b8" }}>Voice (provider)</label>
                <div style={{ marginTop: 6, fontSize: "0.8rem", color: "#a8b9c9" }}>
                  (Full voice selector available in legacy mode or advanced panels)
                </div>
              </div>
            )}

            {sectionId === "models" && (
              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: "0.72rem", textTransform: "uppercase", color: "#8fa4b8" }}>Model</label>
                <div style={{ marginTop: 6, fontSize: "0.8rem", color: "#a8b9c9" }}>
                  Choose model in the expanded form if needed.
                </div>
              </div>
            )}
          </>
        )}

        {/* SYNTHESIS */}
        {sectionId === "pitch-rate" && (
          <div className="vlab-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="vlab-field">
              <label>Pitch Modifier</label>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.01"
                value={voiceProfile.pitch}
                onChange={(e) => updateVoiceField("pitch", parseFloat(e.target.value))}
              />
              <div style={{ fontSize: "0.7rem", color: "#7a95af" }}>{Number(voiceProfile.pitch).toFixed(2)}</div>
            </div>
            <div className="vlab-field">
              <label>Rate Modifier</label>
              <input
                type="range"
                min="0.6"
                max="1.8"
                step="0.01"
                value={voiceProfile.rate}
                onChange={(e) => updateVoiceField("rate", parseFloat(e.target.value))}
              />
              <div style={{ fontSize: "0.7rem", color: "#7a95af" }}>{Number(voiceProfile.rate).toFixed(2)}</div>
            </div>
          </div>
        )}

        {sectionId === "sfx-volume" && (
          <div className="vlab-field">
            <label>SFX Volume</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={voiceProfile.sfxVolume}
              onChange={(e) => updateVoiceField("sfxVolume", parseFloat(e.target.value))}
            />
            <div style={{ fontSize: "0.7rem" }}>{Number(voiceProfile.sfxVolume).toFixed(2)}</div>
          </div>
        )}

        {sectionId === "realism" && (
          <>
            <label className="vlab-toggle" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={!!voiceProfile.realismEnabled}
                onChange={(e) => updateVoiceField("realismEnabled", e.target.checked)}
              />
              Enable Realism Post-Processing
            </label>
            <div style={{ marginTop: 10 }}>
              <label style={{ fontSize: "0.72rem" }}>Realism Preset</label>
              <select
                value={voiceProfile.realismPreset}
                onChange={(e) => updateVoiceField("realismPreset", e.target.value)}
                style={{ marginTop: 4, width: "100%" }}
              >
                {["conversational", "dramatic", "intimate", "energetic", "whisper"].map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </>
        )}

        {/* VOICE FLAGS */}
        {(sectionId === "voice-toggle" || sectionId === "autoplay-flag") && (
          <div>
            <label className="vlab-toggle" style={{ marginBottom: 12, display: "block" }}>
              <input
                type="checkbox"
                checked={voiceProfile.enabled}
                onChange={(e) => updateVoiceField("enabled", e.target.checked)}
              />
              Voice Enabled
            </label>

            <label className="vlab-toggle" style={{ display: "block" }}>
              <input
                type="checkbox"
                checked={!!voiceProfile.autoplay}
                onChange={(e) => updateVoiceField("autoplay", e.target.checked)}
              />
              Autoplay responses
            </label>
          </div>
        )}

        {/* TESTING */}
        {["signal-tester", "waveform", "sample-preview"].includes(sectionId) && (
          <div style={{ fontSize: "0.85rem", color: "#9fb4c8", lineHeight: 1.5 }}>
            {sectionId === "signal-tester" && "Prosody URL + extraction controls live here."}
            {sectionId === "waveform" && "Live frequency monitor and generated audio preview."}
            {sectionId === "sample-preview" && "Send test text and audition current settings."}
            <div style={{ marginTop: 12, fontSize: "0.7rem", opacity: 0.7 }}>
              (Detailed controls still available in the full config view if needed)
            </div>
          </div>
        )}

        {/* PROFILES */}
        {["voice-maps", "save-apply"].includes(sectionId) && (
          <div>
            <div style={{ marginBottom: 12 }}>Voice Maps &amp; Saved Profiles</div>
            <button className="vlab-btn" style={{ padding: "8px 14px" }} onClick={() => void saveVoiceMap()}>
              Save Current Voice Profile
            </button>
            <div style={{ marginTop: 10, fontSize: "0.7rem", color: "#7a95af" }}>
              Load from saved maps in the full editor.
            </div>
          </div>
        )}

        <div style={{ marginTop: 24, fontSize: "0.65rem", color: "#5f7285", borderTop: "1px solid #2a3747", paddingTop: 10 }}>
          Select different leaves on the left to focus this panel. Full legacy controls remain available under the hood.
        </div>
      </div>
    );
  }
  const [sampleText, setSampleText] = useState("");
  const [prosodyUrl, setProsodyUrl] = useState("");
  const [prosodyFile, setProsodyFile] = useState(null);
  const [isExtractingProsody, setIsExtractingProsody] = useState(false);
  const [voiceSamples, setVoiceSamples] = useState(null);
  const [isProsodyModalOpen, setIsProsodyModalOpen] = useState(false);
  const [prosodyProgressIndex, setProsodyProgressIndex] = useState(0);
  const [prosodyModalError, setProsodyModalError] = useState("");
  const [isSavingVoice, setIsSavingVoice] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [directedPreview, setDirectedPreview] = useState("");
  const [previewTelemetry, setPreviewTelemetry] = useState(null);
  const [cartesiaPreviewPlaying, setCartesiaPreviewPlaying] = useState(false);
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
      catalog: {
        voices: { source: "fallback", count: CARTESIA_VOICE_PRESETS.filter((voice) => voice.id).length },
        models: { source: "fallback", count: CARTESIA_MODEL_PRESETS.length },
      },
      error: "",
    },
  });
  const [isLoadingProviderOptions, setIsLoadingProviderOptions] = useState(false);
  const [isClearingProviderCredential, setIsClearingProviderCredential] = useState(false);
  const [providerOptionsReloadToken, setProviderOptionsReloadToken] = useState(0);
  const [providerLastUpdatedAt, setProviderLastUpdatedAt] = useState({ elevenlabs: 0, cartesia: 0 });
  const [cloudModels, setCloudModels] = useState(CLOUD_MODEL_PRESETS);
  const [isLoadingCloudModels, setIsLoadingCloudModels] = useState(false);
  const [cloudModelError, setCloudModelError] = useState("");
  const [cloudModelsReloadToken, setCloudModelsReloadToken] = useState(0);
  const [cloudLastUpdatedAt, setCloudLastUpdatedAt] = useState(0);
  // Provider ID of the currently-connected LLM (e.g. "openrouter", "openai").  
  // Used to warn the user when their LLM provider can't handle TTS audio requests.
  const [llmProvider, setLlmProvider] = useState("");
  const [savedVoiceMaps, setSavedVoiceMaps] = useState([]);
  const [selectedVoiceMapId, setSelectedVoiceMapId] = useState("");
  const [voiceMapName, setVoiceMapName] = useState("");
  const [isLoadingVoiceMaps, setIsLoadingVoiceMaps] = useState(false);
  const [isSavingVoiceMap, setIsSavingVoiceMap] = useState(false);
  const [isDeletingVoiceMap, setIsDeletingVoiceMap] = useState(false);
  const [syncMapOnProfileSave, setSyncMapOnProfileSave] = useState(true);

  // Refs
  const audioRef = useRef(null);
  const voiceSampleAudioRef = useRef(null);
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
    ? providerOptions[selectedProviderId] || { voices: [], builtinVoices: [], customVoices: [], models: [], catalog: {}, error: "" }
    : { voices: [], builtinVoices: [], customVoices: [], models: [], catalog: {}, error: "" };

  const activeBuiltinVoices = Array.isArray(activeProviderOptions.builtinVoices)
    ? activeProviderOptions.builtinVoices
    : [];
  const activeCustomVoices = Array.isArray(activeProviderOptions.customVoices)
    ? activeProviderOptions.customVoices
    : [];

  const activeVoiceValue = selectedProviderId === "elevenlabs"
    ? voiceProfile.elevenLabsVoiceId || ""
    : selectedProviderId === "cartesia"
      ? voiceProfile.cartesiaVoiceId || ""
      : "";

  const cartesiaVoicePreviewUrl = selectedProviderId === "cartesia" && activeVoiceValue
    ? (activeProviderOptions.voices.find((v) => v.id === activeVoiceValue)?.previewUrl || "")
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
  const activeVoiceFieldId = selectedVoiceOption === CUSTOM_OPTION ? "vlab-voice-custom" : "vlab-voice";
  const activeModelFieldId = selectedModelOption === CUSTOM_OPTION ? "vlab-model-custom" : "vlab-model";

  const activeProviderUpdatedAt = selectedProviderId ? Number(providerLastUpdatedAt[selectedProviderId] || 0) : 0;
  const showProviderUpdated = !isLoadingProviderOptions && activeProviderUpdatedAt > 0;
  const showCloudUpdated = !isLoadingCloudModels && cloudLastUpdatedAt > 0;
  const providerAuthError = useMemo(() => {
    const message = String(activeProviderOptions?.error || "").trim();
    if (!message) return "";
    return /(401|unauthorized|invalid api key|auth)/i.test(message) ? message : "";
  }, [activeProviderOptions?.error]);

  const supportsCloudModelCatalog = !selectedProviderId;
  const selectedCloudModelOption = cloudModels.some((model) => model.id === voiceProfile.providerModel)
    ? voiceProfile.providerModel
    : CUSTOM_OPTION;
  const selectedCloudVoiceOption = CLOUD_VOICE_PRESETS.some((voice) => voice.id === (voiceProfile.providerVoice || voiceProfile.preferredVoice || ""))
    ? (voiceProfile.providerVoice || voiceProfile.preferredVoice || "")
    : CUSTOM_OPTION;
  const modelFieldLabel = selectedProviderId
    ? "TTS Model"
    : voiceProfile.engine === "kokoro" || voiceProfile.engine === "piper"
      ? "Cloud Fallback Model"
      : "TTS Model";
  const voiceFieldLabel = voiceProfile.engine === "piper"
    ? "Piper Voice"
    : voiceProfile.engine === "kokoro"
      ? "Kokoro Voice"
      : voiceProfile.engine === "elevenlabs"
        ? "ElevenLabs Voice"
        : voiceProfile.engine === "cartesia"
          ? "Cartesia Voice"
          : voiceProfile.engine === "cloud"
            ? "Cloud Voice"
            : "Cloud/Fallback Voice";
  const hasProsodyFile = Boolean(prosodyFile && typeof prosodyFile.name === "string" && prosodyFile.name.trim());

  const recommendedVoiceMapId = useMemo(() => {
    if (!savedVoiceMaps.length) {
      return "";
    }

    // Normalize engine consistently — maps saved as "auto" should match the
    // current profile even when TTS debug lock coerces "auto" → "cartesia".
    // Also treat an empty/missing engine as "auto" on both sides.
    const currentEngine = normalizeVoiceEngineForDebug(String(voiceProfile.engine || "auto").trim().toLowerCase());
    const currentModel = currentEngine === "elevenlabs"
      ? String(voiceProfile.elevenLabsModel || "").trim().toLowerCase()
      : currentEngine === "cartesia"
        ? String(voiceProfile.cartesiaModel || "").trim().toLowerCase()
        : String(voiceProfile.providerModel || "").trim().toLowerCase();

    const currentVoiceKey = currentEngine === "elevenlabs"
      ? String(voiceProfile.elevenLabsVoiceId || voiceProfile.providerVoice || "").trim().toLowerCase()
      : currentEngine === "cartesia"
        ? String(voiceProfile.cartesiaVoiceId || voiceProfile.providerVoice || "").trim().toLowerCase()
        : currentEngine === "kokoro"
          ? String(voiceProfile.kokoroVoice || voiceProfile.providerVoice || "").trim().toLowerCase()
          : currentEngine === "piper"
            ? String(voiceProfile.piperModelPath || voiceProfile.providerVoice || "").trim().toLowerCase()
            : String(voiceProfile.providerVoice || voiceProfile.preferredVoice || "").trim().toLowerCase();

    let bestId = "";
    let bestScore = -1;

    for (const map of savedVoiceMaps) {
      const profile = map?.voiceProfile && typeof map.voiceProfile === "object" ? map.voiceProfile : {};
      const mapEngine = normalizeVoiceEngineForDebug(String(profile.engine || "auto").trim().toLowerCase());
      const mapModel = mapEngine === "elevenlabs"
        ? String(profile.elevenLabsModel || "").trim().toLowerCase()
        : mapEngine === "cartesia"
          ? String(profile.cartesiaModel || "").trim().toLowerCase()
          : String(profile.providerModel || "").trim().toLowerCase();
      const mapVoiceKey = mapEngine === "elevenlabs"
        ? String(profile.elevenLabsVoiceId || profile.providerVoice || "").trim().toLowerCase()
        : mapEngine === "cartesia"
          ? String(profile.cartesiaVoiceId || profile.providerVoice || "").trim().toLowerCase()
          : mapEngine === "kokoro"
            ? String(profile.kokoroVoice || profile.providerVoice || "").trim().toLowerCase()
            : mapEngine === "piper"
              ? String(profile.piperModelPath || profile.providerVoice || "").trim().toLowerCase()
              : String(profile.providerVoice || profile.preferredVoice || "").trim().toLowerCase();

      let score = 0;
      if (Number(map.linkedPersonalityId) === Number(personality?.id)) {
        score += 100;
      }
      if (mapEngine && currentEngine && mapEngine === currentEngine) {
        score += 10;
      }
      if (mapVoiceKey && currentVoiceKey && mapVoiceKey === currentVoiceKey) {
        score += 12;
      }
      if (mapModel && currentModel && mapModel === currentModel) {
        score += 4;
      }

      if (score > bestScore) {
        bestScore = score;
        bestId = String(map.id || "");
      }
    }

    return bestScore > 0 ? bestId : "";
  }, [personality?.id, savedVoiceMaps, voiceProfile]);

  // ── Effects ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!personality) return;
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
      cartesiaModel: personality.voiceProfile?.cartesiaModel || "sonic-3",
      sfxVolume: Number(personality.voiceProfile?.sfxVolume ?? 0.85),
      realismEnabled: Boolean(personality.voiceProfile?.realismEnabled),
      realismPreset: String(personality.voiceProfile?.realismPreset || "conversational"),
    });
    setProsodyUrl(personality.prosodySourceUrl || "");
    setVoiceSamples(personality.voiceSampleAnalysis || null);
    setVoiceMapName((current) => current || `${personality.name} Voice`);
  }, [personality]);

  useEffect(() => {
    let ignore = false;

    async function loadVoiceMaps() {
      setIsLoadingVoiceMaps(true);
      try {
        const response = await authFetch("/api/settings/voice-maps");
        const payload = await readApiResponsePayload(response);
        if (!response.ok) {
          throw new Error(getApiErrorMessage(response, payload, "Failed to load saved voice maps."));
        }

        if (ignore) return;
        setSavedVoiceMaps(Array.isArray(payload?.maps) ? payload.maps : []);
      } catch (error) {
        if (!ignore) {
          setSavedVoiceMaps([]);
          onStatus?.({ type: "error", message: error.message || "Failed to load saved voice maps." });
        }
      } finally {
        if (!ignore) setIsLoadingVoiceMaps(false);
      }
    }

    void loadVoiceMaps();
    return () => {
      ignore = true;
    };
  }, [authFetch, onStatus, personality?.id]);

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
        const response = await authFetch("/api/tts/piper-voices");
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
        const response = await authFetch("/api/tts/kokoro-voices");
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
    if (!authLoaded || !isSignedIn) return;
    if (!personality || !selectedProviderId) return;

    let ignore = false;

    async function loadProviderOptions() {
      setIsLoadingProviderOptions(true);
      try {
        const response = await authFetch(`/api/tts/provider-options?provider=${encodeURIComponent(selectedProviderId)}`);
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
            catalog: data.catalog && typeof data.catalog === "object"
              ? data.catalog
              : {
                  voices: { source: "fallback", count: voices.length },
                  models: { source: selectedProviderId === "cartesia" ? "fallback" : "unavailable", count: models.length },
                },
            error: String(data.error || "").trim(),
          },
        }));
        setProviderLastUpdatedAt((cur) => ({
          ...cur,
          [selectedProviderId]: Date.now(),
        }));

        setVoiceProfile((cur) => {
          if (selectedProviderId === "elevenlabs") {
            const currentVoice = String(cur.elevenLabsVoiceId || "").trim();
            const defaultVoice = String(data.defaults?.voiceId || voices[0]?.id || "").trim();
            const nextVoice = currentVoice
              ? (voices.some((voice) => voice.id === currentVoice) || !isUuid(currentVoice) ? currentVoice : defaultVoice)
              : defaultVoice;
            const nextModel = cur.elevenLabsModel || data.defaults?.model || models[0]?.id || "eleven_multilingual_v2";
            return {
              ...cur,
              elevenLabsVoiceId: nextVoice,
              elevenLabsModel: nextModel,
              providerVoice: nextVoice || cur.providerVoice,
              preferredVoice: nextVoice || cur.preferredVoice,
            };
          }

          const currentVoice = String(cur.cartesiaVoiceId || "").trim();
          const defaultVoice = String(data.defaults?.voiceId || voices[0]?.id || "").trim();
          const nextVoice = currentVoice
            ? (voices.some((voice) => voice.id === currentVoice) || isUuid(currentVoice) ? currentVoice : defaultVoice)
            : defaultVoice;
          const nextModel = cur.cartesiaModel || data.defaults?.model || models[0]?.id || "sonic-3";
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

        const fallbackVoices = selectedProviderId === "elevenlabs"
          ? ELEVENLABS_VOICE_PRESETS.filter((voice) => voice.id)
          : CARTESIA_VOICE_PRESETS.filter((voice) => voice.id);
        const fallbackModels = selectedProviderId === "elevenlabs"
          ? ELEVENLABS_MODEL_PRESETS
          : CARTESIA_MODEL_PRESETS;

        setProviderOptions((cur) => ({
          ...cur,
          [selectedProviderId]: {
            ...(cur[selectedProviderId] || { voices: [], builtinVoices: [], customVoices: [], models: [] }),
            voices:
              Array.isArray(cur[selectedProviderId]?.voices) && cur[selectedProviderId].voices.length
                ? cur[selectedProviderId].voices
                : fallbackVoices,
            builtinVoices:
              Array.isArray(cur[selectedProviderId]?.builtinVoices) && cur[selectedProviderId].builtinVoices.length
                ? cur[selectedProviderId].builtinVoices
                : fallbackVoices,
            customVoices: Array.isArray(cur[selectedProviderId]?.customVoices)
              ? cur[selectedProviderId].customVoices
              : [],
            models:
              Array.isArray(cur[selectedProviderId]?.models) && cur[selectedProviderId].models.length
                ? cur[selectedProviderId].models
                : fallbackModels,
            catalog:
              cur[selectedProviderId]?.catalog && typeof cur[selectedProviderId].catalog === "object"
                ? cur[selectedProviderId].catalog
                : {
                    voices: { source: "fallback", count: fallbackVoices.length },
                    models: { source: selectedProviderId === "cartesia" ? "fallback" : "unavailable", count: fallbackModels.length },
                  },
            error: error.message || "Failed to load provider options.",
          },
        }));
      } finally {
        if (!ignore) setIsLoadingProviderOptions(false);
      }
    }

    void loadProviderOptions();
    return () => { ignore = true; };
  }, [authFetch, authLoaded, isSignedIn, personality?.id, selectedProviderId, providerOptionsReloadToken]);

  useEffect(() => {
    if (!personality || !supportsCloudModelCatalog) return;

    let ignore = false;

    async function loadCloudModels() {
      setIsLoadingCloudModels(true);
      setCloudModelError("");
      try {
        const response = await authFetch("/api/settings/llm");
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
        setLlmProvider(String(data.provider || "").toLowerCase());
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

  async function generateAudio(text, voiceOverride = null, speechHint = "") {
    if (!voiceProfile.enabled || !text?.trim() || !personality) return;

    setupAnalyser(); // safe to call on user-gesture; noop after first setup
    setIsGeneratingAudio(true);

    const effectiveVoiceProfile = voiceOverride ? { ...voiceProfile, ...voiceOverride } : voiceProfile;
    const cacheKey = buildTtsCacheKey(personality.id, text, effectiveVoiceProfile);

    try {
      const cachedEntry = getTtsCache(cacheKey);
      if (cachedEntry?.blob instanceof Blob) {
        const next = URL.createObjectURL(cachedEntry.blob);
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(next);
        if (cachedEntry.telemetry || cachedEntry.sfxTimeline) {
          setPreviewTelemetry((current) => ({
            ...(current || {}),
            ttsTelemetry: cachedEntry.telemetry || current?.ttsTelemetry || null,
          }));
        }
        requestAnimationFrame(() => {
          const audio = audioRef.current;
          if (audio instanceof HTMLAudioElement) void audio.play().catch(() => {});
        });
        setIsGeneratingAudio(false);
        return;
      }

      const response = await authFetch(`/api/personality/${personality.id}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voiceProfile: effectiveVoiceProfile, speechHint }),
      });

      if (!response.ok) {
        const payload = await readApiResponsePayload(response);
        const msg = getApiErrorMessage(response, payload, "Failed to generate speech.");
        throw new Error(msg);
      }

      const directedHeader = response.headers.get("X-Voxis-Directed-Text");
      const synthesisHeader = response.headers.get("X-Voxis-Synthesis-Text");
      const engineHeader = response.headers.get("X-Voxis-Tts-Engine");
      const adjustedVoiceHeader = response.headers.get("X-Voxis-Adjusted-Voice");
      const prosodyHeader = response.headers.get("X-Voxis-Prosody");
      const telemetryHeader = response.headers.get("X-Voxis-Tts-Telemetry");
      const realismChainHeader = response.headers.get("X-Voxis-Tts-Realism-Chain");
      const realismHeader = response.headers.get("X-Voxis-Tts-Realism");
      const sfxHeader = response.headers.get("X-Voxis-Tts-Sfx");
      let adjustedVoice = null;
      let prosodyEnvelope = null;
      let ttsTelemetry = null;
      let realismTelemetry = null;
      let ttsSfx = [];

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

      if (telemetryHeader) {
        try {
          ttsTelemetry = JSON.parse(decodeURIComponent(telemetryHeader));
        } catch {
          ttsTelemetry = null;
        }
      }

      if (realismHeader) {
        try {
          realismTelemetry = JSON.parse(decodeURIComponent(realismHeader));
        } catch {
          realismTelemetry = null;
        }
      }

      if (sfxHeader) {
        try {
          ttsSfx = JSON.parse(decodeURIComponent(sfxHeader));
        } catch {
          ttsSfx = [];
        }
      }

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
      
      const fallbackMood = parsedPersonalityMood || personality?.moodBaseline || {};
      const emotionFrame = ttsTelemetry?.emotionFrame || interpretEmotionSpectrum(fallbackMood);

      setDirectedPreview(directedHeader ? decodeURIComponent(directedHeader) : text);
      setPreviewTelemetry({
        engine: engineHeader || voiceProfile.engine || "auto",
        synthesisText: synthesisHeader ? decodeURIComponent(synthesisHeader) : null,
        adjustedVoice,
        prosodyEnvelope,
        emotionFrame,
        ttsTelemetry,
        realismChain: realismChainHeader ? decodeURIComponent(realismChainHeader) : null,
        realismTelemetry: realismTelemetry || ttsTelemetry?.realism || null,
      });

      if (ttsTelemetry?.fallbackUsed) {
        const fallbackFrom = String(ttsTelemetry.fallbackFrom || "primary engine");
        const chosenEngine = String(ttsTelemetry.chosenEngine || "fallback engine");
        onStatus?.({
          type: "success",
          message: `TTS fallback active: ${fallbackFrom} failed, switched to ${chosenEngine}.`,
        });
      }

      if (Array.isArray(ttsSfx) && ttsSfx.length > 0) {
        onStatus?.({
          type: "info",
          message: `SFX included: ${ttsSfx.join(", ")}`,
        });
      }

      const blob = await response.blob();
      setTtsCache(cacheKey, {
        blob,
        telemetry: ttsTelemetry,
        sfxTimeline: ttsSfx,
      });
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
        sfxVolume: Number(voiceProfile.sfxVolume ?? 0.85),
        realismEnabled: Boolean(voiceProfile.realismEnabled),
        realismPreset: String(voiceProfile.realismPreset || "conversational"),
      });

      if (syncMapOnProfileSave && selectedVoiceMapId) {
        const selectedMap = savedVoiceMaps.find((entry) => entry.id === selectedVoiceMapId) || null;
        const response = await authFetch("/api/settings/voice-maps", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: selectedVoiceMapId,
            createdAt: selectedMap?.createdAt || undefined,
            voiceName: String(selectedMap?.voiceName || voiceMapName || "").trim() || `${personality?.name || "Voice"} Voice`,
            linkedPersonalityId: personality?.id || null,
            linkedPersonalityName: personality?.name || "",
            voiceProfile,
          }),
        });
        const payload = await readApiResponsePayload(response);
        if (response.ok) {
          setSavedVoiceMaps(Array.isArray(payload?.maps) ? payload.maps : []);
          onStatus?.({ type: "success", message: "Profile saved and selected voice map updated." });
        }
      }
    } finally {
      setIsSavingVoice(false);
    }
  }

  async function handlePrefetchPersonaSfx() {
    if (!personality?.id) {
      return;
    }

    setIsPrefetchingSfx(true);
    try {
      const response = await authFetch("/api/sfx/prefetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personalityId: personality.id }),
      });
      const payload = await readApiResponsePayload(response);
      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, payload, "Failed to prefetch persona SFX."));
      }

      const fetched = Array.isArray(payload?.fetched) ? payload.fetched : [];
      const cached = Array.isArray(payload?.cached) ? payload.cached : [];
      const failed = Array.isArray(payload?.failed) ? payload.failed : [];

      const segments = [];
      if (fetched.length) segments.push(`downloaded: ${fetched.join(", ")}`);
      if (cached.length) segments.push(`already cached: ${cached.join(", ")}`);
      if (failed.length) segments.push(`failed: ${failed.map((item) => item.tag).join(", ")}`);

      onStatus?.({
        type: failed.length ? "warn" : "success",
        message: segments.length
          ? `Persona SFX prefetch complete (${segments.join(" | ")}).`
          : "Persona has no configured SFX tags to prefetch.",
      });
    } catch (error) {
      onStatus?.({ type: "error", message: error.message || "Failed to prefetch persona SFX." });
    } finally {
      setIsPrefetchingSfx(false);
    }
  }

  async function clearSavedProviderCredential(providerId) {
    const normalizedProvider = String(providerId || "").trim().toLowerCase();
    if (!normalizedProvider || !["elevenlabs", "cartesia"].includes(normalizedProvider)) {
      return;
    }

    const confirmed = window.confirm(
      `Release saved ${normalizedProvider === "elevenlabs" ? "ElevenLabs" : "Cartesia"} credential? You can enter a new API key right after this.`,
    );
    if (!confirmed) {
      return;
    }

    setIsClearingProviderCredential(true);
    try {
      const response = await authFetch(`/api/settings/tts/${encodeURIComponent(normalizedProvider)}`, {
        method: "DELETE",
      });
      const payload = await readApiResponsePayload(response);
      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, payload, `Failed to clear ${normalizedProvider} credential.`));
      }

      setProviderOptionsReloadToken((n) => n + 1);
      onStatus?.({
        type: "success",
        message: `${normalizedProvider === "elevenlabs" ? "ElevenLabs" : "Cartesia"} credential released. Open Settings to enter a new API key.`,
      });
      onOpenSettings?.();
    } catch (error) {
      onStatus?.({
        type: "error",
        message: error.message || `Failed to clear ${normalizedProvider} credential.`,
      });
    } finally {
      setIsClearingProviderCredential(false);
    }
  }

  async function extractProsodyTemplate({ useFile = false } = {}) {
    if (!personality?.id) {
      return;
    }

    if (useFile) {
      if (!hasProsodyFile) {
        onStatus?.({ type: "error", message: "Select an audio file first." });
        return;
      }
      if (Number(prosodyFile?.size || 0) > 20 * 1024 * 1024) {
        onStatus?.({ type: "error", message: "Audio file too large (max 20MB)." });
        return;
      }
    } else if (!prosodyUrl.trim()) {
      return;
    }

    setIsProsodyModalOpen(true);
    setProsodyModalError("");
    setProsodyProgressIndex(0);
    setIsExtractingProsody(true);
    const progressTimer = setInterval(() => {
      setProsodyProgressIndex((current) => Math.min(current + 1, PROSODY_PROGRESS_STEPS.length - 1));
    }, 1600);

    try {
      let requestBody;
      if (useFile) {
        onStatus?.({ type: "info", message: `Extracting prosody from '${prosodyFile.name}'...` });
        const dataUrl = await fileToDataUrl(prosodyFile);
        requestBody = {
          audioBase64: dataUrl,
          fileName: prosodyFile.name || "uploaded-audio",
        };
      } else {
        requestBody = {
          url: prosodyUrl.trim(),
        };
      }

      const response = await authFetch(`/api/personality/${personality.id}/prosody-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const payload = await readApiResponsePayload(response);

      if (!response.ok) {
        const baseMsg = getApiErrorMessage(response, payload, "Failed to extract prosody template.");
        const msg = response.status === 413
          ? `${baseMsg} The file is too large for the server to accept. Add 'client_max_body_size 30m;' to your nginx config and reload nginx (sudo systemctl reload nginx).`
          : baseMsg;
        throw new Error(msg);
      }

      onPersonalityUpdated?.(payload.personality);
      setVoiceSamples(payload.voiceSamples || payload.personality?.voiceSampleAnalysis || null);
      setProsodyProgressIndex(PROSODY_PROGRESS_STEPS.length - 1);
      onStatus?.({
        type: "success",
        message: `Prosody template extracted for ${payload.personality?.name || personality.name}.`,
      });
    } catch (error) {
      setProsodyModalError(error.message || "Failed to extract prosody template.");
      onStatus?.({ type: "error", message: error.message || "Failed to extract prosody template." });
    } finally {
      clearInterval(progressTimer);
      setIsExtractingProsody(false);
    }
  }

  function sliderStyle(val, min, max) {
    const pct = ((val - min) / (max - min)) * 100;
    return { background: `linear-gradient(90deg, var(--accent) ${pct}%, rgba(0,180,255,0.14) ${pct}%)` };
  }

  async function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read selected audio file."));
      reader.readAsDataURL(file);
    });
  }

  async function saveVoiceMap() {
    const normalizedName = String(voiceMapName || "").trim();
    if (!normalizedName) {
      onStatus?.({ type: "error", message: "Voice map name is required." });
      return;
    }

    setIsSavingVoiceMap(true);
    try {
      const existing = savedVoiceMaps.find((entry) => entry.id === selectedVoiceMapId) || null;
      const response = await authFetch("/api/settings/voice-maps", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: existing?.id || undefined,
          createdAt: existing?.createdAt || undefined,
          voiceName: normalizedName,
          linkedPersonalityId: personality?.id || null,
          linkedPersonalityName: personality?.name || "",
          voiceProfile,
        }),
      });
      const payload = await readApiResponsePayload(response);
      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, payload, "Failed to save voice map."));
      }

      const maps = Array.isArray(payload?.maps) ? payload.maps : [];
      setSavedVoiceMaps(maps);
      if (payload?.savedId) {
        setSelectedVoiceMapId(payload.savedId);
      }
      onStatus?.({ type: "success", message: `Saved voice map '${normalizedName}'.` });
    } catch (error) {
      onStatus?.({ type: "error", message: error.message || "Failed to save voice map." });
    } finally {
      setIsSavingVoiceMap(false);
    }
  }

  function applyVoiceMap(id) {
    const map = savedVoiceMaps.find((entry) => entry.id === id);
    if (!map?.voiceProfile || typeof map.voiceProfile !== "object") {
      return;
    }

    const incoming = map.voiceProfile;
    setVoiceProfile((current) => ({
      ...current,
      ...incoming,
      engine: normalizeVoiceEngineForDebug(incoming.engine || current.engine || "auto"),
    }));
    setSelectedVoiceMapId(id);
    setVoiceMapName(String(map.voiceName || ""));
    onStatus?.({ type: "info", message: `Applied voice map '${map.voiceName}'.` });
  }

  async function deleteVoiceMap() {
    if (!selectedVoiceMapId) return;
    setIsDeletingVoiceMap(true);
    try {
      const response = await authFetch(`/api/settings/voice-maps/${encodeURIComponent(selectedVoiceMapId)}`, {
        method: "DELETE",
      });
      const payload = await readApiResponsePayload(response);
      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, payload, "Failed to delete voice map."));
      }

      setSavedVoiceMaps(Array.isArray(payload?.maps) ? payload.maps : []);
      setSelectedVoiceMapId("");
      onStatus?.({ type: "success", message: "Deleted saved voice map." });
    } catch (error) {
      onStatus?.({ type: "error", message: error.message || "Failed to delete voice map." });
    } finally {
      setIsDeletingVoiceMap(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────
  if (!personality) {
    return (
      <>
        <style>{voiceLabStyles}</style>
        <div className="vlab-shell house-control-panel">
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
      <div className="vlab-shell house-control-panel">

        {/* ── Header ── */}
        <div className="vlab-header">
          <div className="vlab-eyebrow">
            <span className="vlab-eyebrow-dot" />
            VOICE SYNTHESIS MODULE
          </div>
          <h3 className="vlab-title">{personality.name} // VOICE LAB</h3>
          {/* Meta pills moved to always-visible gentle bar above the tree */}
        </div>

        {/* ── Tab Bar ── */}
        <div className="vlab-tab-bar">
          <button
            type="button"
            className={`vlab-tab-btn ${vlabTab === "config" ? "active" : ""}`}
            onClick={() => setVlabTab("config")}
          >
            ◈ VOICE CONFIG
          </button>
          <button
            type="button"
            className={`vlab-tab-btn ${vlabTab === "clone" ? "active" : ""}`}
            onClick={() => setVlabTab("clone")}
          >
            ◈ VOICE CLONE
          </button>
        </div>

        {/* ── Permanent gentle status bar (house palette) ── */}
        <div className="house-status-bar">
          <span className={`pill ${voiceProfile.enabled ? "on" : ""}`}>
            {voiceProfile.enabled ? "● VOICE ON" : "○ VOICE OFF"}
          </span>
          <span className="pill">ENG:{voiceProfile.engine.toUpperCase()}</span>
          <span className="pill">PITCH:{Number(voiceProfile.pitch).toFixed(2)}</span>
          <span className="pill">RATE:{Number(voiceProfile.rate).toFixed(2)}</span>
          {voiceProfile.realismEnabled ? (
            <span className="pill pink">REALISM:{String(voiceProfile.realismPreset || "conversational").toUpperCase()}</span>
          ) : (
            <span className="pill">REALISM:OFF</span>
          )}
          {voiceProfile.autoplay && <span className="pill pink">AUTOPLAY</span>}
        </div>

        {/* ── Voice Clone Tab ── */}
        {vlabTab === "clone" && (
          <VoiceCloneTab personality={personality} onStatus={onStatus} />
        )}

        {/* ── NEW TREE + SPLIT for CONFIG (house colors + requested layout) ── */}
        {vlabTab === "config" && (
          <div className="house-split">
            {/* LEFT: Tree navigation */}
            <div className="house-tree">
              <div className="house-tree-root">VOICE LAB</div>

              {voiceTree.map((parent) => {
                const isExpanded = expandedVoiceSections.has(parent.id);
                const isActiveParent = voiceTree
                  .find((p) => p.children?.some((c) => c.id === selectedVoiceSection))
                  ?.id === parent.id;

                return (
                  <div key={parent.id}>
                    <button
                      type="button"
                      className={`house-tree-parent ${isExpanded ? "expanded" : ""} ${isActiveParent ? "active-parent" : ""}`}
                      onClick={() => toggleVoiceParent(parent.id)}
                    >
                      <span className="chev">▶</span>
                      {parent.label}
                    </button>

                    {isExpanded && (
                      <div className="house-tree-children">
                        {parent.children.map((child) => {
                          const isSelected = selectedVoiceSection === child.id;
                          return (
                            <button
                              key={child.id}
                              type="button"
                              className={`house-tree-child ${isSelected ? "selected" : ""}`}
                              onClick={() => selectVoiceSection(child.id, parent.id)}
                            >
                              {child.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* RIGHT: Content for selected section */}
            <div className="house-content">
              {renderVoiceContent(selectedVoiceSection)}
            </div>
          </div>
        )}

        {/* ── Voice Config Body (existing linear content hidden in favor of tree for now) ── */}
        <div className="vlab-body" style={{ display: "none" }}>

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
                  onChange={(e) => updateVoiceField("engine", normalizeVoiceEngineForDebug(e.target.value))}
                >
                  {TTS_DEBUG_PROVIDER_LOCK ? (
                    <>
                      <option value="auto">auto (cartesia -&gt; kokoro)</option>
                      <option value="kokoro">kokoro (free local)</option>
                      <option value="openvoice">openvoice (voice clone)</option>
                      <option value="kokoro-rvc">kokoro + rvc (voice pack)</option>
                      <option value="cartesia">cartesia (saved key)</option>
                    </>
                  ) : (
                    <>
                      <option value="auto">auto (elevenlabs -&gt; cartesia -&gt; cloud -&gt; piper -&gt; kokoro)</option>
                      <option value="cloud">cloud</option>
                      <option value="piper">piper</option>
                      <option value="kokoro">kokoro (free local)</option>
                      <option value="openvoice">openvoice (voice clone)</option>
                      <option value="kokoro-rvc">kokoro + rvc (voice pack)</option>
                      <option value="elevenlabs">elevenlabs (saved key)</option>
                      <option value="cartesia">cartesia (saved key)</option>
                    </>
                  )}
                </select>
                {voiceProfile.engine === "cartesia" ? (
                  <small className="vlab-small">
                    Note: Cartesia on this path does not expose native numeric pitch control. Pitch slider is kept for cross-engine consistency.
                  </small>
                ) : null}
              </div>

              {/* ── Warning: LLM provider doesn't support audio ── */}
              {(voiceProfile.engine === "auto" || voiceProfile.engine === "cloud") &&
               llmProvider && llmProvider !== "openai" ? (
                <div className="vlab-callout warn">
                  <div className="vlab-callout-head">
                    <div>
                      <p className="vlab-callout-title">⚠ TTS action required — {llmProvider} doesn&apos;t handle audio</p>
                      <p className="vlab-callout-copy">
                        Your LLM is connected via <strong>{llmProvider}</strong>, which routes text completions only — it has no audio/speech endpoint.
                        The <strong>cloud</strong> TTS path needs a direct <strong>OpenAI API key</strong>
                        {" "}(separate from your LLM key) to synthesise voice. Your options:
                      </p>
                      <ul style={{ margin: "8px 0 0 0", paddingLeft: 18, fontSize: "0.78rem", lineHeight: 1.65, color: "#87a8b9" }}>
                        <li><strong style={{ color: "#fcd34d" }}>Kokoro (recommended):</strong> Switch the engine to <em>kokoro</em> above — free, runs locally, no key needed.</li>
                        <li><strong style={{ color: "#fcd34d" }}>ElevenLabs / Cartesia:</strong> Switch to one of those engines and paste your API key below.</li>
                        <li><strong style={{ color: "#fcd34d" }}>OpenAI TTS key:</strong> Add <code style={{ background: "rgba(255,255,255,0.07)", padding: "1px 4px", borderRadius: 4 }}>TTS_API_KEY=sk-…</code> to <em>backend/.env</em> (requires server restart).</li>
                      </ul>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* ── Info: dedicated TTS providers are independent of LLM ── */}
              {(voiceProfile.engine === "elevenlabs" || voiceProfile.engine === "cartesia") ? (
                <div className="vlab-callout ok">
                  <div className="vlab-callout-head">
                    <div>
                      <p className="vlab-callout-title">✓ Fully independent of your LLM provider</p>
                      <p className="vlab-callout-copy">
                        <strong>{voiceProfile.engine === "elevenlabs" ? "ElevenLabs" : "Cartesia"}</strong> uses its own API key and speaks directly to the provider&apos;s audio endpoint.
                        Your LLM provider ({llmProvider || "current LLM"}) is never contacted for voice — the two services operate in separate lanes.
                        Manage your {voiceProfile.engine === "elevenlabs" ? "ElevenLabs" : "Cartesia"} key in <em>Settings</em>, not inside Voice Lab.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* ── Info: Kokoro — free local, no key needed ── */}
              {voiceProfile.engine === "kokoro" ? (
                <div className="vlab-callout ok">
                  <div className="vlab-callout-head">
                    <div>
                      <p className="vlab-callout-title">✓ Free local engine — no provider billing key required</p>
                      <p className="vlab-callout-copy">
                        Kokoro runs the 82 M ONNX model on your server. It does not require a paid TTS provider key and works regardless of your LLM provider.
                        On restricted hosts, the model download from HuggingFace may require a token for first-time cache warmup.
                        {" "}If you have a local Kokoro model (e.g., at x:\\kokoro), configure the path in <strong>Settings → Kokoro Access</strong> to use it instead of downloading.
                      </p>
                    </div>
                    {onOpenSettings ? (
                      <button type="button" className="vlab-btn sec" onClick={onOpenSettings}>
                        Open Settings
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="vlab-callout">
                <div className="vlab-callout-head">
                  <div>
                    <p className="vlab-callout-title">Runtime Voice Options Moved</p>
                    <p className="vlab-callout-copy">
                      Global routing, provider API keys, and optional Kokoro access now live under <strong>Settings</strong> so Voice Lab stays focused on per-character tuning.
                    </p>
                  </div>
                  {onOpenSettings ? (
                    <button type="button" className="vlab-btn sec" onClick={onOpenSettings}>
                      Open Settings
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="vlab-field">
                <div className="vlab-label-row">
                  <label htmlFor={activeVoiceFieldId}>
                    {voiceFieldLabel}
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
                      id="vlab-voice"
                      name="vlabPiperVoice"
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
                    {isLoadingKokoroVoices ? (
                      <div className="vlab-small" style={{ padding: "8px 0" }}>LOADING KOKORO VOICES...</div>
                    ) : kokoroVoices.length === 0 ? (
                      <div className="vlab-small" style={{ padding: "8px 0" }}>
                        {kokoroVoiceError || "No Kokoro voices loaded"}
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        {kokoroVoices.map((voice) => {
                          const isSelected = (voiceProfile.kokoroVoice || "") === voice.id;
                          return (
                            <div
                              key={voice.id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                padding: "6px 10px",
                                borderRadius: "8px",
                                border: isSelected
                                  ? "1px solid rgba(0,234,255,0.45)"
                                  : "1px solid rgba(0,180,255,0.12)",
                                background: isSelected
                                  ? "rgba(0,234,255,0.07)"
                                  : "rgba(6,14,28,0.5)",
                                cursor: "pointer",
                              }}
                              onClick={() => {
                                updateVoiceField("kokoroVoice", voice.id);
                                updateVoiceField("providerVoice", voice.id);
                                updateVoiceField("preferredVoice", voice.id);
                              }}
                            >
                              <span style={{ flex: 1, fontSize: "0.85rem", color: isSelected ? "#00eaff" : "#dcf7ff" }}>
                                {voice.label}
                              </span>
                              <button
                                type="button"
                                title={`Preview ${voice.label}`}
                                disabled={isGeneratingAudio}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  generateAudio(
                                    "Hello! This is a quick voice preview so you can hear how I sound.",
                                    { kokoroVoice: voice.id, providerVoice: voice.id, preferredVoice: voice.id },
                                    "voice preview",
                                  );
                                }}
                                style={{
                                  flexShrink: 0,
                                  padding: "3px 9px",
                                  borderRadius: "999px",
                                  border: "1px solid rgba(0,234,255,0.25)",
                                  background: "rgba(0,234,255,0.07)",
                                  color: "#00eaff",
                                  fontSize: "0.7rem",
                                  fontWeight: 700,
                                  cursor: isGeneratingAudio ? "not-allowed" : "pointer",
                                  opacity: isGeneratingAudio ? 0.4 : 1,
                                  letterSpacing: "0.05em",
                                }}
                              >
                                ▶
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <small className="vlab-small" style={{ marginTop: "4px", display: "block" }}>
                      {kokoroVoiceError || "Click a voice to select it. Press ▶ to hear a quick preview."}
                    </small>
                  </>
                ) : voiceProfile.engine === "elevenlabs" ? (
                  <>
                    <select
                      id="vlab-voice"
                      name="vlabElevenLabsVoice"
                      className="vlab-select"
                      value={selectedVoiceOption}
                      onChange={(e) => {
                        const next = e.target.value;
                        if (next === CUSTOM_OPTION) {
                          updateVoiceField("elevenLabsVoiceId", "");
                          updateVoiceField("providerVoice", "");
                          updateVoiceField("preferredVoice", "");
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
                        id="vlab-voice-custom"
                        name="vlabElevenLabsVoiceCustom"
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
                    {providerAuthError ? (
                      <div className="vlab-inline-actions" style={{ marginTop: 8 }}>
                        <button
                          type="button"
                          className="vlab-btn sec"
                          onClick={() => void clearSavedProviderCredential("elevenlabs")}
                          disabled={isClearingProviderCredential}
                        >
                          {isClearingProviderCredential ? "Releasing..." : "Release saved key"}
                        </button>
                        {onOpenSettings ? (
                          <button
                            type="button"
                            className="vlab-btn sec"
                            onClick={onOpenSettings}
                            disabled={isClearingProviderCredential}
                          >
                            Enter new key in Settings
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                ) : voiceProfile.engine === "cartesia" ? (
                  <>
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      <select
                        id="vlab-voice"
                        name="vlabCartesiaVoice"
                        className="vlab-select"
                        style={{ flex: 1 }}
                        value={selectedVoiceOption}
                        onChange={(e) => {
                          const next = e.target.value;
                          // Stop any playing sample when switching voices
                          if (voiceSampleAudioRef.current) {
                            voiceSampleAudioRef.current.pause();
                            voiceSampleAudioRef.current.currentTime = 0;
                          }
                          setCartesiaPreviewPlaying(false);
                          if (next === CUSTOM_OPTION) {
                            updateVoiceField("cartesiaVoiceId", "");
                            updateVoiceField("providerVoice", "");
                            updateVoiceField("preferredVoice", "");
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
                      {cartesiaVoicePreviewUrl ? (
                        <button
                          type="button"
                          title={cartesiaPreviewPlaying ? "Stop sample" : "Play voice sample (free — no tokens)"}
                          className="vlab-btn sec"
                          style={{ flexShrink: 0, padding: "0 11px", fontSize: "1rem", minHeight: "36px" }}
                          onClick={() => {
                            if (cartesiaPreviewPlaying) {
                              if (voiceSampleAudioRef.current) {
                                voiceSampleAudioRef.current.pause();
                                voiceSampleAudioRef.current.currentTime = 0;
                              }
                              setCartesiaPreviewPlaying(false);
                              return;
                            }
                            if (voiceSampleAudioRef.current) {
                              voiceSampleAudioRef.current.pause();
                            }
                            const audio = new Audio(cartesiaVoicePreviewUrl);
                            voiceSampleAudioRef.current = audio;
                            audio.onended = () => setCartesiaPreviewPlaying(false);
                            audio.onerror = () => setCartesiaPreviewPlaying(false);
                            audio.play()
                              .then(() => setCartesiaPreviewPlaying(true))
                              .catch(() => setCartesiaPreviewPlaying(false));
                          }}
                        >
                          {cartesiaPreviewPlaying ? "■" : "▶"}
                        </button>
                      ) : null}
                    </div>
                    {selectedVoiceOption === CUSTOM_OPTION ? (
                      <input
                        id="vlab-voice-custom"
                        name="vlabCartesiaVoiceCustom"
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
                      {getProviderVoiceHelpText("cartesia", activeProviderOptions)}
                    </small>
                    {providerAuthError ? (
                      <div className="vlab-inline-actions" style={{ marginTop: 8 }}>
                        <button
                          type="button"
                          className="vlab-btn sec"
                          onClick={() => void clearSavedProviderCredential("cartesia")}
                          disabled={isClearingProviderCredential}
                        >
                          {isClearingProviderCredential ? "Releasing..." : "Release saved key"}
                        </button>
                        {onOpenSettings ? (
                          <button
                            type="button"
                            className="vlab-btn sec"
                            onClick={onOpenSettings}
                            disabled={isClearingProviderCredential}
                          >
                            Enter new key in Settings
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                    <small className="vlab-small">
                      The ▶ sample button plays Cartesia's provider demo clip for that voice id only. Use GENERATE SAMPLE below to test your saved rate/prosody path.
                    </small>
                  </>
                ) : (
                  <>
                    <select
                      id="vlab-voice"
                      name="vlabCloudVoice"
                      className="vlab-select"
                      value={selectedCloudVoiceOption}
                      onChange={(e) => {
                        const next = e.target.value;
                        if (next === CUSTOM_OPTION) {
                          updateVoiceField("providerVoice", "");
                          updateVoiceField("preferredVoice", "");
                          return;
                        }
                        updateVoiceField("providerVoice", next);
                        updateVoiceField("preferredVoice", next);
                      }}
                    >
                      <option value="" disabled>Select a cloud voice</option>
                      {CLOUD_VOICE_PRESETS.map((voice) => (
                        <option key={voice.id || CUSTOM_OPTION} value={voice.id || CUSTOM_OPTION}>{voice.label}</option>
                      ))}
                    </select>
                    {selectedCloudVoiceOption === CUSTOM_OPTION ? (
                      <input
                        id="vlab-voice-custom"
                        name="vlabCloudVoiceCustom"
                        className="vlab-input"
                        value={voiceProfile.providerVoice || voiceProfile.preferredVoice || ""}
                        onChange={(e) => {
                          updateVoiceField("providerVoice", e.target.value);
                          updateVoiceField("preferredVoice", e.target.value);
                        }}
                        placeholder="alloy"
                      />
                    ) : null}
                    <small className="vlab-small">
                      {voiceProfile.engine === "kokoro" || voiceProfile.engine === "piper"
                        ? "Used if voice synthesis needs to fall back to cloud from this engine."
                        : "OpenAI-compatible cloud voice selection."}
                    </small>
                  </>
                )}
              </div>

              <div className="vlab-field">
                <div className="vlab-label-row">
                  <label htmlFor={activeModelFieldId}>{modelFieldLabel}</label>
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
                      name="vlabProviderModel"
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
                        id="vlab-model-custom"
                        name={selectedProviderId === "elevenlabs" ? "vlabElevenLabsModelCustom" : "vlabCartesiaModelCustom"}
                        className="vlab-input"
                        value={activeModelValue}
                        onChange={(e) => {
                          if (selectedProviderId === "elevenlabs") {
                            updateVoiceField("elevenLabsModel", e.target.value);
                          } else {
                            updateVoiceField("cartesiaModel", e.target.value);
                          }
                        }}
                        placeholder={selectedProviderId === "elevenlabs" ? "eleven_multilingual_v2" : "sonic-3"}
                      />
                    ) : null}
                    {selectedProviderId === "cartesia" ? (
                      <div className="vlab-inline-actions" style={{ marginTop: 4 }}>
                        {CARTESIA_MODEL_QUICK_PICKS.map((modelId) => (
                          <button
                            key={modelId}
                            type="button"
                            className="vlab-reload-btn"
                            onClick={() => updateVoiceField("cartesiaModel", modelId)}
                          >
                            {modelId}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="vlab-reload-btn"
                          onClick={() => updateVoiceField("cartesiaModel", "")}
                        >
                          Custom model id
                        </button>
                      </div>
                    ) : null}
                    <small className="vlab-small">
                      {getProviderModelHelpText(selectedProviderId, activeProviderOptions)}
                    </small>
                  </>
                ) : supportsCloudModelCatalog ? (
                  <>
                    <select
                      id="vlab-model"
                      name="vlabProviderModel"
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
                        id="vlab-model-custom"
                        name="vlabProviderModelCustom"
                        className="vlab-input"
                        value={voiceProfile.providerModel || ""}
                        onChange={(e) => updateVoiceField("providerModel", e.target.value)}
                        placeholder="gpt-4o-mini-tts"
                      />
                    ) : null}
                    <small className="vlab-small">
                      {cloudModelError || (voiceProfile.engine === "kokoro" || voiceProfile.engine === "piper"
                        ? "Used if voice synthesis needs to fall back to cloud from this engine."
                        : "Auto-loaded from Runtime LLM provider model list.")}
                    </small>
                  </>
                ) : (
                  <input
                    id="vlab-model"
                    name="vlabProviderModel"
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
                      name="vlabPiperPath"
                      className="vlab-input"
                      value={voiceProfile.piperModelPath}
                      onChange={(e) => updateVoiceField("piperModelPath", e.target.value)}
                      placeholder="/opt/piper/models/en_US-lessac-medium.onnx"
                    />
                  </div>

                  <div className="vlab-field">
                    <label htmlFor="vlab-piper-speaker">
                      {selectedPiperVoice?.speakers?.length > 1 ? "Speaker" : "Speaker ID (optional)"}
                    </label>
                    {selectedPiperVoice?.speakers?.length > 1 ? (
                      <select
                        id="vlab-piper-speaker"
                        name="vlabPiperSpeaker"
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
                        id="vlab-piper-speaker"
                        name="vlabPiperSpeaker"
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
                    <label htmlFor="vlab-stability">Stability</label>
                    <div className="vlab-slider-row">
                      <input
                        id="vlab-stability"
                        name="vlabStability"
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
                    <label htmlFor="vlab-similarity">Similarity Boost</label>
                    <div className="vlab-slider-row">
                      <input
                        id="vlab-similarity"
                        name="vlabSimilarityBoost"
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
                    <label htmlFor="vlab-style">Style</label>
                    <div className="vlab-slider-row">
                      <input
                        id="vlab-style"
                        name="vlabStyle"
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
                <label htmlFor="vlab-pitch">Pitch Modifier</label>
                <div className="vlab-slider-row">
                  <input
                    id="vlab-pitch"
                    name="vlabPitch"
                    type="range"
                    className="vlab-slider"
                    min="0.5" max="1.6" step="0.05"
                    value={voiceProfile.pitch}
                    onChange={(e) => updateVoiceField("pitch", Number(e.target.value))}
                    style={sliderStyle(voiceProfile.pitch, 0.5, 1.6)}
                  />
                  <span className="vlab-slider-readout">{Number(voiceProfile.pitch).toFixed(2)}×</span>
                </div>
                {voiceProfile.engine === "cartesia" ? (
                  <small className="vlab-small">
                    Cartesia currently does not expose native numeric pitch control in this path. Use voice selection, model, prosody shaping, and rate changes for audible tuning.
                  </small>
                ) : null}
              </div>
              <div className="vlab-field">
                <label htmlFor="vlab-rate">Rate Modifier</label>
                <div className="vlab-slider-row">
                  <input
                    id="vlab-rate"
                    name="vlabRate"
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
              <div className="vlab-field">
                <label htmlFor="vlab-sfx-volume">SFX Volume</label>
                <div className="vlab-slider-row">
                  <input
                    id="vlab-sfx-volume"
                    name="vlabSfxVolume"
                    type="range"
                    className="vlab-slider"
                    min="0" max="1" step="0.05"
                    value={Number(voiceProfile.sfxVolume ?? 0.85)}
                    onChange={(e) => updateVoiceField("sfxVolume", Number(e.target.value))}
                    style={sliderStyle(Number(voiceProfile.sfxVolume ?? 0.85), 0, 1)}
                  />
                  <span className="vlab-slider-readout">{Math.round(Number(voiceProfile.sfxVolume ?? 0.85) * 100)}%</span>
                </div>
                <small className="vlab-small">
                  Controls non-verbal persona effects (burp / braap / urrrp variants, giggle, evil chuckle, fart, etc.) for this persona.
                </small>
              </div>
              <div className="vlab-field">
                <label htmlFor="vlab-realism-enabled">Realism Post-Processing</label>
                <label className="vlab-toggle" htmlFor="vlab-realism-enabled" style={{ marginTop: 4 }}>
                  <input
                    id="vlab-realism-enabled"
                    name="vlabRealismEnabled"
                    type="checkbox"
                    checked={Boolean(voiceProfile.realismEnabled)}
                    onChange={(e) => updateVoiceField("realismEnabled", e.target.checked)}
                  />
                  <span className="vlab-toggle-track" />
                  <span className="vlab-toggle-label">Enable ffmpeg realism chain</span>
                </label>
                <small className="vlab-small">
                  Adds loudness normalization, compression, and high-frequency taming after TTS synthesis.
                </small>
              </div>
              <div className="vlab-field">
                <label htmlFor="vlab-realism-preset">Realism Preset</label>
                <select
                  id="vlab-realism-preset"
                  name="vlabRealismPreset"
                  className="vlab-select"
                  value={voiceProfile.realismPreset || "conversational"}
                  onChange={(e) => updateVoiceField("realismPreset", e.target.value)}
                  disabled={!voiceProfile.realismEnabled}
                >
                  {REALISM_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>{preset.label}</option>
                  ))}
                </select>
                <small className="vlab-small">
                  {REALISM_PRESETS.find((preset) => preset.id === (voiceProfile.realismPreset || "conversational"))?.description || "Balanced cleanup for everyday dialogue."}
                </small>
              </div>
            </div>
          </div>

          {/* ── Voice Flags ── */}
          <div className="vlab-section">
            <div className="vlab-section-label">◈ VOICE FLAGS</div>
            <div className="vlab-toggle-row">
              <label className="vlab-toggle">
                <input
                  name="vlabVoiceEnabled"
                  type="checkbox"
                  checked={voiceProfile.enabled}
                  onChange={(e) => updateVoiceField("enabled", e.target.checked)}
                />
                <span className="vlab-toggle-track" />
                <span className="vlab-toggle-label">Enable voice playback</span>
              </label>
              <label className="vlab-toggle">
                <input
                  name="vlabVoiceAutoplay"
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
                  onClick={() => void extractProsodyTemplate({ useFile: false })}
                  disabled={isExtractingProsody || !prosodyUrl.trim()}
                >
                  {isExtractingProsody ? "EXTRACTING…" : "EXTRACT PROSODY"}
                </button>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(event) => {
                    const nextFile = event.target.files?.[0] || null;
                    setProsodyFile(nextFile);
                    if (nextFile) {
                      onStatus?.({ type: "info", message: `Selected audio file: ${nextFile.name}` });
                    }
                  }}
                  style={{ maxWidth: 280 }}
                />
                <button
                  type="button"
                  className="vlab-btn sec"
                  onClick={() => void extractProsodyTemplate({ useFile: true })}
                  disabled={isExtractingProsody || !hasProsodyFile}
                >
                  {isExtractingProsody ? "EXTRACTING…" : "EXTRACT FROM FILE"}
                </button>
                {Array.isArray(voiceSamples?.representatives) && voiceSamples.representatives.length > 0 ? (
                  <button
                    type="button"
                    className="vlab-btn sec"
                    onClick={() => {
                      setProsodyModalError("");
                      setIsProsodyModalOpen(true);
                    }}
                  >
                    REVIEW VOICES
                  </button>
                ) : null}
              </div>
              <div className="vlab-small">
                Downloads source audio, extracts cadence/rhythm template, attaches it to this persona, and removes temp audio.
              </div>
              {prosodyFile ? (
                <div className="vlab-small">
                  Selected file: <strong>{prosodyFile.name}</strong> ({Math.round(prosodyFile.size / 1024)} KB)
                </div>
              ) : null}
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
                  {previewTelemetry?.synthesisText ? (
                    <>
                      {" "}
                      | Engine input: <strong>{String(previewTelemetry.synthesisText)}</strong>
                    </>
                  ) : null}
                  {previewTelemetry?.ttsTelemetry?.engineControls?.experimentalControls ? (
                    <>
                      {" "}
                      | Cartesia controls: {JSON.stringify(previewTelemetry.ttsTelemetry.engineControls.experimentalControls)}
                    </>
                  ) : null}
                  {previewTelemetry?.realismTelemetry ? (
                    <>
                      {" "}
                      | Realism: {String(previewTelemetry.realismTelemetry.chain || previewTelemetry.realismChain || "disabled")}
                      {previewTelemetry.realismTelemetry.applied === false && previewTelemetry.realismTelemetry.error
                        ? ` (${String(previewTelemetry.realismTelemetry.error)})`
                        : ""}
                    </>
                  ) : previewTelemetry?.realismChain ? (
                    <>
                      {" "}
                      | Realism: {String(previewTelemetry.realismChain)}
                    </>
                  ) : null}
                  {previewTelemetry?.emotionFrame ? (
                    <>
                      {" "}
                      | Emotion: {String(previewTelemetry.emotionFrame.displayLabel || "Neutral")} | Zone:
                      {` ${String(previewTelemetry.emotionFrame.zone?.label || "Green Zone")}`} | Emotional Intensity:
                      {` ${Math.round(Number(previewTelemetry.emotionFrame.intensity || 0) * 100)}%`}
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {/* ── Voice Sample Selection ── */}
          {isProsodyModalOpen ? (
            <div
              className="vlab-modal-overlay"
              onClick={() => {
                if (!isExtractingProsody) {
                  setIsProsodyModalOpen(false);
                }
              }}
            >
              <div className="vlab-modal" onClick={(event) => event.stopPropagation()}>
                <div className="vlab-modal-header">
                  <div>
                    <h4 className="vlab-modal-title">Prosody Extraction</h4>
                    <p className="vlab-modal-copy">
                      Track extraction progress, preview isolated voices, and choose the voice that best matches this persona.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="vlab-modal-close"
                    onClick={() => setIsProsodyModalOpen(false)}
                    disabled={isExtractingProsody}
                  >
                    Close
                  </button>
                </div>

                {(isExtractingProsody || prosodyModalError) ? (
                  <div className="vlab-progress-panel">
                    {PROSODY_PROGRESS_STEPS.map((step, index) => {
                      const stateClass = index < prosodyProgressIndex
                        ? "done"
                        : index === prosodyProgressIndex
                          ? "active"
                          : "";
                      return (
                        <div key={step} className={`vlab-progress-step ${stateClass}`.trim()}>
                          <span className="vlab-progress-dot" />
                          {step}
                        </div>
                      );
                    })}
                    {prosodyModalError ? (
                      <div className="vlab-small" style={{ color: "#ff8d8d" }}>
                        {prosodyModalError}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {voiceSamples ? (
                  <VoiceSampleSelector
                    personality={personality}
                    voiceSamples={voiceSamples}
                    isLoading={isExtractingProsody}
                    onSampleSelected={(updatedPersonality) => {
                      onPersonalityUpdated?.(updatedPersonality);
                      setVoiceSamples(updatedPersonality?.voiceSampleAnalysis || voiceSamples);
                      setIsProsodyModalOpen(false);
                    }}
                    onStatus={onStatus}
                  />
                ) : !isExtractingProsody && !prosodyModalError ? (
                  <div className="vlab-small">No representative voices were detected from the source.</div>
                ) : null}
              </div>
            </div>
          ) : null}

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
            <div className="vlab-grid" style={{ marginBottom: 8 }}>
              <div className="vlab-field">
                <label htmlFor="vlab-voice-map-name">Saved Voice Map Name</label>
                <input
                  id="vlab-voice-map-name"
                  className="vlab-input"
                  value={voiceMapName}
                  onChange={(event) => setVoiceMapName(event.target.value)}
                  placeholder="e.g. Dark Ara Whisper"
                />
              </div>
              <div className="vlab-field">
                <label htmlFor="vlab-voice-map-select">Saved Voice Maps (sorted by name)</label>
                <select
                  id="vlab-voice-map-select"
                  className="vlab-select"
                  value={selectedVoiceMapId}
                  onChange={(event) => {
                    const nextId = String(event.target.value || "");
                    setSelectedVoiceMapId(nextId);
                    if (nextId) {
                      const map = savedVoiceMaps.find((entry) => entry.id === nextId);
                      if (map?.voiceName) {
                        setVoiceMapName(map.voiceName);
                      }
                    }
                  }}
                  disabled={isLoadingVoiceMaps}
                >
                  <option value="">{isLoadingVoiceMaps ? "Loading maps..." : "Select a saved voice map"}</option>
                  {savedVoiceMaps.map((map) => (
                    <option key={map.id} value={map.id}>
                      {map.voiceName}
                      {String(map.id || "") === recommendedVoiceMapId ? " ★" : ""}
                      {map.linkedPersonalityName ? ` - ${map.linkedPersonalityName}` : ""}
                    </option>
                  ))}
                </select>
                {recommendedVoiceMapId ? (
                  <div className="vlab-small">★ Recommended for current voice/persona</div>
                ) : null}
              </div>
            </div>
            <div className="vlab-toggle-row" style={{ marginBottom: 8 }}>
              <label className="vlab-toggle">
                <input
                  type="checkbox"
                  checked={syncMapOnProfileSave}
                  onChange={(event) => setSyncMapOnProfileSave(event.target.checked)}
                />
                <span className="vlab-toggle-track" />
                <span className="vlab-toggle-label">When saving profile, also update selected voice map</span>
              </label>
            </div>
            <div className="vlab-actions">
              <button
                type="button"
                className="vlab-btn sec"
                onClick={() => void saveVoiceMap()}
                disabled={isSavingVoiceMap || !voiceMapName.trim()}
              >
                {isSavingVoiceMap ? "SAVING MAP…" : "SAVE VOICE MAP"}
              </button>
              <button
                type="button"
                className="vlab-btn sec"
                onClick={() => applyVoiceMap(selectedVoiceMapId)}
                disabled={!selectedVoiceMapId}
              >
                APPLY VOICE MAP
              </button>
              <button
                type="button"
                className="vlab-btn sec"
                onClick={() => void deleteVoiceMap()}
                disabled={!selectedVoiceMapId || isDeletingVoiceMap}
              >
                {isDeletingVoiceMap ? "DELETING…" : "DELETE VOICE MAP"}
              </button>
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
              <button
                type="button"
                className="vlab-btn sec"
                onClick={() => void handlePrefetchPersonaSfx()}
                disabled={isPrefetchingSfx || !personality?.id}
              >
                {isPrefetchingSfx ? "PREFETCHING SFX…" : "⬇ PREFETCH PERSONA SFX"}
              </button>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
