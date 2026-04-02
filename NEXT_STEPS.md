# Voxis Handoff

This checkpoint includes the first pass on the next feature wave after the core platform commit.

## Completed In This Checkpoint

- YouTube source ingestion now attempts transcript capture and degrades cleanly to metadata if captions are unavailable.
- Research sources are ranked and deduplicated on the backend before being returned to the UI.
- The builder UI now exposes editable source cards with include/remove controls before save.
- Personalities can persist curated `researchSources` and richer voice settings.
- Server-side TTS endpoints and frontend playback wiring are in place.

## Still To Finish

- Validate the source-ranking UX more thoroughly in the browser.
- Test server-side TTS end to end with real provider credentials in `backend/.env`.
- Run one final browser pass on integrated flows and clean up any UI or response-shape rough edges.

## Verified In This Session

- Confirmed `/research-profile` returns ranked sources with default include selection.
- Confirmed curated source edits persist through `POST /personality` and reload through `GET /personalities`.
- Confirmed voice profile persistence through `PATCH /personality/:id/voice`.
- Confirmed expected TTS failure mode without provider credentials: `500` with configuration error.
- Confirmed frontend compiles successfully with `npm run build`.

## Notes

- Backend health is currently restored and `/research-profile` is responding again.
- TTS route wiring is implemented, but it requires `TTS_API_KEY` or a compatible `TTS_BASE_URL` before end-to-end audio generation can succeed.
- The untracked `concepts/` folder was intentionally left out of the commit.