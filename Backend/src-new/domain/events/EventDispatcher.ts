import { injectable } from "tsyringe";
import { EventEmitter } from "events";
import { DomainEvent } from "./index.js";

@injectable()
export class EventDispatcher {
  private emitter = new EventEmitter();

  register<T extends DomainEvent>(eventName: string, handler: (event: T) => void | Promise<void>) {
    this.emitter.on(eventName, async (event: T) => {
      try {
        await handler(event);
      } catch (err) {
        console.error(`[EventDispatcher] Error handling event ${eventName}:`, err);
      }
    });
  }

  dispatch(event: DomainEvent) {
    this.emitter.emit(event.type, event);
  }
}
