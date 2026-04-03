function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function getCorePalette(valence) {
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

export function buildStars(width, height, count = 70) {
  return Array.from({ length: count }, (_, i) => ({
    x: Math.floor((((i * 97) % 1000) / 1000) * width),
    y: Math.floor((((i * 131) % 1000) / 1000) * height),
    r: 0.5 + (((i * 17) % 10) / 10),
    a: 0.2 + (((i * 29) % 60) / 100),
  }));
}

export function buildSproutPath(start, end, curve = 0.18, swing = 1) {
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

export function getBudPosition(start, end, ratio = 0.72) {
  return {
    x: start.x + (end.x - start.x) * ratio,
    y: start.y + (end.y - start.y) * ratio,
  };
}

export function getSignalSproutConfig(type, kidsMode) {
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

export function getSproutLimit({ performanceTier, kidsMode, focusNode, compact }) {
  if (performanceTier === "light") {
    return 0;
  }

  if (compact) {
    return kidsMode ? 2 : 2;
  }

  if (kidsMode) {
    return performanceTier === "full" ? 4 : 3;
  }

  if (focusNode === "memory") {
    return performanceTier === "full" ? 5 : 4;
  }

  return performanceTier === "full" ? 4 : 3;
}

export function getFocusChildren(focusNode, latestDebug, mode, personality) {
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

export function resolvePerformanceTier(requestedTier, mode, prefersReducedMotion) {
  if (prefersReducedMotion) {
    return "light";
  }

  return ["light", "balanced", "full"].includes(requestedTier)
    ? requestedTier
    : mode === "kids"
    ? "light"
    : "balanced";
}

export function getPrimarySproutSpecs({ scene, kidsMode, memoryCount, hasIntent, identityActive, evidenceActive, repairActive, reconditioningActive }) {
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

export function buildNeuralCoreSceneModel({ personality, mode, latestDebug, performanceTier, tick, compact }) {
  const kidsMode = mode === "kids";
  const mood = latestDebug?.mood?.after || personality?.moodState || { valence: 0, arousal: 0, dominance: 0 };
  const valence = Number(mood?.valence || 0);
  const arousal = Number(mood?.arousal || 0);
  const dominance = Number(mood?.dominance || 0);
  const palette = getCorePalette(valence);
  const coreSize = Math.round((compact ? 88 : 98) + clamp(Math.abs(arousal), 0, 1) * (compact ? 40 : 56));
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
  const evidenceActive = mode === "scientist" ? citationValid && !citationIssue : false;

  const center = compact ? { x: 50, y: 50 } : { x: 50, y: 48 };
  const radius = compact ? (performanceTier === "full" ? 22 : 20) : performanceTier === "full" ? 26 : 24;
  const scene = {
    core: { x: center.x, y: center.y },
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
      x: center.x + Math.cos(tick * 0.5 + 5.25 + (repairActive ? 0.3 : 0)) * (radius + (compact ? 2 : 4)),
      y: center.y + Math.sin(tick * 0.5 + 5.25 + (repairActive ? 0.3 : 0)) * (radius + (compact ? 2 : 4)),
    },
  };

  return {
    kidsMode,
    mood,
    valence,
    arousal,
    dominance,
    palette,
    coreSize,
    glowSize,
    heatGlow,
    memoryCount,
    hasIntent,
    identityActive,
    reconditioningActive,
    repairActive,
    citationValid,
    citationIssue,
    evidenceActive,
    scene,
  };
}