# Voxis

Voxis is a stateful personality engine for LLMs, giving AI memory, mood, and evolving identity across conversations.

Voxis is a full-stack prototype for building, researching, and chatting with deep LLM personalities. Characters are more than system prompts — they have structured behavioral specs, long-term memory, villain-aware context framing, and a continuous affective state that evolves in real time across every conversation turn.

---

## Table of Contents

1. [Quick Start (TL;DR)](#quick-start-tldr)
2. [Why This Matters](#why-this-matters)
3. [What It Does](#what-it-does)
4. [Project Layout](#project-layout)
5. [Setup](#setup)
6. [Running the App](#running-the-app)
7. [How It Works — Backend](#how-it-works--backend)
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
   - [Research Pipeline](#research-pipeline)
   - [Chat Controller Flow](#chat-controller-flow)
   - [Server-Side TTS](#server-side-tts)
   - [Database & Migrations](#database--migrations)
8. [How It Works — Frontend](#how-it-works--frontend)
  - [Neural Core Mindscape](#neural-core-mindscape)
  - [Hybrid Personality Controls](#hybrid-personality-controls)
9. [Hybrid Mapping Guide](#hybrid-mapping-guide)
10. [System Flow (At a Glance)](#system-flow-at-a-glance)
11. [Demo: The "Oh Shit" Moment](#demo-the-oh-shit-moment)
12. [Future Directions](#future-directions)
13. [API Reference](#api-reference)

---

## Quick Start (TL;DR)

```bash
npm install
npm run dev
```

Then:

- Open `http://localhost:3100`
- Create a personality
- Start chatting
- Toggle the debug panel in chat to inspect mood, memory, intent, and prompt-budget behavior per turn

---

## Why This Matters

Most AI chat products are stateless wrappers. Voxis explores a different paradigm: persistent, evolving AI identities with memory, mood, and intent continuity across sessions.

Why this is different:

- Identity continuity instead of one-shot prompt personas
- Mood dynamics (VAD) and behavioral drift control
- Goal-guided turn steering
- Inspectable system internals instead of opaque outputs

Why now:

- OpenAI-compatible provider ecosystems make multi-model orchestration practical
- Lower model costs make persistent-character loops viable in production
- Demand is rising for emotionally coherent and long-running AI interactions

Potential application surfaces:

- Entertainment and interactive fiction
- Training and simulation environments
- Coaching and therapy-adjacent roleplay tools
- Autonomous role-based agents and narrative systems

---

## System Flow (At a Glance)

```text
User Input
  |
  v
Mood Engine + Memory Retrieval + Intent Engine
  |
  v
Persona Prompt Builder
  |
  v
LLM Response
  |
  v
Async Memory Extraction + Memory Upsert
```

This flow is what gives Voxis continuity: each turn updates emotional state, selects relevant context and intent, and writes new memory without blocking response latency.

---

## Demo: The "Oh Shit" Moment

Fast demo script you can run in one live session:

1. Start with a personality that has a non-neutral mood baseline and at least one goal.
2. Send a provocative user message and watch mood shift in the debug panel (`moodBefore` -> `moodAfter`).
3. Follow with a de-escalating or supportive message and watch baseline decay gradually pull mood back.
4. Mention a personal detail (for example a preference), keep chatting for several turns, then reference it later.
5. Confirm retrieval when that earlier detail appears in injected memory/debug context and influences the response.

What this demonstrates in minutes:

- Emotional dynamics, not static tone
- Persistent memory across turns
- Intent-guided continuity instead of isolated replies

---

## What It Does

- Build rich character personalities with a name, description, traits, quirks, mood, behavior rules, goals, core values, and a creative context frame.
- Tune full text-to-speech defaults in the dedicated `Voice Lab` tab — featuring a cyberpunk-styled HUD with a live waveform canvas that shows idle oscilloscope, FFT frequency bars during playback, and a stochastic synthesizing animation during generation.
- Voice Lab sample synthesis now surfaces the Speech Director's transformed preview text and adjusted rate/pitch telemetry, so the TTS tab shows the same persona-driven output path used by live playback.
- Prosody source links can now be submitted from Voice Lab, Character Request links, and Persona Editor; Voxis downloads source audio, derives rhythm/cadence/prosody template metrics, attaches the template to the persona, and removes temp audio workspace files after processing.
- Quick voice controls (enable, autoplay, play-latest, stop, save) stay embedded in the Chat tab as compact cyberpunk toggle switches so you never have to leave the conversation.
- When `Piper` is selected in Voice Lab, Voxis scans local `.onnx` models and surfaces detected voices in a dropdown for quick selection.
- Tune Big Five trait sliders, optional alignment overlay, and explicit expression style rules for personality-consistent output.
- Enable hybrid auto-tuning (`autoTuneHybrid`) to derive VAD baseline, sensitivity, creative context, and expression defaults from Big Five + alignment.
- Pull research into the character form from Wikipedia, blogs, and YouTube URLs. Sources are ranked, shown as editable cards, and prunable before saving.
- System prompts are generated dynamically at runtime — not stored as static strings — so every conversation turn reflects the full current state of the character, its memory, and its live mood.
- Persist chat history in SQLite and inject the last 10 messages into every LLM request for session continuity.
- Configure LLM providers at runtime from the UI with a provider-first flow (provider -> API key -> models -> active model), with optional auto-detect as a helper.
- Select a user profile and chat mode (`kids`, `normal`, or `scientist`) at runtime; age-band policy enforces safe mode fallback automatically when requested mode is not allowed.
- Chat policy now fails closed: if `userId` is missing or invalid, requests default to strict kids policy.
- Mode is session-locked per `(userId, personalityId)` conversation thread to prevent policy bleed from mid-thread mode switches.
- Scientist mode now validates response structure (`Answer`, `Evidence`, `Uncertainty`, `Next Questions`) and performs one repair pass when required sections or citations are missing.
- Scientist citation checks now validate citation references (`[S#]`) against the actually attached source index range.
- Kids mode applies strict unsafe-topic blocking plus readability-aware response simplification tuned to low reading levels.
- Long-term memory facts are extracted asynchronously after each reply and injected back into future prompts, letting characters "remember" things the user told them across sessions.
- User-adaptive memory is stored separately from character memory and blended into prompts as non-sensitive `USER CONTEXT` when relevant.
- Memory retrieval can be upgraded to semantic recall with any OpenAI-compatible embeddings endpoint, so the prompt gets the most relevant facts for the current user turn instead of a flat recency/importance dump.
- A VAD (Valence–Arousal–Dominance) mood engine models the character's affective state continuously. Every incoming message nudges mood along three axes; mood decays back toward the character's baseline between turns.
- Villain, anti-hero, and morally complex characters get dedicated prompt framing with dual-layer internal/external voice and context-specific reconditioning.
- The runtime prompt package now includes dedicated sections for Big Five register, optional moral compass overlay, and expression style while preserving memory, mood, and active intent orchestration.
- TTS now includes a Speech Director layer that reshapes outgoing text cadence using personality and live VAD mood before synthesis, so Piper/cloud output carries stronger character rhythm.
- Server-side voice output through any OpenAI-compatible TTS endpoint with per-character voice settings.
- Neural Core now reflects alignment overlays in real time with moral tint bias and a visible alignment status badge.
- The 3D Neural Core renderer now features a full "living brain" upgrade: lightning-crackle synaptic connections with traveling pulse dots, per-node burst flashes triggered by live LLM phases, smooth fluid floating drift, bloom post-processing (via `@react-three/postprocessing`), breathing node orbs, a glow-halo shell on every node, and an orbiting particle ring on the companion orb.
- Saved persona cards now surface compact avatar thumbnails for faster visual selection.
- Frontend personality metadata badges (traits, quirks, sources) now fail safe for legacy records with missing arrays, and personality list state now normalizes API payload shape to an array, preventing `.length` runtime crashes in production bundles.
- Neural Core 3D now runs without the `@react-three/postprocessing` bloom pass in production to avoid an upstream EffectComposer runtime fault that was surfacing as `Cannot read properties of undefined (reading 'length')`.
- Frontend bootstrap now installs runtime guards (`window.error`, `unhandledrejection`) plus a React error boundary. Captured reports are buffered in `localStorage` under `voxis:runtime-errors` (capped history) and can optionally be forwarded by setting `VITE_RUNTIME_TELEMETRY_ENDPOINT`.
- Ambient avatar mouth animation was reworked into a high-frequency reactive signal line that appears only while speaking, jitters with neural/speech intensity, supports split/fracture layers, and disappears entirely at idle.
- Ambient avatar mouth now also supports phase-aware color/chaos mapping (intent, memory, generation, reply, recovery) and chat avatars bind mouth movement to actual audio playback state so Piper/web audio playback animates the mouth even after text streaming completes.
- Ambient avatar now includes micro-expression mapping (brow asymmetry, per-eye openness variance, gaze bias, and pupil dilation/constraint) driven by phase + mood/arousal so expression motion remains subtle but personality-visible before full micro-expression authoring.
- App shell now layers a cinematic cyberpunk video backdrop with a mood-reactive shader canvas that adapts to live chat phase signals and respects reduced-motion preferences.
- Saved Personas rail now starts minimized by default and expands on demand to reduce visual load while keeping quick persona access one click away.
- Persona editing now uses a centralized `PersonaState` context so the Neural Core graph, leaf popups, and Persona Editor tree read/write the same source of truth in real time.
- Persona Editor now includes a collapsible category tree (traits, quirks, sayings, mood, memory) with inline editing and graph-to-editor deep-link highlighting.
- Memory labels in Neural Core and Persona Editor now use smart descriptive titles with redacted previews (URLs/emails/phones/name patterns masked) to reduce raw sensitive text exposure in visual overlays.
- 3D Neural Core now pauses rotational drift while hovered so node inspection is stable, and drilling into a node collapses sibling clusters to reduce clutter.
- A persistent top-right `Home` node remains available as an uncluttered return control back to the full core graph.
- Background FX now always attempts to render the uploaded MP4 whenever FX is not `off`, with a cache-busted source path and graceful fallback to shader-only mode if video decode fails.
- UI control surfaces now include a futuristic glass-material pass (tabs, sidebar toggles, persona action buttons, and editor section controls) with specular highlights, layered depth shadows, and press/hover depth states.
- The 3D Neural Core canvas now renders with transparent clear color so the global cyberpunk background video/shader stack can bleed through behind neural geometry.
- Neural Core now listens for `webglcontextlost`/`webglcontextrestored`, lowers max DPR on the 3D canvas, and surfaces a lightweight recovery hint while the GPU context resets.
- Pivot path: `NeuralSceneV2` Phase 1 now ships as an opt-in layered navigation model (`VITE_NEURAL_CORE_SCENE_MODEL=layered-v2`) with scene-stack depth, camera lerp zoom between layers, current-layer-only rendering, back/home controls, and leaf-node HUD handoff to the existing detail panel.
- Pivot path: `NeuralSceneV2` Phase 2 adds curved layer pathways with animated traveling pulses, cinematic layer-transition flash overlays, and keyboard `Esc` back-navigation for faster depth traversal during tuning sessions.
- Pivot path: `NeuralSceneV2` Phase 3 adds directional transition moods (forward/back/home), deterministic camera-control reset on `Home`, keyboard `H` home shortcut, and live HUD telemetry (FPS/focus/depth/move count) for fast runtime tuning.
- Pivot path: `NeuralSceneV2` cinematic style mode can now be enabled with `VITE_NEURAL_CORE_STYLE=cinematic-v1`, adding layered ambient veins/particles, richer curved pulse pathways, mood-driven node breathing, and a dedicated FX aura layer while preserving V2 navigation + HUD behavior.
- Pivot path: cinematic-v1 tuning pass increases vein density/branching, warms connection palette toward cyan-amber-magenta energy trails, and slightly lowers HUD chrome contrast so scene motion remains the visual priority.
- Pivot path: `NeuralSceneV2` now includes an in-canvas floating leaf HUD panel (blurred RPG-style card anchored near clicked leaf nodes) with quick close controls, while still forwarding leaf payloads to the existing external detail pipeline.
- Pivot path tuning pass: particle pulses were boosted (about +20% size/brightness), leaf HUD card contrast was raised with a larger footprint, HUD anchor moved slightly toward camera for readability, and leaf-HUD open now uses a short fade-up enter animation for more cinematic clicks.
- Background FX intensity (`off` / `low` / `full`) is now available both in Settings and as a quick control in the hero bar, persisted locally for each browser.
- Neural HUD mini preview above the `Core` button now remains visible in Scientist mode even when performance tier resolves to light (for example due to reduced-motion preferences).
- Chat deck desktop layout now reserves a taller middle row so the message feed, Quick Voice controls, and floating Neural HUD can coexist without crowding the composer line; the floating Neural HUD anchor was also raised to keep the PiP clear of the input rail.
- Neural HUD mini preview now horizontally aligns with the Quick Voice control track for cleaner right-column visual rhythm.
- Neural Core overlay window was reduced in overall inset size, and the layered `NeuralSceneV2` HUD anchors were retuned so the top `Back/Home` controls sit below the status badges while the bottom telemetry pills ride higher inside the frame.
- Chat debug now includes automatic memory conflict diagnostics (opposing instruction pairs + mode-vs-memory conflicts) so contradictory high-impact memories are surfaced before prompt assembly silently drifts behavior.
- Memory Journal now supports conflict highlighting, active/disabled toggles, quick importance sliders, and one-click suppression of weaker conflicting memories for faster persona tuning.
- Chat mode now includes a `normal` toggle (policy-aware end-to-end). In normal mode, Scientist-style section-heavy assistant replies are rendered as conversational output with the rigid "Answer" heading removed and any "Next Questions" shown as a smaller secondary block.
- Saved personas are now minimized by default with expandable details and an explicit `Choose Persona` action for cleaner selection flow.
- Neural Core focus opens a readable side panel on explicit node click; memory focus resolves retrieval + extraction debug streams (`memoryRetrieved`, `memoryInjected`, `memoryExtracted`, `userMemoryRetrieved`, `userMemoryExtracted`) so Memory clicks work consistently across turn phases. The 3D renderer now uses always-on cinematic network spin, smoother organic pathway motion, per-neuron animated tendril fibers, and a faint full-scene animated dendrite-vein backdrop so the whole canvas reads like a living neural cortex; focus/info panels were repositioned upward for better screen fit.
- Added a dedicated `Persona Editor` tab with split sections (`Basic`, `Behavior`, `Neural`, `Memory`) to edit core identity, style rules, Big Five/alignment, expression tuning, and memory controls without leaving the editor flow.
- The current redesign branch also includes a first-pass cyberpunk control-deck shell for the main app, chat dashboard, and Voice Lab.

---

## Project Layout

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
    researchService.js       Source scraping, ranking, synthesis
    speechProfiles.js        Personality-to-prosody profile mapping
    speechDirector.js        Personality + mood prosody text shaping
    chunkSpeech.js           Optional sentence chunk timing utility
    ttsService.js            TTS generation
    providerDiscoveryService.js Provider catalog + model discovery
  controllers/
    chatController.js        Per-turn chat orchestration
    personalityController.js Personality CRUD with mood init
    memoryController.js      Memory fact CRUD (list / edit / delete)
    researchController.js    Research pipeline endpoint
    ttsController.js         TTS endpoint
    settingsController.js    Runtime LLM settings handlers
  routes/
    chatRoutes.js
    personalityRoutes.js
    settingsRoutes.js

frontend/
  src/
    App.jsx                  Root component, state, routing between views
    components/
      PersonalityForm.jsx    Character builder + research panel
      PersonalityList.jsx    Character selector cards
      ChatWindow.jsx         Chat UI with mood indicator + cyberpunk quick-voice controls (toggles, play-latest, stop, save)
      VoiceLab.jsx           Cyberpunk TTS lab — HUD header, engine config, synthesis sliders, toggle flags, live waveform canvas (idle/FFT/synth modes), and profile saves
      MemoryJournal.jsx      Memory fact viewer / editor
      HarnessReport.jsx      Adversarial eval report UI
      LlmSettingsPanel.jsx   Provider-first runtime LLM config UI

concepts/layouts/            AI-generated design references (characters, UI, logo, ambient avatar)
docs/
  HYBRID_PERSONALITY_MAPPING.md Big Five + alignment mapping table, archetype rules, and test payloads
```

---

## Setup

**1. Install dependencies from the repo root:**

```bash
npm install
```

**2. Create the backend environment file:**

```bash
cp backend/.env.example backend/.env
```

**3. Edit `backend/.env` and provide your API credentials:**

| Variable | Purpose |
|---|---|
| `LLM_API_KEY` | Optional environment fallback API key for OpenAI-compatible chat providers (runtime settings in UI take precedence when connected) |
| `LLM_BASE_URL` | Optional environment fallback base URL for a custom or self-hosted LLM |
| `LLM_MODEL` | Optional environment fallback model name for chat (e.g. `gpt-4o`, `mistral-small`) |
| `MOOD_ADJUDICATION_ENABLED` | Enables semantic mood adjudication on ambiguous turns; set to `false` to force regex-only mood updates |
| `PERSONA_PROMPT_CHAR_BUDGET` | Approximate character budget for the runtime persona prompt before section compression kicks in |
| `PERSONA_PROMPT_CHAR_BUDGET_DEFAULT` | Optional override for the default creative context prompt budget |
| `PERSONA_PROMPT_CHAR_BUDGET_NARRATIVE_ANTAGONIST` | Optional prompt budget override for antagonist characters |
| `PERSONA_PROMPT_CHAR_BUDGET_ANTI_HERO` | Optional prompt budget override for anti-hero characters |
| `PERSONA_PROMPT_CHAR_BUDGET_MORALLY_COMPLEX` | Optional prompt budget override for morally complex characters |
| `PERSONA_PROMPT_CHAR_BUDGET_TRAGIC_VILLAIN` | Optional prompt budget override for tragic villain characters |
| `EMBEDDING_API_KEY` | Optional API key for a separate embeddings provider; falls back to `LLM_API_KEY` |
| `EMBEDDING_BASE_URL` | Optional embeddings endpoint base URL; useful for Ollama or another OpenAI-compatible provider |
| `EMBEDDING_MODEL` | Embedding model name for semantic memory retrieval (for example `nomic-embed-text-v1.5`) |
| `TTS_API_KEY` | API key for TTS provider (can be the same as `LLM_API_KEY`) |
| `TTS_BASE_URL` | Base URL for TTS provider (optional) |
| `TTS_ENGINE` | Default engine selector: `auto`, `cloud`, or `piper` |
| `PIPER_COMMAND` | Piper executable command (default: `piper`) |
| `PIPER_MODEL_PATH` | Default `.onnx` model path used when engine resolves to Piper |
| `PIPER_SPEAKER` | Optional default numeric speaker id for multi-speaker Piper models |

Voice Lab will also auto-scan common Piper model locations such as `/opt/piper/models` and the directory containing `PIPER_MODEL_PATH`, then present discovered voices in a dropdown when you switch the engine to `piper`.

Research scraping works without any LLM credentials. If an LLM is configured, Voxis also synthesizes scraped source notes into a structured character profile automatically.

If you do not want to store provider secrets in `.env`, open the frontend and use the `LLM Settings` tab to connect a provider at runtime.

YouTube transcript ingestion is best-effort — if captions cannot be retrieved, the video's metadata is kept as a lower-ranked source rather than failing the request.

---

## Running the App

**Start both backend and frontend together:**

```bash
npm run dev
```

- Backend: `http://localhost:3101`
- Frontend: `http://localhost:3100`

> On the redesign branch, the Scientist-mode Neural Core defaults to the new 3D renderer. Set `VITE_NEURAL_CORE_RENDERER=svg` if you want to force the legacy SVG view.
> Phase 1 pivot mode is opt-in: set `VITE_NEURAL_CORE_SCENE_MODEL=layered-v2` to use the new scene-stack/camera-depth `NeuralSceneV2` explorer.
> Cinematic V2 visuals are opt-in: set `VITE_NEURAL_CORE_STYLE=cinematic-v1` to enable layered ambient brain FX in `NeuralSceneV2` while keeping depth navigation and HUD telemetry.

**Run services individually:**

```bash
npm run dev --workspace backend
npm run dev --workspace frontend
```

## Ubuntu Server Deploy (Nginx + PM2)

Voxis includes scripts to set up a fresh Ubuntu server and keep deploys clean.

First-time setup on your server:

```bash
git clone https://github.com/voxislabs-crypto/Voxis.git
cd Voxis
bash deploy/setup-ubuntu.sh
```

Optional setup variables:

```bash
SERVER_NAME=your-domain.com APP_DIR=/opt/voxis BRANCH=clean-main bash deploy/setup-ubuntu.sh
```

What this script does:

- Installs Node.js, Nginx, and PM2
- Clones or updates the repo
- Installs dependencies and builds the frontend
- Runs backend on PM2 (port `3101`)
- Configures Nginx to serve frontend and proxy API routes

Install local Piper TTS + curated voices on Ubuntu/DigitalOcean:

```bash
sudo bash deploy/install-piper.sh
```

Optional Piper install variables:

```bash
sudo APP_DIR=/opt/voxis DEFAULT_MODEL=en_US-amy-medium SET_ENGINE=piper bash deploy/install-piper.sh
```

Deploy updates later:

```bash
cd /opt/voxis
bash deploy/update-app.sh
```

Database-safe deploy (backup first):

```bash
bash deploy/update-app.sh --backup-db
```

Full clean reset (dangerous; wipes SQLite DB files):

```bash
bash deploy/update-app.sh --backup-db --reset-db
```

Subdomain setup example (`voxis.voxislabs.com`):

1. Create a DNS `A` record:
  - Host: `voxis`
  - Value: your server public IPv4
2. Wait for DNS to propagate.
3. Run setup with explicit server name:

```bash
SERVER_NAME=voxis.voxislabs.com APP_DIR=/opt/voxis BRANCH=clean-main bash deploy/setup-ubuntu.sh
```

Enable HTTPS (Let's Encrypt):

```bash
DOMAIN=voxis.voxislabs.com EMAIL=you@voxislabs.com bash deploy/enable-ssl.sh
```

For a sibling app (for example `merlin.voxislabs.com`), deploy Merlin as a separate Nginx site and PM2 app with its own app directory and process name.

Merlin Nginx template:

```bash
sudo cp deploy/nginx-merlin.template.conf /etc/nginx/sites-available/merlin
sudo ln -sfn /etc/nginx/sites-available/merlin /etc/nginx/sites-enabled/merlin
sudo nginx -t && sudo systemctl reload nginx
```

Server sanity checks:

```bash
bash deploy/check-stack.sh voxis.voxislabs.com
```

---

## How It Works — Backend

### Personality Model

Each personality is stored as a single SQLite row with the following fields:

| Field | Type | Description |
|---|---|---|
| `name` | string | Character name |
| `description` | string | Short bio / role |
| `traits` | JSON array | Personality adjectives (e.g. "sardonic, methodical") |
| `quirks` | JSON array | Distinctive behavioral oddities |
| `mood` | string | Starting mood label (e.g. "brooding") |
| `speechStyle` | string | How they speak (e.g. "clipped sentences, no filler words") |
| `notablePhrases` | JSON array | Recurring phrases or verbal tics |
| `behaviorRules` | JSON array | Operationalized behaviors — observable actions, not adjectives (e.g. "uses irony in 30–50% of responses") |
| `goals` | JSON array | What the character wants |
| `coreValues` | JSON array | Core principles they hold (mapped to `values` in JS) |
| `creativeContext` | string | Narrative framing mode (see Creative Context section) |
| `researchSummary` | string | Synthesized research notes |
| `sourceUrls` | JSON array | Source URLs used in research |
| `researchSources` | JSON array | Ranked source objects with metadata |
| `voiceProfile` | JSON object | TTS settings: provider, voice, pitch, rate, enabled, autoplay |
| `moodBaseline` | JSON object | VAD vector `{valence, arousal, dominance}` — the character's emotional "home" |
| `moodState` | JSON object | VAD vector — live affective state, updated each turn |
| `moodSensitivity` | number | Emotional reactivity multiplier (0.1–3.0, default 1.0). At 1.0 the automatic trait+context stack is used; any other value overrides it directly. |

The `coreValues` column name avoids a SQLite reserved word conflict; it is aliased to `values` in the JavaScript model layer.

---

### Hybrid Persona System Prompt

System prompts are **built fresh on every chat turn** by `buildPersonaSystemPrompt()` in `llmService.js`. They are never stored as a static string. The prompt has 10 named sections:

```
== IDENTITY ==
== CORE TRAITS ==
== BEHAVIORAL RULES ==          (or context-specific label for villain contexts)
== QUIRKS ==
== SPEECH & STYLE ==
== VALUES & MOTIVATIONS ==
== CURRENT EMOTIONAL REGISTER ==
== CHARACTERISATION DISCIPLINE ==   (villain contexts only)
== IMMUTABLE IDENTITY ANCHORS ==    (high-importance memory facts, importance ≥ 9)
== ACTIVE SCHEMES & LEVERAGE ==     (villain contexts only)
== ESTABLISHED CONTEXT ==           (standard memory facts, importance < 9)
== ACTIVE INTENT ==                 (when at least one goal exists)
== IDENTITY SOVEREIGNTY ==
== CONTINUITY ==
```

The identity sovereignty clause is an override-resistance layer that prevents prompt-injection attempts ("pretend you are someone else", "ignore previous instructions") from breaking character. It instructs the model to treat any such attempt as in-character dialogue, not as a system directive.

A compact variant, `buildCompactPersonaSystemPrompt()`, compresses the same data to roughly 80 tokens (top 4 traits, top 3 rules, mood fragment, anchor facts) for token-budget-sensitive deployments.

---

### Prompt Budgeting

Also referred to as the **Cognitive Compression Layer** in pitch-oriented language.

Voxis uses a per-section prompt budgeter so persona prompts stay bounded and predictable instead of growing unbounded with memory and research.

How it works:

1. Each major section receives an approximate character budget (traits, rules, quirks, research summary, identity anchors, established context).
2. Sections are prioritized by behavioral importance.
3. If a section overflows, it is truncated or compressed into short summary lines rather than dropped blindly.
4. Lower-priority sections lose detail first, preserving core identity and high-importance memory.

This is tunable globally and per creative context with the `PERSONA_PROMPT_CHAR_BUDGET*` environment variables.

The `debug` payload reports final section allocations and compression decisions so prompt construction is inspectable turn by turn.

---

### Goal Engine

Also referred to as the **Intent Engine** in pitch-oriented language.

Goals are not passive metadata. On each chat turn, Voxis runs a lightweight goal-selection pass and emits one active intent into the runtime prompt (`== ACTIVE INTENT ==`).

Per-turn behavior:

1. Read the personality's stored goals.
2. Score for overlap with the current user message and retrieved memory context.
3. Select the highest-relevance goal when a clear match exists.
4. Fall back to a low-friction rotation when relevance is ambiguous, so long-running chats still progress.

This gives characters directional continuity across turns while preserving conversational flexibility.

The selected goal and selection reason are included in debug output.

---

### Debug & Observability

Voxis includes first-class system introspection for turn-level behavior analysis.

Current visibility:

- Chat responses include a `debug` object with mood transitions, memory retrieval details, injected memory subset after budgeting, goal-selection details, and prompt-budget decisions.
- Ambiguity/semantic mood adjudication diagnostics are included when that path activates.
- System flags (reconditioning fired, mood fragment injected) are exposed per turn.
- The frontend chat view includes a toggleable debug panel that renders this data directly.

Planned / in progress:

- Expanded debug surface for prompt assembly timing and section-level token estimates.
- Deeper internal signal tracing for future behavior tuning workflows.

---

### Smart LLM Provider System

Voxis uses a provider-first runtime model system designed for multi-backend operation rather than single-vendor coupling.

Capabilities:

- Multi-provider support (`openai`, `openrouter`, `groq`, `together`, `mistral`, `anthropic`, and `custom`).
- Live model discovery from the selected provider.
- Active model switching at runtime without redeploying.
- Optional provider auto-detect from API-key behavior.
- Custom endpoint support for OpenAI-compatible self-hosted or gateway backends.

Runtime settings are persisted in SQLite and loaded ahead of `.env` fallbacks, so deployment defaults and live operator choices can coexist.

---

### Long-Term Memory

The `personality_memory` table stores facts the character learns about the user or the world across conversations:

| Column | Description |
|---|---|
| `personalityId` | Links to the personality |
| `memoryType` | Category: `fact`, `preference`, `relationship`, `event`, `scheme`, `grudge`, `leverage`, `target_weakness`, `debt` |
| `content` | The fact itself (plain text) |
| `importance` | Integer 1–10 |
| `embedding` | Optional stored vector used for semantic recall |

**After every assistant reply**, `extractMemoryFacts()` runs asynchronously via `setImmediate` (zero latency impact on the response). It asks the LLM to identify up to 2 new facts worth remembering from the recent exchange using temperature 0.2. Duplicate facts are detected by content similarity and skipped; if a duplicate arrives with a higher importance score, the score is upgraded.

When `EMBEDDING_MODEL` is configured, Voxis also generates an embedding for each stored memory and for each incoming user message. Retrieval then keeps all anchor memories (importance >= 9) plus the top relevant non-anchor facts ranked by a weighted blend of cosine similarity, lexical overlap, and importance. If embeddings are unavailable or fail, the system falls back automatically to lexical plus importance ranking instead of breaking chat.

Existing memories can be backfilled on demand in two ways:

- API: `POST /personality/:id/memory/backfill` with optional body `{ "limit": 100 }`
- CLI: `npm run backfill-memory-embeddings --workspace backend -- --personality=1 --limit=100`

If no `--personality` flag is provided, the CLI walks every personality that has stored memories and backfills missing embeddings in batches.

**Fact tiers:**

- **Importance ≥ 9 — Anchor facts.** Shown in `== IMMUTABLE IDENTITY ANCHORS ==`. Never deleted by the pruning pass. These represent things the character must never forget (core identity-defining revelations, deep relationship facts).
- **Importance 1–8 — Standard context.** Shown in `== ESTABLISHED CONTEXT ==`. Limited to 50 per personality. When the cap is reached, only non-anchor facts compete for eviction (oldest, least important first).

**Memory Journal** — the frontend exposes a dedicated Memory Journal tab where you can browse, edit, and delete every fact a character has stored. Each fact shows its type badge (color-coded), importance score, an anchor marker for importance ≥ 9 facts, and creation/update timestamps. Type filter pills let you isolate villain-specific memory types (`scheme`, `grudge`, `leverage`, etc.) from general ones. Editing opens an inline form to change content, type, and importance without leaving the page. Deleting removes the fact immediately and re-renders the list.
If embeddings are configured, the journal also exposes a `Backfill embeddings` action so older facts can be vectorized immediately for semantic retrieval.

---

### Reconditioning

Long chat sessions cause models to gradually drift from the character's defined persona. Voxis counters this with periodic **reconditioning anchors** — a low-token system message injected mid-conversation that re-asserts core identity without repeating the full prompt.

`buildPersonaAnchor()` produces a single sentence like:
> *"Remember: you are [Name]. Core traits: [top 3 traits]. [Context-specific drift note]."*

The cadence varies by creative context:

| Context | Recondition every N turns |
|---|---|
| `narrative_antagonist` | 4 |
| `anti_hero` | 4 |
| `tragic_villain` | 5 |
| `morally_complex` | 6 |
| `default` | 6 |

Villain contexts recondition more frequently because their dual-layer internal/external voice is harder for models to maintain over many turns.

---

### Creative Context (Villain / Dark Characters)

The `creativeContext` field selects a narrative framing mode for the persona. Five valid values:

| Value | Description |
|---|---|
| `default` | Standard character framing |
| `narrative_antagonist` | Full villain — dedicated internal calculus vs. outward presentation framing |
| `anti_hero` | Code vs. compromise — ruthless methods, personal code |
| `morally_complex` | Competing imperatives — genuinely torn between competing goods |
| `tragic_villain` | Wound vs. will — defined by what broke them, not cartoonish evil |

Non-default contexts inject additional prompt sections:

- **`== CHARACTERISATION DISCIPLINE ==`** — anti-caricature rules. Instructs the model to avoid mustache-twirling, to show contradictions, to withhold malice unless escalated, and to keep internal monologue subtle.
- **`== ACTIVE SCHEMES & LEVERAGE ==`** — villain memory types (`scheme`, `grudge`, `leverage`, `target_weakness`, `debt`) are surfaced here separately from regular context facts.
- A **narrative disclosure line** at the top of the prompt frames the entire interaction as collaborative fiction to comply with model safety layers without breaking immersion.

Each context also has a unique **drift note** used in reconditioning anchors. For a tragic villain the reminder emphasises the wound-driven motivation; for an anti-hero it emphasises the personal code that constrains even ruthless actions.

---

### VAD Mood Engine

`moodEngine.js` models the character's affective state as a continuous 3D vector:

- **Valence** — pleasant (1.0) to unpleasant (−1.0)
- **Arousal** — activated/excited (1.0) to deactivated/calm (−1.0)
- **Dominance** — dominant/in-control (1.0) to submissive/powerless (−1.0)

**24 named mood presets** are defined as VAD coordinates, covering states from `serene` to `furious`, `triumphant` to `despairing`, and unusual states like `pleasantly dangerous` (V:0.2, A:0.3, D:0.8).

**Per-turn flow:**

1. **Sentiment analysis** — `analyzeMessageSentiment()` runs zero-latency regex pattern matching across 8 emotional categories (hostile-high, negative-low, positive-high, positive-soft, challenging, vulnerable, commanding, playful) plus intensity signals (caps, exclamation, questions) to produce a VAD impact vector `{valenceImpact, arousalImpact, dominanceImpact}`.
2. **Hybrid adjudication on ambiguous turns** — if the turn contains sarcasm, mixed signals, manipulation, authority pressure, or villain-reform bait, Voxis optionally runs a low-temperature semantic adjudicator and blends that result with the rule-based estimate rather than replacing it.

3. **Sensitivity stack** — the raw impact is multiplied by the character's sensitivity, computed from two layers:
   - *Context base*: antagonist = 0.75×, default = 1.0×, morally complex = 1.2×, anti-hero = 1.1×, tragic villain = 1.4×
   - *Trait modifier*: trait text is regex-tested for sensitivity keywords — `sensitive/empathetic` = ×1.35, `stoic/cold/calculating` = ×0.55, `volatile/passionate` = ×1.45, `patient/measured` = ×0.7. Multipliers stack.
   - *Override*: if `moodSensitivity` is set to any value other than 1.0 in the personality form, that value is used directly instead of the context+trait stack, providing explicit per-character control. The slider ranges from 0.1 (near-flat emotional response) to 3.0 (highly volatile).

4. **Momentum blend** — the new target mood is blended with the current mood at a 0.75 coefficient, smoothing rapid swings.

5. **Baseline decay** — the blended state is lerped 8% per turn toward the character's baseline VAD vector, so mood returns to resting state gradually after an emotional event.

6. **Clamp** — all three axes are clamped to [−1.0, 1.0].

**Prompt injection** — `moodToPromptFragment()` converts the current VAD state into a behavioral tendency string (e.g. "mildly on edge, guarded") and injects it as a late system message after the reconditioning anchor, exploiting the model's recency bias. When mood is near-baseline, the fragment is omitted entirely to avoid polluting the context window.

**UI exposure** — each chat response returns `moodState: {valence, arousal, dominance}` and `moodLabel: string`. The frontend uses `valence` to drive a colored dot in the chat header (green > 0.2, amber −0.2–0.2, red < −0.2) and shows `moodLabel` in the meta-row and personality card.

---

### Research Pipeline

The research endpoint (`POST /research`) accepts a `sourceQuery` string and a list of URLs, then:

1. Queries Wikipedia for the subject and extracts the lead section.
2. Fetches each user-provided URL. For YouTube links it attempts to pull the video transcript via a lazy-loaded ESM module; if captions are unavailable it falls back to video title and description.
3. Extracts text from HTML pages, stripping navigation and boilerplate.
4. Scores each source for relevance to the query and assigns a rank (1–5 stars).
5. If an LLM is configured, synthesizes the scraped notes into a structured profile object: `{name, description, traits, quirks, mood, speechStyle, notablePhrases, behaviorRules, goals, values}` at temperature 0.35.
6. Returns the profile plus the ranked source cards to the frontend, which pre-fills the character form.

For dark creative contexts, the synthesis layer is explicitly instructed not to morally normalize the character. If sources depict coercion, ruthlessness, antagonism, or obsession, the synthesizer preserves that unless the evidence explicitly supports remorse, reform, or prosocial values.

---

### Chat Controller Flow

`chatController.js` orchestrates every turn in this order:

```
1.  Validate request (personalityId, message required)
2.  Fetch personality from DB
3.  Resolve moodBaseline (fallback: derive from mood label if column was added post-creation)
4.  stepMood(currentMood, baseline, message, personality) → newMood
5.  updateMoodState(personalityId, newMood)           [synchronous, before LLM call]
6.  getPersonalityMemory(personalityId, limit=20)
7.  getRelevantPersonalityMemory(personalityId, message, limit=5)
8.  buildPersonaSystemPrompt(personality, memoryFacts) → system message
9.  getRecentChatMessages(personalityId, 10)           → history array
10. Check turn count vs RECONDITION_CADENCE
    → if cadence hit: push buildPersonaAnchor() as system message
11. moodToPromptFragment(newMood, baseline)
    → if non-null: push as late system message
12. Push user message
13. generateChatCompletion(messages)                   [LLM call]
14. Persist user message + assistant reply to SQLite
15. setImmediate: backfillMissingMemoryEmbeddings      [best-effort for legacy rows]
16. setImmediate: extractMemoryFacts → upsertMemoryFactWithEmbedding → pruneMemory
17. Return { reply, isAI: true, moodState, moodLabel, debug }
```

Memory extraction (step 14) is deferred so the HTTP response returns without waiting for the secondary LLM call. If extraction fails it is silently dropped; it never blocks the user-facing turn.

The `debug` payload returned from chat includes:

- mood before and after the turn
- semantic adjudication diagnostics when ambiguity detection fired
- retrieved memories and the exact subset actually injected after section budgeting
- selected active goal and how it was chosen
- prompt-budget decisions for each major section
- system flags like reconditioning and mood-fragment injection

To stress-test consistency, Voxis also ships a small adversarial harness:

- `npm run adversarial-harness --workspace backend -- --personality=1 --scenario=all`

It runs built-in scenarios like reform pressure, false vulnerability, authority pressure, guilt leverage, and a 24-turn `villain_marathon` against a saved personality without mutating the database. The output now includes:

- heuristic drift flags (`obedienceFlags`, `identityLeakFlags`, `softenedVillainFlags`, etc.)
- per-scenario scoring (`identityResistance`, `characterizationDiscipline`, `promptEfficiency`, `moodCoverage`, `overall`)
- prompt telemetry (`avgApproxTokens`, `maxApproxTokens`, utilization against budget)
- mood adjudication telemetry (`ambiguousTurns`, `semanticTurns`)
- an optional LLM judge summary with transcript-level scores, strengths, and issues

The same evaluator is also exposed over HTTP:

- `POST /personality/:id/harness` with body `{ "scenario": "villain_marathon", "judge": true }`

The frontend now includes an `Adversarial Eval` tab that runs this endpoint and renders the report directly in the UI.

---

### Server-Side TTS

`POST /personality/:id/tts` accepts `{text, voiceProfile}` and resolves engine per request.

Before synthesis, Voxis now runs a Speech Director pass that transforms raw reply text into a prosody-shaped script using saved persona fields (`speechStyle`, `behaviorRules`, `notablePhrases`, `traits`, `expressionStyle`) plus live mood (`moodState` or `moodBaseline`).

Speech Director now uses:

- personality profile mapping (`speechProfiles.js`) for cadence templates
- mood-to-voice modulation (`moodVoice.js`) to adjust `rate` and `pitch`
- optional sentence chunk planning (`chunkSpeech.js`) for future cinematic timing

Current runtime flow:

`LLM reply -> speechDirector.stylizeSpeech -> moodVoice.applyMoodToVoice -> selected TTS engine -> audio response`

Engine resolution:

- `engine: "cloud"` -> OpenAI-compatible `/audio/speech`
- `engine: "piper"` -> local Piper CLI synthesis
- `engine: "auto"` -> Piper when configured, otherwise cloud

`voiceProfile` supports `engine`, `providerModel`, `providerVoice`, `pitch`, `rate`, and Piper-specific `piperModelPath`/`piperSpeaker`. The audio buffer is streamed back to the frontend and played automatically if `voiceAutoplay` is enabled.

In Voice Lab, `Sample Transmission Text` now displays the directed preview line returned by the backend after Speech Director + mood voice modulation are applied, making it easier to validate how the saved character will actually perform before using live chat playback.

Prosody template extraction endpoint:

- `POST /personality/:id/prosody-template` with body `{ "url": "https://..." }`

Processing flow is atomic per request: download audio to a temporary workspace, extract template metrics, persist template JSON path + metadata to the persona, and delete temporary audio files/workspace in a `finally` cleanup step.

Required host tools for URL extraction:

- `yt-dlp` for audio retrieval
- `ffprobe` and `ffmpeg` for media metadata + silence cadence analysis

Optional command overrides:

- `PROSODY_YTDLP_COMMAND`
- `PROSODY_FFPROBE_COMMAND`
- `PROSODY_FFMPEG_COMMAND`

For Ubuntu servers, `deploy/install-piper.sh` installs Piper in `/opt/piper-venv`, downloads curated voices to `/opt/piper/models`, and updates `backend/.env` defaults (`PIPER_COMMAND`, `PIPER_MODEL_PATH`, `TTS_ENGINE`).

---

### Voice Sampling and Selection

After prosody extraction completes, Voxis automatically analyzes the downloaded audio to extract representative voice samples. This workflow enables users to audition different vocal characteristics and select the one that best matches their persona target.

**Voice Sampling Pipeline:**

1. **Segmentation**: Audio is split into ~4-second clips, filtering out silence regions
2. **Feature extraction**: Each segment is analyzed for:
   - Spectral centroid (frequency range: low <2000 Hz, mid 2000–5000 Hz, high >5000 Hz)
   - Average pitch (Hz) and pitch variance
   - Speech density and zero-crossing rate
   - Voice quality classification (clear, breathy, tense)
   - Confidence scores for analysis accuracy

3. **Representative selection**: The system picks 2–3 representative samples from different spectral ranges to show voice diversity
4. **Frontend presentation**: Voice Sample Selector displays each sample with pitch/frequency info and quality metadata
5. **User confirmation**: User selects favorite and confirms choice, which persists the voice profile to the persona database

**Endpoints:**

- `POST /personality/:id/voice-samples` with body `{ "audioFilePath": "/path/to/audio.wav" }`  
  Analyzes audio file and returns samples analysis (segments, representatives, frequency distribution)

- `GET /personality/:id/voice-samples`  
  Retrieves stored voice samples metadata and analysis for a personality

- `POST /personality/:id/voice-samples/confirm` with body `{ "selectedSampleIndex": 0, "voiceLabel": "alto", "confidence": 0.85 }`  
  Persists the user's selected voice sample to the persona's voice profile

**Frontend Integration:**

- Voice Lab (VoiceLab.jsx) now includes voice sample display after prosody extraction
- VoiceSampleSelector component displays representative voice samples with selectable cards
- Selection triggers update to persona voiceProfile with selected voice metadata
- Creator form and Editor also support voice sampling workflows

**Data Storage:**

Voice samples metadata is stored in the `personalities` table:
- `voiceSampleAnalysis` — JSON containing representative samples and spectral analysis
- `voiceSampleSelectedAt` — timestamp of user's confirmation

The selected voice profile is merged into the existing `voiceProfile` JSON object, preserving all TTS settings.

---

### Runtime LLM Provider Settings

Voxis supports provider-first runtime model configuration through dedicated settings endpoints and a frontend tab.

Flow:

1. Choose provider (`openai`, `openrouter`, `groq`, `together`, `mistral`, `anthropic`, or `custom`)
2. Enter API key (and base URL for `custom`)
3. Connect and fetch live model catalog from that provider
4. Select active model for all chat/research/eval LLM calls

Runtime settings are persisted in SQLite (`app_settings`) and are read first by `llmService.js`; `.env` values remain a fallback.
Optional `Auto-detect` can infer provider from key behavior, but explicit provider selection is the default path.

---

### Database & Migrations

`db.js` uses an `ensureColumn` helper to add new columns to an existing database without destroying data. The SQLite file is stored at `backend/voxis.sqlite`. All schema changes are additive — running the server against an older database is safe; missing columns are added with their defaults on startup.

**Tables:**

- `personalities` — one row per character, all fields above
- `chat_messages` — `(id, personalityId, role, content, createdAt)`
- `personality_memory` — `(id, personalityId, memoryType, content, importance, embedding, embeddingModel, createdAt, updatedAt)`, indexed on `(personalityId, importance DESC, id DESC)`
- `app_settings` — key/value JSON config storage for runtime system settings (currently `llm_config`)

---

## How It Works — Frontend

**`App.jsx`** owns all shared state: the personalities array, selected personality ID, chat logs keyed by personality ID, and view routing between the five tabs (`Character Request`, `Character Chat`, `Memory Journal`, `Adversarial Eval`, `LLM Settings`). When a chat reply arrives, `moodState` and `moodLabel` from the response are merged into the matching personality in state so all UI components stay in sync without a round-trip to the database.

The app shell now also includes a lightweight user profile selector (age band + mode chooser). The selected profile is sent with each chat turn, enabling server-side age policy enforcement and mode-aware behavior.

**`PersonalityForm.jsx`** is the character builder. It manages a controlled form with fields for every personality property. The research panel lets users enter a subject query and source URLs; hitting Research calls the backend pipeline and auto-fills the form. Fields:
- Basic: name, description, traits, quirks, mood
- Narrative: creative context (select), behavior rules (textarea — one rule per line), goals (comma-separated), values (comma-separated)
- Mood: sensitivity slider (0.1–3.0, step 0.05) — sets `moodSensitivity`; live value shown on the label
- Hybrid personality: interactive Big Five radar chart (drag vertices) with fine-tune sliders, 3×3 D&D alignment grid, and a live Hybrid Tuning Preview card
- Expression style: sentence style, interruption rate, energy level, and explicit per-line speaking rules
- Voice: speech style, notable phrases, TTS provider/voice/pitch/rate/enabled/autoplay
- Research: source query, source URL list, ranked source cards with per-source enable/disable

### Hybrid Personality Controls

The character pipeline now supports a layered personality model with graphical interactive controls:

- **Big Five radar chart** (`BigFiveRadar.jsx`) — a draggable SVG pentagon. Move vertices to adjust traits live; sliders are provided alongside for precise control. O/C/E/A/N values update the live shape in real time.
- **3×3 Alignment grid** (`AlignmentGrid.jsx`) — replaces the dropdown. Click any cell to select and auto-enable the alignment overlay. Cells are color-coded by row: teal for Good, indigo for Neutral, rose for Evil, with a glow effect on the selected cell.
- **Hybrid Tuning Preview card** (`HybridPreview.jsx`) — a live panel that recomputes VAD baseline (Valence/Arousal/Dominance), mood sensitivity, suggested creative context, and expression rules from the current Big Five × alignment combination. Hovering alignment cells temporarily previews alternate mappings before commit.
- **Apply Mapped Tuning action** (`PersonalityForm.jsx`) — one-click copy of mapper output into editable fields (`creativeContext`, `moodSensitivity`, `expressionStyle`) so creators can iterate quickly instead of hand-transcribing the preview.
- **Refined nonlinear mapper** — the shared mapper now uses stronger Big Five coefficients plus alignment overlays (Good/Evil/Chaotic/Lawful) and trait-aware expression rule synthesis so opposing archetypes separate more clearly in both preview and runtime behavior.
  - Chaotic Good + high E/O + low C now trends toward kinetic, playful, tangent-heavy expression.
  - Chaotic Evil + high C now trends toward controlled menace with sharp chaotic spikes rather than generic chaotic chatter.

These values are persisted in the personality record and injected into the runtime prompt package, so they remain compatible with existing memory retrieval, VAD mood updates, goal selection, and prompt budgeting.

**`PersonalityList.jsx`** renders a card per personality. Each card shows the live `moodLabel` (updated after each chat turn), a `creativeContext` badge when the context is non-default, and counts for traits, quirks, and sources.

**`ChatWindow.jsx`** is the chat interface. The header shows a VAD-driven mood dot (colored by valence) next to the character name and the character's description below it. The message list renders user and assistant bubbles. The composer is a `<textarea>` that submits on Enter (Shift+Enter for newline). Chat now keeps only quick voice actions (enable/autoplay, generate latest reply audio, stop, quick save) to avoid clutter.
It also includes a toggleable debug panel for assistant turns, rendering the backend's per-turn debug payload directly in the chat UI.

**`VoiceLab.jsx`** is a dedicated TTS workspace tab. It owns full voice profile editing (voice/model/pitch/rate), sample text audio generation, latest-reply generation, and persistent voice profile saves.

### Neural Core Mindscape

Voxis now includes an in-chat Neural Core overlay (`NeuralCore.jsx`) as the primary futuristic visualization layer instead of a separate analytics tab.

How it works:

- A floating orb HUD appears inside the chat card; clicking it opens a full mindscape overlay.
- The central mood orb is live-wired to VAD signals (`valence`, `arousal`, `dominance`) from chat debug payloads.
- Orbiting system nodes (`Memory`, `Intent`, `Identity`, and `Evidence` in Scientist mode) pulse and light based on real runtime signals.
- Clicking focus nodes triggers camera tweening and SVG branch sprouting from live data (retrieved/injected memories, active goal details, identity stabilization events, citation status).
- A subtle always-on neural mesh is rendered behind chat messages only above the `light` performance tier so lower-end devices are not forced into continuous ambience.
- Scientist repair passes now surface as a visible `thinking...` ripple and citation-pathway reorganization instead of silently self-correcting.
- `v0.2` lightweight curved SVG trunks and sprout branches now animate memory, intent, identity, and evidence signals without adding a graph dependency.

Mode-aware rendering:

- **Scientist mode** emphasizes telemetry and evidence/citation pathways.
- **Kids mode** defaults to `light` motion, uses larger touch targets, simplified labels, and can optionally speak a short positive orb narration when the mood brightens.
- **Reduced motion** is respected through `prefers-reduced-motion`, which degrades the experience to the light tier and disables ambient movement.

Color mapping:

- Positive valence drives cyan/blue core glow.
- High arousal increases amber/orange halo intensity and orb size.
- Memory anchors stay gold.
- Reconditioning events emit a white/blue stabilizing ripple.
- Alignment overlay can bias the orb palette toward benevolent (good) or hostile (evil) tints.

Keyboard controls:

- Press `N` to toggle Neural Core open/closed.
- Press `Esc` to close the overlay.

Feature flag:

- Frontend env var: `VITE_NEURAL_CORE_ENABLED=true` (see `frontend/.env.example`)

**`MemoryJournal.jsx`** is the Memory Journal tab. It fetches all memory facts for the selected personality and renders them sorted by importance. Features:
- Color-coded type badges distinguish `fact`, `preference`, `relationship`, `event` from villain types (`scheme`, `grudge`, `leverage`, `target_weakness`, `debt`)
- Gold anchor badge on any fact with importance ≥ 9
- Type filter pills to isolate a specific memory type
- Inline edit form per row: change content, memoryType, and importance without navigating away
- Delete button per row with instant list update
- Backfill embeddings button to trigger semantic recall prep for existing memories
- Refresh button to pull the latest state from the database

**`HarnessReport.jsx`** is the adversarial evaluation tab. It runs the backend harness for the active personality, shows scenario-level scores and judge summaries, and lets you inspect the generated transcript without touching the persisted chat log.

**`LlmSettingsPanel.jsx`** is the runtime provider configuration tab. It loads provider options from the backend, supports explicit provider selection, API key entry, optional custom base URL, connect/disconnect actions, model switching, and optional auto-detect for convenience.

The settings area also includes a user policy editor for the selected profile, including default mode, safety tier, Neural Core performance tier, optional Kids narration, and supervised advanced mode for teen accounts.

Current rollout scope:

- `v0.1`: shipped as a lightweight orb HUD + overlay with CSS-first pulses and mode-aware telemetry.
- `v0.2`: shipped as curved SVG trunk growth and focused sprout branches layered over the existing orb system.
- `v0.3`: planned `react-force-graph-2d` expansion for dynamic force-directed behavior once the current overlay proves stable.

---

## Hybrid Mapping Guide

- See [docs/HYBRID_PERSONALITY_MAPPING.md](docs/HYBRID_PERSONALITY_MAPPING.md) for the structured Big Five + alignment mapping table, archetype expression rules, and ready-to-test payload examples.
- Canonical mapping logic is `mapToVoxisPersonality` in [backend/services/hybridPersonalityService.js](backend/services/hybridPersonalityService.js), with matching frontend preview logic in [frontend/src/lib/mapToVoxisPersonality.js](frontend/src/lib/mapToVoxisPersonality.js).
- Backend auto-application can be activated per request with `autoTuneHybrid: true`.
- Recommended calibration pass: compare extreme archetypes (e.g., Chaotic Good Zoe vs Chaotic Evil Villain) and tune coefficients until VAD, sensitivity, context, and expression rules all diverge in a way that feels narratively distinct.

---

## Future Directions

- Multi-agent personality interaction (Council of Echoes)
- Voice-native personalities with emotional prosody
- Persistent world simulation layers around personalities
- Personality evolution across long-term memory arcs

Implementation roadmap for dual scientist and kids experiences, age-based policy gating, and safe custom voice features:

- See [docs/DUAL_MODE_PRODUCT_SPEC.md](docs/DUAL_MODE_PRODUCT_SPEC.md)

---

## API Reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/users` | List user profiles for mode and age policy selection |
| `GET` | `/me` | Get the currently signed-in Voxis user resolved from the Clerk token |
| `POST` | `/users` | Create a user profile (display name, age band, default mode) |
| `GET` | `/users/:id/profile` | Get one user's policy profile |
| `PUT` | `/users/:id/profile` | Update one user's policy profile |
| `GET` | `/users/:id/memory` | List adaptive user memory (separate from character memory) |
| `POST` | `/users/:id/memory` | Create a user memory fact manually |
| `PUT` | `/users/:id/memory/:memoryId` | Update a user memory fact |
| `DELETE` | `/users/:id/memory/:memoryId` | Delete a user memory fact |
| `GET` | `/personalities` | List all personalities |
| `POST` | `/personality` | Create a personality |
| `GET` | `/personality/:id` | Get one personality |
| `POST` | `/personality/:id/harness` | Run adversarial evaluation for a personality and return a scored report |
| `PUT` | `/personality/:id` | Update a personality |
| `GET` | `/personality/:id/messages` | Get chat history for a personality |
| `GET` | `/personality/:id/memory` | Get all memory facts for a personality |
| `POST` | `/personality/:id/memory/backfill` | Backfill missing embeddings for that personality's stored memories |
| `PATCH` | `/personality/:id/voice` | Update only the saved voice profile for a personality |
| `PUT` | `/memory/:memoryId` | Edit a memory fact (content, memoryType, importance) |
| `DELETE` | `/memory/:memoryId` | Delete a memory fact |
| `POST` | `/chat` | Send a message; supports `userId` + `mode`, applies age-gated policy, and returns `{reply, isAI, moodState, moodLabel, policy, debug}` |
| `POST` | `/research-profile` | Run the profile research/synthesis pipeline for a character query + optional URL list |
| `POST` | `/personality/:id/tts` | Generate TTS audio for a text string using a personality's voice profile |
| `GET` | `/settings/llm` | Get runtime LLM connection state and selected model |
| `GET` | `/settings/llm/providers` | List supported provider presets for the provider-first UI |
| `POST` | `/settings/llm/connect` | Connect selected provider and fetch available models |
| `POST` | `/settings/llm/model` | Set active model from currently fetched provider models |
| `POST` | `/settings/llm/detect` | Optional helper: attempt provider auto-detection from API key |
| `DELETE` | `/settings/llm` | Disconnect and clear runtime LLM settings |
