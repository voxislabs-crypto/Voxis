function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toThreePosition(point, depth = 0) {
  // Divisor 15.8 pulls nodes ~40% closer to center vs original 9.5
  return [Number(((point.x - 50) / 15.8).toFixed(3)), Number(((50 - point.y) / 15.8).toFixed(3)), depth];
}

function inferMoodState({ valence, arousal, repairActive, livePhaseBurst }) {
  if (repairActive || (valence < -0.18 && arousal > 0.3)) {
    return {
      mood: "chaotic",
      background: ["#030813", "#14081d"],
      speed: 1.15,
      accent: "#ff6aa9",
      secondary: "#00eaff",
    };
  }

  if (["intent", "generation", "reply"].includes(livePhaseBurst) || arousal > 0.48) {
    return {
      mood: "focused",
      background: ["#020814", "#071a2e"],
      speed: 0.95,
      accent: "#7ae7ff",
      secondary: "#8f68ff",
    };
  }

  if (valence > 0.22) {
    return {
      mood: "excited",
      background: ["#030810", "#060d1c"],
      speed: 1.05,
      accent: "#ff9c5c",
      secondary: "#19edff",
    };
  }

  return {
    mood: "calm",
    background: ["#020712", "#07111f"],
    speed: 0.7,
    accent: "#5fdfff",
    secondary: "#bb5cff",
  };
}

function buildPrimaryNodes({
  scene,
  personality,
  memoryCount,
  hasIntent,
  identityActive,
  evidenceActive,
  repairActive,
  reconditioningActive,
}) {
  return [
    {
      id: "core",
      label: personality?.name || "Core",
      position: toThreePosition(scene.core, 0.15),
      strength: 1,
      activity: 1,
      connections: ["memory", "intent", "identity", "evidence"],
      color: "#ff7a3c",
      type: "core",
      meta: "Personality root",
    },
    {
      id: "memory",
      label: "Memory",
      position: toThreePosition(scene.memory, -0.18),
      strength: clamp(0.45 + memoryCount * 0.12, 0.45, 1),
      activity: memoryCount > 0 ? 0.65 + Math.min(0.35, memoryCount * 0.08) : 0.22,
      connections: ["core"],
      color: memoryCount > 0 ? "#ffd166" : "#7bd3ff",
      type: "memory",
      meta: `${memoryCount} memory link${memoryCount === 1 ? "" : "s"}`,
    },
    {
      id: "intent",
      label: "Intent",
      position: toThreePosition(scene.intent, -0.12),
      strength: hasIntent ? 0.72 : 0.42,
      activity: hasIntent ? 0.92 : 0.28,
      connections: ["core"],
      color: hasIntent ? "#00d4ff" : "#1a5a78",
      type: "intent",
      meta: hasIntent ? "Active goal selected" : "No active goal",
    },
    {
      id: "identity",
      label: reconditioningActive ? "Anchor" : "Identity",
      position: toThreePosition(scene.identity, 0.08),
      strength: identityActive ? 0.78 : 0.5,
      activity: identityActive ? 0.85 : 0.3,
      connections: ["core"],
      color: reconditioningActive ? "#c7e8ff" : "#9d8cff",
      type: "identity",
      meta: reconditioningActive ? "Reconditioning active" : "Persona stability",
    },
    {
      id: "evidence",
      label: repairActive ? "Repair" : "Evidence",
      position: toThreePosition(scene.evidence, -0.24),
      strength: evidenceActive || repairActive ? 0.74 : 0.38,
      activity: repairActive ? 1 : evidenceActive ? 0.7 : 0.16,
      connections: ["core"],
      color: repairActive ? "#ffffff" : evidenceActive ? "#ff2d78" : "#3a1555",
      type: repairActive ? "repair" : "evidence",
      meta: repairActive ? "Repair pass running" : evidenceActive ? "Citations linked" : "Evidence pending",
    },
  ];
}

export function buildThreeGraphModel({
  scene,
  personality,
  memoryCount,
  hasIntent,
  identityActive,
  evidenceActive,
  repairActive,
  reconditioningActive,
  visibleChildNodes = [],
  focusNode = "core",
  valence = 0,
  arousal = 0,
  dominance = 0,
  livePhaseBurst = "",
}) {
  const moodState = inferMoodState({ valence, arousal, repairActive, livePhaseBurst });
  const primaryNodes = buildPrimaryNodes({
    scene,
    personality,
    memoryCount,
    hasIntent,
    identityActive,
    evidenceActive,
    repairActive,
    reconditioningActive,
  });

  const childColor =
    focusNode === "memory"
      ? "#f7ce76"
      : focusNode === "intent"
        ? "#ff9d68"
        : focusNode === "identity"
          ? "#9ad3ff"
          : focusNode === "evidence"
            ? "#d5f3ff"
            : moodState.secondary;

  const detailNodes = visibleChildNodes.map((child, index) => ({
    id: child.id || `${focusNode}-detail-${index}`,
    label: String(child.label || `Link ${index + 1}`),
    position: toThreePosition({ x: child.x, y: child.y }, -0.3 - index * 0.05),
    strength: clamp(0.38 + index * 0.05, 0.38, 0.7),
    activity: clamp(0.6 - index * 0.05 + Math.abs(arousal) * 0.2, 0.35, 0.92),
    connections: [focusNode === "core" ? "core" : focusNode],
    color: childColor,
    type: "detail",
    meta: child.meta || `Connected to ${focusNode}`,
    parentId: focusNode,
    source: child.source || "detail",
    payload: child.payload || null,
  }));

  const nodes = [...primaryNodes, ...detailNodes];
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const connections = [];

  for (const node of nodes) {
    for (const targetId of node.connections) {
      if (!nodeMap.has(targetId)) {
        continue;
      }

      const pair = [node.id, targetId].sort().join(":");
      if (connections.some((item) => item.key === pair)) {
        continue;
      }

      const target = nodeMap.get(targetId);
      connections.push({
        key: pair,
        sourceId: node.id,
        targetId,
        color: node.id === "core" || targetId === "core" ? moodState.secondary : node.color,
        weight: clamp((node.activity + target.activity) / 2, 0.2, 1),
      });
    }
  }

  return {
    moodState,
    nodes,
    nodeMap,
    connections,
    metrics: {
      valence: Number(valence || 0),
      arousal: Number(arousal || 0),
      dominance: Number(dominance || 0),
      livePhaseBurst,
    },
  };
}
