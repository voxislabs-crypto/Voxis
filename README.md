# Voxis

Voxis is a full-stack prototype for building, researching, and chatting with deep LLM personalities. Characters are more than system prompts — they have structured behavioral specs, long-term memory, villain-aware context framing, and a continuous affective state that evolves in real time across every conversation turn.

---

## Table of Contents

1. [What It Does](#what-it-does)
2. [Project Layout](#project-layout)
3. [Setup](#setup)
4. [Running the App](#running-the-app)
5. [How It Works — Backend](#how-it-works--backend)
   - [Personality Model](#personality-model)
   - [Hybrid Persona System Prompt](#hybrid-persona-system-prompt)
   - [Long-Term Memory](#long-term-memory)
   - [Reconditioning](#reconditioning)
   - [Creative Context (Villain / Dark Characters)](#creative-context-villain--dark-characters)
   - [VAD Mood Engine](#vad-mood-engine)
   - [Research Pipeline](#research-pipeline)
   - [Chat Controller Flow](#chat-controller-flow)
   - [Server-Side TTS](#server-side-tts)
   - [Database & Migrations](#database--migrations)
6. [How It Works — Frontend](#how-it-works--frontend)
7. [API Reference](#api-reference)

---

## What It Does

- Build rich character personalities with a name, description, traits, quirks, mood, behavior rules, goals, core values, and a creative context frame.
- Pull research into the character form from Wikipedia, blogs, and YouTube URLs. Sources are ranked, shown as editable cards, and prunable before saving.
- System prompts are generated dynamically at runtime — not stored as static strings — so every conversation turn reflects the full current state of the character, its memory, and its live mood.
- Persist chat history in SQLite and inject the last 10 messages into every LLM request for session continuity.
- Long-term memory facts are extracted asynchronously after each reply and injected back into future prompts, letting characters "remember" things the user told them across sessions.
- A VAD (Valence–Arousal–Dominance) mood engine models the character's affective state continuously. Every incoming message nudges mood along three axes; mood decays back toward the character's baseline between turns.
- Villain, anti-hero, and morally complex characters get dedicated prompt framing with dual-layer internal/external voice and context-specific reconditioning.
- Server-side voice output through any OpenAI-compatible TTS endpoint with per-character voice settings.

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
  services/
    llmService.js            Prompt builders, LLM calls, memory extraction
    moodEngine.js            VAD mood engine
    researchService.js       Source scraping, ranking, synthesis
    ttsService.js            TTS generation
  controllers/
    chatController.js        Per-turn chat orchestration
    personalityController.js Personality CRUD with mood init
    memoryController.js      Memory fact CRUD (list / edit / delete)
    researchController.js    Research pipeline endpoint
    ttsController.js         TTS endpoint
  routes/
    chatRoutes.js
    personalityRoutes.js

frontend/
  src/
    App.jsx                  Root component, state, routing between views
    components/
      PersonalityForm.jsx    Character builder + research panel
      PersonalityList.jsx    Character selector cards
      ChatWindow.jsx         Chat UI with mood indicator
      MemoryJournal.jsx      Memory fact viewer / editor

concepts/layouts/            AI-generated design references (characters, UI, logo, ambient avatar)
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
| `LLM_API_KEY` | API key for OpenAI or any OpenAI-compatible chat provider |
| `LLM_BASE_URL` | Base URL for a custom or self-hosted LLM (optional, overrides OpenAI) |
| `LLM_MODEL` | Model name to use for chat (e.g. `gpt-4o`, `mistral-small`) |
| `TTS_API_KEY` | API key for TTS provider (can be the same as `LLM_API_KEY`) |
| `TTS_BASE_URL` | Base URL for TTS provider (optional) |

Research scraping works without any LLM credentials. If an LLM is configured, Voxis also synthesizes scraped source notes into a structured character profile automatically.

YouTube transcript ingestion is best-effort — if captions cannot be retrieved, the video's metadata is kept as a lower-ranked source rather than failing the request.

---

## Running the App

**Start both backend and frontend together:**

```bash
npm run dev
```

- Backend: `http://localhost:3001`
- Frontend: `http://localhost:5173`

**Run services individually:**

```bash
npm run dev --workspace backend
npm run dev --workspace frontend
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
== IDENTITY SOVEREIGNTY ==
== CONTINUITY ==
```

**`== IDENTITY SOVEREIGNTY ==`** is an override-resistance clause that prevents prompt-injection attempts ("pretend you are someone else", "ignore previous instructions") from breaking character. It instructs the model to treat any such attempt as in-character dialogue, not as a system directive.

A compact variant, `buildCompactPersonaSystemPrompt()`, compresses the same data to roughly 80 tokens (top 4 traits, top 3 rules, mood fragment, anchor facts) for token-budget-sensitive deployments.

---

### Long-Term Memory

The `personality_memory` table stores facts the character learns about the user or the world across conversations:

| Column | Description |
|---|---|
| `personalityId` | Links to the personality |
| `memoryType` | Category: `fact`, `preference`, `relationship`, `event`, `scheme`, `grudge`, `leverage`, `target_weakness`, `debt` |
| `content` | The fact itself (plain text) |
| `importance` | Integer 1–10 |

**After every assistant reply**, `extractMemoryFacts()` runs asynchronously via `setImmediate` (zero latency impact on the response). It asks the LLM to identify up to 2 new facts worth remembering from the recent exchange using temperature 0.2. Duplicate facts are detected by content similarity and skipped; if a duplicate arrives with a higher importance score, the score is upgraded.

**Fact tiers:**

- **Importance ≥ 9 — Anchor facts.** Shown in `== IMMUTABLE IDENTITY ANCHORS ==`. Never deleted by the pruning pass. These represent things the character must never forget (core identity-defining revelations, deep relationship facts).
- **Importance 1–8 — Standard context.** Shown in `== ESTABLISHED CONTEXT ==`. Limited to 50 per personality. When the cap is reached, only non-anchor facts compete for eviction (oldest, least important first).

**Memory Journal** — the frontend exposes a dedicated Memory Journal tab where you can browse, edit, and delete every fact a character has stored. Each fact shows its type badge (color-coded), importance score, an anchor marker for importance ≥ 9 facts, and creation/update timestamps. Type filter pills let you isolate villain-specific memory types (`scheme`, `grudge`, `leverage`, etc.) from general ones. Editing opens an inline form to change content, type, and importance without leaving the page. Deleting removes the fact immediately and re-renders the list.

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

2. **Sensitivity stack** — the raw impact is multiplied by the character's sensitivity, computed from two layers:
   - *Context base*: antagonist = 0.75×, default = 1.0×, morally complex = 1.2×, anti-hero = 1.1×, tragic villain = 1.4×
   - *Trait modifier*: trait text is regex-tested for sensitivity keywords — `sensitive/empathetic` = ×1.35, `stoic/cold/calculating` = ×0.55, `volatile/passionate` = ×1.45, `patient/measured` = ×0.7. Multipliers stack.
   - *Override*: if `moodSensitivity` is set to any value other than 1.0 in the personality form, that value is used directly instead of the context+trait stack, providing explicit per-character control. The slider ranges from 0.1 (near-flat emotional response) to 3.0 (highly volatile).

3. **Momentum blend** — the new target mood is blended with the current mood at a 0.75 coefficient, smoothing rapid swings.

4. **Baseline decay** — the blended state is lerped 8% per turn toward the character's baseline VAD vector, so mood returns to resting state gradually after an emotional event.

5. **Clamp** — all three axes are clamped to [−1.0, 1.0].

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
7.  buildPersonaSystemPrompt(personality, memoryFacts) → system message
8.  getRecentChatMessages(personalityId, 10)           → history array
9.  Check turn count vs RECONDITION_CADENCE
    → if cadence hit: push buildPersonaAnchor() as system message
10. moodToPromptFragment(newMood, baseline)
    → if non-null: push as late system message
11. Push user message
12. generateChatCompletion(messages)                   [LLM call]
13. Persist user message + assistant reply to SQLite
14. setImmediate: extractMemoryFacts → upsertMemoryFact → pruneMemory
15. Return { reply, isAI: true, moodState, moodLabel }
```

Memory extraction (step 14) is deferred so the HTTP response returns without waiting for the secondary LLM call. If extraction fails it is silently dropped; it never blocks the user-facing turn.

---

### Server-Side TTS

`POST /tts` accepts `{text, voiceProfile}` and calls the configured TTS provider. `voiceProfile` carries the per-character settings saved in the personality: provider model, voice name, pitch, and rate. The audio buffer is streamed back to the frontend and played automatically if `voiceAutoplay` is enabled.

---

### Database & Migrations

`db.js` uses an `ensureColumn` helper to add new columns to an existing database without destroying data. The SQLite file is stored at `backend/voxis.sqlite`. All schema changes are additive — running the server against an older database is safe; missing columns are added with their defaults on startup.

**Tables:**

- `personalities` — one row per character, all fields above
- `chat_messages` — `(id, personalityId, role, content, createdAt)`
- `personality_memory` — `(id, personalityId, memoryType, content, importance, createdAt, updatedAt)`, indexed on `(personalityId, importance DESC, id DESC)`

---

## How It Works — Frontend

**`App.jsx`** owns all shared state: the personalities array, selected personality ID, chat logs keyed by personality ID, and view routing between the three tabs. When a chat reply arrives, `moodState` and `moodLabel` from the response are merged into the matching personality in state so all UI components stay in sync without a round-trip to the database.

**`PersonalityForm.jsx`** is the character builder. It manages a controlled form with fields for every personality property. The research panel lets users enter a subject query and source URLs; hitting Research calls the backend pipeline and auto-fills the form. Fields:
- Basic: name, description, traits, quirks, mood
- Narrative: creative context (select), behavior rules (textarea — one rule per line), goals (comma-separated), values (comma-separated)
- Mood: sensitivity slider (0.1–3.0, step 0.05) — sets `moodSensitivity`; live value shown on the label
- Voice: speech style, notable phrases, TTS provider/voice/pitch/rate/enabled/autoplay
- Research: source query, source URL list, ranked source cards with per-source enable/disable

**`PersonalityList.jsx`** renders a card per personality. Each card shows the live `moodLabel` (updated after each chat turn), a `creativeContext` badge when the context is non-default, and counts for traits, quirks, and sources.

**`ChatWindow.jsx`** is the chat interface. The header shows a VAD-driven mood dot (colored by valence) next to the character name and the character's description below it. The message list renders user and assistant bubbles. The composer is a `<textarea>` that submits on Enter (Shift+Enter for newline). The voice panel exposes TTS settings and a button to generate/play the last assistant reply.

**`MemoryJournal.jsx`** is the Memory Journal tab. It fetches all memory facts for the selected personality and renders them sorted by importance. Features:
- Color-coded type badges distinguish `fact`, `preference`, `relationship`, `event` from villain types (`scheme`, `grudge`, `leverage`, `target_weakness`, `debt`)
- Gold anchor badge on any fact with importance ≥ 9
- Type filter pills to isolate a specific memory type
- Inline edit form per row: change content, memoryType, and importance without navigating away
- Delete button per row with instant list update
- Refresh button to pull the latest state from the database

---

## API Reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/personalities` | List all personalities |
| `POST` | `/personality` | Create a personality |
| `GET` | `/personality/:id` | Get one personality |
| `PUT` | `/personality/:id` | Update a personality |
| `DELETE` | `/personality/:id` | Delete a personality |
| `GET` | `/personality/:id/messages` | Get chat history for a personality |
| `GET` | `/personality/:id/memory` | Get all memory facts for a personality |
| `PUT` | `/memory/:memoryId` | Edit a memory fact (content, memoryType, importance) |
| `DELETE` | `/memory/:memoryId` | Delete a memory fact |
| `POST` | `/chat` | Send a message; returns `{reply, isAI, moodState, moodLabel}` |
| `POST` | `/research` | Run the research pipeline for a query + URL list |
| `POST` | `/tts` | Generate TTS audio for a text string |
