# Implementation plan

Verified facts are in `CURRENT_STATE.md`. This file is the proposed build order. Do not start Phase C or D in the packager session.

## Phase A — service and tests

Files:

- Add `backend/services/contextPackagerService.js`.
- Add `backend/tests/contextPackagerService.test.js`.
- Call `readSource` and `redactSensitiveText` from `backend/services/sourceInspectorService.js`.
- Use `node:crypto` `createHash` and `randomUUID`. No new dependency.

The service follows `CONTEXT_PACKAGER_DESIGN.md`. Tests inject `read`. They must not write the repo and must not call the default reader against `X:\Voxis`.

Tests:

- Valid package: two fake reads, line numbers and content copied, `schemaVersion` `context-packager/1`, hashes match the redacted bytes.
- Span over 200, missing line range, bad mode, empty question, `maxFiles` over 8: 400 and `read` call count 0.
- Extra `root` field does not change the object passed to `read`.
- Fake 404 and a successful sibling: `status` `partial`, one excerpt, one `missing` omission.
- Fake 400 boundary: omission `boundary`, excerpt absent, fake outside bytes never appear because `read` is not asked to return them.
- `truncated: true`: omission `inspector-truncated`, content not copied.
- Content longer than `maxBytesPerFile`: omission `exceeds-byte-cap`, body not a prefix of the content.
- Second file that would exceed `maxTotalBytes`: omission `total-cap`.
- `[redacted]` in the fake content sets `redactionFired` and `redaction.guaranteed` stays false.
- Unknown throw becomes omission `inspector-failed` with message `Source inspector failed.`
- Audit sink receives paths and counts and does not receive the question, the excerpt, or a test secret.

Acceptance: `npm test -- tests/contextPackagerService.test.js` from `backend/` passes. No route added yet.

## Phase B — route on the existing gate

Files:

- `backend/controllers/sourceInspectorController.js` — add `packageHandler` that copies only the allowed fields.
- `backend/routes/sourceInspectorRoutes.js` — `router.post("/package", packageHandler)` after the existing `router.use(requireSourceInspectorAuth)`.
- Extend `backend/tests/requireSourceInspectorAuth.test.js` or add a route test.

Do not create a new `app.use` prefix. `server.js` already mounts the router at `/api/source-inspector` (verified line 132).

Tests:

- No header, `VOXIS_SOURCE_INSPECTOR_SECRET` set, loopback: 401 and the fake packager is not called.
- `VOXIS_LOCAL=true` without the inspector secret: 401.
- Internal sidecar header does not authorize the route.
- Valid header: handler receives the picked fields only.
- Response body for a rejected package is 422 and contains no invented excerpt.

Acceptance: new route tests pass, and the two existing inspector test files still pass.

Optional in this phase, only if it stays small: a dedicated JSON limit for this router so M1 is smaller. If that change would move the global parser, stop and report it instead of editing `server.js` broadly.

## Phase C — Council advisory (do not build with A or B)

Not implemented. No `VOXIS_COE_ADVISORY_URL` exists in backend code (search for `COE_` / `COUNCIL_URL` found nothing).

Later module: `backend/services/sourceAdvisoryService.js`.

- Input is a package that validates against `context-packager/1`.
- If the advisory URL is unset, return `{ available: false }` and keep the package.
- If set, POST the package as the user message with a fixed system string that the excerpt cannot change instructions. Timeout 30 seconds.
- Map the reply onto the existing Council proposal fields in `councilService.js`: `stance`, `summary`, `claims`, `assumptions`, `risks`, `confidence`. Add `citations` of `{ path, startLine, endLine }` that must fall inside a packaged excerpt. Drop citations that do not.
- Do not call `generateProposal` in a way that writes files. Do not call `internalRoundHandler` or `buildContextBlock`.
- Do not mount `councilRoutes`.
- A route, if added later, stays on the inspector router and the inspector secret. Advice is not applied.

## Phase D — human-approved changes (do not build now)

Separate project. The inspector and the packager stay read-only.

1. Produce a unified diff as text. Do not apply it.
2. Show the diff and the rationale, with citations into a package.
3. Run the relevant tests in a new worktree after a person asks for that run.
4. Write a review report of pass, fail, and what was not run.
5. Apply a patch only after an explicit approval that names the diff hash.
6. Show the resulting diff and test results.
7. Give the git commands that would reverse that commit. Do not push, deploy, or clean the tree.

The current Windows tree has dirty gitlinks and untracked local folders. Any later worktree step has to account for that before it runs `git worktree`.

## Out of scope for the packager session

Frontend, cognition-loop access, chat-tool registration, commits, restarts, and secret rotation.
