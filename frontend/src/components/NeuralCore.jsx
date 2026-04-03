import { useEffect, useMemo, useState } from "react";

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
    width: 64px;
    height: 64px;
    border-radius: 999px;
    border: 0;
    cursor: pointer;
    color: #fff;
    font-weight: 800;
    letter-spacing: 0.03em;
    font-size: 0.62rem;
    text-transform: uppercase;
    box-shadow: 0 0 24px rgba(0, 200, 255, 0.38), 0 0 0 1px rgba(255, 255, 255, 0.18) inset;
    transition: transform 180ms ease, box-shadow 180ms ease;
  }

  .neural-button.kids {
    width: 84px;
    height: 84px;
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
    min-width: 104px;
    min-height: 104px;
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

  .neural-links line {
    stroke: rgba(0, 210, 255, 0.36);
    stroke-width: 1.4;
  }

  .neural-links line.active {
    stroke: rgba(255, 140, 74, 0.68);
    stroke-width: 2.2;
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

  .neural-sparkle:nth-child(2n) {
    animation-duration: 4.1s;
  }

  .neural-sparkle:nth-child(3n) {
    animation-duration: 5.0s;
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
`;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function valenceToHue(valence) {
  const normalized = clamp((Number(valence) + 1) / 2, 0, 1);
  // cyan (190) -> magenta (312)
  return 190 + normalized * (312 - 190);
}

function buildStars(width, height, count = 70) {
  return Array.from({ length: count }, (_, i) => ({
    x: Math.floor(((i * 97) % 1000) / 1000 * width),
    y: Math.floor(((i * 131) % 1000) / 1000 * height),
    r: 0.5 + ((i * 17) % 10) / 10,
    a: 0.2 + ((i * 29) % 60) / 100,
  }));
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

export default function NeuralCore({ personality, mode = "scientist", latestDebug }) {
  const enabled = import.meta.env.VITE_NEURAL_CORE_ENABLED !== "false";
  const [expanded, setExpanded] = useState(false);
  const [focusNode, setFocusNode] = useState("core");
  const [tick, setTick] = useState(0);

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
    if (!enabled) {
      return;
    }

    let raf = null;
    const start = performance.now();

    function frame(now) {
      setTick((now - start) / 1000);
      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);
    return () => {
      if (raf) {
        cancelAnimationFrame(raf);
      }
    };
  }, [enabled]);

  const mood = latestDebug?.mood?.after || personality?.moodState || { valence: 0, arousal: 0, dominance: 0 };
  const valence = Number(mood?.valence || 0);
  const arousal = Number(mood?.arousal || 0);
  const dominance = Number(mood?.dominance || 0);

  const hue = valenceToHue(valence);
  const coreSize = Math.round(98 + clamp(Math.abs(arousal), 0, 1) * 56);
  const glowSize = 26 + clamp(Math.abs(dominance), 0, 1) * 26;

  const memoryCount = (latestDebug?.memoryInjected || []).length + (latestDebug?.userMemoryRetrieved || []).length;
  const hasIntent = Boolean(latestDebug?.goal?.goal);
  const identityActive = Boolean(latestDebug?.flags?.reconditioned) || Boolean(latestDebug?.scientist?.repairAttempted);
  const citationValid = Boolean(latestDebug?.scientist?.validation?.hasCitation);
  const citationIssue = Array.isArray(latestDebug?.scientist?.validation?.violations)
    ? latestDebug.scientist.validation.violations.includes("invalid_citation_reference") ||
      latestDebug.scientist.validation.violations.includes("missing_citations")
    : false;
  const evidenceActive = mode === "scientist" ? (citationValid && !citationIssue) : false;

  const scene = useMemo(() => {
    const center = { x: 50, y: 48 };
    const radius = 24;

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
        x: center.x + Math.cos(tick * 0.5 + 5.25) * (radius + 4),
        y: center.y + Math.sin(tick * 0.5 + 5.25) * (radius + 4),
      },
    };
  }, [tick]);

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
    const angle = (Math.PI * 2 * index) / Math.max(1, focusChildren.length) + tick * 0.22;
    const radius = kidsMode ? 14 : 16;
    return {
      id: `focus-child-${index}`,
      label,
      x: focusPos.x + Math.cos(angle) * radius,
      y: focusPos.y + Math.sin(angle) * radius,
    };
  });

  if (!enabled || !personality) {
    return null;
  }

  const stars = buildStars(100, 100);
  const kidsSparkles = [
    { left: 14, top: 24, char: "✨" },
    { left: 78, top: 18, char: "⭐" },
    { left: 66, top: 76, char: "💫" },
    { left: 22, top: 70, char: "✨" },
    { left: 86, top: 62, char: "⭐" },
  ];

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
              background: `radial-gradient(circle at 30% 30%, hsla(${hue}, 95%, 70%, 0.95), hsla(${hue}, 88%, 40%, 0.96))`,
              boxShadow: `0 0 ${glowSize}px hsla(${hue}, 96%, 62%, 0.62), 0 0 0 1px rgba(255,255,255,0.18) inset`,
            }}
            title="Open Neural Core"
          >
            {kidsMode ? "Brain" : "Core"}
          </button>
          <div className="neural-tip">
            {kidsMode ? "Open your friend brain" : "Open Neural Core"}
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
            {kidsMode ? (
              <div className="neural-kids-sparkles">
                {kidsSparkles.map((sparkle, index) => (
                  <span
                    key={`sparkle-${index}`}
                    className="neural-sparkle"
                    style={{ left: `${sparkle.left}%`, top: `${sparkle.top}%`, animationDelay: `${index * 180}ms` }}
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

              <svg className="neural-links" viewBox="0 0 100 100" preserveAspectRatio="none">
                <line x1={scene.core.x} y1={scene.core.y} x2={scene.memory.x} y2={scene.memory.y} className={memoryCount ? "active" : ""} />
                <line x1={scene.core.x} y1={scene.core.y} x2={scene.intent.x} y2={scene.intent.y} className={hasIntent ? "active" : ""} />
                <line x1={scene.core.x} y1={scene.core.y} x2={scene.identity.x} y2={scene.identity.y} className={identityActive ? "active" : ""} />
                {!kidsMode ? (
                  <line x1={scene.core.x} y1={scene.core.y} x2={scene.evidence.x} y2={scene.evidence.y} className={evidenceActive ? "active" : ""} />
                ) : null}
                {childNodes.map((child) => (
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
                  background: `radial-gradient(circle at 30% 30%, hsla(${hue}, 95%, 74%, 0.96), hsla(${hue}, 88%, 42%, 0.96))`,
                }}
                onClick={() => setFocusNode("core")}
              >
                <span className="neural-label">{kidsMode ? "Feeling" : "Mood Core"}</span>
                <span className="neural-sub">
                  {kidsMode ? (personality?.moodLabel || "calm") : `V:${valence.toFixed(2)} A:${arousal.toFixed(2)} D:${dominance.toFixed(2)}`}
                </span>
              </button>

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
                >
                  <span className="neural-label">Evidence</span>
                  <span className="neural-sub">{citationIssue ? "needs repair" : citationValid ? "citations linked" : "awaiting"}</span>
                </button>
              ) : null}

              {childNodes.map((child, index) => (
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
                    animationDelay: `${90 + index * 70}ms`,
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
