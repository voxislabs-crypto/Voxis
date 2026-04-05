import { useRef } from "react";

const SIZE = 200;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = 68;        // pentagon data radius
const LABEL_R = 88;  // label ring radius

const TRAITS = [
  { key: "openness",          label: "O", full: "Openness",          color: "#c860ff" },
  { key: "conscientiousness", label: "C", full: "Conscientiousness", color: "#00d4a8" },
  { key: "extraversion",      label: "E", full: "Extraversion",      color: "#f5a623" },
  { key: "agreeableness",     label: "A", full: "Agreeableness",     color: "#6cff88" },
  { key: "neuroticism",       label: "N", full: "Neuroticism",       color: "#ff6b6b" },
];

function axisAngle(i) {
  return (i * 2 * Math.PI) / 5 - Math.PI / 2;
}

function pt(r, i) {
  const a = axisAngle(i);
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

function toPoints(pts) {
  return pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}

function snap(value, step = 0.05) {
  return Math.round(value / step) * step;
}

function clamp01(n) {
  return Math.max(0, Math.min(1, Number(n)));
}

export default function BigFiveRadar({ values, onChange, disabled = false }) {
  const svgRef = useRef(null);
  const activeAxis = useRef(null);

  const vals = TRAITS.map(t => clamp01(values[t.key] ?? 0.5));
  const dataPts = vals.map((v, i) => pt(v * R, i));

  function svgCoords(e) {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const s = SIZE / rect.width;
    return {
      x: (e.clientX - rect.left) * s,
      y: (e.clientY - rect.top) * s,
    };
  }

  function nearestAxis(x, y) {
    const dx = x - CX;
    const dy = y - CY;
    let best = 0;
    let bestCos = -Infinity;
    for (let i = 0; i < 5; i++) {
      const a = axisAngle(i);
      const len = Math.sqrt(dx * dx + dy * dy) || 1e-6;
      const cos = (dx * Math.cos(a) + dy * Math.sin(a)) / len;
      if (cos > bestCos) { bestCos = cos; best = i; }
    }
    return best;
  }

  function projectOnAxis(x, y, axisIdx) {
    const a = axisAngle(axisIdx);
    const dx = x - CX;
    const dy = y - CY;
    return snap(clamp01((dx * Math.cos(a) + dy * Math.sin(a)) / R));
  }

  function handlePointerDown(e) {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const c = svgCoords(e);
    if (!c) return;
    const idx = nearestAxis(c.x, c.y);
    activeAxis.current = idx;
    onChange(TRAITS[idx].key, projectOnAxis(c.x, c.y, idx));
  }

  function handlePointerMove(e) {
    if (activeAxis.current === null) return;
    const c = svgCoords(e);
    if (!c) return;
    onChange(TRAITS[activeAxis.current].key, projectOnAxis(c.x, c.y, activeAxis.current));
  }

  function handlePointerUp() {
    activeAxis.current = null;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={SIZE}
        height={SIZE}
        style={{
          display: "block",
          cursor: disabled ? "default" : "crosshair",
          userSelect: "none",
          touchAction: "none",
          opacity: disabled ? 0.45 : 1,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        aria-label="Big Five personality radar chart. Drag vertices to adjust trait values."
        role="img"
      >
        {/* Background rings at 25%, 50%, 75%, 100% */}
        {[0.25, 0.50, 0.75, 1.0].map(lvl => (
          <polygon
            key={lvl}
            points={toPoints(TRAITS.map((_, i) => pt(lvl * R, i)))}
            fill="none"
            stroke={lvl === 1.0 ? "rgba(0,180,255,0.22)" : "rgba(0,180,255,0.09)"}
            strokeWidth="1"
          />
        ))}

        {/* Axis lines */}
        {TRAITS.map((_, i) => {
          const [x, y] = pt(R, i);
          return (
            <line
              key={i}
              x1={CX}
              y1={CY}
              x2={x}
              y2={y}
              stroke="rgba(0,180,255,0.18)"
              strokeWidth="1"
            />
          );
        })}

        {/* 50% reference ring tick marks */}
        {TRAITS.map((_, i) => {
          const [x, y] = pt(0.5 * R, i);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={2}
              fill="rgba(0,180,255,0.22)"
            />
          );
        })}

        {/* Data fill polygon */}
        <polygon
          points={toPoints(dataPts)}
          fill="rgba(0,180,255,0.16)"
          stroke="rgba(0,210,255,0.78)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* Draggable vertex dots */}
        {dataPts.map(([x, y], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={5}
            fill={TRAITS[i].color}
            stroke="rgba(4,10,22,0.88)"
            strokeWidth="1.5"
          />
        ))}

        {/* Labels: abbreviation + live value */}
        {TRAITS.map((t, i) => {
          const [lx, ly] = pt(LABEL_R, i);
          return (
            <g key={i}>
              <text
                x={lx}
                y={ly - 5}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="10"
                fontWeight="700"
                fill={t.color}
                style={{ fontFamily: "inherit" }}
              >
                {t.label}
              </text>
              <text
                x={lx}
                y={ly + 7}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="8.5"
                fill={t.color + "99"}
                style={{ fontFamily: "inherit" }}
              >
                {vals[i].toFixed(2)}
              </text>
            </g>
          );
        })}
      </svg>
      {!disabled && (
        <span style={{ fontSize: "0.72rem", color: "rgba(109,128,160,0.65)", letterSpacing: "0.04em" }}>
          drag vertices · O C E A N
        </span>
      )}
    </div>
  );
}
