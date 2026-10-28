import { describe, expect, it, vi } from "vitest";

import {
  LIVEKIT_TURN_POLICY,
  containsWake,
  createLiveKitVoiceSession,
  endpointCommitDelayMs,
  runLiveKitPhoneScript,
  shouldInterrupt,
  stripWake,
} from "../services/livekitVoiceSession.js";

// Removed ChatWindow live-call policy, kept here so the comparison stays fixed.
// ChatWindow defaults were:
// silence auto-send 5000ms (clamped 3000–7000), mic stopped while audio plays,
// recognition restarted by the playback effect with no extra delay. The 220ms
// restart is only for a recognition that ends while already listening.
// No wake word and no barge-in. An utterance that starts during playback is dropped.
const LEGACY_LIVE_CALL = {
  silenceTimeoutMs: 5000,
  playbackRearmMs: 0,
  bargeIn: false,
};

const PHONE_SCRIPT = {
  brainMs: 300,
  audioDurationMs: 4000,
  opening: [
    { text: "hey voxis", durationMs: 700 },
    { gapMs: 800 },
    { text: "what is the harbor plan", durationMs: 1500 },
  ],
  barge: {
    atPlaybackMs: 1000,
    durationMs: 900,
    text: "wait hold on",
  },
};

function runLegacyPhoneScript(script) {
  let clock = 0;
  let draft = "";
  let lastSpeechEnd = null;
  const calls = [];

  for (const act of script.opening) {
    if (Number.isFinite(act.gapMs)) {
      clock += act.gapMs;
      continue;
    }
    clock += act.durationMs;
    draft = [draft, act.text].filter(Boolean).join(" ").trim();
    lastSpeechEnd = clock;
  }

  const dispatchAt = lastSpeechEnd + LEGACY_LIVE_CALL.silenceTimeoutMs;
  calls.push({
    at: dispatchAt,
    transcript: draft,
    silenceToDispatchMs: LEGACY_LIVE_CALL.silenceTimeoutMs,
  });

  const playbackStart = dispatchAt + script.brainMs;
  const playbackEnd = playbackStart + script.audioDurationMs + LEGACY_LIVE_CALL.playbackRearmMs;
  const bargeStart = playbackStart + script.barge.atPlaybackMs;
  const duringPlayback = bargeStart < playbackEnd;
  const utteranceKept = !duringPlayback || LEGACY_LIVE_CALL.bargeIn;
  const recoveryMs = utteranceKept
    ? (bargeStart + script.barge.durationMs + LEGACY_LIVE_CALL.silenceTimeoutMs) - bargeStart
    : playbackEnd - bargeStart;

  return {
    provider: "browser-live-call",
    turnLatencyMs: calls[0].silenceToDispatchMs,
    calls,
    interruption: {
      recoveryMs,
      utteranceKept,
    },
    playback: { start: playbackStart, end: playbackEnd },
  };
}

function comparePhoneSessions(script = PHONE_SCRIPT) {
  const legacy = runLegacyPhoneScript(script);
  const livekit = runLiveKitPhoneScript(script);
  return {
    legacy,
    livekit,
    livekitWins: {
      latency: livekit.turnLatencyMs < legacy.turnLatencyMs,
      interruption: livekit.interruption.utteranceKept
        && livekit.interruption.recoveryMs < legacy.interruption.recoveryMs,
    },
  };
}

describe("phone session comparison", () => {
  it("gives the same script a faster turn and a recovered interruption on LiveKit", () => {
    const report = comparePhoneSessions();

    expect(report).toEqual({
      legacy: {
        provider: "browser-live-call",
        turnLatencyMs: 5000,
        calls: [
          {
            at: 8000,
            transcript: "hey voxis what is the harbor plan",
            silenceToDispatchMs: 5000,
          },
        ],
        interruption: {
          recoveryMs: 3000,
          utteranceKept: false,
        },
        playback: { start: 8300, end: 12300 },
      },
      livekit: {
        provider: "livekit-agents",
        turnLatencyMs: 500,
        calls: [
          {
            at: 3500,
            transcript: "what is the harbor plan",
            silenceToDispatchMs: 500,
          },
          {
            at: 6200,
            transcript: "wait hold on",
            silenceToDispatchMs: 500,
          },
        ],
        interruption: {
          recoveryMs: 500,
          utteranceKept: true,
          interruptAt: 5300,
        },
        playback: { start: 3800, end: 7800 },
      },
      livekitWins: {
        latency: true,
        interruption: true,
      },
    });
    expect(endpointCommitDelayMs(LIVEKIT_TURN_POLICY)).toBe(500);
    expect(report.livekit.turnLatencyMs).toBeLessThan(report.legacy.turnLatencyMs);
    expect(report.livekit.interruption.recoveryMs).toBeLessThan(report.legacy.interruption.recoveryMs);
  });

  it("keeps a short cough from cutting off playback", () => {
    expect(shouldInterrupt({
      speechMs: 200,
      wordCount: 1,
      interruption: LIVEKIT_TURN_POLICY.interruption,
    })).toBe(false);
    expect(shouldInterrupt({
      speechMs: 900,
      wordCount: 3,
      interruption: LIVEKIT_TURN_POLICY.interruption,
    })).toBe(true);
  });

  it("does not call the brain before the wake phrase, and barge-in keeps the new line", async () => {
    vi.useFakeTimers();
    const turn = vi.fn(async ({ transcript }) => ({
      text: `echo ${transcript}`,
      audioUrl: "/api/internal/voice-audio/scripted",
    }));
    const interrupts = [];
    const session = createLiveKitVoiceSession({
      turn,
      onInterrupt: () => interrupts.push(true),
    });

    session.noteTranscript({ text: "what time is it", final: true });
    await vi.advanceTimersByTimeAsync(4000);
    expect(turn).not.toHaveBeenCalled();

    expect(containsWake("hey voxis", LIVEKIT_TURN_POLICY.wakePhrase)).toBe(true);
    expect(stripWake("hey voxis what is the harbor plan", "hey voxis")).toBe("what is the harbor plan");
    session.noteTranscript({ text: "hey voxis", final: true });
    await vi.advanceTimersByTimeAsync(1000);
    expect(turn).not.toHaveBeenCalled();

    session.noteTranscript({ text: "what is the harbor plan", final: true });
    await vi.advanceTimersByTimeAsync(499);
    expect(turn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(turn).toHaveBeenCalledTimes(1);
    expect(turn.mock.calls[0][0].transcript).toBe("what is the harbor plan");

    session.noteTranscript({ text: "uh", final: true });
    await vi.advanceTimersByTimeAsync(2000);
    expect(interrupts).toHaveLength(0);
    expect(turn).toHaveBeenCalledTimes(1);

    session.noteTranscript({ text: "wait", final: false });
    await vi.advanceTimersByTimeAsync(499);
    expect(interrupts).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(interrupts).toHaveLength(1);

    session.noteTranscript({ text: "wait hold on", final: true });
    await vi.advanceTimersByTimeAsync(500);
    expect(turn).toHaveBeenCalledTimes(2);
    expect(turn.mock.calls[1][0].transcript).toBe("wait hold on");
    expect(turn.mock.calls[1][0].messages).toEqual([
      { role: "user", content: "what is the harbor plan" },
      { role: "assistant", content: "echo what is the harbor plan" },
    ]);

    session.stop();
    vi.useRealTimers();
  });
});
