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
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\bvox\s+is\b/g, "voxis")
    .replace(/\s+/g, " ")
    .trim();
}

// Spoken stand-ins for the canonical "hey voxis" wake. These are whole phrases
// only: bare "box", "boxes", "boxis", and "ara" stay ordinary words.
const VOXIS_WAKE = "hey voxis";
const VOXIS_WAKE_PHRASES = [
  "hey boxes",
  "hey boxis",
  "hey box",
  "hey ara",
  "hey focus",
];
const VOXIS_WAKE_TOKENS = ["focus"];

function isVoxisWake(wake) {
  return wake === VOXIS_WAKE;
}

function applyVoxisAliases(normalized, wake) {
  if (!isVoxisWake(wake)) {
    return normalized;
  }
  let text = normalized;
  for (const phrase of VOXIS_WAKE_PHRASES) {
    const pattern = new RegExp(`\\b${phrase.split(" ").join("\\s+")}\\b`, "g");
    text = text.replace(pattern, VOXIS_WAKE);
  }
  return text.replace(/\s+/g, " ").trim();
}

function wakeTokenPattern(token) {
  if (token === "voxis") {
    return "vox(?:is|\\s+is)";
  }
  return escapeRegExp(token);
}

function voxisAliasSource() {
  const phrases = VOXIS_WAKE_PHRASES.map((phrase) => (
    `\\b${phrase.split(" ").map(escapeRegExp).join("\\W+")}\\b`
  ));
  const tokens = VOXIS_WAKE_TOKENS.map((token) => `\\b${escapeRegExp(token)}\\b`);
  return [...phrases, ...tokens].join("|");
}

function wakeExpression(phrase) {
  const wake = normalizePhrase(phrase);
  if (!wake) {
    return null;
  }
  const canonical = wake.split(" ").map(wakeTokenPattern).join("\\W+");
  const source = isVoxisWake(wake) ? `(?:${canonical}|${voxisAliasSource()})` : canonical;
  return new RegExp(source, "ig");
}

function containsWakeToken(text, token) {
  return new RegExp(`\\b${escapeRegExp(token)}\\b`, "i").test(text);
}

export function containsWake(text, phrase) {
  const normalized = normalizePhrase(text);
  const wake = normalizePhrase(phrase);
  if (!normalized || !wake) {
    return false;
  }
  const heard = applyVoxisAliases(normalized, wake);
  if (heard.includes(wake)) {
    return true;
  }
  const name = wake.split(" ").pop();
  if (name && name.length >= 4 && new RegExp(`\\b${wakeTokenPattern(name)}\\b`, "i").test(heard)) {
    return true;
  }
  return isVoxisWake(wake) && VOXIS_WAKE_TOKENS.some((token) => containsWakeToken(normalized, token));
}

export function stripWake(text, phrase) {
  const pattern = wakeExpression(phrase);
  if (!pattern) {
    return String(text || "").trim();
  }
  return String(text || "")
    .replace(pattern, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s,!.?:;]+/, "")
    .trim();
}

// Words spoken before the wake stay out of the turn. "hello hello focus open
// the door" keeps "open the door" and drops the greeting.
export function textAfterWake(text, phrase) {
  const source = String(text || "");
  const pattern = wakeExpression(phrase);
  if (!pattern) {
    return source.trim();
  }
  const match = pattern.exec(source);
  if (!match) {
    return null;
  }
  return source
    .slice(match.index + match[0].length)
    .replace(/\s+/g, " ")
    .replace(/^[\s,!.?:;]+/, "")
    .trim();
}

// Browser SpeechRecognition marks isFinal at the first short pause, and on
// Chrome it then ends the session. That gap is not the user going quiet.
// The live call keeps collecting until this much silence passes while the
// recognizer is actually listening, then sends one final transcript.
export const LIVE_CALL_ENDPOINT_SILENCE_MS = 1000;

function normalizeEchoText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Playback leaks into the mic. The assistant's own line, including the first
// words of it, is echo. A short new phrase is the caller talking over the reply.
export function isAssistantEcho(heard, reply) {
  const spokenWords = normalizeEchoText(heard).split(" ").filter(Boolean);
  const answerWords = normalizeEchoText(reply).split(" ").filter(Boolean);
  if (!spokenWords.length || !answerWords.length) {
    return false;
  }
  const spoken = spokenWords.join(" ");
  const answer = answerWords.join(" ");
  if (answerWords.slice(0, spokenWords.length).join(" ") === spoken) {
    return true;
  }
  return spokenWords.length >= 3 && answer.includes(spoken);
}

export function createLiveCallHearing({
  silenceMs = LIVE_CALL_ENDPOINT_SILENCE_MS,
  onTranscript,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
} = {}) {
  let heard = "";
  let live = "";
  let timer = null;
  let settled = false;

  function hypothesis() {
    return [heard, live].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }

  function clearSilence() {
    if (timer != null) {
      clearTimer(timer);
      timer = null;
    }
  }

  function armSilence() {
    clearSilence();
    timer = setTimer(() => {
      timer = null;
      emit(true);
    }, silenceMs);
  }

  function emit(final) {
    const text = hypothesis();
    if (!text) {
      return;
    }
    if (final && settled) {
      return;
    }
    settled = Boolean(final);
    onTranscript?.({ text, final: Boolean(final) });
  }

  return {
    hypothesis,
    pushResults(results) {
      const parts = [];
      const length = Number(results?.length || 0);
      for (let index = 0; index < length; index += 1) {
        const piece = String(results[index]?.[0]?.transcript || "").trim();
        if (piece) {
          parts.push(piece);
        }
      }
      live = parts.join(" ");
      if (!hypothesis()) {
        return;
      }
      settled = false;
      emit(false);
      armSilence();
    },
    finishSegment() {
      // The recognizer stopped. Do not let the silence clock run out while
      // nobody is listening, or a short phrase becomes the whole turn.
      clearSilence();
      if (!live) {
        return;
      }
      heard = hypothesis();
      live = "";
    },
    resumeListening() {
      if (settled || !hypothesis()) {
        return;
      }
      armSilence();
    },
    reset() {
      clearSilence();
      heard = "";
      live = "";
      settled = false;
    },
  };
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
  onUnrecognized,
  onDraft,
  policy: policyInput,
  now = () => Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
} = {}) {
  const policy = resolvePolicy(policyInput);
  const wakePhrase = policy.wakePhrase;
  let awake = !wakePhrase;
  let stripWakeFromUtterance = Boolean(String(wakePhrase || "").trim());
  let phase = awake ? "listening" : "idle";
  let pending = "";
  let history = [];
  let speechStartedAt = null;
  let utteranceFinal = false;
  let endpointTimer = null;
  let interruptTimer = null;
  let falseTimer = null;
  let turnToken = 0;
  let activeTranscript = "";
  let wakeLead = "";
  let stopped = false;
  let inputHeld = false;

  function startsWithLead(text) {
    return Boolean(wakeLead) && text.toLowerCase().startsWith(wakeLead.toLowerCase());
  }

  function rememberWakeLead(text) {
    const pattern = wakeExpression(wakePhrase);
    if (!pattern) {
      return text.trim();
    }
    const match = pattern.exec(text);
    if (!match) {
      return null;
    }
    wakeLead = text.slice(0, match.index + match[0].length);
    return textAfterWake(text, wakePhrase);
  }

  function commandFromTranscript(text) {
    let incoming = String(text || "");
    // The opening line can carry everything said before the wake. Cut once
    // at that wake, and keep cutting while the recognizer is still repeating
    // that same buffered line. Later sentences only lose the wake word itself.
    if (!wakeLead || startsWithLead(incoming)) {
      const after = rememberWakeLead(incoming);
      if (after != null) {
        incoming = after;
      }
    }
    if (stripWakeFromUtterance && containsWake(incoming, wakePhrase)) {
      incoming = stripWake(incoming, wakePhrase);
    }
    return incoming.replace(/\s+/g, " ").trim();
  }

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
    activeTranscript = transcript;
    if (!transcript || !awake || stopped) {
      activeTranscript = "";
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
        moodState: result?.moodState || null,
        moodLabel: result?.moodLabel || null,
        emotionFrame: result?.emotionFrame || null,
      });
    } catch (error) {
      if (stopped || token !== turnToken) {
        return;
      }
      emitPhase("listening");
      onError?.(error);
    }
  }

  function holdInput() {
    inputHeld = true;
    clearEndpoint();
    clearInterruptWatch();
    pending = "";
    speechStartedAt = null;
    utteranceFinal = false;
  }

  function releaseInput() {
    inputHeld = false;
  }

  function discardBarge() {
    if (phase !== "speaking" && phase !== "thinking") {
      return;
    }
    clearInterruptWatch();
    clearEndpoint();
    pending = "";
    speechStartedAt = null;
    utteranceFinal = false;
  }

  function noteTranscript({ text, final = false, at, speechMs } = {}) {
    if (stopped || inputHeld) {
      return;
    }
    const incoming = String(text || "").trim();
    if (!incoming) {
      return;
    }
    const stamp = Number.isFinite(at) ? at : now();

    if (!awake) {
      if (!containsWake(incoming, wakePhrase)) {
        if (final) {
          onUnrecognized?.(incoming);
        }
        onDraft?.({ text: "" });
        return;
      }
      awake = true;
      emitPhase("listening");
    }

    const command = commandFromTranscript(incoming);
    onDraft?.({ text: command });
    if (!command) {
      pending = "";
      speechStartedAt = null;
      utteranceFinal = false;
      clearEndpoint();
      return;
    }

    if (phase === "thinking") {
      if (command === activeTranscript) {
        return;
      }
      // The caller was still going when the short phrase was sent. Drop that
      // turn and keep the longer line instead of talking over them.
      clearInterruptWatch();
      activeTranscript = "";
      pending = command;
      speechStartedAt = stamp;
      utteranceFinal = Boolean(final);
      turnToken += 1;
      emitPhase("listening");
      onInterrupt?.();
      if (final) {
        scheduleEndpoint(true);
      } else {
        clearEndpoint();
      }
      return;
    }

    const assistantBusy = phase === "speaking";
    if (speechStartedAt == null) {
      speechStartedAt = stamp;
      utteranceFinal = false;
      if (assistantBusy) {
        armInterruptWatch();
      }
    }

    pending = command;
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
        wordCount: wordCount(command),
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
    activeTranscript = "";
    wakeLead = "";
    awake = !wakePhrase;
    inputHeld = false;
    emitPhase("idle");
  }

  onPhase?.(phase);

  return {
    noteTranscript,
    notifyPlaybackEnded,
    holdInput,
    releaseInput,
    discardBarge,
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
