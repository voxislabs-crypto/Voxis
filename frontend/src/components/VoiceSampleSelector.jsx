import { useEffect, useRef, useState } from "react";
import { useAuthFetch } from "../hooks/useAuthFetch.js";

const voiceSampleStyles = `
  .voice-sample-shell {
    border: 1px solid rgba(0, 180, 255, 0.15);
    border-radius: 16px;
    background: rgba(2, 8, 20, 0.92);
    padding: 16px;
    margin-top: 16px;
  }

  .voice-sample-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 14px;
    padding-bottom: 10px;
    border-bottom: 1px solid rgba(0, 180, 255, 0.10);
  }

  .voice-sample-title {
    font-size: 0.92rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--accent);
    flex: 1;
  }

  .voice-sample-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
    margin-bottom: 14px;
  }

  .voice-sample-card {
    position: relative;
    padding: 12px;
    border: 2px solid rgba(0, 180, 255, 0.15);
    border-radius: 12px;
    background: rgba(0, 20, 40, 0.6);
    cursor: pointer;
    transition:
      border-color 160ms ease,
      background 160ms ease,
      box-shadow 160ms ease;
  }

  .voice-sample-card:hover {
    border-color: rgba(0, 180, 255, 0.35);
    background: rgba(0, 30, 60, 0.8);
    box-shadow: 0 0 12px rgba(0, 180, 255, 0.15);
  }

  .voice-sample-card.selected {
    border-color: rgba(0, 180, 255, 0.70);
    background: rgba(0, 50, 100, 0.4);
    box-shadow: 0 0 16px rgba(0, 180, 255, 0.30);
  }

  .voice-sample-card-check {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 18px;
    height: 18px;
    border: 2px solid rgba(0, 180, 255, 0.5);
    border-radius: 4px;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.7rem;
    color: var(--accent);
  }

  .voice-sample-card.selected .voice-sample-card-check {
    border-color: var(--accent);
    background: rgba(0, 180, 255, 0.15);
  }

  .voice-sample-info {
    margin-top: 6px;
  }

  .voice-sample-pitch {
    font-size: 0.75rem;
    color: var(--muted);
    margin: 2px 0;
    font-family: "JetBrains Mono", "Courier New", monospace;
  }

  .voice-sample-meta {
    display: flex;
    gap: 6px;
    margin-top: 8px;
    flex-wrap: wrap;
  }

  .voice-sample-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    background: rgba(0, 180, 255, 0.10);
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--accent);
    letter-spacing: 0.04em;
  }

  .voice-sample-audio {
    margin-top: 8px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .voice-sample-preview-btn {
    border: 1px solid rgba(0, 180, 255, 0.25);
    border-radius: 8px;
    background: rgba(0, 180, 255, 0.08);
    color: var(--accent);
    padding: 6px 10px;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    cursor: pointer;
  }

  .voice-sample-preview-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .voice-sample-preview-note {
    font-size: 0.72rem;
    color: var(--muted);
    font-family: "JetBrains Mono", "Courier New", monospace;
  }

  .voice-sample-actions {
    display: flex;
    gap: 8px;
    margin-top: 14px;
    border-top: 1px solid rgba(0, 180, 255, 0.10);
    padding-top: 12px;
  }

  .voice-sample-confirm-btn {
    flex: 1;
    padding: 9px 14px;
    border: none;
    border-radius: 8px;
    background: linear-gradient(135deg, var(--accent), rgba(0, 180, 255, 0.8));
    color: #fff;
    font-weight: 800;
    font-size: 0.8rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    cursor: pointer;
    transition: box-shadow 160ms ease, transform 100ms ease;
  }

  .voice-sample-confirm-btn:hover:not(:disabled) {
    box-shadow: 0 4px 14px rgba(0, 180, 255, 0.35);
    transform: translateY(-1px);
  }

  .voice-sample-confirm-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .voice-sample-status {
    padding: 10px;
    border-radius: 8px;
    font-size: 0.8rem;
    margin-top: 10px;
  }

  .voice-sample-status.success {
    background: rgba(74, 222, 128, 0.10);
    color: #4ade80;
    border: 1px solid rgba(74, 222, 128, 0.25);
  }

  .voice-sample-status.error {
    background: rgba(255, 87, 87, 0.10);
    color: #ff5757;
    border: 1px solid rgba(255, 87, 87, 0.25);
  }

  .voice-sample-loading {
    text-align: center;
    padding: 20px;
    color: var(--muted);
    font-size: 0.9rem;
  }

  .voice-sample-spinner {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid rgba(0, 180, 255, 0.25);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

/**
 * Voice Sample Selection Component
 * Displays extracted voice samples and allows user to select one
 */
export default function VoiceSampleSelector({
  personality,
  voiceSamples,
  isLoading,
  onSampleSelected,
  onStatus,
}) {
  const authFetch = useAuthFetch();
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const previewAudioRef = useRef(null);
  const stopPreviewTimerRef = useRef(null);
  const [previewingIndex, setPreviewingIndex] = useState(null);

  if (!voiceSamples || !voiceSamples.representatives || voiceSamples.representatives.length === 0) {
    return null;
  }

  const representatives = voiceSamples.representatives;

  function stopPreview() {
    if (stopPreviewTimerRef.current) {
      clearTimeout(stopPreviewTimerRef.current);
      stopPreviewTimerRef.current = null;
    }

    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
    }

    setPreviewingIndex(null);
  }

  useEffect(() => {
    return () => {
      stopPreview();
    };
  }, []);

  const getVoiceLabel = (sample) => {
    const centerSpectral = sample.spectralCentroid;
    if (centerSpectral < 3500) return "Deep/Bass";
    if (centerSpectral < 5500) return "Mid-Range";
    return "High/Treble";
  };

  const handleSelectSample = (index) => {
    setSelectedIndex(index);
    setStatusMessage("");
  };

  const handleConfirmSelection = async () => {
    if (selectedIndex === null || !personality) return;

    setIsConfirming(true);
    setStatusMessage("");

    try {
      const sample = representatives[selectedIndex];
      const response = await authFetch(`/personality/${personality.id}/voice-samples/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedSampleIndex: sample.clipIndex,
          voiceLabel: getVoiceLabel(sample),
          confidence: sample.confidence,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to confirm voice sample");
      }

      setStatusMessage({ type: "success", text: "Voice sample confirmed!" });
      if (onSampleSelected) {
        onSampleSelected(data.personality);
      }
      if (onStatus) {
        onStatus({ type: "success", message: "Voice sample confirmed and saved." });
      }
    } catch (error) {
      setStatusMessage({ type: "error", text: error.message });
      if (onStatus) {
        onStatus({ type: "error", message: `Error: ${error.message}` });
      }
    } finally {
      setIsConfirming(false);
    }
  };

  async function handlePreview(sample, index, event) {
    event.stopPropagation();

    if (!sample?.audioUrl) {
      return;
    }

    if (previewingIndex === index) {
      stopPreview();
      return;
    }

    stopPreview();

    if (!previewAudioRef.current) {
      previewAudioRef.current = new Audio();
    }

    const audio = previewAudioRef.current;
    audio.src = sample.audioUrl;
    audio.currentTime = 0;

    try {
      await audio.play();
      setPreviewingIndex(index);
      stopPreviewTimerRef.current = setTimeout(() => {
        stopPreview();
      }, 5000);
    } catch {
      setPreviewingIndex(null);
    }
  }

  if (isLoading) {
    return (
      <>
        <style>{voiceSampleStyles}</style>
        <div className="voice-sample-shell">
          <div className="voice-sample-loading">
            <div className="voice-sample-spinner"></div>
            <div style={{ marginTop: "8px" }}>Analyzing voice samples...</div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{voiceSampleStyles}</style>
      <div className="voice-sample-shell">
        <div className="voice-sample-header">
            <span className="voice-sample-title">Voice Samples</span>
          <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
            {representatives.length} sample{representatives.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="voice-sample-grid">
          {representatives.map((sample, index) => (
            <div
              key={index}
              className={`voice-sample-card ${selectedIndex === index ? "selected" : ""}`}
              onClick={() => handleSelectSample(index)}
            >
              <div className="voice-sample-card-check">{selectedIndex === index ? "OK" : ""}</div>

              <div className="voice-sample-info">
                <div style={{ fontSize: "0.8rem", fontWeight: "700", color: "var(--accent)" }}>
                  {getVoiceLabel(sample)}
                </div>
                <div className="voice-sample-pitch">
                  {sample.averagePitch.toFixed(0)} Hz | {sample.spectralCentroid.toFixed(0)} Hz spectral
                </div>
                <div className="voice-sample-meta">
                  <span className="voice-sample-badge">{sample.voiceQuality}</span>
                  <span className="voice-sample-badge">{(sample.confidence * 100).toFixed(0)}% conf</span>
                </div>
                {sample.audioUrl ? (
                  <div className="voice-sample-audio">
                    <button
                      type="button"
                      className="voice-sample-preview-btn"
                      onClick={(event) => void handlePreview(sample, index, event)}
                      disabled={isConfirming}
                    >
                      {previewingIndex === index ? "Stop" : "Play 5s"}
                    </button>
                    <span className="voice-sample-preview-note">5 second preview</span>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <div className="voice-sample-actions">
          <button
            className="voice-sample-confirm-btn"
            onClick={handleConfirmSelection}
            disabled={selectedIndex === null || isConfirming}
          >
            {isConfirming ? "Confirming..." : "Confirm Choice"}
          </button>
        </div>

        {statusMessage && (
          <div className={`voice-sample-status ${statusMessage.type}`}>
            {statusMessage.type === "success" ? "OK " : "ERR "}
            {statusMessage.text}
          </div>
        )}
      </div>
    </>
  );
}
