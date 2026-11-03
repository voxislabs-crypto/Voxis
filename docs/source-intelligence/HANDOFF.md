# Handoff

Stopping point: design only. No Context Packager code, route, or Council adapter was added. No service was restarted. Nothing was committed.

## Decisions locked

- The packager is a new read-only service. It calls `readSource` from `backend/services/sourceInspectorService.js`. It does not import `fs` or add a second walker.
- Collection is explicit. The caller names each file and a required line range. The packager does not discover or search on its own.
- If a returned excerpt exceeds the packager byte cap, or the inspector sets `truncated: true`, the excerpt is omitted and the omission is recorded. Excerpts are not clipped.
- Auth stays in `requireSourceInspectorAuth`. The packager does not accept a root, a secret, or a host override.
- The future HTTP route is `POST /api/source-inspector/package` on the existing router in `backend/routes/sourceInspectorRoutes.js`, behind the same middleware. Do not mount it under `/api/internal`. Do not mount `councilRoutes`.
- Do not send a package to `POST /api/internal/context` or `POST /api/internal/round`. Those paths build a short mood block and can persist council memories.
- Source text and the analysis question are untrusted data. They are not system instructions.
- Audit lines list request id, mode, relative paths, counts, and byte total. They do not include excerpts, the question, the header, or the secret.
- Council advisory and the patch workflow are later phases. This handoff does not authorize them.

## Verified in this session

- Focused Vitest run on 2026-10-28: `tests/sourceInspectorService.test.js` and `tests/requireSourceInspectorAuth.test.js`. Result: 23 passed, 1 skipped.
- The skip is `rejects a symlink whose real target is a sensitive file inside the root`. The test probes file symlinks and skips on `EPERM` or `EACCES`. The directory-junction escape test is not that skip, and the file reported the other service tests passed.
- `backend/server.js` line 132 registers `app.use("/api/source-inspector", sourceInspectorRoutes)`. `app.use(councilRoutes)` is absent. `councilRoutes` is imported and not mounted.
- HEAD is `8f4b62ae8`. The inspector files are uncommitted (`server.js` modified, the other inspector files untracked).
- `curl` to `http://127.0.0.1:3101/api/source-inspector/discover` returned HTTP status 000. `shared/ports.json` records `"backend": 3101`. The running process was not verified.
- No `COE_` or `COUNCIL_URL` match in `backend/**/*.js`. No audit log in the inspector modules.

## Unresolved

- Whether the next session should commit the inspector before building the packager. Not decided here.
- File-symlink behavior on a machine that allows file symlinks. Unverified here.
- Hard-link escapes. Unverified.
- Whether the global `express.json({ limit: "30mb" })` parser should be narrowed before the packager route is mounted. Recommended, not done.

## First implementation task

Add `backend/services/contextPackagerService.js` and `backend/tests/contextPackagerService.test.js`.

Export `packageContext(request, { read })`. Default `read` to `readSource`. Tests must pass a fake `read` and must not touch the developer tree.

Implement the input rules, omission rules, output shape, and audit line in `CONTEXT_PACKAGER_DESIGN.md` and `CONTEXT_PACKAGER_SCHEMA.json`. Do not add the route in that first change. Add `POST /package` only after the service tests pass, on the existing inspector router, with a test that a missing secret returns 401 and the fake reader is not called.
