import { useEffect, useMemo, useState } from "react";

import PersonalityForm from "./components/PersonalityForm.jsx";
import PersonalityList from "./components/PersonalityList.jsx";
import ChatWindow from "./components/ChatWindow.jsx";

const appStyles = `
  :root {
    color-scheme: light;
    --bg: #f7efe2;
    --bg-strong: #f2dfc4;
    --panel: rgba(255, 250, 242, 0.85);
    --panel-strong: rgba(255, 248, 235, 0.96);
    --border: rgba(75, 48, 22, 0.14);
    --text: #2f1c11;
    --muted: #795540;
    --accent: #bf5a2a;
    --accent-deep: #7f2d12;
    --accent-soft: #ffd39e;
    --shadow: 0 30px 80px rgba(110, 63, 28, 0.18);
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    min-width: 320px;
    min-height: 100vh;
    font-family: "Manrope", sans-serif;
    color: var(--text);
    background:
      radial-gradient(circle at top left, rgba(255, 216, 169, 0.8), transparent 32%),
      radial-gradient(circle at right 15%, rgba(191, 90, 42, 0.18), transparent 26%),
      linear-gradient(145deg, #fbf5eb 0%, #f4e4c8 45%, #e9d2b2 100%);
  }

  button,
  input,
  textarea {
    font: inherit;
  }

  button {
    cursor: pointer;
  }

  #root {
    min-height: 100vh;
  }

  .app-shell {
    width: min(1380px, calc(100vw - 32px));
    margin: 0 auto;
    padding: 28px 0 32px;
  }

  .hero {
    position: relative;
    overflow: hidden;
    margin-bottom: 20px;
    padding: 28px;
    border: 1px solid var(--border);
    border-radius: 28px;
    background: linear-gradient(135deg, rgba(255, 248, 237, 0.9), rgba(255, 226, 188, 0.88));
    box-shadow: var(--shadow);
  }

  .hero::after {
    content: "";
    position: absolute;
    inset: auto -80px -110px auto;
    width: 240px;
    height: 240px;
    border-radius: 999px;
    background: radial-gradient(circle, rgba(191, 90, 42, 0.2), transparent 70%);
  }

  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 999px;
    background: rgba(255, 245, 230, 0.86);
    border: 1px solid rgba(127, 45, 18, 0.12);
    color: var(--accent-deep);
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .hero-grid {
    position: relative;
    z-index: 1;
    display: grid;
    gap: 24px;
    grid-template-columns: 1.4fr 0.8fr;
    align-items: end;
  }

  .hero h1 {
    margin: 16px 0 12px;
    max-width: 10ch;
    font-family: "Fraunces", serif;
    font-size: clamp(3rem, 5vw, 5.2rem);
    line-height: 0.92;
    letter-spacing: -0.06em;
  }

  .hero p {
    margin: 0;
    max-width: 62ch;
    color: var(--muted);
    font-size: 1rem;
    line-height: 1.65;
  }

  .hero-callout {
    padding: 20px;
    border-radius: 22px;
    background: rgba(255, 251, 245, 0.78);
    border: 1px solid rgba(127, 45, 18, 0.1);
  }

  .hero-callout strong {
    display: block;
    margin-bottom: 8px;
    color: var(--accent-deep);
    font-size: 0.9rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .hero-callout span {
    display: block;
    line-height: 1.7;
    color: var(--text);
  }

  .workspace {
    display: grid;
    grid-template-columns: 340px minmax(0, 1fr);
    gap: 20px;
  }

  .panel {
    border: 1px solid var(--border);
    border-radius: 26px;
    background: var(--panel);
    box-shadow: var(--shadow);
    backdrop-filter: blur(12px);
  }

  .sidebar {
    padding: 20px;
  }

  .main-panel {
    overflow: hidden;
  }

  .tabs {
    display: flex;
    gap: 12px;
    padding: 20px 20px 0;
  }

  .tab {
    padding: 12px 18px;
    border: 1px solid rgba(127, 45, 18, 0.14);
    border-radius: 999px;
    background: rgba(255, 250, 242, 0.8);
    color: var(--muted);
    font-weight: 700;
    transition: transform 180ms ease, background 180ms ease, color 180ms ease;
  }

  .tab:hover {
    transform: translateY(-1px);
  }

  .tab.active {
    background: linear-gradient(135deg, var(--accent), var(--accent-deep));
    color: #fff7f0;
  }

  .main-content {
    padding: 20px;
  }

  .status {
    margin-top: 16px;
    padding: 12px 14px;
    border-radius: 16px;
    font-size: 0.95rem;
  }

  .status.error {
    background: rgba(160, 27, 27, 0.08);
    color: #8c1d18;
    border: 1px solid rgba(140, 29, 24, 0.12);
  }

  .status.success {
    background: rgba(25, 107, 59, 0.08);
    color: #1f6b3b;
    border: 1px solid rgba(31, 107, 59, 0.12);
  }

  .section-heading {
    margin: 0 0 8px;
    font-family: "Fraunces", serif;
    font-size: 1.9rem;
    letter-spacing: -0.04em;
  }

  .section-copy {
    margin: 0 0 20px;
    color: var(--muted);
    line-height: 1.6;
  }

  .meta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 20px;
  }

  .meta-pill {
    padding: 10px 14px;
    border-radius: 999px;
    background: rgba(255, 248, 237, 0.92);
    border: 1px solid rgba(127, 45, 18, 0.1);
    color: var(--accent-deep);
    font-size: 0.9rem;
    font-weight: 700;
  }

  @media (max-width: 1024px) {
    .hero-grid,
    .workspace {
      grid-template-columns: 1fr;
    }

    .hero h1 {
      max-width: none;
    }
  }

  @media (max-width: 720px) {
    .app-shell {
      width: min(100vw - 20px, 1380px);
      padding-top: 18px;
    }

    .hero,
    .sidebar,
    .main-content {
      padding: 18px;
    }

    .tabs {
      padding: 18px 18px 0;
      overflow-x: auto;
    }
  }
`;

export default function App() {
  const [personalities, setPersonalities] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [activeView, setActiveView] = useState("builder");
  const [chatLogs, setChatLogs] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });

  const selectedPersonality = useMemo(
    () => personalities.find((personality) => personality.id === selectedId) || null,
    [personalities, selectedId],
  );

  useEffect(() => {
    void loadPersonalities();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      return;
    }

    void loadChatHistory(selectedId);
  }, [selectedId]);

  async function loadPersonalities() {
    setIsLoading(true);

    try {
      const response = await fetch("/personalities");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load personalities.");
      }

      setPersonalities(data);

      if (!selectedId && data.length) {
        setSelectedId(data[0].id);
      }
    } catch (error) {
      setStatus({
        type: "error",
        message: error.message || "Failed to load personalities.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function loadChatHistory(personalityId) {
    setIsLoadingMessages(true);

    try {
      const response = await fetch(`/personality/${personalityId}/messages`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load chat history.");
      }

      setChatLogs((current) => ({
        ...current,
        [personalityId]: data,
      }));
    } catch (error) {
      setStatus({
        type: "error",
        message: error.message || "Failed to load chat history.",
      });
    } finally {
      setIsLoadingMessages(false);
    }
  }

  function handlePersonalityCreated(personality) {
    setPersonalities((current) => [personality, ...current]);
    setSelectedId(personality.id);
    setChatLogs((current) => ({
      ...current,
      [personality.id]: [],
    }));
    setActiveView("chat");
    setStatus({
      type: "success",
      message: `${personality.name} is ready. Start the conversation on the chat page.`,
    });
  }

  async function handleVoiceProfileChange(nextVoiceProfile) {
    if (!selectedPersonality) {
      return;
    }

    try {
      const response = await fetch(`/personality/${selectedPersonality.id}/voice`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          voiceProfile: nextVoiceProfile,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save voice profile.");
      }

      setPersonalities((current) =>
        current.map((personality) =>
          personality.id === data.id ? data : personality,
        ),
      );
      setStatus({
        type: "success",
        message: `Saved voice settings for ${data.name}.`,
      });
    } catch (error) {
      setStatus({
        type: "error",
        message: error.message || "Failed to save voice profile.",
      });
    }
  }

  function handleSelectPersonality(id) {
    setSelectedId(id);
    setStatus({ type: "", message: "" });
  }

  async function handleSendMessage(message) {
    if (!selectedPersonality) {
      setStatus({
        type: "error",
        message: "Create or select a personality before sending a message.",
      });
      return;
    }

    const personalityId = selectedPersonality.id;

    setStatus({ type: "", message: "" });
    setIsSending(true);
    setChatLogs((current) => ({
      ...current,
      [personalityId]: [
        ...(current[personalityId] || []),
        { role: "user", content: message },
      ],
    }));

    try {
      const response = await fetch("/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalityId,
          message,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to send chat message.");
      }

      setChatLogs((current) => ({
        ...current,
        [personalityId]: [
          ...(current[personalityId] || []),
          { role: "assistant", content: data.reply },
        ],
      }));
    } catch (error) {
      setChatLogs((current) => ({
        ...current,
        [personalityId]: (current[personalityId] || []).slice(0, -1),
      }));
      setStatus({
        type: "error",
        message: error.message || "Failed to send chat message.",
      });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <>
      <style>{appStyles}</style>
      <div className="app-shell">
        <section className="hero">
          <div className="hero-grid">
            <div>
              <span className="eyebrow">Voxis Core Loop v1</span>
              <h1>Build a voice the model can inhabit.</h1>
              <p>
                Define a character, lock in their behavior, and move straight into an
                in-character chat loop. This version focuses on durable prompt engineering,
                fast iteration, and clean handoff to any OpenAI-compatible LLM endpoint.
              </p>
            </div>
            <div className="hero-callout">
              <strong>Best input</strong>
              <span>
                Give the creator a specific name, a sharp description, and concrete traits or
                quirks. The stronger the source notes you type in, the stronger the resulting
                system prompt becomes.
              </span>
            </div>
          </div>
        </section>

        <section className="workspace">
          <aside className="panel sidebar">
            <PersonalityList
              personalities={personalities}
              activeId={selectedId}
              isLoading={isLoading}
              onRefresh={loadPersonalities}
              onSelect={handleSelectPersonality}
              onOpenChat={() => setActiveView("chat")}
            />
          </aside>

          <main className="panel main-panel">
            <div className="tabs">
              <button
                type="button"
                className={`tab ${activeView === "builder" ? "active" : ""}`}
                onClick={() => setActiveView("builder")}
              >
                Character Request
              </button>
              <button
                type="button"
                className={`tab ${activeView === "chat" ? "active" : ""}`}
                onClick={() => setActiveView("chat")}
              >
                Character Chat
              </button>
            </div>

            <div className="main-content">
              {activeView === "builder" ? (
                <>
                  <h2 className="section-heading">Shape a new personality</h2>
                  <p className="section-copy">
                    Start with a character name and optional source URLs, pull research into the
                    form, then save a profile with voice settings and a stronger system prompt.
                  </p>
                  <PersonalityForm onCreated={handlePersonalityCreated} onError={setStatus} />
                </>
              ) : (
                <>
                  <h2 className="section-heading">Talk to the active character</h2>
                  <p className="section-copy">
                    Voxis injects the saved system prompt plus the last 10 persisted messages into
                    every LLM call so the personality stays coherent across sessions.
                  </p>

                  {selectedPersonality ? (
                    <div className="meta-row">
                      <span className="meta-pill">Active: {selectedPersonality.name}</span>
                      <span className="meta-pill">Mood: {selectedPersonality.mood}</span>
                      <span className="meta-pill">
                        Traits: {selectedPersonality.traits.length}
                      </span>
                      <span className="meta-pill">
                        Sources: {selectedPersonality.researchSources?.length || selectedPersonality.sourceUrls.length}
                      </span>
                    </div>
                  ) : null}

                  <ChatWindow
                    personality={selectedPersonality}
                    messages={chatLogs[selectedId] || []}
                    isLoadingMessages={isLoadingMessages}
                    isSending={isSending}
                    onSend={handleSendMessage}
                    onSaveVoiceProfile={handleVoiceProfileChange}
                    onJumpToBuilder={() => setActiveView("builder")}
                  />
                </>
              )}

              {status.message ? (
                <div className={`status ${status.type || "success"}`}>{status.message}</div>
              ) : null}
            </div>
          </main>
        </section>
      </div>
    </>
  );
}
