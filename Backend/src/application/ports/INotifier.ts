export interface INotifier {
  addClient(userId: string, sessionToken: string, connection: any): void;
  broadcastToUser(userId: string, event: string, data: unknown): void;
  broadcastGlobal(event: string, data: unknown): void;
}
