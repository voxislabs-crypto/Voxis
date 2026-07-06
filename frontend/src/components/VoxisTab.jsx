import { useEffect, useMemo, useRef, useState } from "react";

import { useAuthFetch } from "../hooks/useAuthFetch.js";

const forgeStyles = `
  .forge {
    position: relative;
    min-height: 720px;
    border-radius: 24px;
    background:
      radial-gradient(ellipse 70% 55% at 50% 50%, rgba(38, 255, 255, 0.05), transparent 70%),
      radial-gradient(ellipse 60% 50% at 90% 0%, rgba(255, 43, 214, 0.10), transparent 70%),
      radial-gradient(ellipse 60% 50% at 0% 100%, rgba(38, 255, 255, 0.10), transparent 70%),
      linear-gradient(180deg, #050015 0%, #07041c 40%, #04020f 100%);
    border: 1px solid rgba(255, 43, 214, 0.18);
    box-shadow: 0 30px 80px rgba(255, 43, 214, 0.08), 0 0 0 1px rgba(38, 255, 255, 0.04) inset;
    color: #f5e9ff;
    overflow: hidden;
    isolation: isolate;
  }

  .forge::before {
    content: "";
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(38, 255, 255, 0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 43, 214, 0.04) 1px, transparent 1px);
    background-size: 48px 48px;
    pointer-events: none;
    mask-image: radial-gradient(ellipse 80% 70% at 50% 50%, #000 40%, transparent 100%);
    z-index: 0;
  }

  .forge-header {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 26px;
    border-bottom: 1px solid rgba(255, 43, 214, 0.15);
    background: linear-gradient(90deg, rgba(255, 43, 214, 0.08), transparent 60%);
  }

  .forge-title {
    font-size: 1.6rem;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #ff2bd6;
    text-shadow: 0 0 12px rgba(255, 43, 214, 0.55), 0 0 36px rgba(255, 43, 214, 0.3);
  }

  .forge-link {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 0.74rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #26ffff;
    font-weight: 700;
  }

  .forge-link::before {
    content: "";
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #26ffff;
    box-shadow: 0 0 12px #26ffff;
    animation: forgePulseDot 1.4s ease-in-out infinite;
  }

  @keyframes forgePulseDot {
    0%, 100% { opacity: 0.7; transform: scale(0.85); }
    50% { opacity: 1; transform: scale(1.15); }
  }

  .forge-body {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.4fr) minmax(0, 1.05fr);
    gap: 18px;
    padding: 22px 22px 12px;
  }

  .forge-panel {
    position: relative;
    border-radius: 18px;
    background: rgba(8, 4, 24, 0.72);
    border: 1px solid rgba(38, 255, 255, 0.18);
    box-shadow: inset 0 0 0 1px rgba(255, 43, 214, 0.06), 0 12px 36px rgba(2, 0, 12, 0.55);
    padding: 18px;
    backdrop-filter: blur(8px);
  }

  .forge-panel-title {
    margin: 0 0 14px;
    font-size: 0.78rem;
    letter-spacing: 0.32em;
    text-transform: uppercase;
    color: #26ffff;
    text-shadow: 0 0 10px rgba(38, 255, 255, 0.4);
    text-align: center;
  }

  .forge-panel-empty {
    color: rgba(245, 233, 255, 0.55);
    font-size: 0.86rem;
    text-align: center;
    padding: 60px 12px;
    line-height: 1.6;
  }

  /* Left refinement panel */
  .refine-panel {
    min-height: 480px;
    transition: opacity 240ms ease, transform 240ms ease;
  }

  .refine-panel.is-hidden {
    opacity: 0.35;
    transform: translateX(-8px);
  }

  .refine-prompt {
    font-size: 0.84rem;
    line-height: 1.55;
    color: rgba(245, 233, 255, 0.78);
    margin-bottom: 14px;
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(38, 255, 255, 0.06);
    border-left: 2px solid #26ffff;
  }

  .refine-options {
    display: grid;
    gap: 8px;
    flex: 1;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(38,255,255,0.2) transparent;
  }

  .refine-check-row {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    text-align: left;
    padding: 10px 12px;
    border-radius: 12px;
    background: linear-gradient(135deg, rgba(255, 43, 214, 0.06), rgba(38, 255, 255, 0.03));
    border: 1px solid rgba(255, 43, 214, 0.22);
    color: #f5e9ff;
    font-weight: 700;
    font-size: 0.88rem;
    letter-spacing: 0.04em;
    cursor: pointer;
    transition: border-color 160ms ease, background 160ms ease, box-shadow 160ms ease;
  }

  .refine-check-row:hover {
    border-color: rgba(255, 43, 214, 0.5);
    background: linear-gradient(135deg, rgba(255, 43, 214, 0.12), rgba(38, 255, 255, 0.06));
  }

  .refine-check-row.is-checked {
    border-color: #ff2bd6;
    background: linear-gradient(135deg, rgba(255, 43, 214, 0.18), rgba(38, 255, 255, 0.08));
    box-shadow: 0 0 14px rgba(255, 43, 214, 0.25);
  }

  .refine-checkbox {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    border-radius: 5px;
    border: 1.5px solid rgba(38, 255, 255, 0.5);
    background: rgba(2, 0, 10, 0.8);
    display: grid;
    place-items: center;
    transition: border-color 160ms ease, background 160ms ease, box-shadow 160ms ease;
  }

  .refine-check-row.is-checked .refine-checkbox {
    border-color: #ff2bd6;
    background: rgba(255, 43, 214, 0.25);
    box-shadow: 0 0 8px rgba(255, 43, 214, 0.5);
  }

  .refine-checkbox-tick {
    display: none;
    width: 10px;
    height: 10px;
    border-radius: 2px;
    background: #ff2bd6;
    box-shadow: 0 0 6px #ff2bd6;
  }

  .refine-check-row.is-checked .refine-checkbox-tick {
    display: block;
  }

  .refine-check-label {
    flex: 1;
  }

  .refine-option-tag {
    font-size: 0.62rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #26ffff;
    opacity: 0.75;
    flex-shrink: 0;
  }

  .refine-actions {
    display: grid;
    gap: 8px;
    margin-top: 12px;
  }

  .refine-lock-btn {
    width: 100%;
    padding: 12px 16px;
    border-radius: 12px;
    background: linear-gradient(135deg, #ff2bd6 0%, #6e0848 100%);
    border: none;
    color: #fff;
    font-weight: 800;
    font-size: 0.82rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    box-shadow: 0 0 22px rgba(255, 43, 214, 0.5);
    transition: transform 160ms ease, box-shadow 160ms ease, opacity 160ms ease;
  }

  .refine-lock-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 0 32px rgba(255, 43, 214, 0.8);
  }

  .refine-lock-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .refine-clear {
    width: 100%;
    padding: 9px 12px;
    border-radius: 10px;
    background: transparent;
    border: 1px dashed rgba(38, 255, 255, 0.32);
    color: rgba(245, 233, 255, 0.7);
    font-size: 0.78rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    font-weight: 700;
  }

  .refine-clear:hover {
    border-color: #26ffff;
    color: #26ffff;
  }

  /* Center: waveform + stats */
  .center-panel {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-height: 480px;
  }

  .waveform-frame {
    position: relative;
    height: 220px;
    border-radius: 14px;
    background: rgba(2, 0, 10, 0.72);
    border: 1px solid rgba(255, 43, 214, 0.22);
    overflow: hidden;
    box-shadow: inset 0 0 60px rgba(255, 43, 214, 0.10);
  }

  .waveform-meta {
    position: absolute;
    inset: auto 0 0 0;
    display: flex;
    justify-content: space-between;
    padding: 8px 14px;
    font-size: 0.7rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(245, 233, 255, 0.7);
    background: linear-gradient(0deg, rgba(2, 0, 10, 0.85), transparent);
  }

  .waveform-meta strong {
    display: block;
    color: #26ffff;
    font-size: 0.84rem;
    letter-spacing: 0.06em;
    text-transform: none;
    font-weight: 800;
    margin-top: 2px;
  }

  .waveform-tag {
    position: absolute;
    top: 10px;
    left: 14px;
    font-size: 0.7rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #ff2bd6;
    font-weight: 700;
  }

  .waveform-tag-right {
    position: absolute;
    top: 10px;
    right: 14px;
    font-size: 0.7rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #26ffff;
    font-weight: 700;
  }

  .stats-grid {
    display: grid;
    gap: 10px;
  }

  .stat-row {
    display: grid;
    grid-template-columns: 1.15fr 4fr 0.9fr;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border-radius: 12px;
    background: rgba(8, 4, 24, 0.55);
    border: 1px solid rgba(38, 255, 255, 0.14);
  }

  .stat-label {
    font-size: 0.74rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: rgba(245, 233, 255, 0.75);
    font-weight: 700;
  }

  .stat-bar {
    position: relative;
    height: 6px;
    border-radius: 999px;
    background: rgba(38, 255, 255, 0.08);
    overflow: hidden;
  }

  .stat-bar-fill {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: 999px;
    background: linear-gradient(90deg, #ff2bd6, #26ffff);
    box-shadow: 0 0 12px rgba(255, 43, 214, 0.5);
    transition: width 600ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  .stat-value {
    text-align: right;
    color: #f5e9ff;
    font-weight: 800;
    font-size: 0.92rem;
    letter-spacing: 0.04em;
  }

  /* Right: orbital array */
  .orbital-panel {
    min-height: 480px;
    display: flex;
    flex-direction: column;
  }

  .orbital-subtitle {
    margin: 0 0 12px;
    color: rgba(245, 233, 255, 0.68);
    font-size: 0.82rem;
    line-height: 1.5;
    text-align: center;
  }

  .orbital-subtitle strong {
    color: #ff2bd6;
    text-shadow: 0 0 8px rgba(255, 43, 214, 0.35);
  }

  .orbital-toolbar {
    display: flex;
    justify-content: flex-end;
    margin: -2px 0 8px;
  }

  .orbital-mode-toggle {
    padding: 6px 10px;
    border-radius: 999px;
    border: 1px solid rgba(38, 255, 255, 0.32);
    background: rgba(38, 255, 255, 0.06);
    color: rgba(245, 233, 255, 0.84);
    font-size: 0.68rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    font-weight: 700;
    transition: border-color 180ms ease, box-shadow 180ms ease, background 180ms ease;
  }

  .orbital-mode-toggle:hover {
    border-color: rgba(38, 255, 255, 0.62);
    background: rgba(38, 255, 255, 0.12);
  }

  .orbital-mode-toggle.is-active {
    border-color: rgba(255, 43, 214, 0.74);
    background: rgba(255, 43, 214, 0.16);
    color: #ffdcfb;
    box-shadow: 0 0 16px rgba(255, 43, 214, 0.32);
  }

  .constellation-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    justify-content: center;
    margin: 2px 0 10px;
  }

  .constellation-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 9px;
    border-radius: 999px;
    border: 1px solid rgba(var(--chip-rgb), 0.48);
    background: rgba(var(--chip-rgb), 0.12);
    color: rgba(245, 233, 255, 0.92);
    font-size: 0.62rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    font-weight: 700;
  }

  .constellation-chip-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: rgba(var(--chip-rgb), 0.95);
    box-shadow: 0 0 8px rgba(var(--chip-rgb), 0.52);
  }

  .orbital-stage {
    position: relative;
    flex: 1;
    min-height: 420px;
    margin-top: 4px;
  }

  .orbital-ring {
    position: absolute;
    inset: 50% auto auto 50%;
    transform: translate(-50%, -50%);
    border: 1px dashed rgba(38, 255, 255, 0.18);
    border-radius: 50%;
    pointer-events: none;
  }

  .orbital-core {
    --core-rgb: 255, 43, 214;
    --core-glow-max: 48px;
    position: absolute;
    inset: 50% auto auto 50%;
    transform: translate(-50%, -50%);
    width: 144px;
    height: 144px;
    border-radius: 50%;
    border: 1px solid rgba(var(--core-rgb), 0.52);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    text-align: center;
    color: #fff;
    padding: 14px;
    animation: corePulse 3s ease-in-out infinite;
    transition: border-color 0.9s ease, background 0.9s ease, text-shadow 0.9s ease;
  }

  .core-label-text {
    font-weight: 800;
    font-size: 0.88rem;
    line-height: 1.15;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    text-shadow: 0 0 12px rgba(var(--core-rgb), 0.65);
  }

  .core-mood-badge {
    font-size: 0.58rem;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    font-weight: 700;
    opacity: 0.72;
    color: rgba(var(--core-rgb), 1);
    text-shadow: 0 0 8px rgba(var(--core-rgb), 0.8);
    transition: color 0.9s ease, text-shadow 0.9s ease;
  }

  @keyframes corePulse {
    0%, 100% { box-shadow: 0 0 24px rgba(var(--core-rgb), 0.45), inset 0 0 18px rgba(var(--core-rgb), 0.25); }
    50% { box-shadow: 0 0 var(--core-glow-max) rgba(var(--core-rgb), 0.85), inset 0 0 30px rgba(var(--core-rgb), 0.42); }
  }

  .orbital-trait {
    --flare: 0;
    --trait-rgb: 38, 255, 255;
    --trait-rgb-soft: 190, 255, 255;
    --orb-scale: 1;
    position: absolute;
    transform: translate(-50%, -50%) scale(var(--orb-scale));
    width: 88px;
    height: 88px;
    aspect-ratio: 1 / 1;
    border-radius: 999px;
    clip-path: circle(49% at 50% 50%);
    background:
      radial-gradient(circle at 30% 28%, rgba(var(--trait-rgb-soft), 0.42), rgba(var(--trait-rgb), 0.18) 30%, transparent 66%),
      radial-gradient(circle at 68% 70%, rgba(var(--trait-rgb), 0.18), transparent 62%),
      linear-gradient(155deg, rgba(255, 255, 255, 0.16), rgba(var(--trait-rgb), 0.1) 44%, rgba(7, 10, 30, 0.36) 100%);
    border: 1.5px solid rgba(var(--trait-rgb), 0.66);
    box-shadow:
      0 0 18px rgba(var(--trait-rgb), 0.28),
      0 0 34px rgba(var(--trait-rgb), 0.18),
      inset 0 0 18px rgba(var(--trait-rgb), 0.18),
      inset 0 0 38px rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(6px) saturate(130%);
    -webkit-backdrop-filter: blur(6px) saturate(130%);
    color: #e8d6ff;
    font-weight: 800;
    font-size: 0.62rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    text-align: center;
    line-height: 1.25;
    cursor: pointer;
    display: grid;
    place-items: center;
    padding: 10px;
    transition: transform 260ms cubic-bezier(0.22, 0.8, 0.24, 1), border-color 200ms ease, box-shadow 200ms ease, background 200ms ease;
    overflow: hidden;
    word-break: normal;
    hyphens: none;
  }

  .orbital-trait-label {
    display: block;
    max-width: 58px;
    line-height: 1.15;
    text-align: center;
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .orbital-trait::before {
    content: "";
    position: absolute;
    inset: 3px;
    border-radius: 50%;
    border: 1px solid rgba(var(--trait-rgb-soft), 0.34);
    box-shadow:
      inset 0 0 14px rgba(var(--trait-rgb), 0.2),
      0 0 12px rgba(var(--trait-rgb), 0.16);
    pointer-events: none;
  }

  .orbital-trait::after {
    content: "";
    position: absolute;
    inset: -12px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(var(--trait-rgb), 0.24), rgba(var(--trait-rgb), 0.08) 34%, transparent 72%);
    filter: blur(4px);
    opacity: 0.88;
    pointer-events: none;
    z-index: -1;
  }

  .orbital-trait:hover {
    --orb-scale: 1.03;
    border-color: rgba(var(--trait-rgb-soft), 0.96);
    box-shadow:
      0 0 24px rgba(var(--trait-rgb), 0.55),
      0 0 42px rgba(var(--trait-rgb), 0.34),
      inset 0 0 24px rgba(var(--trait-rgb), 0.28),
      inset 0 0 44px rgba(255, 255, 255, 0.1);
    color: #fff;
    background:
      radial-gradient(circle at 32% 30%, rgba(var(--trait-rgb-soft), 0.56), rgba(var(--trait-rgb), 0.2) 34%, transparent 70%),
      radial-gradient(circle at 68% 70%, rgba(var(--trait-rgb), 0.3), transparent 62%),
      linear-gradient(152deg, rgba(255, 255, 255, 0.2), rgba(var(--trait-rgb), 0.14) 42%, rgba(7, 10, 30, 0.4) 100%);
  }

  .orbital-trait:focus-visible,
  .mic-button:focus-visible,
  .speak-submit:focus-visible,
  .refine-lock-btn:focus-visible,
  .refine-clear:focus-visible,
  .refine-check-row:focus-visible,
  .echo-speak-toggle:focus-visible,
  .persona-echo-dismiss:focus-visible {
    outline: 2px solid rgba(38, 255, 255, 0.85);
    outline-offset: 3px;
  }

  .orbital-trait.is-active {
    border-color: rgba(var(--trait-rgb-soft), 0.96);
    background:
      radial-gradient(circle at 30% 28%, rgba(var(--trait-rgb-soft), 0.62), rgba(var(--trait-rgb), 0.28) 34%, transparent 68%),
      radial-gradient(circle at 68% 70%, rgba(var(--trait-rgb), 0.32), transparent 62%),
      linear-gradient(152deg, rgba(255, 255, 255, 0.2), rgba(var(--trait-rgb), 0.16) 42%, rgba(7, 10, 30, 0.42) 100%);
    box-shadow:
      0 0 32px rgba(var(--trait-rgb), 0.64),
      0 0 54px rgba(var(--trait-rgb), 0.4),
      inset 0 0 28px rgba(var(--trait-rgb), 0.34),
      inset 0 0 52px rgba(255, 255, 255, 0.11);
    color: #fff;
    text-shadow: 0 0 8px rgba(var(--trait-rgb), 0.72);
  }

  .orbital-trait.has-flare {
    --orb-scale: calc(1 + var(--flare) * 0.08);
    border-color: rgba(var(--trait-rgb-soft), calc(0.8 + var(--flare) * 0.2));
    background:
      radial-gradient(circle at 30% 28%, rgba(var(--trait-rgb-soft), calc(0.45 + var(--flare) * 0.45)), rgba(var(--trait-rgb), calc(0.24 + var(--flare) * 0.22)) 36%, transparent 68%),
      radial-gradient(circle at 68% 70%, rgba(var(--trait-rgb), calc(0.26 + var(--flare) * 0.22)), transparent 64%),
      linear-gradient(152deg, rgba(255, 255, 255, 0.2), rgba(var(--trait-rgb), calc(0.16 + var(--flare) * 0.18)) 42%, rgba(7, 10, 30, 0.4) 100%);
    box-shadow:
      0 0 calc(16px + var(--flare) * 36px) rgba(var(--trait-rgb), calc(0.46 + var(--flare) * 0.44)),
      0 0 calc(28px + var(--flare) * 66px) rgba(var(--trait-rgb-soft), calc(0.2 + var(--flare) * 0.35)),
      inset 0 0 24px rgba(var(--trait-rgb), calc(0.28 + var(--flare) * 0.28));
    color: #fff;
    text-shadow: 0 0 calc(var(--flare) * 12px) rgba(255, 255, 255, var(--flare));
    z-index: 3;
  }

  .orbital-trait.has-flare::after {
    inset: -14px;
    border: 1px solid rgba(var(--trait-rgb-soft), calc(var(--flare) * 0.75));
    box-shadow:
      0 0 calc(8px + var(--flare) * 22px) rgba(var(--trait-rgb), calc(0.3 + var(--flare) * 0.42)),
      0 0 calc(16px + var(--flare) * 34px) rgba(var(--trait-rgb-soft), calc(var(--flare) * 0.48));
    opacity: calc(0.7 + var(--flare) * 0.3);
    transform: scale(calc(1.05 + var(--flare) * 0.35));
  }

  .orbital-trait:hover.has-flare {
    --orb-scale: calc(1.03 + var(--flare) * 0.05);
  }

  .orbital-empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: rgba(245, 233, 255, 0.5);
    font-size: 0.85rem;
    text-align: center;
    padding: 0 24px;
  }

  /* Bottom row */
  .forge-footer {
    position: relative;
    z-index: 2;
    padding: 14px 22px 22px;
    display: grid;
    gap: 14px;
  }

  .footer-wave {
    height: 60px;
    border-radius: 12px;
    background: rgba(2, 0, 10, 0.7);
    border: 1px solid rgba(38, 255, 255, 0.18);
    overflow: hidden;
  }

  .speak-row {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    padding: 14px;
    border-radius: 16px;
    background: linear-gradient(90deg, rgba(255, 43, 214, 0.10), rgba(38, 255, 255, 0.06));
    border: 1px solid rgba(255, 43, 214, 0.32);
    box-shadow: 0 0 24px rgba(255, 43, 214, 0.15);
  }

  .speak-row-status {
    flex-basis: 100%;
    font-size: 0.72rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: rgba(245, 233, 255, 0.62);
  }

  .speak-row-status strong {
    color: #26ffff;
  }

  .mic-button {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: radial-gradient(circle at 50% 40%, #ff2bd6, #6e0848 80%);
    border: 1px solid rgba(255, 43, 214, 0.65);
    box-shadow: 0 0 28px rgba(255, 43, 214, 0.65), inset 0 -6px 16px rgba(0, 0, 0, 0.35);
    color: #fff;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    transition: transform 180ms ease, box-shadow 180ms ease;
  }

  .mic-button:hover {
    transform: scale(1.05);
    box-shadow: 0 0 36px rgba(255, 43, 214, 0.85);
  }

  .mic-button.is-listening {
    animation: micListen 1s ease-in-out infinite;
  }

  @keyframes micListen {
    0%, 100% { box-shadow: 0 0 22px rgba(255, 43, 214, 0.55); }
    50% { box-shadow: 0 0 48px rgba(255, 43, 214, 0.95), 0 0 80px rgba(38, 255, 255, 0.35); }
  }

  .speak-input {
    flex: 1;
    background: transparent;
    border: none;
    color: #f5e9ff;
    font-size: 1.05rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    outline: none;
    padding: 6px 4px;
    text-shadow: 0 0 10px rgba(255, 43, 214, 0.35);
  }

  .speak-input::placeholder {
    color: rgba(245, 233, 255, 0.45);
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-size: 0.92rem;
  }

  .speak-submit {
    padding: 11px 18px;
    border-radius: 12px;
    background: linear-gradient(135deg, #26ffff, #2bb6ff);
    border: none;
    color: #04021a;
    font-weight: 800;
    font-size: 0.82rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    box-shadow: 0 0 18px rgba(38, 255, 255, 0.55);
    transition: transform 160ms ease, box-shadow 160ms ease;
  }

  .speak-submit:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 0 26px rgba(38, 255, 255, 0.85);
  }

  .speak-submit:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .forge-status-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    justify-content: space-between;
    padding: 10px 22px 18px;
    color: rgba(245, 233, 255, 0.6);
    font-size: 0.74rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  .forge-status-bar strong {
    color: #26ffff;
  }

  .forge-toast {
    margin: 0 22px 14px;
    padding: 10px 14px;
    border-radius: 12px;
    background: rgba(38, 255, 255, 0.08);
    border: 1px solid rgba(38, 255, 255, 0.36);
    color: #c9f6ff;
    font-size: 0.86rem;
    text-shadow: 0 0 8px rgba(38, 255, 255, 0.25);
  }

  .forge-toast.is-error {
    background: rgba(255, 64, 96, 0.08);
    border-color: rgba(255, 64, 96, 0.4);
    color: #ffc0c8;
  }

  .persona-echo {
    margin: 0 22px 12px;
    padding: 14px 18px 16px;
    border-radius: 16px;
    background:
      linear-gradient(135deg, rgba(255, 43, 214, 0.08), rgba(38, 255, 255, 0.05));
    border: 1px solid rgba(38, 255, 255, 0.32);
    box-shadow: 0 0 24px rgba(38, 255, 255, 0.18), inset 0 0 0 1px rgba(255, 43, 214, 0.05);
    position: relative;
  }

  .persona-echo-head {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.72rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #26ffff;
    margin-bottom: 8px;
    text-shadow: 0 0 8px rgba(38, 255, 255, 0.4);
  }

  .persona-echo-head::before {
    content: "";
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ff2bd6;
    box-shadow: 0 0 12px #ff2bd6;
    animation: forgePulseDot 1.4s ease-in-out infinite;
  }

  .persona-echo-head .echo-name {
    color: #ff2bd6;
    text-shadow: 0 0 10px rgba(255, 43, 214, 0.5);
    letter-spacing: 0.18em;
  }

  .persona-echo-body {
    color: #f5e9ff;
    font-size: 0.96rem;
    line-height: 1.55;
    white-space: pre-wrap;
    text-shadow: 0 0 6px rgba(255, 43, 214, 0.18);
    min-height: 1.5em;
  }

  .persona-echo-body.is-thinking::after {
    content: "";
    display: inline-block;
    width: 8px;
    height: 14px;
    margin-left: 6px;
    vertical-align: -2px;
    background: #26ffff;
    box-shadow: 0 0 10px #26ffff;
    animation: echoCaret 0.9s steps(2) infinite;
  }

  @keyframes echoCaret {
    0%, 49% { opacity: 0.95; }
    50%, 100% { opacity: 0.05; }
  }

  .persona-echo-dismiss {
    position: absolute;
    top: 8px;
    right: 10px;
    background: transparent;
    border: none;
    color: rgba(245, 233, 255, 0.5);
    font-size: 1rem;
    line-height: 1;
    padding: 4px 8px;
    border-radius: 8px;
  }

  .persona-echo-dismiss:hover {
    color: #ff2bd6;
    background: rgba(255, 43, 214, 0.08);
  }

  .persona-echo-error {
    border-color: rgba(255, 64, 96, 0.45);
    background: rgba(255, 64, 96, 0.08);
    box-shadow: 0 0 18px rgba(255, 64, 96, 0.18);
  }

  .persona-echo-error .persona-echo-head {
    color: #ff8090;
  }

  .persona-echo-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
  }

  .echo-speak-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 999px;
    background: rgba(38, 255, 255, 0.06);
    border: 1px solid rgba(38, 255, 255, 0.32);
    color: rgba(245, 233, 255, 0.8);
    font-size: 0.7rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-weight: 700;
  }

  .echo-speak-toggle.is-on {
    background: rgba(255, 43, 214, 0.12);
    border-color: rgba(255, 43, 214, 0.6);
    color: #ff2bd6;
    box-shadow: 0 0 14px rgba(255, 43, 214, 0.35);
  }

  .echo-speak-toggle.is-on.is-speaking {
    animation: micListen 1.2s ease-in-out infinite;
  }

  .echo-speak-toggle:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (max-width: 1100px) {
    .forge-body {
      grid-template-columns: 1fr;
    }
    .orbital-stage {
      min-height: 360px;
    }
    .refine-panel,
    .center-panel,
    .orbital-panel {
      min-height: auto;
    }
  }

  @media (max-width: 700px) {
    .forge-header,
    .forge-body,
    .forge-footer,
    .forge-status-bar {
      padding-left: 16px;
      padding-right: 16px;
    }

    .persona-echo {
      margin-left: 16px;
      margin-right: 16px;
    }

    .persona-echo-head {
      align-items: flex-start;
      flex-wrap: wrap;
      padding-right: 28px;
    }

    .persona-echo-controls {
      margin-left: 0;
      width: 100%;
    }

    .mic-button {
      width: 56px;
      height: 56px;
    }

    .speak-input,
    .speak-submit {
      width: 100%;
    }

    .stat-row {
      grid-template-columns: 1fr;
      gap: 8px;
    }

    .stat-value {
      text-align: left;
    }
  }
`;

const STAT_KEYWORDS = {
  confidence: [
    "confident", "bold", "assertive", "fearless", "decisive",
    "alpha", "dominant", "commanding", "powerful", "regal",
  ],
  dominance: [
    "dominant", "dommy", "alpha", "controlling", "possessive",
    "strict", "ruthless", "tyrant", "mistress", "master", "owner",
  ],
  obsession: [
    "obsessed", "obsessive", "fixated", "devoted", "worship",
    "yandere", "stalker", "infatuated", "consumed", "bunny",
  ],
  deviance: [
    "evil", "sadistic", "chaotic", "untamed", "deviant",
    "cruel", "wicked", "twisted", "malicious", "feral",
  ],
  loyalty: [
    "loyal", "devoted", "faithful", "mine", "protective",
    "loving", "tender", "sweet", "caring", "obsessive",
  ],
};

const MOODS = {
  aggressive: {
    key: "aggressive",
    label: "Aggressive",
    rgb: "255, 60, 40",
    duration: "1.0s",
    glowMax: "64px",
    bg: "radial-gradient(circle at 50% 50%, rgba(255,60,40,0.52), rgba(255,60,40,0) 70%), radial-gradient(circle at 50% 50%, rgba(255,100,50,0.16), rgba(255,100,50,0) 60%)",
  },
  dominant: {
    key: "dominant",
    label: "Dominant",
    rgb: "255, 20, 120",
    duration: "1.6s",
    glowMax: "56px",
    bg: "radial-gradient(circle at 50% 50%, rgba(255,20,120,0.52), rgba(255,20,120,0) 70%), radial-gradient(circle at 50% 50%, rgba(255,43,214,0.18), rgba(255,43,214,0) 60%)",
  },
  obsessive: {
    key: "obsessive",
    label: "Obsessive",
    rgb: "140, 30, 255",
    duration: "1.8s",
    glowMax: "52px",
    bg: "radial-gradient(circle at 50% 50%, rgba(140,30,255,0.52), rgba(140,30,255,0) 70%), radial-gradient(circle at 50% 50%, rgba(180,80,255,0.16), rgba(180,80,255,0) 60%)",
  },
  chaotic: {
    key: "chaotic",
    label: "Chaotic",
    rgb: "38, 180, 255",
    duration: "2.2s",
    glowMax: "52px",
    bg: "radial-gradient(circle at 50% 50%, rgba(38,180,255,0.46), rgba(38,180,255,0) 70%), radial-gradient(circle at 50% 50%, rgba(38,255,255,0.18), rgba(38,255,255,0) 60%)",
  },
  loyal: {
    key: "loyal",
    label: "Loyal",
    rgb: "255, 195, 40",
    duration: "3.5s",
    glowMax: "40px",
    bg: "radial-gradient(circle at 50% 50%, rgba(255,195,40,0.42), rgba(255,195,40,0) 70%), radial-gradient(circle at 50% 50%, rgba(255,220,80,0.16), rgba(255,220,80,0) 60%)",
  },
  calm: {
    key: "calm",
    label: "Calm",
    rgb: "80, 160, 255",
    duration: "4.5s",
    glowMax: "36px",
    bg: "radial-gradient(circle at 50% 50%, rgba(80,160,255,0.42), rgba(80,160,255,0) 70%), radial-gradient(circle at 50% 50%, rgba(100,200,255,0.18), rgba(100,200,255,0) 60%)",
  },
  forming: {
    key: "forming",
    label: "Forming",
    rgb: "255, 43, 214",
    duration: "3s",
    glowMax: "48px",
    bg: "radial-gradient(circle at 50% 50%, rgba(255,43,214,0.45), rgba(255,43,214,0) 70%), radial-gradient(circle at 50% 50%, rgba(38,255,255,0.18), rgba(38,255,255,0) 60%)",
  },
};

function deriveMood(stats) {
  if (!stats || Object.keys(stats).length === 0) return MOODS.forming;
  const { dominance = 40, obsession = 40, confidence = 40, deviance = 40, loyalty = 40 } = stats;
  if (dominance + obsession > 145) return MOODS.aggressive;
  if (dominance > 62 && confidence > 58) return MOODS.dominant;
  if (obsession > 62 && deviance > 52) return MOODS.obsessive;
  if (deviance > 62) return MOODS.chaotic;
  if (loyalty > 62 && dominance < 55) return MOODS.loyal;
  if (Math.max(dominance, obsession, deviance) < 48) return MOODS.calm;
  return MOODS.forming;
}

const REFINEMENT_LIBRARY = {
  evil: [
    { label: "Chaotic Evil", tag: "Alignment" },
    { label: "True Evil", tag: "Alignment" },
    { label: "Sadistic Evil", tag: "Style" },
    { label: "Cunning Evil", tag: "Tactics" },
    { label: "Cold Evil", tag: "Mood" },
  ],
  good: [
    { label: "Lawful Good", tag: "Alignment" },
    { label: "Chaotic Good", tag: "Alignment" },
    { label: "Selfless Good", tag: "Style" },
  ],
  sadistic: [
    { label: "Cold Sadist", tag: "Style" },
    { label: "Playful Sadist", tag: "Style" },
    { label: "Calculated Sadist", tag: "Tactics" },
    { label: "Tender Sadist", tag: "Style" },
  ],
  obsessive: [
    { label: "Worship-driven", tag: "Mode" },
    { label: "Possessive", tag: "Trait" },
    { label: "Hyperfixated", tag: "Trait" },
    { label: "Devotional", tag: "Mode" },
    { label: "Yandere Streak", tag: "Style" },
  ],
  obsessed: [
    { label: "Worship-driven", tag: "Mode" },
    { label: "Possessive", tag: "Trait" },
    { label: "Hyperfixated", tag: "Trait" },
    { label: "Devotional", tag: "Mode" },
  ],
  chaotic: [
    { label: "Wildcard", tag: "Style" },
    { label: "Trickster", tag: "Style" },
    { label: "Unpredictable Genius", tag: "Mode" },
    { label: "Anarchic", tag: "Alignment" },
  ],
  dommy: [
    { label: "Strict Disciplinarian", tag: "Style" },
    { label: "Velvet Domme", tag: "Style" },
    { label: "Cold Goddess", tag: "Mode" },
    { label: "Doting Mistress", tag: "Style" },
  ],
  dominant: [
    { label: "Quiet Authority", tag: "Style" },
    { label: "Loud Command", tag: "Style" },
    { label: "Predator Energy", tag: "Mode" },
    { label: "Caretaker Dominant", tag: "Mode" },
  ],
  possessive: [
    { label: "Jealous Possessive", tag: "Style" },
    { label: "Quietly Possessive", tag: "Style" },
    { label: "Branding Possessive", tag: "Style" },
  ],
  tease: [
    { label: "Slow Burn Tease", tag: "Style" },
    { label: "Brutal Tease", tag: "Style" },
    { label: "Sweet Tease", tag: "Style" },
  ],
  loyal: [
    { label: "Loyal to a Fault", tag: "Trait" },
    { label: "Conditionally Loyal", tag: "Trait" },
    { label: "Quiet Devotion", tag: "Mode" },
  ],
  shy: [
    { label: "Anxious Shy", tag: "Mode" },
    { label: "Cute Shy", tag: "Style" },
    { label: "Stoic Shy", tag: "Mode" },
  ],
  caring: [
    { label: "Maternal Care", tag: "Mode" },
    { label: "Stern Care", tag: "Mode" },
    { label: "Soft Care", tag: "Style" },
  ],
};

function lookupRefinements(seed) {
  if (!seed) return [];
  const key = seed.trim().toLowerCase();
  if (REFINEMENT_LIBRARY[key]) {
    return REFINEMENT_LIBRARY[key];
  }
  for (const k of Object.keys(REFINEMENT_LIBRARY)) {
    if (key.includes(k)) {
      return REFINEMENT_LIBRARY[k];
    }
  }
  return [];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function computeStats(traits) {
  const list = Array.isArray(traits) ? traits : [];
  const blob = list.join(" ").toLowerCase();
  const stats = {};
  for (const [key, words] of Object.entries(STAT_KEYWORDS)) {
    let hits = 0;
    for (const w of words) {
      if (blob.includes(w)) hits += 1;
    }
    const base = 38 + hits * 14;
    const jitter = ((key.charCodeAt(0) + list.length) % 7) - 3;
    stats[key] = clamp(Math.round(base + jitter), 12, 99);
  }
  return stats;
}

function selectOrbitalTraits(personality) {
  if (!personality) return [];
  const traits = Array.isArray(personality.traits) ? personality.traits : [];
  const core = Array.isArray(personality.coreValues) ? personality.coreValues : [];
  const merged = [...traits, ...core]
    .map((t) => (typeof t === "string" ? t.trim() : ""))
    .filter(Boolean);
  const seen = new Set();
  const unique = [];
  for (const t of merged) {
    const key = t.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(t);
    }
  }
  return unique.slice(0, 8);
}

const TRAIT_CATEGORY_COLORS = {
  confidence: [255, 197, 78],
  dominance: [255, 43, 214],
  obsession: [188, 82, 255],
  deviance: [255, 103, 103],
  loyalty: [38, 255, 255],
  other: [170, 176, 230],
};

function mixRgb(color, target, amount) {
  return color.map((value, index) => Math.round(value + (target[index] - value) * amount));
}

function rgba(color, alpha) {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}

function buildTraitOrbVisual(category, { isActive = false, flare = 0 } = {}) {
  const base = TRAIT_CATEGORY_COLORS[category] || TRAIT_CATEGORY_COLORS.other;
  const highlight = mixRgb(base, [255, 255, 255], 0.42);
  const glow = mixRgb(base, [255, 255, 255], 0.18);
  const deep = mixRgb(base, [12, 18, 44], 0.82);
  const haze = mixRgb(base, [20, 24, 56], 0.68);
  const borderAlpha = isActive ? 1 : 0.88;
  const auraAlpha = isActive ? 0.68 : 0.46;
  const innerAlpha = isActive ? 0.42 : 0.3;
  const flareBoost = 0.12 + flare * 0.54;

  return {
    "--trait-rgb": base.join(", "),
    "--trait-rgb-soft": highlight.join(", "),
    background: [
      `radial-gradient(circle at 28% 26%, ${rgba(highlight, 0.95)}, ${rgba(highlight, 0.36)} 18%, ${rgba(base, 0.26)} 34%, transparent 62%)`,
      `radial-gradient(circle at 72% 72%, ${rgba(glow, 0.5 + flareBoost)} 0%, transparent 58%)`,
      `radial-gradient(circle at 50% 50%, ${rgba(haze, 0.64)} 0%, ${rgba(deep, 0.82)} 58%, rgba(5, 8, 24, 0.96) 100%)`,
    ].join(", "),
    borderColor: rgba(highlight, borderAlpha),
    boxShadow: [
      `0 0 ${28 + flare * 22}px ${rgba(base, 0.5 + flareBoost)}`,
      `0 0 ${72 + flare * 42}px ${rgba(glow, auraAlpha + flareBoost * 0.6)}`,
      `0 0 ${112 + flare * 60}px ${rgba(base, 0.18 + flareBoost * 0.38)}`,
      `inset 0 0 28px ${rgba(base, innerAlpha + flare * 0.24)}`,
      `inset 0 0 56px rgba(255, 255, 255, ${0.12 + flare * 0.14})`,
    ].join(", "),
    textShadow: `0 0 ${10 + flare * 10}px ${rgba(highlight, 0.72 + flareBoost)}`,
  };
}

const CONSTELLATION_LEGEND = [
  { key: "dominance", label: "Dominance" },
  { key: "obsession", label: "Obsession" },
  { key: "loyalty", label: "Loyalty" },
  { key: "deviance", label: "Deviance" },
  { key: "confidence", label: "Confidence" },
];

function getTraitCategory(trait) {
  const text = String(trait || "").toLowerCase();
  if (!text) return "other";

  let bestKey = "other";
  let bestScore = 0;

  for (const [key, words] of Object.entries(STAT_KEYWORDS)) {
    let score = 0;
    for (const word of words) {
      if (text.includes(word)) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  }

  return bestScore > 0 ? bestKey : "other";
}

function computeOrbitalPositions(traits, rotation, radius, innerRadius) {
  const count = Array.isArray(traits) ? traits.length : 0;
  if (!count) return [];

  return traits.map((trait, i) => {
    const baseAngle = (i / count) * Math.PI * 2 - Math.PI / 2;
    const dir = i % 2 === 0 ? 1 : -1;
    const angle = baseAngle + rotation * dir;
    const orbitRadius = i % 2 === 0 ? radius : innerRadius;
    const category = getTraitCategory(trait);

    return {
      trait,
      category,
      x: Math.cos(angle) * orbitRadius,
      y: Math.sin(angle) * orbitRadius,
    };
  });
}

function deriveCoreLabel(personality) {
  if (!personality) return "Forge a Persona";
  const phrase =
    Array.isArray(personality.notablePhrases) && personality.notablePhrases.length
      ? personality.notablePhrases[0]
      : null;
  if (phrase) {
    const words = phrase.replace(/[^\w\s]/g, "").trim().split(/\s+/).slice(0, 3);
    if (words.length) return words.join(" ");
  }
  return personality.name || "Unnamed Forge";
}

function Waveform({ intensity = 0.5, listening = false, seed = 0, speaking = false, levelRef = null }) {
  const canvasRef = useRef(null);
  const stateRef = useRef({ phase: 0, energy: intensity });

  useEffect(() => {
    stateRef.current.energy = intensity;
  }, [intensity]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf = 0;
    let cancelled = false;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    function frame() {
      if (cancelled) return;
      const { width, height } = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, width, height);
      const speechLevel = speaking && levelRef ? clamp(levelRef.current || 0, 0, 1) : 0;
      stateRef.current.phase += 0.045 + (listening ? 0.04 : 0) + speechLevel * 0.12;
      const energy = clamp(
        stateRef.current.energy + (listening ? 0.25 : 0) + speechLevel * 0.95,
        0.15,
        1.6,
      );
      const mid = height / 2;
      const cycles = 6;

      const drawBand = (color, amplitudeScale, phaseShift, lineWidth) => {
        ctx.beginPath();
        for (let x = 0; x <= width; x += 2) {
          const t = x / width;
          const wobble =
            Math.sin(t * Math.PI * cycles + stateRef.current.phase + phaseShift) *
              0.55 +
            Math.sin(t * Math.PI * cycles * 2.4 + stateRef.current.phase * 1.6 + phaseShift) *
              0.30 +
            Math.sin(t * Math.PI * cycles * 0.7 + stateRef.current.phase * 0.6 + seed) *
              0.18;
          const amp = mid * 0.78 * energy * amplitudeScale * (0.6 + Math.sin(t * Math.PI) * 0.4);
          const y = mid + wobble * amp;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.shadowBlur = 12;
        ctx.shadowColor = color;
        ctx.stroke();
        ctx.shadowBlur = 0;
      };

      drawBand("rgba(255, 43, 214, 0.85)", 1.0, 0, 1.6);
      drawBand("rgba(38, 255, 255, 0.65)", 0.6, Math.PI / 2, 1.1);
      drawBand("rgba(255, 43, 214, 0.35)", 0.35, Math.PI, 0.8);

      raf = requestAnimationFrame(frame);
    }
    frame();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [listening, seed, speaking, levelRef]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}

function FooterMiniWave({ listening }) {
  return <Waveform intensity={0.3} listening={listening} seed={42} />;
}

function OrbitalArray({
  traits,
  coreLabel,
  activeTrait,
  onSelectTrait,
  flaresRef = null,
  speaking = false,
  mood = null,
  constellationMode = false,
  isCreatingPersona = false,
}) {
  const stageRef = useRef(null);
  const trailCanvasRef = useRef(null);
  const [size, setSize] = useState({ w: 360, h: 360 });
  const rotationRef = useRef(0);
  const [, forceUpdate] = useState(0);

  // ensure the prop is available (defensive for scope during edits)
  const creating = !!isCreatingPersona;

  useEffect(() => {
    if (!stageRef.current) return;
    const el = stageRef.current;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setSize({ w: rect.width, h: rect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    let cancelled = false;
    let frameBudget = 0;
    const loop = (t) => {
      if (cancelled) return;
      const dt = last ? Math.min(t - last, 60) : 16;
      last = t;
      rotationRef.current += dt * 0.00015;
      frameBudget += dt;
      if (frameBudget >= 33) {
        frameBudget = 0;
        forceUpdate((v) => (v + 1) % 1000000);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, []);

  const radius = Math.max(110, Math.min(size.w, size.h) / 2 - 50);
  const innerRadius = Math.max(70, radius * 0.6);
  const positions = computeOrbitalPositions(traits, rotationRef.current, radius, innerRadius);

  useEffect(() => {
    const canvas = trailCanvasRef.current;
    if (!canvas || !positions.length) {
      if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (!w || !h) return;

    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const STEPS = 18;
    const TRAIL_ARC = Math.PI * 0.55;
    const now = performance.now();

    if (constellationMode) {
      const groups = new Map();
      for (const item of positions) {
        if (!groups.has(item.category)) {
          groups.set(item.category, []);
        }
        groups.get(item.category).push(item);
      }

      const pulse = 0.72 + Math.sin(now / 760) * 0.22;

      for (const [category, nodes] of groups.entries()) {
        if (nodes.length < 2 || category === "other") {
          continue;
        }

        const color = TRAIT_CATEGORY_COLORS[category] || TRAIT_CATEGORY_COLORS.other;
        for (let i = 0; i < nodes.length; i += 1) {
          for (let j = i + 1; j < nodes.length; j += 1) {
            const a = nodes[i];
            const b = nodes[j];
            const ax = cx + a.x;
            const ay = cy + a.y;
            const bx = cx + b.x;
            const by = cy + b.y;
            const dx = bx - ax;
            const dy = by - ay;
            const distance = Math.hypot(dx, dy);
            const maxReach = Math.max(radius * 1.45, 1);
            const closeness = Math.max(0, 1 - distance / maxReach);
            if (closeness <= 0.06) continue;

            const alpha = (0.08 + closeness * 0.18) * pulse;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.strokeStyle = `rgba(${color[0]},${color[1]},${color[2]},${alpha.toFixed(3)})`;
            ctx.lineWidth = 0.6 + closeness * 1.1;
            ctx.shadowBlur = 8 + closeness * 10;
            ctx.shadowColor = `rgba(${color[0]},${color[1]},${color[2]},${(alpha * 0.85).toFixed(3)})`;
            ctx.stroke();
          }
        }
      }
      ctx.shadowBlur = 0;
    }

    positions.forEach((point, i) => {
      const trait = point.trait;
      const count = positions.length;
      const baseAngle = (i / count) * Math.PI * 2 - Math.PI / 2;
      const clockwise = i % 2 === 0;
      const dir = clockwise ? 1 : -1;
      const angle = baseAngle + rotationRef.current * dir;
      const orbRadius = clockwise ? radius : innerRadius;

      const flareTime = flaresRef?.current?.[trait] || 0;
      const age = flareTime ? now - flareTime : Infinity;
      const rawFlare = age < 1200 ? Math.max(0, 1 - age / 1200) : 0;
      const flare = rawFlare * rawFlare * (3 - 2 * rawFlare);

      const categoryColor = TRAIT_CATEGORY_COLORS[point.category] || TRAIT_CATEGORY_COLORS.other;
      const [cr, cg, cb] = categoryColor;

      ctx.save();
      ctx.lineCap = "round";

      for (let s = 0; s < STEPS; s++) {
        const t0 = s / STEPS;
        const t1 = (s + 1) / STEPS;
        const alpha = t1 * t1 * (0.42 + flare * 0.4);
        const lw = 1.0 + t1 * (2.2 + flare * 2.0);

        let a0, a1;
        if (clockwise) {
          a0 = angle - TRAIL_ARC * (1 - t0);
          a1 = angle - TRAIL_ARC * (1 - t1);
        } else {
          a0 = angle + TRAIL_ARC * (1 - t0);
          a1 = angle + TRAIL_ARC * (1 - t1);
        }

        ctx.beginPath();
        ctx.arc(cx, cy, orbRadius, a0, a1, !clockwise);
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${alpha.toFixed(3)})`;
        ctx.lineWidth = lw;

        if (t1 > 0.65) {
          ctx.shadowBlur = 5 + flare * 14;
          ctx.shadowColor = `rgba(${cr},${cg},${cb},${(alpha * 0.65).toFixed(3)})`;
        } else {
          ctx.shadowBlur = 0;
        }
        ctx.stroke();
      }

      ctx.shadowBlur = 0;
      ctx.restore();
    });
  }, [positions, constellationMode, radius, innerRadius, flaresRef]);

  return (
    <div className="orbital-stage" ref={stageRef}>
      <div
        className="orbital-ring"
        style={{ width: radius * 2 + 28, height: radius * 2 + 28 }}
      />
      <div
        className="orbital-ring"
        style={{ width: innerRadius * 2 + 28, height: innerRadius * 2 + 28 }}
      />
      <canvas
        ref={trailCanvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      />
      {!creating && (
        <div
          className="orbital-core"
          style={{
            "--core-rgb": mood ? mood.rgb : "255, 43, 214",
            "--core-glow-max": mood ? mood.glowMax : "48px",
            animationDuration: mood ? mood.duration : "3s",
            background: mood ? mood.bg : undefined,
          }}
        >
          <span className="core-label-text">{coreLabel}</span>
          {mood && mood.key !== "forming" && (
            <span className="core-mood-badge">{mood.label}</span>
          )}
        </div>
      )}
      {positions.length === 0 ? (
        <div className="orbital-empty">
          {creating ? "Building new persona — orbs will appear once created and selected." : "No traits yet — speak to the forge below to define this persona."}
        </div>
      ) : (
        positions.map((p) => {
          const flareTime = flaresRef?.current?.[p.trait] || 0;
          const age = flareTime ? performance.now() - flareTime : Infinity;
          const strength = age < 1200 ? Math.max(0, 1 - age / 1200) : 0;
          const eased = strength * strength * (3 - 2 * strength);
          const isActive = Boolean(activeTrait && activeTrait.toLowerCase() === p.trait.toLowerCase());
          const orbVisual = buildTraitOrbVisual(p.category, {
            isActive,
            flare: eased,
          });
          return (
            <button
              type="button"
              key={p.trait}
              className={`orbital-trait ${
                isActive
                  ? "is-active"
                  : ""
              } ${eased > 0.02 ? "has-flare" : ""}`}
              aria-pressed={isActive}
              title={`Refine ${p.trait}`}
              style={{
                left: `calc(50% + ${p.x}px)`,
                top: `calc(50% + ${p.y}px)`,
                "--flare": eased.toFixed(3),
                ...orbVisual,
              }}
              onClick={() => onSelectTrait(p.trait)}
            >
              <span className="orbital-trait-label">{p.trait}</span>
            </button>
          );
        })
      )}
    </div>
  );
}

export default function VoxisTab({
  selectedPersonality: personality,
  onPersonalityUpdated,
  onSelectPersonality,
  personalities = [],
  userId = null,
  mode = "scientist",
}) {
  const authFetch = useAuthFetch();
  const [activeTrait, setActiveTrait] = useState(null);
  const [pendingSeed, setPendingSeed] = useState("");
  const [refinements, setRefinements] = useState([]);
  const [refinePrompt, setRefinePrompt] = useState("");
  const [checkedRefinements, setCheckedRefinements] = useState(new Set());
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef(null);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [echo, setEcho] = useState({
    name: "Voxis",
    body: "Hi. I'm Voxis — your adaptive personality architect and cognitive companion. I can help you create entirely new personas through natural conversation, or modify existing ones (e.g. make Rick more sarcastic, add nervous habits, etc.). What would you like to build or evolve today?",
    error: false
  });
  const [echoStreaming, setEchoStreaming] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [ttsBusy, setTtsBusy] = useState(false);
  const [constellationMode, setConstellationMode] = useState(false);
  const [pendingGuideAction, setPendingGuideAction] = useState(null);
  const [recentGuideActions, setRecentGuideActions] = useState([]);
  const [isCreatingPersona, setIsCreatingPersona] = useState(false);
  const [previewCreationSpec, setPreviewCreationSpec] = useState(null);

  // Reset create mode when a persona is selected externally
  useEffect(() => {
    if (personality && isCreatingPersona) {
      setIsCreatingPersona(false);
    }
  }, [personality]);
  const recognitionRef = useRef(null);
  const echoAbortRef = useRef(null);
  const ttsAbortRef = useRef(null);
  const audioRef = useRef(null);
  const audioUrlRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const analyserDataRef = useRef(null);
  const audioLevelRef = useRef(0);
  const levelRafRef = useRef(0);
  const flaresRef = useRef({});
  const traitKeywordsRef = useRef([]);
  const replyTextRef = useRef("");
  const lastSpokenIndexRef = useRef(0);

  const effectivePersonalityForOrbs = isCreatingPersona 
    ? (previewCreationSpec ? { traits: previewCreationSpec.traits || [], coreValues: [] } : null) 
    : personality;
  const traits = useMemo(() => selectOrbitalTraits(effectivePersonalityForOrbs), [effectivePersonalityForOrbs, isCreatingPersona, previewCreationSpec]);

  // Trait colors for waveform tags - show up as traits are added
  const TRAIT_COLORS = [
    [255, 43, 214],   // Dominance
    [188, 82, 255],   // Obsession
    [38, 255, 255],   // Loyalty
    [255, 103, 103],  // Deviance
    [255, 197, 78],   // Confidence
  ];
  const activeTraitColors = traits.length > 0 
    ? TRAIT_COLORS.slice(0, Math.min(traits.length, 5))
    : [[170, 176, 230]]; // default other

  // Pass isCreatingPersona down so OrbitalArray can use it without scope error
  const orbitalProps = {
    isCreatingPersona: isCreatingPersona,
  };

  // When creating new, clear orbs visualization
  const showOrbs = !isCreatingPersona && traits.length > 0;

  useEffect(() => {
    traitKeywordsRef.current = traits
      .map((trait) => {
        const keys = String(trait || "")
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((w) => w.length >= 3);
        const unique = Array.from(new Set(keys));
        if (!unique.length) return { trait, re: null };
        const escaped = unique.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
        return { trait, re: new RegExp(`\\b(?:${escaped.join("|")})`, "i") };
      })
      .filter((entry) => entry.re);
  }, [traits]);
  const stats = useMemo(() => computeStats([...(personality?.traits || []), ...(personality?.coreValues || [])]), [
    personality,
  ]);
  const mood = useMemo(() => deriveMood(stats), [stats]);
  const coreLabel = useMemo(() => deriveCoreLabel(personality), [personality]);

  const showToast = (text, isError = false) => {
    setToast({ text, isError });
    setTimeout(() => setToast(null), 3600);
  };

  const handleSelectOrbital = (trait) => {
    if (activeTrait && activeTrait.toLowerCase() === String(trait).toLowerCase()) {
      clearRefinements();
      return;
    }
    const options = lookupRefinements(trait);
    setActiveTrait(trait);
    setPendingSeed(trait);
    setRefinements(options);
    setRefinePrompt(
      options.length
        ? `Refine "${trait}" — check the flavors you want and hit Lock In.`
        : `No preset variants for "${trait}" yet. Ask the forge for trait or quirk suggestions.`,
    );
    setCheckedRefinements(new Set());
  };

  const clearRefinements = () => {
    setActiveTrait(null);
    setRefinements([]);
    setPendingSeed("");
    setRefinePrompt("");
    setCheckedRefinements(new Set());
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") {
        return;
      }

      if (echo) {
        if (echoAbortRef.current) {
          try {
            echoAbortRef.current.abort();
          } catch {
            /* ignore */
          }
        }
        stopSpeaking();
        setEcho(null);
        setEchoStreaming(false);
      }

      if (activeTrait || refinements.length) {
        clearRefinements();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTrait, echo, refinements.length]);

  const handleToggleRefinement = (label) => {
    setCheckedRefinements((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const handleLockIn = async () => {
    const toAdd = refinements.filter((r) => checkedRefinements.has(r.label));
    if (!toAdd.length) return;
    let anyAdded = false;
    for (const r of toAdd) {
      const ok = await submitTraitToBackend(r.label);
      if (ok) anyAdded = true;
    }
    if (anyAdded) {
      const names = toAdd.map((r) => r.label).join(", ");
      clearRefinements();
      sendForgeMessage(
        `The forge just welded these traits into you: ${names}. React in character — embody them.`
      );
    }
  };

  const submitTraitToBackend = async (newTrait) => {
    if (!personality?.id) {
      showToast("Select a persona first to forge new traits.", true);
      return false;
    }
    const cleaned = newTrait.trim();
    if (!cleaned) return false;

    const existing = Array.isArray(personality.traits) ? personality.traits : [];
    const exists = existing.some((t) => t.trim().toLowerCase() === cleaned.toLowerCase());
    if (exists) {
      showToast(`"${cleaned}" is already part of ${personality.name}.`);
      return false;
    }

    const nextTraits = [...existing, cleaned];
    setBusy(true);
    try {
      const res = await authFetch(`/personality/${personality.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ traits: nextTraits }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Failed (${res.status})`);
      }
      const updated = await res.json();
      onPersonalityUpdated?.(updated);
      showToast(`Forged "${cleaned}" into ${personality.name}.`);
      return true;
    } catch (err) {
      showToast(err.message || "The forge sparked but failed.", true);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const stopLevelLoop = () => {
    if (levelRafRef.current) {
      cancelAnimationFrame(levelRafRef.current);
      levelRafRef.current = 0;
    }
    audioLevelRef.current = 0;
  };

  const startLevelLoop = () => {
    stopLevelLoop();
    const tick = () => {
      const analyser = analyserRef.current;
      const data = analyserDataRef.current;
      if (!analyser || !data) {
        audioLevelRef.current = 0;
        return;
      }
      analyser.getByteTimeDomainData(data);
      let sumSq = 0;
      for (let i = 0; i < data.length; i += 1) {
        const v = (data[i] - 128) / 128;
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / data.length);
      const target = clamp(rms * 2.4, 0, 1);
      audioLevelRef.current = audioLevelRef.current * 0.55 + target * 0.45;

      const audio = audioRef.current;
      const text = replyTextRef.current;
      if (audio && text && audio.duration > 0 && Number.isFinite(audio.duration)) {
        const progress = clamp(audio.currentTime / audio.duration, 0, 1);
        const idx = Math.floor(progress * text.length);
        if (idx > lastSpokenIndexRef.current) {
          const slice = text.slice(lastSpokenIndexRef.current, idx);
          const now = performance.now();
          for (const { trait, re } of traitKeywordsRef.current) {
            if (re.test(slice)) {
              const last = flaresRef.current[trait] || 0;
              if (now - last > 350) {
                flaresRef.current[trait] = now;
              }
            }
          }
          lastSpokenIndexRef.current = idx;
        }
      }

      levelRafRef.current = requestAnimationFrame(tick);
    };
    levelRafRef.current = requestAnimationFrame(tick);
  };

  const ensureAnalyser = (audioEl) => {
    if (analyserRef.current) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const source = ctx.createMediaElementSource(audioEl);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      analyserDataRef.current = new Uint8Array(analyser.fftSize);
    } catch {
      /* analyser optional — playback still works without it */
    }
  };

  const stopSpeaking = () => {
    if (ttsAbortRef.current) {
      try {
        ttsAbortRef.current.abort();
      } catch {
        /* ignore */
      }
      ttsAbortRef.current = null;
    }
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    stopLevelLoop();
    replyTextRef.current = "";
    lastSpokenIndexRef.current = 0;
    setIsSpeaking(false);
    setTtsBusy(false);
  };

  const speakText = async (text) => {
    const cleaned = (text || "").trim();
    if (!cleaned) return;

    stopSpeaking();

    // Force cheap browser system voice for the entire guide tab (tinkering area)
    // Later can pivot to Piper/Kokoro via /tts with a system profile
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(cleaned);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      utterance.volume = 0.85;
      setIsSpeaking(true);
      // ensure level pulses for the waveform visual during browser speech
      const pulse = setInterval(() => {
        audioLevelRef.current = 0.25 + Math.random() * 0.6;
      }, 90);
      utterance.onend = () => {
        clearInterval(pulse);
        setIsSpeaking(false);
        stopLevelLoop();
      };
      utterance.onerror = () => {
        clearInterval(pulse);
        setIsSpeaking(false);
        stopLevelLoop();
      };
      startLevelLoop();
      window.speechSynthesis.speak(utterance);
      return;
    }

    if (!personality?.id) return;

    const controller = new AbortController();
    ttsAbortRef.current = controller;
    setTtsBusy(true);

    replyTextRef.current = cleaned.toLowerCase();
    lastSpokenIndexRef.current = 0;
    flaresRef.current = {};

    const voiceProfile = personality.voiceProfile || {};

    try {
      const response = await authFetch(`/personality/${personality.id}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: cleaned, voiceProfile }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let errMsg = `TTS failed (${response.status})`;
        try {
          const errBody = await response.json();
          errMsg = errBody.error || errMsg;
        } catch {
          /* ignore */
        }
        showToast(errMsg, true);
        setTtsBusy(false);
        ttsAbortRef.current = null;
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;

      if (!audioRef.current) {
        const el = new Audio();
        el.crossOrigin = "anonymous";
        audioRef.current = el;
      }
      const audio = audioRef.current;
      audio.src = url;
      ensureAnalyser(audio);
      if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
        try {
          await audioCtxRef.current.resume();
        } catch {
          /* ignore */
        }
      }
      audio.onplay = () => {
        setIsSpeaking(true);
        startLevelLoop();
      };
      audio.onpause = () => {
        stopLevelLoop();
      };
      audio.onended = () => {
        setIsSpeaking(false);
        stopLevelLoop();
        if (audioUrlRef.current) {
          URL.revokeObjectURL(audioUrlRef.current);
          audioUrlRef.current = null;
        }
      };
      audio.onerror = () => {
        setIsSpeaking(false);
        stopLevelLoop();
      };

      await audio.play().catch((err) => {
        showToast(err.message || "Browser blocked playback.", true);
      });
    } catch (err) {
      if (err.name !== "AbortError") {
        showToast(err.message || "TTS failed.", true);
      }
    } finally {
      setTtsBusy(false);
      ttsAbortRef.current = null;
    }
  };

  const sendForgeMessage = async (message, options = {}) => {
    const text = message.trim();
    if (!text) return;
    // Guide mode can work without a selected personality (for pure creation)

    if (echoAbortRef.current) {
      try {
        echoAbortRef.current.abort();
      } catch {
        /* ignore */
      }
    }
    const controller = new AbortController();
    echoAbortRef.current = controller;

    stopSpeaking();
    if (!isCreatingPersona) {
      setEcho({ name: "Voxis", body: "Hi. I'm Voxis — your personality architect and cognitive companion. I can help you create new personas from scratch through conversation, or modify existing ones (like making Rick more sarcastic). What would you like to build or change today?", error: false });
    }
    setEchoStreaming(true);
    let finalReply = "";
    let finalRefinementSuggestions = [];

    try {
      const response = await authFetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personalityId: 'voxis-guide',  // Dedicated "persona" ID for the privileged Voxis architect/guide in this tab only
          userId: userId ?? undefined,
          mode,
          message: text,
          streamDebug: true,
          guideMode: true,           // Use the special Voxis guide meta-persona
          useVoxisGuide: true,
          recentGuideActions: recentGuideActions.slice(-5),
          createMode: isCreatingPersona,
          // Better context passing for the guide
          allPersonas: personalities.map(p => ({
            id: p.id,
            name: p.name,
            description: (p.description || "").slice(0, 200),
            traits: (p.traits || []).slice(0, 5),
          })),
          currentPersonaContext: personality ? {
            id: personality.id,
            name: personality.name,
            traits: personality.traits || [],
            behaviorRules: personality.behaviorRules || [],
          } : null,
        }),
        signal: controller.signal,
      });

      const contentType = response.headers.get("content-type") || "";

      if (!response.ok) {
        let errMsg = `Forge link failed (${response.status})`;
        try {
          const errBody = await response.json();
          errMsg = errBody.error || errMsg;
        } catch {
          /* ignore */
        }
        setEcho({ name: "Voxis", body: errMsg, error: true });
        setEchoStreaming(false);
        return;
      }

      if (contentType.includes("text/event-stream") && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulated = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() || "";
          for (const raw of events) {
            const lines = raw.split("\n");
            let eventName = "message";
            let dataLine = "";
            for (const ln of lines) {
              if (ln.startsWith("event:")) eventName = ln.slice(6).trim();
              else if (ln.startsWith("data:")) dataLine += ln.slice(5).trim();
            }
            if (!dataLine) continue;
            let payload = null;
            try {
              payload = JSON.parse(dataLine);
            } catch {
              continue;
            }
            if (eventName === "token" && typeof payload.delta === "string") {
              accumulated += payload.delta;
              setEcho({ name: "Voxis", body: accumulated, error: false });
            } else if (eventName === "final" && typeof payload.reply === "string") {
              accumulated = payload.reply;
              finalReply = payload.reply;
              if (Array.isArray(payload.refinementSuggestions)) {
                finalRefinementSuggestions = payload.refinementSuggestions;
              }
              setEcho({ name: "Voxis", body: accumulated, error: false });
            } else if (eventName === "error") {
              setEcho({
                name: "Voxis",
                body: payload.error || "Forge link failed.",
                error: true,
              });
            }
          }
        }
        if (!finalReply) finalReply = accumulated;
      } else {
        const data = await response.json();
        finalReply = data.reply || "";
        if (Array.isArray(data.refinementSuggestions)) {
          finalRefinementSuggestions = data.refinementSuggestions;
        }
        setEcho({
          name: "Voxis",
          body: data.reply || "(silence from the forge)",
          error: false,
        });
      }

      // Parse Voxis guide actions but do NOT execute yet - show confirmation UI
      if (finalReply) {
        const action = parseVoxisGuideAction(finalReply);
        if (action) {
          setPendingGuideAction(action);
          if (action.action === "create_persona" && action.spec) {
            setPreviewCreationSpec(action.spec);
          }
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        setEcho({
          name: personality.name,
          body: err.message || "Forge link failed.",
          error: true,
        });
      }
    } finally {
      setEchoStreaming(false);
      echoAbortRef.current = null;
      if (options.populateRefinementsFromReply && finalReply) {
        if (finalRefinementSuggestions.length) {
          setActiveTrait(options.seedText || null);
          setPendingSeed(options.seedText || "");
          setRefinements(finalRefinementSuggestions);
          setCheckedRefinements(new Set());
          setRefinePrompt(
            finalRefinementSuggestions.some((item) => item.tag === "Clarify")
              ? "The forge asked for clarification. Select what to lock in."
              : "The forge suggested these trait/quirk refinements. Select what to lock in.",
          );
        } else {
          clearRefinements();
        }
      }
      if (autoSpeak && finalReply) {
        void speakText(finalReply);
      }
    }
  };

  const handlePickRefinement = async (refinement) => {
    const ok = await submitTraitToBackend(refinement.label);
    if (ok) {
      clearRefinements();
      sendForgeMessage(
        `The forge just welded a new trait into you: "${refinement.label}". React in character — embody it.`,
      );
    }
  };

  // Parse action from Voxis response (does not execute)
  function parseVoxisGuideAction(text) {
    if (!text) return null;
    try {
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/i) || text.match(/\{[\s\S]*"action"[\s\S]*\}/i);
      if (!jsonMatch) return null;
      const actionData = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      if (!actionData?.action) return null;
      return actionData;
    } catch {
      return null;
    }
  }

  // Execute a confirmed action (called from confirmation UI)
  const executeGuideAction = async (actionData) => {
    if (!actionData) return;

    try {
      if (actionData.action === "create_persona" && actionData.spec) {
        const spec = actionData.spec;
        if (!spec.name || !spec.description) {
          showToast("Missing name or description.", true);
          return;
        }
        showToast("Voxis is creating the persona...");

        const res = await authFetch("/personality", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: spec.name,
            description: spec.description,
            traits: spec.traits || [],
            behaviorRules: spec.behaviorRules || [],
            quirks: spec.quirks || [],
            speechStyle: spec.speechStyle || "",
            creativeContext: spec.creativeContext || "default",
            goals: spec.goals || [],
            coreValues: spec.coreValues || [],
          }),
        });

        if (res.ok) {
          const created = await res.json();
          showToast(`Persona "${created.name}" created!`);
          if (onPersonalityUpdated) onPersonalityUpdated(created);
          if (onSelectPersonality && created.id) {
            setTimeout(() => onSelectPersonality(created.id), 600);
          }
          setRecentGuideActions(prev => [...prev, { type: "create", name: created.name, time: Date.now() }].slice(-10));
          setPendingGuideAction(null);
          setIsCreatingPersona(false);
          setPreviewCreationSpec(null);
          // Tell Voxis it succeeded
          void sendForgeMessage(`The persona was created successfully.`);
        } else {
          const err = await res.json().catch(() => ({}));
          showToast(err.error || "Creation failed.", true);
        }
      }

      if (actionData.action === "update_persona" && actionData.changes) {
        const targetId = actionData.targetId || (personality && personality.id);
        if (!targetId) {
          showToast("No target persona selected for update.", true);
          return;
        }

        showToast("Applying Voxis changes...");

        const currentRes = await authFetch(`/personality/${targetId}`);
        if (!currentRes.ok) {
          showToast("Could not fetch current persona.", true);
          return;
        }
        const current = await currentRes.json();
        const merged = { ...current };

        const ch = actionData.changes;
        if (ch.traits) merged.traits = [...new Set([...(current.traits || []), ...ch.traits])];
        if (ch.behaviorRules) merged.behaviorRules = [...new Set([...(current.behaviorRules || []), ...ch.behaviorRules])];
        if (ch.quirks) merged.quirks = [...new Set([...(current.quirks || []), ...ch.quirks])];
        if (ch.speechStyle) merged.speechStyle = ch.speechStyle;
        if (ch.description) merged.description = ch.description;

        const updateRes = await authFetch(`/personality/${targetId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(merged),
        });

        if (updateRes.ok) {
          const updated = await updateRes.json();
          showToast(`Updated ${updated.name || "persona"}.`);
          if (onPersonalityUpdated) onPersonalityUpdated(updated);
          setRecentGuideActions(prev => [...prev, { type: "update", target: updated.name || actionData.targetName, changes: Object.keys(actionData.changes || {}), time: Date.now() }].slice(-10));
          setPendingGuideAction(null);
          void sendForgeMessage(`The changes were applied successfully.`);
        } else {
          const err = await updateRes.json().catch(() => ({}));
          showToast(err.error || "Update failed.", true);
        }
      }
    } catch (e) {
      console.error("Action execution error", e);
      showToast("Something went wrong applying the action.", true);
    }
  };

  // Legacy wrapper for any old calls
  const handleVoxisGuideActions = async (text) => {
    const action = parseVoxisGuideAction(text);
    if (action) setPendingGuideAction(action);
  };

  const handleSpeakSubmit = (event) => {
    event.preventDefault();
    const value = inputValue.trim();
    if (!value) return;
    setInputValue("");
    clearRefinements();
    sendForgeMessage(value, {
      populateRefinementsFromReply: true,
      seedText: value,
    });
  };

  const startListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setListening(true);
      showToast("Voice capture isn't available in this browser. Type instead.", true);
      setTimeout(() => setListening(false), 1400);
      return;
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onstart = () => setListening(true);
    rec.onresult = (event) => {
      const text = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join(" ");
      setInputValue(text);
    };
    rec.onerror = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    rec.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = rec;
    rec.start();
  };

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          /* ignore */
        }
      }
      if (echoAbortRef.current) {
        try {
          echoAbortRef.current.abort();
        } catch {
          /* ignore */
        }
      }
      if (ttsAbortRef.current) {
        try {
          ttsAbortRef.current.abort();
        } catch {
          /* ignore */
        }
      }
      if (audioRef.current) {
        try {
          audioRef.current.pause();
        } catch {
          /* ignore */
        }
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
      if (levelRafRef.current) {
        cancelAnimationFrame(levelRafRef.current);
        levelRafRef.current = 0;
      }
      if (audioCtxRef.current) {
        try {
          audioCtxRef.current.close();
        } catch {
          /* ignore */
        }
        audioCtxRef.current = null;
        analyserRef.current = null;
        analyserDataRef.current = null;
      }
    };
  }, []);

  const intensity = useMemo(() => {
    const sum = Object.values(stats).reduce((a, b) => a + b, 0);
    return clamp(sum / (Object.keys(stats).length * 100) + 0.1, 0.2, 1);
  }, [stats]);

  const showSelector = !personality && personalities.length > 0;

  return (
    <div className="forge">
      <style>{forgeStyles}</style>

      <header className="forge-header">
        <div className="forge-title">Personality Forge</div>
        <div className="forge-link">Neural Link · Stable</div>
      </header>

      {showSelector ? (
        <div className="forge-toast">
          Select a persona on the left to begin forging — or use the form to create one first.
        </div>
      ) : null}

      {toast ? (
        <div className={`forge-toast ${toast.isError ? "is-error" : ""}`}>{toast.text}</div>
      ) : null}

      {echo ? (
        <div className={`persona-echo ${echo.error ? "persona-echo-error" : ""}`}>
          <button
            type="button"
            className="persona-echo-dismiss"
            aria-label="Dismiss persona response"
            onClick={() => {
              if (echoAbortRef.current) {
                try {
                  echoAbortRef.current.abort();
                } catch {
                  /* ignore */
                }
              }
              stopSpeaking();
              setEcho(null);
              setEchoStreaming(false);
            }}
          >
            ×
          </button>
          <div className="persona-echo-head">
            <span className="echo-name">{echo.name}</span>
            <span>{echo.error ? "Forge link error" : "responds in character"}</span>
            <div className="persona-echo-controls">
              <button
                type="button"
                className={`echo-speak-toggle ${autoSpeak ? "is-on" : ""} ${
                  isSpeaking ? "is-speaking" : ""
                }`}
                onClick={() => {
                  const next = !autoSpeak;
                  setAutoSpeak(next);
                  if (!next) stopSpeaking();
                  else if (echo?.body && !echoStreaming && !echo.error) {
                    void speakText(echo.body);
                  }
                }}
                disabled={ttsBusy && autoSpeak}
                aria-pressed={autoSpeak}
              >
                {isSpeaking ? "◉ Speaking" : ttsBusy ? "◌ Synth" : autoSpeak ? "◉ Voice" : "○ Muted"}
              </button>
            </div>
          </div>
          <div
            className={`persona-echo-body ${echoStreaming && !echo.error ? "is-thinking" : ""}`}
          >
            {echo.body || (echoStreaming ? "" : "(no reply)")}
          </div>
        </div>
      ) : null}

      {/* Home Base Header for Voxis Guide */}
      <div style={{ margin: "12px 22px 4px", padding: "4px 12px", borderBottom: "1px solid rgba(0,180,255,0.3)", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: "#26ffff", fontWeight: 700, letterSpacing: "1px" }}>VOXIS GUIDE</span>
        <span style={{ fontSize: "0.6rem", opacity: 0.5 }}>— home base for persona creation & evolution</span>
      </div>

      {isCreatingPersona && (
        <>
          <div style={{
            margin: "0 22px 12px",
            padding: "10px 16px",
            background: "linear-gradient(90deg, rgba(0,180,255,0.2), rgba(38,255,255,0.1))",
            border: "2px solid #26ffff",
            borderRadius: 10,
            fontSize: "0.95rem",
            color: "#26ffff",
            display: "flex",
            alignItems: "center",
            gap: 10,
            boxShadow: "0 0 12px rgba(38,255,255,0.3)",
            fontWeight: 500
          }}>
            <span style={{ fontSize: "1.1rem" }}>🎨</span>
            <div style={{ flex: 1 }}>
              <strong>PERSONA CREATION MODE</strong><br />
              <span style={{ fontSize: "0.75rem", opacity: 0.9 }}>Voxis is guiding you interactively — describe or answer to build the persona</span>
            </div>
            <button 
              onClick={() => {
                setIsCreatingPersona(false);
                setPreviewCreationSpec(null);
                setEcho({ name: "Voxis", body: "Exited creation mode. How else can I help with personas today?", error: false });
              }}
              style={{ 
                padding: "4px 12px", 
                fontSize: "0.7rem", 
                borderRadius: 6, 
                border: "1px solid #26ffff", 
                background: "rgba(0,0,0,0.3)", 
                color: "#26ffff", 
                cursor: "pointer",
                whiteSpace: "nowrap"
              }}
            >
              Exit Mode
            </button>
          </div>

          {/* Step indicators */}
          <div style={{ margin: "0 22px 8px", display: 'flex', gap: 4, fontSize: '0.65rem' }}>
            {['Concept', 'Traits', 'Quirks/Style', 'SFX/Voice', 'Finalize'].map((step, idx) => {
              const done = (idx === 0 && previewCreationSpec?.name) ||
                           (idx === 1 && (previewCreationSpec?.traits?.length || 0) > 0) ||
                           (idx === 2 && (previewCreationSpec?.quirks?.length || 0) > 0) ||
                           (idx === 3 && previewCreationSpec?.speechStyle) ||
                           (idx === 4 && pendingGuideAction);
              return (
                <div key={idx} style={{
                  padding: '2px 8px',
                  background: done ? 'rgba(0,255,100,0.2)' : 'rgba(255,255,255,0.1)',
                  border: done ? '1px solid #0f0' : '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 4,
                  color: done ? '#0f0' : '#ccc'
                }}>
                  {idx+1}. {step}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Voxis Guide Home Base controls */}
      <div style={{ margin: "0 22px 12px", display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={() => {
            setIsCreatingPersona(true);
            clearRefinements();
            setPendingGuideAction(null);
            // Clear orbs for new creation
            // (the orbital will show empty because we use effectivePersonality below)
            const starter = "Let's enter persona creation mode. I'm ready to build a brand new persona from scratch with you. Please confirm we are in create mode and ask me the first question: what kind of personality or vibe are we going for?";
            setEcho({ name: "Voxis", body: starter, error: false });
            // Kick off the actual interactive conversation
            sendForgeMessage(starter);
            // Focus input for back-and-forth
            setTimeout(() => inputRef.current?.focus(), 100);
            // Make sure Voxis acknowledges create mode in its first response
            // (the starter message and createMode flag + prompt will encourage it)
          }}
          style={{ padding: "6px 12px", borderRadius: 8, background: "rgba(0,180,255,0.2)", color: "#26ffff", border: "1px solid #26ffff", cursor: "pointer", fontSize: "0.75rem" }}
        >
          + Create New Persona
        </button>
        {isCreatingPersona && (
          <button
            onClick={() => {
              sendForgeMessage("I'm ready to lock this in. Please output the final JSON action spec for my confirmation.");
            }}
            style={{ padding: "6px 12px", borderRadius: 8, background: "rgba(0,255,100,0.2)", color: "#0f0", border: "1px solid #0f0", cursor: "pointer", fontSize: "0.75rem" }}
          >
            I'm ready to lock this in
          </button>
        )}
        <button
          onClick={() => {
            if (personality) {
              setEcho({ name: "Voxis", body: `What would you like to change about ${personality.name}? (e.g. "make them more sarcastic", "add a dark secret", "tone down the aggression")`, error: false });
              sendForgeMessage(`I want to modify ${personality.name}. Let's discuss changes interactively.`);
            } else {
              setEcho({ name: "Voxis", body: "Select or name a persona first, then tell me what to tweak.", error: false });
            }
            setPendingGuideAction(null);
          }}
          style={{ padding: "6px 12px", borderRadius: 8, background: "rgba(255,43,214,0.15)", color: "#ff2bd6", border: "1px solid #ff2bd6", cursor: "pointer", fontSize: "0.75rem" }}
          disabled={!personality}
        >
          Modify Current
        </button>
        {recentGuideActions.length > 0 && (
          <span style={{ fontSize: "0.65rem", opacity: 0.6, alignSelf: "center" }}>
            {recentGuideActions.length} recent change{recentGuideActions.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Confirmation UI for Voxis guide actions - robust, user-controlled */}
      {pendingGuideAction && (
        <div style={{
          margin: "12px 22px",
          padding: 16,
          borderRadius: 12,
          background: "rgba(0, 30, 60, 0.85)",
          border: "1px solid #26ffff",
          color: "#f5e9ff"
        }}>
          <div style={{ fontWeight: 700, marginBottom: 8, color: "#26ffff" }}>
            Voxis proposes an action - Review before applying
          </div>
          
          {pendingGuideAction.action === "create_persona" && pendingGuideAction.spec && (
            <div style={{ marginBottom: 12 }}>
              <strong>Create new persona:</strong><br />
              <strong>Name:</strong> {pendingGuideAction.spec.name}<br />
              <strong>Description:</strong> {pendingGuideAction.spec.description?.slice(0,150)}...<br />
              <strong>Traits:</strong> {(pendingGuideAction.spec.traits || []).join(", ")}<br />
              <strong>Behavior:</strong> {(pendingGuideAction.spec.behaviorRules || []).join(" | ")}
            </div>
          )}
          
          {pendingGuideAction.action === "update_persona" && (
            <div style={{ marginBottom: 12 }}>
              <strong>Update persona:</strong> {pendingGuideAction.targetName || "selected"}<br />
              <strong>Changes:</strong><br />
              {Object.entries(pendingGuideAction.changes || {}).map(([k,v]) => (
                <div key={k}>- {k}: {Array.isArray(v) ? v.join(", ") : String(v)}</div>
              ))}
            </div>
          )}
          
          <pre style={{ fontSize: "0.7rem", background: "rgba(0,0,0,0.3)", padding: 8, borderRadius: 4, overflow: "auto", maxHeight: 120, margin: "8px 0" }}>
            {JSON.stringify(pendingGuideAction, null, 2)}
          </pre>
          
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button
              onClick={() => {
                executeGuideAction(pendingGuideAction);
              }}
              style={{
                padding: "8px 16px",
                background: "#0f0",
                color: "black",
                border: "none",
                borderRadius: 8,
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              Confirm & Apply
            </button>
            <button
              onClick={() => {
                setPendingGuideAction(null);
                setPreviewCreationSpec(null);
                void sendForgeMessage("I decided not to apply that action yet. Let's discuss it more or adjust the details.");
              }}
              style={{
                padding: "8px 16px",
                background: "transparent",
                color: "#ff2bd6",
                border: "1px solid #ff2bd6",
                borderRadius: 8,
                cursor: "pointer"
              }}
            >
              Cancel / Discuss
            </button>
          </div>
          <div style={{ fontSize: "0.65rem", opacity: 0.65, marginTop: 6 }}>
            This is a preview. Voxis will be notified of your decision.
          </div>
        </div>
      )}

      {/* Live spec editor - sidebar-like when creating */}
      {isCreatingPersona && (
        <div style={{
          margin: "0 22px 12px",
          padding: 12,
          background: "rgba(0,255,100,0.08)",
          border: "1px solid #0f0",
          borderRadius: 8,
          fontSize: "0.8rem"
        }}>
          <div style={{ color: "#0f0", fontWeight: 600, marginBottom: 6 }}>Live Spec Editor (edit to refine)</div>
          <div style={{ display: 'grid', gap: 6 }}>
            <input 
              placeholder="Name" 
              value={previewCreationSpec?.name || ''} 
              onChange={(e) => {
                const newSpec = { ...(previewCreationSpec || {}), name: e.target.value };
                setPreviewCreationSpec(newSpec);
              }}
              style={{ background: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid #0f0', padding: 4, borderRadius: 4 }}
            />
            <textarea 
              placeholder="Description" 
              value={previewCreationSpec?.description || ''} 
              onChange={(e) => {
                const newSpec = { ...(previewCreationSpec || {}), description: e.target.value };
                setPreviewCreationSpec(newSpec);
              }}
              style={{ background: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid #0f0', padding: 4, borderRadius: 4, minHeight: 40 }}
            />
            <input 
              placeholder="Traits (comma separated)" 
              value={(previewCreationSpec?.traits || []).join(', ')} 
              onChange={(e) => {
                const newTraits = e.target.value.split(',').map(t => t.trim()).filter(Boolean);
                const newSpec = { ...(previewCreationSpec || {}), traits: newTraits };
                setPreviewCreationSpec(newSpec);
              }}
              style={{ background: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid #0f0', padding: 4, borderRadius: 4 }}
            />
            <input 
              placeholder="Behavior Rules (comma separated)" 
              value={(previewCreationSpec?.behaviorRules || []).join(', ')} 
              onChange={(e) => {
                const newRules = e.target.value.split(',').map(t => t.trim()).filter(Boolean);
                const newSpec = { ...(previewCreationSpec || {}), behaviorRules: newRules };
                setPreviewCreationSpec(newSpec);
              }}
              style={{ background: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid #0f0', padding: 4, borderRadius: 4 }}
            />
          </div>
          <div style={{ fontSize: '0.65rem', marginTop: 4, opacity: 0.7 }}>
            Edits here update the preview. Click "I'm ready to lock this in" to send to Voxis.
          </div>
        </div>
      )}

      {/* Surface current creation spec */}
      {isCreatingPersona && previewCreationSpec && !true && ( // hidden now, integrated above
        <div style={{
          margin: "0 22px 12px",
          padding: 12,
          background: "rgba(0,255,100,0.08)",
          border: "1px solid #0f0",
          borderRadius: 8,
          fontSize: "0.8rem"
        }}>
          <div style={{ color: "#0f0", fontWeight: 600, marginBottom: 6 }}>Current Proposed Spec (from Voxis)</div>
          <div><strong>Name:</strong> {previewCreationSpec.name}</div>
          <div><strong>Traits:</strong> {(previewCreationSpec.traits || []).join(", ") || "—"}</div>
          <div><strong>Behavior:</strong> {(previewCreationSpec.behaviorRules || []).join(" | ") || "—"}</div>
          {previewCreationSpec.speechStyle && <div><strong>Speech:</strong> {previewCreationSpec.speechStyle}</div>}
        </div>
      )}

      {/* Home base - History of changes */}
      {recentGuideActions.length > 0 && (
        <div style={{ 
          margin: "0 22px 12px", 
          padding: "8px 12px", 
          background: "rgba(10,20,40,0.6)", 
          borderRadius: 8,
          fontSize: "0.7rem",
          border: "1px solid rgba(0,180,255,0.2)"
        }}>
          <div style={{ color: "#26ffff", marginBottom: 4, fontWeight: 600 }}>Recent Forge Actions</div>
          {recentGuideActions.slice(-5).reverse().map((a, i) => (
            <div key={i} style={{ opacity: 0.8, margin: "2px 0" }}>
              {new Date(a.time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} — {a.type} {a.name || a.target || "persona"}
              {a.changes ? ` (${a.changes.join(', ')})` : ""}
            </div>
          ))}
        </div>
      )}

      <div className="forge-footer">
        <div className="footer-wave">
          <FooterMiniWave listening={listening} />
        </div>
        <form className="speak-row" onSubmit={handleSpeakSubmit}>
          <div className="speak-row-status">
            {activeTrait ? (
              <>
                Focus Trait <strong>{activeTrait}</strong>
              </>
            ) : (
              <>Speak a trait, mood, or behavior to seed the forge.</>
            )}
          </div>
          <button
            type="button"
            className={`mic-button ${listening ? "is-listening" : ""}`}
            onClick={startListening}
            aria-label="Speak to the Forge"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 14c1.66 0 3-1.34 3-3V5a3 3 0 1 0-6 0v6c0 1.66 1.34 3 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z"
                fill="currentColor"
              />
            </svg>
          </button>
          <input
            className="speak-input"
            type="text"
            placeholder={isCreatingPersona ? "Tell Voxis about the new persona or answer its questions..." : "Speak to the Forge…"}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={busy}
            ref={inputRef}
          />
          <button type="submit" className="speak-submit" disabled={busy || !inputValue.trim()}>
            Forge
          </button>
        </form>
      </div>

      <div className="forge-body">
        <section className={`forge-panel refine-panel ${refinements.length === 0 ? "is-hidden" : ""}`}>
          <h3 className="forge-panel-title">Refine</h3>
          {refinements.length === 0 ? (
            <p className="forge-panel-empty">
              Click a trait orb on the right to summon refinement options.
            </p>
          ) : (
            <>
              <div className="refine-prompt">{refinePrompt}</div>
              <div className="refine-options">
                {refinements.map((r) => {
                  const checked = checkedRefinements.has(r.label);
                  return (
                    <button
                      key={r.label}
                      type="button"
                      className={`refine-check-row ${checked ? "is-checked" : ""}`}
                      onClick={() => handleToggleRefinement(r.label)}
                      disabled={busy}
                    >
                      <div className="refine-checkbox">
                        <div className="refine-checkbox-tick" />
                      </div>
                      <span className="refine-check-label">{r.label}</span>
                      <span className="refine-option-tag">{r.tag}</span>
                    </button>
                  );
                })}
              </div>
              <div className="refine-actions">
                <button
                  type="button"
                  className="refine-lock-btn"
                  onClick={handleLockIn}
                  disabled={busy || checkedRefinements.size === 0}
                >
                  {busy ? "Forging…" : `Lock In${checkedRefinements.size > 0 ? ` (${checkedRefinements.size})` : ""}`}
                </button>
                <button type="button" className="refine-clear" onClick={clearRefinements}>
                  Dismiss
                </button>
              </div>
            </>
          )}
        </section>

        <section className="forge-panel center-panel">
          <h3 className="forge-panel-title">Voice Synapse Matrix</h3>
          <div className="waveform-frame">
            <div 
              className="waveform-tag" 
              style={{ color: `rgb(${activeTraitColors[0 % activeTraitColors.length].join(',')})` }}
            >
              Live Input
            </div>
            <div 
              className="waveform-tag-right" 
              style={{ color: `rgb(${activeTraitColors[1 % activeTraitColors.length].join(',')})` }}
            >
              Cortex Feed
            </div>
            <Waveform
              intensity={intensity}
              listening={listening}
              seed={traits.length}
              speaking={isSpeaking}
              levelRef={audioLevelRef}
            />
            <div className="waveform-meta">
              <div>
                Frequency
                <strong>{(7.4 + intensity * 1.6).toFixed(2)} kHz</strong>
              </div>
              <div>
                Emotion
                <strong>{intensity > 0.6 ? "Dominant" : "Forming"}</strong>
              </div>
              <div>
                Intent
                <strong>{activeTrait ? "Refining" : "Transform"}</strong>
              </div>
            </div>
          </div>

          <div className="stats-grid">
            {Object.entries(stats).map(([key, value]) => (
              <div className="stat-row" key={key}>
                <div className="stat-label">{key}</div>
                <div className="stat-bar">
                  <div className="stat-bar-fill" style={{ width: `${value}%` }} />
                </div>
                <div className="stat-value">{value}.{((key.length * value) % 9)}%</div>
              </div>
            ))}
          </div>
        </section>

        <section className="forge-panel orbital-panel">
          <h3 className="forge-panel-title">Trait Orbital Array</h3>
          <div className="orbital-toolbar">
            <button
              type="button"
              className={`orbital-mode-toggle ${constellationMode ? "is-active" : ""}`}
              onClick={() => setConstellationMode((prev) => !prev)}
            >
              Constellation {constellationMode ? "On" : "Off"}
            </button>
          </div>
          {constellationMode && (
            <div className="constellation-legend" aria-label="Constellation categories">
              {CONSTELLATION_LEGEND.map((item) => {
                const rgb = (TRAIT_CATEGORY_COLORS[item.key] || TRAIT_CATEGORY_COLORS.other).join(", ");
                return (
                  <span key={item.key} className="constellation-chip" style={{ "--chip-rgb": rgb }}>
                    <span className="constellation-chip-dot" />
                    {item.label}
                  </span>
                );
              })}
            </div>
          )}
          <p className="orbital-subtitle">
            {activeTrait ? (
              <>
                Refining <strong>{activeTrait}</strong>. Click the orb again or press Escape to clear.
              </>
            ) : traits.length ? (
              <>
                Click any orb to push that trait into the refinement panel.
                {constellationMode ? " Related categories are now linked as a trait constellation." : ""}
              </>
            ) : (
              <>Speak a trait below to seed the array and start shaping the persona.</>
            )}
          </p>
          <OrbitalArray
            traits={traits}
            coreLabel={coreLabel}
            activeTrait={activeTrait}
            onSelectTrait={handleSelectOrbital}
            flaresRef={flaresRef}
            speaking={isSpeaking}
            mood={mood}
            constellationMode={constellationMode}
            isCreatingPersona={isCreatingPersona}
          />
        </section>
      </div>

      <div className="forge-status-bar">
        <span>
          Active Persona <strong>{personality?.name || "—"}</strong>
        </span>
        <span>
          Traits Forged <strong>{personality?.traits?.length || 0}</strong>
        </span>
        <span>
          Focus Trait <strong>{activeTrait || "—"}</strong>
        </span>
        <span>
          Active Protocol <strong>{activeTrait ? "Trait Refinement" : "Personality Forging"}</strong>
        </span>
      </div>
    </div>
  );
}
