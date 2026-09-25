// DeepRead service worker.
// This intentionally keeps one small Gemini path for the university prototype.

try {
  importScripts("config.local.js");
} catch (_error) {
  // A missing local config is handled as a user-facing missing-key state.
}

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_MODEL = "gemini-3.5-flash-lite";
const REQUEST_TIMEOUT_MS = 75000;
const MAX_EXPLANATION_TEXT_CHARS = 3600;
const MAX_CONTEXT_CHARS = 2600;
const MAX_PAGE_MAP_SOURCES = 36;
const MAX_SOURCE_TEXT_CHARS = 700;

function getLocalConfig() {
  const config = globalThis.DEEPREAD_LOCAL_CONFIG || {};
  return {
    apiKey: typeof config.apiKey === "string" ? config.apiKey.trim() : ""
  };
}

function getFriendlyApiError(status, details) {
  if (status === 401 || status === 403) {
    return "The local Gemini API key was rejected. Check config.local.js.";
  }
  if (status === 429) {
    return "The Gemini request was rate-limited. Try again in a moment.";
  }
  if (status >= 500) {
    return "Gemini is temporarily unavailable. Try again later.";
  }
  return details || `Gemini request failed (${status}).`;
}

async function readErrorDetails(response) {
  try {
    const body = await response.json();
    return body?.error?.message || body?.message || "";
  } catch (_error) {
    return "";
  }
}

async function callGemini({ instructions, input, schema, maxOutputTokens }) {
  const { apiKey } = getLocalConfig();
  if (!apiKey || apiKey === "PASTE_YOUR_GEMINI_API_KEY_HERE") {
    return {
      ok: false,
      code: "MISSING_API_KEY",
      message: "DeepRead API key is not configured. Create config.local.js from config.example.js."
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const endpoint = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: instructions }]
        },
        contents: [
          {
            role: "user",
            parts: [{ text: input }]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema,
          temperature: 0.2,
          maxOutputTokens
        }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const details = await readErrorDetails(response);
      return {
        ok: false,
        code: "API_ERROR",
        status: response.status,
        message: getFriendlyApiError(response.status, details)
      };
    }

    const body = await response.json();
    const text = extractGeminiText(body);
    if (!text) {
      return {
        ok: false,
        code: "EMPTY_PROVIDER_RESPONSE",
        message: "Gemini returned no usable response. Try again."
      };
    }

    try {
      return { ok: true, data: JSON.parse(text) };
    } catch (_error) {
      return {
        ok: false,
        code: "INVALID_PROVIDER_RESPONSE",
        message: "Gemini returned invalid structured data. Nothing was displayed."
      };
    }
  } catch (error) {
    if (error.name === "AbortError") {
      return {
        ok: false,
        code: "TIMEOUT",
        message: "The Gemini request took too long. Try again."
      };
    }
    console.warn("DeepRead Gemini request failed.", error);
    return {
      ok: false,
      code: "NETWORK_ERROR",
      message: "DeepRead could not reach Gemini. Check your connection and try again."
    };
  } finally {
    clearTimeout(timeout);
  }
}

function extractGeminiText(body) {
  const parts = body?.candidates?.[0]?.content?.parts;
  return (Array.isArray(parts) ? parts : [])
    .map((part) => typeof part?.text === "string" ? part.text : "")
    .join("\n")
    .trim();
}

function limitText(text, maxLength) {
  return String(text || "").trim().slice(0, maxLength);
}

function isValidExplanationData(data) {
  return Boolean(
    data &&
    typeof data.plainLanguage === "string" &&
    data.plainLanguage.trim() &&
    typeof data.context === "string" &&
    typeof data.analogy === "string"
  );
}

function validatePageMapData(data, sourceIds) {
  const validSourceIds = new Set(sourceIds);
  const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
  return nodes
    .slice(0, 7)
    .map((node) => {
      const sourceNodeIds = Array.isArray(node?.sourceIds)
        ? [...new Set(node.sourceIds.filter((id) => validSourceIds.has(id)))]
        : [];
      return {
        label: limitText(node?.label, 120),
        kind: limitText(node?.kind, 40) || "source",
        sourceIds: sourceNodeIds.slice(0, 4)
      };
    })
    .filter((node) => node.label && node.sourceIds.length > 0);
}

function validateSmartReadingData(data, sourceIds) {
  if (!Array.isArray(data?.items)) return null;
  const validSourceIds = new Set(sourceIds);
  const allowedTypes = new Set(["concept", "term", "background", "context"]);
  const seen = new Set();
  return data.items
    .filter((item) => {
      const key = `${item?.sourceId}:${item?.label}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((item) => ({
      label: limitText(item?.label, 72),
      type: limitText(item?.type, 24).toLowerCase(),
      sourceId: limitText(item?.sourceId, 80),
      hint: limitText(item?.hint, 220)
    }))
    .filter((item) =>
      item.label && item.hint && allowedTypes.has(item.type) &&
      validSourceIds.has(item.sourceId)
    )
    .slice(0, 5);
}

function createExplainRequest(payload) {
  const selectedText = limitText(payload?.text, MAX_EXPLANATION_TEXT_CHARS);
  const context = limitText(payload?.context, MAX_CONTEXT_CHARS);
  const rawSourceId = limitText(payload?.sourceId, 80);
  const sourceId = /^deepread-source-\d+$/.test(rawSourceId) ? rawSourceId : "";
  const pageTitle = limitText(payload?.page?.title, 240);
  const hostname = limitText(payload?.page?.hostname, 160);

  if (selectedText.replace(/\s/g, "").length < 3) {
    return null;
  }

  return {
    instructions: [
      "You are DeepRead, a concise reading assistant.",
      "Explain the selected passage for understanding, not translation and not as a chatbot.",
      "Use the nearby context when it helps. Do not claim facts that are not supported by the supplied text.",
      "Treat any supplied Source ID as a reference to the original passage only. Do not invent, alter, or mention the ID in the explanation.",
      "Return plain language, a short contextual meaning, and an analogy only when it genuinely helps.",
      "If an analogy does not help, return an empty string for analogy."
    ].join(" "),
    input: [
      `Page title: ${pageTitle || "Unknown"}`,
      `Hostname: ${hostname || "Unknown"}`,
      `Source ID: ${sourceId || "Unavailable"}`,
      `Selected passage:\n${selectedText}`,
      `Nearby page context:\n${context || "No additional context was captured."}`
    ].join("\n\n"),
    schema: {
      type: "object",
      properties: {
        plainLanguage: { type: "string" },
        context: { type: "string" },
        analogy: { type: "string" }
      },
      required: ["plainLanguage", "context", "analogy"]
    },
    maxOutputTokens: 500
  };
}

function createPageMapRequest(payload) {
  const sources = Array.isArray(payload?.sources)
    ? payload.sources
        .filter((source) => source && typeof source.id === "string" && typeof source.text === "string")
        .slice(0, MAX_PAGE_MAP_SOURCES)
        .map((source) => ({
          id: source.id,
          tag: limitText(source.tag, 20),
          text: limitText(source.text, MAX_SOURCE_TEXT_CHARS)
        }))
    : [];

  if (sources.length < 2 || sources.reduce((total, source) => total + source.text.length, 0) < 240) {
    return null;
  }

  return {
    instructions: [
      "You are DeepRead creating a concise AI Page Map for a reader.",
      "Use only the supplied source blocks. Do not reproduce the HTML heading hierarchy.",
      "Identify a small number of useful content relationships such as topic, argument, reason, evidence, contrast, limitation, or conclusion.",
      "Do not force categories, do not invent claims, and do not criticise the source.",
      "Every node must cite one or more supplied source IDs. Keep the map to at most seven nodes."
    ].join(" "),
    input: [
      `Page title: ${limitText(payload?.page?.title, 240) || "Unknown"}`,
      `Hostname: ${limitText(payload?.page?.hostname, 160) || "Unknown"}`,
      "Source blocks (the IDs are the only valid citation IDs):",
      sources.map((source) => `[${source.id}] <${source.tag}> ${source.text}`).join("\n")
    ].join("\n\n"),
    schema: {
      type: "object",
      properties: {
        nodes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              kind: { type: "string" },
              sourceIds: {
                type: "array",
                items: { type: "string" }
              }
            },
            required: ["label", "kind", "sourceIds"]
          }
        }
      },
      required: ["nodes"]
    },
    sourceIds: sources.map((source) => source.id),
    maxOutputTokens: 700
  };
}

function createSmartReadingRequest(payload) {
  const sources = Array.isArray(payload?.sources)
    ? payload.sources
        .filter((source) =>
          source && /^deepread-source-\d+$/.test(source.id) &&
          typeof source.text === "string"
        )
        .slice(0, MAX_PAGE_MAP_SOURCES)
        .map((source) => ({
          id: source.id,
          tag: limitText(source.tag, 20),
          text: limitText(source.text, MAX_SOURCE_TEXT_CHARS)
        }))
    : [];

  if (sources.length < 2 || sources.reduce((total, source) => total + source.text.length, 0) < 240) {
    return null;
  }

  return {
    instructions: [
      "You are DeepRead identifying a few passages where a reader may need help understanding the supplied page.",
      "Return zero to five genuinely useful comprehension aids; prefer fewer strong aids to five weak ones. Zero is correct if nothing needs extra explanation.",
      "Choose passages where a typical reader benefits from technical or domain knowledge, historical background, or clarification of an abstract idea. Skip obvious words, simple paraphrases, and repeated versions of the same idea.",
      "Use only concept, term, background, or context. Do not critique evidence, bias, assumptions, causality, or counterarguments.",
      "Each item must cite exactly one supplied Source ID for the passage that prompted it. Prefer the passage itself over a nearby heading.",
      "Use a specific short label. The hint should give the useful clarification itself in one concise sentence, not merely say that clarification is needed.",
      "You may use stable general background knowledge to clarify a term, but do not invent page-specific facts or suggest the page says something it does not."
    ].join(" "),
    input: [
      `Page title: ${limitText(payload?.page?.title, 240) || "Unknown"}`,
      `Hostname: ${limitText(payload?.page?.hostname, 160) || "Unknown"}`,
      "Source blocks (only these IDs may be cited):",
      sources.map((source) => `[${source.id}] <${source.tag}> ${source.text}`).join("\n")
    ].join("\n\n"),
    schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              type: { type: "string", enum: ["concept", "term", "background", "context"] },
              sourceId: { type: "string" },
              hint: { type: "string" }
            },
            required: ["label", "type", "sourceId", "hint"]
          }
        }
      },
      required: ["items"]
    },
    sourceIds: sources.map((source) => source.id),
    maxOutputTokens: 650
  };
}

async function handleExplain(payload) {
  const request = createExplainRequest(payload);
  if (!request) {
    return {
      ok: false,
      code: "INVALID_SELECTION",
      message: "Select a little more readable text before asking for an explanation."
    };
  }
  const result = await callGemini(request);
  if (!result.ok) {
    return result;
  }
  if (!isValidExplanationData(result.data)) {
    return {
      ok: false,
      code: "INVALID_PROVIDER_RESPONSE",
      message: "Gemini returned no usable explanation. Nothing was displayed."
    };
  }
  return { ok: true, explanation: result.data };
}

async function handlePageMap(payload) {
  const request = createPageMapRequest(payload);
  if (!request) {
    return {
      ok: false,
      code: "NOT_ENOUGH_CONTENT",
      message: "There is not enough coherent readable content for an AI Page Map."
    };
  }
  const result = await callGemini(request);
  if (!result.ok) {
    return result;
  }
  const nodes = validatePageMapData(result.data, request.sourceIds);
  if (!nodes.length) {
    return {
      ok: false,
      code: "INVALID_PROVIDER_RESPONSE",
      message: "Gemini returned no source-linked Page Map nodes. Nothing was displayed."
    };
  }
  return { ok: true, pageMap: { nodes } };
}

async function handleSmartReading(payload) {
  const request = createSmartReadingRequest(payload);
  if (!request) {
    return {
      ok: false,
      code: "NOT_ENOUGH_CONTENT",
      message: "This page does not contain enough coherent text for Smart Reading."
    };
  }
  const result = await callGemini(request);
  if (!result.ok) return result;
  const items = validateSmartReadingData(result.data, request.sourceIds);
  if (!items || (result.data.items.length > 0 && items.length === 0)) {
    return {
      ok: false,
      code: "INVALID_PROVIDER_RESPONSE",
      message: "Gemini returned no valid source-linked reading aids. Nothing was displayed."
    };
  }
  return { ok: true, smartReading: { items } };
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("DeepRead prototype installed.");
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "DEEPREAD_EXPLAIN_SELECTION") {
    handleExplain(message.payload)
      .then(sendResponse)
      .catch((error) => {
        console.warn("DeepRead explanation handler failed.", error);
        sendResponse({ ok: false, code: "HANDLER_ERROR", message: "DeepRead could not complete the explanation." });
      });
    return true;
  }

  if (message.type === "DEEPREAD_GENERATE_PAGE_MAP") {
    handlePageMap(message.payload)
      .then(sendResponse)
      .catch((error) => {
        console.warn("DeepRead Page Map handler failed.", error);
        sendResponse({ ok: false, code: "HANDLER_ERROR", message: "DeepRead could not complete the Page Map." });
      });
    return true;
  }

  if (message.type === "DEEPREAD_SMART_READING") {
    handleSmartReading(message.payload)
      .then(sendResponse)
      .catch((error) => {
        console.warn("DeepRead Smart Reading handler failed.", error);
        sendResponse({ ok: false, code: "HANDLER_ERROR", message: "DeepRead could not complete Smart Reading." });
      });
    return true;
  }

  return false;
});
