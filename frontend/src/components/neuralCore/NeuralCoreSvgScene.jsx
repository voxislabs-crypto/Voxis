import { buildSproutPath } from "./neuralCoreModel.js";

export default function NeuralCoreSvgScene({
  compact = false,
  performanceTier,
  kidsMode,
  repairActive,
  reconditioningActive,
  scene,
  stars,
  primarySprouts,
  focusedSprouts,
  memoryCount,
  hasIntent,
  identityActive,
  evidenceActive,
  focusPos,
  visibleChildNodes,
  cameraTranslateX,
  cameraTranslateY,
  cameraScale,
  coreSize,
  palette,
  glowSize,
  heatGlow,
  valence,
  arousal,
  dominance,
  personality,
  focusNode,
  setFocusNode,
  citationIssue,
  citationValid,
  livePhaseBurst,
}) {
  const showWaveform = ["generation", "reply", "reply-complete"].includes(livePhaseBurst);
  const showMemoryBloom = ["memory", "memory-write", "user-memory-write"].includes(livePhaseBurst);
  const showIntentTrail = livePhaseBurst === "intent";

  return (
    <div
      className={`neural-scene-camera${compact ? " compact" : ""}`}
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
        <line
          x1={scene.core.x}
          y1={scene.core.y}
          x2={scene.intent.x}
          y2={scene.intent.y}
          className={(hasIntent || livePhaseBurst === "intent") ? "active" : ""}
        />
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
        {showIntentTrail ? (
          <path
            d={`M ${scene.intent.x} ${scene.intent.y} Q ${(scene.intent.x + scene.core.x) / 2} ${scene.intent.y - 6} ${scene.core.x} ${scene.core.y}`}
            className="neural-steering-trail"
          />
        ) : null}
      </svg>

      <button
        type="button"
        className={`neural-orb core pulse${compact ? " compact" : ""}`}
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

      {livePhaseBurst === "mood" ? (
        <div
          className="neural-ripple repair"
          style={{ left: `${scene.core.x}%`, top: `${scene.core.y}%`, width: `${coreSize + 68}px`, height: `${coreSize + 68}px` }}
        />
      ) : null}

      {showMemoryBloom ? (
        <>
          <div
            className={`neural-bloom-ring${livePhaseBurst === "memory-write" ? " memory-write" : ""}`}
            style={{ left: `${scene.core.x}%`, top: `${scene.core.y}%`, width: `${coreSize + 92}px`, height: `${coreSize + 92}px` }}
          />
          <div
            className={`neural-bloom-ring${livePhaseBurst === "memory-write" ? " memory-write" : ""}`}
            style={{ left: `${scene.memory.x}%`, top: `${scene.memory.y}%`, width: compact ? "122px" : "138px", height: compact ? "122px" : "138px", animationDelay: "90ms" }}
          />
        </>
      ) : null}

      {reconditioningActive ? (
        <div
          className="neural-ripple recondition"
          style={{ left: `${scene.identity.x}%`, top: `${scene.identity.y}%`, width: compact ? "110px" : "128px", height: compact ? "110px" : "128px" }}
        />
      ) : null}

      <button
        type="button"
        className={`neural-orb child ${kidsMode ? "kids-touch" : ""}${compact ? " compact" : ""}`}
        style={{
          left: `${scene.memory.x}%`,
          top: `${scene.memory.y}%`,
          width: compact ? "84px" : "96px",
          height: compact ? "84px" : "96px",
          background: kidsMode
            ? "radial-gradient(circle at 30% 30%, rgba(255, 223, 118, 0.95), rgba(198, 142, 38, 0.96))"
            : "radial-gradient(circle at 30% 30%, rgba(255, 190, 104, 0.92), rgba(172, 104, 34, 0.94))",
          opacity: memoryCount ? 1 : 0.6,
          boxShadow: livePhaseBurst === "memory" ? "0 0 28px rgba(255, 194, 92, 0.72)" : undefined,
        }}
        onClick={() => setFocusNode("memory")}
        aria-pressed={focusNode === "memory"}
      >
        <span className="neural-label">{kidsMode ? "Remember" : "Memory"}</span>
        <span className="neural-sub">{kidsMode ? (memoryCount ? "Remembering!" : "Quiet") : `${memoryCount} linked`}</span>
      </button>

      <button
        type="button"
        className={`neural-orb child ${kidsMode ? "kids-touch" : ""}${compact ? " compact" : ""}`}
        style={{
          left: `${scene.intent.x}%`,
          top: `${scene.intent.y}%`,
          width: compact ? "80px" : "90px",
          height: compact ? "80px" : "90px",
          background: kidsMode
            ? "radial-gradient(circle at 30% 30%, rgba(154, 238, 191, 0.95), rgba(52, 154, 112, 0.96))"
            : "radial-gradient(circle at 30% 30%, rgba(255, 142, 90, 0.92), rgba(176, 64, 22, 0.94))",
          opacity: hasIntent ? 1 : 0.58,
          boxShadow: livePhaseBurst === "intent" ? "0 0 28px rgba(255, 150, 96, 0.72)" : undefined,
        }}
        onClick={() => setFocusNode("intent")}
        aria-pressed={focusNode === "intent"}
      >
        <span className="neural-label">{kidsMode ? "Idea" : "Intent"}</span>
        <span className="neural-sub">{kidsMode ? (hasIntent ? "Bright!" : "Listening") : (hasIntent ? "active" : "idle")}</span>
      </button>

      {showWaveform ? (
        <div className="neural-wave-bars" aria-hidden="true">
          {[24, 38, 28, 44, 20, 34, 26].map((height, index) => (
            <span
              key={`wave-${index}`}
              className="neural-wave-bar"
              style={{ height: `${height}px`, animationDelay: `${index * 70}ms` }}
            />
          ))}
        </div>
      ) : null}

      <button
        type="button"
        className={`neural-orb child ${kidsMode ? "kids-touch" : ""}${compact ? " compact" : ""}`}
        style={{
          left: `${scene.identity.x}%`,
          top: `${scene.identity.y}%`,
          width: compact ? "82px" : "92px",
          height: compact ? "82px" : "92px",
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
          className={`neural-orb child${compact ? " compact" : ""}`}
          style={{
            left: `${scene.evidence.x}%`,
            top: `${scene.evidence.y}%`,
            width: compact ? "78px" : "88px",
            height: compact ? "78px" : "88px",
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
          className={`neural-orb child sprout ${kidsMode ? "kids-touch" : ""}${compact ? " compact" : ""}`}
          style={{
            left: `${child.x}%`,
            top: `${child.y}%`,
            width: kidsMode ? (compact ? "74px" : "88px") : compact ? "80px" : "94px",
            height: kidsMode ? (compact ? "74px" : "88px") : compact ? "80px" : "94px",
            background: kidsMode
              ? "radial-gradient(circle at 30% 30%, rgba(255, 239, 159, 0.95), rgba(214, 168, 62, 0.94))"
              : "radial-gradient(circle at 30% 30%, rgba(186, 226, 255, 0.90), rgba(78, 124, 208, 0.92))",
            fontSize: compact ? "0.56rem" : "0.6rem",
            animationDelay: performanceTier === "light" ? "0ms" : `${90 + index * 70}ms`,
          }}
        >
          <span className="neural-sub" style={{ padding: compact ? "0 6px" : "0 8px" }}>{child.label}</span>
        </div>
      ))}
    </div>
  );
}