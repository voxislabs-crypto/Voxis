import { useEffect, useMemo, useState } from "react";
import usePrefersReducedMotion from "../hooks/usePrefersReducedMotion.js";

const neuralStyles = `
  .neural-hud {
    position: absolute;
    right: 16px;
    bottom: 100px;
    z-index: 8;
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-end;
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
    inset: 0;
    z-index: 10;
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
    min-height: 380px;
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
    bottom: 14px;
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

function getCorePalette(valence) {
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

function getSproutLimit({ performanceTier, kidsMode, focusNode }) {
  if (performanceTier === "light") {
    return 0;
  }

  if (kidsMode) {
    return performanceTier === "full" ? 4 : 3;
  }

  if (focusNode === "memory") {
    return performanceTier === "full" ? 5 : 4;
  }

  return performanceTier === "full" ? 4 : 3;
}

function getFocusChildren(focusNode, latestDebug, mode, personality) {
  const kidsMode = mode === "kids";

  if (focusNode === "memory") {
    const fromDebug = [
      ...(latestDebug?.memoryInjected || []).slice(0, 4).map((item) => item.content),
      ...(latestDebug?.userMemoryRetrieved || []).slice(0, 4).map((item) => item.content),
    ];

    if (!fromDebug.length) {
      return [kidsMode ? "No big memories yet" : "No memory links this turn"];
    }

    return fromDebug.slice(0, kidsMode ? 3 : 6);
  }

  if (focusNode === "intent") {
    const goal = latestDebug?.goal?.goal;
    if (!goal) {
      return [kidsMode ? "Thinking what to do next" : "No active intent selected"];
    }

    if (kidsMode) {
      return ["Fun idea active", "Planning next answer"];
    }

    return [goal, `source: ${latestDebug?.goal?.source || "unknown"}`];
  }

  if (focusNode === "identity") {
    const lines = [];
    if (latestDebug?.flags?.reconditioned) {
      lines.push(kidsMode ? "Character staying steady" : "reconditioning anchor fired");
    }
    if (latestDebug?.scientist?.repairAttempted) {
      lines.push(kidsMode ? "Thinking extra carefully" : "scientist repair pass attempted");
    }
    const promptUtil = latestDebug?.prompt?.promptBudget?.utilization;
    if (Number.isFinite(promptUtil)) {
      lines.push(kidsMode ? "Brain using space wisely" : `prompt utilization ${(promptUtil * 100).toFixed(1)}%`);
    }
    return lines.length ? lines : [kidsMode ? "Identity calm" : `${personality?.name || "persona"} stable`];
  }

  if (focusNode === "evidence") {
    const violations = latestDebug?.scientist?.validation?.violations || [];
    const hasCitation = Boolean(latestDebug?.scientist?.validation?.hasCitation);
    if (violations.includes("invalid_citation_reference")) {
      return ["invalid citation index", "repair required"];
    }
    if (violations.includes("missing_citations")) {
      return ["citations missing", "add [S#] references"];
    }
    if (hasCitation) {
      return ["citations linked", `sources ${latestDebug?.scientist?.sourceCount || 0}`];
    }
    return ["evidence pending"];
  }

  return [];
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
  performanceTier: requestedPerformanceTier,
  voiceNarrationEnabled = false,
}) {
  const enabled = import.meta.env.VITE_NEURAL_CORE_ENABLED !== "false";
  const [expanded, setExpanded] = useState(false);
  const [focusNode, setFocusNode] = useState("core");
  const [tick, setTick] = useState(0);
  const prefersReducedMotion = usePrefersReducedMotion();

  const performanceTier = resolvePerformanceTier(requestedPerformanceTier, mode, prefersReducedMotion);

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

  const mood = latestDebug?.mood?.after || personality?.moodState || { valence: 0, arousal: 0, dominance: 0 };
  const valence = Number(mood?.valence || 0);
  const arousal = Number(mood?.arousal || 0);
  const dominance = Number(mood?.dominance || 0);
  const palette = getCorePalette(valence);
  const coreSize = Math.round(98 + clamp(Math.abs(arousal), 0, 1) * 56);
  const glowSize = 26 + clamp(Math.abs(dominance), 0, 1) * 26 + clamp(Math.abs(arousal), 0, 1) * 14;
  const heatGlow = 14 + clamp(Math.abs(arousal), 0, 1) * 30;

  const memoryCount = (latestDebug?.memoryInjected || []).length + (latestDebug?.userMemoryRetrieved || []).length;
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

  const focusChildren = useMemo(
    () => getFocusChildren(focusNode, latestDebug, mode, personality),
    [focusNode, latestDebug, mode, personality],
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

  const childNodes = focusChildren.map((label, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(1, focusChildren.length) + tick * (performanceTier === "full" ? 0.3 : 0.18);
    const radius = kidsMode ? 14 : performanceTier === "full" ? 18 : 16;
    return {
      id: `focus-child-${index}`,
      label,
      x: focusPos.x + Math.cos(angle) * radius,
      y: focusPos.y + Math.sin(angle) * radius,
    };
  });

  const visibleChildNodes = useMemo(
    () => childNodes.slice(0, getSproutLimit({ performanceTier, kidsMode, focusNode })),
    [childNodes, focusNode, kidsMode, performanceTier],
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
              {kidsMode ? "Friend Brain" : "Voxis Neural Core"}
            </h4>
            <button type="button" className="neural-close" onClick={() => setExpanded(false)}>
              Close
            </button>
          </div>

          <div className="neural-scene">
            <div className="neural-assistive">
              {kidsMode
                ? "Large touch targets stay on in Kids Mode. Tap the Brain orb, use voice narration if enabled, or press N on a keyboard."
                : "Scientist Mode keeps evidence visible and shows repair ripples when the system reorganizes a response."}
            </div>

            <div className="neural-status">
              <span className="neural-pill">Performance {performanceTier}</span>
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

            <div
              className="neural-scene-camera"
              style={{ transform: `translate(${cameraTranslateX}%, ${cameraTranslateY}%) scale(${cameraScale})` }}
            >
              <svg className="neural-stars" viewBox="0 0 100 100" preserveAspectRatio="none">
                {stars.map((star, i) => (
                  <circle key={`star-${i}`} cx={star.x} cy={star.y} r={star.r} fill={`rgba(170,220,255,${star.a})`} />
                ))}
              </svg>

              {performanceTier !== "light" ? (
                <svg className="neural-sprouts" viewBox="0 0 100 100" preserveAspectRatio="none">
                  {primarySprouts.map((sprout, index) => (
                    <path
                      key={`${sprout.id}-${sprout.active ? "active" : "idle"}-${performanceTier}`}
                      d={buildSproutPath(sprout.start, sprout.end, sprout.curve, sprout.swing)}
                      className={`neural-sprout-path trunk ${sprout.type} ${sprout.active ? "active grow flow" : ""}`.trim()}
                      style={{
                        opacity: sprout.active ? 0.92 : performanceTier === "full" ? 0.42 : 0.28,
                        animationDelay: `${index * 120}ms`,
                      }}
                    />
                  ))}

                  {focusedSprouts.map((sprout, index) => (
                    <g key={sprout.id}>
                      <path
                        d={buildSproutPath(sprout.start, sprout.end, sprout.curve, sprout.swing)}
                        className={`neural-sprout-path ${sprout.type} active grow flow`.trim()}
                        style={{
                          animationDelay: `${90 + index * 80}ms`,
                          strokeWidth: sprout.strokeWidth,
                          opacity: kidsMode ? 0.94 : 0.9,
                        }}
                      />
                      <circle
                        cx={sprout.bud.x}
                        cy={sprout.bud.y}
                        r={kidsMode ? 1.25 : 1.1}
                        className={`neural-sprout-bud ${sprout.type}${sprout.altBud ? " alt" : ""}`}
                        style={{ animationDelay: `${180 + index * 70}ms` }}
                      />
                      {sprout.spark ? (
                        <circle
                          cx={sprout.end.x}
                          cy={sprout.end.y}
                          r="0.82"
                          className="neural-sprout-bud spark"
                          style={{ animationDelay: `${260 + index * 90}ms` }}
                        />
                      ) : null}
                    </g>
                  ))}
                </svg>
              ) : null}

              <svg className="neural-links" viewBox="0 0 100 100" preserveAspectRatio="none">
                <line x1={scene.core.x} y1={scene.core.y} x2={scene.memory.x} y2={scene.memory.y} className={memoryCount ? "active" : ""} />
                <line x1={scene.core.x} y1={scene.core.y} x2={scene.intent.x} y2={scene.intent.y} className={hasIntent ? "active" : ""} />
                <line
                  x1={scene.core.x}
                  y1={scene.core.y}
                  x2={scene.identity.x}
                  y2={scene.identity.y}
                  className={`${identityActive ? "active" : ""} ${reconditioningActive ? "repair" : ""}`.trim()}
                />
                {!kidsMode ? (
                  <line
                    x1={scene.core.x}
                    y1={scene.core.y}
                    x2={scene.evidence.x}
                    y2={scene.evidence.y}
                    className={`${evidenceActive ? "active" : ""} ${repairActive ? "repair" : ""}`.trim()}
                  />
                ) : null}
                {visibleChildNodes.map((child) => (
                  <line
                    key={`child-link-${child.id}`}
                    x1={focusPos.x}
                    y1={focusPos.y}
                    x2={child.x}
                    y2={child.y}
                    className="active"
                  />
                ))}
              </svg>

              <button
                type="button"
                className="neural-orb core pulse"
                style={{
                  left: `${scene.core.x}%`,
                  top: `${scene.core.y}%`,
                  width: `${coreSize}px`,
                  height: `${coreSize}px`,
                  background: `radial-gradient(circle at 30% 30%, ${palette.inner}, ${palette.outer})`,
                  boxShadow: `0 0 ${glowSize}px ${palette.glow}, 0 0 ${heatGlow}px rgba(255, 170, 74, 0.26), 0 0 0 1px rgba(255,255,255,0.18) inset`,
                }}
                onClick={() => setFocusNode("core")}
                aria-pressed={focusNode === "core"}
                aria-label={kidsMode ? "Focus feeling orb" : "Focus mood core"}
              >
                <span className="neural-label">{kidsMode ? "Feeling" : "Mood Core"}</span>
                <span className="neural-sub">
                  {kidsMode ? (personality?.moodLabel || "calm") : `V:${valence.toFixed(2)} A:${arousal.toFixed(2)} D:${dominance.toFixed(2)}`}
                </span>
              </button>

              {repairActive ? (
                <div
                  className="neural-ripple repair"
                  style={{ left: `${scene.core.x}%`, top: `${scene.core.y}%`, width: `${coreSize + 40}px`, height: `${coreSize + 40}px` }}
                />
              ) : null}

              {reconditioningActive ? (
                <div
                  className="neural-ripple recondition"
                  style={{ left: `${scene.identity.x}%`, top: `${scene.identity.y}%`, width: "128px", height: "128px" }}
                />
              ) : null}

              <button
                type="button"
                className={`neural-orb child ${kidsMode ? "kids-touch" : ""}`}
                style={{
                  left: `${scene.memory.x}%`,
                  top: `${scene.memory.y}%`,
                  width: "96px",
                  height: "96px",
                  background: kidsMode
                    ? "radial-gradient(circle at 30% 30%, rgba(255, 223, 118, 0.95), rgba(198, 142, 38, 0.96))"
                    : "radial-gradient(circle at 30% 30%, rgba(255, 190, 104, 0.92), rgba(172, 104, 34, 0.94))",
                  opacity: memoryCount ? 1 : 0.6,
                }}
                onClick={() => setFocusNode("memory")}
                aria-pressed={focusNode === "memory"}
              >
                <span className="neural-label">{kidsMode ? "Remember" : "Memory"}</span>
                <span className="neural-sub">{kidsMode ? (memoryCount ? "Remembering!" : "Quiet") : `${memoryCount} linked`}</span>
              </button>

              <button
                type="button"
                className={`neural-orb child ${kidsMode ? "kids-touch" : ""}`}
                style={{
                  left: `${scene.intent.x}%`,
                  top: `${scene.intent.y}%`,
                  width: "90px",
                  height: "90px",
                  background: kidsMode
                    ? "radial-gradient(circle at 30% 30%, rgba(154, 238, 191, 0.95), rgba(52, 154, 112, 0.96))"
                    : "radial-gradient(circle at 30% 30%, rgba(255, 142, 90, 0.92), rgba(176, 64, 22, 0.94))",
                  opacity: hasIntent ? 1 : 0.58,
                }}
                onClick={() => setFocusNode("intent")}
                aria-pressed={focusNode === "intent"}
              >
                <span className="neural-label">{kidsMode ? "Idea" : "Intent"}</span>
                <span className="neural-sub">{kidsMode ? (hasIntent ? "Bright!" : "Listening") : (hasIntent ? "active" : "idle")}</span>
              </button>

              <button
                type="button"
                className={`neural-orb child ${kidsMode ? "kids-touch" : ""}`}
                style={{
                  left: `${scene.identity.x}%`,
                  top: `${scene.identity.y}%`,
                  width: "92px",
                  height: "92px",
                  background: kidsMode
                    ? "radial-gradient(circle at 30% 30%, rgba(165, 197, 255, 0.95), rgba(72, 122, 206, 0.96))"
                    : "radial-gradient(circle at 30% 30%, rgba(126, 182, 255, 0.92), rgba(52, 84, 178, 0.94))",
                  opacity: identityActive ? 1 : 0.62,
                }}
                onClick={() => setFocusNode("identity")}
                aria-pressed={focusNode === "identity"}
              >
                <span className="neural-label">{kidsMode ? "Self" : "Identity"}</span>
                <span className="neural-sub">{kidsMode ? (identityActive ? "Steady" : "Calm") : (identityActive ? "stabilizing" : "stable")}</span>
              </button>

              {!kidsMode ? (
                <button
                  type="button"
                  className="neural-orb child"
                  style={{
                    left: `${scene.evidence.x}%`,
                    top: `${scene.evidence.y}%`,
                    width: "88px",
                    height: "88px",
                    background: citationIssue
                      ? "radial-gradient(circle at 30% 30%, rgba(255, 128, 128, 0.92), rgba(160, 34, 34, 0.94))"
                      : "radial-gradient(circle at 30% 30%, rgba(184, 220, 255, 0.92), rgba(54, 102, 188, 0.94))",
                    opacity: citationValid || citationIssue ? 1 : 0.58,
                  }}
                  onClick={() => setFocusNode("evidence")}
                  aria-pressed={focusNode === "evidence"}
                >
                  <span className="neural-label">Evidence</span>
                  <span className="neural-sub">{repairActive ? "thinking..." : citationIssue ? "needs repair" : citationValid ? "citations linked" : "awaiting"}</span>
                </button>
              ) : null}

              {visibleChildNodes.map((child, index) => (
                <div
                  key={`${focusNode}-${child.id}`}
                  className={`neural-orb child sprout ${kidsMode ? "kids-touch" : ""}`}
                  style={{
                    left: `${child.x}%`,
                    top: `${child.y}%`,
                    width: kidsMode ? "88px" : "94px",
                    height: kidsMode ? "88px" : "94px",
                    background: kidsMode
                      ? "radial-gradient(circle at 30% 30%, rgba(255, 239, 159, 0.95), rgba(214, 168, 62, 0.94))"
                      : "radial-gradient(circle at 30% 30%, rgba(186, 226, 255, 0.90), rgba(78, 124, 208, 0.92))",
                    fontSize: "0.6rem",
                    animationDelay: performanceTier === "light" ? "0ms" : `${90 + index * 70}ms`,
                  }}
                >
                  <span className="neural-sub" style={{ padding: "0 8px" }}>{child.label}</span>
                </div>
              ))}
            </div>

            <div className="neural-legend">
              <span className="neural-pill">{kidsMode ? "Mode: Kids" : "Mode: Scientist"}</span>
              <span className="neural-pill">{kidsMode ? `Feeling: ${personality?.moodLabel || "calm"}` : `Valence ${valence.toFixed(2)}`}</span>
              <span className="neural-pill">Memory links {memoryCount}</span>
              <span className="neural-pill">Intent {hasIntent ? "on" : "off"}</span>
              <span className="neural-pill">Identity {identityActive ? "active" : "steady"}</span>
              {!kidsMode ? <span className="neural-pill">Evidence {citationIssue ? "repair" : citationValid ? "linked" : "pending"}</span> : null}
              {performanceTier !== "light" ? <span className="neural-pill">SVG sprouts active</span> : null}
              {performanceTier !== "light" ? <span className="neural-pill">Focused branches {visibleChildNodes.length}</span> : null}
              {performanceTier === "full" && !kidsMode ? <span className="neural-pill">Full tier ready for force-graph v0.3</span> : null}
              <span className="neural-pill">Shortcut N: toggle</span>
            </div>

            <div className="neural-focus-row">
              <button
                type="button"
                className={`neural-focus-btn ${focusNode === "core" ? "active" : ""}`}
                onClick={() => setFocusNode("core")}
              >
                Core
              </button>
              <button
                type="button"
                className={`neural-focus-btn ${focusNode === "memory" ? "active" : ""}`}
                onClick={() => setFocusNode("memory")}
              >
                Memory
              </button>
              <button
                type="button"
                className={`neural-focus-btn ${focusNode === "intent" ? "active" : ""}`}
                onClick={() => setFocusNode("intent")}
              >
                Intent
              </button>
              <button
                type="button"
                className={`neural-focus-btn ${focusNode === "identity" ? "active" : ""}`}
                onClick={() => setFocusNode("identity")}
              >
                Identity
              </button>
              {!kidsMode ? (
                <button
                  type="button"
                  className={`neural-focus-btn ${focusNode === "evidence" ? "active" : ""}`}
                  onClick={() => setFocusNode("evidence")}
                >
                  Evidence
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
