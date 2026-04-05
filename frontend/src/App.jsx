import { useEffect, useMemo, useState } from "react";
import { useAuth, UserButton, SignIn, SignUp } from "@clerk/react";

import { useAuthFetch } from "./hooks/useAuthFetch.js";
import PersonalityForm from "./components/PersonalityForm.jsx";
import PersonalityList from "./components/PersonalityList.jsx";
import ChatWindow from "./components/ChatWindow.jsx";
import VoiceLab from "./components/VoiceLab.jsx";
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
    flex-wrap: wrap;
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

  @keyframes softPulse {
    0% { box-shadow: 0 0 0 rgba(0, 200, 255, 0.0); }
    50% { box-shadow: 0 0 24px rgba(0, 200, 255, 0.18); }
    100% { box-shadow: 0 0 0 rgba(0, 200, 255, 0.0); }
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

  .global-toast-stack {
    position: fixed;
    right: 16px;
    bottom: 18px;
    z-index: 1400;
    pointer-events: none;
  }

  .global-toast {
    min-width: min(420px, calc(100vw - 28px));
    max-width: min(520px, calc(100vw - 28px));
    padding: 12px 14px;
    border-radius: 14px;
    border: 1px solid rgba(0, 180, 255, 0.24);
    background: rgba(6, 16, 30, 0.92);
    color: var(--text);
    box-shadow: 0 18px 34px rgba(0, 18, 42, 0.44);
    backdrop-filter: blur(10px);
    animation: toastSlideIn 200ms ease;
  }

  .global-toast.added {
    border-color: rgba(66, 210, 144, 0.34);
  }

  .global-toast.updated {
    border-color: rgba(255, 184, 72, 0.34);
  }

  .global-toast.info {
    border-color: rgba(0, 180, 255, 0.34);
  }

  .global-toast.warn {
    border-color: rgba(255, 184, 72, 0.34);
  }

  .global-toast.error {
    border-color: rgba(255, 98, 98, 0.40);
  }

  .global-toast-title {
    font-size: 0.82rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #9fe7ff;
  }

  .global-toast-location {
    margin-top: 4px;
    color: var(--muted);
    font-size: 0.78rem;
  }

  .global-toast-body {
    margin-top: 6px;
    font-size: 0.9rem;
    line-height: 1.45;
    color: #dbe6f6;
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

    .global-toast-stack {
      right: 10px;
      bottom: 12px;
    }

    .global-toast {
      min-width: min(94vw, 520px);
    }
  }

  @keyframes toastSlideIn {
    0% { transform: translateY(8px); opacity: 0; }
    100% { transform: translateY(0); opacity: 1; }
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
    performanceTier: "balanced",
    voiceNarrationEnabled: false,
    supervisedAdvancedMode: false,
  });
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [activeView, setActiveView] = useState("builder");
  const [builderMode, setBuilderMode] = useState("create");
  const [chatLogs, setChatLogs] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [liveChatState, setLiveChatState] = useState({});
  const [status, setStatus] = useState({ type: "", message: "" });
  const [neuralToast, setNeuralToast] = useState(null);

  function parseSseEvent(chunk) {
    const lines = String(chunk || "").split("\n");
    let eventName = "message";
    const dataLines = [];

    for (const line of lines) {
      if (!line || line.startsWith(":")) {
        continue;
      }

      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim() || "message";
        continue;
      }

      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      }
    }

    if (!dataLines.length) {
      return null;
    }

    return {
      type: eventName,
      payload: JSON.parse(dataLines.join("\n")),
    };
  }

  function clipText(text, max = 72) {
    const normalized = String(text || "").replace(/\s+/g, " ").trim();
    if (!normalized) {
      return "";
    }
    if (normalized.length <= max) {
      return normalized;
    }
    return `${normalized.slice(0, max - 1)}…`;
  }

  function buildNeuralMemoryToast({ phase, debug, personalityName }) {
    const personalityLabel = personalityName ? ` · ${personalityName}` : "";

    if (phase === "memory-write") {
      const extracted = Array.isArray(debug?.memoryExtracted) ? debug.memoryExtracted : [];
      if (!extracted.length) {
        return null;
      }
      const first = extracted[0];
      const more = extracted.length > 1 ? ` +${extracted.length - 1} more` : "";
      return {
        id: Date.now() + Math.random(),
        kind: "added",
        title: `Added: New Memory${personalityLabel}`,
        location: "Neural Core > Personality Memory",
        body: `"${clipText(first?.content || "Memory captured")}"${more}`,
      };
    }

    if (phase === "user-memory-write") {
      const extracted = Array.isArray(debug?.userMemoryExtracted) ? debug.userMemoryExtracted : [];
      if (!extracted.length) {
        return null;
      }
      const first = extracted[0];
      const more = extracted.length > 1 ? ` +${extracted.length - 1} more` : "";
      return {
        id: Date.now() + Math.random(),
        kind: "updated",
        title: `Updated: Memory${personalityLabel}`,
        location: "Neural Core > User Memory",
        body: `"${clipText(first?.content || "User memory updated")}"${more}`,
      };
    }

    if (phase === "mood") {
      const label = String(debug?.mood?.label || "").trim();
      const before = debug?.mood?.before;
      const after = debug?.mood?.after;
      if (!label && !after) {
        return null;
      }

      const beforeSummary = before
        ? `V:${Number(before.valence || 0).toFixed(2)} A:${Number(before.arousal || 0).toFixed(2)} D:${Number(before.dominance || 0).toFixed(2)}`
        : "-";
      const afterSummary = after
        ? `V:${Number(after.valence || 0).toFixed(2)} A:${Number(after.arousal || 0).toFixed(2)} D:${Number(after.dominance || 0).toFixed(2)}`
        : "-";

      return {
        id: Date.now() + Math.random(),
        kind: "info",
        title: `Mood Shift${personalityLabel}${label ? ` · ${label}` : ""}`,
        location: "Neural Core > Mood Engine",
        body: `${beforeSummary} → ${afterSummary}`,
      };
    }

    if (phase === "intent") {
      const goal = String(debug?.goal?.goal || "").trim();
      if (!goal) {
        return null;
      }

      return {
        id: Date.now() + Math.random(),
        kind: "info",
        title: `Intent Selected${personalityLabel}`,
        location: "Neural Core > Intent Engine",
        body: `"${clipText(goal)}"`,
      };
    }

    if ((phase === "prompt" || phase === "intent") && debug?.flags?.reconditioned) {
      return {
        id: Date.now() + Math.random(),
        kind: "warn",
        title: `Reconditioning Triggered${personalityLabel}`,
        location: "Neural Core > Identity Anchor",
        body: "Persona anchor injected to reduce drift.",
      };
    }

    if (phase === "reply" && debug?.scientist) {
      const validation = debug.scientist.validation;
      const repairAttempted = Boolean(debug.scientist.repairAttempted);
      const violations = Array.isArray(validation?.violations) ? validation.violations : [];

      if (repairAttempted || violations.length > 0) {
        return {
          id: Date.now() + Math.random(),
          kind: violations.length > 0 ? "warn" : "info",
          title: `Scientist Validation${personalityLabel}`,
          location: "Neural Core > Evidence Layer",
          body: violations.length > 0
            ? `Repair attempted. Issues: ${clipText(violations.join(", "), 92)}`
            : "Repair pass applied successfully.",
        };
      }
    }

    if (phase === "rate-limit") {
      return {
        id: Date.now() + Math.random(),
        kind: "warn",
        title: `Rate Limit Hit${personalityLabel}`,
        location: "Neural Core > Recovery",
        body: "Primary generation throttled. Retrying with compact prompt.",
      };
    }

    if (phase === "rate-limit-retry") {
      return {
        id: Date.now() + Math.random(),
        kind: "info",
        title: `Rate Limit Recovered${personalityLabel}`,
        location: "Neural Core > Recovery",
        body: "Retry succeeded using reduced context.",
      };
    }

    if (phase === "rate-limit-fallback") {
      return {
        id: Date.now() + Math.random(),
        kind: "error",
        title: `Rate Limit Fallback${personalityLabel}`,
        location: "Neural Core > Recovery",
        body: "Fallback response delivered after retry exhaustion.",
      };
    }

    return null;
  }

  useEffect(() => {
    if (!neuralToast) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setNeuralToast(null);
    }, 4200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [neuralToast]);

  const { isSignedIn, isLoaded } = useAuth();
  const authFetch = useAuthFetch();

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

  const authPath = useMemo(() => {
    if (typeof window === "undefined") {
      return "/";
    }

    return window.location.pathname || "/";
  }, []);

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
    if (!isSignedIn) return;
    void loadCurrentUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);

  useEffect(() => {
    if (!isSignedIn) return;
    void loadPersonalities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);

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
      performanceTier: selectedUserProfile.performanceTier || "balanced",
      voiceNarrationEnabled: Boolean(selectedUserProfile.voiceNarrationEnabled),
      supervisedAdvancedMode: Boolean(selectedUserProfile.supervisedAdvancedMode),
    });
  }, [selectedUserProfile]);

  async function loadCurrentUser() {
    try {
      const response = await authFetch("/me");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load current user.");
      }

      const me = data?.user || data;
      if (!me || !Number.isInteger(Number(me.id))) {
        throw new Error("Failed to resolve current user id.");
      }

      setUsers([me]);
      setSelectedUserId(Number(me.id));

      const profileResponse = await authFetch(`/users/${Number(me.id)}/profile`);
      const profileData = await profileResponse.json();
      if (!profileResponse.ok) {
        throw new Error(profileData.error || "Failed to load user profile.");
      }

      setUserProfiles({ [Number(me.id)]: profileData.profile });
    } catch (error) {
      setStatus({
        type: "error",
        message: error.message || "Failed to load user.",
      });
    }
  }

  async function saveSelectedUserProfile() {
    if (!selectedUserId) {
      return;
    }

    setIsSavingProfile(true);
    try {
      const response = await authFetch(`/users/${selectedUserId}/profile`, {
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
      const response = await authFetch("/personalities");
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
      const response = await authFetch(`/personality/${personalityId}/messages`);
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

  function handlePersonalityUpdated(personality) {
    setPersonalities((current) =>
      current.map((item) => (item.id === personality.id ? personality : item)),
    );
    setSelectedId(personality.id);
    setStatus({
      type: "success",
      message: `${personality.name} was updated.`,
    });
  }

  async function handleVoiceProfileChange(nextVoiceProfile) {
    if (!selectedPersonality) {
      return;
    }

    try {
      const response = await authFetch(`/personality/${selectedPersonality.id}/voice`, {
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
    setLiveChatState((current) => ({
      ...current,
      [personalityId]: {
        phase: "queued",
        debug: null,
        reply: "",
        finalReceived: false,
        seq: (current[personalityId]?.seq || 0) + 1,
      },
    }));
    setChatLogs((current) => ({
      ...current,
      [personalityId]: [
        ...(current[personalityId] || []),
        { role: "user", content: message },
      ],
    }));

    try {
      const response = await authFetch("/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalityId,
          userId: selectedUserId,
          mode: selectedMode,
          message,
          streamDebug: true,
        }),
      });

      const contentType = response.headers.get("content-type") || "";
      let data = null;

      if (contentType.includes("text/event-stream") && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finalCommitted = false;

        while (true) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

          const events = buffer.split("\n\n");
          buffer = events.pop() || "";

          for (const rawEvent of events) {
            const parsed = parseSseEvent(rawEvent);
            if (!parsed) {
              continue;
            }

            const { type, payload } = parsed;

            if (type === "debug") {
              const toast = buildNeuralMemoryToast({
                phase: payload.phase,
                debug: payload.debug,
                personalityName: selectedPersonality?.name || "",
              });
              if (toast) {
                setNeuralToast(toast);
              }

              setLiveChatState((current) => ({
                ...current,
                [personalityId]: {
                  ...(current[personalityId] || {}),
                  phase: payload.phase,
                  debug: payload.debug,
                  seq: (current[personalityId]?.seq || 0) + 1,
                },
              }));
            } else if (type === "token") {
              setLiveChatState((current) => ({
                ...current,
                [personalityId]: {
                  ...(current[personalityId] || {}),
                  phase: payload.phase || "generation",
                  debug: payload.debug || current[personalityId]?.debug || null,
                  reply: payload.reply || "",
                  seq: (current[personalityId]?.seq || 0) + 1,
                },
              }));
            } else if (type === "error") {
              throw new Error(payload.error || "Failed to send chat message.");
            } else if (type === "final") {
              data = payload;
              if (!finalCommitted) {
                setChatLogs((current) => ({
                  ...current,
                  [personalityId]: [
                    ...(current[personalityId] || []),
                    { role: "assistant", content: payload.reply, debug: payload.debug || null },
                  ],
                }));

                if (payload.moodState || payload.moodLabel) {
                  setPersonalities((current) =>
                    current.map((p) =>
                      p.id === personalityId
                        ? { ...p, moodState: payload.moodState, moodLabel: payload.moodLabel }
                        : p
                    )
                  );
                }

                if (payload.policy) {
                  setChatPolicy(payload.policy);
                }

                setLiveChatState((current) => ({
                  ...current,
                  [personalityId]: {
                    ...(current[personalityId] || {}),
                    phase: "reply-complete",
                    debug: payload.debug || current[personalityId]?.debug || null,
                    reply: "",
                    finalReceived: true,
                    seq: (current[personalityId]?.seq || 0) + 1,
                  },
                }));
                setIsSending(false);
                finalCommitted = true;
              }
            } else if (type === "done") {
              setLiveChatState((current) => ({
                ...current,
                [personalityId]: null,
              }));
            }
          }

          if (done) {
            break;
          }
        }
      } else {
        data = await response.json();
      }

      if (!response.ok) {
        throw new Error(data?.error || "Failed to send chat message.");
      }

      if (!data) {
        throw new Error("Chat stream ended before a final payload was received.");
      }

      if (!contentType.includes("text/event-stream")) {
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

        setLiveChatState((current) => ({
          ...current,
          [personalityId]: null,
        }));
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
      setLiveChatState((current) => ({
        ...current,
        [personalityId]: null,
      }));
    } finally {
      setIsSending(false);
    }
  }

  if (!isLoaded) return null;

  if (!isSignedIn) {
    const showSignUp = authPath === "/sign-up";

    return (
      <>
        <style>{appStyles}</style>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
          {showSignUp ? (
            <SignUp
              routing="virtual"
              signInUrl="/sign-in"
              forceRedirectUrl="/"
            />
          ) : (
            <SignIn
              routing="virtual"
              signUpUrl="/sign-up"
              forceRedirectUrl="/"
            />
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <style>{appStyles}</style>
      {neuralToast ? (
        <div className="global-toast-stack" aria-live="polite" aria-atomic="true">
          <div className={`global-toast ${neuralToast.kind}`}>
            <div className="global-toast-title">{neuralToast.title}</div>
            <div className="global-toast-location">{neuralToast.location}</div>
            <div className="global-toast-body">{neuralToast.body}</div>
          </div>
        </div>
      ) : null}
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
                  <UserButton afterSignOutUrl="/" />
                  {selectedUser && (
                    <span className="profile-label">{selectedUser.displayName}</span>
                  )}
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
                className={`tab ${activeView === "voice" ? "active" : ""}`}
                onClick={() => setActiveView("voice")}
              >
                Voice Lab
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
                  <h2 className="section-heading">
                    {builderMode === "edit" ? "Refine an existing personality" : "Shape a new personality"}
                  </h2>
                  <p className="section-copy">
                    {builderMode === "edit"
                      ? "Load the selected character into the form, tune behavior and voice, then save updates in place."
                      : "Start with a character name and optional source URLs, pull research into the form, then save a profile with voice settings and a stronger system prompt."}
                  </p>
                  <div className="meta-row" style={{ marginBottom: 12 }}>
                    <button
                      type="button"
                      className={`tab ${builderMode === "create" ? "active" : ""}`}
                      onClick={() => setBuilderMode("create")}
                    >
                      Create New
                    </button>
                    <button
                      type="button"
                      className={`tab ${builderMode === "edit" ? "active" : ""}`}
                      onClick={() => setBuilderMode("edit")}
                      disabled={!selectedPersonality}
                    >
                      Edit Selected
                    </button>
                  </div>
                  <PersonalityForm
                    onCreated={handlePersonalityCreated}
                    onUpdated={handlePersonalityUpdated}
                    onError={setStatus}
                    personalities={personalities}
                    editingPersonality={builderMode === "edit" ? selectedPersonality : null}
                  />
                </>
              ) : activeView === "journal" ? (
                <MemoryJournal personality={selectedPersonality} />
              ) : activeView === "voice" ? (
                <>
                  <h2 className="section-heading">Tune voice in Voice Lab</h2>
                  <p className="section-copy">
                    Keep quick playback controls in chat while using this tab for full TTS profile tuning,
                    sample generation, and voice profile saves.
                  </p>
                  <VoiceLab
                    personality={selectedPersonality}
                    messages={chatLogs[selectedId] || []}
                    onSaveVoiceProfile={handleVoiceProfileChange}
                    onStatus={setStatus}
                    onJumpToBuilder={() => setActiveView("builder")}
                  />
                </>
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
                      Configure default mode, Neural Core intensity, and teen supervision controls for the selected profile.
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

                    <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
                      <label style={{ display: "grid", gap: 6 }}>
                        <span className="profile-label">Neural Core Performance Tier</span>
                        <input
                          type="range"
                          min="0"
                          max="2"
                          step="1"
                          value={
                            profileDraft.performanceTier === "light"
                              ? 0
                              : profileDraft.performanceTier === "full"
                              ? 2
                              : 1
                          }
                          onChange={(event) => {
                            const nextValue = Number(event.target.value);
                            setProfileDraft((current) => ({
                              ...current,
                              performanceTier: nextValue === 0 ? "light" : nextValue === 2 ? "full" : "balanced",
                            }));
                          }}
                        />
                      </label>
                      <div className="meta-row" style={{ marginTop: -2 }}>
                        <span className="meta-pill">Light: CSS-only pulse</span>
                        <span className="meta-pill">Balanced: orbit + ambience</span>
                        <span className="meta-pill">Full: prep for richer Scientist motion</span>
                      </div>
                    </div>

                    <label style={{ display: "inline-flex", gap: 8, marginTop: 12, color: "var(--muted)" }}>
                      <input
                        type="checkbox"
                        checked={profileDraft.voiceNarrationEnabled}
                        onChange={(event) =>
                          setProfileDraft((current) => ({
                            ...current,
                            voiceNarrationEnabled: event.target.checked,
                          }))
                        }
                      />
                      Enable Kids Mode mood narration when the orb brightens positively
                    </label>

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
                    liveDebug={liveChatState[selectedId]?.debug || null}
                    livePhase={liveChatState[selectedId]?.phase || ""}
                    liveSeq={liveChatState[selectedId]?.seq || 0}
                    liveReply={liveChatState[selectedId]?.reply || ""}
                    activeMode={chatPolicy?.activeMode || selectedMode}
                    neuralProfile={selectedUserProfile || chatPolicy}
                    isLoadingMessages={isLoadingMessages}
                    isSending={isSending}
                    onSend={handleSendMessage}
                    onSaveVoiceProfile={handleVoiceProfileChange}
                    onJumpToBuilder={() => setActiveView("builder")}
                    onOpenVoiceLab={() => setActiveView("voice")}
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
