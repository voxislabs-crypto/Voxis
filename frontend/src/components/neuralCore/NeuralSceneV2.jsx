import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls, Stars } from "@react-three/drei";
import * as THREE from "three";

const sceneV2Styles = `
  .neural-v2-shell {
    position: absolute;
    inset: 0;
    background: transparent;
  }

  .neural-v2-controls {
    position: absolute;
    top: 46px;
    right: 12px;
    z-index: 4;
    display: flex;
    gap: 8px;
  }

  .neural-v2-btn {
    border: 1px solid rgba(122, 230, 255, 0.22);
    border-radius: 999px;
    background: linear-gradient(180deg, rgba(214, 248, 255, 0.10), rgba(14, 30, 56, 0.16));
    color: rgba(201, 244, 255, 0.9);
    font-size: 0.51rem;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    font-weight: 800;
    padding: 4px 8px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18), 0 6px 14px rgba(0, 16, 38, 0.22);
  }

  .neural-v2-debug {
    position: absolute;
    left: 12px;
    bottom: 42px;
    z-index: 4;
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    max-width: calc(100% - 24px);
  }

  .neural-v2-pill {
    border-radius: 999px;
    border: 1px solid rgba(100, 220, 255, 0.16);
    background: rgba(6, 18, 34, 0.56);
    color: rgba(159, 231, 255, 0.84);
    padding: 3px 7px;
    font-size: 0.51rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 700;
  }

  .neural-v2-label {
    padding: 2px 6px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(4, 14, 28, 0.66);
    color: rgba(217, 248, 255, 0.9);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    white-space: nowrap;
    box-shadow: 0 0 10px rgba(0, 234, 255, 0.08);
  }

  .neural-v2-transition {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 3;
    background:
      radial-gradient(circle at 48% 50%, rgba(140, 238, 255, 0.18), rgba(7, 18, 34, 0.18) 45%, transparent 74%),
      linear-gradient(180deg, rgba(12, 31, 56, 0.16), rgba(9, 22, 42, 0.08));
    opacity: 0;
    animation: neuralV2LayerShift 340ms cubic-bezier(0.21, 0.88, 0.25, 1);
  }

  .neural-v2-transition.is-forward {
    background:
      radial-gradient(circle at 49% 50%, rgba(138, 235, 255, 0.22), rgba(9, 23, 42, 0.18) 45%, transparent 74%),
      linear-gradient(180deg, rgba(12, 31, 56, 0.2), rgba(9, 22, 42, 0.1));
  }

  .neural-v2-transition.is-back {
    background:
      radial-gradient(circle at 41% 48%, rgba(255, 178, 114, 0.2), rgba(12, 26, 46, 0.2) 45%, transparent 74%),
      linear-gradient(180deg, rgba(14, 30, 48, 0.2), rgba(8, 17, 34, 0.12));
  }

  .neural-v2-transition.is-home {
    background:
      radial-gradient(circle at 50% 45%, rgba(176, 255, 227, 0.24), rgba(8, 23, 42, 0.22) 46%, transparent 76%),
      linear-gradient(180deg, rgba(11, 36, 48, 0.22), rgba(7, 17, 32, 0.12));
    animation-duration: 420ms;
  }

  .neural-v2-leaf-hud {
    pointer-events: auto;
    min-width: 220px;
    max-width: 320px;
    border-radius: 12px;
    border: 1px solid rgba(121, 236, 255, 0.62);
    background: linear-gradient(180deg, rgba(8, 25, 46, 0.9), rgba(4, 11, 25, 0.92));
    backdrop-filter: blur(10px);
    box-shadow: 0 16px 28px rgba(0, 7, 22, 0.62), inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 0 0 1px rgba(74, 209, 255, 0.25);
    color: #d6f7ff;
    padding: 13px 13px 11px;
    animation: neuralV2HudEnter 190ms cubic-bezier(0.2, 0.88, 0.26, 1);
  }

  .neural-v2-leaf-hud-title {
    margin: 0;
    font-size: 0.8rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #effdff;
  }

  .neural-v2-leaf-hud-meta {
    margin: 6px 0 0;
    font-size: 0.62rem;
    color: rgba(222, 245, 255, 0.94);
  }

  .neural-v2-leaf-hud-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 10px;
  }

  .neural-v2-leaf-hud-btn {
    border: 1px solid rgba(111, 226, 255, 0.48);
    border-radius: 999px;
    background: rgba(12, 37, 60, 0.88);
    color: #e5f8ff;
    font-size: 0.56rem;
    font-weight: 700;
    padding: 4px 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  @keyframes neuralV2HudEnter {
    0% {
      opacity: 0;
      transform: translateY(9px);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes neuralV2LayerShift {
    0% {
      opacity: 0.34;
      transform: scale(1.01);
    }
    100% {
      opacity: 0;
      transform: scale(1);
    }
  }
`;
function hashOffset(id = "") {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function CameraDepthRig({ depth }) {
  const { camera } = useThree();

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime();
    const targetZ = -depth * 8;
    const idleX = Math.sin(t * 0.18) * 0.14;
    const idleY = Math.cos(t * 0.14) * 0.09;
    const desired = new THREE.Vector3(idleX, 0.18 + idleY, targetZ + 6.6);
    camera.position.lerp(desired, 1 - Math.exp(-delta * 4.6));
    camera.lookAt(new THREE.Vector3(0, 0, targetZ));
  });

  return null;
}

function NeuralMetricsProbe({ onSample }) {
  const frameCounter = useRef(0);
  const elapsed = useRef(0);

  useFrame((_, delta) => {
    frameCounter.current += 1;
    elapsed.current += delta;
    if (elapsed.current < 0.5) return;
    const fps = Math.max(1, Math.round(frameCounter.current / elapsed.current));
    onSample?.(fps);
    frameCounter.current = 0;
    elapsed.current = 0;
  });

  return null;
}

function computeNodePosition(nodeId, index, total, depth) {
  const offset = hashOffset(nodeId);
  const angle = (Math.PI * 2 * index) / Math.max(1, total);
  const radius = Math.max(1.05, Math.min(1.55, 1.25 + (total - 5) * 0.03));
  const jitter = ((offset % 100) / 100 - 0.5) * 0.19;
  const zJitter = (((offset / 100) % 100) / 100 - 0.5) * 0.38;
  const yLift = Math.sin(offset * 0.01) * 0.06;
  const zBase = -depth * 8;

  return [
    Math.cos(angle) * (radius + jitter),
    Math.sin(angle) * (radius + jitter) + yLift,
    zBase + zJitter,
  ];
}

function ConnectionLine({
  start,
  end,
  color,
  phaseSeed = 0,
  intensity = 0.35,
  cinematicStyle = false,
  allowSecondaryPulse = false,
  lightMode = false,
}) {
  const particlesRef = useRef(null);
  const secondaryParticlesRef = useRef(null);
  const particleCount = cinematicStyle ? 18 : 8;
  const pulseSpeed = cinematicStyle ? (0.22 + intensity * 0.38) : 0.32;
  const secondaryPulseSpeed = pulseSpeed * 1.32;
  const tmpPoint = useRef(new THREE.Vector3());

  const { lineObj, curve } = useMemo(() => {
    const archX = (start[0] + end[0]) / 2 + (((phaseSeed * 317) % 100) / 100 - 0.5) * 0.18;
    const archY = (start[1] + end[1]) / 2 + 0.24 + ((phaseSeed % 7) * 0.03) + (cinematicStyle ? intensity * 0.12 : 0);
    const archZ = (start[2] + end[2]) / 2;
    const c = new THREE.CatmullRomCurve3([
      new THREE.Vector3(start[0], start[1], start[2]),
      new THREE.Vector3(archX, archY, archZ),
      new THREE.Vector3(end[0], end[1], end[2]),
    ]);
    const pts = c.getPoints(42);
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: cinematicStyle ? (0.44 + intensity * 0.24) : 0.46,
    });
    return { lineObj: new THREE.Line(geo, mat), curve: c };
  }, [cinematicStyle, color, end, intensity, phaseSeed, start]);

  const particleGeo = useMemo(() => {
    const arr = new Float32Array(particleCount * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    return geo;
  }, [particleCount]);

  useEffect(() => () => {
    lineObj.geometry.dispose();
    lineObj.material.dispose();
    particleGeo.dispose();
  }, [lineObj, particleGeo]);

  useFrame(({ clock }) => {
    if (!particlesRef.current) return;
    const t = (clock.getElapsedTime() * pulseSpeed + phaseSeed * 0.07) % 1;
    const positions = particlesRef.current.geometry.attributes.position.array;
    for (let i = 0; i < particleCount; i++) {
      const offset = (i / particleCount + t) % 1;
      const pt = curve.getPointAt(offset, tmpPoint.current);
      positions[i * 3] = pt.x;
      positions[i * 3 + 1] = pt.y;
      positions[i * 3 + 2] = pt.z;
    }
    particlesRef.current.geometry.attributes.position.needsUpdate = true;

    if (allowSecondaryPulse && secondaryParticlesRef.current) {
      const t2 = (clock.getElapsedTime() * secondaryPulseSpeed + phaseSeed * 0.19) % 1;
      const positions2 = secondaryParticlesRef.current.geometry.attributes.position.array;
      for (let i = 0; i < particleCount; i++) {
        const offset = (i / particleCount + t2) % 1;
        const pt = curve.getPointAt(offset, tmpPoint.current);
        positions2[i * 3] = pt.x;
        positions2[i * 3 + 1] = pt.y;
        positions2[i * 3 + 2] = pt.z;
      }
      secondaryParticlesRef.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  return (
    <group>
      <primitive object={lineObj} />
      <points ref={particlesRef} geometry={particleGeo}>
        <pointsMaterial
          color={color}
          size={cinematicStyle ? (0.09 + intensity * 0.04) : 0.066}
          transparent
          opacity={cinematicStyle ? (0.72 + intensity * 0.24) : 1}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation
        />
      </points>
      {allowSecondaryPulse ? (
        <points ref={secondaryParticlesRef} geometry={particleGeo}>
          <pointsMaterial
            color={lightMode ? "#d8f5ff" : color}
            size={cinematicStyle ? (0.062 + intensity * 0.03) : 0.054}
            transparent
            opacity={lightMode ? 0.18 : (0.24 + intensity * 0.16)}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            sizeAttenuation
          />
        </points>
      ) : null}
    </group>
  );
}

function LayerConnections({
  currentLayer,
  personaState,
  cinematicStyle = false,
  intensity = 0.35,
  highArousalPulse = false,
  lightMode = false,
}) {
  const depth = currentLayer.depth;
  const center = useMemo(() => [0, 0, -depth * 8], [depth]);
  const cinematicPalette = ["#55dcff", "#ffb56f", "#d78cff"];

  return (
    <group>
      {currentLayer.nodes.map((node, index) => {
        const total = currentLayer.nodes.length;
        const target = computeNodePosition(node.id, index, total, depth);
        const typeColor = node.type === "leaf"
          ? "#5ae2ff"
          : node.type === "memory"
          ? "#ffc16b"
          : "#9fb0ff";
        const color = cinematicStyle
          ? cinematicPalette[index % cinematicPalette.length]
          : personaState?.moodColor || typeColor;

        return (
          <ConnectionLine
            key={`conn-${node.id}`}
            start={center}
            end={target}
            color={color}
            phaseSeed={index + depth * 11}
            cinematicStyle={cinematicStyle}
            intensity={intensity}
            allowSecondaryPulse={cinematicStyle && highArousalPulse}
            lightMode={lightMode}
          />
        );
      })}
    </group>
  );
}

function CinematicBranchWeb({ currentLayer, enabled = false, intensity = 0.35 }) {
  const depth = currentLayer.depth;
  const center = useMemo(() => [0, 0, -depth * 8], [depth]);

  const branchLines = useMemo(() => {
    if (!enabled) return [];
    const lines = [];
    const palette = ["#63deff", "#ffb97e", "#cf8dff"];

    currentLayer.nodes.forEach((node, index) => {
      const target = computeNodePosition(node.id, index, currentLayer.nodes.length, depth);

      for (let branch = 0; branch < 2; branch += 1) {
        const seed = hashOffset(`${node.id}-${branch}`);
        const branchLift = 0.18 + branch * 0.1 + ((seed % 10) / 10) * 0.08;
        const side = branch % 2 === 0 ? 1 : -1;
        const archX = (center[0] + target[0]) / 2 + side * (0.22 + intensity * 0.16);
        const archY = (center[1] + target[1]) / 2 + branchLift + intensity * 0.18;
        const archZ = (center[2] + target[2]) / 2 + side * 0.05;

        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(center[0], center[1], center[2]),
          new THREE.Vector3(archX, archY, archZ),
          new THREE.Vector3(target[0], target[1], target[2]),
        ]);

        const points = curve.getPoints(36);
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
          color: palette[(index + branch) % palette.length],
          transparent: true,
          opacity: 0.14 + intensity * 0.1,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });

        lines.push(new THREE.Line(geometry, material));
      }
    });

    return lines;
  }, [center, currentLayer.nodes, depth, enabled, intensity]);

  useEffect(() => () => {
    branchLines.forEach((line) => {
      line.geometry.dispose();
      line.material.dispose();
    });
  }, [branchLines]);

  if (!enabled) return null;
  return (
    <group>
      {branchLines.map((line, idx) => (
        <primitive key={`branch-web-${idx}`} object={line} />
      ))}
    </group>
  );
}

function AmbientVeinBackdrop({ enabled = false, depth = 0, intensity = 0.35, color = "#67dbff" }) {
  const veinCount = enabled ? 22 : 0;
  const segs = 22;
  const palette = [color, "#d78cff", "#ffaf72", "#60ddff"];
  const centerZ = -depth * 8;

  const veins = useMemo(() => {
    return Array.from({ length: veinCount }, (_, idx) => {
      const arr = new Float32Array((segs + 1) * 3);
      const geo = new THREE.BufferGeometry();
      const attr = new THREE.BufferAttribute(arr, 3);
      attr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute("position", attr);

      const material = new THREE.LineBasicMaterial({
        color: palette[idx % palette.length],
        transparent: true,
        opacity: 0.018 + intensity * 0.08,
      });

      return {
        line: new THREE.Line(geo, material),
        arr,
        material,
        seed: idx * 13.7 + 2.1,
        angle: (Math.PI * 2 * idx) / Math.max(1, veinCount),
        length: 2.2 + (idx % 6) * 0.34,
        spread: 0.36 + (idx % 5) * 0.05,
        lift: (idx % 2 === 0 ? 1 : -1) * (0.08 + (idx % 4) * 0.02),
        z: centerZ - 1.2 - (idx % 3) * 0.2,
      };
    });
  }, [centerZ, color, intensity, veinCount]);

  useEffect(() => () => {
    veins.forEach((vein) => {
      vein.line.geometry.dispose();
      vein.material.dispose();
    });
  }, [veins]);

  useFrame(({ clock }) => {
    if (!enabled) return;
    const t = clock.getElapsedTime();
    const speed = 0.14 + intensity * 0.38;

    veins.forEach((vein) => {
      const branchWobble = Math.sin(t * speed + vein.seed) * 0.12;
      const branchAngle = vein.angle + branchWobble;
      const dirX = Math.cos(branchAngle);
      const dirY = Math.sin(branchAngle);

      for (let i = 0; i <= segs; i += 1) {
        const f = i / segs;
        const reach = vein.length * f;
        const lateral = Math.sin(f * Math.PI * 2 + vein.seed + t * speed * 0.7) * vein.spread * (0.4 + intensity * 0.5) * (0.25 + f);

        vein.arr[i * 3] = dirX * reach + (-dirY) * lateral;
        vein.arr[i * 3 + 1] = dirY * reach + dirX * lateral + vein.lift * f;
        vein.arr[i * 3 + 2] = vein.z + Math.cos(t * 0.24 + f * 5.3 + vein.seed) * 0.05 + f * 0.05;
      }
      vein.line.geometry.attributes.position.needsUpdate = true;
      vein.material.opacity = 0.018 + intensity * 0.08 + Math.sin(t * 1.1 + vein.seed) * 0.012;
    });
  });

  if (!enabled) return null;
  return (
    <group>
      {veins.map((vein, idx) => (
        <primitive key={`vein-${idx}`} object={vein.line} />
      ))}
    </group>
  );
}

function AmbientParticleField({ enabled = false, depth = 0, intensity = 0.35, maxParticles = 120 }) {
  const pointsRef = useRef(null);
  const count = enabled ? maxParticles : 0;

  const particles = useMemo(() => {
    return Array.from({ length: count }, (_, idx) => {
      const spread = 2.9;
      return {
        x: (Math.random() - 0.5) * spread * 2,
        y: (Math.random() - 0.5) * spread * 1.7,
        z: -depth * 8 - 0.8 - Math.random() * 2.6,
        drift: 0.12 + Math.random() * 0.28,
        phase: idx * 0.67,
      };
    });
  }, [count, depth]);

  const geometry = useMemo(() => {
    const arr = new Float32Array(count * 3);
    particles.forEach((particle, index) => {
      arr[index * 3] = particle.x;
      arr[index * 3 + 1] = particle.y;
      arr[index * 3 + 2] = particle.z;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    return geo;
  }, [count, particles]);

  useEffect(() => () => {
    geometry.dispose();
  }, [geometry]);

  useFrame(({ clock }) => {
    if (!enabled || !pointsRef.current) return;
    const positions = pointsRef.current.geometry.attributes.position.array;
    const t = clock.getElapsedTime();
    for (let i = 0; i < count; i += 1) {
      const particle = particles[i];
      positions[i * 3 + 1] = particle.y + Math.sin(t * particle.drift + particle.phase) * (0.06 + intensity * 0.1);
      positions[i * 3] = particle.x + Math.cos(t * particle.drift * 0.8 + particle.phase) * 0.04;
    }
    pointsRef.current.geometry.attributes.position.needsUpdate = true;
  });

  if (!enabled) return null;
  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        color="#8ce8ff"
        size={0.035 + intensity * 0.035}
        transparent
        opacity={0.2 + intensity * 0.18}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

function CoreFxAura({ depth = 0, enabled = false, intensity = 0.35 }) {
  const auraRef = useRef(null);
  useFrame(({ clock }) => {
    if (!enabled || !auraRef.current) return;
    const t = clock.getElapsedTime();
    const pulse = 1 + Math.sin(t * (1.2 + intensity * 1.5)) * (0.06 + intensity * 0.12);
    auraRef.current.scale.setScalar(pulse);
  });

  if (!enabled) return null;
  return (
    <mesh ref={auraRef} position={[0, 0, -depth * 8 - 0.04]}>
      <ringGeometry args={[0.44, 0.56, 64]} />
      <meshBasicMaterial color="#ffb46a" transparent opacity={0.34 + intensity * 0.24} side={THREE.DoubleSide} />
    </mesh>
  );
}

function buildOrbArcPoints(radius, segCount, pointerX = 0, pointerY = 0) {
  const theta1 = Math.random() * Math.PI * 2;
  const theta2 = theta1 + (Math.random() - 0.5) * Math.PI * 1.35;
  const jitterScale = radius * 0.24;
  const points = new Float32Array((segCount + 1) * 3);

  for (let i = 0; i <= segCount; i += 1) {
    const t = i / segCount;
    const theta = theta1 + (theta2 - theta1) * t;
    const x = Math.cos(theta) * radius;
    const y = Math.sin(theta) * radius;
    const jitter = Math.sin(Math.PI * t) * jitterScale;
    points[i * 3] = x + (Math.random() - 0.5) * jitter + pointerX * radius * 0.12;
    points[i * 3 + 1] = y + (Math.random() - 0.5) * jitter + pointerY * radius * 0.12;
    points[i * 3 + 2] = (Math.random() - 0.5) * radius * 0.22;
  }

  return points;
}

function CinematicCoreOrb({
  depth = 0,
  intensity = 0.35,
  enabled = false,
  lightMode = false,
  highArousalPulse = false,
  moodColor = "#67dbff",
}) {
  const rootRef = useRef(null);
  const coreRef = useRef(null);
  const glowRef = useRef(null);
  const specRef = useRef(null);
  const ringARef = useRef(null);
  const ringBRef = useRef(null);
  const arcPoolRef = useRef([]);
  const ringBoostRef = useRef(1);
  const hoverMixRef = useRef({ x: 0, y: 0 });

  const center = useMemo(() => [0, 0, -depth * 8], [depth]);
  const arcCount = lightMode ? 5 : 9;
  const arcSegments = 12;

  const arcLines = useMemo(() => {
    if (!enabled) return [];
    return Array.from({ length: arcCount }, (_, idx) => {
      const arr = new Float32Array((arcSegments + 1) * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
      const material = new THREE.LineBasicMaterial({
        color: idx % 2 === 0 ? "#ffcc7d" : moodColor,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const line = new THREE.Line(geo, material);
      return {
        line,
        arr,
        life: 0,
        maxLife: 1,
      };
    });
  }, [arcCount, arcSegments, enabled, moodColor]);

  useEffect(() => {
    arcPoolRef.current = arcLines;
    return () => {
      arcLines.forEach((arc) => {
        arc.line.geometry.dispose();
        arc.line.material.dispose();
      });
    };
  }, [arcLines]);

  useFrame(({ clock, pointer }, delta) => {
    if (!enabled) return;

    const t = clock.getElapsedTime();
    const hoverX = clamp(pointer.x || 0, -0.65, 0.65);
    const hoverY = clamp(pointer.y || 0, -0.65, 0.65);
    hoverMixRef.current.x += (hoverX - hoverMixRef.current.x) * 0.065;
    hoverMixRef.current.y += (hoverY - hoverMixRef.current.y) * 0.065;

    const hoverMagnitude = Math.min(1, Math.abs(hoverMixRef.current.x) + Math.abs(hoverMixRef.current.y));
    const hoverScaleTarget = 1 + hoverMagnitude * 0.05;
    const ringTarget = 1 + (highArousalPulse ? 0.28 : 0.16) + hoverMagnitude * 0.54;
    ringBoostRef.current += (ringTarget - ringBoostRef.current) * 0.08;

    if (rootRef.current) {
      rootRef.current.rotation.y = hoverMixRef.current.x * 0.22;
      rootRef.current.rotation.x = -hoverMixRef.current.y * 0.16;
      rootRef.current.scale.setScalar(hoverScaleTarget);
    }

    if (coreRef.current) {
      const pulse = 1 + Math.sin(t * (1.7 + intensity * 1.8)) * (0.045 + intensity * 0.08);
      coreRef.current.scale.setScalar(pulse);
      coreRef.current.material.emissiveIntensity = 1.7 + intensity * 0.9 + Math.sin(t * 1.6) * 0.22;
    }

    if (glowRef.current) {
      const glowPulse = 1 + Math.sin(t * (1.2 + intensity * 1.2)) * (0.07 + intensity * 0.1);
      glowRef.current.scale.setScalar(glowPulse);
      glowRef.current.material.opacity = 0.24 + intensity * 0.2 + hoverMagnitude * 0.08;
    }

    if (specRef.current) {
      specRef.current.position.x = 0.1 + hoverMixRef.current.x * 0.14;
      specRef.current.position.y = 0.12 + hoverMixRef.current.y * 0.1;
      specRef.current.position.z = 0.3;
      specRef.current.material.opacity = 0.42 + hoverMagnitude * 0.24;
    }

    if (ringARef.current) {
      ringARef.current.rotation.z += delta * (0.38 + intensity * 0.44) * ringBoostRef.current;
      ringARef.current.rotation.y += delta * 0.2;
    }
    if (ringBRef.current) {
      ringBRef.current.rotation.z -= delta * (0.24 + intensity * 0.3) * ringBoostRef.current;
      ringBRef.current.rotation.x += delta * 0.16;
    }

    const arcSpawnRate = (highArousalPulse ? 0.16 : 0.1) + hoverMagnitude * 0.12;
    arcPoolRef.current.forEach((arc) => {
      arc.life += delta * 60;
      if (arc.life >= arc.maxLife) {
        if (Math.random() < arcSpawnRate) {
          const points = buildOrbArcPoints(
            0.42 * (0.92 + Math.random() * 0.1),
            arcSegments,
            hoverMixRef.current.x,
            hoverMixRef.current.y,
          );
          arc.arr.set(points);
          arc.line.geometry.attributes.position.needsUpdate = true;
          arc.life = 0;
          arc.maxLife = 26 + Math.random() * 36;
        }
      }

      const progress = arc.maxLife > 0 ? (arc.life / arc.maxLife) : 1;
      const alpha = progress < 0.16
        ? progress / 0.16
        : progress > 0.64
        ? 1 - ((progress - 0.64) / 0.36)
        : 1;

      arc.line.material.opacity = Math.max(0, alpha) * (0.36 + intensity * 0.42);
    });
  });

  if (!enabled) return null;

  return (
    <group ref={rootRef} position={center}>
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.54, 30, 30]} />
        <meshBasicMaterial color="#ffb46a" transparent opacity={0.26} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      <mesh ref={coreRef}>
        <sphereGeometry args={[0.34, 48, 48]} />
        <meshPhysicalMaterial
          color="#ff9c5c"
          emissive="#ff9c5c"
          emissiveIntensity={2.2}
          roughness={0.24}
          metalness={0.52}
          clearcoat={0.46}
          clearcoatRoughness={0.22}
        />
      </mesh>

      <mesh ref={specRef}>
        <sphereGeometry args={[0.11, 20, 20]} />
        <meshBasicMaterial color="#fff6d9" transparent opacity={0.52} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      <mesh ref={ringARef} scale={[1.08, 0.42, 1]}>
        <torusGeometry args={[0.46, 0.01, 14, 80]} />
        <meshBasicMaterial color={moodColor} transparent opacity={0.52} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      <mesh ref={ringBRef} rotation={[0.8, 0.25, 0.44]} scale={[1.12, 0.32, 1]}>
        <torusGeometry args={[0.49, 0.007, 12, 74]} />
        <meshBasicMaterial color="#ffcc7d" transparent opacity={0.34} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      {arcLines.map((arc, idx) => (
        <primitive key={`core-arc-${idx}`} object={arc.line} />
      ))}
    </group>
  );
}

function RadialNode({ node, index, total, depth, onClick, motionScale = 1 }) {
  const groupRef = useRef(null);
  const meshRef = useRef(null);
  const offset = useMemo(() => hashOffset(node.id), [node.id]);
  const basePosition = useMemo(() => computeNodePosition(node.id, index, total, depth), [node.id, index, total, depth]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() + (offset % 17) * 0.11;
    if (groupRef.current) {
      groupRef.current.position.y = basePosition[1] + Math.sin(t * 0.82 + offset * 0.003) * (0.06 + motionScale * 0.08);
    }
    if (meshRef.current) {
      const pulse = 1 + Math.sin(t * (1.7 + motionScale * 1.1)) * (0.03 + motionScale * 0.05);
      meshRef.current.scale.setScalar(pulse);
      meshRef.current.material.emissiveIntensity = 1.1 + Math.sin(t * 1.7) * (0.22 + motionScale * 0.24);
    }
  });

  const color = node.type === "leaf"
    ? "#53dcff"
    : node.type === "memory"
    ? "#ffc16b"
    : "#96a2ff";

  return (
    <group ref={groupRef} position={basePosition}>
      <mesh ref={meshRef} onClick={(event) => { event.stopPropagation(); onClick(node, basePosition); }}>
        <sphereGeometry args={[0.23, 28, 28]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.3} roughness={0.2} metalness={0.55} />
      </mesh>
      <Html position={[0, -0.41, 0]} center>
        <div className="neural-v2-label">{node.label}</div>
      </Html>
      <mesh>
        <ringGeometry args={[0.27, 0.32, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.32} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function CinematicRadialNode({ node, index, total, depth, onClick, motionScale = 1 }) {
  const groupRef = useRef(null);
  const coreRef = useRef(null);
  const glowRef = useRef(null);
  const specRef = useRef(null);
  const ringRef = useRef(null);

  const offset = useMemo(() => hashOffset(node.id), [node.id]);
  const basePosition = useMemo(
    () => computeNodePosition(node.id, index, total, depth),
    [node.id, index, total, depth],
  );

  const color = node.type === "leaf"
    ? "#53dcff"
    : node.type === "memory"
    ? "#ffc16b"
    : "#96a2ff";

  // Unique ring tilt per node so they don't all look identical
  const ringTilt = useMemo(() => {
    const s = offset % 100;
    return [s * 0.063, (s * 0.047) % (Math.PI * 2), 0];
  }, [offset]);

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime() + (offset % 17) * 0.11;

    if (groupRef.current) {
      groupRef.current.position.y =
        basePosition[1] + Math.sin(t * 0.82 + offset * 0.003) * (0.06 + motionScale * 0.08);
    }

    if (coreRef.current) {
      const pulse = 1 + Math.sin(t * (1.7 + motionScale * 1.1)) * (0.04 + motionScale * 0.06);
      coreRef.current.scale.setScalar(pulse);
      coreRef.current.material.emissiveIntensity =
        1.6 + Math.sin(t * 1.6) * (0.28 + motionScale * 0.28);
    }

    if (glowRef.current) {
      const glowPulse = 1 + Math.sin(t * (1.1 + motionScale * 0.9)) * (0.06 + motionScale * 0.08);
      glowRef.current.scale.setScalar(glowPulse);
      glowRef.current.material.opacity = 0.18 + motionScale * 0.14;
    }

    if (specRef.current) {
      specRef.current.material.opacity =
        0.36 + Math.sin(t * 2.1 + offset * 0.04) * 0.12;
    }

    if (ringRef.current) {
      ringRef.current.rotation.z += delta * (0.32 + motionScale * 0.38);
    }
  });

  return (
    <group ref={groupRef} position={basePosition}>
      {/* Soft outer glow */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.36, 20, 20]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.18}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Physical core sphere */}
      <mesh
        ref={coreRef}
        onClick={(event) => { event.stopPropagation(); onClick(node, basePosition); }}
      >
        <sphereGeometry args={[0.22, 36, 36]} />
        <meshPhysicalMaterial
          color={color}
          emissive={color}
          emissiveIntensity={1.6}
          roughness={0.22}
          metalness={0.5}
          clearcoat={0.42}
          clearcoatRoughness={0.2}
        />
      </mesh>

      {/* Specular highlight */}
      <mesh ref={specRef} position={[0.07, 0.08, 0.18]}>
        <sphereGeometry args={[0.068, 12, 12]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.42}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Rotating orbit ring — unique tilt per node */}
      <mesh ref={ringRef} rotation={ringTilt} scale={[1, 0.38, 1]}>
        <torusGeometry args={[0.3, 0.008, 10, 64]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.52}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      <Html position={[0, -0.46, 0]} center>
        <div className="neural-v2-label">{node.label}</div>
      </Html>
    </group>
  );
}

function SceneLayer({
  currentLayer,
  onNodeSelect,
  personaState,
  cinematicStyle = false,
  visualIntensity = 0.35,
  highArousalPulse = false,
  lightMode = false,
}) {
  const depth = currentLayer.depth;
  const center = [0, 0, -depth * 8];
  const moodColor = personaState?.moodColor || "#67dbff";

  return (
    <group>
      <group name="backgroundLayer">
        <AmbientVeinBackdrop
          enabled={cinematicStyle}
          depth={depth}
          intensity={visualIntensity}
          color={moodColor}
        />
        <AmbientParticleField
          enabled={cinematicStyle}
          depth={depth}
          intensity={visualIntensity}
          maxParticles={lightMode ? 70 : 120}
        />
      </group>

      <group name="connectionLayer">
        <CinematicBranchWeb
          currentLayer={currentLayer}
          enabled={cinematicStyle}
          intensity={visualIntensity}
        />
        <LayerConnections
          currentLayer={currentLayer}
          personaState={personaState}
          cinematicStyle={cinematicStyle}
          intensity={visualIntensity}
          highArousalPulse={highArousalPulse}
          lightMode={lightMode}
        />
      </group>

      <group name="nodeLayer">
        {cinematicStyle ? (
          <CinematicCoreOrb
            depth={depth}
            intensity={visualIntensity}
            enabled={cinematicStyle}
            lightMode={lightMode}
            highArousalPulse={highArousalPulse}
            moodColor={moodColor}
          />
        ) : (
          <mesh position={center}>
            <sphereGeometry args={[0.34, 32, 32]} />
            <meshStandardMaterial color="#ff9c5c" emissive="#ff9c5c" emissiveIntensity={2.2 + visualIntensity * 0.8} roughness={0.2} metalness={0.5} />
          </mesh>
        )}

        {currentLayer.nodes.map((node, index) => {
          const total = currentLayer.nodes.length;
          return (
            <group key={node.id}>
              {cinematicStyle ? (
                <CinematicRadialNode
                  node={node}
                  index={index}
                  total={total}
                  depth={depth}
                  onClick={onNodeSelect}
                  motionScale={visualIntensity}
                />
              ) : (
                <RadialNode
                  node={node}
                  index={index}
                  total={total}
                  depth={depth}
                  onClick={onNodeSelect}
                  motionScale={visualIntensity}
                />
              )}
            </group>
          );
        })}
      </group>

      <group name="fxLayer">
        <CoreFxAura depth={depth} enabled={cinematicStyle} intensity={visualIntensity} />
      </group>
    </group>
  );
}

function LeafNodeHud({ leafNode, onClose }) {
  if (!leafNode?.position) return null;

  const [x, y, z] = leafNode.position;

  return (
    <Html position={[x + 0.42, y + 0.22, z + 0.35]} transform distanceFactor={9.6}>
      <div key={`${leafNode.id}-${leafNode.parentId || "root"}`} className="neural-v2-leaf-hud" onPointerDown={(event) => event.stopPropagation()}>
        <h3 className="neural-v2-leaf-hud-title">{leafNode.label}</h3>
        <p className="neural-v2-leaf-hud-meta">Type: {leafNode.meta || "leaf"}</p>
        <p className="neural-v2-leaf-hud-meta">Data: {leafNode.dataRef || "N/A"}</p>
        <p className="neural-v2-leaf-hud-meta">Click deeper nodes to keep diving.</p>
        <div className="neural-v2-leaf-hud-actions">
          <button type="button" className="neural-v2-leaf-hud-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </Html>
  );
}

function normalizeNodes(nodes = []) {
  return nodes.map((node) => ({
    id: node.id,
    label: node.label,
    type: node.type || "category",
    dataRef: node.dataRef || null,
    payload: node.payload || null,
    children: Array.isArray(node.children) ? normalizeNodes(node.children) : [],
  }));
}

export default function NeuralSceneV2({
  rootNodes = [],
  onLeafNodeSelect,
  onFocusNodeChange,
  onDepthChange,
  arousal = 0,
  performanceTier = "balanced",
  personaState = null,
}) {
  // cyberpunk-ui-redesign branch: cinematic-v1 is the default style; set
  // VITE_NEURAL_CORE_STYLE=standard to disable cinematic FX.
  const sceneStyleEnv = String(import.meta.env.VITE_NEURAL_CORE_STYLE || "cinematic-v1").trim().toLowerCase();
  const cinematicStyle = sceneStyleEnv !== "standard";
  const lightMode = String(performanceTier || "").toLowerCase() === "light";
  const baseIntensity = clamp(0.2 + Math.abs(Number(arousal || 0)) * 0.8, 0.2, 1);
  const visualIntensity = lightMode ? clamp(baseIntensity * 0.76, 0.2, 0.72) : baseIntensity;
  const highArousalPulse = Math.abs(Number(arousal || 0)) >= (lightMode ? 0.72 : 0.58);
  const normalizedRoot = useMemo(() => normalizeNodes(rootNodes), [rootNodes]);
  const [transitionKey, setTransitionKey] = useState(0);
  const [transitionMode, setTransitionMode] = useState("forward");
  const [fps, setFps] = useState(0);
  const [activeNodeId, setActiveNodeId] = useState("core");
  const [navigationCount, setNavigationCount] = useState(0);
  const [controlsResetToken, setControlsResetToken] = useState(0);
  const [selectedLeafNode, setSelectedLeafNode] = useState(null);
  const [layerStack, setLayerStack] = useState(() => [
    {
      id: "root",
      depth: 0,
      nodes: normalizedRoot,
      parentNode: null,
    },
  ]);

  useEffect(() => {
    setLayerStack([
      {
        id: "root",
        depth: 0,
        nodes: normalizedRoot,
        parentNode: null,
      },
    ]);
    setActiveNodeId("core");
    setNavigationCount(0);
    setControlsResetToken((prev) => prev + 1);
    setSelectedLeafNode(null);
  }, [normalizedRoot]);

  const currentLayer = layerStack[layerStack.length - 1] || {
    id: "root",
    depth: 0,
    nodes: [],
    parentNode: null,
  };

  useEffect(() => {
    onDepthChange?.(currentLayer.depth);
  }, [currentLayer.depth, onDepthChange]);

  useEffect(() => {
    setTransitionKey((prev) => prev + 1);
  }, [currentLayer.id, currentLayer.depth]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") {
        setTransitionMode("back");
        setLayerStack((prev) => {
          if (prev.length <= 1) return prev;
          return prev.slice(0, -1);
        });
        setNavigationCount((prev) => prev + 1);
        setSelectedLeafNode(null);
        onLeafNodeSelect?.(null);
        return;
      }

      if (event.key.toLowerCase() === "h") {
        setTransitionMode("home");
        setLayerStack((prev) => (prev.length > 0 ? [prev[0]] : prev));
        setActiveNodeId("core");
        setNavigationCount((prev) => prev + 1);
        setControlsResetToken((prev) => prev + 1);
        setSelectedLeafNode(null);
        onLeafNodeSelect?.(null);
        onFocusNodeChange?.("core");
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onLeafNodeSelect]);

  function handleNodeSelect(node, position) {
    setActiveNodeId(node.id);
    onFocusNodeChange?.(node.id);

    if (Array.isArray(node.children) && node.children.length > 0) {
      setTransitionMode("forward");
      setSelectedLeafNode(null);
      onLeafNodeSelect?.(null);
      setLayerStack((prev) => [
        ...prev,
        {
          id: node.id,
          depth: prev.length,
          nodes: node.children,
          parentNode: node,
        },
      ]);
      setNavigationCount((prev) => prev + 1);
      return;
    }

    const leafPayload = {
      id: node.id,
      label: node.label,
      dataRef: node.dataRef || null,
      payload: node.payload || null,
      position,
      parentId: currentLayer.parentNode?.id || "root",
      source: currentLayer.parentNode?.id || "root",
      meta: node.type || "leaf",
    };

    setSelectedLeafNode(leafPayload);
    onLeafNodeSelect?.(leafPayload);
  }

  function handleBack() {
    setTransitionMode("back");
    setLayerStack((prev) => {
      if (prev.length <= 1) return prev;
      return prev.slice(0, -1);
    });
    setNavigationCount((prev) => prev + 1);
    setSelectedLeafNode(null);
    onLeafNodeSelect?.(null);
  }

  function handleHome() {
    setTransitionMode("home");
    setLayerStack((prev) => (prev.length > 0 ? [prev[0]] : prev));
    setActiveNodeId("core");
    setNavigationCount((prev) => prev + 1);
    setControlsResetToken((prev) => prev + 1);
    setSelectedLeafNode(null);
    onLeafNodeSelect?.(null);
    onFocusNodeChange?.("core");
  }

  return (
    <div className="neural-v2-shell">
      <style>{sceneV2Styles}</style>

      <div className="neural-v2-controls">
        <button type="button" className="neural-v2-btn" onClick={handleBack} disabled={layerStack.length <= 1}>Back</button>
        <button type="button" className="neural-v2-btn" onClick={handleHome}>Home</button>
      </div>

      <div key={transitionKey} className={`neural-v2-transition is-${transitionMode}`} />

      <Canvas
        camera={{ position: [0, 0.18, 6.6], fov: 48 }}
        dpr={[1, 1.2]}
        gl={{ alpha: true, antialias: false, powerPreference: "low-power" }}
        onCreated={({ gl }) => {
          gl.setClearColor("#000000", 0);
        }}
        onPointerMissed={() => {
          setSelectedLeafNode(null);
          onLeafNodeSelect?.(null);
        }}
      >
        <fog attach="fog" args={["#071422", 8, 24]} />
        <ambientLight intensity={0.3} />
        <pointLight position={[5, 4, 6]} intensity={1.4} color="#56deff" />
        <pointLight position={[-4, -3, 5]} intensity={0.9} color="#ff9c5c" />
        <Stars radius={28} depth={14} count={120} factor={0.85} saturation={0} fade />

        <CameraDepthRig depth={currentLayer.depth} />
        <OrbitControls key={controlsResetToken} enablePan={false} enableZoom minDistance={3.2} maxDistance={13} />
        <NeuralMetricsProbe onSample={setFps} />

        <SceneLayer
          currentLayer={currentLayer}
          onNodeSelect={handleNodeSelect}
          personaState={personaState}
          cinematicStyle={cinematicStyle}
          visualIntensity={visualIntensity}
          highArousalPulse={highArousalPulse}
          lightMode={lightMode}
        />
        <LeafNodeHud leafNode={selectedLeafNode} onClose={() => {
          setSelectedLeafNode(null);
          onLeafNodeSelect?.(null);
        }} />
      </Canvas>

      <div className="neural-v2-debug">
        <span className="neural-v2-pill">FPS {fps || "--"}</span>
        <span className="neural-v2-pill">Depth {currentLayer.depth}</span>
        <span className="neural-v2-pill">Nodes {currentLayer.nodes.length}</span>
        <span className="neural-v2-pill">Layer {currentLayer.id}</span>
        <span className="neural-v2-pill">Focus {activeNodeId}</span>
        <span className="neural-v2-pill">Moves {navigationCount}</span>
        <span className="neural-v2-pill">Esc Back / H Home</span>
      </div>
    </div>
  );
}
