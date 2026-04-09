# Voxis TTS Evolution Checklist

Purpose: keep a single source of truth for the speaking stack roadmap so we can iterate, test, and circle back without losing momentum.

## Current State Summary

- Multi-engine runtime exists: cloud, piper, kokoro, elevenlabs, cartesia.
- Mood shaping exists: text stylization + voice parameter nudging.
- Prosody and voice-sample extraction exists and is persisted.
- Main gap: extracted prosody is not yet compiled into runtime synthesis behavior.

## Strategic Goal

Move from "styled text + TTS" to "personality speech rendering" where cadence, rhythm, and expression remain consistent across providers and fallback paths.

## Sprint A - Stability + Consistency (Quick Wins)

- [x] Centralize voice profile sanitization in one shared service.
- [x] Route all controllers to shared sanitizer.
- [x] Upgrade auto engine priority to quality-first order:
  - [x] elevenlabs -> cartesia -> cloud -> piper -> kokoro
- [x] Apply same order to auto fallback chain.
- [x] Add timeout wrappers for provider fetches.
- [x] Add bounded retry wrappers for provider fetches.
- [x] Tighten cloud configured detection to avoid false-positive configuration states.

## Sprint B - Prosody Compiler (Core Unlock)

- [ ] Introduce compile step between speech stylization and engine synthesis.
- [ ] Compiler input should include:
  - [ ] personality
  - [ ] mood state
  - [ ] speech hint / segment direction
  - [ ] prosody template
  - [ ] voice sample analysis
- [ ] Compiler output envelope should include:
  - [ ] target rate
  - [ ] pause profile
  - [ ] phrasing style
  - [ ] emphasis profile
  - [ ] intensity
  - [ ] confidence score
- [ ] Add safe fallback envelope when prosody data is missing.

## Sprint C - Engine Adapters

- [ ] ElevenLabs adapter: map envelope to speed/stability/style.
- [ ] Cartesia adapter: map envelope to pacing/timbre controls.
- [ ] Cloud adapter: map envelope to speed + instruction shaping.
- [ ] Piper adapter: map envelope to length_scale/noise/noise_w.
- [ ] Kokoro adapter: map envelope to voice/timing strategy.
- [ ] Add capability map so unsupported controls degrade gracefully.

## Sprint D - Semantic Safety for Stylization

- [ ] Add context-aware stylization guardrails for factual/technical turns.
- [ ] Preserve hedging words in precision contexts.
- [ ] Keep aggressive stylization for performance/roleplay contexts only.

## Sprint E - Telemetry + Diagnostics

- [ ] Per-turn telemetry:
  - [ ] chosen engine
  - [ ] fallback reason
  - [ ] synthesis latency
  - [ ] retry/timeout stats
  - [ ] prosody envelope summary
- [ ] Surface telemetry in diagnostics and Voice Lab debug area.

## Sprint F - Test Expansion

- [ ] Integration tests for fallback ordering and provider failover.
- [ ] Tests proving prosody extraction affects synthesis envelope.
- [ ] Regression tests for sanitizer parity across all controller entry points.
- [ ] Timeout/retry tests for provider catalog and synthesis paths.

## Design Principles (Keep These True)

- Identity over raw availability: fallback should preserve persona voice feel.
- One source of truth for input normalization.
- Engine-agnostic intent, engine-specific adaptation.
- Fail fast with useful diagnostics, not silent degradation.
- Keep behavior testable with deterministic envelope outputs.
