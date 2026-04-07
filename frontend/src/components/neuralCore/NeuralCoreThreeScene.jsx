/**
 * NeuralCoreThreeScene — Real-time Cognitive Activity Engine (RCAE)
 *
 * A living neural interface representing memory, thought, emotion, and activation
 * dynamics. Everything is data-driven, state-connected, and reactive.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls, Stars } from "@react-three/drei";
import * as THREE from "three";
import { buildThreeGraphModel } from "./neuralCoreThreeModel.js";

// ─────────────────────────────────────────────────────────────────────────────
// CSS
// ─────────────────────────────────────────────────────────────────────────────
const threeSceneStyles = `
  .neural-three-shell { position: absolute; inset: 0; }

  .neural-three-panel {
    position: absolute; right: 14px; bottom: 84px; z-index: 2;
    width: min(312px, calc(100% - 28px)); max-height: 38vh; overflow: auto;
    padding: 10px 12px;
    border-radius: 18px; border: 1px solid rgba(0,234,255,0.22);
    background: linear-gradient(180deg, rgba(4,12,24,0.9), rgba(5,10,22,0.78));
    box-shadow: 0 0 24px rgba(0,234,255,0.12); backdrop-filter: blur(14px);
  }
  .neural-three-panel h5 {
    margin: 0 0 6px; color: #e7fbff; font-size: 0.96rem;
    letter-spacing: 0.04em; text-transform: uppercase;
  }
  .neural-three-panel p { margin: 0; color: #8dcfe3; font-size: 0.84rem; line-height: 1.6; }
  .neural-three-meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .neural-three-meta span {
    padding: 4px 9px; border-radius: 999px;
    border: 1px solid rgba(0,234,255,0.16); background: rgba(0,234,255,0.06);
    color: #93efff; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.03em;
  }
  .neural-three-hint {
    position: absolute; left: 18px; top: 16px; z-index: 2;
    padding: 6px 10px; border-radius: 999px;
    background: rgba(5,14,26,0.78); border: 1px solid rgba(0,234,255,0.18);
    color: #8ddbff; font-size: 0.74rem; font-weight: 700;
  }
  .neural-node-label {
    padding: 2px 7px; border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.12); background: rgba(2,8,18,0.76);
    color: #dff9ff; font-size: 10px; font-weight: 700;
    letter-spacing: 0.04em; text-transform: uppercase; white-space: nowrap;
    box-shadow: 0 0 12px rgba(0,234,255,0.10);
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Phase → node mapping
// ─────────────────────────────────────────────────────────────────────────────
const PHASE_NODE_MAP = {
  intent:                ["intent", "core"],
  generation:            ["core"],
  token:                 ["core"],
  reply:                 ["core", "evidence"],
  "reply-complete":      ["core", "evidence"],
  "memory-write":        ["memory", "core"],
  "user-memory-write":   ["memory"],
  mood:                  ["core", "identity"],
  scientist:             ["evidence"],
  repair:                ["evidence"],
  prompt:                ["identity", "core"],
  "rate-limit":          ["core"],
  "rate-limit-retry":    ["core"],
  "rate-limit-fallback": ["core"],
  queued:                ["core"],
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function smoothLerpAlpha(delta, speed = 5) {
  return 1 - Math.exp(-delta * speed);
}

// Temporal smooth noise — avoids per-frame Math.random() spam
function smoothNoise(t, freq, phase) {
  return (
    Math.sin(t * freq + phase) * 0.6 +
    Math.sin(t * freq * 2.3 + phase * 1.7) * 0.28 +
    Math.sin(t * freq * 5.1 + phase * 3.1) * 0.12
  );
}

function hashString(input = "") {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = ((h << 5) - h) + input.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

// ─────────────────────────────────────────────────────────────────────────────
// CameraRig
// ─────────────────────────────────────────────────────────────────────────────
function CameraRig({ target, speed, controlsRef, orbActivityRef }) {
  const { camera } = useThree();
  const targetVector = useMemo(() => new THREE.Vector3(...target), [target]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const orbit = new THREE.Vector3(
      Math.sin(t * 0.18) * 0.18,
      Math.cos(t * 0.20) * 0.10,
      5.5 - Math.min(0.8, Math.max(0, targetVector.length() * 0.05)),
    );
    // Camera shake when network activity spikes
    const act   = orbActivityRef?.current ?? 0;
    const shake = act > 0.8 ? smoothNoise(t, 18, 4.2) * 0.018 : 0;
    camera.position.lerp(
      new THREE.Vector3(targetVector.x + orbit.x + shake, targetVector.y + orbit.y + shake * 0.6, orbit.z),
      smoothLerpAlpha(delta, 3.4 + speed),
    );
    if (controlsRef.current) {
      controlsRef.current.target.lerp(targetVector, smoothLerpAlpha(delta, 4.4 + speed));
      controlsRef.current.update();
    } else {
      camera.lookAt(targetVector);
    }
  });

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CompanionOrb — activity-reactive AI presence
// Reads graphActivity from a ref each frame to avoid triggering re-renders
// ─────────────────────────────────────────────────────────────────────────────
function CompanionOrb({ moodState, orbActivityRef }) {
  const groupRef = useRef(null);
  const coreRef  = useRef(null);
  const ringRef  = useRef(null);
  const glowRef  = useRef(null);
  const particles = useRef([]);
  if (particles.current.length === 0) {
    for (let i = 0; i < 5; i++) particles.current.push(null);
  }
  const burstTimer  = useRef(0);
  const prevAct     = useRef(0);
  const angles      = useMemo(() => [0, 72, 144, 216, 288], []);

  useFrame((state, delta) => {
    if (!groupRef.current || !coreRef.current) return;
    const t   = state.clock.elapsedTime;
    const act = orbActivityRef.current;

    // Burst detection
    if (act > prevAct.current + 0.22) burstTimer.current = 1;
    prevAct.current = act;
    burstTimer.current = Math.max(0, burstTimer.current - delta * 3.2);
    const burst = burstTimer.current;

    const spd   = 0.9 + act * 1.8;
    const chaos = act > 0.7 ? smoothNoise(t, 3.5, 1.11) * 0.08 : 0;

    // Float — faster + erratic when high activity
    groupRef.current.position.y = 1.6 + Math.sin(t * 1.1 * spd) * 0.10 + chaos;
    groupRef.current.position.x = 2.2  + Math.sin(t * 0.44) * 0.08 * (1 + act * 0.6);
    groupRef.current.rotation.z = Math.sin(t * 0.5) * 0.08;

    // Breathing — rate tied to mood
    const rate = moodState.mood === "calm" ? 1.4 : moodState.mood === "chaotic" ? 3.2 : 2.0;
    coreRef.current.scale.setScalar(1 + Math.sin(t * rate) * 0.055 + burst * 0.18);
    if (coreRef.current.material) {
      coreRef.current.material.emissiveIntensity = 2.4 + act * 2.2 + burst * 5.5;
    }

    // Glow halo
    if (glowRef.current) {
      glowRef.current.material.opacity  = 0.06 + act * 0.18 + burst * 0.35;
      glowRef.current.scale.setScalar(1.6 + burst * 0.5 + act * 0.3);
    }

    // Orbit ring — faster + chaotic axis when excited
    if (ringRef.current) {
      const rs = spd * (moodState.mood === "chaotic" ? 1.55 : 1.0);
      ringRef.current.rotation.y = t * 1.25 * rs;
      ringRef.current.rotation.x = t * 0.72 * rs;
      if (moodState.mood === "chaotic" || act > 0.7) {
        ringRef.current.rotation.z = Math.sin(t * 2.2) * 0.38;
      }
    }

    // Per-particle vertical oscillation + emissive
    for (let i = 0; i < 5; i++) {
      const p = particles.current[i];
      if (!p) continue;
      p.position.y = Math.sin(t * (0.9 + i * 0.22) + i * 1.3) * 0.06;
      if (p.material) {
        p.material.emissiveIntensity = 2.8 + act * 2.0 + Math.sin(t * (2 + i * 0.4)) * 0.8;
      }
    }
  });

  return (
    <group ref={groupRef} position={[2.2, 1.6, -1.2]}>
      {/* Glow halo */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.36, 18, 18]} />
        <meshStandardMaterial color={moodState.accent} emissive={moodState.accent}
          emissiveIntensity={1.0} transparent opacity={0.06}
          side={THREE.BackSide} depthWrite={false} />
      </mesh>
      {/* Core */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[0.21, 32, 32]} />
        <meshStandardMaterial color={moodState.secondary} emissive={moodState.accent}
          emissiveIntensity={2.4} transparent opacity={0.9} roughness={0.16} />
      </mesh>
      {/* Eye glints */}
      {[[-0.1,0.04,0.28],[0.1,0.04,0.28]].map(([x,y,z], i)=>(
        <mesh key={i} position={[x,y,z]}>
          <sphereGeometry args={[0.052, 16, 16]} />
          <meshStandardMaterial color="#ddffff" emissive="#9af4ff" emissiveIntensity={3.5} />
        </mesh>
      ))}
      {/* Orbit ring */}
      <group ref={ringRef}>
        {angles.map((angle, i) => {
          const r = (angle * Math.PI) / 180;
          return (
            <mesh key={angle}
              ref={(el) => { particles.current[i] = el; }}
              position={[Math.cos(r)*0.66, Math.sin(r)*0.26, Math.sin(r)*0.50]}
            >
              <sphereGeometry args={[0.028, 8, 8]} />
              <meshStandardMaterial color={moodState.accent} emissive={moodState.accent}
                emissiveIntensity={3.2} transparent opacity={0.8} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MultiPulse — up to 3 simultaneous traveling dots per synapse
// onArrive fires when a dot reaches the target; triggers echo pulse in parent
// ─────────────────────────────────────────────────────────────────────────────
function MultiPulse({ start, end, activity, color, onArrive }) {
  const COUNT = 3;
  const meshRefs    = useRef(Array.from({ length: COUNT }, () => null));
  const progRefs    = useRef(Array.from({ length: COUNT }, (_, i) => i / COUNT));
  const arrivedRefs = useRef(Array.from({ length: COUNT }, () => false));
  const startRef = useRef(start);
  const endRef   = useRef(end);

  useEffect(() => { startRef.current = start; }, [start]);
  useEffect(() => { endRef.current   = end;   }, [end]);

  useFrame((_, delta) => {
    const s = startRef.current;
    const e = endRef.current;
    const spd = 0.38 + activity * 1.55;

    for (let i = 0; i < COUNT; i++) {
      const mesh = meshRefs.current[i];
      if (!mesh) continue;

      progRefs.current[i] = (progRefs.current[i] + delta * spd) % 1;
      const p = progRefs.current[i];

      if (!arrivedRefs.current[i] && p > 0.92) {
        arrivedRefs.current[i] = true;
        onArrive?.();
      }
      if (p < 0.10) arrivedRefs.current[i] = false;

      mesh.position.set(
        s[0] + (e[0] - s[0]) * p,
        s[1] + (e[1] - s[1]) * p,
        s[2] + (e[2] - s[2]) * p,
      );
      const opacity = Math.sin(p * Math.PI) * (0.55 + activity * 0.45);
      mesh.material.opacity = opacity;
      mesh.material.emissiveIntensity = 4.5 + (p > 0.85 ? (p - 0.85) * 30 : 0);
    }
  });

  const size = 0.022 + activity * 0.022;

  return (
    <>
      {Array.from({ length: COUNT }).map((_, i) => (
        <mesh key={i} ref={(el) => { meshRefs.current[i] = el; }}>
          <sphereGeometry args={[size, 6, 6]} />
          <meshStandardMaterial color={color} emissive={color}
            emissiveIntensity={4.5} transparent opacity={0.8} depthWrite={false} />
        </mesh>
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LightningConnection — multi-segment jittered arc + optional forked branch
// ─────────────────────────────────────────────────────────────────────────────
function LightningConnection({ start, end, color, weight, highlighted, activity, onPulseArrive }) {
  const startRef   = useRef(start);
  const endRef     = useRef(end);
  const noisePhase = useRef(Math.random() * 100);

  useEffect(() => { startRef.current = start; endRef.current = end; }, [start, end]);

  const SEGS = 9; // smoother pathway curve (brain-like fiber look)

  const { mainLine, mainPos, mainMat } = useMemo(() => {
    const arr = new Float32Array((SEGS + 1) * 3);
    const geo  = new THREE.BufferGeometry();
    const attr = new THREE.BufferAttribute(arr, 3);
    attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("position", attr);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.4 });
    return { mainLine: new THREE.Line(geo, mat), mainPos: arr, mainMat: mat };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { forkLine, forkPos, forkMat } = useMemo(() => {
    const arr = new Float32Array(3 * 3);
    const geo  = new THREE.BufferGeometry();
    const attr = new THREE.BufferAttribute(arr, 3);
    attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("position", attr);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0 });
    return { forkLine: new THREE.Line(geo, mat), forkPos: arr, forkMat: mat };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mainMat.color.set(color); forkMat.color.set(color);
  }, [color, mainMat, forkMat]);

  useEffect(() => () => {
    mainLine.geometry.dispose(); mainMat.dispose();
    forkLine.geometry.dispose(); forkMat.dispose();
  }, [mainLine, mainMat, forkLine, forkMat]);

  useFrame((state) => {
    const s  = startRef.current;
    const e  = endRef.current;
    const t  = state.clock.elapsedTime * 0.5;
    const np = noisePhase.current;
    const jScale = (highlighted ? 0.032 : 0.012) * (0.5 + weight * 0.5);

    for (let i = 0; i <= SEGS; i++) {
      const f = i / SEGS;
      const bx = s[0] + (e[0] - s[0]) * f;
      const by = s[1] + (e[1] - s[1]) * f;
      const bz = s[2] + (e[2] - s[2]) * f;
      if (i > 0 && i < SEGS) {
        mainPos[i*3]   = bx + smoothNoise(t, 7.3 + i*1.1, np + i*2.4) * jScale;
        mainPos[i*3+1] = by + smoothNoise(t, 6.1 + i*0.9, np + i*3.7) * jScale;
        mainPos[i*3+2] = bz;
      } else {
        mainPos[i*3]   = bx;
        mainPos[i*3+1] = by;
        mainPos[i*3+2] = bz;
      }
    }
    mainLine.geometry.attributes.position.needsUpdate = true;

    const flicker = smoothNoise(t, highlighted ? 9 : 3.8, np);
    mainMat.opacity =
      0.22 + flicker * 0.05 + weight * 0.34 + (highlighted ? 0.16 : 0) + activity * 0.14;

    // Fork — fires when highlighted and noise crosses threshold
    const doFork = highlighted && smoothNoise(t, 1.8, np * 0.5) > 0.68;
    if (doFork) {
      const mf = 0.45 + smoothNoise(t, 1.3, np) * 0.1;
      const mx = s[0] + (e[0]-s[0])*mf;
      const my = s[1] + (e[1]-s[1])*mf;
      const mz = s[2] + (e[2]-s[2])*mf;
      const px =  (e[1]-s[1]) * 0.28 * smoothNoise(t, 3.7, np+5);
      const py = -(e[0]-s[0]) * 0.28 * smoothNoise(t, 4.2, np+7);
      const pf = mf - 0.18;
      forkPos[0] = s[0]+(e[0]-s[0])*pf; forkPos[1] = s[1]+(e[1]-s[1])*pf; forkPos[2] = mz;
      forkPos[3] = mx+px;                forkPos[4] = my+py;                forkPos[5] = mz;
      forkPos[6] = mx+px*0.5+(e[0]-mx)*0.35; forkPos[7] = my+py*0.5+(e[1]-my)*0.35; forkPos[8] = mz;
      forkLine.geometry.attributes.position.needsUpdate = true;
      forkMat.opacity = mainMat.opacity * 0.65;
    } else {
      forkMat.opacity = 0;
    }
  });

  return (
    <>
      <primitive object={mainLine} />
      <primitive object={forkLine} />
      <MultiPulse
        start={start} end={end} activity={Math.max(0.22, activity)}
        color={color} onArrive={onPulseArrive}
      />
    </>
  );
}

function NodeFibers({ nodeId, radius, color, activity, selected }) {
  const seed = useMemo(() => hashString(nodeId) % 1000, [nodeId]);
  const FIBERS = 5;
  const SEGS = 6;

  const fibers = useMemo(() => {
    return Array.from({ length: FIBERS }, (_, i) => {
      const arr = new Float32Array((SEGS + 1) * 3);
      const geo = new THREE.BufferGeometry();
      const attr = new THREE.BufferAttribute(arr, 3);
      attr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute("position", attr);
      const mat = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const line = new THREE.Line(geo, mat);
      return {
        line,
        arr,
        mat,
        phase: (seed * 0.013) + i * 1.27,
        baseAngle: (Math.PI * 2 * i) / FIBERS,
      };
    });
  }, [FIBERS, SEGS, color, seed]);

  useEffect(() => () => {
    fibers.forEach((fiber) => {
      fiber.line.geometry.dispose();
      fiber.mat.dispose();
    });
  }, [fibers]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    fibers.forEach((fiber, idx) => {
      const amp = 0.03 + activity * 0.06 + (selected ? 0.05 : 0);
      const reach = radius * (2.1 + idx * 0.28 + activity * 0.8 + (selected ? 0.5 : 0));
      const rot = t * (0.15 + activity * 0.22) + fiber.phase;

      for (let i = 0; i <= SEGS; i += 1) {
        const f = i / SEGS;
        const wave = Math.sin(t * 1.7 + fiber.phase + f * 4.4) * amp;
        const localAngle = fiber.baseAngle + rot * 0.08 + Math.sin(f * Math.PI * 1.2 + fiber.phase) * 0.22;
        const radial = reach * f;
        const x = Math.cos(localAngle) * radial + Math.sin(rot + f * 2.4) * wave;
        const y = Math.sin(localAngle) * radial + Math.cos(rot * 1.2 + f * 2.1) * wave;
        const z = Math.sin(rot * 0.7 + f * 3.1 + fiber.phase) * 0.06 * f;

        fiber.arr[i * 3] = x;
        fiber.arr[(i * 3) + 1] = y;
        fiber.arr[(i * 3) + 2] = z;
      }

      fiber.line.geometry.attributes.position.needsUpdate = true;
      fiber.mat.opacity = 0.12 + activity * 0.2 + (selected ? 0.1 : 0) + Math.sin(t * 2.2 + fiber.phase) * 0.04;
    });
  });

  return (
    <group>
      {fibers.map((fiber, idx) => (
        <primitive key={`${nodeId}-fiber-${idx}`} object={fiber.line} />
      ))}
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GraphNode — orb + glow halo + BFS pulse + fluid drift + memory growth
// pulseRef is { current: 0..1 } owned by NeuralScene, shared read/write
// ─────────────────────────────────────────────────────────────────────────────
function GraphNode({ node, selectedId, linkedIds, onSelect, onHoverStart, onHoverEnd, pulseRef, bloomIntensityRef, allPulseRefs, strengthRef, hideLabels }) {
  const groupRef = useRef(null);
  const meshRef  = useRef(null);
  const glowRef  = useRef(null);
  const ringRef  = useRef(null);
  const labelRef = useRef(null);

  const basePos = useMemo(() => new THREE.Vector3(...node.position), [node.position]);

  // Each node has a unique motion signature — never sync with others
  const dp = useMemo(() => ({
    xFreq:      0.22 + Math.random() * 0.14,
    yFreq:      0.38 + Math.random() * 0.18,
    xAmp:       0.038 + Math.random() * 0.020,
    yAmp:       0.044 + Math.random() * 0.022,
    zFreq:      0.14 + Math.random() * 0.10,
    offset:     Math.random() * Math.PI * 2,
    breathFreq: 1.4 + Math.random() * 0.70,
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const isSelected = node.id === selectedId;
  const isLinked   = linkedIds.has(node.id);

  useFrame((state, delta) => {
    if (!groupRef.current || !meshRef.current) return;
    const t     = state.clock.elapsedTime;
    const pulse = pulseRef.current;

    // Decay pulse
    pulseRef.current = Math.max(0, pulse - delta * 2.4);

    // Neighbor echo — when this node fires, connected nodes get a secondary pulse
    if (pulse > 0.35 && allPulseRefs) {
      for (const nid of (node.connections || [])) {
        const nref = allPulseRefs.current?.[nid];
        if (nref) nref.current = Math.max(nref.current, pulse * 0.52);
      }
    }

    // Imperative label: glow border when recently activated
    if (labelRef.current) {
      const entry    = strengthRef?.current?.get(node.id);
      const isRecent = entry && (Date.now() - (entry.lastActivated || 0)) < 1600;
      labelRef.current.style.borderColor = isRecent ? "#00ffcc" : "rgba(255,255,255,0.12)";
      labelRef.current.style.boxShadow   = isRecent
        ? "0 0 18px rgba(0,255,204,0.6)" : "0 0 12px rgba(0,234,255,0.10)";
    }

    // Fluid drift — unique per node
    groupRef.current.position.set(
      basePos.x + Math.cos(t * dp.xFreq + dp.offset) * dp.xAmp,
      basePos.y + Math.sin(t * dp.yFreq + dp.offset) * dp.yAmp,
      basePos.z + Math.sin(t * dp.zFreq + dp.offset * 1.3) * 0.012,
    );

    // Breathing scale
    const breathe    = 1 + Math.sin(t * dp.breathFreq + dp.offset) * 0.042;
    const targetScale = (isSelected ? 1.22 : isLinked ? 1.09 : 1.0) * breathe;
    const cur  = meshRef.current.scale.x;
    const next = cur + (targetScale - cur) * 0.06;
    meshRef.current.scale.setScalar(next);

    // Emissive — base + activity + pulse flash
    const baseGlow = 0.82 + node.activity * 0.72 + Math.sin(t * 2.1 + dp.offset) * 0.10;
    meshRef.current.material.emissiveIntensity =
      baseGlow + pulseRef.current * 7.2 + (isSelected ? 1.8 : 0);

    // Spike global bloom on strong pulse
    if (pulseRef.current > 0.6 && bloomIntensityRef) {
      bloomIntensityRef.current = Math.max(
        bloomIntensityRef.current,
        1.35 + pulseRef.current * 3.5,
      );
    }

    // Glow halo
    if (glowRef.current) {
      glowRef.current.material.opacity =
        0.03 + pulseRef.current * 0.30 + node.activity * 0.03 + (isSelected ? 0.07 : 0);
      glowRef.current.scale.setScalar(next * (1.0 + pulseRef.current * 0.14));
    }
    // Neural ring — rotates slowly, flares on pulse
    if (ringRef.current) {
      ringRef.current.rotation.z = t * 0.22 + dp.offset;
      ringRef.current.material.opacity = 0.28 + pulseRef.current * 0.72 + (isSelected ? 0.25 : 0);
      ringRef.current.material.emissiveIntensity = 1.2 + pulseRef.current * 4.5 + (isSelected ? 0.8 : 0);
    }
  });

  // Node size — much smaller for neural pathway aesthetic
  const radius = 0.055 + node.strength * 0.12;

  return (
    <group ref={groupRef} position={node.position}
      onClick={(e) => { e.stopPropagation(); onSelect(node); }}
      onPointerOver={(e) => { e.stopPropagation(); onHoverStart?.(node.id); }}
      onPointerOut={(e) => { e.stopPropagation(); onHoverEnd?.(node.id); }}
    >
      <NodeFibers
        nodeId={node.id}
        radius={radius}
        color={node.color}
        activity={node.activity}
        selected={isSelected}
      />
      {/* Tight diffuse shell */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[radius * 1.25, 18, 18]} />
        <meshStandardMaterial color={node.color} emissive={node.color}
          emissiveIntensity={0.8} transparent opacity={0.03}
          side={THREE.BackSide} depthWrite={false} />
      </mesh>
      {/* Neural circuit ring */}
      <mesh ref={ringRef}>
        <torusGeometry args={[radius * 1.62, radius * 0.055, 6, 64]} />
        <meshStandardMaterial color={node.color} emissive={node.color}
          emissiveIntensity={1.5} transparent opacity={0.28} depthWrite={false} />
      </mesh>
      {/* Core orb */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[radius, 32, 32]} />
        <meshStandardMaterial color={node.color} emissive={node.color}
          emissiveIntensity={1.1 + node.activity * 0.55}
          roughness={0.12} metalness={0.65} />
      </mesh>
      {!hideLabels && (
        <Html position={[0, -radius - 0.22, 0]} center>
          <div ref={labelRef} className="neural-node-label">{node.label}</div>
        </Html>
      )}
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NeuralScene — owns all runtime state inside the Canvas
// ─────────────────────────────────────────────────────────────────────────────
function NeuralScene({ graph, selectedNode, linkedIds, handleSelect, setSelectedId,
                       livePhaseBurst, burstSeq, controlsRef, hideLabels, onActivityUpdate }) {

  // One pulse ref per node — mutable, never trigger re-renders
  const pulseRefs      = useRef({});
  const bloomRef       = useRef(1.35);
  const orbActivityRef = useRef(0);
  const networkGroupRef = useRef(null);
  const lastEmitRef    = useRef(0);
  // Persistent Hebbian strength: nodeId → { strength, lastActivated }
  const strengthRef    = useRef(new Map());

  // Ensure pulse + strength refs exist for every node; seed strength from graph model
  useEffect(() => {
    for (const node of graph.nodes) {
      if (!pulseRefs.current[node.id])  pulseRefs.current[node.id] = { current: 0 };
      if (!strengthRef.current.has(node.id)) {
        strengthRef.current.set(node.id, { strength: node.strength, lastActivated: 0 });
      }
    }
  }, [graph.nodes]);

  // Track global activity + per-frame orb decay (prevents permanent over-excitation)
  // Also emits heartbeat to onActivityUpdate ~4x/sec for Avatar ↔ Brain sync
  useFrame((state, delta) => {
    if (!graph.nodes?.length) return;
    const total  = graph.nodes.reduce((s, n) => s + (n.activity || 0), 0);
    const avg    = Math.min(1, total / Math.max(1, graph.nodes.length));
    // Blend: graph average can push orb up; decay pulls it down
    orbActivityRef.current = Math.max(avg, Math.max(0, orbActivityRef.current - delta * 2.1));
    // Bloom also driven by live orb activity
    bloomRef.current = Math.max(bloomRef.current, 1.35 + orbActivityRef.current * 2.2);
    // Heartbeat: emit real brain activity to parent ~4x/sec
    if (onActivityUpdate && state.clock.elapsedTime - lastEmitRef.current > 0.25) {
      onActivityUpdate(orbActivityRef.current);
      lastEmitRef.current = state.clock.elapsedTime;
    }
  });

  // Keep a lightweight internal bloom energy value so node pulses can still
  // influence brightness without relying on postprocessing passes.
  useFrame((_, delta) => {
    bloomRef.current = Math.max(1.35, bloomRef.current - delta * 2.8);
  });

  // Always-on cinematic network spin for a clear "living brain" feel.
  useFrame((state, delta) => {
    if (!networkGroupRef.current) return;
    const t = state.clock.elapsedTime;
    networkGroupRef.current.rotation.y += delta * (0.16 + graph.moodState.speed * 0.08);
    networkGroupRef.current.rotation.z = Math.sin(t * 0.24) * 0.08;
    networkGroupRef.current.rotation.x = Math.cos(t * 0.18) * 0.03;
  });

  // Build adjacency map for BFS
  const adjacency = useMemo(() => {
    const map = new Map();
    for (const n of graph.nodes)       map.set(n.id, []);
    for (const c of graph.connections) {
      map.get(c.sourceId)?.push(c.targetId);
      map.get(c.targetId)?.push(c.sourceId);
    }
    return map;
  }, [graph.nodes, graph.connections]);

  // BFS thought-wave propagation with energy decay per hop
  const runBFS = useCallback((rootIds) => {
    const refs = pulseRefs.current;
    const visited = new Set(rootIds);
    const queue   = rootIds.map((id) => ({ id, energy: 1.0, hop: 0 }));
    while (queue.length > 0) {
      const { id, energy, hop } = queue.shift();
      const ref = refs[id];
      if (ref) ref.current = Math.max(ref.current, energy);
      if (hop >= 4 || energy < 0.08) continue;
      for (const nid of (adjacency.get(id) || [])) {
        if (!visited.has(nid)) {
          visited.add(nid);
          queue.push({ id: nid, energy: energy * 0.6, hop: hop + 1 });
        }
      }
    }
    bloomRef.current = Math.max(bloomRef.current, 3.8);
  }, [adjacency]);

  // Centralized phase pulse — Hebbian plasticity + BFS propagation
  const triggerPhasePulse = useCallback((phase) => {
    const targets = (PHASE_NODE_MAP[phase] || []).filter((id) => pulseRefs.current[id]);
    if (targets.length === 0) return;

    for (const nodeId of targets) {
      const node = graph.nodeMap.get(nodeId);
      if (!node) continue;

      // Growth rate per event type, with saturation curve (diminishing returns)
      let growth;
      if (phase === "memory-write"   || phase === "user-memory-write") growth = 0.042;
      else if (phase === "reply-complete" || phase === "reply")         growth = 0.022;
      else if (phase === "generation"     || phase === "token")         growth = 0.014;
      else if (phase === "mood"           || phase === "scientist")     growth = 0.018;
      else                                                               growth = 0.009;

      const entry = strengthRef.current.get(nodeId)
        || { strength: node.strength, lastActivated: 0 };
      // Saturation curve: strong nodes grow more slowly
      entry.strength     = Math.min(1.0, entry.strength + growth * (1 - entry.strength * 0.65));
      entry.lastActivated = Date.now();
      strengthRef.current.set(nodeId, entry);

      // Pulse flash proportional to event intensity
      const pr = pulseRefs.current[nodeId];
      if (pr) pr.current = Math.min(1.0, pr.current + growth * 18);

      // Contribute to global orb arousal
      orbActivityRef.current = Math.min(1.0, orbActivityRef.current + growth * 0.99);
    }

    runBFS(targets);
  }, [graph.nodeMap, runBFS]);

  // Fire on every LLM phase burst
  useEffect(() => {
    if (!livePhaseBurst) return;
    triggerPhasePulse(livePhaseBurst);
  }, [burstSeq, livePhaseBurst, triggerPhasePulse]);

  // Cinematic: Neural Storm — periodic random flood when mood is chaotic
  const lastStorm = useRef(0);
  useFrame((state) => {
    if (graph.moodState.mood !== "chaotic") return;
    const t = state.clock.elapsedTime;
    if (t - lastStorm.current > 3.5) {
      lastStorm.current = t;
      const seeds = [...graph.nodes]
        .sort(() => Math.random() - 0.5)
        .slice(0, 3)
        .map((n) => n.id);
      runBFS(seeds);
    }
  });

  // Cinematic: Thought Spike — rapid burst when arousal is high
  const lastSpike = useRef(0);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (graph.metrics.arousal > 0.6 && t - lastSpike.current > 5.0) {
      lastSpike.current = t;
      runBFS(["core", "intent"]);
    }
  });

  return (
    <>
      <color attach="background" args={[graph.moodState.background[0]]} />
      <fog   attach="fog"        args={[graph.moodState.background[1], 8, 24]} />
      <ambientLight intensity={0.22} />
      <pointLight position={[8,  8, 8]} intensity={1.4} color={graph.moodState.secondary} />
      <pointLight position={[-6,-4, 5]} intensity={0.8} color={graph.moodState.accent}    />

      <Stars radius={28} depth={18} count={160} factor={0.8}
        saturation={0} fade speed={graph.moodState.speed * 0.3} />

      <CameraRig target={selectedNode?.position || [0,0,0]}
        speed={graph.moodState.speed} controlsRef={controlsRef}
        orbActivityRef={orbActivityRef} />

      <OrbitControls ref={controlsRef} enablePan={false} enableZoom
        minDistance={3.5} maxDistance={18}
        autoRotate autoRotateSpeed={0.32 + graph.moodState.speed * 0.12} />

      <CompanionOrb moodState={graph.moodState} orbActivityRef={orbActivityRef} />

      <group ref={networkGroupRef}>
        {/* Synaptic connections */}
        {graph.connections.map((conn) => {
          const src = graph.nodeMap.get(conn.sourceId);
          const tgt = graph.nodeMap.get(conn.targetId);
          if (!src || !tgt) return null;
          const highlighted =
            conn.sourceId === selectedNode?.id || conn.targetId === selectedNode?.id;
          const onPulseArrive = () => {
            const ref = pulseRefs.current[conn.targetId];
            if (ref) ref.current = Math.max(ref.current, 0.45);
          };
          return (
            <LightningConnection key={conn.key}
              start={src.position} end={tgt.position}
              color={conn.color} weight={conn.weight}
              highlighted={highlighted} activity={conn.weight}
              onPulseArrive={onPulseArrive}
            />
          );
        })}

        {/* Nodes */}
        {graph.nodes.map((node) => {
          const pr = pulseRefs.current[node.id] || { current: 0 };
          return (
            <GraphNode key={node.id} node={node}
              selectedId={selectedNode?.id} linkedIds={linkedIds}
              onSelect={handleSelect}
              pulseRef={pr} bloomIntensityRef={bloomRef}
              allPulseRefs={pulseRefs} strengthRef={strengthRef}
              hideLabels={hideLabels}
            />
          );
        })}
      </group>

      {/* Disabled postprocessing bloom due production instability in EffectComposer. */}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root export
// ─────────────────────────────────────────────────────────────────────────────
export default function NeuralCoreThreeScene({
  scene, personality, memoryCount, hasIntent, identityActive, evidenceActive,
  repairActive, reconditioningActive, visibleChildNodes, focusNode, setFocusNode,
  valence, arousal, dominance, livePhaseBurst, hideLabels = false, onActivityUpdate,
}) {
  const controlsRef = useRef(null);
  const [selectedId, setSelectedId] = useState(focusNode || "core");
  const [burstSeq,   setBurstSeq]   = useState(0);

  useEffect(() => { setSelectedId(focusNode || "core"); }, [focusNode]);
  useEffect(() => { if (livePhaseBurst) setBurstSeq((n) => n + 1); }, [livePhaseBurst]);

  const graph = useMemo(() =>
    buildThreeGraphModel({
      scene, personality, memoryCount, hasIntent, identityActive, evidenceActive,
      repairActive, reconditioningActive, visibleChildNodes, focusNode,
      valence, arousal, dominance, livePhaseBurst,
    }),
    [scene, personality, memoryCount, hasIntent, identityActive, evidenceActive,
     repairActive, reconditioningActive, visibleChildNodes, focusNode,
     valence, arousal, dominance, livePhaseBurst],
  );

  const selectedNode = graph.nodes.find((n) => n.id === selectedId) || graph.nodes[0];

  const linkedIds = useMemo(() => {
    const ids = new Set([selectedNode?.id || "core"]);
    for (const c of graph.connections) {
      if (c.sourceId === selectedNode?.id) ids.add(c.targetId);
      if (c.targetId === selectedNode?.id) ids.add(c.sourceId);
    }
    return ids;
  }, [graph.connections, selectedNode?.id]);

  function handleSelect(node) {
    setSelectedId(node.id);
    if (["core","memory","intent","identity","evidence"].includes(node.id)) {
      setFocusNode?.(node.id);
    } else if (node.parentId) {
      setFocusNode?.(node.parentId);
    }
  }

  return (
    <div className="neural-three-shell neural-scene-camera" style={{ transform: "none" }}>
      {!hideLabels && <style>{threeSceneStyles}</style>}
      {!hideLabels && <div className="neural-three-hint">3D Neural Core · click nodes to inspect and zoom</div>}

      <Canvas
        camera={{ position: [0, 0.15, 6], fov: 48 }}
        gl={{ powerPreference: "low-power", antialias: false, failIfMajorPerformanceCaveat: false }}
        onPointerMissed={() => setSelectedId("core")}
      >
        <NeuralScene
          graph={graph}
          selectedNode={selectedNode}
          linkedIds={linkedIds}
          handleSelect={handleSelect}
          setSelectedId={setSelectedId}
          livePhaseBurst={livePhaseBurst}
          burstSeq={burstSeq}
          controlsRef={controlsRef}
          hideLabels={hideLabels}
          onActivityUpdate={onActivityUpdate}
        />
      </Canvas>

      {!hideLabels && selectedNode && graph.nodes.length > 0 ? (
        <div className="neural-three-panel">
          <h5>{selectedNode.label}</h5>
          <p>{selectedNode.meta || "Active neural cluster"}</p>
          <div className="neural-three-meta">
            <span>{graph.moodState?.mood}</span>
            <span>strength {selectedNode.strength.toFixed(2)}</span>
            <span>activity {selectedNode.activity.toFixed(2)}</span>
            <span>{(selectedNode.connections || []).length} link{(selectedNode.connections || []).length === 1 ? "" : "s"}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
