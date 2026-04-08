import { useEffect, useMemo, useState } from "react";
import usePrefersReducedMotion from "../hooks/usePrefersReducedMotion.js";
import NeuralCoreRenderer from "./neuralCore/NeuralCoreRenderer.jsx";
import NeuralCoreThreeScene from "./neuralCore/NeuralCoreThreeScene.jsx";
import NeuralSceneV2 from "./neuralCore/NeuralSceneV2.jsx";
import AvatarCore from "./AvatarCore.jsx";
import { usePersonaState } from "../state/PersonaStateContext.jsx";
import { buildMemoryDisplay, normalizeMemoryType, redactMemoryText } from "../lib/memoryPresentation.js";

const neuralStyles = `
  .neural-hud {
    position: absolute;
    right: 30px;
    bottom: 138px;
    z-index: 8;
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-end;
  }

  .neural-mini-preview {
    width: 236px;
    height: 160px;
    border-radius: 14px;
    overflow: hidden;
    border: 1px solid rgba(0, 200, 255, 0.20);
    background: #060c18;
    box-shadow: 0 0 18px rgba(0, 200, 255, 0.10);
    cursor: pointer;
    position: relative;
  }
  .neural-mini-preview canvas {
    display: block;
    pointer-events: none;
  }

  .neural-button {
    width: 72px;
    height: 72px;
    border-radius: 999px;
    border: 0;
    cursor: pointer;
    touch-action: manipulation;
    color: #fff;
    font-weight: 800;
    letter-spacing: 0.03em;
    font-size: 0.62rem;
    text-transform: uppercase;
    box-shadow: 0 0 24px rgba(0, 200, 255, 0.38), 0 0 0 1px rgba(255, 255, 255, 0.18) inset;
    transition: transform 180ms ease, box-shadow 180ms ease;
  }

  .neural-button.kids {
    width: 96px;
    height: 96px;
    font-size: 0.72rem;
  }

  .neural-button:hover {
    transform: scale(1.06);
  }

  .neural-tip {
    padding: 6px 10px;
    border-radius: 999px;
    border: 1px solid rgba(0, 180, 255, 0.22);
    background: rgba(4, 12, 24, 0.76);
    color: #9ad9ff;
    font-size: 0.72rem;
    font-weight: 700;
    backdrop-filter: blur(8px);
  }

  .neural-overlay {
    position: absolute;
    inset: 24px;
    z-index: 10;
    border-radius: 16px;
    border: 1px solid rgba(0, 180, 255, 0.18);
    background:
      radial-gradient(circle at 20% 14%, rgba(0, 200, 255, 0.14), transparent 38%),
      radial-gradient(circle at 82% 86%, rgba(196, 72, 255, 0.14), transparent 44%),
      rgba(4, 10, 22, 0.82);
    backdrop-filter: blur(3px);
    animation: neuralFadeIn 220ms ease;
  }

  .neural-overlay.kids {
    background:
      radial-gradient(circle at 18% 12%, rgba(255, 189, 84, 0.20), transparent 42%),
      radial-gradient(circle at 82% 86%, rgba(125, 231, 185, 0.20), transparent 44%),
      rgba(7, 18, 30, 0.84);
  }

  .neural-overlay.scientist {
    background:
      radial-gradient(circle at 20% 14%, rgba(0, 200, 255, 0.14), transparent 38%),
      radial-gradient(circle at 82% 86%, rgba(196, 72, 255, 0.14), transparent 44%),
      rgba(4, 10, 22, 0.82);
  }

  .neural-topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 14px;
    border-bottom: 1px solid rgba(0, 180, 255, 0.16);
  }

  .neural-title {
    margin: 0;
    font-size: 0.95rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #8ddfff;
  }

  .neural-title-wrap {
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }

  .neural-close {
    border: 1px solid rgba(0, 180, 255, 0.22);
    background: rgba(0, 180, 255, 0.08);
    color: #9ad9ff;
    border-radius: 999px;
    padding: 6px 10px;
    font-weight: 700;
    font-size: 0.74rem;
  }

  .neural-scene {
    position: relative;
    height: calc(100% - 52px);
    min-height: 320px;
    overflow: hidden;
  }

  .neural-scene-camera {
    position: absolute;
    inset: 0;
    transition: transform 420ms cubic-bezier(0.22, 0.82, 0.23, 1);
    transform-origin: center;
  }

  .neural-orb {
    position: absolute;
    border: 0;
    border-radius: 999px;
    transform: translate(-50%, -50%);
    touch-action: manipulation;
    color: #f2f7ff;
    text-shadow: 0 1px 0 rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(6px);
    display: grid;
    place-items: center;
    text-align: center;
    padding: 8px;
    transition: box-shadow 220ms ease, transform 220ms ease;
  }

  .neural-orb.core {
    box-shadow: 0 0 40px rgba(0, 180, 255, 0.42), 0 0 0 1px rgba(255, 255, 255, 0.22) inset;
  }

  .neural-orb.child {
    box-shadow: 0 0 24px rgba(0, 180, 255, 0.32), 0 0 0 1px rgba(255, 255, 255, 0.14) inset;
  }

  .neural-orb.kids-touch {
    min-width: 112px;
    min-height: 112px;
  }

  .neural-orb.pulse {
    animation: neuralPulse 2.1s ease-in-out infinite;
  }

  .neural-label {
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .neural-sub {
    font-size: 0.63rem;
    opacity: 0.8;
    font-weight: 600;
    margin-top: 2px;
  }

  .neural-links {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .neural-sprouts {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: visible;
  }

  .neural-links line {
    stroke: rgba(0, 210, 255, 0.36);
    stroke-width: 1.4;
  }

  .neural-links line.active {
    stroke: rgba(255, 176, 88, 0.76);
    stroke-width: 2.2;
  }

  .neural-links line.repair {
    stroke-dasharray: 4 3;
    animation: neuralDash 1.2s linear infinite;
  }

  .neural-sprout-path {
    fill: none;
    stroke: rgba(110, 212, 255, 0.22);
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    path-length: 1;
  }

  .neural-sprout-path.trunk {
    stroke-width: 2.4;
    stroke: rgba(123, 223, 255, 0.28);
  }

  .neural-sprout-path.memory {
    stroke: rgba(244, 198, 104, 0.68);
  }

  .neural-sprout-path.intent {
    stroke: rgba(255, 158, 96, 0.72);
  }

  .neural-sprout-path.identity {
    stroke: rgba(146, 192, 255, 0.64);
  }

  .neural-sprout-path.evidence {
    stroke: rgba(201, 228, 255, 0.76);
  }

  .neural-sprout-path.kids {
    stroke: rgba(255, 230, 142, 0.72);
  }

  .neural-sprout-path.kids.active {
    filter: drop-shadow(0 0 12px rgba(255, 227, 122, 0.28));
  }

  .neural-sprout-path.repair {
    stroke: rgba(238, 248, 255, 0.88);
  }

  .neural-sprout-path.recondition {
    stroke: rgba(202, 235, 255, 0.82);
  }

  .neural-sprout-path.active {
    filter: drop-shadow(0 0 10px rgba(132, 220, 255, 0.24));
  }

  .neural-sprout-path.grow {
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: neuralGrow 520ms cubic-bezier(0.2, 0.9, 0.22, 1) forwards;
  }

  .neural-sprout-path.flow {
    stroke-dasharray: 0.12 0.88;
    animation: neuralFlow 2.8s linear infinite;
  }

  .neural-sprout-bud {
    fill: rgba(255, 255, 255, 0.78);
    opacity: 0;
    transform-origin: center;
    animation: neuralBudIn 320ms ease forwards;
  }

  .neural-sprout-bud.memory {
    fill: rgba(248, 207, 118, 0.94);
  }

  .neural-sprout-bud.intent {
    fill: rgba(255, 164, 104, 0.94);
  }

  .neural-sprout-bud.identity {
    fill: rgba(164, 204, 255, 0.92);
  }

  .neural-sprout-bud.evidence {
    fill: rgba(233, 245, 255, 0.95);
  }

  .neural-sprout-bud.kids {
    fill: rgba(255, 234, 156, 0.96);
  }

  .neural-sprout-bud.kids.alt {
    fill: rgba(174, 247, 215, 0.94);
  }

  .neural-sprout-bud.spark {
    fill: rgba(255, 255, 255, 0.94);
    opacity: 0;
    animation: neuralBudTwinkle 1.8s ease-in-out infinite;
  }

  .neural-stars {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .neural-legend {
    position: absolute;
    left: 14px;
    bottom: 68px;
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    max-width: min(520px, calc(100% - 28px));
  }

  .neural-focus-row {
    position: absolute;
    right: 14px;
    bottom: 14px;
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
    max-width: min(52%, 460px);
  }

  .neural-focus-panel {
    position: absolute;
    right: 14px;
    top: 78px;
    width: min(340px, calc(100% - 28px));
    max-height: min(44vh, calc(100% - 170px));
    overflow: auto;
    border-radius: 14px;
    border: 1px solid rgba(0, 180, 255, 0.2);
    background: rgba(4, 10, 20, 0.76);
    backdrop-filter: blur(8px);
    padding: 10px;
    color: #dff4ff;
  }

  .neural-focus-panel h5 {
    margin: 0 0 8px;
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #8ddfff;
  }

  .neural-focus-line {
    margin: 0;
    padding: 7px 9px;
    border-radius: 10px;
    background: rgba(5, 16, 32, 0.66);
    border: 1px solid rgba(255, 255, 255, 0.06);
    font-size: 0.74rem;
    line-height: 1.45;
  }

  .neural-focus-lines {
    display: grid;
    gap: 6px;
  }

  .neural-leaf-edit-block {
    margin-top: 8px;
  }

  .neural-leaf-editor {
    width: 100%;
    min-height: 88px;
    border-radius: 10px;
    border: 1px solid rgba(0, 180, 255, 0.24);
    background: rgba(6, 14, 26, 0.82);
    color: #e3f7ff;
    padding: 8px;
    font-size: 0.78rem;
    line-height: 1.4;
    resize: vertical;
  }

  .neural-leaf-actions {
    margin-top: 10px;
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .neural-leaf-btn {
    border: 1px solid rgba(0, 210, 255, 0.3);
    background: linear-gradient(180deg, rgba(0, 112, 175, 0.24), rgba(0, 58, 102, 0.32));
    color: #d7f5ff;
    border-radius: 999px;
    padding: 6px 11px;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .neural-leaf-btn.icon {
    width: 30px;
    padding: 6px 0;
    text-align: center;
  }

  .neural-focus-btn {
    border: 1px solid rgba(0, 180, 255, 0.22);
    background: rgba(6, 16, 30, 0.68);
    color: #8fd9ff;
    border-radius: 999px;
    padding: 5px 9px;
    font-size: 0.66rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .neural-focus-btn.active {
    background: rgba(0, 180, 255, 0.16);
    border-color: rgba(0, 180, 255, 0.52);
    color: #d9f2ff;
  }

  .neural-orb.sprout {
    opacity: 0;
    animation: neuralSprout 280ms cubic-bezier(0.2, 0.9, 0.22, 1) forwards;
  }

  .neural-kids-sparkles {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .neural-sparkle {
    position: absolute;
    font-size: 1rem;
    opacity: 0.8;
    animation: neuralFloat 3.4s ease-in-out infinite;
  }

  .neural-pill {
    padding: 5px 9px;
    border-radius: 999px;
    border: 1px solid rgba(0, 180, 255, 0.18);
    background: rgba(6, 16, 28, 0.7);
    color: #8fd9ff;
    font-size: 0.68rem;
    font-weight: 700;
  }

  .neural-status {
    position: absolute;
    top: 14px;
    right: 14px;
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
    max-width: min(56%, 520px);
  }

  .neural-ripple {
    position: absolute;
    border-radius: 999px;
    pointer-events: none;
    transform: translate(-50%, -50%);
  }

  .neural-ripple.repair {
    border: 2px solid rgba(255, 255, 255, 0.78);
    box-shadow: 0 0 20px rgba(116, 194, 255, 0.46);
    animation: neuralRepairRipple 1.8s ease-out infinite;
  }

  .neural-ripple.recondition {
    border: 1px solid rgba(203, 232, 255, 0.64);
    box-shadow: 0 0 24px rgba(92, 174, 255, 0.32);
    animation: neuralRepairRipple 2.2s ease-out infinite;
  }

  .neural-bloom-ring {
    position: absolute;
    border-radius: 999px;
    pointer-events: none;
    transform: translate(-50%, -50%);
    border: 1px solid rgba(255, 197, 95, 0.52);
    box-shadow: 0 0 26px rgba(255, 173, 86, 0.28);
    animation: neuralBloom 960ms cubic-bezier(0.16, 0.84, 0.24, 1) forwards;
  }

  .neural-bloom-ring.memory-write {
    border-color: rgba(255, 220, 160, 0.62);
    box-shadow: 0 0 28px rgba(255, 217, 150, 0.34);
  }

  .neural-steering-trail {
    fill: none;
    stroke: rgba(255, 165, 104, 0.92);
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-dasharray: 6 6;
    filter: drop-shadow(0 0 10px rgba(255, 151, 92, 0.54));
    animation: neuralTrail 900ms linear infinite;
  }

  .neural-wave-bars {
    position: absolute;
    left: 50%;
    bottom: 18%;
    display: flex;
    gap: 5px;
    align-items: flex-end;
    transform: translateX(-50%);
    pointer-events: none;
  }

  .neural-wave-bar {
    width: 5px;
    border-radius: 999px;
    background: linear-gradient(180deg, rgba(255, 166, 92, 0.95), rgba(0, 240, 255, 0.92));
    box-shadow: 0 0 18px rgba(0, 240, 255, 0.3);
    animation: neuralWave 760ms ease-in-out infinite;
  }

  .neural-assistive {
    position: absolute;
    left: 14px;
    top: 14px;
    max-width: min(46%, 420px);
    padding: 8px 10px;
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(5, 12, 24, 0.6);
    color: #dff4ff;
    font-size: 0.72rem;
    line-height: 1.5;
  }

  @keyframes neuralPulse {
    0% { transform: translate(-50%, -50%) scale(1); }
    50% { transform: translate(-50%, -50%) scale(1.06); }
    100% { transform: translate(-50%, -50%) scale(1); }
  }

  @keyframes neuralFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes neuralSprout {
    from { opacity: 0; transform: translate(-50%, -50%) scale(0.45); }
    to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  }

  @keyframes neuralFloat {
    0% { transform: translateY(0px) scale(1); opacity: 0.45; }
    50% { transform: translateY(-9px) scale(1.1); opacity: 0.95; }
    100% { transform: translateY(0px) scale(1); opacity: 0.45; }
  }

  @keyframes neuralRepairRipple {
    0% { opacity: 0.85; transform: translate(-50%, -50%) scale(0.9); }
    100% { opacity: 0; transform: translate(-50%, -50%) scale(1.42); }
  }

  @keyframes neuralDash {
    to { stroke-dashoffset: -14; }
  }

  @keyframes neuralGrow {
    to { stroke-dashoffset: 0; }
  }

  @keyframes neuralFlow {
    to { stroke-dashoffset: -1; }
  }

  @keyframes neuralBudIn {
    from { opacity: 0; transform: scale(0.55); }
    to { opacity: 0.95; transform: scale(1); }
  }

  @keyframes neuralBudTwinkle {
    0% { opacity: 0.18; transform: scale(0.82); }
    50% { opacity: 0.98; transform: scale(1.14); }
    100% { opacity: 0.18; transform: scale(0.82); }
  }

  @keyframes neuralBloom {
    0% { opacity: 0.82; transform: translate(-50%, -50%) scale(0.72); }
    100% { opacity: 0; transform: translate(-50%, -50%) scale(1.34); }
  }

  @keyframes neuralTrail {
    to { stroke-dashoffset: -24; }
  }

  @keyframes neuralWave {
    0% { transform: scaleY(0.35); opacity: 0.42; }
    50% { transform: scaleY(1); opacity: 1; }
    100% { transform: scaleY(0.35); opacity: 0.42; }
  }

  @media (prefers-reduced-motion: reduce) {
    .neural-button,
    .neural-overlay,
    .neural-scene-camera,
    .neural-orb,
    .neural-orb.pulse,
    .neural-orb.sprout,
    .neural-sparkle,
    .neural-ripple,
    .neural-links line.repair,
    .neural-sprout-path,
    .neural-sprout-bud {
      animation: none !important;
      transition: none !important;
    }
  }

  @media (max-width: 480px) {
    .neural-hud {
      right: 10px;
      bottom: 76px;
    }

    .neural-button {
      width: 60px;
      height: 60px;
      font-size: 0.56rem;
    }

    .neural-button.kids {
      width: 80px;
      height: 80px;
      font-size: 0.64rem;
    }

    .neural-scene {
      min-height: 280px;
    }

    .neural-legend,
    .neural-focus-row {
      max-width: calc(100% - 16px);
      overflow-x: auto;
      flex-wrap: nowrap;
      padding-bottom: 4px;
    }

    .neural-assistive {
      max-width: calc(100% - 28px);
      font-size: 0.68rem;
    }
  }
`;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getCorePalette(valence, alignmentProfile) {
  const alignmentEnabled = Boolean(alignmentProfile?.enabled);
  const alignment = String(alignmentProfile?.alignment || "").toLowerCase();
  const goodBias = alignmentEnabled && alignment.includes("good");
  const evilBias = alignmentEnabled && alignment.includes("evil");

  if (goodBias) {
    return {
      inner: "rgba(173, 252, 212, 0.96)",
      outer: "rgba(46, 166, 138, 0.94)",
      glow: "rgba(84, 225, 176, 0.54)",
    };
  }

  if (evilBias) {
    return {
      inner: "rgba(255, 156, 184, 0.94)",
      outer: "rgba(160, 48, 118, 0.96)",
      glow: "rgba(230, 86, 160, 0.54)",
    };
  }

  if (valence >= 0.2) {
    return {
      inner: "rgba(135, 241, 255, 0.96)",
      outer: "rgba(32, 145, 255, 0.96)",
      glow: "rgba(64, 206, 255, 0.62)",
    };
  }

  if (valence <= -0.2) {
    return {
      inner: "rgba(255, 170, 225, 0.94)",
      outer: "rgba(182, 62, 162, 0.96)",
      glow: "rgba(234, 91, 193, 0.52)",
    };
  }

  return {
    inner: "rgba(206, 238, 255, 0.94)",
    outer: "rgba(85, 141, 224, 0.96)",
    glow: "rgba(112, 184, 255, 0.52)",
  };
}

function buildStars(width, height, count = 70) {
  return Array.from({ length: count }, (_, i) => ({
    x: Math.floor(((i * 97) % 1000) / 1000 * width),
    y: Math.floor(((i * 131) % 1000) / 1000 * height),
    r: 0.5 + ((i * 17) % 10) / 10,
    a: 0.2 + ((i * 29) % 60) / 100,
  }));
}

function buildSproutPath(start, end, curve = 0.18, swing = 1) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const midX = start.x + dx / 2;
  const midY = start.y + dy / 2;
  const length = Math.sqrt(dx * dx + dy * dy) || 1;
  const normalX = (-dy / length) * curve * 100 * swing;
  const normalY = (dx / length) * curve * 100 * swing;
  const controlX = midX + normalX;
  const controlY = midY + normalY;

  return `M ${start.x} ${start.y} Q ${controlX} ${controlY} ${end.x} ${end.y}`;
}

function getBudPosition(start, end, ratio = 0.72) {
  return {
    x: start.x + (end.x - start.x) * ratio,
    y: start.y + (end.y - start.y) * ratio,
  };
}

function getSignalSproutConfig(type, kidsMode) {
  if (kidsMode) {
    return {
      curve: 0.12,
      ratio: 0.66,
      width: 1.7,
      altBudEvery: 2,
    };
  }

  if (type === "memory") {
    return {
      curve: 0.16,
      ratio: 0.7,
      width: 1.75,
      altBudEvery: 0,
    };
  }

  if (type === "intent") {
    return {
      curve: 0.1,
      ratio: 0.78,
      width: 1.5,
      altBudEvery: 0,
    };
  }

  if (type === "identity" || type === "recondition") {
    return {
      curve: 0.08,
      ratio: 0.74,
      width: 1.6,
      altBudEvery: 0,
    };
  }

  return {
    curve: 0.14,
    ratio: 0.8,
    width: 1.45,
    altBudEvery: 0,
  };
}

function extractMemoryRows(latestDebug) {
  const mapped = [];

  const addRows = (rows, source) => {
    if (!Array.isArray(rows)) {
      return;
    }

    rows.forEach((item, index) => {
      mapped.push({
        id: item?.id || `${source}-${index}`,
        source,
        label: item?.memory_type || item?.memoryType || item?.type || "memory",
        memoryType: item?.memory_type || item?.memoryType || item?.type || "memory",
        content: item?.content || item?.text || "",
        importance: Number(item?.importance || 5),
        rawItem: item,
      });
    });
  };

  addRows(latestDebug?.memoryInjected, "injected");
  addRows(latestDebug?.memoryRetrieved, "retrieved");
  addRows(latestDebug?.userMemoryRetrieved, "user-retrieved");
  addRows(latestDebug?.memoryExtracted, "extracted");
  addRows(latestDebug?.userMemoryExtracted, "user-extracted");

  return mapped;
}

function extractMemoryRowsFromStore(memoryItems) {
  if (!Array.isArray(memoryItems)) {
    return [];
  }

  return memoryItems.map((item, index) => ({
    id: item?.id || `store-memory-${index}`,
    source: "store",
    label: item?.memory_type || item?.memoryType || item?.type || "memory",
    memoryType: item?.memory_type || item?.memoryType || item?.type || "memory",
    content: item?.content || item?.text || "",
    importance: Number(item?.importance || 5),
    rawItem: item,
  }));
}

function categorizeMemory(memoryItem) {
  const type = String(memoryItem?.memory_type || memoryItem?.memoryType || memoryItem?.type || "unknown").toLowerCase();

  if (type.includes("self") || type.includes("identity") || type.includes("core")) {
    return "Personal (Self)";
  }
  if (type.includes("user") || type.includes("human")) {
    return "Personal (User)";
  }
  if (type.includes("event") || type.includes("interaction")) {
    return "Event Log";
  }
  if (type.includes("correction") || type.includes("repair") || type.includes("fix")) {
    return "Corrections";
  }
  if (type.includes("emotion") || type.includes("mood") || type.includes("feeling")) {
    return "Emotional Context";
  }
  return "General";
}

function getFocusChildren(focusNode, latestDebug, mode, personality, memoryRows, personaState) {
  const kidsMode = mode === "kids";

  if (focusNode === "memory") {
    const rows = memoryRows;
    if (!rows.length) {
      return [];
    }

    return rows.map((memory, index) => {
      const category = categorizeMemory(memory.rawItem);
      const display = buildMemoryDisplay(
        {
          memory_type: memory.memoryType,
          content: memory.content,
        },
        index + 1,
      );
      return {
        id: `memory-leaf-${memory.id}`,
        type: "leaf",
        label: display.title,
        source: memory.source,
        meta: `${display.typeLabel} · importance ${memory.importance}`,
        children: [],
        dataRef: {
          kind: "memory-item",
          memoryId: memory.id,
          memoryType: memory.memoryType,
        },
        payload: {
          kind: "memory",
          memoryId: memory.id,
          memoryType: memory.memoryType,
          category,
          content: memory.content,
          contentSummary: display.description,
          source: memory.source,
          importance: memory.importance,
          dataRef: {
            kind: "memory-item",
            memoryId: memory.id,
            memoryType: memory.memoryType,
          },
        },
      };
    });
  }

  if (focusNode === "intent") {
    const goal = latestDebug?.goal?.goal;
    if (!goal) {
      return [];
    }

    return [
      {
        id: "intent-leaf-goal",
        type: "leaf",
        label: kidsMode ? "Intent" : "Intent Goal",
        source: "intent",
        meta: `source: ${latestDebug?.goal?.source || "unknown"}`,
        children: [],
        dataRef: { kind: "debug-intent" },
        payload: {
          kind: "intent",
          content: goal,
          source: latestDebug?.goal?.source || "unknown",
        },
      },
    ];
  }

  if (focusNode === "identity") {
    const traitItems = personaState?.treeIndex
      ? ["traits", "quirks", "sayings", "mood"].flatMap((key) => personaState.treeIndex.get(key)?.children || [])
      : [];

    if (traitItems.length) {
      return traitItems.map((node) => ({
        id: `identity-${node.id}`,
        type: "leaf",
        label: node.label,
        source: "identity",
        meta: "persona state",
        children: [],
        dataRef: node.dataRef,
        payload: {
          kind: "persona",
          content: node.label,
          dataRef: node.dataRef,
        },
      }));
    }

    const lines = [];
    if (latestDebug?.flags?.reconditioned) {
      lines.push("Reconditioning anchor fired");
    }
    if (latestDebug?.scientist?.repairAttempted) {
      lines.push("Scientist repair pass attempted");
    }

    if (!lines.length) {
      lines.push(`${personality?.name || "persona"} stable`);
    }

    return lines.map((line, index) => ({
      id: `identity-leaf-${index}`,
      type: "leaf",
      label: kidsMode ? "Identity" : `Identity ${index + 1}`,
      source: "identity",
      meta: line,
      children: [],
      dataRef: { kind: "debug-identity" },
      payload: {
        kind: "identity",
        content: line,
      },
    }));
  }

  if (focusNode === "evidence") {
    const violations = latestDebug?.scientist?.validation?.violations || [];
    const hasCitation = Boolean(latestDebug?.scientist?.validation?.hasCitation);

    if (violations.length) {
      return violations.map((violation, index) => ({
        id: `evidence-violation-${index}`,
        type: "leaf",
        label: "Evidence",
        source: "evidence",
        meta: violation,
        children: [],
        dataRef: { kind: "debug-evidence", index },
        payload: {
          kind: "evidence",
          content: violation,
        },
      }));
    }

    if (hasCitation) {
      return [
        {
          id: "evidence-cited",
          type: "leaf",
          label: "Evidence",
          source: "evidence",
          meta: `sources ${latestDebug?.scientist?.sourceCount || 0}`,
          children: [],
          dataRef: { kind: "debug-evidence" },
          payload: {
            kind: "evidence",
            content: "Citations linked",
          },
        },
      ];
    }

    return [];
  }

  return [];
}

function buildFocusPanel(focusNode, latestDebug, personality, mode, memoryRows) {
  const kidsMode = mode === "kids";

  if (focusNode === "memory") {
    const allMemories = Array.isArray(memoryRows) ? memoryRows : extractMemoryRows(latestDebug);

    return {
      title: kidsMode ? "Memory Tree" : "Memory Branch",
      lines: allMemories.length
        ? [
            kidsMode
              ? `Tap a memory branch to open details (${allMemories.length} available).`
              : `Click a memory leaf to inspect details (${allMemories.length} memories loaded).`,
          ]
        : [kidsMode ? "No big memories yet." : "No memory leaves available this turn."],
      isLeaf: false,
      hasContent: allMemories.length > 0,
    };
  }

  if (focusNode === "intent") {
    const goal = latestDebug?.goal?.goal || "No active intent selected";
    const source = latestDebug?.goal?.source || "unknown";
    return {
      title: "Intent Trace",
      lines: [`Goal: ${goal}`, `Source: ${source}`],
      isLeaf: true,
      hasContent: !!goal,
    };
  }

  if (focusNode === "identity") {
    const lines = [
      `Persona: ${personality?.name || "unknown"}`,
      `Mood: ${personality?.moodLabel || personality?.mood || "neutral"}`,
      `Reconditioned: ${latestDebug?.flags?.reconditioned ? "yes" : "no"}`,
      `Repair Attempted: ${latestDebug?.scientist?.repairAttempted ? "yes" : "no"}`,
    ];
    return {
      title: "Identity State",
      lines,
      isLeaf: true,
      hasContent: !!personality,
    };
  }

  if (focusNode === "evidence") {
    const violations = latestDebug?.scientist?.validation?.violations || [];
    return {
      title: "Evidence Status",
      lines: [
        `Citations linked: ${latestDebug?.scientist?.validation?.hasCitation ? "yes" : "no"}`,
        `Source count: ${latestDebug?.scientist?.sourceCount || 0}`,
        `Violations: ${violations.length ? violations.join(", ") : "none"}`,
      ],
      isLeaf: true,
      hasContent: true,
    };
  }

  return {
    title: "Core State",
    lines: [
      `Persona: ${personality?.name || "unknown"}`,
      `Mode: ${mode}`,
      `Memory links: ${Array.isArray(memoryRows) ? memoryRows.length : extractMemoryRows(latestDebug).length}`,
    ],
    isLeaf: false,
    hasContent: false,
  };
}

function resolveDataRefContent(dataRef, personaState, fallbackContent) {
  if (!dataRef || !personaState) {
    return fallbackContent;
  }

  if (dataRef.kind === "memory-item") {
    const match = (personaState.memoryItems || []).find((item) => item.id === dataRef.memoryId);
    return match?.content || fallbackContent;
  }

  if (dataRef.kind === "persona-array") {
    const source = Array.isArray(personaState.personality?.[dataRef.field])
      ? personaState.personality[dataRef.field]
      : [];
    return source[dataRef.index] || fallbackContent;
  }

  if (dataRef.kind === "persona-scalar") {
    return personaState.personality?.[dataRef.field] || fallbackContent;
  }

  return fallbackContent;
}

function buildLeafPanel(leafNode, personaState) {
  if (!leafNode) {
    return null;
  }

  const payload = leafNode.payload || {};

  if (payload.kind === "memory") {
    const latestContent = resolveDataRefContent(payload.dataRef || leafNode.dataRef, personaState, payload.content || "");
    const redactedSummary = redactMemoryText(payload.contentSummary || latestContent || "");
    return {
      title: `Memory · ${payload.category || "General"}`,
      lines: [
        `Type: ${normalizeMemoryType(payload.memoryType || "memory")}`,
        `Source: ${String(payload.source || "unknown").replaceAll("_", " ")}`,
        `Importance: ${payload.importance ?? 5}`,
        redactedSummary || "(empty memory)",
      ],
      editable: true,
      memoryId: payload.memoryId,
      memoryType: payload.memoryType,
      content: latestContent || "",
      dataRef: payload.dataRef || leafNode.dataRef || null,
    };
  }

  if (leafNode.dataRef?.kind === "memory-item") {
    const memory = (personaState?.memoryItems || []).find((item) => item.id === leafNode.dataRef.memoryId);
    const latestContent = memory?.content || "";
    const type = memory?.memory_type || memory?.memoryType || leafNode.dataRef.memoryType || "memory";
    return {
      title: `Memory · ${normalizeMemoryType(type)}`,
      lines: [
        `Type: ${normalizeMemoryType(type)}`,
        redactMemoryText(latestContent || "(empty memory)"),
      ],
      editable: true,
      memoryId: leafNode.dataRef.memoryId,
      memoryType: type,
      content: latestContent,
      dataRef: leafNode.dataRef,
    };
  }

  if (leafNode.dataRef?.kind === "persona-array" || leafNode.dataRef?.kind === "persona-scalar") {
    const latestContent = resolveDataRefContent(leafNode.dataRef, personaState, leafNode.label || "");
    return {
      title: leafNode.label || "Persona Entry",
      lines: [latestContent || "No details available"],
      editable: true,
      content: latestContent || "",
      dataRef: leafNode.dataRef,
      isPersonaField: true,
    };
  }

  if (payload.kind === "persona") {
    const latestContent = resolveDataRefContent(payload.dataRef || leafNode.dataRef, personaState, payload.content || "");
    return {
      title: leafNode.label || "Persona Entry",
      lines: [latestContent || "No details available"],
      editable: true,
      content: latestContent || "",
      dataRef: payload.dataRef || leafNode.dataRef || null,
      isPersonaField: true,
    };
  }

  return {
    title: leafNode.label || "Leaf Node",
    lines: [payload.content || leafNode.meta || "No details available"],
    editable: false,
  };
}

function mapLayerRootNodes(nodes = []) {
  return nodes.map((node) => ({
    id: node.id,
    label: node.label,
    type: node.type || "category",
    dataRef: node.dataRef || null,
    payload: node.payload || null,
    children: Array.isArray(node.children) ? mapLayerRootNodes(node.children) : [],
  }));
}

function resolvePerformanceTier(requestedTier, mode, prefersReducedMotion) {
  if (prefersReducedMotion) {
    return "light";
  }

  return ["light", "balanced", "full"].includes(requestedTier)
    ? requestedTier
    : mode === "kids"
    ? "light"
    : "balanced";
}

function getPrimarySproutSpecs({ scene, kidsMode, memoryCount, hasIntent, identityActive, evidenceActive, repairActive, reconditioningActive }) {
  const specs = [
    {
      id: "memory-trunk",
      start: scene.core,
      end: scene.memory,
      type: kidsMode ? "kids" : "memory",
      active: memoryCount > 0,
      curve: 0.16,
      swing: -1,
    },
    {
      id: "intent-trunk",
      start: scene.core,
      end: scene.intent,
      type: kidsMode ? "kids" : "intent",
      active: hasIntent,
      curve: 0.14,
      swing: 1,
    },
    {
      id: "identity-trunk",
      start: scene.core,
      end: scene.identity,
      type: reconditioningActive ? "recondition" : kidsMode ? "kids" : "identity",
      active: identityActive,
      curve: 0.12,
      swing: -1,
    },
  ];

  if (!kidsMode) {
    specs.push({
      id: "evidence-trunk",
      start: scene.core,
      end: scene.evidence,
      type: repairActive ? "repair" : "evidence",
      active: evidenceActive || repairActive,
      curve: 0.18,
      swing: 1,
    });
  }

  return specs;
}

export default function NeuralCore({
  personality,
  mode = "scientist",
  latestDebug,
  livePhase = "",
  liveSeq = 0,
  performanceTier: requestedPerformanceTier,
  voiceNarrationEnabled = false,
  onActivityUpdate,
  onUpdateMemory,
  onOpenPersonaEditor,
}) {
  const personaState = usePersonaState();
  const enabled = import.meta.env.VITE_NEURAL_CORE_ENABLED !== "false";
  const [expanded, setExpanded] = useState(false);
  const [focusNode, setFocusNode] = useState("core");
  const [selectedLeafNode, setSelectedLeafNode] = useState(null);
  const [sceneDepth, setSceneDepth] = useState(0);
  const [branchRevealCount, setBranchRevealCount] = useState(0);
  const [leafDraft, setLeafDraft] = useState("");
  const [isSavingLeaf, setIsSavingLeaf] = useState(false);
  const [tick, setTick] = useState(0);
  const [phaseBurst, setPhaseBurst] = useState("");
  const prefersReducedMotion = usePrefersReducedMotion();

  const performanceTier = resolvePerformanceTier(requestedPerformanceTier, mode, prefersReducedMotion);

  const handleNodeClick = (nodeName) => {
    setFocusNode(nodeName);
    setSelectedLeafNode(null);
  };

  useEffect(() => {
    if (!enabled) {
      return;
    }

    function onKeyDown(event) {
      const target = event.target;
      const typing = target instanceof HTMLElement && (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      );

      if (typing) {
        return;
      }

      if (event.key.toLowerCase() === "n") {
        setExpanded((current) => !current);
      }

      if (event.key === "Escape") {
        setExpanded(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || performanceTier === "light") {
      setTick(0);
      return;
    }

    let raf = null;
    const start = performance.now();
    const speed = performanceTier === "full" ? 1.2 : 0.72;

    function frame(now) {
      setTick(((now - start) / 1000) * speed);
      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);
    return () => {
      if (raf) {
        cancelAnimationFrame(raf);
      }
    };
  }, [enabled, performanceTier]);

  useEffect(() => {
    if (!livePhase) {
      return;
    }

    setPhaseBurst(livePhase);
    const timeoutId = window.setTimeout(() => {
      setPhaseBurst("");
    }, 900);

    return () => window.clearTimeout(timeoutId);
  }, [livePhase, liveSeq]);

  const mood = latestDebug?.mood?.after || personality?.moodState || { valence: 0, arousal: 0, dominance: 0 };
  const valence = Number(mood?.valence || 0);
  const arousal = Number(mood?.arousal || 0);
  const dominance = Number(mood?.dominance || 0);
  const palette = getCorePalette(valence, personality?.alignmentProfile);
  const coreSize = Math.round(98 + clamp(Math.abs(arousal), 0, 1) * 56);
  const glowSize = 26 + clamp(Math.abs(dominance), 0, 1) * 26 + clamp(Math.abs(arousal), 0, 1) * 14;
  const heatGlow = 14 + clamp(Math.abs(arousal), 0, 1) * 30;

  const memoryRows = useMemo(
    () => {
      const fromStore = extractMemoryRowsFromStore(personaState?.memoryItems);
      return fromStore.length ? fromStore : extractMemoryRows(latestDebug);
    },
    [latestDebug, personaState?.memoryItems],
  );

  const memoryCount = memoryRows.length;
  const hasIntent = Boolean(latestDebug?.goal?.goal);
  const identityActive = Boolean(latestDebug?.flags?.reconditioned) || Boolean(latestDebug?.scientist?.repairAttempted);
  const reconditioningActive = Boolean(latestDebug?.flags?.reconditioned);
  const repairActive = Boolean(latestDebug?.scientist?.repairAttempted);
  const citationValid = Boolean(latestDebug?.scientist?.validation?.hasCitation);
  const citationIssue = Array.isArray(latestDebug?.scientist?.validation?.violations)
    ? latestDebug.scientist.validation.violations.includes("invalid_citation_reference") ||
      latestDebug.scientist.validation.violations.includes("missing_citations")
    : false;
  const evidenceActive = mode === "scientist" ? (citationValid && !citationIssue) : false;

  const scene = useMemo(() => {
    const center = { x: 50, y: 48 };
    const radius = performanceTier === "full" ? 26 : 24;

    return {
      core: {
        x: center.x,
        y: center.y,
      },
      memory: {
        x: center.x + Math.cos(tick * 0.5) * radius,
        y: center.y + Math.sin(tick * 0.5) * radius,
      },
      intent: {
        x: center.x + Math.cos(tick * 0.5 + 2.1) * radius,
        y: center.y + Math.sin(tick * 0.5 + 2.1) * radius,
      },
      identity: {
        x: center.x + Math.cos(tick * 0.5 + 4.2) * radius,
        y: center.y + Math.sin(tick * 0.5 + 4.2) * radius,
      },
      evidence: {
        x: center.x + Math.cos(tick * 0.5 + 5.25 + (repairActive ? 0.3 : 0)) * (radius + 4),
        y: center.y + Math.sin(tick * 0.5 + 5.25 + (repairActive ? 0.3 : 0)) * (radius + 4),
      },
    };
  }, [performanceTier, repairActive, tick]);

  const kidsMode = mode === "kids";
  // The redesign branch defaults Scientist mode to the experimental 3D renderer.
  // Set VITE_NEURAL_CORE_RENDERER=svg to force the legacy SVG scene.
  const rendererEnv = String(import.meta.env.VITE_NEURAL_CORE_RENDERER || "force-graph").trim().toLowerCase();
  const rendererType = !kidsMode && rendererEnv !== "svg" ? "force-graph" : "svg";
  const sceneModelEnv = String(import.meta.env.VITE_NEURAL_CORE_SCENE_MODEL || "legacy").trim().toLowerCase();
  const useLayeredV2 = !kidsMode && sceneModelEnv === "layered-v2";

  const layeredRootNodes = useMemo(() => {
    const source = Array.isArray(personaState?.personaTree) ? personaState.personaTree : [];
    return mapLayerRootNodes(source);
  }, [personaState?.personaTree]);

  const focusChildren = useMemo(
    () => getFocusChildren(focusNode, latestDebug, mode, personality, memoryRows, personaState),
    [focusNode, latestDebug, memoryRows, mode, personality, personaState],
  );

  const focusPos =
    focusNode === "memory"
      ? scene.memory
      : focusNode === "intent"
      ? scene.intent
      : focusNode === "identity"
      ? scene.identity
      : focusNode === "evidence"
      ? scene.evidence
      : scene.core;

  const cameraScale = focusNode === "core" ? 1 : 1.18;
  const cameraTranslateX = (50 - focusPos.x) * 0.9;
  const cameraTranslateY = (50 - focusPos.y) * 0.9;

  const childNodes = focusChildren.map((child, index) => {
    const childModel = typeof child === "string"
      ? {
          id: `focus-child-${index}`,
          label: child,
          source: focusNode,
          meta: "",
          payload: { kind: focusNode, content: child },
        }
      : child;

    const angle = (Math.PI * 2 * index) / Math.max(1, focusChildren.length) + tick * (performanceTier === "full" ? 0.3 : 0.18);
    const radius = kidsMode ? 14 : performanceTier === "full" ? 18 : 16;
    return {
      id: childModel.id || `focus-child-${index}`,
      label: childModel.label || `Node ${index + 1}`,
      source: childModel.source || focusNode,
      meta: childModel.meta || "",
      payload: childModel.payload || null,
      x: focusPos.x + Math.cos(angle) * radius,
      y: focusPos.y + Math.sin(angle) * radius,
    };
  });

  useEffect(() => {
    if (focusNode === "core") {
      setBranchRevealCount(0);
      return;
    }

    if (!childNodes.length) {
      setBranchRevealCount(0);
      return;
    }

    const maxVisible = childNodes.length;

    let frameId = 0;
    let count = 0;
    const revealStepMs = prefersReducedMotion ? 0 : 85;

    if (revealStepMs <= 0) {
      setBranchRevealCount(maxVisible);
      return;
    }

    const startedAt = performance.now();
    function reveal(now) {
      const elapsed = now - startedAt;
      const nextCount = Math.min(maxVisible, Math.floor(elapsed / revealStepMs) + 1);
      if (nextCount !== count) {
        count = nextCount;
        setBranchRevealCount(nextCount);
      }
      if (nextCount < maxVisible) {
        frameId = window.requestAnimationFrame(reveal);
      }
    }

    setBranchRevealCount(0);
    frameId = window.requestAnimationFrame(reveal);
    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [childNodes, focusNode, kidsMode, performanceTier, prefersReducedMotion]);

  const visibleChildNodes = useMemo(
    () => childNodes.slice(0, branchRevealCount),
    [branchRevealCount, childNodes],
  );

  const primarySprouts = useMemo(
    () => getPrimarySproutSpecs({
      scene,
      kidsMode,
      memoryCount,
      hasIntent,
      identityActive,
      evidenceActive,
      repairActive,
      reconditioningActive,
    }),
    [
      scene,
      kidsMode,
      memoryCount,
      hasIntent,
      identityActive,
      evidenceActive,
      repairActive,
      reconditioningActive,
    ],
  );

  const focusedSprouts = useMemo(
    () => visibleChildNodes.map((child, index) => {
      const type = kidsMode
        ? "kids"
        : focusNode === "memory"
        ? "memory"
        : focusNode === "intent"
        ? "intent"
        : focusNode === "identity"
        ? reconditioningActive
          ? "recondition"
          : "identity"
        : repairActive
        ? "repair"
        : "evidence";

      const config = getSignalSproutConfig(type, kidsMode);

      return {
        id: `${focusNode}-sprout-${index}`,
        start: focusPos,
        end: { x: child.x, y: child.y },
        bud: getBudPosition(focusPos, child, config.ratio),
        type,
        curve: config.curve,
        swing: index % 2 === 0 ? -1 : 1,
        strokeWidth: config.width,
        altBud: Boolean(config.altBudEvery && index % config.altBudEvery === 1),
        spark: kidsMode && index === visibleChildNodes.length - 1,
      };
    }),
    [focusNode, focusPos, kidsMode, reconditioningActive, repairActive, visibleChildNodes],
  );

  const focusPanel = useMemo(
    () => buildFocusPanel(focusNode, latestDebug, personality, mode, memoryRows),
    [focusNode, latestDebug, personality, mode, memoryRows],
  );

  const leafPanel = useMemo(
    () => buildLeafPanel(selectedLeafNode, personaState),
    [selectedLeafNode, personaState],
  );

  useEffect(() => {
    if (!leafPanel || !leafPanel.editable) {
      setLeafDraft("");
      return;
    }
    setLeafDraft(leafPanel.content || "");
  }, [leafPanel]);

  async function handleSaveLeafEdit() {
    if (!leafPanel?.editable) {
      return;
    }

    setIsSavingLeaf(true);
    try {
      if (leafPanel.isPersonaField && leafPanel.dataRef?.kind === "persona-array") {
        await personaState?.updatePersonaField?.({
          field: leafPanel.dataRef.field,
          index: leafPanel.dataRef.index,
          value: leafDraft,
        });
      } else if (leafPanel.isPersonaField && leafPanel.dataRef?.kind === "persona-scalar") {
        await personaState?.updatePersonaField?.({
          field: leafPanel.dataRef.field,
          value: leafDraft,
        });
      } else if (leafPanel.memoryId && onUpdateMemory) {
        await onUpdateMemory({
          memoryId: leafPanel.memoryId,
          content: leafDraft,
          memoryType: leafPanel.memoryType,
        });
      }

      setSelectedLeafNode((current) =>
        current
          ? {
              ...current,
              payload: {
                ...current.payload,
                content: leafDraft,
              },
            }
          : current,
      );
    } finally {
      setIsSavingLeaf(false);
    }
  }

  function handleOpenEditorForLeaf() {
    if (!leafPanel || !onOpenPersonaEditor) {
      return;
    }

    const dataRef = leafPanel.dataRef || null;
    const editorItemId = dataRef?.kind === "memory-item"
      ? `memory-item-${dataRef.memoryId}`
      : dataRef?.kind === "persona-array"
      ? `${dataRef.field === "notablePhrases" ? "sayings" : dataRef.field}-${dataRef.index}`
      : dataRef?.kind === "persona-scalar"
      ? `mood-${String(dataRef.field).replace(/^mood/, "").replace(/^./, (char) => char.toLowerCase())}`
      : selectedLeafNode?.id || null;

    onOpenPersonaEditor({
      section: leafPanel.memoryId ? "memory" : "behavior",
      query: leafPanel.content || selectedLeafNode?.label || "",
      memoryId: leafPanel.memoryId || null,
      category: leafPanel.memoryId
        ? "memory"
        : leafPanel.dataRef?.field === "traits"
        ? "traits"
        : leafPanel.dataRef?.field === "quirks"
        ? "quirks"
        : leafPanel.dataRef?.field === "notablePhrases"
        ? "sayings"
        : "mood",
      subcategory: leafPanel.dataRef?.subcategory || null,
      itemId: editorItemId,
    });
  }

  if (!enabled || !personality) {
    return null;
  }

  const stars = buildStars(100, 100, performanceTier === "light" ? 24 : performanceTier === "full" ? 88 : 54);
  const sparkleBaseDurations = [3.4, 4.1, 5.0, 3.8, 4.6];
  const sparkleSpeedMult = performanceTier === "full" ? 0.78 : 1;
  const kidsSparkles = [
    { left: 14, top: 24, char: "✨" },
    { left: 78, top: 18, char: "⭐" },
    { left: 66, top: 76, char: "💫" },
    { left: 22, top: 70, char: "✨" },
    { left: 86, top: 62, char: "⭐" },
  ].slice(0, performanceTier === "light" ? 3 : 5);

  return (
    <>
      <style>{neuralStyles}</style>

      {!expanded ? (
        <div className="neural-hud">
          {!kidsMode && (
            <div
              className="neural-mini-preview"
              onClick={() => setExpanded(true)}
              title="Click to open Neural Core"
            >
              <NeuralCoreThreeScene
                scene={scene}
                personality={personality}
                memoryCount={memoryCount}
                hasIntent={hasIntent}
                identityActive={identityActive}
                evidenceActive={evidenceActive}
                repairActive={repairActive}
                reconditioningActive={reconditioningActive}
                visibleChildNodes={[]}
                focusNode="core"
                setFocusNode={() => {}}
                valence={valence}
                arousal={arousal}
                dominance={dominance}
                livePhaseBurst={phaseBurst}
                hideLabels
                onActivityUpdate={onActivityUpdate}
              />
            </div>
          )}
          <button
            type="button"
            className={`neural-button ${kidsMode ? "kids" : ""}`}
            onClick={() => setExpanded(true)}
            style={{
              background: `radial-gradient(circle at 30% 30%, ${palette.inner}, ${palette.outer})`,
              boxShadow: `0 0 ${glowSize}px ${palette.glow}, 0 0 ${heatGlow}px rgba(255, 166, 62, 0.26), 0 0 0 1px rgba(255,255,255,0.18) inset`,
            }}
            title="Open Neural Core"
            aria-label={kidsMode ? "Open friend brain overlay" : "Open Neural Core overlay"}
          >
            {kidsMode ? "Brain" : "Core"}
          </button>
          <div className="neural-tip">
            {kidsMode ? "Tap Brain. Narration optional." : `Open Neural Core · ${performanceTier}`}
          </div>
        </div>
      ) : (
        <div className={`neural-overlay ${kidsMode ? "kids" : "scientist"}`}>
          <div className="neural-topbar">
            <h4 className="neural-title">
              <span className="neural-title-wrap">
                <AvatarCore
                  size="compact"
                  valence={valence}
                  arousal={arousal}
                  phase={phaseBurst || ""}
                  speaking={["generation", "reply", "reply-complete"].includes(phaseBurst)}
                  mode={mode}
                  personalitySeed={`${personality.id}:${personality.name}:${personality.creativeContext || "default"}`}
                  expressionProfile={personality.expressionProfile}
                  expressionPreset={personality.expressionProfile?.preset || "auto"}
                />
                <span>{kidsMode ? "Friend Brain" : "Voxis Neural Core"}</span>
              </span>
            </h4>
            <button type="button" className="neural-close" onClick={() => setExpanded(false)}>
              Close
            </button>
          </div>

          <div
            className="neural-scene"
          >
            <div className="neural-assistive">
              {kidsMode
                ? "Large touch targets stay on in Kids Mode. Tap the Brain orb, use voice narration if enabled, or press N on a keyboard."
                : "Scientist Mode keeps evidence visible and shows repair ripples when the system reorganizes a response."}
            </div>

            <div className="neural-status">
              <span className="neural-pill">Performance {performanceTier}</span>
              {personality?.alignmentProfile?.enabled ? (
                <span className="neural-pill">Alignment {String(personality.alignmentProfile.alignment || "true_neutral").replaceAll("_", " ")}</span>
              ) : null}
              {repairActive ? <span className="neural-pill">Thinking... repair pass</span> : null}
              {reconditioningActive ? <span className="neural-pill">Reconditioning ripple active</span> : null}
              {kidsMode && voiceNarrationEnabled ? <span className="neural-pill">Mood narration ready</span> : null}
            </div>

            {kidsMode && performanceTier !== "light" ? (
              <div className="neural-kids-sparkles">
                {kidsSparkles.map((sparkle, index) => (
                  <span
                    key={`sparkle-${index}`}
                    className="neural-sparkle"
                    style={{ left: `${sparkle.left}%`, top: `${sparkle.top}%`, animationDelay: `${index * 180}ms`, animationDuration: `${(sparkleBaseDurations[index] * sparkleSpeedMult).toFixed(2)}s` }}
                  >
                    {sparkle.char}
                  </span>
                ))}
              </div>
            ) : null}

            {useLayeredV2 ? (
              <NeuralSceneV2
                rootNodes={layeredRootNodes}
                onLeafNodeSelect={setSelectedLeafNode}
                onFocusNodeChange={setFocusNode}
                onDepthChange={setSceneDepth}
              />
            ) : (
              <NeuralCoreRenderer
                rendererType={rendererType}
                compact={false}
                performanceTier={performanceTier}
                kidsMode={kidsMode}
                repairActive={repairActive}
                reconditioningActive={reconditioningActive}
                scene={scene}
                stars={stars}
                primarySprouts={primarySprouts}
                focusedSprouts={focusedSprouts}
                memoryCount={memoryCount}
                hasIntent={hasIntent}
                identityActive={identityActive}
                evidenceActive={evidenceActive}
                focusPos={focusPos}
                visibleChildNodes={visibleChildNodes}
                cameraTranslateX={cameraTranslateX}
                cameraTranslateY={cameraTranslateY}
                cameraScale={cameraScale}
                coreSize={coreSize}
                palette={palette}
                glowSize={glowSize}
                heatGlow={heatGlow}
                valence={valence}
                arousal={arousal}
                dominance={dominance}
                personality={personality}
                focusNode={focusNode}
                setFocusNode={handleNodeClick}
                onLeafNodeSelect={setSelectedLeafNode}
                citationIssue={citationIssue}
                citationValid={citationValid}
                livePhaseBurst={phaseBurst}
              />
            )}

            <div className="neural-legend">
              <span className="neural-pill">{kidsMode ? "Mode: Kids" : "Mode: Scientist"}</span>
              <span className="neural-pill">{kidsMode ? `Feeling: ${personality?.moodLabel || "calm"}` : `Valence ${valence.toFixed(2)}`}</span>
              <span className="neural-pill">Memory links {memoryCount}</span>
              {useLayeredV2 ? <span className="neural-pill">Depth {sceneDepth}</span> : null}
              <span className="neural-pill">Intent {hasIntent ? "on" : "off"}</span>
              <span className="neural-pill">Identity {identityActive ? "active" : "steady"}</span>
              {!kidsMode ? <span className="neural-pill">Evidence {citationIssue ? "repair" : citationValid ? "linked" : "pending"}</span> : null}
              {performanceTier !== "light" ? <span className="neural-pill">SVG sprouts active</span> : null}
              {performanceTier !== "light" ? <span className="neural-pill">Focused branches {visibleChildNodes.length}</span> : null}
              {performanceTier === "full" && !kidsMode ? <span className="neural-pill">Full tier ready for force-graph v0.3</span> : null}
              <span className="neural-pill">Shortcut N: toggle</span>
            </div>

            {!useLayeredV2 ? <div className="neural-focus-row">
              <button
                type="button"
                className={`neural-focus-btn ${focusNode === "core" ? "active" : ""}`}
                onClick={() => handleNodeClick("core")}
              >
                Core
              </button>
              <button
                type="button"
                className={`neural-focus-btn ${focusNode === "memory" ? "active" : ""}`}
                onClick={() => handleNodeClick("memory")}
              >
                Memory
              </button>
              <button
                type="button"
                className={`neural-focus-btn ${focusNode === "intent" ? "active" : ""}`}
                onClick={() => handleNodeClick("intent")}
              >
                Intent
              </button>
              <button
                type="button"
                className={`neural-focus-btn ${focusNode === "identity" ? "active" : ""}`}
                onClick={() => handleNodeClick("identity")}
              >
                Identity
              </button>
              {!kidsMode ? (
                <button
                  type="button"
                  className={`neural-focus-btn ${focusNode === "evidence" ? "active" : ""}`}
                  onClick={() => handleNodeClick("evidence")}
                >
                  Evidence
                </button>
              ) : null}
            </div> : null}

            {selectedLeafNode && leafPanel ? (
              <div className="neural-focus-panel">
                <h5>{leafPanel.title}</h5>
                <div className="neural-focus-lines">
                  {leafPanel.lines.map((line, index) => (
                    <p key={`${selectedLeafNode.id}-${index}`} className="neural-focus-line">
                      {line}
                    </p>
                  ))}
                </div>

                {leafPanel.editable ? (
                  <div className="neural-leaf-edit-block">
                    <textarea
                      className="neural-leaf-editor"
                      value={leafDraft}
                      onChange={(event) => setLeafDraft(event.target.value)}
                    />
                  </div>
                ) : null}

                <div className="neural-leaf-actions">
                  {leafPanel.editable ? (
                    <button
                      type="button"
                      className="neural-leaf-btn"
                      onClick={() => void handleSaveLeafEdit()}
                      disabled={isSavingLeaf}
                    >
                      {isSavingLeaf ? "Saving..." : "Save Inline"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="neural-leaf-btn"
                    onClick={handleOpenEditorForLeaf}
                    title="Open in Persona Editor"
                  >
                    Open In Editor
                  </button>
                  <button
                    type="button"
                    className="neural-leaf-btn icon"
                    onClick={handleOpenEditorForLeaf}
                    aria-label="Jump to editor location"
                    title="Jump to this trait/memory"
                  >
                    ↗
                  </button>
                </div>
              </div>
            ) : focusNode !== "core" ? (
              <div className="neural-focus-panel">
                <h5>{focusPanel.title}</h5>
                <div className="neural-focus-lines">
                  {focusPanel.lines.map((line, index) => (
                    <p key={`${focusNode}-${index}`} className="neural-focus-line">
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
