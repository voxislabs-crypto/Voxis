import { useEffect, useMemo, useRef, useState } from "react";

const avatarStyles = `
  .avatar-core {
    --aura: rgba(0, 240, 255, 0.38);
    --inner: rgba(10, 26, 48, 0.94);
    --rim: rgba(255, 86, 185, 0.48);
    --eye: #58eaff;
    --wave: #ce48ff;
    --warm: #ff9f4a;
    position: relative;
    width: var(--size, 72px);
    height: var(--size, 72px);
    border-radius: 999px;
    display: grid;
    place-items: center;
    background:
      radial-gradient(circle at 35% 28%, rgba(108, 228, 255, 0.26), transparent 45%),
      radial-gradient(circle at 72% 74%, rgba(198, 72, 255, 0.18), transparent 42%),
      var(--inner);
    border: 1px solid rgba(188, 241, 255, 0.22);
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.05) inset,
      0 0 18px var(--aura),
      0 0 32px rgba(0, 120, 255, 0.18);
    animation: avatarFloat 3.4s ease-in-out infinite;
    overflow: hidden;
  }

  .avatar-core::before {
    content: "";
    position: absolute;
    inset: -12%;
    border-radius: 999px;
    border: 1px solid var(--rim);
    opacity: 0.8;
    filter: blur(1px);
  }

  .avatar-core.exp-calm {
    --eye: #58eaff;
    --wave: #b652ff;
  }

  .avatar-core.exp-bright {
    --eye: #8af7ff;
    --wave: #ff6fc9;
  }

  .avatar-core.exp-focused {
    --eye: #63dbff;
    --wave: #9f4dff;
  }

  .avatar-core.exp-tense {
    --eye: #52b8ff;
    --wave: #7f41ff;
  }

  .avatar-core.exp-surge {
    --eye: #99fdff;
    --wave: #ff9b57;
  }

  .avatar-core.persona-sentinel {
    --eye: #5ed3ff;
    --wave: #8a49ff;
  }

  .avatar-core.persona-wisp {
    --eye: #86f6ff;
    --wave: #ff70cf;
  }

  .avatar-core.persona-oracle {
    --eye: #79dfff;
    --wave: #b56eff;
  }

  .avatar-core.persona-echo {
    --eye: #66f2ff;
    --wave: #ff8b62;
  }

  .avatar-core.persona-rogue {
    --eye: #79b9ff;
    --wave: #ff7a67;
  }

  .avatar-core.state-idle {
    animation-duration: 3.8s;
  }

  .avatar-core.state-listen {
    animation-duration: 3.1s;
  }

  .avatar-core.state-think {
    animation-duration: 2.4s;
  }

  .avatar-core.state-speak {
    animation-duration: 1.5s;
  }

  .avatar-core.state-recover {
    animation-duration: 2.1s;
  }

  .avatar-core.compact {
    --size: 50px;
  }

  .avatar-core.large {
    --size: 86px;
  }

  .avatar-aura {
    position: absolute;
    inset: -22%;
    border-radius: 999px;
    background: radial-gradient(circle, var(--aura), transparent 68%);
    opacity: 0.66;
    animation: avatarPulse 1.6s ease-in-out infinite;
    pointer-events: none;
  }

  .avatar-core.state-speak .avatar-aura {
    animation-duration: 0.82s;
    opacity: 0.88;
  }

  .avatar-core.state-think .avatar-aura {
    animation-duration: 1.1s;
    opacity: 0.74;
  }

  .avatar-face {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .avatar-face .mouth {
    fill: none;
    stroke: var(--eye);
    stroke-width: 1.1;
    stroke-linecap: round;
    opacity: 0;
    transform-origin: 50px 68px;
    transform: scaleX(0.4);
    transition: opacity 160ms ease, transform 160ms ease;
  }

  .avatar-core.state-speak .avatar-face .mouth {
    opacity: 0.72;
    transform: scaleX(1);
  }

  .avatar-face .eye {
    fill: rgba(40, 216, 255, 0.18);
    stroke: var(--eye);
    stroke-width: 1.8;
    filter: drop-shadow(0 0 7px rgba(48, 236, 255, 0.6));
    transform-origin: center;
    animation: avatarBlink 6.6s ease-in-out infinite;
    transition: ry 240ms ease;
  }

  .avatar-face .pupil {
    fill: rgba(122, 247, 255, 0.9);
  }

  .avatar-face .brow {
    fill: none;
    stroke: var(--eye);
    stroke-width: 1.8;
    stroke-linecap: round;
    opacity: 0.92;
  }

  .avatar-wave {
    position: absolute;
    left: 50%;
    bottom: 19%;
    transform: translateX(-50%);
    display: flex;
    gap: 3px;
    align-items: flex-end;
    pointer-events: none;
  }

  .avatar-wave span {
    width: 3px;
    border-radius: 999px;
    background: linear-gradient(180deg, var(--wave), #6d35ff);
    box-shadow: 0 0 9px rgba(200, 72, 255, 0.62);
    animation: avatarSpeak 760ms ease-in-out infinite;
  }

  .avatar-wave.idle span {
    animation-duration: 1.8s;
    opacity: 0.62;
  }

  .avatar-wave.recover span {
    animation-duration: 1.25s;
    opacity: 0.74;
  }

  .avatar-wave.burst span {
    background: linear-gradient(180deg, var(--warm), var(--wave));
    box-shadow: 0 0 10px rgba(255, 165, 89, 0.72);
  }

  .avatar-ghost-tail {
    position: absolute;
    bottom: -24%;
    width: 62%;
    height: 40%;
    border-radius: 999px;
    background: radial-gradient(circle at 50% 20%, rgba(125, 229, 255, 0.38), transparent 68%);
    filter: blur(6px);
    opacity: 0.62;
    animation: avatarTail 2.2s ease-in-out infinite;
  }

  @keyframes avatarPulse {
    0% { transform: scale(0.94); opacity: 0.45; }
    50% { transform: scale(1.06); opacity: 0.85; }
    100% { transform: scale(0.94); opacity: 0.45; }
  }

  @keyframes avatarFloat {
    0% { transform: translateY(0px); }
    50% { transform: translateY(-2px); }
    100% { transform: translateY(0px); }
  }

  @keyframes avatarTail {
    0% { transform: scaleX(0.92); opacity: 0.44; }
    50% { transform: scaleX(1.08); opacity: 0.72; }
    100% { transform: scaleX(0.92); opacity: 0.44; }
  }

  @keyframes avatarSpeak {
    0% { transform: scaleY(0.34); opacity: 0.42; }
    45% { transform: scaleY(1); opacity: 1; }
    100% { transform: scaleY(0.34); opacity: 0.42; }
  }

  @keyframes avatarBlink {
    0%, 46%, 49%, 100% { transform: scaleY(1); }
    47%, 48% { transform: scaleY(0.08); }
  }
`;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hashSeed(input) {
  const text = String(input || "voxis");
  let hash = 0;

  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }

  return hash;
}

function resolvePersonaPreset(seed, mode, explicitPreset = "auto") {
  const requested = String(explicitPreset || "auto").trim().toLowerCase();
  if (["sentinel", "wisp", "oracle", "echo", "rogue"].includes(requested)) {
    return requested;
  }

  if (mode === "kids") {
    return "wisp";
  }

  const presets = ["sentinel", "oracle", "echo", "wisp", "rogue"];
  return presets[hashSeed(seed) % presets.length];
}

function resolveTargetState({ phase, speaking }) {
  if (speaking || ["generation", "reply", "reply-complete"].includes(phase)) {
    return "speak";
  }

  if (["intent", "mood", "memory", "memory-write", "user-memory-write"].includes(phase)) {
    return "think";
  }

  if (["queued", "prompt"].includes(phase)) {
    return "listen";
  }

  return "idle";
}

function resolveExpressionMode({ valence, arousal, phase, animState }) {
  if (["intent", "generation", "reply"].includes(phase)) {
    return "surge";
  }

  if (animState === "recover") {
    return "focused";
  }

  if (valence >= 0.4 && arousal >= 0.15) {
    return "bright";
  }

  if (valence <= -0.25 || arousal >= 0.75) {
    return "tense";
  }

  if (Math.abs(valence) < 0.18 && arousal < 0.22) {
    return "calm";
  }

  return "focused";
}

export default function AvatarCore({
  valence = 0,
  arousal = 0,
  phase = "",
  speaking = false,
  mode = "scientist",
  personalitySeed = "",
  expressionProfile,
  expressionPreset = "auto",
  size = "default",
}) {
  const [gaze, setGaze] = useState({ x: 0, y: 0 });
  const [animState, setAnimState] = useState("idle");
  const recoverTimerRef = useRef(null);

  const expression = useMemo(() => {
    const profile = expressionProfile && typeof expressionProfile === "object" ? expressionProfile : {};
    return {
      calmness: clamp(Number(profile.calmness), 0, 1) || 0.5,
      intensity: clamp(Number(profile.intensity), 0, 1) || 0.5,
      blinkRate: clamp(Number(profile.blinkRate), 0, 1) || 0.5,
      gazeDrift: clamp(Number(profile.gazeDrift), 0, 1) || 0.5,
    };
  }, [expressionProfile]);

  const targetState = useMemo(
    () => resolveTargetState({ phase, speaking }),
    [phase, speaking],
  );

  useEffect(() => {
    if (recoverTimerRef.current) {
      window.clearTimeout(recoverTimerRef.current);
      recoverTimerRef.current = null;
    }

    setAnimState((current) => {
      if (targetState === "speak") {
        return "speak";
      }

      if (current === "speak" && targetState !== "speak") {
        recoverTimerRef.current = window.setTimeout(() => {
          setAnimState(targetState === "idle" ? "idle" : targetState);
        }, 420);
        return "recover";
      }

      return targetState;
    });

    return () => {
      if (recoverTimerRef.current) {
        window.clearTimeout(recoverTimerRef.current);
        recoverTimerRef.current = null;
      }
    };
  }, [targetState]);

  useEffect(() => {
    const intensity = clamp(
      0.12 + Math.abs(Number(arousal) || 0) * (0.4 + expression.intensity * 0.5) + expression.gazeDrift * 0.18,
      0.18,
      1,
    );
    const intervalMs = speaking ? Math.max(340, 680 - expression.gazeDrift * 260) : Math.max(720, 1500 - expression.gazeDrift * 420);

    const interval = window.setInterval(() => {
      if (["intent", "reply", "generation"].includes(phase)) {
        setGaze({ x: clamp(0.52 * intensity, -0.9, 0.9), y: clamp(-0.16 * intensity, -0.5, 0.5) });
        return;
      }

      const targetX = ((Math.random() * 2) - 1) * intensity;
      const targetY = ((Math.random() * 2) - 1) * intensity * 0.58;
      setGaze({ x: targetX, y: targetY });
    }, intervalMs);

    return () => window.clearInterval(interval);
  }, [arousal, expression.gazeDrift, expression.intensity, phase, speaking]);

  const mood = useMemo(() => {
    const v = clamp(Number(valence) || 0, -1, 1);
    const a = clamp(Number(arousal) || 0, -1, 1);

    const eyeOpen = 8 + expression.calmness * 4 + a * (2.2 + expression.intensity * 2.8) - Math.max(0, -v) * 3;
    const browTilt = clamp(-v * 8 + (phase === "intent" ? 4 : 0), -9, 9);
    const aura = phase === "generation"
      ? "rgba(255, 159, 74, 0.42)"
      : v < -0.2
      ? "rgba(88, 176, 255, 0.46)"
      : "rgba(0, 240, 255, 0.40)";

    return {
      eyeOpen,
      browTilt,
      aura,
      mode: resolveExpressionMode({ valence: v, arousal: a, phase, animState }),
      rim: phase === "reply" ? "rgba(255, 128, 196, 0.72)" : "rgba(192, 82, 255, 0.48)",
      blinkDuration: `${(8.2 - expression.blinkRate * 4.8).toFixed(2)}s`,
    };
  }, [animState, arousal, expression.blinkRate, expression.calmness, expression.intensity, phase, valence]);

  const preset = useMemo(
    () => resolvePersonaPreset(personalitySeed, mode, expressionPreset),
    [expressionPreset, mode, personalitySeed],
  );

  const pupilOffsetX = clamp(gaze.x * 2.3, -2.2, 2.2);
  const pupilOffsetY = clamp(gaze.y * 1.8, -1.6, 1.6);

  const speakingWave = animState === "speak" || ["generation", "reply", "reply-complete"].includes(phase);
  const waveClass = speakingWave
    ? (phase === "intent" || phase === "mood" ? "burst" : "")
    : animState === "recover"
    ? "recover"
    : "idle";

  return (
    <div
      className={`avatar-core exp-${mood.mode} persona-${preset} state-${animState} ${size === "compact" ? "compact" : size === "large" ? "large" : ""}`.trim()}
      style={{ "--aura": mood.aura, "--rim": mood.rim }}
      aria-hidden="true"
    >
      <style>{avatarStyles}</style>
      <div className="avatar-aura" />
      <svg className="avatar-face" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path className="brow" d={`M 26 ${32 + mood.browTilt} Q 35 ${26 + mood.browTilt} 43 ${32 + mood.browTilt}`} />
        <path className="brow" d={`M 57 ${32 - mood.browTilt} Q 65 ${26 - mood.browTilt} 74 ${32 - mood.browTilt}`} />

        <ellipse className="eye" cx="34" cy="48" rx="10" ry={mood.eyeOpen} style={{ animationDuration: mood.blinkDuration }} />
        <ellipse className="eye" cx="66" cy="48" rx="10" ry={mood.eyeOpen} style={{ animationDuration: mood.blinkDuration }} />
        <circle className="pupil" cx={36 + pupilOffsetX} cy={48 + pupilOffsetY} r="2.2" />
        <circle className="pupil" cx={64 + pupilOffsetX} cy={48 + pupilOffsetY} r="2.2" />
        <path className="mouth" d="M 44 68 Q 50 71 56 68" />
      </svg>

      <div className={`avatar-wave ${waveClass}`.trim()}>
        {[10, 16, 12, 20, 13, 17, 10].map((h, index) => (
          <span key={`bar-${index}`} style={{ height: `${h}px`, animationDelay: `${index * 65}ms` }} />
        ))}
      </div>

      <div className="avatar-ghost-tail" />
    </div>
  );
}
