import { useMemo } from "react";

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

  .avatar-face {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .avatar-face .eye {
    fill: rgba(40, 216, 255, 0.18);
    stroke: var(--eye);
    stroke-width: 1.8;
    filter: drop-shadow(0 0 7px rgba(48, 236, 255, 0.6));
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
`;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export default function AvatarCore({
  valence = 0,
  arousal = 0,
  phase = "",
  speaking = false,
  size = "default",
}) {
  const mood = useMemo(() => {
    const v = clamp(Number(valence) || 0, -1, 1);
    const a = clamp(Number(arousal) || 0, -1, 1);

    const eyeOpen = 10 + a * 4 - Math.max(0, -v) * 3;
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
      rim: phase === "reply" ? "rgba(255, 128, 196, 0.72)" : "rgba(192, 82, 255, 0.48)",
    };
  }, [arousal, phase, valence]);

  const speakingWave = speaking || ["generation", "reply", "reply-complete"].includes(phase);
  const waveClass = speakingWave ? (phase === "intent" || phase === "mood" ? "burst" : "") : "idle";

  return (
    <div
      className={`avatar-core ${size === "compact" ? "compact" : size === "large" ? "large" : ""}`.trim()}
      style={{ "--aura": mood.aura, "--rim": mood.rim }}
      aria-hidden="true"
    >
      <style>{avatarStyles}</style>
      <div className="avatar-aura" />
      <svg className="avatar-face" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path className="brow" d={`M 26 ${32 + mood.browTilt} Q 35 ${26 + mood.browTilt} 43 ${32 + mood.browTilt}`} />
        <path className="brow" d={`M 57 ${32 - mood.browTilt} Q 65 ${26 - mood.browTilt} 74 ${32 - mood.browTilt}`} />

        <ellipse className="eye" cx="34" cy="48" rx="10" ry={mood.eyeOpen} />
        <ellipse className="eye" cx="66" cy="48" rx="10" ry={mood.eyeOpen} />
        <circle className="pupil" cx="36" cy="48" r="2.2" />
        <circle className="pupil" cx="64" cy="48" r="2.2" />
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
