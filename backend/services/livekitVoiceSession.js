// LiveKit Agents turn contract for the phone path.
// Defaults match LiveKit's VAD turn handling (endpointing min 500ms / max 3000ms,
// interruption on, min duration 500ms, min words 0, false-interruption 2000ms,
// resume on, preemptive TTS off). This module never imports the LLM, mood,
// memory, or TTS stack. The only brain contact is the injected `turn` function,
// which callers point at POST /api/internal/voice-turn.

export const LIVEKIT_TURN_POLICY = {
  provider: "livekit-agents",
  wakePhrase: "hey voxis",
  endpointing: {
    minDelayMs: 500,
    maxDelayMs: 3000,
    mode: "vad",
  },
  interruption: {
    enabled: true,
    mode: "vad",
    minDurationMs: 500,
    minWords: 0,
    falseInterruptionTimeoutMs: 2000,
    resumeFalseInterruption: true,
  },
  preemptiveGeneration: true,
  preemptiveTts: false,
};

export function endpointCommitDelayMs(policy = LIVEKIT_TURN_POLICY) {
  const minDelay = Number(policy?.endpointing?.minDelayMs);
  const maxDelay = Number(policy?.endpointing?.maxDelayMs);
  const mode = String(policy?.endpointing?.mode || "vad");
  if (mode === "vad" || mode === "fixed") {
    return Math.min(minDelay, maxDelay);
  }
  return maxDelay;
}

export function shouldInterrupt({ speechMs, wordCount, interruption }) {
  if (!interruption?.enabled) {
    return false;
  }
  if (Number(speechMs) < Number(interruption.minDurationMs)) {
    return false;
  }
  if (Number(wordCount) < Number(interruption.minWords)) {
    return false;
  }
  return true;
}

export function wordCount(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePhrase(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function containsWake(text, phrase) {
  const normalized = normalizePhrase(text);
  const wake = normalizePhrase(phrase);
  if (!normalized || !wake) {
    return false;
  }
  return normalized.includes(wake);
}

export function stripWake(text, phrase) {
  const wake = normalizePhrase(phrase);
  if (!wake) {
    return String(text || "").trim();
  }
  return String(text || "")
    .replace(new RegExp(escapeRegExp(wake), "ig"), " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolvePolicy(policy) {
  return {
    ...LIVEKIT_TURN_POLICY,
    ...policy,
    endpointing: {
      ...LIVEKIT_TURN_POLICY.endpointing,
      ...(policy?.endpointing || {}),
    },
    interruption: {
      ...LIVEKIT_TURN_POLICY.interruption,
      ...(policy?.interruption || {}),
    },
  };
}

// Real-time session used by a mic client. `turn` is the only way out to Voxis.
export function createLiveKitVoiceSession({
  turn,
  onPhase,
  onPlayback,
  onInterrupt,
  onError,
  policy: policyInput,
  now = () => Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
} = {}) {
  const policy = resolvePolicy(policyInput);
  const wakePhrase = policy.wakePhrase;
  let awake = !wakePhrase;
  let phase = awake ? "listening" : "idle";
  let pending = "";
  let history = [];
  let speechStartedAt = null;
  let utteranceFinal = false;
  let endpointTimer = null;
  let interruptTimer = null;
  let falseTimer = null;
  let turnToken = 0;
  let stopped = false;

  function emitPhase(next) {
    phase = next;
    onPhase?.(next);
  }

  function clearEndpoint() {
    if (endpointTimer != null) {
      clearTimer(endpointTimer);
      endpointTimer = null;
    }
  }

  function clearInterruptWatch() {
    if (interruptTimer != null) {
      clearTimer(interruptTimer);
      interruptTimer = null;
    }
    if (falseTimer != null) {
      clearTimer(falseTimer);
      falseTimer = null;
    }
  }

  function scheduleEndpoint(final) {
    clearEndpoint();
    const delay = final ? endpointCommitDelayMs(policy) : policy.endpointing.maxDelayMs;
    endpointTimer = setTimer(() => {
      endpointTimer = null;
      speechStartedAt = null;
      utteranceFinal = false;
      void commitTurn();
    }, delay);
  }

  function interruptNow() {
    if (phase !== "speaking" && phase !== "thinking") {
      return false;
    }
    clearEndpoint();
    turnToken += 1;
    emitPhase("listening");
    onInterrupt?.();
    if (utteranceFinal && pending.trim()) {
      scheduleEndpoint(true);
    }
    return true;
  }

  function armInterruptWatch() {
    clearInterruptWatch();
    if (!policy.interruption.enabled) {
      return;
    }
    if (phase !== "speaking" && phase !== "thinking") {
      return;
    }
    interruptTimer = setTimer(() => {
      interruptTimer = null;
      const elapsed = now() - (speechStartedAt ?? now());
      const words = wordCount(pending);
      if (shouldInterrupt({
        speechMs: elapsed,
        wordCount: words,
        interruption: policy.interruption,
      })) {
        interruptNow();
        return;
      }
      if (elapsed >= policy.interruption.minDurationMs && words < policy.interruption.minWords) {
        falseTimer = setTimer(() => {
          falseTimer = null;
          if (wordCount(pending) >= policy.interruption.minWords) {
            return;
          }
          pending = "";
          speechStartedAt = null;
          utteranceFinal = false;
        }, policy.interruption.falseInterruptionTimeoutMs);
      }
    }, policy.interruption.minDurationMs);
  }

  async function commitTurn() {
    const transcript = pending.trim();
    pending = "";
    speechStartedAt = null;
    utteranceFinal = false;
    if (!transcript || !awake || stopped) {
      return;
    }
    if (phase === "speaking" || phase === "thinking") {
      return;
    }

    const token = ++turnToken;
    const messages = history.slice();
    emitPhase("thinking");
    try {
      const result = await turn({ transcript, messages });
      if (stopped || token !== turnToken) {
        return;
      }
      history = [
        ...messages,
        { role: "user", content: transcript },
        { role: "assistant", content: String(result?.text || "") },
      ].slice(-40);
      emitPhase("speaking");
      onPlayback?.({
        audioUrl: result?.audioUrl || "",
        text: String(result?.text || ""),
      });
    } catch (error) {
      if (stopped || token !== turnToken) {
        return;
      }
      emitPhase("listening");
      onError?.(error);
    }
  }

  function noteTranscript({ text, final = false, at, speechMs } = {}) {
    if (stopped) {
      return;
    }
    const incoming = String(text || "").trim();
    if (!incoming) {
      return;
    }
    const stamp = Number.isFinite(at) ? at : now();

    if (!awake) {
      if (!containsWake(incoming, wakePhrase)) {
        return;
      }
      awake = true;
      const rest = stripWake(incoming, wakePhrase);
      pending = rest;
      speechStartedAt = rest ? stamp : null;
      utteranceFinal = Boolean(final && rest);
      emitPhase("listening");
      if (rest && final) {
        scheduleEndpoint(true);
      }
      return;
    }

    const assistantBusy = phase === "speaking" || phase === "thinking";
    if (speechStartedAt == null) {
      speechStartedAt = stamp;
      utteranceFinal = false;
      if (assistantBusy) {
        armInterruptWatch();
      }
    }

    pending = incoming;
    if (final) {
      utteranceFinal = true;
    }

    if (assistantBusy) {
      const elapsed = Math.max(stamp - speechStartedAt, Number(speechMs) || 0);
      if (final && elapsed < policy.interruption.minDurationMs) {
        clearInterruptWatch();
        pending = "";
        speechStartedAt = null;
        utteranceFinal = false;
        return;
      }
      if (final && shouldInterrupt({
        speechMs: elapsed,
        wordCount: wordCount(incoming),
        interruption: policy.interruption,
      })) {
        interruptNow();
      }
      return;
    }

    if (final) {
      scheduleEndpoint(true);
    } else {
      scheduleEndpoint(false);
    }
  }

  function notifyPlaybackEnded() {
    if (stopped) {
      return;
    }
    clearInterruptWatch();
    if (phase === "speaking") {
      emitPhase("listening");
    }
    if (utteranceFinal && pending.trim() && phase === "listening") {
      scheduleEndpoint(true);
    }
  }

  function stop() {
    stopped = true;
    turnToken += 1;
    clearEndpoint();
    clearInterruptWatch();
    pending = "";
    speechStartedAt = null;
    utteranceFinal = false;
    awake = !wakePhrase;
    emitPhase("idle");
  }

  onPhase?.(phase);

  return {
    noteTranscript,
    notifyPlaybackEnded,
    stop,
    getPhase: () => phase,
  };
}

// Deterministic phone script. Brain time is applied to the playback clock and
// is not included in silence-to-dispatch latency. Preemptive generation does
// not move the commit earlier than the VAD endpoint delay, so a cancelled
// utterance cannot start a brain call.
export function runLiveKitPhoneScript(script, policyInput = LIVEKIT_TURN_POLICY) {
  const policy = resolvePolicy(policyInput);
  const delay = endpointCommitDelayMs(policy);
  let clock = 0;
  let awake = !policy.wakePhrase;
  let pending = "";
  let lastSpeechEnd = null;
  const calls = [];

  function takeSpeech(text, durationMs) {
    clock += durationMs;
    if (!awake) {
      const combined = [pending, text].filter(Boolean).join(" ");
      if (!containsWake(combined, policy.wakePhrase)) {
        return;
      }
      awake = true;
      pending = stripWake(combined, policy.wakePhrase);
      lastSpeechEnd = pending ? clock : null;
      return;
    }
    pending = [pending, text].filter(Boolean).join(" ").trim();
    lastSpeechEnd = clock;
  }

  function finishOpeningTurn() {
    if (!awake || !pending || lastSpeechEnd == null || calls.length > 0) {
      return;
    }
    const dispatchAt = lastSpeechEnd + delay;
    calls.push({
      at: dispatchAt,
      transcript: pending,
      silenceToDispatchMs: dispatchAt - lastSpeechEnd,
    });
    pending = "";
    clock = dispatchAt;
  }

  for (const act of script.opening) {
    if (Number.isFinite(act.gapMs)) {
      const target = clock + act.gapMs;
      if (awake && pending && lastSpeechEnd != null) {
        const dispatchAt = lastSpeechEnd + delay;
        if (dispatchAt <= target && calls.length === 0) {
          calls.push({
            at: dispatchAt,
            transcript: pending,
            silenceToDispatchMs: dispatchAt - lastSpeechEnd,
          });
          pending = "";
          lastSpeechEnd = null;
        }
      }
      clock = target;
      continue;
    }
    takeSpeech(act.text, act.durationMs);
  }

  finishOpeningTurn();

  const first = calls[0];
  const playbackStart = first.at + script.brainMs;
  const playbackEnd = playbackStart + script.audioDurationMs;
  const bargeStart = playbackStart + script.barge.atPlaybackMs;
  const bargeEnd = bargeStart + script.barge.durationMs;
  const speechMs = script.barge.durationMs;
  const words = wordCount(script.barge.text);
  const interruptAt = bargeStart + policy.interruption.minDurationMs;
  const overlapsPlayback = bargeStart < playbackEnd && interruptAt < playbackEnd;
  const utteranceKept = overlapsPlayback && shouldInterrupt({
    speechMs,
    wordCount: words,
    interruption: policy.interruption,
  }) && interruptAt <= bargeEnd;
  const recoveryMs = utteranceKept ? interruptAt - bargeStart : Math.max(0, playbackEnd - bargeStart);

  if (utteranceKept) {
    calls.push({
      at: bargeEnd + delay,
      transcript: script.barge.text,
      silenceToDispatchMs: delay,
    });
  }

  return {
    provider: policy.provider,
    turnLatencyMs: first.silenceToDispatchMs,
    calls,
    interruption: {
      recoveryMs,
      utteranceKept,
      interruptAt: utteranceKept ? interruptAt : null,
    },
    playback: { start: playbackStart, end: playbackEnd },
  };
}
