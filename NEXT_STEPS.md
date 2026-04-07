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
- Performance optimization: Re-encoded cyberpunk-bg.mp4 (~27MB -> ~8.7MB) for faster background load.

### Next Steps (pending user return)
- Validate long-session behavior with Background FX at each intensity setting (`off` / `low` / `full`).
- Consider adding an explicit mobile default of `low` FX if thermal/perf metrics suggest it.
- Review and polish any remaining UI/UX details for the minimized Saved Personas entry state.
- Update README and commit/push after major visual changes (per user workflow preference).