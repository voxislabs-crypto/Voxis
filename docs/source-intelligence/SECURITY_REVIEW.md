# Security review — Source Inspector and proposed packager

Review date: 2026-10-28. Findings cite the current tree. "Verified" means a test in this session passed or the behavior is direct code. "Unverified" means it was not executed here.

This review does not authorize code changes.

## High

None recorded. The inspector refuses to read without `VOXIS_SOURCE_INSPECTOR_SECRET`, including on loopback, and the HTTP tests reject a missing header before the handler runs.

## Medium

### M1 — Large JSON bodies are parsed before the inspector gate

Evidence: `backend/server.js` applies `express.json({ limit: "30mb" })` globally, then later mounts `/api/source-inspector`. The gate is inside that router.

Impact: an unauthenticated client who can reach the process can make it parse a large body before the 401. The secret is not disclosed by that parse.

Remediation: give the inspector router its own small JSON limit, or reject oversized `Content-Length` before the global parser. Do this before relying on the packager route. Not done.

### M2 — Pattern redaction does not cover every secret shape

Evidence: `redactSensitiveText` in `backend/services/sourceInspectorService.js` replaces PEM blocks, quoted assignments whose name matches `apiKey` / `secret` / `password` / `passwd` / `token` / `privateKey` / `accessKey`, `Bearer` tokens, `AKIA…` ids, and `sk-` followed by eight or more letters or digits. The `sk-` pattern stops at a hyphen. Template literals, unquoted values, and secrets in comments do not match.

The service test `redacts secret-shaped values in source excerpts` passed in this session for one quoted `sk-` value and one quoted password. That does not prove other shapes.

Impact: a kept excerpt from an allowed source file can still contain a credential. Denied names (`.env`, key files, sqlite, `credentials.json`, `secrets.json`) are refused before redaction. Other filenames are not.

Remediation: keep `redaction.guaranteed: false` on every package. Do not clip excerpts. Do not package denied paths. A later scanner can add patterns, but no pattern set is complete.

### M3 — No audit trail of reads

Evidence: `requireSourceInspectorAuth`, the controller, and the service do not log successful reads. A repo search for an inspector audit event found none.

Impact: a local holder of the secret can read allowed source without a record of which paths were opened.

Remediation: the packager audit line in `CONTEXT_PACKAGER_DESIGN.md`. Do not log excerpts or the question.

### M4 — Inspector changes are not in the commit that HEAD points at

Evidence: `git rev-parse` is `8f4b62ae8`. `git status` shows `backend/server.js` modified and the inspector modules untracked.

Impact: a restart from the committed tree would not serve the inspector. `curl` to `http://127.0.0.1:3101/api/source-inspector/discover` in this session returned status 000, so the new route was not observed on that port.

Remediation: none in this session. Do not restart as part of design work.

## Low

### L1 — File symlink to a sensitive in-root target was not executed

Evidence: this session's Vitest report is 23 passed, 1 skipped. The only `skipIf` in `sourceInspectorService.test.js` is the file-symlink test, and it skips when creating a file symlink throws `EPERM` or `EACCES`.

The directory-junction test is a normal `it` and the file still passed, so that case ran. It covers a junction that points outside the root: read returns 400, and discover/search do not return the outside bytes.

Impact: the branch that allows an in-root symlink and then denies the real path when it is `.env` is untested on this machine.

Remediation: rerun that test where file symlinks are allowed. Do not treat the skip as a pass.

### L2 — Check-then-read race

Evidence: `read` uses `lstat` / `realpath` and then `readFileSync` on the real path. There is no `O_NOFOLLOW` open.

Impact: a local writer who can replace a file with a link between the check and the read could change what is read. This is a local race, not a remote path traversal bypass of the lexical checks.

Remediation: acceptable for the packager's first version if documented. A later version can open with a no-follow flag where the platform allows it.

### L3 — Search hides per-file failures

Evidence: the search loop `continue`s on oversized files, resolve failures, and read failures. Callers see `truncated` only in some stop conditions.

Impact: search is a poor evidence source. The packager design forbids using it as the collector.

### L4 — Synchronous reads can block the process

Evidence: discover, read, and search use synchronous `fs`. Inspector caps are 256 KiB per file, 500 discover results, and 1500 scan attempts. Search's discover call uses `maxDiscoverFiles` (500), so the 1500 scan cap is not reached by that call.

Impact: a secret holder can stall the event loop. The packager limits this to at most 8 explicit reads.

### L5 — Allowed extensions are broader than application source

Evidence: `SOURCE_EXTENSIONS` includes `.json`, `.md`, `.txt`, `.yml`, `.ps1`, `.sh`, and others. Denial is by directory segment and basename, not by "this file looks secret."

Impact: a secret stored in an allowed filename outside the denied segments can be read if the caller knows the path. Redaction may miss it (M2).

## Notes that are not vulnerabilities by themselves

- `VOXIS_LOCAL` and `VOXIS_INTERNAL_SECRET` do not satisfy the inspector gate. Covered by `requireSourceInspectorAuth.test.js`, which passed in this session.
- The peer check uses `req.socket.remoteAddress` only. A test passes `req.ip` of `127.0.0.1` with socket `10.0.0.8` and expects 401. That test passed.
- Bind host must be `127.0.0.1`, `::1`, or `::ffff:127.0.0.1`. `localhost` and `0.0.0.0` fail. Covered by tests that passed.
- The controller passes `dir` and `limit` for discover, `path` / `startLine` / `endLine` for read, and `query` / `dir` / `limit` for search. The service test that passes `root` on the request and still reads the fixture passed.
- `councilRoutes` is imported in `server.js` and has no `app.use(councilRoutes)`. Its handlers are not the inspector.

## Unverified

- Hard links into or out of the root.
- Behavior when `HOST` is changed after `setSourceInspectorListenHost` has run. The code prefers the recorded host. Not exercised against a live process.
- Whether a future `next(err)` from the packager would hit the global handler and return `err.message`. The design says not to call `next`.
- Full backend suite in this session. It was not run. Do not cite it as this session's result.
