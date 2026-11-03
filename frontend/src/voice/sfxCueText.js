// Sound-cue words the model wraps in *asterisks*, (parentheses), or <brackets>.
// Ordinary emphasis such as *are* is spoken and shown. Only these cues are removed.
const SFX_CUE_WORD = /^(?:bu+rp|belch|bra+p|u+rrp|br+rp|giggle|chuckle|longburp)$/i;

export function isSpokenSfxCue(word) {
  const compact = String(word || "").toLowerCase().replace(/[^a-z]/g, "");
  return SFX_CUE_WORD.test(compact);
}

function unwrapEmphasis(match, inner) {
  const trimmed = String(inner || "").trim();
  if (!trimmed || isSpokenSfxCue(trimmed)) {
    return "";
  }
  return trimmed;
}

export function stripSfxCues(text) {
  // Remove explicit sound cues so the bubble does not print *BUUUURP*.
  // Keep every other emphasized word. The chat renders plain text, so
  // *are* and *mental note* become the words themselves.
  let t = String(text || "");
  t = t.replace(/\*\*([^*\n]+)\*\*/g, unwrapEmphasis);
  t = t.replace(/\*([^*\n]+)\*/g, unwrapEmphasis);
  t = t.replace(/[\(\[]\s*([a-zA-Z]+)\s*[\)\]]/gi, (match, word) => (
    isSpokenSfxCue(word) ? "" : match
  ));
  t = t.replace(/<([a-zA-Z]+)>/gi, (match, word) => (
    isSpokenSfxCue(word) ? "" : match
  ));
  t = t.replace(/\b(BUUU+RP|BRAAA+P|URRR+P|BRRR+RP|BURP|BELCH|BRAAP|URRRP)\b/gi, "");

  // Collapse runs of spaces and tabs only. Keep paragraph breaks.
  t = t.replace(/[ \t]+/g, " ");
  t = t.replace(/^[ \t]+/gm, "");
  t = t.replace(/[ \t]+$/gm, "");

  return t.trim();
}
