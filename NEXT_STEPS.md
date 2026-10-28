# Voxis Handoff

Date: 2026-04-04
Branch: clean-main
Latest pushed commit before this handoff: 1b1e28a

## What Was Completed Today

- Deployment and runtime workflow hardened for Ubuntu + PM2 + Nginx, with scripts for setup, update, SSL, and stack checks.
- Port split finalized to avoid app conflicts: frontend dev on 3100 and backend on 3101.
- White-screen and auth outages were debugged across frontend and backend Clerk flow.
- Backend auth middleware now explicitly loads backend env, surfaces clearer auth failures, and handles missing-key conditions more safely.
- Frontend auth bootstrap fixed for the /me response envelope to prevent undefined user-id profile calls.
- LLM response path upgraded to live streaming behavior with phase events feeding Neural Core animation while generation is in progress.
- SSE-style event handling wired into the chat path so partial assistant output appears live and completes into final bubbles.
- AvatarCore expanded with personality-driven expression behavior (state machine, gaze drift, presets).
- Personality builder now supports expression profile persistence, preset selection, and live avatar preview.
- Added Copy Preset in builder expression profile: copy expression settings from an existing saved persona.
- LLM settings model picker now marks likely free OpenRouter/provider models with a visible (free) label.

## Monday Resume Checklist

1. Pull latest on server and deploy: run update script, rebuild frontend, restart backend process, and confirm Nginx route health.
2. Smoke test auth flow end-to-end: sign in, verify /me load, create/open personality, and confirm no undefined profile requests.
3. Open LLM Settings and verify free-model tagging in provider model list (especially OpenRouter).
4. In Character Request, verify Copy Preset pulls expression sliders/preset from another saved persona.
5. Run one long chat session to validate live token streaming + Neural Core phase transitions + final bubble completion.
6. Capture any PM2 startup key diagnostics and confirm backend env is loaded consistently after reboot.

## Known Gaps / Follow-Ups

- Automated regression coverage still needs expansion for streaming behavior, auth bootstrapping, and builder expression-copy UX.
- Free-model detection is heuristic-based (provider flags/pricing/name patterns) and may need provider-specific tuning.
- Production confidence still depends on one clean post-deploy smoke pass after latest pull.
- Secret hygiene follow-up is recommended after debugging sessions that exposed key material in logs or terminals.

## Suggested First Task Monday

Run a focused production smoke pass on the newest commit: auth bootstrap, LLM settings model labeling, expression preset copy flow, and one streamed chat conversation with Neural Core visible.

## Quick Resume (After Work)

1. Deploy latest on server using:
	- `cd /opt/voxis`
	- `git pull origin clean-main`
	- `npm run build`
	- `pm2 restart voxis-backend`
	- `sudo systemctl reload nginx`
2. Verify personality tuning changes in UI: edit an existing persona, save, and confirm prompt behavior is less formal in casual chat.
3. Start next feature: split TTS into a dedicated Voice Lab tab while keeping quick play/autoplay controls in chat.
4. If time remains, run a short API-doc drift check after any new routes added for Voice Lab.

## In Progress / Next Visual Upgrades (2026-04-07)

- Emotion-mapped mouth animation: Already implemented and validated in AvatarCore (valence/arousal/phase → mouth motion, color, style).
- Video background: Added cyberpunk-bg.mp4 as a visually pleasant, blurred, low-opacity background. File moved to frontend/public/ for static serving.
- Shader background: Implemented mood-reactive canvas layer in App.jsx (valence/arousal/dominance + live phase influence), with reduced-motion fallback and mobile opacity tuning.
- Phase palette tuning: Expanded shader phase differentiation (memory/intent/reply/rate-limit/etc.) and tied visual energy to configurable FX intensity.
- Saved Personas rail behavior: Sidebar now starts minimized by default and expands only when clicked.
- Background FX quick control: Added hero-row toggle for `off` / `low` / `full` so demo operators can switch intensity without opening settings.
- Neural HUD preview fix: Mini neuron network preview now shows in Scientist mode even when tier is `light`.
- Performance optimization: Re-encoded cyberpunk-bg.mp4 (~27MB -> ~8.7MB) for faster background load.

### Next Steps (pending user return)
- Validate long-session behavior with Background FX at each intensity setting (`off` / `low` / `full`).
- Consider adding an explicit mobile default of `low` FX if thermal/perf metrics suggest it.
- Review and polish any remaining UI/UX details for the minimized Saved Personas entry state.
- Update README and commit/push after major visual changes (per user workflow preference).

### TTS Operational Guardrail (ElevenLabs)
- Avoid stacking autoplay with repeated manual replay clicks in parallel, since ElevenLabs plan limits can trigger `concurrent_limit_exceeded`.
- Add a future UI block/debounce so manual replay is temporarily disabled while autoplay synthesis is already in flight.

## Speech Director Evolution Roadmap (2026-04-08)

Objective: evolve Voxis TTS from text playback into performance-driven delivery by progressively expanding Speech Director capabilities.

### Level 2: Personality -> Prosody Profiles

- Add reusable prosody presets mapped from personality signals (`traits`, `speechStyle`, `behaviorRules`, `expressionStyle.rules`).
- Expand rule templates for key archetypes:
	- `sarcastic` -> delayed interjections + selective emphasis
	- `chaotic` -> interruption-like cadence + punctuation variance
	- `villain/menace` -> controlled pauses + tension pacing
- Add deterministic test matrix covering at least one fixture per archetype.
- Expose a debug field in TTS responses/logging for `directedText` so prosody transformations are inspectable.

### Level 3: Cinematic Chunked Speech

- Implement Speech Director output mode as timed segments:
	- `{ text, pauseMs, emphasis, pace }[]`
- Synthesize per chunk and stitch into one audio buffer server-side.
- Add fallback to single-pass synthesis when chunk generation or stitching fails.
- Measure latency overhead and set safe limits (max chunks, max pause budget).

### Level 4: Voxis Signature Mood-Driven Delivery

- Map VAD mood deltas to delivery controls:
	- high arousal -> denser emphasis, more exclamation pressure, shorter phrase pacing
	- low arousal -> more ellipses, longer pauses, softened punctuation
	- high dominance -> slower authoritative cadence + emphasis on directive terms
- Add optional voice deformation hooks where supported by engine/toolchain.
- Add guardrails to prevent unreadable output (caps ratio ceiling, punctuation burst limits).
- Add A/B harness scenario to compare baseline TTS vs Speech Director levels on perceived "aliveness".

### Immediate Validation Checklist (keep using on each iteration)

1. Confirm Speech Director transformation is applied before both Piper and cloud synthesis paths.
2. Confirm at least two contrasting persona profiles produce clearly different directed text.
3. Confirm mood extremes (high arousal vs low arousal) produce measurable pacing and punctuation differences.

## Lunch Resume Note (2026-04-10)

System readiness confirmation:

I checked the current Voice Lab + LLM + TTS system state and it is ready for the architecture upgrade.

What I fully agree with:

The closed-loop recognition is spot on
The causal mood system is genuinely differentiated from everything else out there
The complexity warning is the most important thing on that whole page - you're at the inflection point where system interactions produce behavior nobody designed
Observability dashboard is the right first move, not the exciting features

Where I'd push back:

The "neural identity graph" already partially exists in your frontend - PersonaStateContext.jsx builds an in-memory tree, neuralCoreModel.js maps it, the 3D scene renders it. The missing piece is the backend treating memory as a graph, not flat rows
The budget estimate ($35-55) is fantasy if you're doing the full 7-feature list. Real estimate for everything described: $150-300 minimum, because each major refactor needs multiple correction passes
"Use Opus for dangerous refactors" is actually backwards for your situation - you want planning to be the expensive careful pass, not execution

---

## Recent Completions (2026-04-24)

### PersonaStateEngine — All 3 Phases Shipped

- **Phase 1 — Engine (`stateFlawService.js`)**: Full tick-based state drift with 4 channels (intoxication, fatigue, agitation, focus), per-channel trigger profiles (keyword weight, long-conversation weight, message-length weight, punctuation weight), passive gain, decay curves, recovery mechanics, and `buildStateDriftDirectives` compositing all channels into coherence penalty, fragmentation, interruptions, tangent chance, filler rate, and burp impulse.
- **Phase 2 — Controller integration**: `chatController.js` pre-steps state before generation, persists post-response, emits `debug` SSE event with `stateRuntime` payload (snapshot + directives + stabilityIndex) and `brain` event for intoxication drift.
- **Phase 3 — Live State Monitor UI**: System Observer panel upgraded with SVG sparklines per channel (last 50 turns), full 6-directive table (all with trend graphs), turn counter, and stable/empty state messaging. History accumulated in `App.jsx` SSE handler at `state-flaw` debug phase.

### Other Completed Items (since last NEXT_STEPS update)

- **Ollama offline integration**: Auto-refresh on provider selection, model list loading, offline runtime check in LLM settings.
- **Model favorites**: Import/export of favorite model lists; persona import/export with merge modes (overwrite, merge-keep, merge-update).
- **Vocal mannerisms**: Speech impulse system with frequency controls added to persona editor.
- **STT phase scaffold**: `/api/stt` endpoint + `sttService.js` wired.
- **Web search phase scaffold**: `webSearchService.js` retrieval injected into chat flow.

---

## Evolution Paths (2026-04-21)

### Option 1 — Live Emotional Dashboard ✅ DONE
Compact `mood-bar` strip added below the chat header description. Visible on all viewport sizes (avatar panel is hidden at <980px — this fills the gap). Shows:
- Zone badge (Green / Yellow / Red / Blue) colored by `emotionSpectrum.zone.accent`
- Emotion display label (e.g. "Calm · Grounded")
- V / A numeric readout (valence + arousal, signed, 2 dp, monospace)
- Drift sparkline SVG — the already-computed `emotionDriftPath` polyline, colored by active zone

### Option 2 — System Observability Panel
A collapsible "System Status" drawer accessible from the debug area showing:
- Embedding status (configured / degraded / disabled) — already available as `debugData.flags.embeddingsConfigured`
- LLM provider + model currently active (expose from chatController debug payload)
- TTS provider chain in-use (`routing.requestedEngine` + fallback list) — already in `/health/tts`
- Memory count per persona + conflict log (last N entries)
- Token budget usage per turn (charBudget remaining, breakdown by section)
- Mood adjudication toggle live feedback (MOOD_ADJUDICATION_ENABLED flag value + last adjudication delta)
Implementation notes:
- All data already at surface (debug payload + health endpoints) — this is pure frontend aggregation
- Hook into `ChatWindow.jsx` debug section or expose as a `<SystemObserver />` component
- Poll `/health/tts` on mount + after each turn; cache for 5 s

### Option 3 — Council Mode Integration (Smarter Prompting)
Multi-persona "Council" mode where 2–3 personas produce structured sub-responses assembled into one reply:
- Route to `llmService` with a multi-persona system prompt template
- Each persona supplies a `voice` block (JSON) with `responseText`, `mood_delta`, `tag`
- Assembly step merges blocks with attribution, chooses TTS voice per speaker segment
- Frontend: renders each council member turn with persona badge + mini mood indicator
- Tied to `COUNCIL_MODE_ENABLED` feature flag in `settingsModel`
- Risk: latency doubles; mitigate with parallel per-persona calls + aggressive truncation
Implementation prerequisites:
- Stable SSE multi-block protocol (extend `phase` event with `speakerId`)
- Per-segment TTS segment queue in `speechDirector` (Level 3/4 of TTS roadmap)

---

## Remaining Partial Items (carry-forward)

### Silent catch blocks (non-fatal, low priority)
Three `setImmediate` catch blocks in `chatController.js` now log structured `console.warn` (done). Remaining: confirm no other silent `catch {}` or `catch (e) { /* ignore */ }` patterns exist in backend services — particularly `memoryConflictService.js`, `emotionMemoryDrift.js`.

### Unused backend routes
`/api/research` and `/api/prosody` routes exist but have no active frontend callers. Before removing: confirm no external tooling/scripts call them. If confirmed dead, delete route files + controller to reduce surface area.

### Config weak points
- `EMBEDDING_BASE_URL` falls back to `LLM_BASE_URL` if not set — document this in README env table
- `CLERK_SECRET_KEY` absence fails silently on optional-auth routes; consider a startup warning log
- No `.env.example` file exists — creates friction for new contributors

### ElevenLabs concurrent debounce
Under rapid user input, multiple in-flight ElevenLabs requests can race. Add a per-persona request deduplicator in `ttsService.js` (cancel previous in-flight request if same `personalityId` triggers a new one within 200 ms).

---

## Resume Here — CoE Integration Decision (2026-04-21)

Final architecture decision:
- Keep **Counsel of Echoes (CoE)** as the orchestrator service.
- CoE calls Voxis over API per personality.
- Voxis acts as a high-quality personality reasoning service.
- Avoid bidirectional orchestration (do not have both systems orchestrate each other).

Why this direction:
- Better fault isolation and safer deploys (CoE changes do not destabilize Voxis chat core).
- Cleaner scaling and cost control for multi-agent fanout.
- Simpler experimentation/A-B tests at CoE layer.
- Clear ownership boundary: Voxis = persona quality, CoE = deliberation/aggregation.

### Shipped sidecar contract (2026-10-27)

Voxis is a context sidecar. CoE orchestrates. Ollama seats deliberate. Voxis does not propose, critique, or synthesize.

Boot from `backend/` with `HOST=127.0.0.1`, `VOXIS_LOCAL=true`, and the `VOXIS_SEAT_*` bindings, then `node server.js`. The process listens on `127.0.0.1` port 3101 by default. State is the SQLite file `backend/voxis.sqlite`. There is no Postgres. `VOXIS_LOCAL=true` skips Clerk session checks for that process so local dev does not wait on Clerk. Leave `VOXIS_LOCAL` unset on deployed instances; those still require a session. Set `VOXIS_INTERNAL_SECRET` before binding `HOST` to anything other than loopback.

CoE calls these two routes, both under `/api/internal` and both behind the internal key:

- `POST /api/internal/context` once per seat, before proposals. Body: `seatId`, `topic`, optional `maxChars` (clamped to 500–800, default 700). Response: `{ context, personalityId, chars, bound }`. `context` is mood plus topic-matching memories and prior council lines. No LLM call. Lookup uses a keyword index and falls back to the linear scan when that persona has no index yet or the topic matches nothing. CoE ignores the extra `retrieval` field.
- `POST /api/internal/round` once after synthesis. Body: `topic`, `outcome`, optional `moodDelta`, `seats`. Response: `{ ok: true, queued: true, written }`. `written` is the accepted seats, which is the array CoE already counts. The handler returns immediately. A flush commits the batch in one SQLite transaction every 2 seconds, or sooner when 10 outcomes are waiting. If the process dies before that flush, the pending round logs are lost. A future version could persist the queue to disk for crash safety.

Seat binding is `VOXIS_SEAT_GPT`, `VOXIS_SEAT_CLAUDE`, `VOXIS_SEAT_GROK`, or `VOXIS_SEAT_MAP` as JSON. An unbound seat returns an empty context and is skipped on write.

`POST /api/internal/chat` still generates a reply. The council does not call it.

### V1 Contract (CoE -> Voxis)

Endpoint proposal:
- `POST /api/coe/personality/:personalityId/respond`

Request shape (minimum):
- `requestId`, `conversationId`, `turnId`
- `user: { id, mode }`
- `input: { text, context.recentTurns[] }`
- `orchestration: { roleInCouncil, temperatureHint, maxOutputTokens, timeoutMs, councilPrompt? }`
- `telemetry: { traceId, spanId }`

Response shape (minimum):
- `requestId`, `personalityId`, `personalityName`
- `reply: { text, confidence, stance, keyPoints[] }`
- `mood: { before, after, label }`
- `usage: { model, inputTokens, outputTokens, totalTokens }`
- `timing: { latencyMs }`
- `debug: { rateLimited, fallbackUsed }`

Error contract:
- Statuses: `408`, `422`, `429`, `503`
- Body shape: `error: { code, message, retryable }`

### Personality API Registry (CoE-side)

Store per-personality routing in CoE config/DB (not hardcoded):
- `personalityId`
- `provider` ("voxis")
- `endpoint`
- `weight`
- `timeoutMs`
- `enabled`

This enables dynamic attach/detach of personalities without Voxis code changes.

### Operational Guardrails

- Per-personality timeout: `1500-2500ms`
- Circuit breaker per endpoint
- Continue partial council results if one member fails
- Fallback path: if council fails, serve direct Voxis single-response
- Propagate `X-Trace-Id` end-to-end for log correlation

### Rollout Plan

1. Add Voxis CoE endpoint and auth token validation.
2. Add CoE adapter + registry.
3. Run shadow mode (CoE calls Voxis, user still sees current path).
4. Enable feature-flagged partial traffic.
5. Promote to full council mode once latency/error targets pass.

### First Implementation Slice

Done on the Voxis side: `POST /api/internal/chat` with shared-secret or loopback auth, persona prompt assembly, `extraContext` / `systemAppend`, and a non-streaming JSON reply. Tests cover auth, context injection, missing personality, and provider 429.

Still on the CoE side: a `voxisProvider` that calls this endpoint per seat and puts the other proposals into `extraContext` on the critique round.