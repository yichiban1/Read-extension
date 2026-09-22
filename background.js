// DeepRead service worker.
// This intentionally keeps one small provider path for the university prototype.

try {
  importScripts("config.local.js");
} catch (_error) {
  // A missing local config is handled as a user-facing missing-key state.
}

const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5-mini";
const REQUEST_TIMEOUT_MS = 45000;
const MAX_EXPLANATION_TEXT_CHARS = 3600;
const MAX_CONTEXT_CHARS = 2600;
const MAX_PAGE_MAP_SOURCES = 36;
const MAX_SOURCE_TEXT_CHARS = 700;

function getLocalConfig() {
  const config = globalThis.DEEPREAD_LOCAL_CONFIG || {};
  return {
    apiKey: typeof config.apiKey === "string" ? config.apiKey.trim() : "",
    model: typeof config.model === "string" && config.model.trim()
      ? config.model.trim()
      : DEFAULT_MODEL
  };
}

function getFriendlyApiError(status, details) {
  if (status === 401 || status === 403) {
    return "The local OpenAI API key was rejected. Check config.local.js.";
  }
  if (status === 429) {
    return "The OpenAI request was rate-limited. Try again in a moment.";
  }
  if (status >= 500) {
    return "OpenAI is temporarily unavailable. Try again later.";
  }
  return details || `OpenAI request failed (${status}).`;
}

async function readErrorDetails(response) {
  try {
    const body = await response.json();
    return body?.error?.message || body?.message || "";
  } catch (_error) {
    return "";
  }
}

async function callOpenAI({ instructions, input, schemaName, schema, maxOutputTokens }) {
  const { apiKey, model } = getLocalConfig();
  if (!apiKey || apiKey === "PASTE_YOUR_OPENAI_API_KEY_HERE") {
    return {
      ok: false,
      code: "MISSING_API_KEY",
      message: "DeepRead API key is not configured. Create config.local.js from config.example.js."
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        store: false,
        instructions,
        input,
        max_output_tokens: maxOutputTokens,
        text: {
          format: {
            type: "json_schema",
            name: schemaName,
            strict: true,
            schema
          }
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
    const text = extractResponseText(body);
    if (!text) {
      return {
        ok: false,
        code: "EMPTY_PROVIDER_RESPONSE",
        message: "OpenAI returned no usable response. Try again."
      };
    }

    try {
      return { ok: true, data: JSON.parse(text) };
    } catch (_error) {
      return {
        ok: false,
        code: "INVALID_PROVIDER_RESPONSE",
        message: "OpenAI returned an invalid structured response. Nothing was displayed."
      };
    }
  } catch (error) {
    if (error.name === "AbortError") {
      return {
        ok: false,
        code: "TIMEOUT",
        message: "The OpenAI request took too long. Try again."
      };
    }
    console.warn("DeepRead OpenAI request failed.", error);
    return {
      ok: false,
      code: "NETWORK_ERROR",
      message: "DeepRead could not reach OpenAI. Check your connection and try again."
    };
  } finally {
    clearTimeout(timeout);
  }
}

function extractResponseText(body) {
  if (typeof body?.output_text === "string" && body.output_text.trim()) {
    return body.output_text.trim();
  }

  const outputText = [];
  for (const item of Array.isArray(body?.output) ? body.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        outputText.push(content.text);
      }
    }
  }
  return outputText.join("\n").trim();
}

function limitText(text, maxLength) {
  return String(text || "").trim().slice(0, maxLength);
}

function createExplainRequest(payload) {
  const selectedText = limitText(payload?.text, MAX_EXPLANATION_TEXT_CHARS);
  const context = limitText(payload?.context, MAX_CONTEXT_CHARS);
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
      "Return plain language, a short contextual meaning, and an analogy only when it genuinely helps.",
      "If an analogy does not help, return an empty string for analogy."
    ].join(" "),
    input: [
      `Page title: ${pageTitle || "Unknown"}`,
      `Hostname: ${hostname || "Unknown"}`,
      `Selected passage:\n${selectedText}`,
      `Nearby page context:\n${context || "No additional context was captured."}`
    ].join("\n\n"),
    schemaName: "deepread_explanation",
    schema: {
      type: "object",
      additionalProperties: false,
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
    schemaName: "deepread_page_map",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        nodes: {
          type: "array",
          minItems: 1,
          maxItems: 7,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              label: { type: "string" },
              kind: { type: "string" },
              sourceIds: {
                type: "array",
                minItems: 1,
                maxItems: 4,
                items: { type: "string" }
              }
            },
            required: ["label", "kind", "sourceIds"]
          }
        }
      },
      required: ["nodes"]
    },
    maxOutputTokens: 700
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
  const result = await callOpenAI(request);
  return result.ok ? { ok: true, explanation: result.data } : result;
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
  const result = await callOpenAI(request);
  return result.ok ? { ok: true, pageMap: result.data } : result;
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

  return false;
});
