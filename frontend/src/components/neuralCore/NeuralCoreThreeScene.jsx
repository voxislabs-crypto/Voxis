import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls, Stars } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import { buildThreeGraphModel } from "./neuralCoreThreeModel.js";

const threeSceneStyles = `
  .neural-three-shell {
    position: absolute;
    inset: 0;
  }

  .neural-three-panel {
    position: absolute;
    right: 18px;
    bottom: 18px;
    z-index: 2;
    width: min(320px, calc(100% - 36px));
    padding: 14px 16px;
    border-radius: 18px;
    border: 1px solid rgba(0, 234, 255, 0.22);
    background: linear-gradient(180deg, rgba(4, 12, 24, 0.9), rgba(5, 10, 22, 0.78));
    box-shadow: 0 0 24px rgba(0, 234, 255, 0.12);
    backdrop-filter: blur(14px);
  }

  .neural-three-panel h5 {
    margin: 0 0 6px;
    color: #e7fbff;
    font-size: 0.96rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .neural-three-panel p {
    margin: 0;
    color: #8dcfe3;
    font-size: 0.84rem;
    line-height: 1.6;
  }

  .neural-three-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }

  .neural-three-meta span {
    padding: 4px 9px;
    border-radius: 999px;
    border: 1px solid rgba(0, 234, 255, 0.16);
    background: rgba(0, 234, 255, 0.06);
    color: #93efff;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.03em;
  }

  .neural-three-hint {
    position: absolute;
    left: 18px;
    top: 16px;
    z-index: 2;
    padding: 6px 10px;
    border-radius: 999px;
    background: rgba(5, 14, 26, 0.78);
    border: 1px solid rgba(0, 234, 255, 0.18);
    color: #8ddbff;
    font-size: 0.74rem;
    font-weight: 700;
  }

  .neural-node-label {
    padding: 2px 7px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(2, 8, 18, 0.76);
    color: #dff9ff;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    white-space: nowrap;
    box-shadow: 0 0 12px rgba(0, 234, 255, 0.10);
  }
`;

// ── Phase → node mapping for burst pulses ───────────────────────────
const PHASE_NODE_MAP = {
  intent:               ["intent", "core"],
  generation:           ["core"],
  token:                ["core"],
  reply:                ["core", "evidence"],
  "reply-complete":     ["core", "evidence"],
  "memory-write":       ["memory", "core"],
  "user-memory-write":  ["memory"],
  mood:                 ["core", "identity"],
  scientist:            ["evidence"],
  repair:               ["evidence"],
  prompt:               ["identity", "core"],
  "rate-limit":         ["core"],
  "rate-limit-retry":   ["core"],
  "rate-limit-fallback":["core"],
  queued:               ["core"],
};

function smoothLerpAlpha(delta, speed = 5) {
  return 1 - Math.exp(-delta * speed);
}

// ── Camera ───────────────────────────────────────────────────────────
function CameraRig({ target, speed, controlsRef }) {
  const { camera } = useThree();
  const targetVector = useMemo(() => new THREE.Vector3(...target), [target]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const orbit = new THREE.Vector3(
      Math.sin(t * 0.18) * 0.18,
      Math.cos(t * 0.2) * 0.1,
      5.9 - Math.min(1.25, Math.max(0, targetVector.length() * 0.08)),
    );

    const desiredPosition = new THREE.Vector3(targetVector.x + orbit.x, targetVector.y + orbit.y, orbit.z);
    camera.position.lerp(desiredPosition, smoothLerpAlpha(delta, 3.4 + speed));

    if (controlsRef.current) {
      controlsRef.current.target.lerp(targetVector, smoothLerpAlpha(delta, 4.4 + speed));
      controlsRef.current.update();
    } else {
      camera.lookAt(targetVector);
    }
  });

  return null;
}

function CompanionOrb({ moodState }) {
  const groupRef = useRef(null);
  const coreRef = useRef(null);
  const orbitRingRef = useRef(null);

  useFrame((state) => {
    if (!groupRef.current || !coreRef.current) return;
    const t = state.clock.elapsedTime;

    // Float
    groupRef.current.position.y = 2.15 + Math.sin(t * 1.1) * 0.12;
    groupRef.current.rotation.z = Math.sin(t * 0.5) * 0.08;

    // Breathing scale
    coreRef.current.scale.setScalar(1 + Math.sin(t * 2.0) * 0.055);

    // Orbit ring spin
    if (orbitRingRef.current) {
      orbitRingRef.current.rotation.y = t * 1.25;
      orbitRingRef.current.rotation.x = t * 0.72;
    }
  });

  const orbitAngles = useMemo(() => [0, 72, 144, 216, 288], []);

  return (
    <group ref={groupRef} position={[3, 2.15, -1.2]}>
      {/* Core sphere */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[0.38, 32, 32]} />
        <meshStandardMaterial
          color={moodState.secondary}
          emissive={moodState.accent}
          emissiveIntensity={2.4}
          transparent
          opacity={0.9}
          roughness={0.16}
        />
      </mesh>
      {/* Eye glints */}
      <mesh position={[-0.1, 0.04, 0.28]}>
        <sphereGeometry args={[0.052, 16, 16]} />
        <meshStandardMaterial color="#ddffff" emissive="#9af4ff" emissiveIntensity={3.5} />
      </mesh>
      <mesh position={[0.1, 0.04, 0.28]}>
        <sphereGeometry args={[0.052, 16, 16]} />
        <meshStandardMaterial color="#ddffff" emissive="#9af4ff" emissiveIntensity={3.5} />
      </mesh>
      {/* Orbiting particle ring */}
      <group ref={orbitRingRef}>
        {orbitAngles.map((angle) => {
          const rad = (angle * Math.PI) / 180;
          return (
            <mesh
              key={angle}
              position={[Math.cos(rad) * 0.66, Math.sin(rad) * 0.26, Math.sin(rad) * 0.50]}
            >
              <sphereGeometry args={[0.028, 8, 8]} />
              <meshStandardMaterial
                color={moodState.accent}
                emissive={moodState.accent}
                emissiveIntensity={3.2}
                transparent
                opacity={0.8}
              />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

// ── Traveling pulse dot along a synapse ─────────────────────────────
function PulseDot({ start, end, activity, color }) {
  const meshRef = useRef(null);
  const progressRef = useRef(Math.random());
  const startRef = useRef(start);
  const endRef = useRef(end);

  useEffect(() => { startRef.current = start; }, [start]);
  useEffect(() => { endRef.current = end; }, [end]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const s = startRef.current;
    const e = endRef.current;
    progressRef.current = (progressRef.current + delta * (0.44 + activity * 1.7)) % 1;
    const p = progressRef.current;
    meshRef.current.position.set(
      s[0] + (e[0] - s[0]) * p,
      s[1] + (e[1] - s[1]) * p,
      s[2] + (e[2] - s[2]) * p,
    );
    meshRef.current.material.opacity = Math.sin(p * Math.PI) * (0.55 + activity * 0.45);
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.022 + activity * 0.022, 6, 6]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={4.5}
        transparent
        opacity={0.8}
        depthWrite={false}
      />
    </mesh>
  );
}

// ── Jittered lightning synapse line ──────────────────────────────────
function LightningConnection({ start, end, color, weight, highlighted, activity }) {
  const startRef = useRef(start);
  const endRef = useRef(end);
  useEffect(() => { startRef.current = start; endRef.current = end; }, [start, end]);

  // Create THREE objects once — mutated in useFrame, never re-created
  const { line, positions, material } = useMemo(() => {
    const positions = new Float32Array([
      start[0], start[1], start[2],
      (start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2,
      end[0], end[1], end[2],
    ]);
    const geometry = new THREE.BufferGeometry();
    const attr = new THREE.BufferAttribute(positions, 3);
    attr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("position", attr);
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.4 });
    return { line: new THREE.Line(geometry, material), positions, material };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep color current
  useEffect(() => { material.color.set(color); }, [color, material]);

  // Cleanup on unmount
  useEffect(() => () => { line.geometry.dispose(); material.dispose(); }, [line, material]);

  useFrame((state) => {
    const s = startRef.current;
    const e = endRef.current;

    // Jitter midpoint — crackle intensity scales with highlight/activity
    const jScale = highlighted ? 0.12 : 0.04;
    positions[3] = (s[0] + e[0]) / 2 + (Math.random() - 0.5) * jScale;
    positions[4] = (s[1] + e[1]) / 2 + (Math.random() - 0.5) * jScale;
    positions[5] = (s[2] + e[2]) / 2;
    line.geometry.attributes.position.needsUpdate = true;

    // Flicker opacity
    const flickSpeed = highlighted ? 14 : 5.5;
    material.opacity =
      0.12
      + Math.sin(state.clock.elapsedTime * flickSpeed) * 0.065
      + weight * 0.30
      + (highlighted ? 0.24 : 0)
      + activity * 0.12;
  });

  return (
    <>
      <primitive object={line} />
      <PulseDot start={start} end={end} activity={Math.max(0.22, activity)} color={color} />
    </>
  );
}

// ── Graph node (orb + glow halo + pulse system) ───────────────────────
function GraphNode({ node, selectedId, linkedIds, onSelect, livePhaseBurst, burstSeq }) {
  const groupRef = useRef(null);
  const meshRef = useRef(null);
  const glowRef = useRef(null);

  const basePos = useMemo(() => new THREE.Vector3(...node.position), [node.position]);
  const driftOffset = useMemo(() => Math.random() * Math.PI * 2, []);
  const pulseRef = useRef(0);

  const isSelected = node.id === selectedId;
  const isLinked = linkedIds.has(node.id);

  // Fire pulse when phase matches this node
  useEffect(() => {
    if (!livePhaseBurst) return;
    const targets = PHASE_NODE_MAP[livePhaseBurst] || [];
    if (targets.includes(node.id) || targets.includes(node.type)) {
      pulseRef.current = 1;
    } else if (targets.length > 0) {
      // Echo wave — other nodes get a dim sympathetic pulse
      pulseRef.current = Math.max(pulseRef.current, 0.30);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [burstSeq]);

  useFrame((state, delta) => {
    if (!groupRef.current || !meshRef.current) return;

    // Decay pulse
    pulseRef.current = Math.max(0, pulseRef.current - delta * 2.2);

    const t = state.clock.elapsedTime;

    // Smooth fluid drift — feels like floating in liquid
    groupRef.current.position.set(
      basePos.x + Math.cos(t * 0.28 + driftOffset) * 0.046,
      basePos.y + Math.sin(t * 0.44 + driftOffset) * 0.054,
      basePos.z,
    );

    // Breathing scale
    const breathe = 1 + Math.sin(t * 1.75 + driftOffset) * 0.042;
    const targetScale = (isSelected ? 1.18 : isLinked ? 1.07 : 1.0) * breathe;
    const cur = meshRef.current.scale.x;
    const next = cur + (targetScale - cur) * 0.06;
    meshRef.current.scale.setScalar(next);

    // Emissive FLASH then decay
    const baseGlow = 0.82 + node.activity * 0.72 + Math.sin(t * 2.1 + driftOffset) * 0.10;
    meshRef.current.material.emissiveIntensity =
      baseGlow + pulseRef.current * 6.5 + (isSelected ? 1.5 : 0);

    // Glow halo tracks pulse
    if (glowRef.current) {
      glowRef.current.material.opacity =
        0.07 + pulseRef.current * 0.44 + node.activity * 0.06 + (isSelected ? 0.12 : 0);
      glowRef.current.scale.setScalar(next * (1.34 + pulseRef.current * 0.22));
    }
  });

  const radius = 0.18 + node.strength * 0.30;

  return (
    <group
      ref={groupRef}
      position={node.position}
      onClick={(e) => { e.stopPropagation(); onSelect(node); }}
    >
      {/* Outer glow shell — bloom-amplified */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[radius * 1.55, 18, 18]} />
        <meshStandardMaterial
          color={node.color}
          emissive={node.color}
          emissiveIntensity={1.4}
          transparent
          opacity={0.07}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>
      {/* Core orb */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[radius, 32, 32]} />
        <meshStandardMaterial
          color={node.color}
          emissive={node.color}
          emissiveIntensity={1.1 + node.activity * 0.55}
          roughness={0.22}
          metalness={0.14}
        />
      </mesh>
      <Html position={[0, -radius - 0.22, 0]} center>
        <div className="neural-node-label">{node.label}</div>
      </Html>
    </group>
  );
}

export default function NeuralCoreThreeScene({
  scene,
  personality,
  memoryCount,
  hasIntent,
  identityActive,
  evidenceActive,
  repairActive,
  reconditioningActive,
  visibleChildNodes,
  focusNode,
  setFocusNode,
  valence,
  arousal,
  dominance,
  livePhaseBurst,
}) {
  const controlsRef = useRef(null);
  const [selectedId, setSelectedId] = useState(focusNode || "core");
  // Increment on every new phase burst so useEffect in GraphNode always fires
  const [burstSeq, setBurstSeq] = useState(0);

  useEffect(() => {
    setSelectedId(focusNode || "core");
  }, [focusNode]);

  useEffect(() => {
    if (livePhaseBurst) setBurstSeq((n) => n + 1);
  }, [livePhaseBurst]);

  const graph = useMemo(
    () =>
      buildThreeGraphModel({
        scene,
        personality,
        memoryCount,
        hasIntent,
        identityActive,
        evidenceActive,
        repairActive,
        reconditioningActive,
        visibleChildNodes,
        focusNode,
        valence,
        arousal,
        dominance,
        livePhaseBurst,
      }),
    [
      scene,
      personality,
      memoryCount,
      hasIntent,
      identityActive,
      evidenceActive,
      repairActive,
      reconditioningActive,
      visibleChildNodes,
      focusNode,
      valence,
      arousal,
      dominance,
      livePhaseBurst,
    ],
  );

  const selectedNode = graph.nodes.find((node) => node.id === selectedId) || graph.nodes[0];

  const linkedIds = useMemo(() => {
    const ids = new Set([selectedNode?.id || "core"]);
    for (const connection of graph.connections) {
      if (connection.sourceId === selectedNode?.id) ids.add(connection.targetId);
      if (connection.targetId === selectedNode?.id) ids.add(connection.sourceId);
    }
    return ids;
  }, [graph.connections, selectedNode?.id]);

  const selectedTarget = selectedNode?.position || [0, 0, 0];

  function handleSelect(node) {
    setSelectedId(node.id);
    if (["core", "memory", "intent", "identity", "evidence"].includes(node.id)) {
      setFocusNode?.(node.id);
    } else if (node.parentId) {
      setFocusNode?.(node.parentId);
    }
  }

  return (
    <div className="neural-three-shell neural-scene-camera" style={{ transform: "none" }}>
      <style>{threeSceneStyles}</style>
      <div className="neural-three-hint">3D Neural Core · click nodes to inspect and zoom</div>

      <Canvas camera={{ position: [0, 0.15, 6], fov: 48 }} onPointerMissed={() => setSelectedId("core")}>
        <color attach="background" args={[graph.moodState.background[0]]} />
        <fog attach="fog" args={[graph.moodState.background[1], 6, 14]} />
        <ambientLight intensity={0.38} />
        <pointLight position={[8, 8, 8]} intensity={1.4} color={graph.moodState.secondary} />
        <pointLight position={[-6, -4, 5]} intensity={0.8} color={graph.moodState.accent} />

        <Stars
          radius={28}
          depth={18}
          count={460}
          factor={3.2}
          saturation={0}
          fade
          speed={graph.moodState.speed * 0.5}
        />

        <CameraRig target={selectedTarget} speed={graph.moodState.speed} controlsRef={controlsRef} />

        <OrbitControls
          ref={controlsRef}
          enablePan={false}
          enableZoom
          minDistance={4.4}
          maxDistance={9.2}
          autoRotate
          autoRotateSpeed={0.35 * graph.moodState.speed}
        />

        <CompanionOrb moodState={graph.moodState} />

        {/* ── Synaptic connections with lightning + pulse dots ── */}
        {graph.connections.map((connection) => {
          const source = graph.nodeMap.get(connection.sourceId);
          const target = graph.nodeMap.get(connection.targetId);
          if (!source || !target) return null;

          const highlighted =
            connection.sourceId === selectedNode?.id ||
            connection.targetId === selectedNode?.id;

          return (
            <LightningConnection
              key={connection.key}
              start={source.position}
              end={target.position}
              color={connection.color}
              weight={connection.weight}
              highlighted={highlighted}
              activity={connection.weight}
            />
          );
        })}

        {/* ── Nodes with glow + pulse + fluid drift ── */}
        {graph.nodes.map((node) => (
          <GraphNode
            key={node.id}
            node={node}
            selectedId={selectedNode?.id}
            linkedIds={linkedIds}
            onSelect={handleSelect}
            livePhaseBurst={livePhaseBurst}
            burstSeq={burstSeq}
          />
        ))}

        {/* ── Bloom post-processing ── */}
        <EffectComposer>
          <Bloom
            intensity={1.35}
            luminanceThreshold={0.06}
            luminanceSmoothing={0.88}
            mipmapBlur
          />
        </EffectComposer>
      </Canvas>

      {selectedNode ? (
        <div className="neural-three-panel">
          <h5>{selectedNode.label}</h5>
          <p>{selectedNode.meta || "Active neural cluster"}</p>
          <div className="neural-three-meta">
            <span>{graph.moodState.mood}</span>
            <span>strength {selectedNode.strength.toFixed(2)}</span>
            <span>activity {selectedNode.activity.toFixed(2)}</span>
            <span>{selectedNode.connections.length} link{selectedNode.connections.length === 1 ? "" : "s"}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
