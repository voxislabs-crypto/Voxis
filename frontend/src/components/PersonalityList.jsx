const listStyles = `
  .list-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 18px;
  }

  .list-header h2 {
    margin: 0;
    font-size: 1.6rem;
    font-weight: 800;
    letter-spacing: -0.04em;
    background: linear-gradient(135deg, #ffffff 50%, var(--accent));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .list-header button {
    padding: 9px 14px;
    border: 1px solid rgba(0, 180, 255, 0.18);
    border-radius: 999px;
    background: rgba(0, 180, 255, 0.06);
    color: var(--accent);
    font-weight: 700;
    transition: background 180ms, border-color 180ms;
  }

  .list-header button:hover {
    background: rgba(0, 180, 255, 0.12);
    border-color: rgba(0, 180, 255, 0.32);
  }

  .list-copy {
    margin: 0 0 18px;
    color: var(--muted);
    line-height: 1.6;
    font-size: 0.92rem;
  }

  .personality-stack {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .personality-card {
    padding: 14px 16px;
    border-radius: 18px;
    border: 1px solid rgba(0, 180, 255, 0.08);
    background: rgba(6, 14, 28, 0.72);
    transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease, background 180ms ease;
  }

  .personality-card:hover {
    border-color: rgba(0, 180, 255, 0.20);
    background: rgba(0, 180, 255, 0.04);
  }

  .personality-card.active {
    border-color: rgba(0, 180, 255, 0.38);
    box-shadow: 0 0 0 1px rgba(0, 180, 255, 0.12), 0 12px 32px rgba(0, 60, 140, 0.28);
    background: rgba(0, 180, 255, 0.06);
    transform: translateY(-1px);
  }

  .personality-card button {
    display: block;
    width: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    text-align: left;
    color: inherit;
  }

  .personality-card h3 {
    margin: 0 0 5px;
    font-size: 1rem;
    font-weight: 700;
    color: var(--text);
  }

  .personality-card p {
    margin: 0;
    color: var(--muted);
    font-size: 0.9rem;
    line-height: 1.5;
  }

  .personality-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 10px;
  }

  .personality-meta span {
    padding: 5px 10px;
    border-radius: 999px;
    background: rgba(0, 180, 255, 0.07);
    border: 1px solid rgba(0, 180, 255, 0.14);
    color: var(--accent);
    font-size: 0.78rem;
    font-weight: 700;
  }

  .empty-list {
    padding: 18px;
    border-radius: 18px;
    background: rgba(0, 180, 255, 0.03);
    color: var(--muted);
    line-height: 1.65;
    border: 1px dashed rgba(0, 180, 255, 0.14);
    font-size: 0.92rem;
  }
`;

export default function PersonalityList({
  personalities,
  activeId,
  isLoading,
  onRefresh,
  onSelect,
  onOpenChat,
}) {
  return (
    <>
      <style>{listStyles}</style>
      <div className="list-header">
        <h2>Saved Personas</h2>
        <button type="button" onClick={onRefresh}>
          Refresh
        </button>
      </div>
      <p className="list-copy">
        Pick an active character for chat. Voxis now stores messages in SQLite and can save a
        lightweight voice profile with each persona.
      </p>

      {isLoading ? (
        <div className="empty-list">Loading personalities...</div>
      ) : personalities.length ? (
        <div className="personality-stack">
          {personalities.map((personality) => {
            const isActive = personality.id === activeId;

            return (
              <div
                key={personality.id}
                className={`personality-card ${isActive ? "active" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelect(personality.id);
                    onOpenChat();
                  }}
                >
                  <h3>{personality.name}</h3>
                  <p>{personality.description}</p>
                  <div className="personality-meta">
                    <span>{personality.moodLabel || personality.mood}</span>
                    {personality.creativeContext && personality.creativeContext !== "default" && (
                      <span>{personality.creativeContext.replace(/_/g, " ")}</span>
                    )}
                    <span>{personality.traits.length} traits</span>
                    <span>{personality.quirks.length} quirks</span>
                    <span>{personality.researchSources?.length || personality.sourceUrls.length} sources</span>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-list">
          No personalities saved yet. Open the Character Request page and create one.
        </div>
      )}
    </>
  );
}
