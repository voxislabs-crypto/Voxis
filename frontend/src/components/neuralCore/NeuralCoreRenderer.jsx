/**
 * NeuralCoreRenderer — renderer boundary abstraction.
 *
 * Accepts a `rendererType` prop ("svg" | "force-graph") plus the full scene
 * props contract shared by all renderers, and delegates to the matching
 * implementation. This is the single swap point for v0.3 when
 * react-force-graph-2d lands for Scientist mode.
 *
 * Kids Mode always receives "svg" from NeuralCore and is never affected
 * by a renderer swap.
 *
 * Scene props contract (all renderers must accept these):
 *   compact, performanceTier, kidsMode, repairActive, reconditioningActive,
 *   scene, stars, primarySprouts, focusedSprouts, memoryCount, hasIntent,
 *   identityActive, evidenceActive, focusPos, visibleChildNodes,
 *   cameraTranslateX, cameraTranslateY, cameraScale, coreSize, palette,
 *   glowSize, heatGlow, valence, arousal, dominance, personality,
 *   focusNode, setFocusNode, citationIssue, citationValid
 */
import NeuralCoreSvgScene from "./NeuralCoreSvgScene.jsx";
import NeuralCoreForceGraphStub from "./NeuralCoreForceGraphStub.jsx";

export default function NeuralCoreRenderer({ rendererType = "svg", ...sceneProps }) {
  if (rendererType === "force-graph") {
    return <NeuralCoreForceGraphStub {...sceneProps} />;
  }
  return <NeuralCoreSvgScene {...sceneProps} />;
}
