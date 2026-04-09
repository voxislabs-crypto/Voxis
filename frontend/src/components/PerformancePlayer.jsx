/**
 * PerformancePlayer
 *
 * Consumes the NDJSON stream from POST /personality/:id/performance and
 * orchestrates:
 *   1. Background mood loops (Web Audio API — runs entirely client-side)
 *   2. TTS audio segments (queued and played in order as they arrive)
 *   3. Live UI state: current segment, mood, progress, timeline
 *
 * Usage:
 *   <PerformancePlayer
 *     personalityId={personality.id}
 *     text={epfText}
 *     voiceProfile={voiceProfile}
 *     onClose={() => setPerformanceText(null)}
 *   />
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthFetch } from "../hooks/useAuthFetch.js";

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = `
  .epf-player {
    position: fixed;
    inset: 0;
    z-index: 1200;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    background: rgba(0, 0, 0, 0.88);
    backdrop-filter: blur(12px);
    padding: 0 0 32px;
    animation: epfFadeIn 320ms ease;
  }

  @keyframes epfFadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  .epf-card {
    width: min(680px, 96vw);
    border-radius: 24px;
    border: 1px solid rgba(0, 234, 255, 0.18);
    background: linear-gradient(180deg, rgba(3, 10, 22, 0.98), rgba(2, 7, 18, 0.96));
    box-shadow: 0 0 48px rgba(0, 200, 255, 0.10), 0 24px 64px rgba(0,0,0,0.6);
    overflow: hidden;
  }

  .epf-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 22px 14px;
    border-bottom: 1px solid rgba(0, 234, 255, 0.08);
    background: rgba(0, 234, 255, 0.03);
  }

  .epf-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(0, 234, 255, 0.70);
  }

  .epf-live-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #00eaff;
    box-shadow: 0 0 10px #00eaff;
    animation: epfDotPulse 1s ease-in-out infinite;
  }

  .epf-live-dot.paused { background: #888; box-shadow: none; animation: none; }

  @keyframes epfDotPulse {
    0%, 100% { transform: scale(0.8); opacity: 0.6; }
    50%       { transform: scale(1.2); opacity: 1.0; }
  }

  .epf-close {
    padding: 6px 12px;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.12);
    background: transparent;
    color: rgba(255,255,255,0.50);
    font-size: 0.78rem;
    font-weight: 700;
    cursor: pointer;
  }

  .epf-close:hover { color: #fff; border-color: rgba(255,255,255,0.30); }

  .epf-timeline {
    padding: 16px 22px 0;
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .epf-seg-chip {
    padding: 5px 10px;
    border-radius: 999px;
    border: 1px solid rgba(0, 234, 255, 0.10);
    background: rgba(0, 234, 255, 0.04);
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.10em;
    text-transform: uppercase;
    color: rgba(0, 234, 255, 0.35);
    transition: all 200ms ease;
    cursor: default;
  }

  .epf-seg-chip.active {
    border-color: rgba(0, 234, 255, 0.55);
    background: rgba(0, 234, 255, 0.12);
    color: #00eaff;
    box-shadow: 0 0 12px rgba(0, 200, 255, 0.24);
  }

  .epf-seg-chip.done {
    border-color: rgba(0, 234, 255, 0.20);
    color: rgba(0, 234, 255, 0.45);
    background: rgba(0, 234, 255, 0.06);
  }

  .epf-mood-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 22px 0;
  }

  .epf-mood-label {
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(0, 234, 255, 0.40);
    min-width: 70px;
  }

  .epf-mood-track {
    flex: 1;
    height: 3px;
    border-radius: 999px;
    background: rgba(0, 234, 255, 0.08);
    overflow: hidden;
  }

  .epf-mood-fill {
    height: 100%;
    border-radius: 999px;
    transition: width 600ms ease, background 600ms ease;
  }

  .epf-lyrics-box {
    min-height: 88px;
    padding: 18px 22px 14px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    justify-content: flex-end;
  }

  .epf-lyric-line {
    font-size: 1.05rem;
    line-height: 1.6;
    color: rgba(255,255,255,0.85);
    transition: opacity 200ms ease;
  }

  .epf-lyric-line.dim { opacity: 0.28; }
  .epf-lyric-line.current {
    color: #fff;
    font-weight: 700;
    text-shadow: 0 0 24px rgba(0, 200, 255, 0.35);
  }

  .epf-controls {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 22px 18px;
    border-top: 1px solid rgba(0, 234, 255, 0.07);
    background: rgba(0, 234, 255, 0.02);
  }

  .epf-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 1px solid rgba(0, 234, 255, 0.22);
    background: rgba(0, 234, 255, 0.07);
    color: #88ecff;
    font-size: 1.1rem;
    cursor: pointer;
    transition: background 150ms, box-shadow 150ms;
    flex-shrink: 0;
  }

  .epf-btn:hover { background: rgba(0, 234, 255, 0.14); box-shadow: 0 0 12px rgba(0,200,255,0.22); }
  .epf-btn:disabled { opacity: 0.35; cursor: not-allowed; }

  .epf-progress-track {
    flex: 1;
    height: 4px;
    border-radius: 999px;
    background: rgba(0, 234, 255, 0.08);
    overflow: hidden;
  }

  .epf-progress-fill {
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, #00c8ff, #b043f5);
    transition: width 300ms linear;
  }

  .epf-music-vol {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 0.68rem;
    color: rgba(0, 234, 255, 0.38);
    font-weight: 700;
    letter-spacing: 0.08em;
  }

  .epf-music-vol input[type="range"] {
    width: 64px;
    accent-color: #00c8ff;
  }

  .epf-status {
    font-size: 0.7rem;
    color: rgba(0, 234, 255, 0.38);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-weight: 700;
  }

  .epf-loading {
    padding: 32px;
    text-align: center;
    color: rgba(0, 234, 255, 0.45);
    font-size: 0.82rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    font-weight: 700;
  }
`;

// ── Mood → visual config ───────────────────────────────────────────────────
const MOOD_CONFIG = {
  ambient:   { color: "#4db8ff", progress: 0.20, label: "Ambient" },
  hype:      { color: "#ff6b35", progress: 0.65, label: "Hype" },
  chorus:    { color: "#b043f5", progress: 0.85, label: "Chorus" },
  breakdown: { color: "#4affb0", progress: 0.35, label: "Breakdown" },
  outro:     { color: "#888",    progress: 0.10, label: "Outro" },
};

// ── Web Audio mood loop engine ─────────────────────────────────────────────
class MoodLoopEngine {
  constructor() {
    this.ctx = null;
    this.manifest = null;
    this.buffers = {};          // url → AudioBuffer  (keyed by file URL, not mood)
    this.playedIndexes = {};    // mood → Set<index>  (tracks recently used to avoid repeats)
    this.currentSource = null;
    this.currentGain = null;
    this.currentMood = null;
    this.currentBpm = null;     // BPM of currently playing loop (for playbackRate normalisation)
    this.masterGain = null;
    this.volume = 0.55;
    this.ready = false;
  }

  async init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      const resp = await fetch("/api/loops/manifest");
      this.manifest = await resp.json();
      this.ready = true;
    } catch {
      // Web Audio unavailable — degrade gracefully; TTS still works
      this.ready = false;
    }
  }

  async _loadBuffer(url) {
    if (this.buffers[url]) return this.buffers[url];
    try {
      const resp = await fetch(url);
      const arrayBuffer = await resp.arrayBuffer();
      const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
      this.buffers[url] = audioBuffer;
      return audioBuffer;
    } catch {
      return null;
    }
  }

  // ── Loop selection ──────────────────────────────────────────────────────
  // Score a loop entry against the EPF audioDirection text using tag/name
  // keyword overlap. Zero-latency, no API calls.
  _scoreLoop(entry, audioDirectionText) {
    if (!audioDirectionText || !entry) return 0;
    const haystack = [
      ...(entry.tags || []),
      entry.freesoundName || "",
    ].join(" ").toLowerCase();
    const needles = (audioDirectionText.toLowerCase().match(/\b\w{4,}\b/g) || []);
    let score = 0;
    for (const word of needles) {
      if (haystack.includes(word)) score++;
    }
    return score;
  }

  // Pick the best loop candidate for a mood, preferring unplayed entries and
  // highest audioDirection keyword match.
  _pickLoop(mood, audioDirectionText) {
    const candidates = this.manifest?.loops?.[mood];
    if (!candidates?.length) return null;

    const played = this.playedIndexes[mood] || new Set();
    const scored = candidates.map((entry, i) => ({
      entry,
      i,
      score: this._scoreLoop(entry, audioDirectionText),
      fresh: !played.has(i),
    }));

    // Sort: unplayed first, then higher NLP score
    scored.sort((a, b) => {
      if (a.fresh !== b.fresh) return a.fresh ? -1 : 1;
      return b.score - a.score;
    });

    const winner = scored[0];
    if (!this.playedIndexes[mood]) this.playedIndexes[mood] = new Set();
    this.playedIndexes[mood].add(winner.i);
    // Reset rotation when all entries have been played (keep last to avoid immediate repeat)
    if (this.playedIndexes[mood].size >= candidates.length) {
      this.playedIndexes[mood] = new Set([winner.i]);
    }
    return winner.entry;
  }

  async switchMood(mood, fadeDurationMs = 800, audioDirection = null) {
    if (!this.ready || !this.ctx) return;
    if (this.currentMood === mood) return;
    this.currentMood = mood;

    const entry = this._pickLoop(mood, audioDirection);
    if (!entry) return;

    const buffer = await this._loadBuffer(entry.file);

    const fadeSecs = (fadeDurationMs || 800) / 1000;
    const now = this.ctx.currentTime;

    // Fade out old source
    if (this.currentGain) {
      this.currentGain.gain.setTargetAtTime(0, now, fadeSecs / 3);
      const oldGain = this.currentGain;
      const oldSource = this.currentSource;
      setTimeout(() => {
        try { oldSource?.stop(); } catch {}
        try { oldGain?.disconnect(); } catch {}
      }, fadeDurationMs + 100);
    }

    if (!buffer) return;

    // BPM normalisation — adjust playbackRate so tempo transitions feel smooth.
    // Clamped to ±8% to avoid audible pitch artefacts.
    let playbackRate = 1.0;
    if (this.currentBpm && entry.bpm && this.currentBpm !== entry.bpm) {
      const ratio = this.currentBpm / entry.bpm;
      playbackRate = Math.max(0.92, Math.min(1.08, ratio));
    }
    this.currentBpm = entry.bpm || null;

    // Fade in new source
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.setTargetAtTime(this.manifest?.musicVolumeMultiplier ?? 0.55, now, fadeSecs / 3);
    gain.connect(this.masterGain);

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = playbackRate;
    source.connect(gain);
    source.start();

    this.currentGain = gain;
    this.currentSource = source;
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    }
  }

  stop() {
    try { this.currentSource?.stop(); } catch {}
    try { this.currentGain?.disconnect(); } catch {}
    this.currentSource = null;
    this.currentGain = null;
    this.currentMood = null;
  }

  destroy() {
    this.stop();
    try { this.ctx?.close(); } catch {}
    this.ctx = null;
    this.ready = false;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function PerformancePlayer({ personalityId, text, voiceProfile, onClose }) {
  const authFetch = useAuthFetch();

  const [status, setStatus] = useState("loading"); // loading | playing | paused | done | error
  const [script, setScript] = useState(null);
  const [activeSegmentId, setActiveSegmentId] = useState(null);
  const [doneSegmentIds, setDoneSegmentIds] = useState(new Set());
  const [currentLine, setCurrentLine] = useState("");
  const [prevLine, setPrevLine] = useState("");
  const [currentMood, setCurrentMood] = useState("ambient");
  const [progress, setProgress] = useState(0);
  const [musicVolume, setMusicVolume] = useState(0.55);
  const [error, setError] = useState(null);

  const loopEngineRef = useRef(null);
  const audioQueueRef = useRef([]);   // { audioBase64, contentType, segmentId, lineIndex, text }
  const isPlayingRef = useRef(false);
  const pausedRef = useRef(false);
  const currentAudioRef = useRef(null); // HTMLAudioElement
  const abortRef = useRef(null);
  const totalLinesRef = useRef(0);
  const playedLinesRef = useRef(0);

  // ── Init loop engine ─────────────────────────────────────────
  useEffect(() => {
    loopEngineRef.current = new MoodLoopEngine();
    loopEngineRef.current.init();
    return () => loopEngineRef.current?.destroy();
  }, []);

  // ── Audio queue player ───────────────────────────────────────
  const playNext = useCallback(() => {
    if (pausedRef.current) return;
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      return;
    }

    const item = audioQueueRef.current.shift();
    setActiveSegmentId(item.segmentId);
    setCurrentLine(item.text || "");

    const blob = base64ToBlob(item.audioBase64, item.contentType);
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudioRef.current = audio;

    audio.onended = () => {
      URL.revokeObjectURL(url);
      playedLinesRef.current += 1;
      setProgress(totalLinesRef.current > 0 ? playedLinesRef.current / totalLinesRef.current : 0);
      setPrevLine(item.text || "");
      playNext();
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      playedLinesRef.current += 1;
      playNext();
    };
    audio.play().catch(() => {
      URL.revokeObjectURL(url);
      playNext();
    });
  }, []);

  const enqueue = useCallback((item) => {
    audioQueueRef.current.push(item);
    if (!isPlayingRef.current && !pausedRef.current) {
      isPlayingRef.current = true;
      playNext();
    }
  }, [playNext]);

  // ── Stream fetch ─────────────────────────────────────────────
  useEffect(() => {
    if (!text || !personalityId) return;

    const abortController = new AbortController();
    abortRef.current = abortController;

    (async () => {
      try {
        setStatus("loading");
        const resp = await authFetch(`/personality/${personalityId}/performance`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voiceProfile }),
          signal: abortController.signal,
        });

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({ error: "Performance request failed." }));
          setError(err.error || "Performance request failed.");
          setStatus("error");
          return;
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        setStatus("playing");

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop(); // keep incomplete line

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const msg = JSON.parse(trimmed);
              handleStreamMessage(msg);
            } catch {
              // Malformed chunk — skip
            }
          }
        }

        setStatus((s) => s === "playing" ? "done" : s);
        loopEngineRef.current?.stop();
      } catch (err) {
        if (err.name === "AbortError") return;
        setError(err.message || "Playback failed.");
        setStatus("error");
      }
    })();

    return () => {
      abortController.abort();
      currentAudioRef.current?.pause();
      loopEngineRef.current?.stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, personalityId]);

  function handleStreamMessage(msg) {
    switch (msg.type) {
      case "script": {
        setScript(msg.script);
        const total = msg.script.segments.reduce((acc, s) => acc + s.dialogueLines.length, 0);
        totalLinesRef.current = total;
        break;
      }
      case "segment": {
        setCurrentMood(msg.moodLoop || "ambient");
        loopEngineRef.current?.switchMood(msg.moodLoop || "ambient", undefined, msg.audioDirection || null);
        setActiveSegmentId(msg.segmentId);
        break;
      }
      case "audio": {
        enqueue({
          audioBase64: msg.audioBase64,
          contentType: msg.contentType,
          segmentId: msg.segmentId,
          lineIndex: msg.lineIndex,
          text: msg.text || "",
        });
        break;
      }
      case "done": {
        // Mark the last segment done once queue drains
        const drainChecker = setInterval(() => {
          if (audioQueueRef.current.length === 0 && !isPlayingRef.current) {
            clearInterval(drainChecker);
            setStatus("done");
            setDoneSegmentIds((prev) => {
              if (!script) return prev;
              const all = new Set(script.segments.map((s) => s.id));
              return all;
            });
          }
        }, 200);
        break;
      }
      case "error":
      case "audio_error": {
        console.warn("[EPF]", msg.error);
        break;
      }
    }
  }

  // ── Controls ─────────────────────────────────────────────────
  const togglePause = useCallback(() => {
    if (status === "playing") {
      pausedRef.current = true;
      currentAudioRef.current?.pause();
      loopEngineRef.current?.stop();
      setStatus("paused");
    } else if (status === "paused") {
      pausedRef.current = false;
      currentAudioRef.current?.play().catch(() => {});
      if (currentMood) loopEngineRef.current?.switchMood(currentMood);
      setStatus("playing");
      if (audioQueueRef.current.length > 0 && !isPlayingRef.current) {
        isPlayingRef.current = true;
        playNext();
      }
    }
  }, [status, currentMood, playNext]);

  const handleVolumeChange = useCallback((e) => {
    const vol = Number(e.target.value);
    setMusicVolume(vol);
    loopEngineRef.current?.setVolume(vol);
  }, []);

  const moodConf = MOOD_CONFIG[currentMood] || MOOD_CONFIG.ambient;
  const segmentIds = script?.segments?.map((s) => s.id) || [];

  return (
    <>
      <style>{styles}</style>
      <div className="epf-player" role="dialog" aria-label="Performance playback">
        <div className="epf-card">
          {/* Header */}
          <div className="epf-header">
            <div className="epf-title">
              <div className={`epf-live-dot${status === "paused" || status === "done" ? " paused" : ""}`} />
              EPF Performance
              {script && <span style={{ color: "rgba(0,234,255,0.30)", fontWeight: 400 }}>
                &nbsp;· v{script.version} · {script.segments?.length || 0} segments
              </span>}
            </div>
            <button className="epf-close" onClick={onClose}>✕ Close</button>
          </div>

          {status === "error" && (
            <div className="epf-loading" style={{ color: "#ff6b6b" }}>
              {error || "Playback error."}
            </div>
          )}

          {status === "loading" && (
            <div className="epf-loading">Synthesising performance…</div>
          )}

          {status !== "loading" && status !== "error" && (
            <>
              {/* Segment timeline chips */}
              {segmentIds.length > 0 && (
                <div className="epf-timeline">
                  {segmentIds.map((id) => (
                    <div
                      key={id}
                      className={`epf-seg-chip${id === activeSegmentId ? " active" : doneSegmentIds.has(id) ? " done" : ""}`}
                    >
                      {id}
                    </div>
                  ))}
                </div>
              )}

              {/* Mood bar */}
              <div className="epf-mood-bar">
                <div className="epf-mood-label">{moodConf.label}</div>
                <div className="epf-mood-track">
                  <div
                    className="epf-mood-fill"
                    style={{ width: `${moodConf.progress * 100}%`, background: moodConf.color }}
                  />
                </div>
              </div>

              {/* Live lyrics */}
              <div className="epf-lyrics-box">
                {prevLine && <div className="epf-lyric-line dim">{prevLine}</div>}
                {currentLine && <div className="epf-lyric-line current">{currentLine}</div>}
                {!currentLine && !prevLine && status === "playing" && (
                  <div className="epf-lyric-line dim" style={{ fontStyle: "italic" }}>
                    Preparing audio…
                  </div>
                )}
                {status === "done" && (
                  <div className="epf-lyric-line dim" style={{ fontStyle: "italic", opacity: 0.50 }}>
                    Performance complete.
                  </div>
                )}
              </div>

              {/* Playback controls */}
              <div className="epf-controls">
                <button
                  className="epf-btn"
                  onClick={togglePause}
                  disabled={status === "done" || status === "loading"}
                  title={status === "paused" ? "Resume" : "Pause"}
                >
                  {status === "paused" ? "▶" : "⏸"}
                </button>

                <div className="epf-progress-track">
                  <div className="epf-progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>

                <div className="epf-music-vol" title="Background music volume">
                  🎵
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={musicVolume}
                    onChange={handleVolumeChange}
                  />
                </div>

                <div className="epf-status">{status}</div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ── Utility ────────────────────────────────────────────────────────────────────
function base64ToBlob(b64, contentType) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: contentType });
}
