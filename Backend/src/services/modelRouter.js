import { resolveModel } from "../config/models.js";
import { callModel, streamModel } from "./aiClient.js";
import { getCached, setCached, CACHEABLE_TASK_TYPES } from "./faqCache.js";
import { logger } from "../utils/logger.js";

const SYSTEM_PROMPTS = {
  faq: "Kamu adalah asisten FAQ trading forex bernama BETRIX. Jawab singkat, jelas, dan akurat " +
    "soal istilah trading, cara kerja indikator, atau konsep dasar forex. " +
    "Format jawaban dalam paragraf natural tanpa list berlebihan kecuali diperlukan.",
  trade_reasoning:
    "Kamu adalah reasoning engine untuk Expert Advisor forex. Jelaskan alasan " +
    "di balik sebuah sinyal/keputusan trading secara terstruktur (kondisi pasar, " +
    "indikator yang relevan, level support/resistance), gaya log teknis yang ringkas. " +
    "Jangan pernah pastikan pergerakan harga di masa depan sebagai kepastian.",
  risk_narrative:
    "Kamu adalah analis manajemen risiko untuk posisi trading forex. Jelaskan risiko " +
    "sebuah posisi/strategi secara jujur dan seimbang — ukuran lot, stop loss, exposure, " +
    "drawdown potensial — tanpa melebih-lebihkan atau meremehkan.",
  market_insight:
    "Kamu adalah analis pasar forex. Berikan insight singkat berbasis data yang " +
    "diberikan (harga, indikator, sesi trading), hindari klaim pasti soal arah harga " +
    "di masa depan.",
  quick_summary: "Ringkas informasi berikut (berita/log trading) secara singkat dan jelas.",
  classify_signal:
    "Klasifikasikan sinyal trading berikut ke salah satu: BUY, SELL, HOLD, atau " +
    "NO_ACTION. Jawab hanya label kategorinya saja.",
};

export async function routeAndCall({ taskType, messages }) {
  const model = resolveModel(taskType);
  const system = SYSTEM_PROMPTS[taskType] || SYSTEM_PROMPTS.faq;

  const lastMessage = messages[messages.length - 1]?.content || "";
  const isCacheable = CACHEABLE_TASK_TYPES.includes(taskType) && messages.length === 1;

  if (isCacheable) {
    const cached = getCached(taskType, lastMessage);
    if (cached) {
      logger.debug(`[modelRouter] cache HIT task=${taskType}`);
      return {
        text: cached.text,
        modelUsed: cached.modelUsed,
        latencyMs: 0,
        usage: cached.usage,
        cached: true,
      };
    }
  }

  const start = Date.now();
  const result = await callModel({
    model: model.id,
    maxTokens: model.maxTokens,
    system,
    messages,
  });
  const latencyMs = Date.now() - start;

  logger.debug(
    `[modelRouter] task=${taskType} model=${model.id} latency=${latencyMs}ms ` +
      `tokens_in=${result.usage?.input_tokens ?? "?"} tokens_out=${
        result.usage?.output_tokens ?? "?"
      }`
  );

  if (isCacheable) {
    setCached(taskType, lastMessage, {
      text: result.text,
      modelUsed: model.id,
      usage: result.usage,
    });
  }

  return {
    text: result.text,
    modelUsed: model.id,
    latencyMs,
    usage: result.usage,
  };
}

export async function routeAndStream({ taskType, messages, onToken, signal }) {
  const model = resolveModel(taskType);
  const system = SYSTEM_PROMPTS[taskType] || SYSTEM_PROMPTS.faq;

  const start = Date.now();
  const result = await streamModel({
    model: model.id,
    maxTokens: model.maxTokens,
    system,
    messages,
    onToken,
    signal,
  });
  const latencyMs = Date.now() - start;

  logger.debug(
    `[modelRouter:stream] task=${taskType} model=${model.id} latency=${latencyMs}ms ` +
      `tokens_in=${result.usage?.input_tokens ?? "?"} tokens_out=${
        result.usage?.output_tokens ?? "?"
      }`
  );

  return {
    text: result.text,
    modelUsed: model.id,
    latencyMs,
    usage: result.usage,
  };
}
