import { useEffect, useMemo, useState } from "react";

import PersonalityForm from "./components/PersonalityForm.jsx";
import PersonalityList from "./components/PersonalityList.jsx";
import ChatWindow from "./components/ChatWindow.jsx";
import MemoryJournal from "./components/MemoryJournal.jsx";
import HarnessReport from "./components/HarnessReport.jsx";
import LlmSettingsPanel from "./components/LlmSettingsPanel.jsx";

const appStyles = `
  :root {
    color-scheme: dark;
    --bg: #060c18;
    --bg-strong: #0a1220;
    --panel: rgba(10, 18, 34, 0.80);
    --panel-strong: rgba(12, 22, 42, 0.96);
    --border: rgba(0, 180, 255, 0.14);
    --text: #dde6f2;
    --muted: #6d80a0;
    --accent: #00c8ff;
    --accent-deep: #0050e0;
    --accent-soft: rgba(0, 200, 255, 0.10);
    --accent-warm: #ff7a38;
    --accent-magenta: #b83cf8;
    --shadow: 0 24px 64px rgba(0, 40, 120, 0.40);
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
      radial-gradient(ellipse 60% 40% at 10% 5%, rgba(0, 80, 180, 0.16), transparent),
      radial-gradient(ellipse 50% 35% at 88% 90%, rgba(140, 20, 210, 0.12), transparent),
      linear-gradient(160deg, #040810 0%, #060c18 55%, #07091a 100%);
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
    padding: 28px 32px;
    border: 1px solid rgba(0, 180, 255, 0.22);
    border-radius: 28px;
    background: linear-gradient(135deg, rgba(8, 18, 38, 0.92), rgba(6, 14, 30, 0.88));
    box-shadow: var(--shadow), inset 0 1px 0 rgba(0, 200, 255, 0.07);
    backdrop-filter: blur(16px);
  }

  .hero::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(135deg, rgba(0, 180, 255, 0.06), rgba(160, 32, 240, 0.05), transparent 60%);
    pointer-events: none;
  }

  .hero::after {
    content: "";
    position: absolute;
    inset: auto -80px -110px auto;
    width: 280px;
    height: 280px;
    border-radius: 999px;
    background: radial-gradient(circle, rgba(0, 180, 255, 0.09), transparent 65%);
    pointer-events: none;
  }

  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 7px 14px;
    border-radius: 999px;
    background: rgba(0, 180, 255, 0.08);
    border: 1px solid rgba(0, 180, 255, 0.24);
    color: var(--accent);
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.1em;
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
    max-width: 12ch;
    font-size: clamp(2.8rem, 5vw, 5rem);
    font-weight: 800;
    line-height: 0.94;
    letter-spacing: -0.05em;
    background: linear-gradient(135deg, #ffffff 30%, var(--accent) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .hero p {
    margin: 0;
    max-width: 62ch;
    color: var(--muted);
    font-size: 1rem;
    line-height: 1.65;
  }

  .profile-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .profile-label {
    color: var(--muted);
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .profile-select {
    min-width: 140px;
    padding: 8px 12px;
    border-radius: 999px;
    border: 1px solid rgba(0, 180, 255, 0.2);
    background: rgba(5, 14, 26, 0.88);
    color: var(--text);
  }

  .hero-callout {
    padding: 20px;
    border-radius: 22px;
    background: rgba(0, 180, 255, 0.05);
    border: 1px solid rgba(0, 180, 255, 0.14);
  }

  .hero-callout strong {
    display: block;
    margin-bottom: 8px;
    color: var(--accent);
    font-size: 0.85rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .hero-callout span {
    display: block;
    line-height: 1.7;
    color: var(--muted);
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
    backdrop-filter: blur(16px);
  }

  .sidebar {
    padding: 20px;
  }

  .main-panel {
    overflow: hidden;
  }

  .tabs {
    display: flex;
    gap: 8px;
    padding: 20px 20px 0;
  }

  .tab {
    padding: 11px 18px;
    border: 1px solid rgba(0, 180, 255, 0.14);
    border-radius: 999px;
    background: rgba(0, 180, 255, 0.04);
    color: var(--muted);
    font-weight: 700;
    transition: transform 180ms ease, background 180ms ease, color 180ms ease, border-color 180ms ease;
  }

  .tab:hover {
    transform: translateY(-1px);
    border-color: rgba(0, 180, 255, 0.28);
    color: var(--text);
  }

  .tab.active {
    background: linear-gradient(135deg, var(--accent), var(--accent-deep));
    border-color: transparent;
    color: #fff;
    box-shadow: 0 4px 16px rgba(0, 160, 255, 0.30);
  }

  .main-content {
    padding: 20px;
  }

  .status {
    margin-top: 16px;
    padding: 12px 16px;
    border-radius: 16px;
    font-size: 0.95rem;
  }

  .status.error {
    background: rgba(240, 40, 40, 0.08);
    color: #ff7272;
    border: 1px solid rgba(240, 40, 40, 0.18);
  }

  .status.success {
    background: rgba(0, 200, 120, 0.08);
    color: #3ae0a0;
    border: 1px solid rgba(0, 200, 120, 0.18);
  }

  .section-heading {
    margin: 0 0 8px;
    font-size: 1.8rem;
    font-weight: 800;
    letter-spacing: -0.04em;
    background: linear-gradient(135deg, #ffffff 40%, var(--accent));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .section-copy {
    margin: 0 0 20px;
    color: var(--muted);
    line-height: 1.6;
  }

  .meta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 20px;
  }

  .meta-pill {
    padding: 8px 14px;
    border-radius: 999px;
    background: rgba(0, 180, 255, 0.07);
    border: 1px solid rgba(0, 180, 255, 0.16);
    color: var(--accent);
    font-size: 0.88rem;
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
  const [users, setUsers] = useState([]);
  const [userProfiles, setUserProfiles] = useState({});
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedMode, setSelectedMode] = useState("scientist");
  const [chatPolicy, setChatPolicy] = useState(null);
  const [profileDraft, setProfileDraft] = useState({
    defaultMode: "scientist",
    safetyTier: "standard",
    supervisedAdvancedMode: false,
  });
  const [isSavingProfile, setIsSavingProfile] = useState(false);
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

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) || null,
    [users, selectedUserId],
  );

  const selectedUserProfile = useMemo(
    () => (selectedUserId ? userProfiles[selectedUserId] || null : null),
    [selectedUserId, userProfiles],
  );

  const allowedModes = useMemo(() => {
    if (!selectedUser) {
      return ["scientist"];
    }

    if (selectedUser.ageBand === "child") {
      return ["kids"];
    }

    if (selectedUser.ageBand === "teen") {
      if (selectedUserProfile?.supervisedAdvancedMode) {
        return ["kids", "scientist"];
      }

      return ["kids"];
    }

    return ["kids", "scientist"];
  }, [selectedUser, selectedUserProfile]);

  useEffect(() => {
    void loadUsers();
  }, []);

  useEffect(() => {
    void loadPersonalities();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      return;
    }

    void loadChatHistory(selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (!allowedModes.includes(selectedMode)) {
      setSelectedMode(allowedModes[0] || "scientist");
    }
  }, [allowedModes, selectedMode]);

  useEffect(() => {
    if (!selectedUserId) {
      return;
    }

    const preferredMode = selectedUserProfile?.defaultMode;
    if (preferredMode && allowedModes.includes(preferredMode)) {
      setSelectedMode(preferredMode);
      return;
    }

    if (allowedModes.length) {
      setSelectedMode(allowedModes[0]);
    }
  }, [selectedUserId, selectedUserProfile?.defaultMode, allowedModes]);

  useEffect(() => {
    if (!selectedUserProfile) {
      return;
    }

    setProfileDraft({
      defaultMode: selectedUserProfile.defaultMode || "scientist",
      safetyTier: selectedUserProfile.safetyTier || "standard",
      supervisedAdvancedMode: Boolean(selectedUserProfile.supervisedAdvancedMode),
    });
  }, [selectedUserProfile]);

  async function loadUsers() {
    try {
      const response = await fetch("/users");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load users.");
      }

      let loadedUsers = Array.isArray(data.users) ? data.users : [];

      if (!loadedUsers.length) {
        const bootstrapResponse = await fetch("/users", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            displayName: "Guest",
            ageBand: "adult",
            defaultMode: "scientist",
          }),
        });

        const bootstrapData = await bootstrapResponse.json();
        if (!bootstrapResponse.ok) {
          throw new Error(bootstrapData.error || "Failed to bootstrap default user.");
        }

        loadedUsers = [bootstrapData.user];
        setUserProfiles((current) => ({
          ...current,
          [bootstrapData.user.id]: bootstrapData.profile,
        }));
      }

      setUsers(loadedUsers);
      if (!selectedUserId && loadedUsers.length) {
        setSelectedUserId(loadedUsers[0].id);
      }

      await Promise.all(
        loadedUsers.map(async (user) => {
          const profileResponse = await fetch(`/users/${user.id}/profile`);
          const profileData = await profileResponse.json();
          if (!profileResponse.ok) {
            throw new Error(profileData.error || `Failed to load profile for ${user.displayName}.`);
          }

          setUserProfiles((current) => ({
            ...current,
            [user.id]: profileData.profile,
          }));
        }),
      );
    } catch (error) {
      setStatus({
        type: "error",
        message: error.message || "Failed to load users.",
      });
    }
  }

  async function saveSelectedUserProfile() {
    if (!selectedUserId) {
      return;
    }

    setIsSavingProfile(true);
    try {
      const response = await fetch(`/users/${selectedUserId}/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(profileDraft),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to save user profile.");
      }

      setUserProfiles((current) => ({
        ...current,
        [selectedUserId]: data.profile,
      }));
      setStatus({ type: "success", message: "User policy profile saved." });
    } catch (error) {
      setStatus({ type: "error", message: error.message || "Failed to save user profile." });
    } finally {
      setIsSavingProfile(false);
    }
  }

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
          userId: selectedUserId,
          mode: selectedMode,
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
          { role: "assistant", content: data.reply, debug: data.debug || null },
        ],
      }));

      if (data.moodState || data.moodLabel) {
        setPersonalities((current) =>
          current.map((p) =>
            p.id === personalityId
              ? { ...p, moodState: data.moodState, moodLabel: data.moodLabel }
              : p
          )
        );
      }

      if (data.policy) {
        setChatPolicy(data.policy);
      }
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
                <div className="profile-row" style={{ marginTop: 16 }}>
                  <label className="profile-label" htmlFor="profile-select">Profile</label>
                  <select
                    id="profile-select"
                    className="profile-select"
                    value={selectedUserId || ""}
                    onChange={(event) => setSelectedUserId(Number(event.target.value))}
                  >
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.displayName} ({user.ageBand})
                      </option>
                    ))}
                  </select>
                  <label className="profile-label" htmlFor="mode-select">Mode</label>
                  <select
                    id="mode-select"
                    className="profile-select"
                    value={selectedMode}
                    onChange={(event) => setSelectedMode(event.target.value)}
                  >
                    {allowedModes.map((mode) => (
                      <option key={mode} value={mode}>
                        {mode}
                      </option>
                    ))}
                  </select>
                </div>
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
              <button
                type="button"
                className={`tab ${activeView === "journal" ? "active" : ""}`}
                onClick={() => setActiveView("journal")}
              >
                Memory Journal
              </button>
              <button
                type="button"
                className={`tab ${activeView === "eval" ? "active" : ""}`}
                onClick={() => setActiveView("eval")}
              >
                Adversarial Eval
              </button>
              <button
                type="button"
                className={`tab ${activeView === "settings" ? "active" : ""}`}
                onClick={() => setActiveView("settings")}
              >
                LLM Settings
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
              ) : activeView === "journal" ? (
                <MemoryJournal personality={selectedPersonality} />
              ) : activeView === "eval" ? (
                <>
                  <h2 className="section-heading">Pressure-test the active character</h2>
                  <p className="section-copy">
                    Run adversarial scenarios against the active personality and inspect transcript,
                    heuristic scoring, prompt-budget telemetry, and judge commentary without mutating chat history.
                  </p>
                  <HarnessReport personality={selectedPersonality} onStatus={setStatus} />
                </>
              ) : activeView === "settings" ? (
                <>
                  <h2 className="section-heading">Configure Runtime LLM</h2>
                  <p className="section-copy">
                    Select your provider first, add key and optional custom base URL,
                    then fetch and choose the active model for all chat, memory, and eval calls.
                  </p>
                  <div className="panel" style={{ padding: 16, marginBottom: 16 }}>
                    <h3 style={{ marginTop: 0 }}>User Policy Profile</h3>
                    <p className="section-copy" style={{ marginBottom: 12 }}>
                      Configure default mode and teen supervision controls for the selected profile.
                    </p>

                    <div className="meta-row" style={{ marginBottom: 12 }}>
                      <span className="meta-pill">User: {selectedUser?.displayName || "None"}</span>
                      <span className="meta-pill">Age: {selectedUser?.ageBand || "adult"}</span>
                    </div>

                    <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                      <label style={{ display: "grid", gap: 6 }}>
                        <span className="profile-label">Default Mode</span>
                        <select
                          className="profile-select"
                          value={profileDraft.defaultMode}
                          onChange={(event) =>
                            setProfileDraft((current) => ({
                              ...current,
                              defaultMode: event.target.value,
                            }))
                          }
                        >
                          <option value="kids">kids</option>
                          <option value="scientist">scientist</option>
                        </select>
                      </label>

                      <label style={{ display: "grid", gap: 6 }}>
                        <span className="profile-label">Safety Tier</span>
                        <select
                          className="profile-select"
                          value={profileDraft.safetyTier}
                          onChange={(event) =>
                            setProfileDraft((current) => ({
                              ...current,
                              safetyTier: event.target.value,
                            }))
                          }
                        >
                          <option value="child_strict">child_strict</option>
                          <option value="teen_guarded">teen_guarded</option>
                          <option value="standard">standard</option>
                        </select>
                      </label>
                    </div>

                    <label style={{ display: "inline-flex", gap: 8, marginTop: 12, color: "var(--muted)" }}>
                      <input
                        type="checkbox"
                        checked={profileDraft.supervisedAdvancedMode}
                        onChange={(event) =>
                          setProfileDraft((current) => ({
                            ...current,
                            supervisedAdvancedMode: event.target.checked,
                          }))
                        }
                        disabled={selectedUser?.ageBand !== "teen"}
                      />
                      Enable supervised advanced mode for teen profiles
                    </label>

                    <div style={{ marginTop: 12 }}>
                      <button
                        type="button"
                        className="tab active"
                        disabled={!selectedUserId || isSavingProfile}
                        onClick={() => void saveSelectedUserProfile()}
                      >
                        {isSavingProfile ? "Saving..." : "Save Profile Policy"}
                      </button>
                    </div>
                  </div>
                  <LlmSettingsPanel onStatus={setStatus} />
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
                      {selectedUser ? (
                        <span className="meta-pill">Age band: {selectedUser.ageBand}</span>
                      ) : null}
                      <span className="meta-pill">Mode: {selectedMode}</span>
                      {chatPolicy?.modeAccepted === false ? (
                        <span className="meta-pill">Policy fallback: {chatPolicy.activeMode}</span>
                      ) : null}
                      <span className="meta-pill">
                        Mood: {selectedPersonality.moodLabel || selectedPersonality.mood}
                      </span>
                      {selectedPersonality.creativeContext && selectedPersonality.creativeContext !== "default" && (
                        <span className="meta-pill">{selectedPersonality.creativeContext.replace(/_/g, " ")}</span>
                      )}
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
