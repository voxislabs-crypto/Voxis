const OPPOSITION_GROUPS = [
  {
    positive: ["formal", "analytical", "structure", "framework", "evidence", "scientist"],
    negative: ["unstructured", "chaotic", "bubbly", "tween", "reject formal", "hyperactive", "no structure"],
  },
  {
    positive: ["serious", "diplomatic", "professional"],
    negative: ["playful", "mischief", "jokes", "taunts", "party"],
  },
];

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function hasAnyKeyword(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function toConflictKey(type, first, second = "") {
  const left = String(first || "").slice(0, 80);
  const right = String(second || "").slice(0, 80);
  return `${type}:${left}:${right}`;
}

export function detectMemoryConflicts(memories = [], policy = null) {
  const activeMemories = Array.isArray(memories)
    ? memories.filter((memory) => Number(memory?.enabled ?? 1) !== 0)
    : [];
  const highImpact = activeMemories.filter((memory) => Number(memory?.importance || 0) >= 7);

  const conflicts = [];
  const seen = new Set();

  for (let index = 0; index < highImpact.length; index += 1) {
    for (let inner = index + 1; inner < highImpact.length; inner += 1) {
      const left = highImpact[index];
      const right = highImpact[inner];
      const leftText = normalizeText(left.content);
      const rightText = normalizeText(right.content);

      for (const group of OPPOSITION_GROUPS) {
        const leftPositive = hasAnyKeyword(leftText, group.positive);
        const rightNegative = hasAnyKeyword(rightText, group.negative);
        const leftNegative = hasAnyKeyword(leftText, group.negative);
        const rightPositive = hasAnyKeyword(rightText, group.positive);

        if (!((leftPositive && rightNegative) || (leftNegative && rightPositive))) {
          continue;
        }

        const key = toConflictKey(
          "opposing_instructions",
          [left.id, right.id].sort().join("-"),
          [left.importance, right.importance].sort().join("-"),
        );
        if (seen.has(key)) {
          continue;
        }

        seen.add(key);
        const winner = Number(left.importance || 0) >= Number(right.importance || 0) ? left : right;
        const loser = winner === left ? right : left;

        conflicts.push({
          type: "opposing_instructions",
          severity: Number(winner.importance || 0),
          message: "Conflicting memory instructions detected.",
          memories: [left, right],
          suggestion: {
            action: "downrank_or_disable_weaker",
            keepId: winner.id || null,
            suppressId: loser.id || null,
          },
        });
      }
    }
  }

  const unstructuredMemory = highImpact.find((memory) => {
    const text = normalizeText(memory.content);
    return (
      text.includes("unstructured") ||
      text.includes("cosmic tween") ||
      text.includes("reject formal") ||
      text.includes("hyperactive")
    );
  });

  if (
    unstructuredMemory &&
    policy?.activeMode === "scientist" &&
    policy?.modeAccepted !== false
  ) {
    conflicts.push({
      type: "mode_vs_memory",
      severity: Number(unstructuredMemory.importance || 0),
      message: "Scientist mode can conflict with unstructured high-priority memory guidance.",
      memories: [unstructuredMemory],
      suggestion: {
        action: "disable_scientist_structure_when_conflicted",
      },
    });
  }

  return conflicts.sort((left, right) => Number(right.severity || 0) - Number(left.severity || 0));
}
