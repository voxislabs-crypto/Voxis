import { useState } from "react";
import AvatarCore from "./AvatarCore.jsx";

const listStyles = `
  .list-header {
    display: flex;
    align-items: center;
    font-weight: 700;
    color: var(--text);
  }

  .personality-expand {
    border: 1px solid rgba(134, 232, 255, 0.34);
    background: linear-gradient(180deg, rgba(208, 248, 255, 0.16), rgba(18, 40, 74, 0.24));
    color: var(--accent);
    border-radius: 999px;
    padding: 6px 10px;
    font-size: 0.72rem;
    font-weight: 700;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.3),
      inset 0 -8px 14px rgba(0, 0, 0, 0.2),
      0 8px 16px rgba(0, 18, 42, 0.32);
    transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
  }

  .personality-expand:hover {
    transform: translateY(-2px);
    border-color: rgba(176, 244, 255, 0.5);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.36),
      inset 0 -8px 14px rgba(0, 0, 0, 0.16),
      0 12px 22px rgba(0, 164, 255, 0.2);
  }

  .personality-detail {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid rgba(0, 180, 255, 0.12);
    display: grid;
    gap: 8px;
  }

  .personality-actions {
    display: flex;
    justify-content: flex-end;
  }

  .choose-persona {
    border: 1px solid rgba(149, 237, 255, 0.38);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.2), transparent 34%),
      linear-gradient(135deg, rgba(0, 200, 255, 0.2), rgba(0, 80, 220, 0.26));
    color: #dff4ff;
    border-radius: 999px;
    padding: 7px 12px;
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.34),
      inset 0 -8px 16px rgba(0, 0, 0, 0.2),
      0 10px 20px rgba(0, 166, 255, 0.2);
    transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
  }

  .choose-persona:hover:not(:disabled) {
    transform: translateY(-2px);
    border-color: rgba(188, 246, 255, 0.56);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.42),
      inset 0 -8px 16px rgba(0, 0, 0, 0.16),
      0 14px 24px rgba(0, 172, 255, 0.26);
  }

  .choose-persona:disabled {
    opacity: 0.6;
  }

  .personality-card {
    padding: 10px 12px;
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

  .personality-card-header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
  }

  .personality-avatar {
    display: grid;
    place-items: center;
    width: 60px;
    height: 60px;
    border-radius: 999px;
    background: transparent;
    border: none;
    box-shadow: none;
  }

  .personality-card h3 {
    margin: 0;
    font-size: 1rem;
      .personality-expand {
        border: 1px solid rgba(0, 180, 255, 0.2);
        background: rgba(0, 180, 255, 0.06);
        color: var(--accent);
        border-radius: 999px;
        padding: 6px 10px;
        font-size: 0.72rem;
        font-weight: 700;
      }

      .personality-detail {
        margin-top: 10px;
        padding-top: 10px;
        border-top: 1px solid rgba(0, 180, 255, 0.12);
        display: grid;
        gap: 8px;
      }

      .personality-actions {
        display: flex;
        justify-content: flex-end;
      }

      .choose-persona {
        border: 1px solid rgba(0, 180, 255, 0.28);
        background: linear-gradient(135deg, rgba(0, 200, 255, 0.18), rgba(0, 80, 220, 0.2));
        color: #dff4ff;
        border-radius: 999px;
        padding: 7px 12px;
        font-size: 0.78rem;
        font-weight: 800;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .choose-persona:disabled {
        opacity: 0.6;
      }

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
  personalities = [],
  activeId,
  isLoading,
  onRefresh,
  onSelect,
  onOpenChat,
}) {
  const [expandedId, setExpandedId] = useState(null);

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
            const traitCount = Array.isArray(personality.traits) ? personality.traits.length : 0;
            const quirkCount = Array.isArray(personality.quirks) ? personality.quirks.length : 0;
            const sourceCount = Array.isArray(personality.researchSources)
              ? personality.researchSources.length
              : Array.isArray(personality.sourceUrls)
              ? personality.sourceUrls.length
              : 0;

            return (
              <div
                key={personality.id}
                className={`personality-card ${isActive ? "active" : ""}`}
              >
                <div className="personality-card-header">
                  <div className="personality-avatar">
                    <AvatarCore
                      size="compact"
                      valence={Number(personality.moodState?.valence || 0)}
                      arousal={Number(personality.moodState?.arousal || 0)}
                      phase="idle"
                      speaking={false}
                      mode="scientist"
                      personalitySeed={`${personality.id}:${personality.name}:${personality.creativeContext || "default"}`}
                      expressionProfile={personality.expressionProfile}
                      expressionPreset={personality.expressionProfile?.preset || "auto"}
                    />
                  </div>
                  <h3>{personality.name}</h3>
                  <button
                    type="button"
                    className="personality-expand"
                    onClick={() =>
                      setExpandedId((current) =>
                        current === personality.id ? null : personality.id,
                      )
                    }
                  >
                    {expandedId === personality.id ? "Hide" : "Details"}
                  </button>
                </div>

                {expandedId === personality.id ? (
                  <div className="personality-detail">
                    <p>{personality.description}</p>
                    <div className="personality-meta">
                      <span>{personality.moodLabel || personality.mood}</span>
                      {personality.creativeContext && personality.creativeContext !== "default" && (
                        <span>{personality.creativeContext.replace(/_/g, " ")}</span>
                      )}
                      <span>{traitCount} traits</span>
                      <span>{quirkCount} quirks</span>
                      <span>{sourceCount} sources</span>
                    </div>
                    <div className="personality-actions">
                      <button
                        type="button"
                        className="choose-persona"
                        disabled={isActive}
                        onClick={() => {
                          onSelect(personality.id);
                          onOpenChat();
                        }}
                      >
                        {isActive ? "Selected" : "Choose Persona"}
                      </button>
                    </div>
                  </div>
                ) : null}
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
