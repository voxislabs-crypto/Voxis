import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, Line, OrbitControls, Stars } from "@react-three/drei";
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

function smoothLerpAlpha(delta, speed = 5) {
  return 1 - Math.exp(-delta * speed);
}

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

  useFrame((state) => {
    if (!groupRef.current) {
      return;
    }

    const t = state.clock.elapsedTime;
    groupRef.current.position.y = 2.15 + Math.sin(t * 1.1) * 0.12;
    groupRef.current.rotation.z = Math.sin(t * 0.5) * 0.08;
  });

  return (
    <group ref={groupRef} position={[3, 2.15, -1.2]}>
      <mesh>
        <sphereGeometry args={[0.38, 32, 32]} />
        <meshStandardMaterial
          color={moodState.secondary}
          emissive={moodState.accent}
          emissiveIntensity={1.8}
          transparent
          opacity={0.9}
          roughness={0.22}
        />
      </mesh>
      <mesh position={[-0.1, 0.04, 0.28]}>
        <sphereGeometry args={[0.05, 16, 16]} />
        <meshStandardMaterial color="#ddffff" emissive="#9af4ff" emissiveIntensity={2.4} />
      </mesh>
      <mesh position={[0.1, 0.04, 0.28]}>
        <sphereGeometry args={[0.05, 16, 16]} />
        <meshStandardMaterial color="#ddffff" emissive="#9af4ff" emissiveIntensity={2.4} />
      </mesh>
    </group>
  );
}

function ConnectionLine({ start, end, color, weight, highlighted }) {
  const ref = useRef(null);

  useFrame((state) => {
    if (!ref.current?.material) {
      return;
    }

    const pulse = 0.22 + Math.sin(state.clock.elapsedTime * (highlighted ? 3.2 : 1.4)) * 0.08;
    ref.current.material.opacity = Math.min(0.95, pulse + weight * 0.38 + (highlighted ? 0.18 : 0));
  });

  return (
    <Line
      ref={ref}
      points={[start, end]}
      color={color}
      lineWidth={highlighted ? 2.2 : 1.25}
      transparent
      opacity={0.55}
    />
  );
}

function GraphNode({ node, selectedId, linkedIds, onSelect, speed }) {
  const meshRef = useRef(null);
  const basePosition = useMemo(() => new THREE.Vector3(...node.position), [node.position]);
  const driftOffset = useMemo(() => Math.random() * Math.PI * 2, []);
  const isSelected = node.id === selectedId;
  const isLinked = linkedIds.has(node.id);

  useFrame((state) => {
    if (!meshRef.current) {
      return;
    }

    const t = state.clock.elapsedTime * (0.7 + speed);
    meshRef.current.position.x = basePosition.x + Math.cos(t + driftOffset) * 0.045;
    meshRef.current.position.y = basePosition.y + Math.sin(t * 1.15 + driftOffset) * 0.055;

    const pulse = 0.95 + Math.sin(t * 2.4 + driftOffset) * 0.12 + node.activity * 0.32 + (isSelected ? 0.44 : 0);
    meshRef.current.material.emissiveIntensity = pulse;

    const targetScale = isSelected ? 1.16 : isLinked ? 1.06 : 1;
    meshRef.current.scale.lerp(
      new THREE.Vector3(targetScale, targetScale, targetScale),
      0.08,
    );
  });

  const radius = 0.2 + node.strength * 0.3;

  return (
    <group onClick={(event) => {
      event.stopPropagation();
      onSelect(node);
    }}>
      <mesh ref={meshRef} position={node.position}>
        <sphereGeometry args={[radius, 32, 32]} />
        <meshStandardMaterial
          color={node.color}
          emissive={node.color}
          emissiveIntensity={1.1 + node.activity * 0.45}
          roughness={0.25}
          metalness={0.2}
        />
      </mesh>
      <Html position={[node.position[0], node.position[1] - radius - 0.18, node.position[2]]} center>
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

  useEffect(() => {
    setSelectedId(focusNode || "core");
  }, [focusNode]);

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
      if (connection.sourceId === selectedNode?.id) {
        ids.add(connection.targetId);
      }
      if (connection.targetId === selectedNode?.id) {
        ids.add(connection.sourceId);
      }
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
        <ambientLight intensity={0.42} />
        <pointLight position={[8, 8, 8]} intensity={1.2} color={graph.moodState.secondary} />
        <pointLight position={[-6, -4, 5]} intensity={0.7} color={graph.moodState.accent} />
        <Stars radius={28} depth={18} count={460} factor={3.2} saturation={0} fade speed={graph.moodState.speed * 0.5} />
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

        {graph.connections.map((connection) => {
          const source = graph.nodeMap.get(connection.sourceId);
          const target = graph.nodeMap.get(connection.targetId);
          if (!source || !target) {
            return null;
          }

          const highlighted = connection.sourceId === selectedNode?.id || connection.targetId === selectedNode?.id;
          return (
            <ConnectionLine
              key={connection.key}
              start={source.position}
              end={target.position}
              color={connection.color}
              weight={connection.weight}
              highlighted={highlighted}
            />
          );
        })}

        {graph.nodes.map((node) => (
          <GraphNode
            key={node.id}
            node={node}
            selectedId={selectedNode?.id}
            linkedIds={linkedIds}
            onSelect={handleSelect}
            speed={graph.moodState.speed}
          />
        ))}
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
