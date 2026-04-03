# Voxis Handoff

Date: 2026-04-03
Branch: `clean-main`
Latest pushed commit: `c9bbc9d` (README Neural Core docs)

## What Was Completed

- Dual-mode platform behavior is in place: Scientist vs Kids policy paths, age-band gating, and fail-closed defaults.
- User profile system is implemented end-to-end (backend tables/routes + frontend profile/mode controls).
- Separate user-learning memory pipeline is implemented (storage, retrieval, extraction, API controls).
- Scientist response hardening added: required sections/citation checks with one repair pass.
- Kids safety/readability shaping added: stricter unsafe-topic blocking and simplified responses.
- Mode stability safeguards shipped: per `(userId, personalityId)` mode lock and citation-range validation.
- In-chat Neural Core UI shipped and centered in the chat experience (HUD orb + expanded mindscape overlay).
- README was updated to document the Neural Core addon and feature flag behavior.

## Priority Resume Checklist

1. Run an end-to-end browser pass with valid LLM credentials to verify full Scientist/Kids behavior under real model responses.
2. Verify all new profile/memory APIs from the UI with multiple users (create, switch, edit, delete flows).
3. Add/expand automated tests for policy locking, fail-closed behavior, and citation validation.
4. Decide if Neural Core should default on in all environments or stay behind `VITE_NEURAL_CORE_ENABLED`.
5. Start voice roadmap Phase 4 only after policy/legal guardrails are finalized (custom voices, anti-impersonation checks).

## Known Gaps / Follow-Ups

- LLM-dependent runtime validation is still partial without stable provider keys and representative test prompts.
- No complete automated regression suite yet for the new dual-mode policy branch logic.
- Voice customization remains intentionally deferred pending compliance and abuse-prevention controls.

## Suggested First Task Next Session

Execute a full scripted QA run for one Scientist profile and one Kids profile, capture mismatches, then convert those into automated tests before additional feature expansion.