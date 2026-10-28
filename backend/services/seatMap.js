const NAMED_SEATS = ["gpt", "claude", "grok"];

function positiveInt(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) return null;
  return number;
}

export function readSeatMap(env = process.env) {
  const map = {};
  const raw = String(env.VOXIS_SEAT_MAP || "").trim();

  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        for (const [key, value] of Object.entries(parsed)) {
          const seatId = String(key || "").trim().toLowerCase();
          const personalityId = positiveInt(value);
          if (seatId && personalityId) map[seatId] = personalityId;
        }
      }
    } catch {
      // A bad map falls through to the per-seat variables.
    }
  }

  for (const seatId of NAMED_SEATS) {
    const personalityId = positiveInt(env[`VOXIS_SEAT_${seatId.toUpperCase()}`]);
    if (personalityId) map[seatId] = personalityId;
  }

  return map;
}

export function resolveSeat(input = {}, env = process.env) {
  const explicitPersonalityId = positiveInt(input.personalityId);
  const rawSeat = input.seatId ?? input.seat ?? "";
  const numericSeat = positiveInt(rawSeat);
  const seatId = String(rawSeat || explicitPersonalityId || "").trim().toLowerCase();

  if (explicitPersonalityId) {
    return { seatId: seatId || String(explicitPersonalityId), personalityId: explicitPersonalityId };
  }

  if (numericSeat) {
    return { seatId: String(numericSeat), personalityId: numericSeat };
  }

  const mapped = readSeatMap(env)[seatId];
  if (mapped) return { seatId, personalityId: mapped };
  return { seatId, personalityId: null };
}
