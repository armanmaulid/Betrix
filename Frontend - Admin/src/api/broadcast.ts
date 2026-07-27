import { apiClient } from "./client";

export interface BroadcastPayload {
  subject: string;
  body: string;
  recipients: "all" | string[]; // "all" or array of user IDs
}

export interface BroadcastResponse {
  message: string;
  recipientCount: number;
  emailsSent: number;
}

export async function sendBroadcast(payload: BroadcastPayload): Promise<BroadcastResponse> {
  const { data } = await apiClient.post<BroadcastResponse>("/admin/broadcast", payload);
  return data;
}
