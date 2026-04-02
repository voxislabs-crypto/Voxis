# Voxis

Voxis is a full-stack prototype for building and chatting with LLM personalities.

## What It Does

- Create a personality with a name, description, traits, quirks, and mood.
- Pull research into the character form from Wikipedia, blogs, and YouTube URLs.
- Rank fetched sources, expose them as editable source cards, and let you prune weak research before saving.
- Generate a system prompt automatically from that data.
- Save personalities in SQLite.
- Persist chat history in SQLite and inject the last 10 messages into every LLM request.
- Select a personality and chat with it through any OpenAI-compatible API.
- Generate server-side voice output through an OpenAI-compatible TTS endpoint using per-character voice settings.

## Project Layout

- `backend/` contains the Express API, SQLite model layer, and LLM service.
- `backend/services/researchService.js` handles source fetching and character profile enrichment.
- `frontend/` contains the React + Vite interface.
- `package.json` at the repo root runs both apps together with npm workspaces.

## Setup

1. Install dependencies from the repo root:

	```bash
	npm install
	```

2. Create an environment file for the backend:

	```bash
	cp backend/.env.example backend/.env
	```

3. Edit `backend/.env` and provide either:

	- `LLM_API_KEY` for OpenAI, or
	- `LLM_BASE_URL` plus any key required by your OpenAI-compatible provider.

Research enrichment works without an LLM for basic scraping and source digestion. If an LLM is configured, Voxis also synthesizes the scraped source notes into a cleaner structured profile.

YouTube transcript ingestion is best-effort. If a transcript cannot be retrieved, Voxis still keeps the video metadata as a lower-ranked research source instead of failing the request.

For server-side voice generation, also provide either:

- `TTS_API_KEY` for OpenAI-compatible speech generation, or
- `TTS_BASE_URL` plus any key required by your TTS provider.

## Run Everything

From the repo root:

```bash
npm run dev
```

That starts:

- the backend on `http://localhost:3001`
- the frontend on `http://localhost:5173`

## Run Services Separately

Backend:

```bash
npm run dev --workspace backend
```

Frontend:

```bash
npm run dev --workspace frontend
```
