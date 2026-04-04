/**
 * NeuralCoreForceGraphStub — v0.3 placeholder.
 *
 * This component will be replaced by a react-force-graph-2d implementation
 * in the Scientist Mode v0.3 pass. It receives the same sceneProps contract
 * as NeuralCoreSvgScene so the boundary swap is a one-line change in
 * NeuralCoreRenderer once the real graph is ready.
 */
export default function NeuralCoreForceGraphStub() {
  return (
    <div
      className="neural-scene-camera"
      style={{ display: "grid", placeItems: "center" }}
    >
      <span
        style={{
          color: "#8ddfff",
          fontSize: "0.82rem",
          fontWeight: 700,
          letterSpacing: "0.06em",
          opacity: 0.55,
          textTransform: "uppercase",
        }}
      >
        Force-graph renderer — v0.3 (coming soon)
      </span>
    </div>
  );
}
