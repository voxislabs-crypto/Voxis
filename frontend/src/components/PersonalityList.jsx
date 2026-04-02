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
    font-family: "Fraunces", serif;
    font-size: 1.8rem;
    letter-spacing: -0.04em;
  }

  .list-header button {
    padding: 10px 14px;
    border: 1px solid rgba(127, 45, 18, 0.14);
    border-radius: 999px;
    background: rgba(255, 250, 242, 0.9);
    color: #7f2d12;
    font-weight: 700;
  }

  .list-copy {
    margin: 0 0 18px;
    color: #795540;
    line-height: 1.6;
  }

  .personality-stack {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .personality-card {
    padding: 16px;
    border-radius: 20px;
    border: 1px solid rgba(127, 45, 18, 0.1);
    background: rgba(255, 252, 247, 0.9);
    transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
  }

  .personality-card.active {
    border-color: rgba(191, 90, 42, 0.45);
    box-shadow: 0 20px 40px rgba(127, 45, 18, 0.12);
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
    margin: 0 0 6px;
    font-size: 1.05rem;
  }

  .personality-card p {
    margin: 0;
    color: #795540;
    line-height: 1.55;
  }

  .personality-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }

  .personality-meta span {
    padding: 7px 10px;
    border-radius: 999px;
    background: rgba(255, 216, 169, 0.22);
    color: #7f2d12;
    font-size: 0.82rem;
    font-weight: 700;
  }

  .empty-list {
    padding: 18px;
    border-radius: 20px;
    background: rgba(255, 250, 242, 0.8);
    color: #795540;
    line-height: 1.65;
    border: 1px dashed rgba(127, 45, 18, 0.18);
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
                    <span>{personality.mood}</span>
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
