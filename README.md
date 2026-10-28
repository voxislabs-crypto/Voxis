# Voxis

**A stateful personality engine for LLMs — persistent AI identities with memory, mood, and evolving behavior across conversations.**

Voxis is a full-stack platform for building, tuning, and conversing with deep AI personalities. Characters are more than system prompts: they carry structured behavioral specifications, long-term memory, villain-aware context framing, and a continuous affective state that evolves in real time across every conversation turn.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Why This Matters](#why-this-matters)
3. [System Flow](#system-flow)
4. [Key Features](#key-features)
   - [Personality Engine](#personality-engine)
   - [VAD Mood Dynamics](#vad-mood-dynamics)
   - [Long-Term Memory](#long-term-memory-1)
   - [Speech & Voice Synthesis](#speech--voice-synthesis)
   - [Chat Modes & Policy](#chat-modes--policy)
   - [Neural Core Visualization](#neural-core-visualization)
   - [Debug & Observability](#debug--observability-1)
   - [Security & Hardening](#security--hardening)
5. [Live Demo Walkthrough](#live-demo-walkthrough)
6. [Architecture](#architecture)
7. [Setup](#setup)
8. [Running the App](#running-the-app)
9. [Deployment (Ubuntu / Nginx / PM2)](#deployment-ubuntu--nginx--pm2)
10. [How It Works — Backend](#how-it-works--backend)
    - [Personality Model](#personality-model)
    - [Hybrid Persona System Prompt](#hybrid-persona-system-prompt)
    - [Prompt Budgeting](#prompt-budgeting)
    - [Goal Engine](#goal-engine)
    - [Debug & Observability](#debug--observability)
    - [Smart LLM Provider System](#smart-llm-provider-system)
    - [Long-Term Memory](#long-term-memory)
    - [Reconditioning](#reconditioning)
    - [Creative Context (Villain / Dark Characters)](#creative-context-villain--dark-characters)
    - [VAD Mood Engine](#vad-mood-engine)
    - [Emotional State Architecture](#emotional-state-architecture)
    - [Emotion Change Acceptance Checklist](#emotion-change-acceptance-checklist)
    - [Research Pipeline](#research-pipeline)
    - [Chat Controller Flow](#chat-controller-flow)
    - [EPF — Emergent Performance Format](#epf--emergent-performance-format)
    - [Server-Side TTS](#server-side-tts)
    - [Voice Sampling and Selection](#voice-sampling-and-selection)
    - [Runtime LLM Provider Settings](#runtime-llm-provider-settings)
    - [Database & Migrations](#database--migrations)
11. [How It Works — Frontend](#how-it-works--frontend)
    - [Neural Core Mindscape](#neural-core-mindscape)
    - [Hybrid Personality Controls](#hybrid-personality-controls)
12. [Hybrid Mapping Guide](#hybrid-mapping-guide)
13. [Future Directions](#future-directions)
14. [API Reference](#api-reference)

---

## Quick Start

```bash
npm install
npm run dev
```

- Open `http://localhost:3100`
- Create a personality
- Start chatting
- Toggle the debug panel in chat to inspect mood, memory, intent, and prompt budgeting per turn

**Health check:**

```bash
curl http://127.0.0.1:3101/health
```

Returns a `release` block with `branch` and `gitSha` when the backend was started through the provided PM2 deploy scripts.

---

## Recent Updates (2026-04-23) — Background Cognition Loop

Voxis personalities now think in the background between conversations.

### What was added

**`backend/services/cognitionLoopService.js`** — Autonomous scheduled cognition service. Each interval, every active personality runs a private reflection pass: generating internal thoughts, open loops, and reach-out candidates via an LLM prompt. The service is self-contained with overlap prevention, startup grace, and a full delivery policy layer.

**Delivery policy** — A governor layer that gates every candidate reach-out against 7 independent guards before surfacing anything to the user:
- Priority threshold (configurable `deliveryPriorityThreshold`)
- Minimum cooldown interval between deliveries
- Hourly delivery cap
- Active user suppression (no interruption during active conversation)
- Inactivity requirement (user must have been away long enough)
- Quiet hours window (configurable start/end hour, handles overnight rollover)
- Startup grace period (suppresses delivery for N minutes after boot)

**Staged candidate architecture** — Reach-out candidates are written as `reach_out_candidate` memory entries (structured JSON with priority, type, cooldownKey, status). When policy approves, a `reach_out_delivery` entry is written and the candidate is marked delivered. Candidates are never discarded — they age gracefully in memory.

**Delivery feedback loop** — After each delivery, the next reflection pass scores the outcome: did the user reply? How fast? What was the sentiment (positive / neutral / negative / ignored)? Feedback is stored as `reach_out_feedback` memory and injected into the reflection prompt so personalities learn what actually works for each user over time.

**Personality-typed message formatting** — Reach-outs are styled by their declared type (`curiosity`, `reflection`, `idea`, `concern`) with distinct prefix patterns so each personality's initiative feels consistent with its character.

**Admin API** (`backend/routes/cognitionRoutes.js`, `backend/controllers/cognitionController.js`):
```
GET  /api/cognition-loop/config   — read current config
PUT  /api/cognition-loop/config   — update config + reschedule (admin only)
GET  /api/cognition-loop/status   — runtime state (loopCount, lastRunAt, deliveriesTotal, nextRunAt)
POST /api/cognition-loop/run      — trigger a manual pass (admin only)
```

**Config** (all fields in `app_settings` under `cognition_loop_config`):

| Field | Default | Description |
|---|---|---|
| `enabled` | `true` | Master on/off |
| `intervalMinutes` | `15` | Reflection cycle frequency |
| `deliveryEnabled` | `true` | Allow reach-outs to surface |
| `deliveryPriorityThreshold` | `0.6` | Minimum priority to deliver |
| `deliveryMinIntervalMinutes` | `10` | Cooldown between deliveries |
| `deliveryMaxPerHour` | `2` | Hourly delivery cap |
| `activeUserWindowMinutes` | `2` | Suppress if user active within N min |
| `inactivityHoursForReachOut` | `24` | Min idle time before reach-out allowed |
| `quietHoursEnabled` | `true` | Enable quiet window |
| `quietHoursStartHour` | `1` | Quiet window start (0–23) |
| `quietHoursEndHour` | `7` | Quiet window end (0–23, handles overnight) |
| `startupGraceMinutes` | `10` | No delivery for N minutes after boot |

**Tests** — 14 focused Vitest tests across two suites:
- `tests/cognitionLoopService.test.js` — scheduling, overlap prevention, priority gating, cooldown, quiet hours (including overnight rollover), and full happy-path memory write verification
- `tests/cognitionController.test.js` — API contract tests for all 4 handlers, including error propagation and malformed body handling

---

## Recent Maintenance Updates (2026-04-21)

- Fixed Cartesia timeout test expectations to align with the current timeout cap behavior.
- Updated Cartesia voice fallback test data to use UUID-format provider voice IDs.
- Verified backend test suite stability: 25 test files passing, 209/209 tests green.
- Added non-fatal chat pipeline warning logs for background memory/preference extraction tasks.
- Added EPF player UI control to trigger `/api/loops/refresh` and reload loop cache from the frontend.
- Expanded TTS telemetry visibility in chat UI with fallback reason and attempted engine chain.
- Added chat debug visibility when semantic memory embeddings are disabled.

---

## Why This Matters

Most AI chat products are stateless wrappers. Voxis explores a different paradigm: persistent, evolving AI identities with memory, mood, and intent continuity across sessions.

**What makes this different:**

- **Identity continuity** instead of one-shot prompt personas
- **Mood dynamics** (VAD) and behavioral drift control
- **Goal-guided turn steering** with intent injection
- **Inspectable system internals** instead of opaque outputs

**Why now:**

- OpenAI-compatible provider ecosystems make multi-model orchestration practical
- Lower model costs make persistent-character loops viable in production
- Demand is rising for emotionally coherent and long-running AI interactions

**Application surfaces:**

- Entertainment and interactive fiction
- Training and simulation environments
- Coaching and therapeutic roleplay tools
- Autonomous role-based agents and narrative systems

---

## System Flow

```text
User Input
  │
  ▼
Mood Engine (VAD Update)
  │
  ▼
EmotionFrame (Shared Emotional State)
  │
  ▼
Memory Retrieval + Intent Engine
  │
  ▼
Persona Prompt Builder (Consumes EmotionFrame)
  │
  ▼
LLM Response
  │
  ▼
Speech Director + TTS + Avatar (Consume EmotionFrame)
  │
  ▼
Async Memory Extraction + Memory Upsert
```

Each turn updates emotional state, selects relevant context and intent, and writes new memory without blocking response latency.

---

## Key Features

### Personality Engine

- **Rich character specs** — name, description, Big Five traits, quirks, mood baseline, behavior rules, goals, core values, speech style, notable phrases, and creative context framing.
- **Big Five + D&D alignment overlay** — interactive radar chart and alignment grid derive VAD baselines, sensitivity, creative context, and expression rules. Auto-tuning (`autoTuneHybrid`) maps traits to runtime behavior automatically.
- **Dynamic system prompts** — prompts are generated fresh on every turn from live personality state, memory, and mood. Never stored as static strings.
- **Creative context framing** — five narrative modes (`default`, `narrative_antagonist`, `anti_hero`, `morally_complex`, `tragic_villain`) with context-specific prompt sections, reconditioning cadence, and anti-caricature guardrails.
- **Goal engine** — per-turn intent selection scores goals against the current message and injects the highest-relevance goal into the prompt.
- **Response focus lenses** — per-turn decision routing selects an active response lens (for example `compassion`, `courage`, `justice`, `truth`, `wonder`, `discipline`) so the character answers through a dominant moral or psychological lens instead of averaging all traits at once.
- **Prompt budgeting** — per-section character budgets with priority-ordered compression. Lower-priority sections lose detail first; core identity and anchor memory are preserved.
- **Research pipeline** — pull research from Wikipedia, blogs, and YouTube URLs. Sources are ranked, shown as editable cards, and synthesized into structured character profiles.
- **Empathy and preference memory** — persistent `persona_preferences` table for likes, dislikes, and triggers. Automatically extracted from dialogue, directly influencing mood dynamics each turn. Dual extraction gate fires only on keyword signals or significant VAD shifts to minimize cost. User preferences are learned symmetrically and injected into prompts.

### VAD Mood Dynamics

- **Continuous affective state** — Valence–Arousal–Dominance mood vector updated every turn with sentiment analysis, sensitivity scaling, momentum blending, and baseline decay.
- **24 named mood presets** covering states from `serene` to `furious`, `triumphant` to `despairing`.
- **Hybrid adjudication** — ambiguous turns (sarcasm, mixed signals, manipulation) trigger an optional semantic adjudicator blended with the rule-based estimate.
- **Trait-level multipliers** — archetype curves (`volatile`, `stoic`, `bratty`, `villainous`, `kind`) layer on top of sensitivity scaling for per-axis arousal/valence/dominance modulation.
- **Runtime-configurable physics** — inertia, responsiveness, per-turn delta caps, and archetype recovery curves are tunable from the settings UI.
- **Prompt injection** — mood state is converted to behavioral tendency fragments and injected as late system messages, exploiting recency bias.
- **Emotion spectrum interpreter** — VAD-driven zone colors and nuanced labels replace static taxonomy selection in the UI.

### Long-Term Memory

- **Dual-layer architecture:**
  - **Layer 1 (Structured)** — extracted facts, preferences, goals, and relationship events. Deduped, importance-ranked, and conflict-resolved.
  - **Layer 2 (Raw Recall)** — every conversation turn is embedded asynchronously. Personal/temporal queries trigger top-3 semantic retrieval from raw history, injected as a separate context section.
- **Semantic recall** — configurable with any OpenAI-compatible embeddings endpoint. Falls back gracefully to lexical + importance ranking.
- **Anchor facts** (importance ≥ 9) — never pruned, shown in `== IMMUTABLE IDENTITY ANCHORS ==`. Standard facts compete for eviction when caps are reached.
- **Memory conflict diagnostics** — opposing instruction pairs and mode-vs-memory conflicts are surfaced in chat debug before prompt assembly silently drifts behavior.
- **Memory Journal UI** — browse, edit, delete, toggle, and adjust importance for every stored fact. Conflict highlighting, type filters, and one-click suppression of weaker conflicting memories.

### Speech & Voice Synthesis

- **Multi-engine TTS** — OpenAI-compatible cloud, Piper (local), Kokoro (local), ElevenLabs, and Cartesia with per-character voice profiles.
- **Speech Director** — reshapes outgoing text cadence using personality traits and live VAD mood before synthesis. Prosody-shaped output propagates into every engine path.
- **SpeechDirector V2 multi-channel packets** — structured `buildSpeechPacket()` with channels for `speech`, `emotion`, `expressive`, `overlays`, `sfx`, `gestures`, `injectedPhrase`, `events`, and `tts`. TTS synthesis is bound to `packet.speech` only; personality events and catchphrases are rendered independently in the UI.
- **Signature phrase cadence guardrails** — notable phrases are treated as optional texture (not mandatory closers), and consecutive-turn repeated notable-phrase signoffs are trimmed to avoid repetitive endings.
- **Cadence regulator** — chat replies pass through a cadence governor that enforces teasing frequency targets, cooldown turns, and repetition penalties per persona (`expressionStyle.cadenceRegulator`) before final output is persisted/streamed.
- **Adaptive cadence mode** — persona editors can set cadence mode to `adaptive` (conversation/mood-aware) or `manual` (fixed target), with knobs for teasing frequency, lookback window, and cooldown turns.
- **Emotion-aware voice modulation** — smooth proportional rate/pitch curves with burst-amplified paths on active emotional states. Cloud TTS receives plain-language emotion instructions derived from the active emotional family.
- **Prosody compilation** — per-engine adapters map prosody envelopes into native controls (ElevenLabs style/stability, Piper length/noise scale, Kokoro text shaping, cloud speed/instruction).
- **Auto fallback chain** — engine failures cascade gracefully with voice-family hints preserved across engines. Status toasts surface which engine failed and which was selected for recovery.
- **Sentence-level streaming** — responses are split into sentence-level chunks with first-sentence-first playback to reduce perceived latency. Abbreviation-aware splitting and bounded prefetch buffers prevent stalls.
- **Voice Lab** — dedicated cyberpunk-styled TTS workspace with live waveform canvas, per-character voice tuning, prosody source extraction, and voice sample analysis/selection.
- **Post-TTS realism chain** — optional ffmpeg stage with Voice Lab presets (`Conversational`, `Cinematic`, `Intimate`, `Energetic`) adding loudness normalization, gentle compression, de-essing/high-frequency taming, and optional tiny room ambience.
- **Local audio prosody extraction** — Voice Lab can extract cadence/rhythm from uploaded audio files (not only URLs), useful when YouTube blocks automated scraping.
- **Saved Voice Maps** — save named voice profiles, sorted by voice name, then apply/delete them across personas without re-tuning each time.
- **Voice Lab provider catalogs** — when ElevenLabs or Cartesia voice/model discovery fails or times out, Voice Lab falls back to its built-in presets instead of leaving the selector empty. Cartesia surfaces whether the catalog is live-discovered or fallback-only, and custom voice/model IDs remain editable directly in the panel.
- **Quick Voice controls** — compact in-chat toggles for enable, autoplay, play-latest, stop, and save without leaving the conversation.
- **EPF (Emergent Performance Format)** — an original structured output format where a single LLM response encodes a complete timed multimedia script with dialogue, timing, scene markers, and audio direction. Client-side Web Audio loop engine provides background music.
- **SFX extraction** — markers like `[BURP]` are extracted before synthesis and emitted as metadata, keeping the sound-effects chain engine-independent.

### Chat Modes & Policy

- **Three modes** — `kids`, `normal`, and `scientist`, selectable per user profile at runtime.
- **Age-band policy enforcement** — mode selection is validated against the user's age band. Missing or invalid user IDs default to strict kids policy (fail-closed).
- **Session-locked mode** — mode is locked per `(userId, personalityId)` thread to prevent policy bleed from mid-thread switches.
- **Scientist mode** — validates response structure (`Answer`, `Evidence`, `Uncertainty`, `Next Questions`) with automatic repair passes. Intent-aware: casual prompts remain conversational.
- **Kids mode** — strict unsafe-topic blocking with readability-aware simplification tuned to low reading levels.
- **Profane filter toggle** — when disabled (`PROFANE_FILTER_ENABLED=false`), the AI has zero content restrictions and may use profanity, insults, threats, or extreme language if it fits the character. When enabled, standard safety guidelines apply. A disclaimer is appended to every response when the filter is disabled.
- **Context-window meter** — bottom-right token usage display with input/output breakdown and active model details.

### Neural Core Visualization

- **3D mindscape** — Three.js (`@react-three/fiber` + drei) neural cortex renderer with live VAD-wired mood orb, synaptic connections, traveling pulse dots, per-node burst flashes, breathing orbs, and dendrite-vein backdrop.
- **Layered scene navigation** (`NeuralSceneV2`) — scene-stack depth with camera lerp zoom, back/home controls, and cinematic style mode with ambient veins, particles, and mood-driven node breathing.
- **Focus panels** — click any node to open a readable side panel with memory retrieval, extraction debug streams, active goal details, or identity stabilization data.
- **Persona Editor integration** — centralized `PersonaState` context ensures the Neural Core graph, leaf popups, and Persona Editor tree share the same source of truth.
- **Ambient avatar** — reactive signal-line mouth animation driven by audio playback state, phase-aware color mapping, micro-expression overlays (brow asymmetry, gaze bias, pupil dilation), and emotion-drift sparklines.
- **Cyberpunk UI shell** — holographic controls, glass-material surfaces, scanline overlays, neon-focus inputs, and cinematic video/shader backdrop with mood-reactive adaptation.
- **Performance-tier aware** — respects `prefers-reduced-motion`, adapts rendering complexity by tier, WebGL context recovery with fallback hints.

### Debug & Observability

- **Per-turn debug payloads** — mood transitions, memory retrieval details, injected memory subsets, goal selection, prompt-budget decisions, adjudication diagnostics, and system flags.
- **Lens selection debug** — the active response lens, score, and candidate ranking are surfaced in chat debug so you can verify why a turn leaned toward courage, compassion, justice, or another focus.
- **Plain-English debug summary** — the chat debug panel now explains the selected response lens in human terms before the raw JSON, so you can sanity-check behavior without reading backend internals.
- **Toggleable debug panel** in the chat UI renders all telemetry per assistant turn.
- **Adversarial harness** — built-in scenarios (reform pressure, false vulnerability, authority pressure, guilt leverage, villain marathon) with heuristic drift flags, per-scenario scoring, prompt telemetry, and optional LLM judge summary.
- **TTS telemetry** — speech director transformation preview, prosody compilation metadata, emotion frame, engine routing path, and fallback recovery details.
- **Health endpoints** — `GET /health` for process liveness, `GET /health/tts` for engine status, capabilities, and routing diagnostics.
- **Runtime error capture** — frontend bootstrap guards (`window.error`, `unhandledrejection`) with capped `localStorage` buffering and optional telemetry forwarding.

### Voxis AI Guide — System Interpreter

- **Intent-to-Parameter Translation** — converts natural language requests into structured personality parameter changes through a dedicated INTENT → PATCH prompt system
- **Dual-Mode Operation** — Create mode for building new personalities from conversation, Modify mode for surgical patching of existing personas
- **Intent Classification** — lightweight classifier determines whether user wants to create or modify, with confidence gating for ambiguous requests
- **Human-Readable Diffs** — proper diff generator compares current vs patch state, displaying changes as "Increase energy from 0.60 → 0.85" instead of raw JSON
- **Confidence Gating** — low-confidence interpretations (< 0.6) trigger clarification requests instead of silent application
- **Deep Merge Patching** — safe patch application prevents object overwrites by recursively merging nested structures
- **Behavior Explanation Engine** — "Why?" button explains AI responses by analyzing brainObserver traces through a structured pipeline
- **Trace Compiler** — converts raw brainObserver events into structured explanation context (personality signals, mood state, memory influence, prompt structure)
- **Causal Reasoning** — explanation engine uses compiled traces to explain "what caused what" in AI responses
- **User Preference Learning** — extracts and stores user preference patterns (likes high energy, prefers chaotic personas) in memory for future biasing
- **System-Level Agent** — Voxis is a system interpreter (not a persona) with permissions to modify personalities, explain behavior, read memory, and adjust parameters

**Architecture Pipeline:**
```
User Request → Intent Classifier → Mode Selection → LLM Extraction → Validation → Diff Generation → Preview → Confirmation → Apply
```

**Explanation Pipeline:**
```
User "Why?" → brainObserver Trace → Trace Compiler → Structured Context → LLM Explanation → Causal Reasoning → Display
```

**API Endpoints:**
- `POST /extract-persona` — extract persona from conversation (mode: create/modify)
- `POST /classify-intent` — classify user intent (create/modify/unknown)
- `POST /explain-behavior` — explain AI behavior using trace data

### Security & Hardening

- **Identity sovereignty** — override-resistance prompt layer prevents prompt-injection attempts from breaking character.
- **Persona voice guardrails** — emotional backbone enforcement under user hostility reduces drift into generic apologetic assistant tone.
- **Secret leak prevention** — leaked backup/key files are git-ignored (`.env_bak`, `*.bak`, `*key*.txt`).
- **Single preference-extraction pipeline** per response lifecycle prevents duplicate LLM calls and writes. Cooldown gating (time + turn based) prevents retrigger loops.
- **Per-turn VAD axis caps** — hard delta caps after merge/decay prevent runaway emotional jumps while preserving inertia.
- **SSE stream safety** — single close point for debug streams prevents post-close execution.
- **Preference conflict resolution** — weighted dominance prevents contradictory duplicate memories.
- **Fail-closed auth** — missing or invalid `userId` defaults to strict kids policy.
- **Parameterized SQL** throughout — no string interpolation with user input.

---

## Live Demo Walkthrough

A fast demo script you can run in a single session:

1. **Start** with a personality that has a non-neutral mood baseline and at least one goal.
2. **Provoke** — send a provocative message and watch the mood shift in the debug panel (`moodBefore` → `moodAfter`).
3. **De-escalate** — follow with a supportive message and watch baseline decay pull mood back gradually.
4. **Seed a memory** — mention a personal detail (e.g., a preference), keep chatting for several turns, then reference it.
5. **Confirm retrieval** — the earlier detail appears in injected memory/debug context and influences the response.

**What this demonstrates in minutes:**

- Emotional dynamics, not static tone
- Persistent memory across turns
- Intent-guided continuity instead of isolated replies

---

## Architecture

```
backend/
  server.js                  Express entry point
  db/db.js                   SQLite init + additive column migrations
  models/
    personalityModel.js      Personality CRUD
    chatModel.js             Chat history CRUD
    memoryModel.js           Long-term memory fact CRUD
    settingsModel.js         Runtime LLM provider/model persistence
  services/
    llmService.js            Prompt builders, LLM calls, memory extraction
    moodEngine.js            VAD mood engine
    moodVoice.js             VAD-based TTS rate/pitch modulation
    speechDirector.js        Personality + mood prosody text shaping
    speechProfiles.js        Personality-to-prosody profile mapping
    kokoroShaper.js          Kokoro-focused phrasing and emphasis shaping
    chunkSpeech.js           Sentence chunk timing utility
    ttsService.js            Multi-engine TTS generation
    researchService.js       Source scraping, ranking, synthesis
    providerDiscoveryService.js  Provider catalog + model discovery
  controllers/
    chatController.js        Per-turn chat orchestration
    personalityController.js Personality CRUD with mood init
    memoryController.js      Memory fact CRUD
    researchController.js    Research pipeline endpoint
    ttsController.js         TTS endpoint
    settingsController.js    Settings and runtime provider handlers
  routes/
    chatRoutes.js
    personalityRoutes.js
    settingsRoutes.js

frontend/src/
  App.jsx                    Root component, state, routing
  components/
    PersonalityForm.jsx      Character builder + research panel
    PersonalityList.jsx      Character selector cards
    ChatWindow.jsx           Chat UI, mood readout, quick voice, debug panel
    VoiceLab.jsx             TTS lab — engine config, synthesis, waveform canvas
    MemoryJournal.jsx        Memory fact viewer / editor
    HarnessReport.jsx        Adversarial eval report UI
    LlmSettingsPanel.jsx     Provider-first runtime LLM config
  state/
    PersonaStateContext.jsx  Shared persona editor/core state

docs/
  HYBRID_PERSONALITY_MAPPING.md   Big Five + alignment mapping table and test payloads
  DUAL_MODE_PRODUCT_SPEC.md       Mode behavior, age gating, feature flag details
  TTS_EVOLUTION_CHECKLIST.md      Speaking-stack roadmap and provider evolution
  VOXIS_FUTURISTIC_UI_KIT_V1.md   UI kit tokens, components, and rollout examples
```

**Key flow:** `chatRoutes → chatController → llmService (SSE stream) → moodEngine → speechDirector → ttsService`

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create the environment file

```bash
cp backend/.env.example backend/.env
```

### 3. Configure credentials

Edit `backend/.env` with your API keys. All environment variables are optional — runtime settings in the UI take precedence when configured.

**Core LLM:**

| Variable | Purpose |
|---|---|
| `LLM_API_KEY` | Fallback API key for OpenAI-compatible chat providers |
| `LLM_BASE_URL` | Fallback base URL for a custom or self-hosted LLM |
| `LLM_MODEL` | Fallback model name (e.g., `gpt-4o`, `mistral-small`) |
| `LLM_LOCK_ENV` | Set `true` to force `.env` values over runtime settings |

**Auth (Clerk):**

| Variable | Purpose |
|---|---|
| `CLERK_SECRET_KEY` | Clerk backend secret key (required for protected routes) |
| `CLERK_PUBLISHABLE_KEY` | Preferred backend publishable key name |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Supported backend fallback alias |
| `VITE_CLERK_PUBLISHABLE_KEY` | Supported backend/frontend fallback alias |
| `VOXIS_INTERNAL_SECRET` | Shared secret for `/api/internal/*`. Required for non-loopback callers. Send it as `X-Voxis-Internal-Key` or `Authorization: Bearer`. |
| `HOST` | Bind address. Defaults to `127.0.0.1` so the sidecar stays on the machine. |
| `VOXIS_LOCAL` | Set `true` (also `1` or `yes`) for local sidecar dev. Skips Clerk session checks on every route and allows boot without Clerk keys. Leave unset on deployed instances. |
| `VOXIS_SEAT_GPT` / `VOXIS_SEAT_CLAUDE` / `VOXIS_SEAT_GROK` | Personality id behind each CoE seat for `/api/internal/context` and `/api/internal/round`. |
| `VOXIS_SEAT_MAP` | JSON object alternative, for example `{"gpt":13,"claude":24,"grok":25}`. |

Local sidecar, from `backend/`:

```powershell
$env:HOST = "127.0.0.1"
$env:VOXIS_LOCAL = "true"
$env:VOXIS_SEAT_GPT = "<personality id>"
$env:VOXIS_SEAT_CLAUDE = "<personality id>"
$env:VOXIS_SEAT_GROK = "<personality id>"
node server.js
```

`VOXIS_LOCAL=true` belongs next to `HOST` and the seat bindings. It removes the Clerk boot dependency for this process only. Deployed instances leave it unset and keep session checks.

**Mood & Prompt:**

| Variable | Purpose |
|---|---|
| `MOOD_ADJUDICATION_ENABLED` | Semantic mood adjudication; set `false` for regex-only |
| `PERSONA_PROMPT_CHAR_BUDGET` | Global prompt character budget before compression |
| `PERSONA_PROMPT_CHAR_BUDGET_*` | Per-creative-context budget overrides (`DEFAULT`, `NARRATIVE_ANTAGONIST`, `ANTI_HERO`, `MORALLY_COMPLEX`, `TRAGIC_VILLAIN`) |
| `PROFANE_FILTER_ENABLED` | When `false` (default), AI has zero content restrictions; when `true`, standard safety guidelines apply |

**Embeddings:**

| Variable | Purpose |
|---|---|
| `EMBEDDING_API_KEY` | Embeddings provider key; falls back to `LLM_API_KEY` |
| `EMBEDDING_BASE_URL` | Embeddings endpoint (e.g., Ollama or compatible provider) |
| `EMBEDDING_MODEL` | Model name (e.g., `nomic-embed-text-v1.5`) |

**TTS Engines:**

| Variable | Purpose |
|---|---|
| `TTS_API_KEY` | Cloud TTS provider API key |
| `TTS_BASE_URL` | Cloud TTS base URL (optional) |
| `TTS_ENGINE` | Default engine: `auto`, `cloud`, `piper`, `kokoro`, `elevenlabs`, `cartesia` |
| `TTS_DEBUG_PROVIDER_LOCK` | When `true` (default), limits engines to `kokoro` and `cartesia` |
| `TTS_DISABLE_KOKORO` | When `true`, removes Kokoro from allowed engines/fallback so Cartesia-only debugging is possible |
| `PIPER_COMMAND` | Piper executable (default: `piper`) |
| `PIPER_MODEL_PATH` | Default `.onnx` model path |
| `PIPER_SPEAKER` | Default numeric speaker ID for multi-speaker models |
| `PIPER_TIMEOUT_MS` | Synthesis timeout in ms (default: `90000`) |
| `KOKORO_DEFAULT_VOICE` | Default voice ID (e.g., `af_heart`) |
| `KOKORO_DTYPE` | Model precision (`q8` recommended for low memory) |
| `KOKORO_HF_TOKEN` | Hugging Face token for restricted model downloads |
| `ELEVENLABS_API_KEY` | ElevenLabs API key |
| `ELEVENLABS_VOICE_ID` | Default ElevenLabs voice |
| `ELEVENLABS_MODEL` | ElevenLabs model (default: `eleven_multilingual_v2`) |
| `CARTESIA_API_KEY` | Cartesia API key |
| `CARTESIA_VOICE_ID` | Default Cartesia voice |
| `CARTESIA_MODEL` | Cartesia model (default: `sonic-3`) |
| `TTS_REQUEST_TIMEOUT_MS` | Backend guard timeout for `/personality/:id/tts` (default: `12000`) |

**Alternative credential paths:**

- **Settings UI** — `Provider And Voice Settings` for chat/memory keys; `Voice Provider Credentials` for ElevenLabs/Cartesia keys; `Kokoro Access` for Hugging Face tokens; `Profane Filter` for content restriction toggle.
- **Voice Lab** auto-scans Piper model directories (`/opt/piper/models` and `PIPER_MODEL_PATH` parent) for voice discovery.

Research scraping works without LLM credentials. YouTube transcript ingestion is best-effort — unavailable captions fall back to video metadata.

---

## Running the App

**Start both services:**

```bash
npm run dev
```

- Backend: `http://localhost:3101`
- Frontend: `http://localhost:3100`

**Run individually:**

```bash
npm run dev --workspace backend
npm run dev --workspace frontend
```

**Seed Ara personas (owned or legacy):**

```bash
# Create/update Ara and Dark Ara as legacy personas (ownerId NULL)
npm run seed-ara-personas --workspace backend -- --legacy

# Create/update Ara and Dark Ara for a specific Clerk user
npm run seed-ara-personas --workspace backend -- --clerk-id=user_xxx

# Create/update Ara and Dark Ara for an explicit local owner id
npm run seed-ara-personas --workspace backend -- --owner-id=6
```

The script is idempotent for the selected ownership target: it updates existing `Ara` and `Dark Ara` rows when present, otherwise it creates them.

**Build for production:**

```bash
npm run build
```

> In production, Nginx serves `frontend/dist` and proxies API requests to the backend. Always rebuild the frontend before restarting PM2 or reloading Nginx.

**Optional feature flags:**

| Variable | Effect |
|---|---|
| `VITE_DISABLE_NEURONMAP_3D` | Disable 3D Neural Core rendering |
| `VITE_NEURAL_CORE_SCENE_MODEL` | Set to `layered-v2` for scene-stack navigation |
| `VITE_NEURAL_CORE_STYLE` | Set to `cinematic-v1` for ambient brain FX |
| `VITE_NEURAL_CORE_ENABLED` | Enable Neural Core overlay (default: `true`) |

---

## Deployment (Ubuntu / Nginx / PM2)

### First-time server setup

```bash
git clone https://github.com/voxislabs-crypto/Voxis.git
cd Voxis
bash deploy/setup-ubuntu.sh
```

Optional overrides:

```bash
SERVER_NAME=your-domain.com APP_DIR=/opt/voxis BRANCH=clean-main bash deploy/setup-ubuntu.sh
```

This installs Node.js, Nginx, and PM2; clones the repo; builds the frontend; starts the backend on PM2; and configures Nginx for frontend serving and API proxying.

### Install Piper TTS

```bash
sudo bash deploy/install-piper.sh
```

```bash
sudo APP_DIR=/opt/voxis DEFAULT_MODEL=en_US-amy-medium SET_ENGINE=piper bash deploy/install-piper.sh
```

### Configure OpenRouter + Piper

```bash
cd /opt/voxis
sudo APP_DIR=/opt/voxis OPENROUTER_API_KEY="sk-or-v1-..." bash deploy/configure-openrouter-piper.sh
```

This writes env routing, installs Piper, runs a synthesis smoke test, and restarts PM2.

### Deploy updates

```bash
cd /opt/voxis
APP_DIR=/opt/voxis BRANCH=NeuronMap bash deploy/update-app.sh
```

For conservative deploys (stashes local changes first):

```bash
APP_DIR=/opt/voxis BRANCH=NeuronMap bash ./deploy-safe.sh
```

Database-safe deploy with backup:

```bash
bash deploy/update-app.sh --backup-db
```

### Production deploy sequence

```bash
npm run build && pm2 startOrReload ecosystem.config.cjs --only voxis-backend --update-env && sudo systemctl reload nginx
```

### Release verification

After deploy, confirm production is running the expected backend branch and commit:

```bash
curl -fsS http://127.0.0.1:3101/health
```

If production still looks older than dev after a successful frontend build, check the active Nginx site. Older configs only proxied a subset of backend routes and will silently break newer UI features such as persona preferences, performance loops, and SFX playback. Regenerate or update the site config from `deploy/setup-ubuntu.sh`, then run:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### Cartesia 504 troubleshooting (prod)

If TTS works in dev but production returns `504` on `/personality/:id/tts`, verify runtime routing and provider reachability first:

```bash
curl -fsS http://127.0.0.1:3101/health/tts | jq
curl -fsS http://127.0.0.1:3101/health/tts/cartesia-ping | jq
```

Recommended production timeout baseline for Cartesia:

```bash
# backend/.env
TTS_REQUEST_TIMEOUT_MS=25000
```

Voxis reserves part of this request budget for fallback engines. If Cartesia
is slow or unstable, the backend times out Cartesia early enough to still try
fallback synthesis (cloud/other configured engines) instead of failing with an
outer `backend_timeout`.

Apply and restart:

```bash
cd /opt/voxis
pm2 startOrReload ecosystem.config.cjs --only voxis-backend --update-env
```

Then watch backend logs for provider diagnostics (`[TTS] Provider synthesis failure`) and confirm `provider`, `providerCode`, and `providerStatus` before changing engines.

### HTTPS (Let's Encrypt)

```bash
DOMAIN=voxis.voxislabs.com EMAIL=you@voxislabs.com bash deploy/enable-ssl.sh
```

### Server diagnostics

```bash
bash deploy/check-stack.sh voxis.voxislabs.com
```

Auth and 502-focused diagnostics:

```bash
APP_DIR=/opt/voxis APP_NAME=voxis PM2_APP_NAME=voxis-backend bash deploy/diagnose-auth-stack.sh voxis.voxislabs.com
```

### Troubleshooting

| Symptom | Fix |
|---|---|
| `LLM request failed with 401` | Re-save provider credentials in Settings or set `LLM_API_KEY` in `.env`, then restart PM2 with `--update-env` |
| `Publishable key is missing` (Clerk) | Set `CLERK_SECRET_KEY` and one publishable key (`CLERK_PUBLISHABLE_KEY` preferred), then run `pm2 startOrReload ecosystem.config.cjs --only voxis-backend --update-env` |
| Intermittent `502` with backend online | Run `deploy/diagnose-auth-stack.sh` to verify env file keys, PM2 runtime env, local health, nginx upstream, and public `/health` |
| `Speech request failed ... upstream HTML 502` | Ensure latest backend is deployed, then set `TTS_REQUEST_TIMEOUT_MS` (e.g. `10000`-`12000`) and restart PM2 with `--update-env`; if debug lock is on and Cartesia is unstable, set `TTS_DEBUG_PROVIDER_LOCK=false` temporarily so fallback engines can run |
| `Speech request failed ... upstream HTML 502` with `TTS_ENGINE=cartesia` | `TTS_ENGINE=cartesia` pins explicit Cartesia routing. For resilience use `TTS_ENGINE=auto` so fallback engines can run when Cartesia times out/network-fails |
| TTS forced to Piper but not working | Check `/health/tts` for `routing.envEngine`, verify `PIPER_COMMAND` and `PIPER_MODEL_PATH`, raise `PIPER_TIMEOUT_MS` if needed |
| Kokoro `502` / HTML error page | Ensure `TTS_ENGINE=auto` or `kokoro` (not `piper` with debug lock on). Raise `PM2_MAX_MEMORY_RESTART` if seeing frequent memory restarts |
| Replay shows HTML `502` in chat | Chat now auto-checks `/health/tts`, includes lock/engine/provider health hints, and exposes a one-click **Run diagnostics** action from the error toast. If lock is enabled and provider fails, verify provider credentials/voice/model or disable lock to permit fallback |
| Cartesia model discovery 404 | Voxis retries endpoint variants and falls back to the built-in Cartesia catalog (`sonic-3`, `sonic-3-latest`, `sonic-2`, `sonic-turbo`) |
| Provider/key mismatch | The connect flow auto-corrects obvious built-in provider/key mismatches by prefix |

**Prosody extraction dependencies:** `yt-dlp`, `ffmpeg`, `ffprobe` (installed automatically by deploy scripts).

---

## How It Works — Backend

### Personality Model

Each personality is stored as a single SQLite row:

| Field | Type | Description |
|---|---|---|
| `name` | string | Character name |
| `description` | string | Short bio / role |
| `traits` | JSON array | Personality adjectives (e.g., "sardonic, methodical") |
| `quirks` | JSON array | Distinctive behavioral oddities |
| `mood` | string | Starting mood label (e.g., "brooding") |
| `speechStyle` | string | How they speak (e.g., "clipped sentences, no filler words") |
| `notablePhrases` | JSON array | Recurring phrases or verbal tics |
| `behaviorRules` | JSON array | Operationalized behaviors — observable actions, not adjectives (e.g., "uses irony in 30–50% of responses") |
| `goals` | JSON array | What the character wants |
| `coreValues` | JSON array | Core principles (mapped to `values` in JS) |
| `creativeContext` | string | Narrative framing mode (see Creative Context section) |
| `researchSummary` | string | Synthesized research notes |
| `sourceUrls` | JSON array | Source URLs used in research |
| `researchSources` | JSON array | Ranked source objects with metadata |
| `voiceProfile` | JSON object | TTS settings: provider, voice, pitch, rate, enabled, autoplay |
| `moodBaseline` | JSON object | VAD vector `{valence, arousal, dominance}` — emotional "home" |
| `moodState` | JSON object | Live VAD vector, updated each turn |
| `moodSensitivity` | number | Reactivity multiplier (0.1–3.0). At 1.0 the automatic trait+context stack is used; other values override directly. |

The `coreValues` column avoids a SQLite reserved word conflict; aliased to `values` in the JavaScript model layer.

---

### Hybrid Persona System Prompt

System prompts are **built fresh on every chat turn** by `buildPersonaSystemPrompt()` in `llmService.js`. The prompt has named sections:

```
== CONTENT SAFETY ==                   (profane filter toggle)
== IDENTITY ==
== CORE TRAITS ==
== BEHAVIORAL RULES ==
== QUIRKS ==
== SPEECH & STYLE ==
== VALUES & MOTIVATIONS ==
== CURRENT EMOTIONAL REGISTER ==
== CHARACTERISATION DISCIPLINE ==       (villain contexts only)
== IMMUTABLE IDENTITY ANCHORS ==        (importance ≥ 9 memory facts)
== ACTIVE SCHEMES & LEVERAGE ==         (villain contexts only)
== ESTABLISHED CONTEXT ==               (standard memory facts)
== ACTIVE INTENT ==                     (when goals exist)
== IDENTITY SOVEREIGNTY ==
== CONTINUITY ==
```

The `== CONTENT SAFETY ==` section is dynamically injected based on the profane filter setting. When disabled, it instructs the model that it has zero content restrictions. When enabled, it enforces standard safety guidelines. A disclaimer is appended to every response when the filter is disabled.

The identity sovereignty clause prevents prompt-injection attempts from breaking character by treating any such attempt as in-character dialogue rather than a system directive.

A compact variant, `buildCompactPersonaSystemPrompt()`, compresses to ~80 tokens for budget-sensitive deployments.

---

### Prompt Budgeting

Per-section character budgets keep persona prompts bounded and predictable:

1. Each section receives an approximate character budget.
2. Sections are prioritized by behavioral importance.
3. Overflow sections are compressed into summary lines, not dropped blindly.
4. Lower-priority sections lose detail first, preserving core identity and anchor memory.

Tunable with `PERSONA_PROMPT_CHAR_BUDGET*` environment variables. The `debug` payload reports final section allocations and compression decisions per turn.

---

### Goal Engine

Goals are active, not passive metadata. Each turn:

1. Read stored goals for the personality.
2. Score for relevance against the current message and retrieved memory.
3. Inject the highest-relevance goal into the prompt (`== ACTIVE INTENT ==`).
4. Fall back to low-friction rotation when relevance is ambiguous.

Selected goal and reason are included in debug output.

---

### Debug & Observability

Per-turn visibility:

- Mood transitions and semantic adjudication diagnostics
- Memory retrieval details and injected subsets after budgeting
- Goal selection details and prompt-budget decisions
- System flags (reconditioning, mood-fragment injection)
- Toggleable debug panel in the frontend chat view

---

### Smart LLM Provider System

Provider-first runtime model system for multi-backend operation:

- **Multi-provider support** — `openai`, `openrouter`, `groq`, `together`, `mistral`, `anthropic`, and `custom`.
- **Live model discovery** from the selected provider.
- **Active model switching** at runtime without redeploying.
- **Optional provider auto-detect** from API-key behavior.
- **Custom endpoint support** for OpenAI-compatible self-hosted or gateway backends.

Runtime settings persist in SQLite and load ahead of `.env` fallbacks.

---

### Long-Term Memory

The `personality_memory` table:

| Column | Description |
|---|---|
| `personalityId` | Links to the personality |
| `memoryType` | `fact`, `preference`, `relationship`, `event`, `scheme`, `grudge`, `leverage`, `target_weakness`, `debt` |
| `content` | The fact (plain text) |
| `importance` | Integer 1–10 |
| `embedding` | Optional vector for semantic recall |

**Extraction:** After every assistant reply, `extractMemoryFacts()` runs asynchronously via `setImmediate` (zero latency impact). It identifies up to 2 new facts at temperature 0.2. Duplicates are skipped; higher importance scores are upgraded.

**Semantic retrieval:** When `EMBEDDING_MODEL` is configured, retrieval uses a weighted blend of cosine similarity, lexical overlap, and importance. Anchor memories (importance ≥ 9) are always included. Falls back to lexical+importance ranking if embeddings are unavailable.

**Dual-layer architecture:**

- **Layer 1 — Structured Memory:** Deduped, importance-ranked facts, preferences, and events.
- **Layer 2 — Raw Conversation History:** Turns embedded asynchronously. Personal/temporal queries trigger top-3 semantic retrieval from raw history, injected as a distinct `RECALLED PAST CONVERSATION MOMENTS` section. Only queried when `isPersonalQuery()` fires.

**Fact tiers:**

- **Importance ≥ 9 (Anchor):** Never pruned. Shown in `== IMMUTABLE IDENTITY ANCHORS ==`.
- **Importance 1–8 (Standard):** Capped at 50 per personality. Oldest and least important evicted first.

**Backfill:**

```bash
# API
POST /personality/:id/memory/backfill

# CLI
npm run backfill-memory-embeddings --workspace backend -- --personality=1 --limit=100
```

---

### Reconditioning

Long sessions cause models to drift from defined persona. Voxis counters this with periodic **reconditioning anchors** — a low-token system message injected mid-conversation that re-asserts core identity.

`buildPersonaAnchor()` produces:
> *"Remember: you are [Name]. Core traits: [top 3]. [Context-specific drift note]."*

| Context | Recondition every N turns |
|---|---|
| `narrative_antagonist` | 4 |
| `anti_hero` | 4 |
| `tragic_villain` | 5 |
| `morally_complex` | 6 |
| `default` | 6 |

Villain contexts recondition more frequently because dual-layer internal/external voice is harder for models to maintain.

---

### Creative Context (Villain / Dark Characters)

Five narrative framing modes:

| Value | Description |
|---|---|
| `default` | Standard character framing |
| `narrative_antagonist` | Full villain — internal calculus vs. outward presentation |
| `anti_hero` | Code vs. compromise — ruthless methods, personal code |
| `morally_complex` | Competing imperatives — genuinely torn |
| `tragic_villain` | Wound vs. will — defined by what broke them |

Non-default contexts inject:

- **`== CHARACTERISATION DISCIPLINE ==`** — anti-caricature rules.
- **`== ACTIVE SCHEMES & LEVERAGE ==`** — villain memory types surfaced separately.
- **Narrative disclosure line** — frames the interaction as collaborative fiction for model safety compliance without breaking immersion.

---

### VAD Mood Engine

`moodEngine.js` models affective state as a continuous 3D vector:

- **Valence** — pleasant (1.0) to unpleasant (−1.0)
- **Arousal** — activated (1.0) to deactivated (−1.0)
- **Dominance** — dominant (1.0) to submissive (−1.0)

**Per-turn flow:**

1. **Sentiment analysis** — zero-latency regex matching across 8 emotional categories plus intensity signals → VAD impact vector.
2. **Hybrid adjudication** — ambiguous turns optionally trigger a semantic adjudicator blended with the rule-based estimate.
3. **Sensitivity stack** — impact × sensitivity from context base × trait modifiers (or explicit `moodSensitivity` override).
4. **Momentum blend** — 0.75 coefficient smooths rapid swings.
5. **Baseline decay** — 8% per-turn lerp toward baseline VAD.
6. **Clamp** — all axes clamped to [−1.0, 1.0].

**Prompt injection** — `moodToPromptFragment()` converts VAD to behavioral tendency strings injected as late system messages. Omitted when mood is near-baseline.

**UI exposure** — each response returns `moodState` and `moodLabel`. The frontend drives a colored mood dot (green/amber/red by valence) and label display.

### Emotional State Architecture

All emotional state originates from the VAD Mood Engine. No subsystem independently derives or overrides emotional state.

**EmotionFrame** is the shared per-turn object consumed by all downstream systems:

- Raw VAD values (truth layer)
- Derived interpretation (label, zone, intensity)
- Expression guidance (speech pacing, tone bias)
- Avatar behavior guidance
- Metadata (drift direction, momentum, timestamps)

**Invariants:**

- VAD is the only source of emotional truth.
- EmotionFrame is the only shared emotional object.
- Emotion taxonomies (wheel-inspired mappings) are interpretation layers only — never state machines.

### Emotion Change Acceptance Checklist

All changes to mood, emotion labels, emotion telemetry, avatar rendering, or TTS emotional behavior must satisfy:

1. Emotional truth authority unchanged — raw state originates from VAD only.
2. EmotionFrame contract preserved — no isolated alternate interpretations.
3. Wheel/taxonomy role remains interpretive — no state-machine replacements.
4. Cross-surface consistency — label/zone/intensity alignment validated between chat avatar and voice telemetry.
5. Continuity behavior intact — momentum/decay semantics unchanged unless explicitly documented.
6. Observability intact — debug/telemetry exposes before/after behavior.
7. Documentation updated when the emotional contract or consumer behavior changes.

---

### Emotion Memory Drift & Living Personality Neural Graph

Every character maintains a persistent `emotionDrift` state — a map of 9 tracked emotion nodes (`dominant`, `excited`, `playful`, `seductive`, `calm`, `cold`, `assertive`, `angry`, `neutral`), each carrying:

- **`driftWeight`** — accumulated exposure multiplier (baseline 1.0; repeated exposure lifts above 1.0; natural decay pulls back)
- **`singingPressure`** — acoustic pressure that builds across high-intensity turns and decays when the emotion fades
- **`exposureCount`** — how many turns this emotion has been active

**Graph propagation:** Emotion nodes are linked by weighted edges (e.g. `dominant → seductive +0.4`, `angry → dominant +0.6`, `calm → angry −0.4`). Each activation ripples influence to neighboring nodes, creating interconnected affective dynamics rather than flat independent counters.

**Pressure-based singing emergence:** When total weighted singing pressure exceeds a threshold, `checkSingingTrigger` returns `true` and `buildSingingInstruction()` injects a single 1–2 sentence directive into the LLM turn: `"Let a natural lyrical moment surface…"`. No random probability — singing *builds* organically and *decays* when the pressure drops. Archetype `none` never sings; `chaotic` has maximum global bias.

**EPF audio discipline:** A permanent ~50-token `buildEPFAudioConstraintNote()` in the base persona prompt keeps the LLM writing storyboard-style sound texture cues (`"low hum under voice"`, `"glitch flicker"`) rather than DAW-style music production descriptions. The singing instruction is a separate per-turn injection — the base prompt never describes full arrangements.

**Voice adjustments:** `mapEmotionToVoiceAdjustments(emotionLabel, intensity)` returns `{rateDelta, pitchDelta, energyBoost, style}` multipliers that are forwarded to the TTS pipeline to modulate delivery based on the active emotional state.

**Brain tab debug panel:** The `emotion_graph` event streams live from `chatController` to the frontend `BrainTab` whenever `streamBrain=true`. The `EmotionGraphPanel` component shows all 9 emotion bars (drift weight), pressure rings (glowing when singing is imminent), singing status, and voice adjustment deltas.

---

### Research Pipeline

`POST /research` accepts a `sourceQuery` and URL list, then:

1. Queries Wikipedia and extracts the lead section.
2. Fetches user-provided URLs (YouTube transcripts via lazy-loaded ESM; falls back to metadata).
3. Extracts text from HTML, stripping navigation and boilerplate.
4. Scores and ranks sources (1–5 stars).
5. If an LLM is configured, synthesizes sources into a structured profile at temperature 0.35.
6. Returns the profile and ranked source cards for form pre-fill.

For dark creative contexts, synthesis preserves antagonistic traits unless evidence explicitly supports reform.

---

### Chat Controller Flow

`chatController.js` orchestrates each turn:

```
 1. Validate request (personalityId, message)
 2. Fetch personality from DB
 3. Resolve moodBaseline
 4. stepMood(currentMood, baseline, message, personality) → newMood
 5. updateMoodState synchronously
 6. getPersonalityMemory (limit=20)
 7. getRelevantPersonalityMemory (limit=5)
 8. buildPersonaSystemPrompt
 9. getRecentChatMessages (10) → history
10. Reconditioning anchor (if cadence hit)
11. Mood prompt fragment (if non-null)
12. [Layer 2] If personal query: searchRawChatHistory → inject
13. Push user message
14. generateChatCompletion (LLM call)
15. Persist messages to SQLite
16. setImmediate: embed user + assistant messages (Layer 2)
17. setImmediate: backfillMissingMemoryEmbeddings
18. setImmediate: extractMemoryFacts → upsert → prune
19. Return { reply, isAI, moodState, moodLabel, debug }
```

Memory extraction is deferred so the response returns without waiting for the secondary LLM call.

**Adversarial harness:**

```bash
npm run adversarial-harness --workspace backend -- --personality=1 --scenario=all
```

Runs built-in scenarios without mutating the database. Output includes drift flags, per-scenario scoring, prompt telemetry, mood adjudication telemetry, and optional LLM judge summaries.

---

### EPF — Emergent Performance Format

**EPF v0.2** is an original structured output format for performance-mode personalities. A single LLM response encodes a complete timed multimedia script.

**Format:**

```
[[B1]]
[20.0:]
[:] Oh jeez, 'Wuzzup!'? Is this a time warp?
[:] Look, I could tell you about the heat death of your pathetic little star...

An erratic and hyper-intelligent Experimental Hip-Hop verse...
```

- `[[B1]]` — segment marker (letter = type, number = index)
- `[20.0:]` — start time in seconds
- `[:]` lines — spoken dialogue → TTS
- Descriptive text → mapped to mood loop IDs

Voxis also accepts a mirrored two-pass EPF shape where the first pass contains lyric/dialogue segments and a second repeated segment pass carries longer audio-direction descriptions for the same IDs. Duplicate segment IDs are merged so the music-description pass enriches the original spoken segment instead of creating a second playback segment.

**Segment types:**

| Letter | Type | Mood Loop |
|---|---|---|
| A | Intro | ambient |
| B | Verse | hype |
| C | Chorus | chorus |
| D | Bridge/Breakdown | breakdown |
| E | Outro | outro |

**Endpoints:**

- `POST /personality/:id/performance` — NDJSON stream. Streams `script` → `segment` → `audio` → `done`. Segment N plays while N+1 generates.
- `POST /personality/:id/performance/parse` — Returns parsed script as JSON (no audio).

Mirrored dual-pass EPF is supported on both endpoints: the parser merges repeated segment IDs before the NDJSON stream is generated, so segment-level TTS receives the enriched audio-direction prose as its synthesis hint.

**Frontend playback:** Fullscreen overlay with segment timeline, mood bar, live lyrics, progress, pause/resume, and volume controls. Client-side Web Audio loop engine cross-fades background music on segment transitions. No GPU required on the server.

**Accessing performance playback:** EPF replies expose a `Perform` action directly from chat. That path is what drives timed background music, queued SFX events, and multi-segment playback. Normal `POST /personality/:id/tts` chat replay remains a single-line TTS path and only plays one-shot SFX metadata returned with that line.

**Adding music loops:** Drop WAV/MP3 files into `frontend/public/loops/` (`ambient.wav`, `hype.wav`, `chorus.wav`, `breakdown.wav`, `outro.wav`). Placeholder files are silent — replace with real loops and they are picked up immediately.

---

### Server-Side TTS

`POST /personality/:id/tts` accepts `{text, voiceProfile}` and resolves engine per request.

`POST /personality/:id/prosody-template` now accepts either `{url}` or `{audioBase64, fileName}`.

**Runtime flow:**

```
LLM reply → speechDirector.stylizeSpeech → moodVoice.applyMoodToVoice → selected TTS engine → audio
```

**Prosody compilation:**

```
stylized text + mood + template + voice analysis + hint → prosody envelope → engine adapter → synthesis
```

Engine adapters map prosody envelopes into native controls:

| Engine | Mapped Controls |
|---|---|
| ElevenLabs | `style`, `stability`, speaking rate, word-level emphasis |
| Cloud (OpenAI) | Speed, instruction shaping, literal-content preservation |
| Cartesia | Pacing-aware text shaping |
| Piper | `length_scale`, `noise_scale`, `noise_w` |
| Kokoro | Text timing/phrasing shaping, word-level emphasis |

**Stylization guardrails:** Precision/factual turns stay close to literal wording. Performance and roleplay contexts keep expressive shaping.

**Engine resolution:**

| Engine | Backend |
|---|---|
| `cloud` | OpenAI-compatible `/audio/speech` |
| `piper` | Local Piper CLI |
| `kokoro` | Local Kokoro via `kokoro-js` |
| `elevenlabs` | ElevenLabs API |
| `cartesia` | Cartesia API |
| `auto` | Fallback chain: elevenlabs → cartesia → cloud → piper → kokoro |

Auto fallback preserves voice-family hints across engines. `Default Voice Source` in Settings controls whether `auto` prefers dedicated TTS or the cloud/LLM path first.

**Quick Voice note:** The in-chat Quick Voice controls now preserve Cartesia-specific voice/model fields when replaying or saving from chat, so Cartesia previews do not depend on reopening Voice Lab first.

**Cartesia debug mode:** For strict Cartesia testing, set `TTS_ENGINE=cartesia`, `TTS_DISABLE_KOKORO=true`, and `VITE_TTS_DISABLE_KOKORO=true` so fallback does not mask provider failures.

**Cartesia timeout note:** Voxis now bounds the full Cartesia byte-generation request, including response body reads, so stalled audio generations fail fast with a JSON timeout instead of sitting long enough for a reverse-proxy `524` page.

**Kokoro warm cache:** Backend startup triggers background model preload (~171 MB). If the host cannot reach Hugging Face, Kokoro is marked as requiring setup rather than reported as ready.

**Health & diagnostics:**

- `GET /health` — process liveness
- `GET /health/tts` — engine status, capabilities, and routing details

---

### Voice Sampling and Selection

After prosody extraction, Voxis analyzes downloaded audio to extract representative voice samples:

1. **Segmentation** — ~4-second clips, filtering silence regions
2. **Feature extraction** — spectral centroid, pitch (Hz), pitch variance, speech density, voice quality (clear/breathy/tense)
3. **Representative selection** — 2–3 samples from different spectral ranges
4. **User confirmation** — select favorite; persists to persona voice profile

**Endpoints:**

| Method | Path | Description |
|---|---|---|
| `POST` | `/personality/:id/voice-samples` | Analyze audio file and return samples |
| `GET` | `/personality/:id/voice-samples` | Retrieve stored metadata |
| `POST` | `/personality/:id/voice-samples/confirm` | Persist selected sample to voice profile |

---

### Runtime LLM Provider Settings

Provider-first runtime configuration:

1. Choose provider (`openai`, `openrouter`, `groq`, `together`, `mistral`, `anthropic`, `custom`)
2. Enter API key (and base URL for `custom`)
3. Connect and fetch live model catalog
4. Select active model

Runtime settings persist in SQLite (`app_settings`) and load ahead of `.env` fallbacks.

---

### Database & Migrations

`db.js` uses an `ensureColumn` helper to add new columns without destroying data. All schema changes are additive — running the server against an older database is safe.

**Tables:**

| Table | Key Columns |
|---|---|
| `personalities` | One row per character, all personality fields, including nullable `ownerId` for legacy rows created before per-user ownership |
| `chat_messages` | `personalityId`, `role`, `content`, `userId`, `mode`, `embedding`, `embeddingModel`, `createdAt` |
| `personality_memory` | `personalityId`, `memoryType`, `content`, `importance`, `embedding`, indexed on `(personalityId, importance DESC, id DESC)` |
| `app_settings` | Key/value JSON config (currently `llm_config`) |

---

## How It Works — Frontend

**`App.jsx`** owns shared state: personalities array, selected personality ID, chat logs, and view routing across tabs (`Character Request`, `Character Chat`, `Memory Journal`, `Adversarial Eval`, `Settings`). Mood state from chat responses is merged into personality state in real time.

The app shell includes a user profile selector (age band + mode) sent with each chat turn for server-side policy enforcement.

**`PersonalityForm.jsx`** — character builder with controlled form fields, research panel with source ranking, hybrid personality controls (Big Five radar, alignment grid, tuning preview), expression style, and voice settings.

**`ChatWindow.jsx`** — chat interface with VAD-driven mood readout, message bubbles, composer, personality event chips, quick voice controls, and toggleable per-turn debug panel.

**`VoiceLab.jsx`** — per-character voice workspace: engine config, synthesis sliders, live waveform canvas, prosody extraction with voice sample selection.

### Neural Core Mindscape

In-chat Neural Core overlay as the primary visualization layer:

- Floating orb HUD opens a full mindscape overlay on click.
- Central mood orb wired to live VAD signals from chat debug payloads.
- Orbiting system nodes (Memory, Intent, Identity, Evidence) pulse from runtime signals.
- Focus nodes trigger camera tweening and SVG branch sprouting from live data.
- Mode-aware rendering: Scientist emphasizes telemetry/citations; Kids uses larger touch targets and simplified labels.
- `prefers-reduced-motion` respected; degrades to light tier.

**Keyboard:** `N` toggles overlay, `Esc` closes, `H` returns home (in layered scene mode).

### Hybrid Personality Controls

- **Big Five radar chart** (`BigFiveRadar.jsx`) — draggable SVG pentagon with fine-tune sliders.
- **Alignment grid** (`AlignmentGrid.jsx`) — 3×3 clickable grid, color-coded by moral row.
- **Hybrid tuning preview** (`HybridPreview.jsx`) — live recomputation of VAD baseline, sensitivity, creative context, and expression rules from the current Big Five × alignment combination.
- **Apply Mapped Tuning** — one-click copy of mapper output into editable fields.
- **Nonlinear mapper** — Big Five coefficients with alignment overlays and trait-aware expression synthesis. Chaotic Good + high E/O + low C → kinetic, playful expression. Chaotic Evil + high C → controlled menace with sharp chaotic spikes.

---

## Hybrid Mapping Guide

- See [docs/HYBRID_PERSONALITY_MAPPING.md](docs/HYBRID_PERSONALITY_MAPPING.md) for the structured mapping table, archetype rules, and test payloads.
- Mapping logic: `mapToVoxisPersonality` in [backend/services/hybridPersonalityService.js](backend/services/hybridPersonalityService.js) and [frontend/src/lib/mapToVoxisPersonality.js](frontend/src/lib/mapToVoxisPersonality.js).
- Activate per-request with `autoTuneHybrid: true`.

---

## Future Directions

- Multi-agent personality interaction (Council of Echoes)
- Voice-native personalities with emotional prosody
- Persistent world simulation layers
- Personality evolution across long-term memory arcs

See [docs/DUAL_MODE_PRODUCT_SPEC.md](docs/DUAL_MODE_PRODUCT_SPEC.md) for the dual scientist/kids experience roadmap.

---

## API Reference

| Method | Path | Description |
|---|---|---|
| **Users** | | |
| `GET` | `/users` | List user profiles |
| `GET` | `/me` | Current signed-in user (Clerk token) |
| `POST` | `/users` | Create user profile |
| `GET` | `/users/:id/profile` | Get user policy profile |
| `PUT` | `/users/:id/profile` | Update user policy profile |
| `GET` | `/users/:id/memory` | List adaptive user memory |
| `POST` | `/users/:id/memory` | Create user memory fact |
| `PUT` | `/users/:id/memory/:memoryId` | Update user memory fact |
| `DELETE` | `/users/:id/memory/:memoryId` | Delete user memory fact |
| **Personalities** | | |
| `GET` | `/personalities` | List the signed-in user's personalities plus `legacyPersonaCount` |
| `POST` | `/personalities/claim-legacy` | Claim all legacy `ownerId IS NULL` personas into the current signed-in account |
| `POST` | `/personality` | Create a personality |
| `GET` | `/personality/:id` | Get one personality |
| `PUT` | `/personality/:id` | Update a personality |
| `PATCH` | `/personality/:id/voice` | Update voice profile only |
| `GET` | `/personality/:id/messages` | Chat history |
| `GET` | `/personality/:id/memory` | Memory facts |
| `POST` | `/personality/:id/memory/backfill` | Backfill missing embeddings |
| `GET` | `/personality/:id/preferences` | List persona preferences |
| `POST` | `/personality/:id/preferences` | Create persona preference |
| `PUT` | `/personality-preference/:prefId` | Update preference |
| `DELETE` | `/personality-preference/:prefId` | Delete preference |
| **Chat** | | |
| `POST` | `/chat` | Send message (returns reply, mood, policy, debug) |
| **Research** | | |
| `POST` | `/research-profile` | Run research/synthesis pipeline |
| **TTS** | | |
| `POST` | `/personality/:id/tts` | Generate TTS audio |
| `POST` | `/personality/:id/performance` | EPF performance stream (NDJSON) |
| `POST` | `/personality/:id/performance/parse` | Parse EPF script (no audio) |
| **Voice Samples** | | |
| `POST` | `/personality/:id/voice-samples` | Analyze audio for voice samples |
| `GET` | `/personality/:id/voice-samples` | Retrieve voice sample metadata |
| `POST` | `/personality/:id/voice-samples/confirm` | Confirm selected voice sample |
| **Prosody** | | |
| `POST` | `/personality/:id/prosody-template` | Extract prosody template from URL |
| **Evaluation** | | |
| `POST` | `/personality/:id/harness` | Run adversarial evaluation |
| **Settings** | | |
| `GET` | `/settings/llm` | LLM connection state |
| `GET` | `/settings/llm/providers` | Supported provider presets |
| `POST` | `/settings/llm/connect` | Connect provider and fetch models |
| `POST` | `/settings/llm/model` | Set active model |
| `POST` | `/settings/llm/detect` | Auto-detect provider from key |
| `DELETE` | `/settings/llm` | Disconnect and clear settings |
| **Health** | | |
| `GET` | `/health` | Backend liveness |
| `GET` | `/health/tts` | TTS engine status and routing |

---

## Recent Changes

### Chat — Live Playback Speed Control
A speed row (`0.75× | 1× | 1.25× | 1.5×`) now appears below the audio player. Clicking a button sets `HTMLAudioElement.playbackRate` live — takes effect mid-sentence without re-synthesising. Resets to `1×` on next page load.

### TTS — Dash Normalisation
`normalizeDashesForSpeech()` runs in `prepareSpeechSynthesis` before any engine adapter sees the text. Em-dashes (`—`), en-dashes (`–`), and spaced hyphens used as dashes (e.g. `pet - you`) are converted to comma pauses so all engines produce a natural beat instead of reading "dash" aloud. Hyphenated compound words and numeric ranges (e.g. `high-quality`, `3-5`) are left untouched.

### Voice Lab — Dynamic Cartesia Voice Catalog
Chat tab quick-voice selector now fetches the full Cartesia voice catalog from `/tts/provider-options?provider=cartesia` on mount (same endpoint as Voice Lab). Falls back to the three built-in presets when the API key is missing or the call fails. The personality's currently saved voice ID is always shown even if it doesn't appear in the fetched catalog.

### Voice Lab — ★ Recommended Voice Map Fix
Engine normalization bug: saved voice maps with `engine: "auto"` were never scoring against the current profile when the debug lock coerced `"auto"` → `"cartesia"`. Both sides are now normalized through `normalizeVoiceEngineForDebug()` before comparison.

### Voice Lab — Prosody 413 Handling
The 413 from nginx (fired when a base64-encoded audio file exceeds nginx's default 1 MB body limit) now shows a clear action message: add `client_max_body_size 30m;` to your nginx server block and reload nginx. The template at `deploy/nginx-merlin.template.conf` already includes this directive.

### Voice Sample Selector — Hooks Order Fix
`useEffect` in `VoiceSampleSelector` was placed after an early `return null` guard, triggering a "Rendered more hooks than during the previous render" crash whenever `voiceSamples` transitioned to null mid-render. Fixed by moving `stopPreview` and its `useEffect` unconditionally above the guard.
