import { stripThinkingTags, createThinkingStreamFilter } from "@domain/services/thinkingFilter.js";
import { logger } from "@core/logging/logger.js";
import { env } from "@config/env";
import { AiMessage } from "@application/ports/index.js";

const BASE_URL = env.AI_BASE_URL;
const API_KEY = env.AI_API_KEY;
const REQUEST_TIMEOUT_MS = env.AI_REQUEST_TIMEOUT_MS;
const STREAM_TIMEOUT_MS = env.AI_STREAM_TIMEOUT_MS;
const AI_DEBUG_LOGGING = env.AI_DEBUG_LOGGING;

function debugLogPayload(context: string, fullMessages: any[]) {
  if (!AI_DEBUG_LOGGING) return;
  const summary = fullMessages.map((msg) => {
    if (!Array.isArray(msg.content)) {
      return { role: msg.role, type: "text", length: (msg.content || "").length };
    }
    return {
      role: msg.role,
      parts: msg.content.map((part: any) => {
        if (part.type === "image_url") {
          const url = part.image_url?.url || "";
          const prefixMatch = url.match(/^data:([^;]+);base64,/);
          return {
            type: "image_url",
            mediaTypePrefix: prefixMatch?.[1] || "(not data: URI)",
            base64Length: url.length,
          };
        }
        return { type: part.type, length: (part.text || "").length };
      }),
    };
  });
  logger.debug(`[AI_DEBUG] outgoing payload (${context})`, { summary });
}

function debugLogResponse(context: string, data: any) {
  if (!AI_DEBUG_LOGGING) return;
  logger.debug(`[AI_DEBUG] gateway response (${context})`, {
    usage: data.usage ?? null,
    finishReason: data.choices?.[0]?.finish_reason ?? null,
    replyPreview: (data.choices?.[0]?.message?.content || "").slice(0, 200),
  });
}

export class AiGatewayClient {
  async callModel(params: {
    model: string;
    maxTokens: number;
    system: string;
    messages: AiMessage[];
  }): Promise<{ text: string; usage?: { inputTokens: number; outputTokens: number } }> {
    if (!BASE_URL) throw new Error("AI_BASE_URL not set");

    const fullMessages = params.system
      ? [{ role: "system", content: params.system }, ...params.messages]
      : params.messages;

    debugLogPayload("callModel", fullMessages);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
        },
        body: JSON.stringify({
          model: params.model,
          max_tokens: params.maxTokens,
          messages: fullMessages,
          stream: false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

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
        usage: data.usage
          ? { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens }
          : undefined,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError" || err.name === "TimeoutError") {
        throw new Error(`AI provider timeout after ${REQUEST_TIMEOUT_MS}ms`);
      }
      throw err;
    }
  }

  async streamModel(params: {
    model: string;
    maxTokens: number;
    system: string;
    messages: AiMessage[];
    onToken: (token: string) => void;
    signal?: AbortSignal;
  }): Promise<{ text: string; usage?: { inputTokens: number; outputTokens: number } }> {
    if (!BASE_URL) throw new Error("AI_BASE_URL not set");

    const fullMessages = params.system
      ? [{ role: "system", content: params.system }, ...params.messages]
      : params.messages;

    debugLogPayload("streamModel", fullMessages);

    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), STREAM_TIMEOUT_MS);

    const combinedSignal = params.signal
      ? AbortSignal.any([params.signal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
        },
        body: JSON.stringify({
          model: params.model,
          max_tokens: params.maxTokens,
          messages: fullMessages,
          stream: true,
        }),
        signal: combinedSignal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`AI provider error ${res.status}: ${errText}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      let usage: any = null;

      const thinkingFilter = createThinkingStreamFilter((clean) => {
        fullText += clean;
        params.onToken(clean);
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;

          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]") continue;

          try {
            const json = JSON.parse(payload);
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) thinkingFilter.feed(delta);
            if (json.usage) usage = json.usage;
          } catch {
            // Incomplete JSON, ignore
          }
        }
      }

      thinkingFilter.flush();

      return {
        text: fullText,
        usage: usage
          ? { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens }
          : undefined,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        throw new Error(`AI provider timeout after ${STREAM_TIMEOUT_MS}ms`);
      }
      throw err;
    }
  }
}