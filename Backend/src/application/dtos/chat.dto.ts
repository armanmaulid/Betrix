import { z } from "zod";

export const chatTaskTypeSchema = z.enum([
  "general",
  "trade_reasoning",
  "risk_narrative",
  "market_insight",
  "quick_summary",
  "classify_signal",
]);

export const modelTierSchema = z.enum(["cheap", "balanced", "deep"]);

export const sendMessageDto = z.object({
  message: z.string().min(1).max(8000),
  taskType: chatTaskTypeSchema.default("general"),
  displayMessage: z.string().optional(),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
  })).max(20).optional(),
  sessionId: z.string().uuid().optional(),
  tier: modelTierSchema.optional(),
  image: z.string().nullish(),
});

export const getHistoryDto = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  taskType: chatTaskTypeSchema.optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
});

export const deleteSessionDto = z.object({
  sessionId: z.string().uuid(),
});

export const exportHistoryDto = z.object({
  format: z.enum(["json", "csv"]).default("json"),
  taskType: chatTaskTypeSchema.optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
});

export type SendMessageDto = z.infer<typeof sendMessageDto>;
export type GetHistoryDto = z.infer<typeof getHistoryDto>;
export type DeleteSessionDto = z.infer<typeof deleteSessionDto>;
export type ExportHistoryDto = z.infer<typeof exportHistoryDto>;