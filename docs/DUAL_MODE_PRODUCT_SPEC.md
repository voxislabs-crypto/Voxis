# Voxis Dual-Mode Product Spec

Date: 2026-04-03
Status: Proposed

## Goal

Support two very different user experiences on one platform:

- Scientist Mode: deep research assistant with source rigor and structured output.
- Kids Mode: simple, safe, guided character chat for young users.

Also add:

- Age-aware account and policy controls.
- Persistent user-learning memory that does not break privacy boundaries.
- Voice feature roadmap including cloning-like custom voices with strict safety and IP controls.

## Product Principle

One core engine, multiple policy profiles.

Do not fork the app into two codebases. Keep one backend pipeline and select behavior through mode policies and feature flags.

## Modes

### Scientist Mode

Primary user outcome:

- Explore modern concepts with evidence, citations, assumptions, and uncertainty.

UX requirements:

- Advanced prompt controls (depth, verbosity, risk tolerance).
- Source panel with ranked citations.
- Structured result templates (summary, methods, evidence, limitations, next tests).
- Optional debug panel default on.

Model behavior requirements:

- Retrieval-first answering.
- Explicit confidence and unknowns.
- Refusal to present speculation as fact.
- Track open questions across turns.

Evaluation criteria:

- Citation precision.
- Factual consistency over multi-turn sessions.
- Hallucination rate.
- Reproducibility of answers from same source set.

### Kids Mode

Primary user outcome:

- Safe, delightful character interaction that is easy to use at early reading levels.

UX requirements:

- Minimal UI (large buttons, voice-first optional).
- Character starter cards and one-tap prompts.
- Response length caps.
- Reading-level adaptation.

Model behavior requirements:

- No mature themes.
- No unsafe instruction content.
- Gentle redirection for harmful prompts.
- Encourage parent/guardian check-ins on sensitive topics.

Evaluation criteria:

- Safety policy pass rate.
- Readability score target.
- Session delight metric (thumb up/down, simple emoji scale).
- False positive moderation rate.

## Age Gating and Profile System

### User identity model

Separate declared identity from learned memory:

- Declared profile data: account identity, age band, consent flags.
- Learned memory: conversational preferences and stable facts discovered over time.

Age bands:

- child: under 13
- teen: 13 to 17
- adult: 18+

Policy mapping:

- child -> Kids Mode default, strictest safety and voice restrictions
- teen -> Kids Mode default with optional supervised advanced mode
- adult -> Scientist Mode or Creative Mode available

### Minimal schema additions

Table: users

- id
- displayName
- birthYear or ageBand
- locale
- createdAt

Table: user_profiles

- userId
- defaultMode
- safetyTier
- parentEmailOptional
- parentalConsentRequired (bool)
- parentalConsentVerifiedAt
- createdAt
- updatedAt

Table: user_memory

- id
- userId
- memoryType (preference, routine, relationship, long_term_goal, etc.)
- content
- importance
- embedding
- createdAt
- updatedAt

Important:

- Keep character memory and user memory in separate stores.
- Prompt assembler reads both, but with clear precedence and masking rules.

## Mode Flags and Runtime Toggles

### Backend flags

Add runtime flags (settings table + env fallback):

- APP_MODE_DEFAULT = scientist | kids | mixed
- AGE_GATE_ENABLED = true | false
- CHILD_SAFE_MODE_ENFORCED = true | false
- RESEARCH_CITATION_REQUIRED = true | false
- DEBUG_PANEL_ALLOWED = true | false
- VOICE_CLONE_ENABLED = false by default
- VOICE_CLONE_ADULT_ONLY = true
- VOICE_IMPERSONATION_BLOCKLIST_ENABLED = true

### Per-request policy context

Inject policy context before prompt build:

- userId
- ageBand
- activeMode
- safetyTier
- voicePolicy
- citationPolicy

Then all subsystems consume this context:

- prompt budgeting
- intent selection
- memory retrieval
- moderation
- TTS policy checks

### Frontend toggles

Add profile and mode controls in UI:

- profile switcher in app shell
- age band shown as policy chip
- mode selector (if policy allows)
- scientist controls panel (citations required, depth)
- kids controls panel (simple response mode, voice on/off)

## Voice Feature Roadmap (Safe Version)

### Product framing

Use Custom Voice Profiles instead of unrestricted voice cloning.

Allow users to create unique voices, but block direct impersonation of known characters, public figures, and copyrighted performances unless rights are verified.

### Critical compliance note

Pitch shifting alone does not make an impersonation legally safe.

Any voice feature should enforce:

- consent for real-person voice usage
- rights verification for branded or copyrighted voices
- anti-impersonation similarity checks
- blocked-entity list and report workflow

### Voice policy tiers

child tier:

- no voice cloning
- approved preset voices only
- no custom upload

teen tier:

- optional custom voices with strict moderation
- no celebrity or franchise similarity targets

adult tier:

- custom voice creation allowed
- still block impersonation and protected voice matches

### Suggested technical controls

- Voiceprint distance threshold against protected signatures.
- Prompt-level policy check for requests like imitate exact character.
- Watermark metadata in generated audio.
- Provider-level audit logs for generation events.
- Manual review queue for flagged voice profiles.

## Learning About the User Without Breaking Safety

This is the split you called out correctly: two different features.

Feature A: profile identity and age policy

- explicit, user-provided, compliance-relevant data

Feature B: adaptive memory of user preferences

- inferred from conversation, scored, editable, deletable

Recommended guardrails:

- never infer age from conversation text for policy decisions
- keep profile age as authoritative
- allow user memory export and delete
- avoid storing highly sensitive data by default

## API Additions (Proposed)

- POST /users
- GET /users/:id/profile
- PUT /users/:id/profile
- GET /users/:id/memory
- PUT /users/:id/memory/:memoryId
- DELETE /users/:id/memory/:memoryId
- POST /chat with userId and optional mode override

Chat response additions:

- policy: activeMode, ageBand, safetyTier
- debug: policy decisions and blocked features

## Rollout Plan

Phase 1 (1 to 2 weeks):

- Add users and user_profiles tables
- Add age gate and policy context
- Add mode selector + enforce children default

Phase 2 (1 to 2 weeks):

- Add Scientist Mode citation requirements and structured templates
- Add Kids Mode response simplification and strict moderation profile

Phase 3 (2 to 4 weeks):

- Add user_memory pipeline and retrieval blend with character memory
- Add memory controls in UI (view/edit/delete)

Phase 4 (2 to 6 weeks):

- Add Custom Voice Profiles with policy tiers
- Add anti-impersonation checks and audit tooling

## What To Build First

If you want immediate impact with low risk, start in this order:

1. age/profile system and mode gating
2. Scientist Mode citation and structure guarantees
3. Kids Mode simplified UX and stricter moderation
4. user-learning memory layer
5. custom voice features with compliance guardrails

## Non-Goals For First Release

- Full biometric identity verification.
- Perfect legal determination automation.
- Open voice cloning marketplace.

Keep first release narrow, safe, and measurable.
