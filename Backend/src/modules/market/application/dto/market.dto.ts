import { z } from "zod";

export const getMarketDataDto = z.object({
  symbols: z.string().optional(),
  timeframe: z.enum(["1m", "5m", "15m", "30m", "1h", "4h", "1d"]).default("1h"),
  limit: z.coerce.number().min(1).max(1000).default(100),
});

export const getSymbolsDto = z.object({
  category: z.string().optional(),
  active: z.coerce.boolean().default(true),
});

export const getCalendarDto = z.object({
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  country: z.string().optional(),
  currency: z.string().optional(),
  importance: z.enum(["none", "low", "medium", "high"]).optional(),
  limit: z.coerce.number().min(1).max(500).default(100),
});

export type GetMarketDataDto = z.infer<typeof getMarketDataDto>;
export type GetSymbolsDto = z.infer<typeof getSymbolsDto>;
export type GetCalendarDto = z.infer<typeof getCalendarDto>;