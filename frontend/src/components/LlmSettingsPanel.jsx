import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import { useAuthFetch } from "../hooks/useAuthFetch.js";

const CUSTOM_OPTION = "__custom__";
const LLM_MODEL_FAVORITES_STORAGE_KEY = "voxis.llmModelFavorites.v1";

const ELEVENLABS_VOICE_PRESETS = [
  { id: "21m00Tcm4TlvDq8ikWAM", label: "Rachel (default)" },
  { id: "EXAVITQu4vr4xnSDxMaL", label: "Bella" },
  { id: "TxGEqnHWrfWFTfGW9XjX", label: "Josh" },
  { id: "VR6AewLTigWG4xSOukaG", label: "Arnold" },
  { id: "ErXwobaYiN019PkySvjV", label: "Antoni" },
];

const CARTESIA_VOICE_PRESETS = [
  { id: "a0e99841-438c-4a64-b679-ae501e7d6091", label: "Sonic default" },
  { id: "694f9389-aac1-45b6-b726-9d9369183238", label: "Warm Narrator" },
  { id: "2ee87190-8f84-4925-97da-e52547f9462c", label: "Balanced Voice" },
];

const ELEVENLABS_MODEL_PRESETS = [
  { id: "eleven_multilingual_v2", label: "eleven_multilingual_v2" },
  { id: "eleven_turbo_v2_5", label: "eleven_turbo_v2_5" },
  { id: "eleven_flash_v2_5", label: "eleven_flash_v2_5" },
];

const CARTESIA_MODEL_PRESETS = [
  { id: "sonic-3", label: "sonic-3" },
  { id: "sonic-3-latest", label: "sonic-3-latest" },
  { id: "sonic-2", label: "sonic-2" },
  { id: "sonic-turbo", label: "sonic-turbo" },
];

const CARTESIA_MODEL_QUICK_PICKS = ["sonic-3", "sonic-3-latest", "sonic-turbo"];

const settingsStyles = `
  .llm-settings {
    display: grid;
    gap: 18px;
  }

  .settings-nav {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    padding: 4px;
    border: 1px solid rgba(0, 180, 255, 0.12);
    border-radius: 16px;
    background: rgba(6, 14, 28, 0.66);
  }

  .settings-nav button {
    border: 1px solid rgba(0, 180, 255, 0.2);
    border-radius: 999px;
    padding: 8px 14px;
    background: rgba(0, 180, 255, 0.06);
    color: var(--accent);
    font-weight: 700;
    font-size: 0.82rem;
  }

  .settings-nav button.active {
    background: linear-gradient(135deg, var(--accent), var(--accent-deep));
    color: #ffffff;
    border-color: transparent;
  }

  .settings-section {
    border: 1px solid rgba(0, 180, 255, 0.12);
    border-radius: 22px;
    background: rgba(6, 14, 28, 0.72);
    padding: 20px;
    display: grid;
    gap: 14px;
  }

  .settings-section-header {
    display: grid;
    gap: 6px;
  }

  .settings-section-tag {
    display: inline-flex;
    align-items: center;
    width: fit-content;
    padding: 4px 9px;
    border-radius: 999px;
    border: 1px solid rgba(0, 180, 255, 0.18);
    background: rgba(0, 180, 255, 0.06);
    color: #8fdfff;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .settings-section h3 {
    margin: 0;
    font-size: 1.05rem;
    color: var(--text);
  }

  .settings-section p,
  .llm-field p {
    margin: 0;
    color: var(--muted);
    line-height: 1.6;
  }

  .settings-section-copy {
    max-width: 72ch;
    font-size: 0.92rem;
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

  .llm-field-helper {
    font-size: 0.82rem;
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

  .llm-actions.compact {
    align-items: flex-start;
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

  .llm-toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    border: 1px solid rgba(0, 180, 255, 0.14);
    border-radius: 14px;
    background: rgba(0, 180, 255, 0.05);
  }

  .llm-toggle-copy {
    display: grid;
    gap: 4px;
  }

  .llm-toggle-copy strong {
    color: var(--text);
    font-size: 0.92rem;
  }

  .llm-toggle-copy span {
    color: var(--muted);
    font-size: 0.82rem;
    line-height: 1.5;
  }

  .llm-toggle {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    color: var(--text);
    font-weight: 700;
  }

  .llm-toggle input[type="checkbox"] {
    width: 18px;
    height: 18px;
    accent-color: #00bfff;
    cursor: pointer;
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

  .llm-connected.info {
    border-color: rgba(0, 180, 255, 0.18);
    background: rgba(0, 180, 255, 0.07);
    color: #8fdfff;
  }

  .llm-connected.warn {
    border-color: rgba(255, 191, 64, 0.26);
    background: rgba(255, 191, 64, 0.08);
    color: #ffd58a;
  }

  .llm-quick-picks {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .llm-quick-picks button {
    padding: 8px 12px;
    border-radius: 999px;
    border: 1px solid rgba(0, 180, 255, 0.2);
    background: rgba(0, 180, 255, 0.06);
    color: var(--accent);
    font-size: 0.8rem;
    font-weight: 700;
  }

  @media (max-width: 900px) {
    .llm-grid {
      grid-template-columns: 1fr;
    }
  }
`;

function fallbackProviders() {
  return [
    { id: "ollama", name: "Ollama (Offline)", baseUrl: "http://127.0.0.1:11434/v1" },
    { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1" },
    { id: "grok", name: "Grok (xAI)", baseUrl: "https://api.x.ai/v1" },
    { id: "groq", name: "Groq", baseUrl: "https://api.groq.com/openai/v1" },
    { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
    { id: "together", name: "Together", baseUrl: "https://api.together.xyz/v1" },
    { id: "mistral", name: "Mistral", baseUrl: "https://api.mistral.ai/v1" },
    { id: "anthropic", name: "Anthropic", baseUrl: "https://api.anthropic.com/v1" },
    { id: "custom", name: "Custom OpenAI-Compatible", baseUrl: "" },
  ];
}

function getCatalogMeta(options) {
  return options?.catalog && typeof options.catalog === "object"
    ? options.catalog
    : { voices: { source: "unavailable", count: 0 }, models: { source: "unavailable", count: 0 } };
}

function getTtsVoiceHelpText(providerId, options, providerName) {
  if (providerId === "cartesia") {
    const catalog = getCatalogMeta(options);
    if (options?.error) {
      return options.error;
    }
    if (catalog.voices?.source === "api") {
      return `Loaded ${catalog.voices.count || 0} Cartesia voices from your API key.`;
    }
    return "Cartesia voice discovery is unavailable right now. Use a saved voice or enter a Custom voice id.";
  }

  return options?.error || `Auto-loaded from your ${providerName || "provider"} key when available.`;
}

function getTtsModelHelpText(providerId, options, providerName) {
  if (providerId === "cartesia") {
    const catalog = getCatalogMeta(options);
    if (options?.error) {
      return options.error;
    }
    if (catalog.models?.source === "api") {
      return `Loaded ${catalog.models.count || 0} Cartesia models from live discovery.`;
    }
    return "Showing fallback Cartesia models because live discovery returned no model catalog. Use Custom model id for snapshots or newly released IDs.";
  }

  return options?.error || `Auto-loaded from your ${providerName || "provider"} key when available.`;
}

function loadModelFavorites() {
  try {
    const raw = window.localStorage.getItem(LLM_MODEL_FAVORITES_STORAGE_KEY);
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveModelFavorites(nextValue) {
  try {
    window.localStorage.setItem(LLM_MODEL_FAVORITES_STORAGE_KEY, JSON.stringify(nextValue || {}));
  } catch {
    // Ignore localStorage write failures.
  }
}

export default function LlmSettingsPanel({ onStatus }) {
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const authFetch = useAuthFetch();
  const [providers, setProviders] = useState([]);
  const [savedProviders, setSavedProviders] = useState([]);
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
  const [isCheckingOllama, setIsCheckingOllama] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState(null);
  const ollamaCheckInFlightRef = useRef(false);
  const modelFavoritesImportRef = useRef(null);
  const [modelFavoritesByProvider, setModelFavoritesByProvider] = useState(() => loadModelFavorites());
  const [ttsProviders, setTtsProviders] = useState([]);
  const [ttsProvider, setTtsProvider] = useState("elevenlabs");
  const [ttsDebugLockEnabled, setTtsDebugLockEnabled] = useState(false);
  const [ttsApiKey, setTtsApiKey] = useState("");
  const [ttsVoiceId, setTtsVoiceId] = useState("");
  const [ttsModel, setTtsModel] = useState("");
  const [ttsProviderOptions, setTtsProviderOptions] = useState({
    elevenlabs: {
      voices: ELEVENLABS_VOICE_PRESETS,
      builtinVoices: ELEVENLABS_VOICE_PRESETS,
      customVoices: [],
      models: ELEVENLABS_MODEL_PRESETS,
      error: "",
    },
    cartesia: {
      voices: CARTESIA_VOICE_PRESETS,
      builtinVoices: CARTESIA_VOICE_PRESETS,
      customVoices: [],
      models: CARTESIA_MODEL_PRESETS,
      catalog: {
        voices: { source: "fallback", count: CARTESIA_VOICE_PRESETS.length },
        models: { source: "fallback", count: CARTESIA_MODEL_PRESETS.length },
      },
      error: "",
    },
  });
  const [isLoadingTtsProviderOptions, setIsLoadingTtsProviderOptions] = useState(false);
  const [isSavingTts, setIsSavingTts] = useState(false);
  const [isDisconnectingTts, setIsDisconnectingTts] = useState(false);
  const [defaultVoiceSource, setDefaultVoiceSource] = useState("tts");
  const [isSavingDefaultVoiceSource, setIsSavingDefaultVoiceSource] = useState(false);
  const [kokoroSettings, setKokoroSettings] = useState({ connected: false, keyHint: "", updatedAt: "", localPath: "" });
  const [kokoroHfToken, setKokoroHfToken] = useState("");
  const [kokoroLocalPath, setKokoroLocalPath] = useState("");
  const [isSavingKokoroToken, setIsSavingKokoroToken] = useState(false);
  const [isClearingKokoroToken, setIsClearingKokoroToken] = useState(false);
  const [isSavingKokoroPath, setIsSavingKokoroPath] = useState(false);
  const [isClearingKokoroPath, setIsClearingKokoroPath] = useState(false);
  const [llmEnvInfo, setLlmEnvInfo] = useState({
    envConfigured: false,
    envBaseUrl: "",
    envModel: "",
    envLocked: false,
  });
  const [sttConfig, setSttConfig] = useState({
    enabled: true,
    provider: "openai-compatible",
    baseUrl: "http://127.0.0.1:8000/v1",
    model: "whisper-1",
    language: "auto",
    apiKey: "",
    maxAudioBytes: 10485760,
  });
  const [searchConfig, setSearchConfig] = useState({
    enabled: true,
    provider: "duckduckgo",
    autoForQueries: true,
    maxResults: 4,
    timeoutMs: 7000,
  });
  const [stateRuntimeConfig, setStateRuntimeConfig] = useState({
    enabled: false,
    tickSeconds: 60,
    maxCatchUpTicks: 120,
    perTickScale: 1,
    applyDecayDuringTicks: true,
    applyRecoveryDuringTicks: true,
  });
  const [isSavingStt, setIsSavingStt] = useState(false);
  const [isSavingSearch, setIsSavingSearch] = useState(false);
  const [isSavingStateRuntime, setIsSavingStateRuntime] = useState(false);
  const [activeSettingsView, setActiveSettingsView] = useState("llm");

  const selectedProvider = useMemo(
    () => providers.find((candidate) => candidate.id === provider) || null,
    [providers, provider],
  );

  const activeProviderKey = useMemo(() => {
    const normalizedProvider = String(provider || "").trim().toLowerCase();
    const normalizedBaseUrl = String(baseUrl || selectedProvider?.baseUrl || "").trim().replace(/\/$/, "").toLowerCase();
    return `${normalizedProvider}::${normalizedBaseUrl}`;
  }, [provider, baseUrl, selectedProvider?.baseUrl]);

  const activeModelFavorites = useMemo(() => {
    const list = modelFavoritesByProvider[activeProviderKey];
    return Array.isArray(list) ? list : [];
  }, [modelFavoritesByProvider, activeProviderKey]);

  const sortedAvailableModels = useMemo(() => {
    const list = Array.isArray(availableModels) ? [...availableModels] : [];
    return list.sort((left, right) => {
      const leftFav = activeModelFavorites.includes(left.id);
      const rightFav = activeModelFavorites.includes(right.id);
      if (leftFav !== rightFav) {
        return leftFav ? -1 : 1;
      }

      const leftName = String(left.name || left.id || "").toLowerCase();
      const rightName = String(right.name || right.id || "").toLowerCase();
      return leftName.localeCompare(rightName);
    });
  }, [availableModels, activeModelFavorites]);

  const favoriteModelEntries = useMemo(() => {
    if (!sortedAvailableModels.length || !activeModelFavorites.length) {
      return [];
    }

    const favorites = sortedAvailableModels.filter((entry) => activeModelFavorites.includes(entry.id));
    return favorites.slice(0, 8);
  }, [sortedAvailableModels, activeModelFavorites]);

  const selectedSavedCredential = useMemo(() => {
    const normalizedBaseUrl = String(baseUrl || "").trim().replace(/\/$/, "");
    const byExactBaseUrl = savedProviders.find(
      (candidate) =>
        candidate.provider === provider &&
        String(candidate.baseUrl || "").trim().replace(/\/$/, "") === normalizedBaseUrl,
    );

    if (byExactBaseUrl) {
      return byExactBaseUrl;
    }

    return (
      savedProviders.find(
        (candidate) => candidate.provider === provider && !String(candidate.baseUrl || "").trim(),
      ) || null
    );
  }, [baseUrl, provider, savedProviders]);

  const selectedTtsProvider = useMemo(
    () => ttsProviders.find((candidate) => candidate.provider === ttsProvider) || null,
    [ttsProvider, ttsProviders],
  );

  const activeTtsProviderOptions = ttsProviderOptions[ttsProvider] || {
    voices: [],
    builtinVoices: [],
    customVoices: [],
    models: [],
    catalog: {},
    error: "",
  };

  const activeTtsBuiltinVoices = Array.isArray(activeTtsProviderOptions.builtinVoices)
    ? activeTtsProviderOptions.builtinVoices
    : [];
  const activeTtsCustomVoices = Array.isArray(activeTtsProviderOptions.customVoices)
    ? activeTtsProviderOptions.customVoices
    : [];
  const selectedTtsVoiceOption = activeTtsProviderOptions.voices.some((voice) => voice.id === ttsVoiceId)
    ? ttsVoiceId
    : CUSTOM_OPTION;
  const selectedTtsModelOption = activeTtsProviderOptions.models.some((entry) => entry.id === ttsModel)
    ? ttsModel
    : CUSTOM_OPTION;

  useEffect(() => {
    if (!authLoaded || !isSignedIn) {
      return;
    }
    void initialize();
  }, [authLoaded, isSignedIn]);

  useEffect(() => {
    if (provider !== "custom") {
      setBaseUrl(selectedProvider?.baseUrl || "");
    }
  }, [provider, selectedProvider?.baseUrl]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const normalizedBaseUrl = String(baseUrl || "").trim().replace(/\/$/, "");
    const normalizedConnectedBaseUrl = String(connected?.baseUrl || "").trim().replace(/\/$/, "");
    const sameConnection = connected?.provider === provider && normalizedBaseUrl === normalizedConnectedBaseUrl;

    if (!sameConnection) {
      setAvailableModels([]);
      setModel("");
    }
  }, [provider, baseUrl, connected?.provider, connected?.baseUrl, isLoading]);

  useEffect(() => {
    if (!selectedTtsProvider) {
      return;
    }
    setTtsVoiceId(selectedTtsProvider.voiceId || selectedTtsProvider.defaultVoiceId || "");
    setTtsModel(selectedTtsProvider.model || selectedTtsProvider.defaultModel || "");
  }, [selectedTtsProvider?.provider, selectedTtsProvider?.voiceId, selectedTtsProvider?.model]);

  useEffect(() => {
    if (!authLoaded || !isSignedIn) {
      return;
    }

    if (!["elevenlabs", "cartesia"].includes(ttsProvider)) {
      return;
    }

    let ignore = false;

    async function loadTtsProviderOptions() {
      setIsLoadingTtsProviderOptions(true);
      try {
        const response = await authFetch(`/api/tts/provider-options?provider=${encodeURIComponent(ttsProvider)}`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Failed to load provider options.");
        }
        if (ignore) {
          return;
        }

        const fallbackVoices = ttsProvider === "elevenlabs"
          ? ELEVENLABS_VOICE_PRESETS
          : CARTESIA_VOICE_PRESETS;
        const fallbackModels = ttsProvider === "elevenlabs"
          ? ELEVENLABS_MODEL_PRESETS
          : CARTESIA_MODEL_PRESETS;

        const voices = Array.isArray(data.voices) && data.voices.length
          ? data.voices
          : fallbackVoices;
        const models = Array.isArray(data.models) && data.models.length
          ? data.models
          : fallbackModels;

        setTtsProviderOptions((current) => ({
          ...current,
          [ttsProvider]: {
            voices,
            builtinVoices: Array.isArray(data.builtinVoices) && data.builtinVoices.length
              ? data.builtinVoices
              : voices,
            customVoices: Array.isArray(data.customVoices) ? data.customVoices : [],
            models,
            catalog: data.catalog && typeof data.catalog === "object"
              ? data.catalog
              : {
                  voices: { source: "fallback", count: voices.length },
                  models: { source: ttsProvider === "cartesia" ? "fallback" : "unavailable", count: models.length },
                },
            error: String(data.error || "").trim(),
          },
        }));
      } catch (error) {
        if (!ignore) {
          setTtsProviderOptions((current) => ({
            ...current,
            [ttsProvider]: {
              ...(current[ttsProvider] || { voices: [], builtinVoices: [], customVoices: [], models: [] }),
              catalog:
                current[ttsProvider]?.catalog && typeof current[ttsProvider].catalog === "object"
                  ? current[ttsProvider].catalog
                  : {
                      voices: { source: "fallback", count: (ttsProvider === "elevenlabs" ? ELEVENLABS_VOICE_PRESETS : CARTESIA_VOICE_PRESETS).length },
                      models: { source: ttsProvider === "cartesia" ? "fallback" : "unavailable", count: (ttsProvider === "elevenlabs" ? ELEVENLABS_MODEL_PRESETS : CARTESIA_MODEL_PRESETS).length },
                    },
              error: error.message || "Failed to load provider options.",
            },
          }));
        }
      } finally {
        if (!ignore) {
          setIsLoadingTtsProviderOptions(false);
        }
      }
    }

    void loadTtsProviderOptions();
    return () => {
      ignore = true;
    };
  }, [authFetch, authLoaded, isSignedIn, ttsProvider]);

  async function initialize() {
    setIsLoading(true);

    try {
      const [providersResponse, settingsResponse, ttsResponse, kokoroResponse, sttResponse, searchResponse, stateRuntimeResponse] = await Promise.all([
        authFetch("/settings/llm/providers"),
        authFetch("/settings/llm"),
        authFetch("/settings/tts"),
        authFetch("/settings/kokoro"),
        authFetch("/settings/stt-runtime"),
        authFetch("/settings/search-runtime"),
        authFetch("/settings/state-runtime"),
      ]);

      const providersData = await providersResponse.json();
      const settingsData = await settingsResponse.json();
      const ttsData = await ttsResponse.json();
      const kokoroData = await kokoroResponse.json();
      const sttData = await sttResponse.json();
      const searchData = await searchResponse.json();
      const stateRuntimeData = await stateRuntimeResponse.json();

      if (!providersResponse.ok) {
        throw new Error(providersData.error || "Failed to load providers.");
      }
      if (!settingsResponse.ok) {
        throw new Error(settingsData.error || "Failed to load current settings.");
      }
      if (!ttsResponse.ok) {
        throw new Error(ttsData.error || "Failed to load TTS settings.");
      }
      if (!kokoroResponse.ok) {
        throw new Error(kokoroData.error || "Failed to load Kokoro settings.");
      }
      if (!sttResponse.ok) {
        throw new Error(sttData.error || "Failed to load STT settings.");
      }
      if (!searchResponse.ok) {
        throw new Error(searchData.error || "Failed to load web search settings.");
      }
      if (!stateRuntimeResponse.ok) {
        throw new Error(stateRuntimeData.error || "Failed to load state runtime settings.");
      }

      const providerList = Array.isArray(providersData.providers) && providersData.providers.length
        ? providersData.providers
        : fallbackProviders();

      setProviders(providerList);

      if (settingsData.connected) {
        setConnected(settingsData);
        setSavedProviders(settingsData.savedProviders || []);
        setProvider(settingsData.provider || providerList[0]?.id || "openai");
        setBaseUrl(settingsData.baseUrl || "");
        setAvailableModels(settingsData.models || []);
        setModel(settingsData.model || "");
      } else {
        setConnected(null);
        setSavedProviders(settingsData.savedProviders || []);
        setProvider(providerList[0]?.id || "openai");
        setAvailableModels([]);
        setModel("");
      }

      setLlmEnvInfo({
        envConfigured: Boolean(settingsData.envConfigured),
        envBaseUrl: String(settingsData.envBaseUrl || "").trim(),
        envModel: String(settingsData.envModel || "").trim(),
        envLocked: Boolean(settingsData.envLocked),
      });

      const ttsProviderList = Array.isArray(ttsData.providers) ? ttsData.providers : [];
      setTtsDebugLockEnabled(Boolean(ttsData?.debugLockEnabled));
      setTtsProviders(ttsProviderList);
      setDefaultVoiceSource(ttsData?.voiceDefaults?.source === "llm" ? "llm" : "tts");
      const connectedProvider = ttsProviderList.find((entry) => entry.connected) || ttsProviderList[0] || null;
      if (connectedProvider) {
        setTtsProvider(connectedProvider.provider);
        setTtsVoiceId(connectedProvider.voiceId || connectedProvider.defaultVoiceId || "");
        setTtsModel(connectedProvider.model || connectedProvider.defaultModel || "");
      }

      setKokoroSettings({
        connected: Boolean(kokoroData?.connected),
        keyHint: String(kokoroData?.keyHint || "").trim(),
        updatedAt: String(kokoroData?.updatedAt || "").trim(),
        localPath: String(kokoroData?.localPath || "").trim(),
      });
      setKokoroLocalPath(String(kokoroData?.localPath || "").trim());

      setSttConfig({
        enabled: Boolean(sttData?.enabled),
        provider: String(sttData?.provider || "openai-compatible").trim() || "openai-compatible",
        baseUrl: String(sttData?.baseUrl || "").trim(),
        model: String(sttData?.model || "whisper-1").trim() || "whisper-1",
        language: String(sttData?.language || "auto").trim() || "auto",
        apiKey: String(sttData?.apiKey || "").trim(),
        maxAudioBytes: Number(sttData?.maxAudioBytes) || 10485760,
      });

      setSearchConfig({
        enabled: Boolean(searchData?.enabled),
        provider: String(searchData?.provider || "duckduckgo").trim() || "duckduckgo",
        autoForQueries: Boolean(searchData?.autoForQueries),
        maxResults: Number(searchData?.maxResults) || 4,
        timeoutMs: Number(searchData?.timeoutMs) || 7000,
      });

      setStateRuntimeConfig({
        enabled: Boolean(stateRuntimeData?.enabled),
        tickSeconds: Number(stateRuntimeData?.tickSeconds) || 60,
        maxCatchUpTicks: Number(stateRuntimeData?.maxCatchUpTicks) || 120,
        perTickScale: Number(stateRuntimeData?.perTickScale) || 1,
        applyDecayDuringTicks: stateRuntimeData?.applyDecayDuringTicks !== false,
        applyRecoveryDuringTicks: stateRuntimeData?.applyRecoveryDuringTicks !== false,
      });
    } catch (error) {
      onStatus?.({ type: "error", message: error.message || "Failed to load LLM settings." });
      setProviders(fallbackProviders());
    } finally {
      setIsLoading(false);
    }
  }

  async function saveTtsProvider() {
    if (!ttsProvider) {
      onStatus?.({ type: "error", message: "Choose a TTS provider first." });
      return;
    }
    if (!ttsApiKey.trim()) {
      onStatus?.({ type: "error", message: "TTS API key is required to save/update provider credentials." });
      return;
    }

    setIsSavingTts(true);
    try {
      const response = await authFetch(`/settings/tts/${ttsProvider}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: ttsApiKey.trim(),
          voiceId: ttsVoiceId.trim(),
          model: ttsModel.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to save TTS credentials.");
      }

      setTtsApiKey("");
      await initialize();
      onStatus?.({ type: "success", message: `Saved ${data.name || data.provider} credentials.` });
    } catch (error) {
      onStatus?.({ type: "error", message: error.message || "Failed to save TTS credentials." });
    } finally {
      setIsSavingTts(false);
    }
  }

  async function disconnectTtsProvider() {
    if (!ttsProvider) {
      return;
    }

    setIsDisconnectingTts(true);
    try {
      const response = await authFetch(`/settings/tts/${ttsProvider}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to disconnect TTS provider.");
      }

      await initialize();
      onStatus?.({ type: "success", message: `Disconnected ${data.provider}.` });
    } catch (error) {
      onStatus?.({ type: "error", message: error.message || "Failed to disconnect TTS provider." });
    } finally {
      setIsDisconnectingTts(false);
    }
  }

  async function updateDefaultVoiceSource(nextSource) {
    if (!["tts", "llm"].includes(nextSource) || nextSource === defaultVoiceSource) {
      return;
    }

    setIsSavingDefaultVoiceSource(true);
    try {
      const response = await authFetch("/settings/voice-defaults", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: nextSource }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to update default voice source.");
      }

      const normalized = data.source === "llm" ? "llm" : "tts";
      setDefaultVoiceSource(normalized);
      onStatus?.({
        type: "success",
        message:
          normalized === "llm"
            ? "Cloud/LLM is now the default voice source. Dedicated TTS default was turned off."
            : "Dedicated TTS is now the default voice source. Cloud/LLM default was turned off.",
      });
    } catch (error) {
      onStatus?.({ type: "error", message: error.message || "Failed to update default voice source." });
    } finally {
      setIsSavingDefaultVoiceSource(false);
    }
  }

  async function saveKokoroAccessToken() {
    if (!kokoroHfToken.trim()) {
      onStatus?.({ type: "error", message: "Hugging Face token is required before saving." });
      return;
    }

    setIsSavingKokoroToken(true);
    try {
      const response = await authFetch("/settings/kokoro", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: kokoroHfToken.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to save Kokoro access token.");
      }

      setKokoroHfToken("");
      setKokoroSettings({
        connected: Boolean(data?.connected),
        keyHint: String(data?.keyHint || "").trim(),
        updatedAt: String(data?.updatedAt || "").trim(),
        localPath: String(data?.localPath || "").trim(),
      });
      onStatus?.({ type: "success", message: "Saved Kokoro Hugging Face token." });
    } catch (error) {
      onStatus?.({ type: "error", message: error.message || "Failed to save Kokoro access token." });
    } finally {
      setIsSavingKokoroToken(false);
    }
  }

  async function clearKokoroAccessToken() {
    setIsClearingKokoroToken(true);
    try {
      const response = await authFetch("/settings/kokoro", {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to clear Kokoro access token.");
      }

      setKokoroHfToken("");
      setKokoroSettings({
        connected: Boolean(data?.connected),
        keyHint: String(data?.keyHint || "").trim(),
        updatedAt: String(data?.updatedAt || "").trim(),
        localPath: String(data?.localPath || "").trim(),
      });
      setKokoroLocalPath(String(data?.localPath || "").trim());
      onStatus?.({ type: "success", message: "Cleared Kokoro Hugging Face token." });
    } catch (error) {
      onStatus?.({ type: "error", message: error.message || "Failed to clear Kokoro access token." });
    } finally {
      setIsClearingKokoroToken(false);
    }
  }

  async function saveKokoroLocalPath() {
    if (!kokoroLocalPath.trim()) {
      onStatus?.({ type: "error", message: "Local path is required before saving." });
      return;
    }

    setIsSavingKokoroPath(true);
    try {
      const response = await authFetch("/settings/kokoro/local-path", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: kokoroLocalPath.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to save Kokoro local path.");
      }

      setKokoroSettings({
        connected: Boolean(data?.connected),
        keyHint: String(data?.keyHint || "").trim(),
        updatedAt: String(data?.updatedAt || "").trim(),
        localPath: String(data?.localPath || "").trim(),
      });
      onStatus?.({ type: "success", message: "Saved Kokoro local model path." });
    } catch (error) {
      onStatus?.({ type: "error", message: error.message || "Failed to save Kokoro local path." });
    } finally {
      setIsSavingKokoroPath(false);
    }
  }

  async function clearKokoroLocalPath() {
    setIsClearingKokoroPath(true);
    try {
      const response = await authFetch("/settings/kokoro/local-path", {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to clear Kokoro local path.");
      }

      setKokoroLocalPath("");
      setKokoroSettings({
        connected: Boolean(data?.connected),
        keyHint: String(data?.keyHint || "").trim(),
        updatedAt: String(data?.updatedAt || "").trim(),
        localPath: String(data?.localPath || "").trim(),
      });
      onStatus?.({ type: "success", message: "Cleared Kokoro local model path." });
    } catch (error) {
      onStatus?.({ type: "error", message: error.message || "Failed to clear Kokoro local path." });
    } finally {
      setIsClearingKokoroPath(false);
    }
  }

  async function saveSttRuntimeConfig() {
    setIsSavingStt(true);
    try {
      const response = await authFetch("/settings/stt-runtime", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sttConfig),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to save STT settings.");
      }
      setSttConfig((current) => ({ ...current, ...data }));
      onStatus?.({ type: "success", message: "Saved STT runtime settings." });
    } catch (error) {
      onStatus?.({ type: "error", message: error.message || "Failed to save STT settings." });
    } finally {
      setIsSavingStt(false);
    }
  }

  async function saveSearchRuntimeConfig() {
    setIsSavingSearch(true);
    try {
      const response = await authFetch("/settings/search-runtime", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(searchConfig),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to save web search settings.");
      }
      setSearchConfig((current) => ({ ...current, ...data }));
      onStatus?.({ type: "success", message: "Saved web search settings." });
    } catch (error) {
      onStatus?.({ type: "error", message: error.message || "Failed to save web search settings." });
    } finally {
      setIsSavingSearch(false);
    }
  }

  async function saveStateRuntimeConfig() {
    setIsSavingStateRuntime(true);
    try {
      const response = await authFetch("/settings/state-runtime", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stateRuntimeConfig),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to save state runtime settings.");
      }
      setStateRuntimeConfig((current) => ({ ...current, ...data }));
      onStatus?.({ type: "success", message: "Saved between-turn state drift settings." });
    } catch (error) {
      onStatus?.({ type: "error", message: error.message || "Failed to save state runtime settings." });
    } finally {
      setIsSavingStateRuntime(false);
    }
  }

  async function detectProvider() {
    if (!apiKey.trim() && !llmEnvInfo.envConfigured) {
      onStatus?.({ type: "error", message: "Enter an API key before auto-detect." });
      return;
    }

    setIsDetecting(true);

    try {
      const response = await authFetch("/settings/llm/detect", {
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

    if (provider !== "ollama" && !apiKey.trim() && !selectedSavedCredential?.keyHint && !llmEnvInfo.envConfigured) {
      onStatus?.({ type: "error", message: "API key is required. Paste a key or select a provider that has a saved key." });
      return;
    }

    if (provider === "custom" && !baseUrl.trim()) {
      onStatus?.({ type: "error", message: "Base URL is required for custom provider." });
      return;
    }

    setIsConnecting(true);

    try {
      const response = await authFetch("/settings/llm/connect", {
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
      setSavedProviders(data.savedProviders || []);
      setAvailableModels(data.models || []);
      setModel(data.model || "");
      setApiKey("");
      // Sync provider dropdown to whichever provider actually connected (may
      // differ from requested when the backend auto-corrects based on key prefix).
      if (data.provider) {
        setProvider(data.provider);
        if (data.baseUrl) setBaseUrl(data.baseUrl);
      }
      const corrected = data.autoCorrectedProvider && data.requestedProvider && data.requestedProvider !== data.provider;
      const rateLimited = Boolean(data.rateLimited);
      onStatus?.({
        type: rateLimited ? "warn" : "success",
        message: corrected
          ? `Auto-corrected to ${data.providerName || data.provider} (your key is for ${data.providerName || data.provider}, not ${data.requestedProvider}). Connected successfully.`
          : rateLimited
            ? `Connected ${data.providerName || data.provider} — but the model list endpoint is rate-limited. Type your model ID manually in the Model field.`
            : apiKey.trim()
              ? `Connected ${data.providerName || data.provider} and saved the updated key.`
              : `Connected ${data.providerName || data.provider} using the saved key.`,
      });
    } catch (error) {
      onStatus?.({ type: "error", message: error.message || "Failed to connect provider." });
    } finally {
      setIsConnecting(false);
    }
  }

  async function checkOllamaRuntime({ loadModels = true, silent = false } = {}) {
    if (ollamaCheckInFlightRef.current) {
      return;
    }

    ollamaCheckInFlightRef.current = true;
    setIsCheckingOllama(true);

    try {
      const query = provider === "ollama" && baseUrl.trim()
        ? `?baseUrl=${encodeURIComponent(baseUrl.trim())}`
        : "";
      const response = await authFetch(`/settings/llm/ollama/status${query}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to reach Ollama runtime.");
      }

      setOllamaStatus(data);

      if (loadModels && Array.isArray(data.models) && data.models.length) {
        setAvailableModels(data.models);
        if (!model || !data.models.some((entry) => entry.id === model)) {
          setModel(data.model || data.models[0]?.id || "");
        }
      }

      if (data.reachable && !silent) {
        onStatus?.({
          type: "success",
          message: `Ollama is reachable${data.version ? ` (v${data.version})` : ""}. ${Array.isArray(data.models) ? `${data.models.length} model(s) detected.` : ""}`,
        });
      } else if (!data.reachable && !silent) {
        onStatus?.({
          type: "warn",
          message: data.error || "Ollama is not reachable. Start it locally and try again.",
        });
      }
    } catch (error) {
      if (!silent) {
        onStatus?.({ type: "error", message: error.message || "Failed to reach Ollama runtime." });
      }
    } finally {
      setIsCheckingOllama(false);
      ollamaCheckInFlightRef.current = false;
    }
  }

  useEffect(() => {
    if (!authLoaded || !isSignedIn || provider !== "ollama") {
      return;
    }

    // Immediate refresh once selected so model dropdown populates right away.
    void checkOllamaRuntime({ loadModels: true, silent: true });

    // Lightweight keepalive check while Ollama is selected.
    const interval = setInterval(() => {
      void checkOllamaRuntime({ loadModels: false, silent: true });
    }, 30000);

    return () => clearInterval(interval);
  }, [authLoaded, isSignedIn, provider, baseUrl]);

  async function applyModel(nextModel) {
    if (!nextModel) {
      return;
    }

    setModel(nextModel);

    try {
      const response = await authFetch("/settings/llm/model", {
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
      setSavedProviders(data.savedProviders || []);
      onStatus?.({ type: "success", message: `Active model switched to ${nextModel}.` });
    } catch (error) {
      onStatus?.({ type: "error", message: error.message || "Failed to apply model." });
    }
  }

  function toggleModelFavorite(modelId) {
    const normalizedModelId = String(modelId || "").trim();
    if (!normalizedModelId || !activeProviderKey) {
      return;
    }

    setModelFavoritesByProvider((current) => {
      const currentList = Array.isArray(current[activeProviderKey]) ? current[activeProviderKey] : [];
      const exists = currentList.includes(normalizedModelId);
      const nextList = exists
        ? currentList.filter((id) => id !== normalizedModelId)
        : [normalizedModelId, ...currentList].slice(0, 20);
      const nextValue = {
        ...current,
        [activeProviderKey]: nextList,
      };
      saveModelFavorites(nextValue);
      return nextValue;
    });
  }

  function exportModelFavorites() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      modelFavoritesByProvider,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `voxis-model-favorites-${Date.now()}.json`;
    link.click();
    window.URL.revokeObjectURL(url);
    onStatus?.({ type: "success", message: "Exported model favorites JSON." });
  }

  async function importModelFavorites(event) {
    const file = event?.target?.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const incoming =
        parsed && typeof parsed === "object" && parsed.modelFavoritesByProvider && typeof parsed.modelFavoritesByProvider === "object"
          ? parsed.modelFavoritesByProvider
          : parsed && typeof parsed === "object"
            ? parsed
            : null;

      if (!incoming || typeof incoming !== "object") {
        throw new Error("Invalid favorites file format.");
      }

      const normalized = Object.fromEntries(
        Object.entries(incoming)
          .map(([key, value]) => [
            String(key || "").trim(),
            Array.isArray(value)
              ? Array.from(new Set(value.map((entry) => String(entry || "").trim()).filter(Boolean))).slice(0, 20)
              : [],
          ])
          .filter(([key]) => Boolean(key)),
      );

      setModelFavoritesByProvider(normalized);
      saveModelFavorites(normalized);
      onStatus?.({ type: "success", message: "Imported model favorites." });
    } catch (error) {
      onStatus?.({ type: "error", message: error.message || "Failed to import model favorites." });
    } finally {
      if (event?.target) {
        event.target.value = "";
      }
    }
  }

  async function disconnectProvider() {
    setIsDisconnecting(true);

    try {
      const response = await authFetch("/settings/llm", {
        method: "DELETE",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to disconnect provider.");
      }

      setConnected(null);
      setSavedProviders(data.savedProviders || []);
      setAvailableModels([]);
      setModel("");
      setApiKey("");
      onStatus?.({ type: "success", message: "Disconnected runtime LLM provider. Saved keys remain available for later reconnects." });
    } catch (error) {
      onStatus?.({ type: "error", message: error.message || "Failed to disconnect provider." });
    } finally {
      setIsDisconnecting(false);
    }
  }

  async function removeSavedCredential(savedProvider) {
    try {
      const response = await authFetch("/settings/llm/saved", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: savedProvider.provider, baseUrl: savedProvider.baseUrl }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to remove saved key.");
      }
      setSavedProviders(data.savedProviders || []);
      onStatus?.({ type: "success", message: `Removed saved key for ${savedProvider.provider}.` });
    } catch (error) {
      onStatus?.({ type: "error", message: error.message || "Failed to remove saved key." });
    }
  }

  return (
    <div className="llm-settings">
      <style>{settingsStyles}</style>
      <div className="settings-nav" role="tablist" aria-label="Settings sections">
        <button
          type="button"
          role="tab"
          aria-selected={activeSettingsView === "llm"}
          className={activeSettingsView === "llm" ? "active" : ""}
          onClick={() => setActiveSettingsView("llm")}
        >
          LLM
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeSettingsView === "voice"}
          className={activeSettingsView === "voice" ? "active" : ""}
          onClick={() => setActiveSettingsView("voice")}
        >
          Voice
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeSettingsView === "runtime"}
          className={activeSettingsView === "runtime" ? "active" : ""}
          onClick={() => setActiveSettingsView("runtime")}
        >
          Runtime
        </button>
      </div>

      {activeSettingsView === "llm" ? (
      <section className="settings-section">
        <div className="settings-section-header">
          <span className="settings-section-tag">Runtime LLM</span>
          <h3>Chat Provider</h3>
          <p className="settings-section-copy">
            Connect the provider used for chat, memory, and eval requests. If you only need per-character voice tuning, stay in Voice Lab.
          </p>
        </div>

        {llmEnvInfo.envConfigured ? (
          <div className={`llm-connected ${llmEnvInfo.envLocked ? "warn" : "info"}`}>
            {llmEnvInfo.envLocked
              ? `backend/.env is currently locking chat runtime to ${llmEnvInfo.envBaseUrl || "the env provider"}${llmEnvInfo.envModel ? ` (${llmEnvInfo.envModel})` : ""}. Set LLM_LOCK_ENV=false or remove LLM_* env values to switch providers from this panel.`
              : `backend/.env has an LLM fallback configured${llmEnvInfo.envModel ? ` (${llmEnvInfo.envModel})` : ""}, but runtime providers connected from this panel now take priority.`}
          </div>
        ) : null}

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
              placeholder={
                provider === "ollama"
                  ? "Optional for local Ollama (leave blank by default)."
                  : selectedSavedCredential?.keyHint
                  ? "Saved key on file. Enter a new key only to replace it."
                  : llmEnvInfo.envConfigured
                    ? "Env key on file (works for its own provider). Paste a new key to use a different one."
                    : "Paste provider key"
              }
              disabled={isLoading || isConnecting}
            />
            {selectedSavedCredential?.keyHint ? (
              <p className="llm-field-helper">Saved key on file: {selectedSavedCredential.keyHint}</p>
            ) : provider === "ollama" ? (
              <p className="llm-field-helper">Offline Ollama normally runs keyless on localhost. Enter a token only if your proxy requires one.</p>
            ) : null}
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
            <p className="llm-field-helper">Only needed for custom OpenAI-compatible providers.</p>
          </div>

          <div className="llm-field">
            <label htmlFor="llm-model">Model</label>
            {availableModels.length ? (
              <select
                id="llm-model"
                value={model}
                onChange={(event) => void applyModel(event.target.value)}
                disabled={isConnecting || isLoading}
              >
                <option value="">Choose model</option>
                {sortedAvailableModels.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {(activeModelFavorites.includes(candidate.id) ? "[fav] " : "") + (candidate.name || candidate.id) + (candidate.isFree ? " (free)" : "")}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="llm-model"
                type="text"
                value={model}
                onChange={(event) => setModel(event.target.value)}
                onBlur={(event) => { if (event.target.value.trim() && connected?.connected) void applyModel(event.target.value.trim()); }}
                placeholder="Type model ID (e.g. grok-3-mini)"
                disabled={isConnecting || isLoading}
              />
            )}
            {!availableModels.length ? (
              <p className="llm-field-helper">No model list available. Type a model ID and press Tab or click Connect to apply it.</p>
            ) : null}
            {availableModels.length ? (
              <div className="llm-actions compact">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => toggleModelFavorite(model)}
                  disabled={!model || isLoading || isConnecting}
                >
                  {activeModelFavorites.includes(model) ? "Unfavorite Current Model" : "Favorite Current Model"}
                </button>
              </div>
            ) : null}
            {favoriteModelEntries.length ? (
              <div className="llm-quick-picks">
                {favoriteModelEntries.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className="secondary"
                    onClick={() => void applyModel(entry.id)}
                    disabled={isLoading || isConnecting}
                  >
                    {entry.name || entry.id}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="llm-actions compact">
          <button type="button" className="secondary" onClick={() => void detectProvider()} disabled={isDetecting || isLoading || isConnecting}>
            {isDetecting ? "Detecting..." : "Detect Provider"}
          </button>
          {provider === "ollama" ? (
            <button
              type="button"
              className="secondary"
              onClick={() => void checkOllamaRuntime({ loadModels: false })}
              disabled={isCheckingOllama || isLoading || isConnecting}
            >
              {isCheckingOllama ? "Checking Ollama..." : "Check Local Ollama"}
            </button>
          ) : null}
          {provider === "ollama" ? (
            <button
              type="button"
              className="secondary"
              onClick={() => void checkOllamaRuntime({ loadModels: true })}
              disabled={isCheckingOllama || isLoading || isConnecting}
            >
              {isCheckingOllama ? "Loading models..." : "Load Ollama Models"}
            </button>
          ) : null}
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
          <button
            type="button"
            className="secondary"
            onClick={() => exportModelFavorites()}
            disabled={isLoading}
          >
            Export Model Favorites
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => modelFavoritesImportRef.current?.click()}
            disabled={isLoading}
          >
            Import Model Favorites
          </button>
          <input
            ref={modelFavoritesImportRef}
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={(event) => void importModelFavorites(event)}
          />
        </div>

        {connected?.connected ? (
          <div className="llm-connected">
            Connected provider: {connected.provider} | Active model: {connected.model || "not selected"} | Key hint: {connected.keyHint}
          </div>
        ) : (
          <div className="llm-connected info">
            No runtime LLM is connected right now. Env fallbacks can still be used server-side if configured.
          </div>
        )}

        {provider === "ollama" && ollamaStatus ? (
          <div className={`llm-connected ${ollamaStatus.reachable ? "info" : "warn"}`}>
            Ollama runtime: {ollamaStatus.reachable ? "reachable" : "offline"}
            {ollamaStatus.version ? ` | Version: ${ollamaStatus.version}` : ""}
            {Array.isArray(ollamaStatus.models) ? ` | Models: ${ollamaStatus.models.length}` : ""}
          </div>
        ) : null}

        {savedProviders.length > 0 ? (
          <div className="llm-field">
            <label>Saved Keys</label>
            {savedProviders.map((sp) => (
              <div key={`${sp.provider}::${sp.baseUrl}`} style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "6px" }}>
                <span style={{ flex: 1, fontSize: "0.86rem", color: "#87a8b9" }}>
                  {sp.provider}{sp.baseUrl ? ` (${sp.baseUrl})` : ""} — {sp.keyHint}
                </span>
                <button
                  type="button"
                  className="secondary"
                  style={{ padding: "2px 10px", fontSize: "0.78rem" }}
                  onClick={() => void removeSavedCredential(sp)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </section>
      ) : null}

      {activeSettingsView === "runtime" ? (
      <>
      <section className="settings-section">
        <div className="settings-section-header">
          <span className="settings-section-tag">Speech To Text</span>
          <h3>STT Runtime</h3>
          <p className="settings-section-copy">
            Configure voice transcription provider used by the new /stt/transcribe endpoint.
          </p>
        </div>
        <div className="llm-grid">
          <div className="llm-field">
            <label htmlFor="stt-enabled">Enabled</label>
            <select
              id="stt-enabled"
              value={sttConfig.enabled ? "true" : "false"}
              onChange={(event) => setSttConfig((current) => ({ ...current, enabled: event.target.value === "true" }))}
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </div>
          <div className="llm-field">
            <label htmlFor="stt-base-url">Base URL</label>
            <input
              id="stt-base-url"
              type="text"
              value={sttConfig.baseUrl}
              onChange={(event) => setSttConfig((current) => ({ ...current, baseUrl: event.target.value }))}
              placeholder="http://127.0.0.1:8000/v1"
            />
          </div>
          <div className="llm-field">
            <label htmlFor="stt-model">Model</label>
            <input
              id="stt-model"
              type="text"
              value={sttConfig.model}
              onChange={(event) => setSttConfig((current) => ({ ...current, model: event.target.value }))}
              placeholder="whisper-1"
            />
          </div>
          <div className="llm-field">
            <label htmlFor="stt-language">Language</label>
            <input
              id="stt-language"
              type="text"
              value={sttConfig.language}
              onChange={(event) => setSttConfig((current) => ({ ...current, language: event.target.value }))}
              placeholder="auto"
            />
          </div>
          <div className="llm-field">
            <label htmlFor="stt-api-key">API Key (optional)</label>
            <input
              id="stt-api-key"
              type="password"
              autoComplete="off"
              value={sttConfig.apiKey}
              onChange={(event) => setSttConfig((current) => ({ ...current, apiKey: event.target.value }))}
              placeholder="Leave blank for local keyless providers"
            />
          </div>
          <div className="llm-field">
            <label htmlFor="stt-max-audio-bytes">Max Audio Bytes</label>
            <input
              id="stt-max-audio-bytes"
              type="number"
              min="65536"
              step="1024"
              value={sttConfig.maxAudioBytes}
              onChange={(event) => setSttConfig((current) => ({ ...current, maxAudioBytes: Number(event.target.value) || current.maxAudioBytes }))}
            />
          </div>
        </div>
        <div className="llm-actions compact">
          <button type="button" onClick={() => void saveSttRuntimeConfig()} disabled={isSavingStt || isLoading}>
            {isSavingStt ? "Saving..." : "Save STT Settings"}
          </button>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-header">
          <span className="settings-section-tag">Web Search</span>
          <h3>Search Runtime</h3>
          <p className="settings-section-copy">
            Configure online retrieval augmentation for up-to-date questions.
          </p>
        </div>
        <div className="llm-grid">
          <div className="llm-field">
            <label htmlFor="search-enabled">Enabled</label>
            <select
              id="search-enabled"
              value={searchConfig.enabled ? "true" : "false"}
              onChange={(event) => setSearchConfig((current) => ({ ...current, enabled: event.target.value === "true" }))}
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </div>
          <div className="llm-field">
            <label htmlFor="search-auto">Auto Trigger</label>
            <select
              id="search-auto"
              value={searchConfig.autoForQueries ? "true" : "false"}
              onChange={(event) => setSearchConfig((current) => ({ ...current, autoForQueries: event.target.value === "true" }))}
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </div>
          <div className="llm-field">
            <label htmlFor="search-max-results">Max Results</label>
            <input
              id="search-max-results"
              type="number"
              min="1"
              max="8"
              value={searchConfig.maxResults}
              onChange={(event) => setSearchConfig((current) => ({ ...current, maxResults: Number(event.target.value) || current.maxResults }))}
            />
          </div>
          <div className="llm-field">
            <label htmlFor="search-timeout">Timeout (ms)</label>
            <input
              id="search-timeout"
              type="number"
              min="1000"
              step="500"
              value={searchConfig.timeoutMs}
              onChange={(event) => setSearchConfig((current) => ({ ...current, timeoutMs: Number(event.target.value) || current.timeoutMs }))}
            />
          </div>
        </div>
        <div className="llm-actions compact">
          <button type="button" onClick={() => void saveSearchRuntimeConfig()} disabled={isSavingSearch || isLoading}>
            {isSavingSearch ? "Saving..." : "Save Search Settings"}
          </button>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-header">
          <span className="settings-section-tag">State Runtime</span>
          <h3>Between-Turn Drift</h3>
          <p className="settings-section-copy">
            Apply timed state drift even when the user is idle between messages. Keep disabled for classic turn-only behavior.
          </p>
        </div>
        <div className="llm-grid">
          <div className="llm-field">
            <label htmlFor="state-runtime-enabled">Enabled</label>
            <select
              id="state-runtime-enabled"
              value={stateRuntimeConfig.enabled ? "true" : "false"}
              onChange={(event) => setStateRuntimeConfig((current) => ({ ...current, enabled: event.target.value === "true" }))}
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </div>
          <div className="llm-field">
            <label htmlFor="state-runtime-tick-seconds">Tick Seconds</label>
            <input
              id="state-runtime-tick-seconds"
              type="number"
              min="10"
              max="3600"
              step="5"
              value={stateRuntimeConfig.tickSeconds}
              onChange={(event) => setStateRuntimeConfig((current) => ({ ...current, tickSeconds: Number(event.target.value) || current.tickSeconds }))}
            />
          </div>
          <div className="llm-field">
            <label htmlFor="state-runtime-max-catchup">Max Catch-up Ticks</label>
            <input
              id="state-runtime-max-catchup"
              type="number"
              min="1"
              max="720"
              step="1"
              value={stateRuntimeConfig.maxCatchUpTicks}
              onChange={(event) => setStateRuntimeConfig((current) => ({ ...current, maxCatchUpTicks: Number(event.target.value) || current.maxCatchUpTicks }))}
            />
          </div>
          <div className="llm-field">
            <label htmlFor="state-runtime-per-tick-scale">Per-Tick Scale</label>
            <input
              id="state-runtime-per-tick-scale"
              type="number"
              min="0.05"
              max="5"
              step="0.05"
              value={stateRuntimeConfig.perTickScale}
              onChange={(event) => setStateRuntimeConfig((current) => ({ ...current, perTickScale: Number(event.target.value) || current.perTickScale }))}
            />
          </div>
          <div className="llm-field">
            <label htmlFor="state-runtime-apply-decay">Apply Decay During Ticks</label>
            <select
              id="state-runtime-apply-decay"
              value={stateRuntimeConfig.applyDecayDuringTicks ? "true" : "false"}
              onChange={(event) => setStateRuntimeConfig((current) => ({ ...current, applyDecayDuringTicks: event.target.value === "true" }))}
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </div>
          <div className="llm-field">
            <label htmlFor="state-runtime-apply-recovery">Apply Recovery During Ticks</label>
            <select
              id="state-runtime-apply-recovery"
              value={stateRuntimeConfig.applyRecoveryDuringTicks ? "true" : "false"}
              onChange={(event) => setStateRuntimeConfig((current) => ({ ...current, applyRecoveryDuringTicks: event.target.value === "true" }))}
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </div>
        </div>
        <div className="llm-actions compact">
          <button type="button" onClick={() => void saveStateRuntimeConfig()} disabled={isSavingStateRuntime || isLoading}>
            {isSavingStateRuntime ? "Saving..." : "Save State Runtime Settings"}
          </button>
        </div>
      </section>
      </>
      ) : null}

      {activeSettingsView === "voice" ? (
      <>
      <section className="settings-section">
        <div className="settings-section-header">
          <span className="settings-section-tag">Global Voice</span>
          <h3>Voice Defaults</h3>
          <p className="settings-section-copy">
            These defaults affect global runtime behavior. Character-specific engine and voice choices still live in Voice Lab.
          </p>
        </div>

        <div className="llm-grid">
          <div className="llm-field">
            <label htmlFor="voice-routing-default">Auto Voice Routing</label>
            <select
              id="voice-routing-default"
              value={defaultVoiceSource}
              onChange={(event) => void updateDefaultVoiceSource(event.target.value)}
              disabled={isSavingDefaultVoiceSource || isLoading}
            >
              <option value="tts">Prefer dedicated TTS first</option>
              <option value="llm">Prefer cloud/LLM first</option>
            </select>
            <p className="llm-field-helper">Applies only when a character uses the <strong>auto</strong> voice engine.</p>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-header">
          <span className="settings-section-tag">Voice Providers</span>
          <h3>Voice Provider Credentials</h3>
          <p className="settings-section-copy">
            {ttsDebugLockEnabled
              ? "Debug lock is active: only Cartesia credentials are enabled here."
              : "Save ElevenLabs or Cartesia credentials once and reuse them across Voice Lab and chat playback."}
          </p>
        </div>

        <div className="llm-grid">
        <div className="llm-field">
          <label htmlFor="tts-provider">TTS Provider</label>
          <select
            id="tts-provider"
            value={ttsProvider}
            onChange={(event) => setTtsProvider(event.target.value)}
            disabled={isSavingTts || isDisconnectingTts}
          >
            {ttsProviders.map((candidate) => (
              <option key={candidate.provider} value={candidate.provider}>
                {candidate.name}
              </option>
            ))}
          </select>
        </div>

        <div className="llm-field">
          <label htmlFor="tts-api-key">API Key</label>
          <input
            id="tts-api-key"
            type="password"
            autoComplete="off"
            value={ttsApiKey}
            onChange={(event) => setTtsApiKey(event.target.value)}
            placeholder={selectedTtsProvider?.keyHint ? "Saved key on file. Enter a new one to replace it." : "Paste provider key"}
            disabled={isSavingTts}
          />
          {selectedTtsProvider?.keyHint ? (
            <p className="llm-field-helper">Saved key on file: {selectedTtsProvider.keyHint}</p>
          ) : null}
        </div>

        <div className="llm-field">
          <label htmlFor="tts-voice-id">Voice ID</label>
          <select
            id="tts-voice-id"
            value={selectedTtsVoiceOption}
            onChange={(event) => {
              const next = event.target.value;
              if (next === CUSTOM_OPTION) {
                setTtsVoiceId("");
                return;
              }
              setTtsVoiceId(next);
            }}
            disabled={isSavingTts || isLoadingTtsProviderOptions}
          >
            <option value="" disabled>
              {isLoadingTtsProviderOptions ? "Loading provider voices..." : "Select a voice"}
            </option>
            {activeTtsBuiltinVoices.map((voice) => (
              <option key={voice.id} value={voice.id}>{voice.label}</option>
            ))}
            {activeTtsCustomVoices.length ? <option value="__my_voices__" disabled>My Voices</option> : null}
            {activeTtsCustomVoices.map((voice) => (
              <option key={voice.id} value={voice.id}>{voice.label}</option>
            ))}
            <option value={CUSTOM_OPTION}>Custom voice id</option>
          </select>
          {selectedTtsVoiceOption === CUSTOM_OPTION ? (
            <input
              type="text"
              value={ttsVoiceId}
              onChange={(event) => setTtsVoiceId(event.target.value)}
              placeholder={selectedTtsProvider?.defaultVoiceId || "Provider default voice"}
              disabled={isSavingTts}
            />
          ) : null}
          <p className="llm-field-helper">{getTtsVoiceHelpText(ttsProvider, activeTtsProviderOptions, selectedTtsProvider?.name)}</p>
        </div>

        <div className="llm-field">
          <label htmlFor="tts-model">Model</label>
          <select
            id="tts-model"
            value={selectedTtsModelOption}
            onChange={(event) => {
              const next = event.target.value;
              if (next === CUSTOM_OPTION) {
                setTtsModel("");
                return;
              }
              setTtsModel(next);
            }}
            disabled={isSavingTts || isLoadingTtsProviderOptions}
          >
            <option value="" disabled>
              {isLoadingTtsProviderOptions ? "Loading provider models..." : "Select a model"}
            </option>
            {activeTtsProviderOptions.models.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.label}</option>
            ))}
            <option value={CUSTOM_OPTION}>Custom model id</option>
          </select>
          {selectedTtsModelOption === CUSTOM_OPTION ? (
            <input
              type="text"
              value={ttsModel}
              onChange={(event) => setTtsModel(event.target.value)}
              placeholder={selectedTtsProvider?.defaultModel || "Provider default model"}
              disabled={isSavingTts}
            />
          ) : null}
          {ttsProvider === "cartesia" ? (
            <div className="llm-quick-picks">
              {CARTESIA_MODEL_QUICK_PICKS.map((modelId) => (
                <button
                  key={modelId}
                  type="button"
                  className="secondary"
                  onClick={() => setTtsModel(modelId)}
                  disabled={isSavingTts || isLoadingTtsProviderOptions}
                >
                  {modelId}
                </button>
              ))}
              <button
                type="button"
                className="secondary"
                onClick={() => setTtsModel("")}
                disabled={isSavingTts || isLoadingTtsProviderOptions}
              >
                Custom model id
              </button>
            </div>
          ) : null}
          <p className="llm-field-helper">{getTtsModelHelpText(ttsProvider, activeTtsProviderOptions, selectedTtsProvider?.name)}</p>
        </div>
        </div>

        <div className="llm-actions compact">
          <button type="button" onClick={() => void saveTtsProvider()} disabled={isSavingTts}>
            {isSavingTts ? "Saving..." : "Save Credentials"}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => void disconnectTtsProvider()}
            disabled={!selectedTtsProvider?.connected || isDisconnectingTts}
          >
            {isDisconnectingTts ? "Disconnecting..." : "Disconnect Provider"}
          </button>
        </div>

        {selectedTtsProvider ? (
          <div className="llm-connected info">
            {selectedTtsProvider.name}: {selectedTtsProvider.connected ? "connected" : "not connected"}
            {" | "}Pricing: {selectedTtsProvider.pricingNote}
          </div>
        ) : null}
      </section>

      <section className="settings-section">
        <div className="settings-section-header">
          <span className="settings-section-tag">Optional Kokoro</span>
          <h3>Kokoro Access</h3>
          <p className="settings-section-copy">
            Only use this if the server cannot download Kokoro model files anonymously.
          </p>
        </div>

        <div className="llm-grid">
        <div className="llm-field">
          <label htmlFor="kokoro-hf-token">Hugging Face Token</label>
          <input
            id="kokoro-hf-token"
            type="password"
            autoComplete="off"
            value={kokoroHfToken}
            onChange={(event) => setKokoroHfToken(event.target.value)}
            placeholder={kokoroSettings.connected ? "Saved token on file. Enter a new one only to replace it." : "hf_..."}
            disabled={isSavingKokoroToken || isClearingKokoroToken}
          />
          {kokoroSettings.connected ? <p className="llm-field-helper">Saved token on file: {kokoroSettings.keyHint}</p> : null}
        </div>

        <div className="llm-field">
          <label>Kokoro Token Actions</label>
          <div className="llm-actions compact">
            <button type="button" onClick={() => void saveKokoroAccessToken()} disabled={isSavingKokoroToken || isClearingKokoroToken}>
              {isSavingKokoroToken ? "Saving..." : kokoroSettings.connected ? "Update Token" : "Save Token"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => void clearKokoroAccessToken()}
              disabled={!kokoroSettings.connected || isSavingKokoroToken || isClearingKokoroToken}
            >
              {isClearingKokoroToken ? "Clearing..." : "Clear Token"}
            </button>
          </div>
          <p className="llm-field-helper">Only needed when the server cannot fetch Kokoro model files without authentication.</p>
        </div>

        <div className="llm-field">
          <label htmlFor="kokoro-local-path">Local Model Path</label>
          <input
            id="kokoro-local-path"
            type="text"
            autoComplete="off"
            value={kokoroLocalPath}
            onChange={(event) => setKokoroLocalPath(event.target.value)}
            placeholder={kokoroSettings.localPath ? `Current: ${kokoroSettings.localPath}` : "x:\\kokoro"}
            disabled={isSavingKokoroPath || isClearingKokoroPath}
          />
          {kokoroSettings.localPath ? <p className="llm-field-helper">Current path: {kokoroSettings.localPath}</p> : null}
        </div>

        <div className="llm-field">
          <label>Local Path Actions</label>
          <div className="llm-actions compact">
            <button type="button" onClick={() => void saveKokoroLocalPath()} disabled={isSavingKokoroPath || isClearingKokoroPath}>
              {isSavingKokoroPath ? "Saving..." : "Save Path"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => void clearKokoroLocalPath()}
              disabled={!kokoroSettings.localPath || isSavingKokoroPath || isClearingKokoroPath}
            >
              {isClearingKokoroPath ? "Clearing..." : "Clear Path"}
            </button>
          </div>
          <p className="llm-field-helper">Use this to point to a local Kokoro model directory (e.g., x:\\kokoro) instead of downloading from HuggingFace.</p>
        </div>
        </div>
      </section>
      </>
      ) : null}
    </div>
  );
}
