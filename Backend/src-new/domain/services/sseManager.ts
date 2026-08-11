interface SSEClient {
  userId: string;
  sessionToken: string;
  response: any; // ServerResponse
}

const clients = new Map<string, SSEClient[]>(); // userId -> clients[]

export function addClient(userId: string, sessionToken: string, response: any): void {
  if (!clients.has(userId)) {
    clients.set(userId, []);
  }
  clients.get(userId)!.push({ userId, sessionToken, response });

  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });
  response.write("event: connected\ndata: {\"status\":\"ok\"}\n\n");

  response.on("close", () => removeClient(userId, sessionToken));
}

export function removeClient(userId: string, sessionToken: string): void {
  const userClients = clients.get(userId);
  if (userClients) {
    const idx = userClients.findIndex(c => c.sessionToken === sessionToken);
    if (idx !== -1) userClients.splice(idx, 1);
    if (userClients.length === 0) clients.delete(userId);
  }
}

export function broadcastToUser(userId: string, event: string, data: unknown): void {
  const userClients = clients.get(userId);
  if (!userClients) return;

  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  
  for (const client of userClients) {
    try {
      client.response.write(message);
    } catch {
      removeClient(userId, client.sessionToken);
    }
  }
}

export function broadcastToSession(userId: string, sessionToken: string, event: string, data: unknown): void {
  const userClients = clients.get(userId);
  if (!userClients) return;

  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  
  for (const client of userClients) {
    if (client.sessionToken === sessionToken) {
      try {
        client.response.write(message);
      } catch {
        removeClient(userId, sessionToken);
      }
      break;
    }
  }
}

export function sendHeartbeat(): void {
  for (const [userId, userClients] of clients) {
    for (const client of userClients) {
      try {
        client.response.write(": heartbeat\n\n");
      } catch {
        removeClient(userId, client.sessionToken);
      }
    }
  }
}

export function broadcastGlobal(event: string, data: unknown): void {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [userId, userClients] of clients) {
    for (const client of userClients) {
      try {
        client.response.write(message);
      } catch {
        removeClient(userId, client.sessionToken);
      }
    }
  }
}