# Current state — Source Inspector

Inspection date: 2026-10-28. Application code was not changed in this pass. Tests below were executed in this pass unless noted.

## Git

- HEAD `8f4b62ae8`.
- Uncommitted inspector work: `backend/server.js` modified. Untracked: `backend/services/sourceInspectorService.js`, `backend/middleware/requireSourceInspectorAuth.js`, `backend/controllers/sourceInspectorController.js`, `backend/routes/sourceInspectorRoutes.js`, `backend/tests/sourceInspectorService.test.js`, `backend/tests/requireSourceInspectorAuth.test.js`.
- Pre-existing dirty paths were not inspected as product code and were not cleaned.

## Integration

Registered in source, not observed on a live process.

- `backend/server.js` imports `sourceInspectorRoutes` and calls `app.use("/api/source-inspector", sourceInspectorRoutes)` at line 132.
- The same file calls `setSourceInspectorListenHost(listenHost)` after `resolveListenHost()`.
- `councilRoutes` is imported. There is no `app.use(councilRoutes)`.
- `POST /api/internal/*` is a different router (`internalChatRoutes`) and does not reference the inspector.
- `shared/ports.json` says `"backend": 3101`. A POST to `http://127.0.0.1:3101/api/source-inspector/discover` with an empty JSON body returned curl HTTP status 000. The route was not confirmed on a running server.

## Operations

Router: `backend/routes/sourceInspectorRoutes.js`. Middleware `requireSourceInspectorAuth` is `router.stack[0]` in the route test, then:

- `POST /discover` body fields used: `dir`, `limit`.
- `POST /read` body fields used: `path`, `startLine`, `endLine`.
- `POST /search` body fields used: `query`, `dir`, `limit`.

Service entry points: `discoverSource`, `readSource`, `searchSource`, and `createSourceInspector({ root })`. The default root is `path.resolve` from `backend/services` to the repo root (`DEFAULT_REPO_ROOT`). HTTP handlers do not pass `root`.

Read result fields: `path`, `startLine`, `endLine`, `totalLines`, `truncated`, `content`.

Discover result fields: `files` (`path`, `bytes`), `truncated`, `limit`.

Search result fields: `matches` (`path`, `line`, `text`), `truncated`, `limit`, `scanned`.

There is no write, apply, or commit function on the inspector object. The service test asserts those names are `undefined`. That test passed.

## Authentication

`backend/middleware/requireSourceInspectorAuth.js`.

All failures return 401 `{ "error": "Source inspector authorization failed." }`.

A request continues only when:

- The recorded listen host, or `HOST` if none was recorded, is `127.0.0.1`, `::1`, or `::ffff:127.0.0.1`.
- `req.socket.remoteAddress` is one of those values. `req.ip` is not read.
- `VOXIS_SOURCE_INSPECTOR_SECRET` is non-empty after trim.
- Header `x-voxis-source-inspector-key` matches that secret with `timingSafeEqual`.

The query string and `x-voxis-internal-key` are not read. `VOXIS_LOCAL` is not read. Comparison trims the header and the expected secret.

## Filesystem jail

`createSourceInspector` realpaths `root` and keeps that directory. Request paths are split on `/` and `\`. Absolute paths, drive prefixes, NUL, depth over 40, and any `..` segment throw `InspectorError` 400 `Path is outside the repository root.`

Each path component is `lstat`ed. A symlink is `realpath`ed and must stay inside the root. The final path is `realpath`ed and checked again. Discovery skips directory entries whose `isSymbolicLink()` is true.

Denied segments include `node_modules`, `.git`, `mcps`, `voice-samples`, `voice-services`, `dist`, `build`, `coverage`, `.next`, `sfx-cache`, `loop-cache`, `.dropstone`, `music`, `videos`, `melotts`, `openvoice`.

Sensitive basenames include `.env` and `.env.*`, `id_rsa`, `credentials.json`, `secrets.json`, and extensions `.pem`, `.key`, `.p12`, `.pfx`, `.kdbx`, `.sqlite`, `.sqlite3`, `.db`.

Other files must have an allowed source extension or the basename `dockerfile`, `makefile`, or `license`. Refusal message: `Path is not available to the source inspector.` Status 403.

## Limits

From `LIMITS` in `sourceInspectorService.js`:

- File size 256 KiB. Larger files return 413 and are not read. Discovery can still list them.
- Read line cap 400. `truncated` is true when the returned range stops early. Default start is line 1 when `startLine` is omitted.
- Discover default 200, hard max 500.
- Search default 20, hard max 50. Query length 2–200. Match text max 240 characters after redaction.
- Path max 500 characters. Depth max 40.
- Search scans at most 1500 files, but it first discovers at most 500, so the 1500 cap is not the one that fires on that path.

The global JSON parser limit is 30mb (`server.js`). That limit is not an inspector cap.

## Redaction

`redactSensitiveText` runs on each returned read line and on each search excerpt. Patterns are listed in `SECURITY_REVIEW.md` M2. The function is exported. It is not a guarantee.

## Errors and logging

`InspectorError` carries `statusCode`. The controller returns that status and `error.message` when status is 400–499. Status 500 and unknown errors become `Source inspector failed.` The controller does not call `next`.

Fixed messages include path escape, denied path, file not found, size limit, bad integers, and bad query length. They do not embed file contents.

No inspector audit log was found.

## Tests executed this session

Command, from `backend/`:

`npm test -- tests/sourceInspectorService.test.js tests/requireSourceInspectorAuth.test.js`

Vitest 4.1.2 result: 2 files, 23 passed, 1 skipped.

Skipped: `rejects a symlink whose real target is a sensitive file inside the root`.

Service cases that ran and passed include discovery exclusions, discover caps, CRLF line numbers, the 400-line read cap, the 256 KiB refusal, lexical traversal, a directory junction escape, denied explicit paths, redaction of one fixture, search caps, and ignoring a caller-supplied `root`.

Auth cases that ran and passed include missing secret, internal-secret and `VOXIS_LOCAL` rejection, wrong secret not echoed, non-loopback peer, missing socket, non-loopback recorded bind, non-loopback `HOST`, loopback accept, router placement, unauthenticated HTTP, query-string secret ignored, and picked discover fields.

The full backend suite was not run in this session.

## Known gaps

See `SECURITY_REVIEW.md`. Short list: redaction is incomplete, there is no audit log, the 30mb parser runs first, file symlinks were skipped, hard links are unverified, search swallows file errors, and the live process on port 3101 was not serving this route during the probe.
