import type { ServerResponse } from "node:http";

export interface INotifier {
  addClient(userId: string, sessionToken: string, connection: ServerResponse): void;
  broadcastToUser(userId: string, event: string, data: unknown): void;
  broadcastGlobal(event: string, data: unknown): void;
}
