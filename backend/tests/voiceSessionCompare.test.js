import { describe, expect, it, vi } from "vitest";

import {
  LIVEKIT_TURN_POLICY,
  LIVE_CALL_ENDPOINT_SILENCE_MS,
  containsWake,
  createLiveCallHearing,
  createLiveKitVoiceSession,
  endpointCommitDelayMs,
  isAssistantEcho,
  runLiveKitPhoneScript,
  shouldInterrupt,
  stripWake,
  textAfterWake,
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
    const unrecognized = [];
    const session = createLiveKitVoiceSession({
      turn,
      onInterrupt: () => interrupts.push(true),
      onUnrecognized: (heard) => unrecognized.push(heard),
    });

    session.noteTranscript({ text: "what time", final: false });
    session.noteTranscript({ text: "what time is it", final: true });
    await vi.advanceTimersByTimeAsync(4000);
    expect(turn).not.toHaveBeenCalled();
    expect(unrecognized).toEqual(["what time is it"]);

    expect(containsWake("hey voxis", LIVEKIT_TURN_POLICY.wakePhrase)).toBe(true);
    expect(containsWake("Hey, Voxis", LIVEKIT_TURN_POLICY.wakePhrase)).toBe(true);
    expect(containsWake("hey vox is", LIVEKIT_TURN_POLICY.wakePhrase)).toBe(true);
    expect(stripWake("hey voxis what is the harbor plan", "hey voxis")).toBe("what is the harbor plan");
    expect(stripWake("Hey, Voxis, what is the harbor plan", "hey voxis")).toBe("what is the harbor plan");
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

  it("accepts voxis pronunciation aliases and focus, and ignores bare short names", async () => {
    const phrase = LIVEKIT_TURN_POLICY.wakePhrase;

    expect(containsWake("hey voxis", phrase)).toBe(true);
    expect(containsWake("Hey, Voxis", phrase)).toBe(true);
    expect(containsWake("hey vox is", phrase)).toBe(true);
    expect(containsWake("voxis", phrase)).toBe(true);
    expect(containsWake("hey boxes", phrase)).toBe(true);
    expect(containsWake("hey box", phrase)).toBe(true);
    expect(containsWake("hey boxis", phrase)).toBe(true);
    expect(containsWake("hey ara", phrase)).toBe(true);
    expect(containsWake("Hey, Ara", phrase)).toBe(true);
    expect(containsWake("hey focus", phrase)).toBe(true);
    expect(containsWake("Focus", phrase)).toBe(true);
    expect(containsWake("ara", phrase)).toBe(false);
    expect(containsWake("box", phrase)).toBe(false);
    expect(containsWake("boxes", phrase)).toBe(false);
    expect(containsWake("boxis", phrase)).toBe(false);
    expect(containsWake("focused on the plan", phrase)).toBe(false);
    expect(containsWake("hey ara", "hello there")).toBe(false);
    expect(containsWake("focus", "hello there")).toBe(false);

    expect(stripWake("hey voxis what is the harbor plan", phrase)).toBe("what is the harbor plan");
    expect(stripWake("Hey, Voxis, what is the harbor plan", phrase)).toBe("what is the harbor plan");
    expect(stripWake("hey vox is what is the harbor plan", phrase)).toBe("what is the harbor plan");
    expect(stripWake("hey boxes what is the harbor plan", phrase)).toBe("what is the harbor plan");
    expect(stripWake("hey box, what is the harbor plan", phrase)).toBe("what is the harbor plan");
    expect(stripWake("hey boxis, what is the harbor plan", phrase)).toBe("what is the harbor plan");
    expect(stripWake("Hey, Ara, what is the harbor plan", phrase)).toBe("what is the harbor plan");
    expect(stripWake("hey focus what is the harbor plan", phrase)).toBe("what is the harbor plan");
    expect(stripWake("Focus, what is the harbor plan", phrase)).toBe("what is the harbor plan");
    expect(textAfterWake("hello hello hello focus open the door", phrase)).toBe("open the door");
    expect(textAfterWake("hello, hello. Focus, open the door", phrase)).toBe("open the door");
    expect(textAfterWake("hello hello hello", phrase)).toBeNull();

    vi.useFakeTimers();
    const turn = vi.fn(async ({ transcript }) => ({ text: `echo ${transcript}`, audioUrl: "/a" }));
    const unrecognized = [];
    const session = createLiveKitVoiceSession({
      turn,
      onUnrecognized: (heard) => unrecognized.push(heard),
    });

    for (const text of ["what time is it", "ara", "box", "boxes"]) {
      session.noteTranscript({ text, final: true });
    }
    await vi.advanceTimersByTimeAsync(4000);
    expect(turn).not.toHaveBeenCalled();
    expect(unrecognized).toEqual(["what time is it", "ara", "box", "boxes"]);

    session.noteTranscript({ text: "hey ara what is the harbor plan", final: true });
    await vi.advanceTimersByTimeAsync(499);
    expect(turn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(turn).toHaveBeenCalledTimes(1);
    expect(turn.mock.calls[0][0].transcript).toBe("what is the harbor plan");

    session.stop();
    vi.useRealTimers();

    vi.useFakeTimers();
    const focusTurn = vi.fn(async () => ({ text: "ok", audioUrl: "/a" }));
    const focusSession = createLiveKitVoiceSession({ turn: focusTurn });
    focusSession.noteTranscript({ text: "Focus, open the door", final: true });
    await vi.advanceTimersByTimeAsync(500);
    expect(focusTurn).toHaveBeenCalledTimes(1);
    expect(focusTurn.mock.calls[0][0].transcript).toBe("open the door");
    focusSession.stop();
    vi.useRealTimers();
  });

  it("keeps collecting speech after an early browser final and strips the wake from the growing line", async () => {
    vi.useFakeTimers();
    const emitted = [];
    const hearing = createLiveCallHearing({
      silenceMs: LIVE_CALL_ENDPOINT_SILENCE_MS,
      onTranscript: (utterance) => emitted.push(utterance),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (id) => clearTimeout(id),
    });

    hearing.pushResults([
      { 0: { transcript: "hey voxis tell" }, isFinal: true },
    ]);
    expect(emitted).toEqual([{ text: "hey voxis tell", final: false }]);
    await vi.advanceTimersByTimeAsync(LIVE_CALL_ENDPOINT_SILENCE_MS - 1);
    expect(emitted).toHaveLength(1);

    hearing.pushResults([
      { 0: { transcript: "hey voxis tell me the harbor plan" }, isFinal: true },
    ]);
    expect(emitted.at(-1)).toEqual({
      text: "hey voxis tell me the harbor plan",
      final: false,
    });
    await vi.advanceTimersByTimeAsync(LIVE_CALL_ENDPOINT_SILENCE_MS);
    expect(emitted.at(-1)).toEqual({
      text: "hey voxis tell me the harbor plan",
      final: true,
    });

    hearing.finishSegment();
    hearing.pushResults([
      { 0: { transcript: "and the dock" }, isFinal: false },
    ]);
    expect(emitted.at(-1)).toEqual({
      text: "hey voxis tell me the harbor plan and the dock",
      final: false,
    });
    hearing.reset();
    await vi.advanceTimersByTimeAsync(LIVE_CALL_ENDPOINT_SILENCE_MS);
    expect(emitted.at(-1).final).toBe(false);

    const gap = [];
    const gapped = createLiveCallHearing({
      onTranscript: (utterance) => gap.push(utterance),
    });
    gapped.pushResults([
      { 0: { transcript: "focus tell me about" }, isFinal: true },
    ]);
    await vi.advanceTimersByTimeAsync(400);
    gapped.finishSegment();
    await vi.advanceTimersByTimeAsync(LIVE_CALL_ENDPOINT_SILENCE_MS);
    expect(gap.every((item) => item.final === false)).toBe(true);
    gapped.resumeListening();
    await vi.advanceTimersByTimeAsync(LIVE_CALL_ENDPOINT_SILENCE_MS - 1);
    expect(gap.at(-1).final).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(gap.at(-1)).toEqual({ text: "focus tell me about", final: true });
    gapped.resumeListening();
    await vi.advanceTimersByTimeAsync(LIVE_CALL_ENDPOINT_SILENCE_MS);
    expect(gap.filter((item) => item.final)).toHaveLength(1);

    const turn = vi.fn(async () => ({ text: "ok", audioUrl: "/a" }));
    const session = createLiveKitVoiceSession({ turn });
    session.noteTranscript({ text: "focus", final: true });
    await vi.advanceTimersByTimeAsync(1000);
    expect(turn).not.toHaveBeenCalled();

    session.noteTranscript({ text: "hey boxes tell", final: false });
    await vi.advanceTimersByTimeAsync(500);
    expect(turn).not.toHaveBeenCalled();
    session.noteTranscript({ text: "hey boxes tell me the harbor plan", final: true });
    await vi.advanceTimersByTimeAsync(500);
    expect(turn).toHaveBeenCalledTimes(1);
    expect(turn.mock.calls[0][0].transcript).toBe("tell me the harbor plan");

    await Promise.resolve();
    session.notifyPlaybackEnded();
    session.noteTranscript({ text: "focus the camera", final: true });
    await vi.advanceTimersByTimeAsync(500);
    expect(turn).toHaveBeenCalledTimes(2);
    expect(turn.mock.calls[1][0].transcript).toBe("the camera");

    await Promise.resolve();
    session.notifyPlaybackEnded();
    session.noteTranscript({ text: "focus", final: true });
    await vi.advanceTimersByTimeAsync(1000);
    expect(turn).toHaveBeenCalledTimes(2);

    session.stop();
    vi.useRealTimers();
  });

  it("drops speech from before the wake word and does not send it with the command", async () => {
    vi.useFakeTimers();
    const drafts = [];
    const turn = vi.fn(() => new Promise(() => {}));
    const unrecognized = [];
    const session = createLiveKitVoiceSession({
      turn,
      onDraft: ({ text }) => drafts.push(text),
      onUnrecognized: (heard) => unrecognized.push(heard),
    });

    session.noteTranscript({ text: "hello hello hello", final: false });
    session.noteTranscript({ text: "hello hello hello", final: true });
    await vi.advanceTimersByTimeAsync(2000);
    expect(turn).not.toHaveBeenCalled();
    expect(unrecognized).toEqual(["hello hello hello"]);
    expect(drafts.at(-1)).toBe("");

    session.noteTranscript({ text: "hello hello hello focus open the door", final: true });
    expect(drafts.at(-1)).toBe("open the door");
    await vi.advanceTimersByTimeAsync(500);
    expect(turn).toHaveBeenCalledTimes(1);
    expect(turn.mock.calls[0][0].transcript).toBe("open the door");
    expect(session.getPhase()).toBe("thinking");

    session.noteTranscript({ text: "hello hello hello focus open the door please", final: true });
    expect(drafts.at(-1)).toBe("open the door please");
    await vi.advanceTimersByTimeAsync(500);
    expect(turn).toHaveBeenCalledTimes(2);
    expect(turn.mock.calls[1][0].transcript).toBe("open the door please");

    session.stop();
    vi.useRealTimers();
  });

  it("cancels a short in-flight turn when the caller keeps talking", async () => {
    vi.useFakeTimers();
    let finishFirst;
    const turn = vi.fn(({ transcript }) => new Promise((resolve) => {
      if (transcript === "hello there") {
        finishFirst = resolve;
        return;
      }
      resolve({ text: "full", audioUrl: "/a" });
    }));
    const interrupts = [];
    const session = createLiveKitVoiceSession({
      turn,
      onInterrupt: () => interrupts.push("stop"),
      policy: { wakePhrase: "" },
    });

    session.noteTranscript({ text: "hello there", final: true });
    await vi.advanceTimersByTimeAsync(500);
    expect(turn).toHaveBeenCalledTimes(1);
    expect(session.getPhase()).toBe("thinking");

    session.noteTranscript({ text: "hello there", final: true });
    await vi.advanceTimersByTimeAsync(2000);
    expect(interrupts).toHaveLength(0);
    expect(turn).toHaveBeenCalledTimes(1);

    session.noteTranscript({ text: "hello there friend how are you", final: false });
    expect(interrupts).toEqual(["stop"]);
    expect(session.getPhase()).toBe("listening");
    session.noteTranscript({ text: "hello there friend how are you", final: true });
    await vi.advanceTimersByTimeAsync(500);
    expect(turn).toHaveBeenCalledTimes(2);
    expect(turn.mock.calls[1][0].transcript).toBe("hello there friend how are you");
    expect(session.getPhase()).toBe("speaking");

    finishFirst?.({ text: "short", audioUrl: "/a" });
    await vi.advanceTimersByTimeAsync(0);
    expect(session.getPhase()).toBe("speaking");

    session.stop();
    vi.useRealTimers();
  });

  it("treats the assistant line as echo and a short barge-in as the caller", () => {
    const reply = "Morning Kai. You are still out there.";
    expect(isAssistantEcho("Morning", reply)).toBe(true);
    expect(isAssistantEcho("morning kai you are still", reply)).toBe(true);
    expect(isAssistantEcho("still out there", reply)).toBe(true);
    expect(isAssistantEcho("wait", reply)).toBe(false);
    expect(isAssistantEcho("hold on", reply)).toBe(false);
    expect(isAssistantEcho("you are wrong", reply)).toBe(false);
  });

  it("drops microphone text while input is held so playback cannot barge in on itself", async () => {
    vi.useFakeTimers();
    const turn = vi.fn(async () => ({ text: "reply", audioUrl: "/a" }));
    const interrupts = [];
    const session = createLiveKitVoiceSession({
      turn,
      onInterrupt: () => interrupts.push(true),
      policy: { wakePhrase: "" },
    });

    session.holdInput();
    session.noteTranscript({ text: "this is the speaker leaking into the mic", final: true });
    await vi.advanceTimersByTimeAsync(3000);
    expect(turn).not.toHaveBeenCalled();
    expect(interrupts).toHaveLength(0);

    session.releaseInput();
    session.noteTranscript({ text: "what is the harbor plan", final: true });
    await vi.advanceTimersByTimeAsync(500);
    expect(turn).toHaveBeenCalledTimes(1);
    expect(turn.mock.calls[0][0].transcript).toBe("what is the harbor plan");

    session.stop();
    vi.useRealTimers();
  });
});
