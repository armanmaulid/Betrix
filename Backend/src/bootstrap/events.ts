import { container } from "tsyringe";
import type { EventDispatcher, ChatCompleted } from "@domain/events/index.js";
import { ChatLoggingHandler } from "@modules/chat/application/event-handlers/ChatLoggingHandler.js";

export function registerEventHandlers() {
  // Resolve via string token — must match the @inject("EventDispatcher") token
  // used by use cases, otherwise tsyringe returns a separate (class-token)
  // instance whose listeners never receive dispatched events.
  const dispatcher = container.resolve<EventDispatcher>("EventDispatcher");

  // Register handlers
  const chatLoggingHandler = container.resolve(ChatLoggingHandler);

  dispatcher.register<ChatCompleted>("chat.completed", (event) => chatLoggingHandler.handle(event));

  // You can register more handlers for chat.completed here in the future
  // dispatcher.register<ChatCompleted>("chat.completed", ...);
}
