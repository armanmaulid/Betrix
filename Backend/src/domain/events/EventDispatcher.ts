import { injectable } from "tsyringe";
import { EventEmitter } from "events";
import { DomainEvent } from "./index.js";
import { logger } from "@infrastructure/observability/logger.js";

const log = logger.child({ module: "shared", component: "EventDispatcher" });

@injectable()
export class EventDispatcher {
  private emitter = new EventEmitter();

  register<T extends DomainEvent>(eventName: string, handler: (event: T) => void | Promise<void>) {
    this.emitter.on(eventName, async (event: T) => {
      try {
        await handler(event);
      } catch (err) {
        log.error("Error handling event", { error: err, eventName, eventId: event.eventId });
      }
    });
  }

  dispatch(event: DomainEvent) {
    this.emitter.emit(event.type, event);
  }
}
