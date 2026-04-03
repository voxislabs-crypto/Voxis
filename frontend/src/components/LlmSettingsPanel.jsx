import { useEffect, useMemo, useState } from "react";

const settingsStyles = `
  .llm-settings {
    border: 1px solid rgba(0, 180, 255, 0.12);
    border-radius: 22px;
    background: rgba(6, 14, 28, 0.72);
    padding: 20px;
    display: grid;
    gap: 16px;
  }

  .llm-settings h3 {
    margin: 0;
    font-size: 1.05rem;
    color: var(--text);
  }

  .llm-settings p {
    margin: 0;
    color: var(--muted);
    line-height: 1.6;
  }

  .llm-grid {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .llm-field {
    display: grid;
    gap: 6px;
  }

  .llm-field label {
    color: var(--muted);
    font-size: 0.86rem;
    font-weight: 700;
  }

  .llm-field input,
  .llm-field select {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid rgba(0, 180, 255, 0.16);
    border-radius: 12px;
    background: rgba(6, 14, 28, 0.9);
    color: var(--text);
  }

  .llm-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .llm-actions button {
    padding: 10px 16px;
    border: 0;
    border-radius: 999px;
    background: linear-gradient(135deg, var(--accent), var(--accent-deep));
    color: #fff;
    font-weight: 800;
  }

  .llm-actions button.secondary {
    background: rgba(0, 180, 255, 0.06);
    border: 1px solid rgba(0, 180, 255, 0.2);
    color: var(--accent);
  }

  .llm-actions button:disabled {
    opacity: 0.6;
    cursor: wait;
  }

  .llm-connected {
    padding: 12px;
    border-radius: 12px;
    border: 1px solid rgba(0, 200, 120, 0.18);
    background: rgba(0, 200, 120, 0.07);
    color: #7fe7b1;
    line-height: 1.6;
    font-size: 0.9rem;
  }

  @media (max-width: 900px) {
    .llm-grid {
      grid-template-columns: 1fr;
    }
  }
`;

function fallbackProviders() {
  return [
    { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1" },
    { id: "groq", name: "Groq", baseUrl: "https://api.groq.com/openai/v1" },
    { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
    { id: "together", name: "Together", baseUrl: "https://api.together.xyz/v1" },
    { id: "mistral", name: "Mistral", baseUrl: "https://api.mistral.ai/v1" },
    { id: "anthropic", name: "Anthropic", baseUrl: "https://api.anthropic.com/v1" },
    { id: "custom", name: "Custom OpenAI-Compatible", baseUrl: "" },
  ];
}

export default function LlmSettingsPanel({ onStatus }) {
  const [providers, setProviders] = useState([]);
  const [provider, setProvider] = useState("openai");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [availableModels, setAvailableModels] = useState([]);
  const [model, setModel] = useState("");
  const [connected, setConnected] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const selectedProvider = useMemo(
    () => providers.find((candidate) => candidate.id === provider) || null,
    [providers, provider],
  );

  useEffect(() => {
    void initialize();
  }, []);

  useEffect(() => {
    if (provider !== "custom") {
      setBaseUrl(selectedProvider?.baseUrl || "");
    }
  }, [provider, selectedProvider?.baseUrl]);

  async function initialize() {
    setIsLoading(true);

    try {
      const [providersResponse, settingsResponse] = await Promise.all([
        fetch("/settings/llm/providers"),
        fetch("/settings/llm"),
      ]);

      const providersData = await providersResponse.json();
      const settingsData = await settingsResponse.json();

      if (!providersResponse.ok) {
        throw new Error(providersData.error || "Failed to load providers.");
      }
      if (!settingsResponse.ok) {
        throw new Error(settingsData.error || "Failed to load current settings.");
      }

      const providerList = Array.isArray(providersData.providers) && providersData.providers.length
        ? providersData.providers
        : fallbackProviders();

      setProviders(providerList);

      if (settingsData.connected) {
        setConnected(settingsData);
        setProvider(settingsData.provider || providerList[0]?.id || "openai");
        setBaseUrl(settingsData.baseUrl || "");
        setAvailableModels(settingsData.models || []);
        setModel(settingsData.model || "");
      } else {
        setConnected(null);
        setProvider(providerList[0]?.id || "openai");
        setAvailableModels([]);
        setModel("");
      }
    } catch (error) {
      onStatus?.({ type: "error", message: error.message || "Failed to load LLM settings." });
      setProviders(fallbackProviders());
    } finally {
      setIsLoading(false);
    }
  }

  async function detectProvider() {
    if (!apiKey.trim()) {
      onStatus?.({ type: "error", message: "Enter an API key before auto-detect." });
      return;
    }

    setIsDetecting(true);

    try {
      const response = await fetch("/settings/llm/detect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Auto-detect failed.");
      }

      setProvider(data.provider || provider);
      setBaseUrl(data.baseUrl || "");
      setAvailableModels(data.models || []);
      setModel(data.model || "");
      onStatus?.({ type: "success", message: `Detected ${data.providerName || data.provider}.` });
    } catch (error) {
      onStatus?.({ type: "error", message: error.message || "Auto-detect failed." });
    } finally {
      setIsDetecting(false);
    }
  }

  async function connectProvider() {
    if (!provider.trim()) {
      onStatus?.({ type: "error", message: "Choose a provider first." });
      return;
    }

    if (!apiKey.trim()) {
      onStatus?.({ type: "error", message: "API key is required." });
      return;
    }

    if (provider === "custom" && !baseUrl.trim()) {
      onStatus?.({ type: "error", message: "Base URL is required for custom provider." });
      return;
    }

    setIsConnecting(true);

    try {
      const response = await fetch("/settings/llm/connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider,
          apiKey: apiKey.trim(),
          baseUrl: provider === "custom" ? baseUrl.trim() : undefined,
          model: model || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to connect provider.");
      }

      setConnected(data);
      setAvailableModels(data.models || []);
      setModel(data.model || "");
      onStatus?.({
        type: "success",
        message: `Connected ${data.providerName || data.provider} with ${data.model || "no model selected"}.`,
      });
    } catch (error) {
      onStatus?.({ type: "error", message: error.message || "Failed to connect provider." });
    } finally {
      setIsConnecting(false);
    }
  }

  async function applyModel(nextModel) {
    if (!nextModel) {
      return;
    }

    setModel(nextModel);

    try {
      const response = await fetch("/settings/llm/model", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: nextModel }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to apply model.");
      }

      setConnected(data);
      onStatus?.({ type: "success", message: `Active model switched to ${nextModel}.` });
    } catch (error) {
      onStatus?.({ type: "error", message: error.message || "Failed to apply model." });
    }
  }

  async function disconnectProvider() {
    setIsDisconnecting(true);

    try {
      const response = await fetch("/settings/llm", {
        method: "DELETE",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to disconnect provider.");
      }

      setConnected(null);
      setAvailableModels([]);
      setModel("");
      setApiKey("");
      onStatus?.({ type: "success", message: "Disconnected runtime LLM provider." });
    } catch (error) {
      onStatus?.({ type: "error", message: error.message || "Failed to disconnect provider." });
    } finally {
      setIsDisconnecting(false);
    }
  }

  return (
    <div className="llm-settings">
      <style>{settingsStyles}</style>
      <h3>Runtime LLM Settings</h3>
      <p>
        Choose a provider first, add credentials, then connect and select a model.
        Auto-detect is optional and only helps prefill provider/model.
      </p>

      <div className="llm-grid">
        <div className="llm-field">
          <label htmlFor="llm-provider">Provider</label>
          <select
            id="llm-provider"
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
            disabled={isLoading || isConnecting || isDetecting}
          >
            {(providers.length ? providers : fallbackProviders()).map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
        </div>

        <div className="llm-field">
          <label htmlFor="llm-api-key">API Key</label>
          <input
            id="llm-api-key"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="Paste provider key"
            disabled={isLoading || isConnecting}
          />
        </div>

        <div className="llm-field">
          <label htmlFor="llm-base-url">Base URL</label>
          <input
            id="llm-base-url"
            type="text"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder={provider === "custom" ? "https://example.com/v1" : "Provider default base URL"}
            disabled={provider !== "custom" || isLoading || isConnecting}
          />
        </div>

        <div className="llm-field">
          <label htmlFor="llm-model">Model</label>
          <select
            id="llm-model"
            value={model}
            onChange={(event) => void applyModel(event.target.value)}
            disabled={!availableModels.length || isConnecting || isLoading}
          >
            <option value="">Choose model</option>
            {availableModels.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name || candidate.id}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="llm-actions">
        <button type="button" className="secondary" onClick={() => void detectProvider()} disabled={isDetecting || isLoading || isConnecting}>
          {isDetecting ? "Detecting..." : "Auto-detect (optional)"}
        </button>
        <button type="button" onClick={() => void connectProvider()} disabled={isConnecting || isLoading}>
          {isConnecting ? "Connecting..." : "Connect Provider"}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => void disconnectProvider()}
          disabled={!connected?.connected || isDisconnecting || isLoading}
        >
          {isDisconnecting ? "Disconnecting..." : "Disconnect"}
        </button>
      </div>

      {connected?.connected ? (
        <div className="llm-connected">
          Connected provider: {connected.provider} | Active model: {connected.model || "not selected"} | Key hint: {connected.keyHint}
        </div>
      ) : null}
    </div>
  );
}
