import { apiClient } from "./client";
import type { User } from "../types";

export interface LoginResponse {
  sessionToken: string;
  user: User;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const { data } = await apiClient.post<LoginResponse>("/auth/login", { email, password });
  return data;
}

export async function fetchMe(): Promise<{ user: User }> {
  const { data } = await apiClient.get<{ user: User }>("/auth/me");
  return data;
}

export async function logout(sessionToken: string): Promise<void> {
  await apiClient.post("/auth/logout", { sessionToken });
}
