import { container } from "tsyringe";
import { EventDispatcher } from "@domain/events/index.js";
import { ChatLoggingHandler } from "@application/event-handlers/ChatLoggingHandler.js";
import { ChatCompleted } from "@domain/events/index.js";

export function registerEventHandlers() {
  const dispatcher = container.resolve(EventDispatcher);
  
  // Register handlers
  const chatLoggingHandler = container.resolve(ChatLoggingHandler);
  
  dispatcher.register<ChatCompleted>("chat.completed", (event) => chatLoggingHandler.handle(event));
  
  // You can register more handlers for chat.completed here in the future
  // dispatcher.register<ChatCompleted>("chat.completed", ...);
}
