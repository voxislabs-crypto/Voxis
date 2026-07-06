import { useState, useEffect, useCallback } from "react";
import { useAuthFetch } from "../hooks/useAuthFetch.js";

const MEMORY_TYPES = [
  "fact", "preference", "relationship", "event",
  "scheme", "grudge", "leverage", "target_weakness", "debt",
  "note", "user_pref", "user_fact", "context", "anchor",
];

const TYPE_COLORS = {
  fact:             "rgba(0,180,255,0.18)",
  preference:       "rgba(120,100,255,0.22)",
  relationship:     "rgba(80,200,120,0.22)",
  event:            "rgba(200,160,60,0.22)",
  scheme:           "rgba(220,60,60,0.22)",
  grudge:           "rgba(220,80,40,0.22)",
  leverage:         "rgba(180,50,220,0.22)",
  target_weakness:  "rgba(240,100,60,0.22)",
  debt:             "rgba(160,140,60,0.22)",
  note:             "rgba(120,120,140,0.2)",
  user_pref:        "rgba(255,130,190,0.2)",
  user_fact:        "rgba(120,220,180,0.2)",
  context:          "rgba(255,180,120,0.2)",
  anchor:           "rgba(255,220,110,0.25)",
};

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

const journalStyles = `
  .journal-shell {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .journal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 6px;
    flex-wrap: wrap;
  }

  .journal-header-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .journal-header h2 {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 800;
    letter-spacing: -0.04em;
    background: linear-gradient(135deg, #ffffff 50%, var(--accent));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .journal-copy {
    margin: 0 0 20px;
    color: var(--muted);
    line-height: 1.6;
    font-size: 0.92rem;
  }

  .journal-filter-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 16px;
  }

  .filter-pill {
    padding: 5px 13px;
    border-radius: 999px;
    border: 1px solid rgba(0,180,255,0.14);
    background: transparent;
    color: var(--muted);
    font-size: 0.8rem;
    cursor: pointer;
    transition: background 150ms, color 150ms, border-color 150ms;
  }

  .filter-pill.active {
    border-color: rgba(0,180,255,0.55);
    background: rgba(0,180,255,0.12);
    color: var(--accent);
  }

  .memory-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .memory-group {
    margin-bottom: 12px;
    border: 1px solid rgba(0,180,255,0.1);
    border-radius: 12px;
    overflow: hidden;
  }

  .memory-group-header {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 14px;
    background: rgba(4,10,20,0.6);
    border: none;
    cursor: pointer;
    color: var(--muted);
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    transition: background 150ms;
  }

  .memory-group-header:hover {
    background: rgba(0,180,255,0.08);
  }

  .memory-group-header .chev {
    font-size: 0.7rem;
    margin-right: 6px;
    transition: transform 140ms ease;
  }

  .memory-group-header.expanded .chev {
    transform: rotate(90deg);
  }

  .memory-group-header .count {
    font-size: 0.7rem;
    opacity: 0.7;
    margin-left: auto;
    padding-left: 8px;
  }

  .memory-row {
    padding: 13px 16px;
    border-radius: 14px;
    border: 1px solid rgba(0,180,255,0.08);
    background: rgba(6,14,28,0.72);
    display: flex;
    gap: 12px;
    align-items: flex-start;
    transition: border-color 150ms;
  }

  .memory-row:hover {
    border-color: rgba(0,180,255,0.18);
  }

  .memory-row.conflict {
    border-color: rgba(248, 113, 113, 0.48);
    box-shadow: inset 0 0 0 1px rgba(248, 113, 113, 0.16);
  }

  .memory-row.disabled {
    opacity: 0.58;
  }

  .memory-row.editing {
    border-color: rgba(0,180,255,0.38);
    background: rgba(0,180,255,0.04);
  }

  .memory-body {
    flex: 1;
    min-width: 0;
  }

  .memory-meta {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 6px;
  }

  .memory-type-badge {
    padding: 2px 9px;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text);
  }

  .importance-badge {
    font-size: 0.78rem;
    color: var(--muted);
  }

  .conflict-badge {
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(248, 113, 113, 0.14);
    border: 1px solid rgba(248, 113, 113, 0.4);
    color: #fca5a5;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .anchor-badge {
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(255,200,50,0.18);
    border: 1px solid rgba(255,200,50,0.35);
    color: #fbbf24;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .memory-content {
    font-size: 0.9rem;
    color: var(--text);
    line-height: 1.5;
    word-break: break-word;
  }

  .memory-date {
    font-size: 0.75rem;
    color: var(--muted);
    margin-top: 4px;
  }

  .memory-actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
    align-items: flex-start;
    padding-top: 2px;
  }

  .memory-quick-controls {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
    margin-top: 8px;
  }

  .memory-slider {
    width: 120px;
    accent-color: #00c8ff;
  }

  .memory-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.78rem;
    color: var(--muted);
  }

  .memory-toggle input {
    accent-color: #00c8ff;
  }

  .btn-icon {
    padding: 5px 10px;
    border-radius: 8px;
    border: 1px solid rgba(0,180,255,0.14);
    background: transparent;
    color: var(--muted);
    font-size: 0.78rem;
    cursor: pointer;
    transition: background 150ms, color 150ms, border-color 150ms;
  }

  .btn-icon:hover {
    background: rgba(0,180,255,0.08);
    color: var(--accent);
    border-color: rgba(0,180,255,0.28);
  }

  .btn-icon.danger:hover {
    background: rgba(240,60,60,0.10);
    color: #f87171;
    border-color: rgba(240,60,60,0.30);
  }

  .edit-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 8px;
  }

  .edit-form textarea {
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid rgba(0,180,255,0.2);
    background: rgba(6,14,28,0.90);
    color: var(--text);
    font-size: 0.88rem;
    resize: vertical;
    min-height: 64px;
  }

  .edit-row {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }

  .edit-row select, .edit-row input[type="number"] {
    padding: 8px 12px;
    border-radius: 10px;
    border: 1px solid rgba(0,180,255,0.2);
    background: rgba(6,14,28,0.90);
    color: var(--text);
    font-size: 0.84rem;
  }

  .edit-row input[type="number"] {
    width: 72px;
  }

  .edit-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .btn-save {
    padding: 7px 18px;
    border-radius: 999px;
    border: none;
    background: var(--accent);
    color: #000;
    font-weight: 700;
    font-size: 0.84rem;
    cursor: pointer;
    transition: opacity 150ms;
  }

  .btn-save:hover { opacity: 0.85; }

  .btn-cancel {
    padding: 7px 14px;
    border-radius: 999px;
    border: 1px solid rgba(0,180,255,0.18);
    background: transparent;
    color: var(--muted);
    font-size: 0.84rem;
    cursor: pointer;
  }

  .btn-cancel:hover { color: var(--text); }

  .empty-journal {
    padding: 32px 0;
    text-align: center;
    color: var(--muted);
    font-size: 0.9rem;
  }

  .journal-status {
    font-size: 0.82rem;
    color: var(--muted);
    margin-bottom: 4px;
  }

  .conflict-panel {
    margin-bottom: 12px;
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid rgba(248, 113, 113, 0.38);
    background: rgba(120, 20, 30, 0.16);
    color: #fecaca;
    font-size: 0.82rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
`;

function formatDate(str) {
  if (!str) return "";
  const d = new Date(str);
  return isNaN(d) ? str : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function hasAnyKeyword(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function detectConflicts(facts) {
  const activeFacts = (Array.isArray(facts) ? facts : []).filter((fact) => Number(fact.enabled ?? 1) !== 0);
  const highImpact = activeFacts.filter((fact) => Number(fact.importance || 0) >= 7);
  const conflicts = [];
  const conflictingIds = new Set();

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

        conflictingIds.add(left.id);
        conflictingIds.add(right.id);
        const winner = Number(left.importance || 0) >= Number(right.importance || 0) ? left : right;
        const loser = winner === left ? right : left;

        conflicts.push({
          type: "opposing_instructions",
          left,
          right,
          winner,
          loser,
        });
        break;
      }
    }
  }

  return { conflicts, conflictingIds };
}

function MemoryRow({ fact, onSave, onDelete, isConflicting, onQuickPatch }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    content: fact.content,
    memoryType: fact.memoryType,
    importance: fact.importance,
    enabled: Number(fact.enabled ?? 1),
  });
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setDraft({
      content: fact.content,
      memoryType: fact.memoryType,
      importance: fact.importance,
      enabled: Number(fact.enabled ?? 1),
    });
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    await onSave(fact.id, draft);
    setSaving(false);
    setEditing(false);
  }

  return (
    <div className={`memory-row${editing ? " editing" : ""}${isConflicting ? " conflict" : ""}${Number(fact.enabled ?? 1) === 0 ? " disabled" : ""}`}>
      <div className="memory-body">
        <div className="memory-meta">
          <span
            className="memory-type-badge"
            style={{ background: TYPE_COLORS[fact.memoryType] || TYPE_COLORS.fact }}
          >
            {fact.memoryType.replace(/_/g, " ")}
          </span>
          <span className="importance-badge">importance {fact.importance}</span>
          {isConflicting && <span className="conflict-badge">conflict</span>}
          {Number(fact.enabled ?? 1) === 0 && <span className="importance-badge">disabled</span>}
          {fact.importance >= 9 && <span className="anchor-badge">anchor</span>}
        </div>

        {editing ? (
          <div className="edit-form">
            <textarea
              value={draft.content}
              onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
            />
            <div className="edit-row">
              <select
                value={draft.memoryType}
                onChange={(e) => setDraft((d) => ({ ...d, memoryType: e.target.value }))}
              >
                {MEMORY_TYPES.map((t) => (
                  <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                ))}
              </select>
              <label style={{ fontSize: "0.82rem", color: "#87a8b9" }}>
                Importance
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={draft.importance}
                  onChange={(e) => setDraft((d) => ({ ...d, importance: Number(e.target.value) }))}
                  style={{ marginLeft: 6 }}
                />
              </label>
              <label className="memory-toggle">
                <input
                  type="checkbox"
                  checked={Number(draft.enabled ?? 1) !== 0}
                  onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked ? 1 : 0 }))}
                />
                Enabled
              </label>
            </div>
            <div className="edit-actions">
              <button type="button" className="btn-cancel" onClick={() => setEditing(false)}>Cancel</button>
              <button type="button" className="btn-save" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="memory-content">{fact.content}</p>
            <div className="memory-quick-controls">
              <label style={{ fontSize: "0.78rem", color: "#87a8b9" }}>
                Importance
                <input
                  className="memory-slider"
                  type="range"
                  min={1}
                  max={10}
                  value={Number(fact.importance || 5)}
                  onChange={(event) =>
                    onQuickPatch(fact.id, {
                      importance: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label className="memory-toggle">
                <input
                  type="checkbox"
                  checked={Number(fact.enabled ?? 1) !== 0}
                  onChange={(event) =>
                    onQuickPatch(fact.id, {
                      enabled: event.target.checked ? 1 : 0,
                    })
                  }
                />
                Enabled
              </label>
            </div>
            <p className="memory-date">
              Added {formatDate(fact.createdAt)}
              {fact.updatedAt && fact.updatedAt !== fact.createdAt && ` · Updated ${formatDate(fact.updatedAt)}`}
            </p>
          </>
        )}
      </div>

      {!editing && (
        <div className="memory-actions">
          <button type="button" className="btn-icon" onClick={startEdit}>Edit</button>
          <button type="button" className="btn-icon danger" onClick={() => onDelete(fact.id)}>Delete</button>
        </div>
      )}
    </div>
  );
}

export default function MemoryJournal({ personality }) {
  const authFetch = useAuthFetch();
  const [facts, setFacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  const load = useCallback(async () => {
    if (!personality) return;
    setLoading(true);
    try {
      const res = await authFetch(`/personality/${personality.id}/memory`);
      const data = await res.json();
      setFacts(Array.isArray(data) ? data : []);
    } catch {
      setStatusMsg("Failed to load memory facts.");
    } finally {
      setLoading(false);
    }
  }, [personality]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(id, draft) {
    try {
      const res = await authFetch(`/memory/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setFacts((current) => current.map((f) => (f.id === id ? updated : f)));
      setStatusMsg("Saved.");
      setTimeout(() => setStatusMsg(""), 2000);
    } catch {
      setStatusMsg("Save failed.");
    }
  }

  async function handleQuickPatch(id, patch) {
    const current = facts.find((fact) => fact.id === id);
    if (!current) {
      return;
    }

    const nextPayload = {
      content: current.content,
      memoryType: current.memoryType,
      importance: Number(current.importance || 5),
      enabled: Number(current.enabled ?? 1),
      ...patch,
    };

    await handleSave(id, nextPayload);
  }

  async function handleDelete(id) {
    try {
      await authFetch(`/memory/${id}`, { method: "DELETE" });
      setFacts((current) => current.filter((f) => f.id !== id));
    } catch {
      setStatusMsg("Delete failed.");
    }
  }

  async function handleBackfill() {
    if (!personality) {
      return;
    }

    setBackfilling(true);
    try {
      const res = await authFetch(`/personality/${personality.id}/memory/backfill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 100 }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Backfill failed.");
      }

      await load();
      setStatusMsg(
        `Embeddings backfilled: ${data.completed}/${data.attempted} updated, ${data.remaining} remaining.`
      );
    } catch (error) {
      setStatusMsg(error.message || "Backfill failed.");
    } finally {
      setBackfilling(false);
    }
  }

  async function handleAutoResolveConflicts() {
    const { conflicts } = detectConflicts(facts);
    if (!conflicts.length) {
      setStatusMsg("No high-impact conflicts found.");
      return;
    }

    try {
      for (const conflict of conflicts) {
        if (!conflict?.loser?.id) {
          continue;
        }

        const loser = conflict.loser;
        const loweredImportance = Math.max(1, Math.min(3, Number(loser.importance || 5) - 3));
        await handleSave(loser.id, {
          content: loser.content,
          memoryType: loser.memoryType,
          importance: loweredImportance,
          enabled: 0,
        });
      }

      setStatusMsg(`Auto-resolved ${conflicts.length} conflicts by suppressing weaker instructions.`);
      await load();
    } catch {
      setStatusMsg("Conflict auto-resolve failed.");
    }
  }

  const conflictScan = detectConflicts(facts);
  const presentTypes = ["all", ...Array.from(new Set(facts.map((f) => f.memoryType)))];
  const typeScoped = typeFilter === "all" ? facts : facts.filter((f) => f.memoryType === typeFilter);
  let visible = showActiveOnly ? typeScoped.filter((f) => Number(f.enabled ?? 1) !== 0) : typeScoped;
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    visible = visible.filter((f) => (f.content || "").toLowerCase().includes(q));
  }

  // Group memories to avoid a long flat list. Groups by type, sorted internally by importance desc.
  const groupedFacts = {};
  visible.forEach((f) => {
    const t = f.memoryType || "fact";
    if (!groupedFacts[t]) groupedFacts[t] = [];
    groupedFacts[t].push(f);
  });
  Object.keys(groupedFacts).forEach((t) => {
    groupedFacts[t].sort((a, b) => (Number(b.importance) || 0) - (Number(a.importance) || 0));
  });
  const groupKeys = Object.keys(groupedFacts).sort((a, b) => {
    const ia = MEMORY_TYPES.indexOf(a);
    const ib = MEMORY_TYPES.indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });

  const toggleGroup = (type) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const expandAll = () => setExpandedGroups(new Set(groupKeys));
  const collapseAll = () => setExpandedGroups(new Set());

  // Auto-expand the filtered group (placed after groupKeys definition)
  useEffect(() => {
    if (typeFilter !== "all" && groupKeys.includes(typeFilter)) {
      setExpandedGroups((prev) => {
        const next = new Set(prev);
        next.add(typeFilter);
        return next;
      });
    }
  }, [typeFilter, groupKeys]);

  // Default: expand first 2-3 groups or important ones when data arrives (prevents initial long flat view)
  useEffect(() => {
    if (facts.length > 0 && expandedGroups.size === 0) {
      const preferred = ["anchor", "fact", "preference", "event", "relationship"];
      let defaults = groupKeys.filter((k) => preferred.includes(k)).slice(0, 3);
      if (defaults.length === 0) defaults = groupKeys.slice(0, Math.min(3, groupKeys.length));
      if (typeFilter !== "all") defaults = [typeFilter];
      setExpandedGroups(new Set(defaults));
    }
  }, [facts.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!personality) {
    return (
      <div className="journal-shell">
        <style>{journalStyles}</style>
        <p className="empty-journal">Select a personality to view its memory journal.</p>
      </div>
    );
  }

  return (
    <div className="journal-shell">
      <style>{journalStyles}</style>

      <div className="journal-header">
        <h2>Memory Journal</h2>
        <div className="journal-header-actions">
          <input
            type="text"
            placeholder="Search memories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid rgba(0,180,255,0.2)", background: "rgba(0,0,0,0.3)", color: "inherit", fontSize: "0.8rem", minWidth: 160 }}
          />
          <button type="button" className="btn-icon" onClick={handleBackfill} disabled={backfilling}>
            {backfilling ? "Backfilling…" : "Backfill embeddings"}
          </button>
          <button type="button" className="btn-icon" onClick={load} disabled={loading || backfilling}>Refresh</button>
        </div>
      </div>

      <p className="journal-copy">
        Facts {personality.name} has learned across conversations. Anchor facts (importance ≥ 9) are permanently
        injected into every prompt and are never auto-pruned. Edit importance or type, or delete facts that are
        wrong or outdated. If embeddings are configured, you can backfill older entries so semantic recall works
        immediately instead of waiting for future chat turns.
      </p>

      {statusMsg && <p className="journal-status">{statusMsg}</p>}

      {conflictScan.conflicts.length > 0 && (
        <div className="conflict-panel">
          <span>
            {conflictScan.conflicts.length} high-impact memory conflict{conflictScan.conflicts.length === 1 ? "" : "s"} detected.
          </span>
          <button type="button" className="btn-icon danger" onClick={() => void handleAutoResolveConflicts()}>
            Auto-resolve weaker memories
          </button>
        </div>
      )}

      {loading ? (
        <p className="empty-journal">Loading…</p>
      ) : facts.length === 0 ? (
        <p className="empty-journal">
          No memory facts yet. They are extracted automatically after each conversation turn.
        </p>
      ) : (
        <>
          <div className="journal-filter-row">
            {presentTypes.map((t) => (
              <button
                key={t}
                type="button"
                className={`filter-pill${typeFilter === t ? " active" : ""}`}
                onClick={() => setTypeFilter(t)}
              >
                {t === "all" ? `All (${facts.length})` : `${t.replace(/_/g, " ")} (${facts.filter((f) => f.memoryType === t).length})`}
              </button>
            ))}
            <button
              type="button"
              className={`filter-pill${showActiveOnly ? " active" : ""}`}
              onClick={() => setShowActiveOnly((current) => !current)}
            >
              {showActiveOnly ? "Active only" : "Show disabled"}
            </button>
            <button type="button" className="filter-pill" onClick={expandAll} style={{ marginLeft: "auto" }}>Expand all</button>
            <button type="button" className="filter-pill" onClick={collapseAll}>Collapse all</button>
          </div>

          {/* Grouped view to avoid long flat lists */}
          <div className="memory-groups">
            {groupKeys.length === 0 ? (
              <p className="empty-journal">No memories match the current filters.</p>
            ) : (
              groupKeys.map((gType) => {
                const items = groupedFacts[gType] || [];
                const isExpanded = expandedGroups.has(gType) || typeFilter === gType;
                const badgeColor = TYPE_COLORS[gType] || TYPE_COLORS.fact;
                return (
                  <div key={gType} className="memory-group">
                    <button
                      type="button"
                      className={`memory-group-header ${isExpanded ? "expanded" : ""}`}
                      onClick={() => toggleGroup(gType)}
                    >
                      <span>
                        <span className="chev">▶</span>
                        <span
                          className="memory-type-badge"
                          style={{ background: badgeColor, fontSize: "0.65rem", padding: "1px 6px", marginRight: 6, verticalAlign: "middle" }}
                        >
                          {gType.replace(/_/g, " ")}
                        </span>
                        {items.length} item{items.length === 1 ? "" : "s"}
                      </span>
                      <span className="count">
                        {isExpanded ? "−" : "+"}
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="memory-list" style={{ padding: "6px 8px 8px" }}>
                        {items.map((fact) => (
                          <MemoryRow
                            key={fact.id}
                            fact={fact}
                            onSave={handleSave}
                            onDelete={handleDelete}
                            isConflicting={conflictScan.conflictingIds.has(fact.id)}
                            onQuickPatch={handleQuickPatch}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
