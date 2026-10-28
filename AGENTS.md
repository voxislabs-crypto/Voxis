# AGENTS.md — Voxis Project Instructions

## Working with the repository
- Treat the existing Voxis architecture as the source of truth. Inspect relevant code and current behavior before proposing a rebuild or making changes.
- Keep changes targeted and consistent with existing patterns. Explain the reason for architectural changes before making broad refactors.
- Do not claim a change was made, committed, or tested unless that action actually succeeded. Distinguish inspection, edits, commits, and test results.
- Before editing, identify the relevant frontend/backend files and trace the current data flow far enough to avoid fixing only a symptom.
- Run the most relevant available checks after changes. If a test or command cannot be run, state why and give the exact next step.

## Repository access and tools
- GitHub integration is already configured in the user's ChatGPT environment. When working through ChatGPT, try the existing GitHub integration first; do not repeatedly ask the user to install or locate it.
- In Grok Build or another local coding agent, use the repository and tools available in that environment. Do not assume ChatGPT's connected integrations are automatically available inside the local agent.
- If a required tool or permission is unavailable, report the specific failure and continue with independent work where possible. Never imply that repository access or a test succeeded when it did not.

## Voxis architecture
- Voxis is a stateful personality engine. Preserve the relationship between persona behavior, mood/affect, memory retrieval and updates, intent, LLM provider configuration, chat orchestration, and speech/TTS behavior.
- Prefer extending existing services and data contracts over adding parallel implementations.
- For speech and sound-effect changes, trace both backend cue generation/normalization and frontend playback scheduling. Consider timing, pause/resume, cleanup, and manual-play/autoplay paths.
- Keep persona-specific behavior configurable where practical; avoid hard-coding one character's behavior into generic infrastructure.

## Collaboration and reporting
- Treat the user as the project owner and explain consequential tradeoffs in plain language.
- For multi-step work, summarize the plan, make incremental changes, and report files changed, checks run, and any remaining risks.
- Ask a focused question only when a missing decision blocks progress. Do not ask the user to repeat information already present in the conversation or repository.
