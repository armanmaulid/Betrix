import { apiClient } from "./client";
import type {
  UsersListResponse,
  UserDetailResponse,
  UserChatEntry,
} from "../types";

export interface UsersListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  role?: "admin" | "user" | "";
  verified?: "true" | "false" | "";
  sortBy?: string;
  order?: "ASC" | "DESC";
}

export async function fetchUsers(params: UsersListParams): Promise<UsersListResponse> {
  const { data } = await apiClient.get<UsersListResponse>("/admin/users", { params });
  return data;
}

export async function fetchUserDetail(id: string): Promise<UserDetailResponse> {
  const { data } = await apiClient.get<UserDetailResponse>(`/admin/users/${id}`);
  return data;
}

export async function fetchUserChats(
  id: string,
  params: { page?: number; limit?: number; taskType?: string }
): Promise<{ user: { id: string; email: string; name: string }; chats: UserChatEntry[]; pagination: unknown }> {
  const { data } = await apiClient.get(`/admin/users/${id}/chats`, { params });
  return data;
}

export async function updateUser(
  id: string,
  updates: { status?: string; isAdmin?: boolean }
): Promise<void> {
  await apiClient.put(`/admin/users/${id}`, updates);
}

export async function deleteUser(id: string): Promise<void> {
  await apiClient.delete(`/admin/users/${id}`);
}

export async function resetUserPassword(
  id: string,
  sendEmail: boolean
): Promise<{ tempPassword?: string; emailSent: boolean }> {
  const { data } = await apiClient.post(`/admin/users/${id}/reset-password`, { sendEmail });
  return data;
}

export async function downloadUsersExport(
  params: UsersListParams & { format: "csv" | "json" }
): Promise<void> {
  const response = await apiClient.get("/admin/users/export", {
    params,
    responseType: "blob",
  });

  const disposition = response.headers["content-disposition"] as string | undefined;
  const match = disposition?.match(/filename="(.+)"/);
  const filename = match?.[1] || `users-export.${params.format}`;

  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
