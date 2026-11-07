// computeSfxDelayMs returns milliseconds. Values at or under 30 used to be
// treated as seconds, so a burp 16ms into a short sentence was scheduled at
// 16 seconds and never played.

export function sfxTargetSeconds(delayMs) {
  const n = Number(delayMs);
  if (!Number.isFinite(n)) {
    return 0;
  }
  if (n < 0) {
    return -1;
  }
  return n / 1000;
}
