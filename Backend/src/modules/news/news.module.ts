// modules/news/news.module.ts
// Barrel export — PUBLIC API untuk module News.

// === Use Cases (public) ===
export { FetchNewsUseCase } from "./application/use-cases/FetchNewsUseCase.js";
export { StoreNewsUseCase } from "./application/use-cases/StoreNewsUseCase.js";
export { GetNewsUseCase } from "./application/use-cases/GetNewsUseCase.js";

// === IOC ===
export { registerNewsContainer } from "./ioc/register.js";

// === Public Types ===
export type { NewsArticle } from "./domain/NewsArticle.js";
export type { INewsProvider } from "./domain/INewsProvider.js";
export type { NewsContextPort } from "./domain/NewsContextPort.js";
export type { NewsRepository } from "./domain/NewsRepository.js";
