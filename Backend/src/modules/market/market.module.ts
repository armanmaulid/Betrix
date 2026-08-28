// modules/market/market.module.ts
// Barrel export — PUBLIC API untuk module Market (symbols, calendar, market data).

// === Use Cases (public) ===
export { GetSymbolsUseCase } from "./application/use-cases/GetSymbolsUseCase.js";
export { GetCalendarUseCase } from "./application/use-cases/GetCalendarUseCase.js";

// === IOC ===
export { registerMarketContainer } from "./ioc/register.js";

// === Public Types ===
export type { BrokerSymbol } from "@domain/entities/BrokerSymbol.js";
export type { CalendarEvent } from "@domain/entities/CalendarEvent.js";
