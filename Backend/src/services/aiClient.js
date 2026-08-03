import { stripThinkingTags, createThinkingStreamFilter } from "./thinkingFilter.js";
import { logger } from "../utils/logger.js";

const BASE_URL = process.env.AI_BASE_URL;
const API_KEY = process.env.AI_API_KEY;

const REQUEST_TIMEOUT_MS = parseInt(process.env.AI_REQUEST_TIMEOUT_MS) || 30000;

// DEBUG (investigasi "gambar tidak dilihat LLM"): aktifkan lewat
// AI_DEBUG_LOGGING=true di .env. Sengaja tidak nge-log base64 penuh (bisa
// puluhan ribu karakter dan berisi data gambar user) -- cuma metadata yang
// cukup untuk memastikan image_url beneran terkirim & diproses gateway.
const AI_DEBUG_LOGGING = process.env.AI_DEBUG_LOGGING === "true";

function debugLogPayload(context, fullMessages) {
  if (!AI_DEBUG_LOGGING) return;
  const summary = fullMessages.map((msg) => {
    if (!Array.isArray(msg.content)) {
      return { role: msg.role, type: "text", length: (msg.content || "").length };
    }
    return {
      role: msg.role,
      parts: msg.content.map((part) => {
        if (part.type === "image_url") {
          const url = part.image_url?.url || "";
          const prefixMatch = url.match(/^data:([^;]+);base64,/);
          return {
            type: "image_url",
            mediaTypePrefix: prefixMatch?.[1] || "(bukan data: URI!)",
            base64Length: url.length,
          };
        }
        return { type: part.type, length: (part.text || "").length };
      }),
    };
  });
  logger.debug(`[AI_DEBUG] outgoing payload (${context})`, { summary });
}

function debugLogResponse(context, data) {
  if (!AI_DEBUG_LOGGING) return;
  logger.debug(`[AI_DEBUG] gateway response (${context})`, {
    usage: data.usage ?? null,
    finishReason: data.choices?.[0]?.finish_reason ?? null,
    replyPreview: (data.choices?.[0]?.message?.content || "").slice(0, 200),
  });
}

export async function callModel({ model, maxTokens = 1024, messages, system }) {
  if (!BASE_URL) {
    throw new Error("AI_BASE_URL belum diset di .env");
  }

  const fullMessages = system
    ? [{ role: "system", content: system }, ...messages]
    : messages;

  debugLogPayload("callModel", fullMessages);

  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: fullMessages,
        stream: false,
      }),
      signal: timeoutSignal,
    });
  } catch (err) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      throw new Error(`AI provider timeout setelah ${REQUEST_TIMEOUT_MS}ms`);
    }
    throw err;
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`AI provider error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  debugLogResponse("callModel", data);

  const rawText = data.choices?.[0]?.message?.content ?? "";
  const text = stripThinkingTags(rawText);

  return {
    text,
    raw: data,
    usage: data.usage
      ? {
          input_tokens: data.usage.prompt_tokens,
          output_tokens: data.usage.completion_tokens,
        }
      : null,
  };
}

const STREAM_TIMEOUT_MS = parseInt(process.env.AI_STREAM_TIMEOUT_MS) || 60000;

function combineSignals(signals) {
  const controller = new AbortController();
  const cleanups = [];
  for (const s of signals) {
    if (!s) continue;
    if (s.aborted) {
      controller.abort(s.reason);
      break;
    }
    const onAbort = () => controller.abort(s.reason);
    s.addEventListener("abort", onAbort, { once: true });
    cleanups.push(() => s.removeEventListener("abort", onAbort));
  }
  return { signal: controller.signal, cleanup: () => cleanups.forEach(fn => fn()) };
}

export async function streamModel({ model, maxTokens = 1024, messages, system, onToken, signal }) {
  if (!BASE_URL) {
    throw new Error("AI_BASE_URL belum diset di .env");
  }

  const fullMessages = system
    ? [{ role: "system", content: system }, ...messages]
    : messages;

  debugLogPayload("streamModel", fullMessages);

  const timeoutSignal = AbortSignal.timeout(STREAM_TIMEOUT_MS);
  const { signal: combinedSignal, cleanup: cleanupSignals } = combineSignals([signal, timeoutSignal]);

  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: fullMessages,
        stream: true,
      }),
      signal: combinedSignal,
    });

    if (!res.ok) {
      const errText = await res.text();
      if (AI_DEBUG_LOGGING) {
        logger.debug("[AI_DEBUG] gateway error response (streamModel)", {
          status: res.status,
          body: errText.slice(0, 2000),
        });
      }
      throw new Error(`AI provider error ${res.status}: ${errText}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";
    let usage = null;

    const thinkingFilter = createThinkingStreamFilter((clean) => {
      fullText += clean;
      onToken?.(clean);
    });

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;

        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") continue;

        try {
          const json = JSON.parse(payload);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            thinkingFilter.feed(delta);
          }
          if (json.usage) usage = json.usage;
        } catch {
          // baris tengah-tengah JSON yang belum lengkap, abaikan saja
        }
      }
    }

    thinkingFilter.flush();

    if (AI_DEBUG_LOGGING) {
      logger.debug("[AI_DEBUG] gateway stream finished", {
        rawUsage: usage,
        replyPreview: fullText.slice(0, 200),
      });
    }

    return {
      text: fullText,
      usage: usage
        ? { input_tokens: usage.prompt_tokens, output_tokens: usage.completion_tokens }
        : null,
    };
  } finally {
    cleanupSignals();
  }
}

