export async function readApiResponsePayload(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { rawText: text };
  }
}

export function getApiErrorMessage(response, payload, fallback = "Request failed.") {
  if (payload && typeof payload === "object" && typeof payload.error === "string" && payload.error.trim()) {
    return payload.error.trim();
  }

  if (payload && typeof payload === "object" && typeof payload.rawText === "string") {
    if (/^\s*</.test(payload.rawText)) {
      return `${fallback} Server returned an HTML error page (${response.status}). Check backend or reverse-proxy logs.`;
    }

    const compact = payload.rawText.trim();
    if (compact) {
      return compact;
    }
  }

  return fallback;
}