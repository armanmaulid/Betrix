// modules/chat/chat.module.ts
// Barrel export — PUBLIC API untuk module Chat (AI chat orchestration).
// Module lain hanya boleh import dari file ini.

// === Use Cases (public) ===
export { SendMessageUseCase } from "./application/use-cases/SendMessageUseCase.js";
export { StreamMessageUseCase } from "./application/use-cases/StreamMessageUseCase.js";
export { GetChatHistoryUseCase } from "./application/use-cases/GetChatHistoryUseCase.js";
export { DeleteChatSessionUseCase } from "./application/use-cases/DeleteChatSessionUseCase.js";
export { ExportChatHistoryUseCase } from "./application/use-cases/ExportChatHistoryUseCase.js";

// === IOC ===
export { registerChatContainer } from "./ioc/register.js";

// === Public Types ===
export type { ChatMessage } from "@domain/entities/ChatMessage.js";

// === Public Domain Events ===
export type { ChatCompleted } from "@domain/events/index.js";
