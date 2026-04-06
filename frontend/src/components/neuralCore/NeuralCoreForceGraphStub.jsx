import NeuralCoreThreeScene from "./NeuralCoreThreeScene.jsx";

/**
 * NeuralCoreForceGraphStub now hosts the first interactive 3D Neural Core pass.
 *
 * The scene keeps the same renderer boundary contract as the SVG renderer, but
 * swaps in a React Three Fiber view so the redesign branch can experiment
 * safely with a more cinematic, data-reactive graph.
 */
export default function NeuralCoreForceGraphStub(sceneProps) {
  return <NeuralCoreThreeScene {...sceneProps} />;
}
