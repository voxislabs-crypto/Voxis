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
- Neural Core now has persisted profile controls for performance tier and optional Kids voice narration.
- Neural Core respects reduced motion, defaults Kids profiles to lighter motion, and surfaces Scientist repair passes visually.
- Neural Core v0.2 lightweight SVG sprouting is now in place for active trunks and focused branch growth.
- Browser polish pass landed: mobile-responsive HUD orb (60px at ≤480px), scene min-height reduced, legend and focus-row scroll safely on narrow viewports, tier-aware sparkle speed (full=0.78×, balanced=1×).

## Priority Resume Checklist

1. Run an end-to-end browser pass with valid LLM credentials to verify full Scientist/Kids behavior under real model responses.
2. Verify all new profile/memory APIs from the UI with multiple users (create, switch, edit, delete flows).
3. Add/expand automated tests for policy locking, fail-closed behavior, and citation validation.
4. Validate the new performance tiers on lower-end devices and tune the threshold between `light` and `balanced` ambience.
5. Pressure-test SVG sprout density and motion timing with long sessions before layering in any graph physics.
6. Decide if Neural Core should default on in all environments or stay behind `VITE_NEURAL_CORE_ENABLED`.
7. Start voice roadmap Phase 4 only after policy/legal guardrails are finalized (custom voices, anti-impersonation checks).
8. Add renderer boundary abstraction to NeuralCore so the SVG scene can be swapped for `react-force-graph-2d` in Scientist mode (v0.3 prep) — Kids Mode untouched.

## Known Gaps / Follow-Ups

- LLM-dependent runtime validation is still partial without stable provider keys and representative test prompts.
- No complete automated regression suite yet for the new dual-mode policy branch logic.
- Voice customization remains intentionally deferred pending compliance and abuse-prevention controls.
- Full force-graph behavior is intentionally deferred until a `react-force-graph-2d` pass lands and proves stable.
- v0.2 still uses deterministic SVG geometry, not force-directed layout or drag/zoom behavior.
- Memory governance: contradiction detection is not yet implemented — new memories that conflict with existing ones are silently overwritten rather than flagged for review or reconciliation.
- Sentiment detection: the current regex-based VAD is reasonable for clear signals but will misread sarcasm and mixed-sentiment inputs; a trained classifier (e.g. a small fine-tuned model or a dedicated sentiment API) would materially improve accuracy.

## Suggested First Task Next Session

Execute a full scripted QA run for one Scientist profile and one Kids profile, specifically checking light/balanced/full Neural Core behavior, reduced-motion fallback, and narration edge cases before additional visual expansion.