import { useState, useEffect, useCallback } from "react";

const MEMORY_TYPES = [
  "fact", "preference", "relationship", "event",
  "scheme", "grudge", "leverage", "target_weakness", "debt",
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
};

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
`;

function formatDate(str) {
  if (!str) return "";
  const d = new Date(str);
  return isNaN(d) ? str : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function MemoryRow({ fact, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ content: fact.content, memoryType: fact.memoryType, importance: fact.importance });
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setDraft({ content: fact.content, memoryType: fact.memoryType, importance: fact.importance });
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    await onSave(fact.id, draft);
    setSaving(false);
    setEditing(false);
  }

  return (
    <div className={`memory-row${editing ? " editing" : ""}`}>
      <div className="memory-body">
        <div className="memory-meta">
          <span
            className="memory-type-badge"
            style={{ background: TYPE_COLORS[fact.memoryType] || TYPE_COLORS.fact }}
          >
            {fact.memoryType.replace(/_/g, " ")}
          </span>
          <span className="importance-badge">importance {fact.importance}</span>
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
              <label style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
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
  const [facts, setFacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const load = useCallback(async () => {
    if (!personality) return;
    setLoading(true);
    try {
      const res = await fetch(`/personality/${personality.id}/memory`);
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
      const res = await fetch(`/memory/${id}`, {
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

  async function handleDelete(id) {
    try {
      await fetch(`/memory/${id}`, { method: "DELETE" });
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
      const res = await fetch(`/personality/${personality.id}/memory/backfill`, {
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

  const presentTypes = ["all", ...Array.from(new Set(facts.map((f) => f.memoryType)))];
  const visible = typeFilter === "all" ? facts : facts.filter((f) => f.memoryType === typeFilter);

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
          </div>

          <div className="memory-list">
            {visible.map((fact) => (
              <MemoryRow
                key={fact.id}
                fact={fact}
                onSave={handleSave}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
