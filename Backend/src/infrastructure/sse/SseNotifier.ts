import { injectable, singleton } from "tsyringe";
import type { ServerResponse } from "node:http";
import { logger } from "@core/logging/logger.js";
import { INotifier } from "@domain/ports/INotifier.js";

interface SSEClient {
  userId: string;
  sessionToken: string;
  response: ServerResponse;
}

@injectable()
@singleton()
export class SseNotifier implements INotifier {
  private readonly MAX_SSE_CONNECTIONS_PER_USER = 5;
  private clients = new Map<string, SSEClient[]>(); // userId -> clients[]

  addClient(userId: string, sessionToken: string, response: ServerResponse): void {
    if (!this.clients.has(userId)) {
      this.clients.set(userId, []);
    }

    const userClients = this.clients.get(userId)!;

    // Evict oldest connections if at limit
    while (userClients.length >= this.MAX_SSE_CONNECTIONS_PER_USER) {
      const oldest = userClients.shift()!;
      try {
        oldest.response.write(
          `event: evicted\ndata: ${JSON.stringify({ reason: "max_connections_reached" })}\n\n`
        );
        oldest.response.end();
      } catch {
        // Client may already be disconnected, ignore
      }
    }

    userClients.push({ userId, sessionToken, response });

    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });
    response.write("event: connected\ndata: {\"status\":\"ok\"}\n\n");

    response.on("close", () => this.removeClientByResponse(userId, response));
  }

  removeClientByResponse(userId: string, response: ServerResponse): void {
    const userClients = this.clients.get(userId);
    if (userClients) {
      const idx = userClients.findIndex(c => c.response === response);
      if (idx !== -1) userClients.splice(idx, 1);
      if (userClients.length === 0) this.clients.delete(userId);
    }
  }

  broadcastToUser(userId: string, event: string, data: unknown): void {
    const userClients = this.clients.get(userId);
    if (!userClients) return;

    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    
    const deadClients: ServerResponse[] = [];
    for (const client of userClients) {
      try {
        client.response.write(message);
      } catch (err) {
        logger.warn("SSE client write failed, removing client", {
          userId,
          event,
          error: (err as Error).message,
        });
        deadClients.push(client.response);
      }
    }
    
    deadClients.forEach(res => this.removeClientByResponse(userId, res));
  }

  sendHeartbeat(): void {
    for (const [userId, userClients] of this.clients) {
      const deadClients: ServerResponse[] = [];
      for (const client of userClients) {
        try {
          client.response.write(": heartbeat\n\n");
        } catch (err) {
          logger.warn("SSE heartbeat write failed, removing client", {
            userId,
            error: (err as Error).message,
          });
          deadClients.push(client.response);
        }
      }
      deadClients.forEach(res => this.removeClientByResponse(userId, res));
    }
  }

  broadcastGlobal(event: string, data: unknown): void {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const [userId, userClients] of this.clients) {
      const deadClients: ServerResponse[] = [];
      for (const client of userClients) {
        try {
          client.response.write(message);
        } catch (err) {
          logger.warn("SSE global broadcast write failed, removing client", {
            userId,
            event,
            error: (err as Error).message,
          });
          deadClients.push(client.response);
        }
      }
      deadClients.forEach(res => this.removeClientByResponse(userId, res));
    }
  }
}
