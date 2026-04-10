# Voxis — Workspace Instructions

Voxis is a stateful personality engine: persistent AI identities with VAD mood dynamics, Big Five traits, long-term memory, multi-provider LLM/TTS, and Clerk auth. Full-stack: Node.js/Express backend + React/Three.js frontend.

## Build & Test

```bash
npm run dev          # root — runs backend (nodemon :3101) + frontend (vite :3100) concurrently
npm run build        # root — builds frontend only (Vite)

cd backend && npm test          # vitest (single run)
cd backend && npm run test:watch  # vitest --watch
```

**Production deploy sequence** (always in this order):
```bash
npm run build && pm2 restart voxis-backend && sudo systemctl reload nginx
```

## Architecture

```
backend/
  controllers/   — Express route handlers (*Handler naming)
  services/      — Business logic, all named exports (no classes)
  models/        — SQLite CRUD via better-sqlite3 (no ORM)
  routes/        — Express router mounting
  db/db.js       — SQLite init, WAL mode, ensureColumn() migrations
  middleware/requireAuth.js — Clerk JWT verification

frontend/src/   — React 18 + Three.js (@react-three/fiber + drei) UI/components
frontend/src/state/PersonaStateContext.jsx — shared persona editor/core state
frontend/vite.config.js — dev proxy + Three.js/R3F dedupe guardrails
```

**Key flow:** `chatRoutes → chatController → llmService (SSE stream) → moodEngine → speechDirector → ttsService`

Key exemplar files:
- [`backend/controllers/chatController.js`](../backend/controllers/chatController.js) — LLM streaming, mood adjudication, memory conflict detection
- [`backend/services/llmService.js`](../backend/services/llmService.js) — multi-provider (OpenAI/OpenRouter) with fallback
- [`backend/services/moodEngine.js`](../backend/services/moodEngine.js) — VAD mood physics (decay/momentum)
- [`backend/db/db.js`](../backend/db/db.js) — SQLite schema + migration pattern
- [`frontend/src/components/ChatWindow.jsx`](../frontend/src/components/ChatWindow.jsx) — SSE event handling, chat state, debug surfaces
- [`frontend/src/state/PersonaStateContext.jsx`](../frontend/src/state/PersonaStateContext.jsx) — shared persona editing/state model
- [`frontend/vite.config.js`](../frontend/vite.config.js) — fixed dev ports, API proxying, Three.js dedupe

## Conventions

- **ES modules** throughout — use `import`/`export`, not `require`
- **Async/await** with try-catch; error objects carry `.statusCode`
- **DB migrations**: add columns via `ensureColumn()` in `db.js` — never drop or alter existing columns
- **All SQL must use parameterized queries** — no string interpolation with user input
- **Ports**: backend `3101`, frontend dev `3100` — do not change without updating both `server.js` and `vite.config.js`
- **Auth**: Clerk JWT (`requireAuth` middleware); optional per-route, not applied globally
- **Settings stored as JSON strings** in SQLite — always parse on read, stringify on write
- **Feature flags** live in `settingsModel` (e.g., `MOOD_ADJUDICATION_ENABLED`, debug panel, TTS provider)
- **Frontend chat/UI state**: chat streaming is handled in `ChatWindow.jsx`; persona editing flows through `PersonaStateContext.jsx`
- **Testing**: backend tests live under `backend/tests/` with Vitest; no dedicated frontend test script is configured at the workspace root

## Required Environment Variables

| Variable | Purpose |
|---|---|
| `LLM_API_KEY` | OpenAI or OpenRouter API key |
| `LLM_BASE_URL` | Provider base URL |
| `LLM_MODEL` | Model identifier |
| `EMBEDDING_API_KEY` | Optional — enables memory conflict detection |
| `EMBEDDING_MODEL` | Optional |
| `CLERK_SECRET_KEY` | Auth — required for protected routes |
| `PORT` | Defaults to `3101` |

## Personality System

Personalities use **Big Five traits + D&D alignment + VAD mood state**. See [`docs/HYBRID_PERSONALITY_MAPPING.md`](../docs/HYBRID_PERSONALITY_MAPPING.md) for trait→mood mapping and expression presets.
Prompt assembly has a **6500-char budget** — truncation order: mood → memory → intent → alignment → research.

## Dual Mode (Scientist / Kids)

See [`docs/DUAL_MODE_PRODUCT_SPEC.md`](../docs/DUAL_MODE_PRODUCT_SPEC.md) for mode behavior, age gating, and feature flag details.

## Reference Docs

- See [`README.md`](../README.md) for setup, API overview, and broader product/background context.
- See [`docs/TTS_EVOLUTION_CHECKLIST.md`](../docs/TTS_EVOLUTION_CHECKLIST.md) for the ongoing speaking-stack roadmap and provider evolution details.

## Critical Pitfalls

- **TTS chain**: Kokoro → Piper → OpenAI. Missing a provider crashes unless gracefully handled — always check degradation path.
- **SSE streaming**: Chat endpoint emits typed events (`content`, `phase`, `embedding`). Frontend must handle all three.
- **Mood adjudication** only runs when `MOOD_ADJUDICATION_ENABLED !== "false"` AND an LLM is configured; falls back to VAD decay baseline.
- **Neural Core profile settings** (`performanceTier`, `voiceNarrationEnabled`) persist via `user_profiles` table — not personality settings.
- **Three.js dedupe**: keep the `frontend/vite.config.js` dedupe list intact or React Three Fiber hooks will break at runtime.
- **Kids mode**: defaults to light motion; reduced-motion users are forced to light in the frontend.
- **`npm run build`** must complete before restarting the backend in production — the backend serves the built frontend assets.
