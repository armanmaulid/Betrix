import { logger } from "@core/logging/logger.js";

interface SSEClient {
  userId: string;
  sessionToken: string;
  response: any; // ServerResponse
}

const MAX_SSE_CONNECTIONS_PER_USER = 5;
const clients = new Map<string, SSEClient[]>(); // userId -> clients[]

export function addClient(userId: string, sessionToken: string, response: any): void {
  if (!clients.has(userId)) {
    clients.set(userId, []);
  }

  const userClients = clients.get(userId)!;

  // Evict oldest connections if at limit
  while (userClients.length >= MAX_SSE_CONNECTIONS_PER_USER) {
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

  response.on("close", () => removeClientByResponse(userId, response));
}

export function removeClientByResponse(userId: string, response: any): void {
  const userClients = clients.get(userId);
  if (userClients) {
    const idx = userClients.findIndex(c => c.response === response);
    if (idx !== -1) userClients.splice(idx, 1);
    if (userClients.length === 0) clients.delete(userId);
  }
}

export function broadcastToUser(userId: string, event: string, data: unknown): void {
  const userClients = clients.get(userId);
  if (!userClients) return;

  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  
  const deadClients: any[] = [];
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
  
  deadClients.forEach(res => removeClientByResponse(userId, res));
}

export function sendHeartbeat(): void {
  for (const [userId, userClients] of clients) {
    const deadClients: any[] = [];
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
    deadClients.forEach(res => removeClientByResponse(userId, res));
  }
}

export function broadcastGlobal(event: string, data: unknown): void {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [userId, userClients] of clients) {
    const deadClients: any[] = [];
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
    deadClients.forEach(res => removeClientByResponse(userId, res));
  }
}