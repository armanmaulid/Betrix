import { apiClient } from "./client";
import type {
  MetricsResponse,
  AnalyticsResponse,
  SystemResponse,
  LogsResponse,
  ActionsResponse,
  AuditLogParams,
} from "../types";

export async function fetchMetrics(): Promise<MetricsResponse> {
  const { data } = await apiClient.get<MetricsResponse>("/admin/metrics");
  return data;
}

export interface AnalyticsParams {
  days?: number;
  fromDate?: string;
  toDate?: string;
}

export async function fetchAnalytics(params: AnalyticsParams): Promise<AnalyticsResponse> {
  const { data } = await apiClient.get<AnalyticsResponse>("/admin/analytics", { params });
  return data;
}

export async function fetchSystem(): Promise<SystemResponse> {
  const { data } = await apiClient.get<SystemResponse>("/admin/system");
  return data;
}

export async function fetchLogs(params: {
  type?: "error" | "combined";
  limit?: number;
}): Promise<LogsResponse> {
  const { data } = await apiClient.get<LogsResponse>("/admin/logs", { params });
  return data;
}

export async function fetchActions(params: AuditLogParams): Promise<ActionsResponse> {
  const { data } = await apiClient.get<ActionsResponse>("/admin/actions", {
    params,
  });
  return data;
}

export async function fetchActionTypes(): Promise<string[]> {
  const { data } = await apiClient.get<{ actions: string[] }>("/admin/actions/meta");
  return data.actions;
}

// Pola blob-download sama dengan downloadUsersExport di api/users.ts
export async function downloadAuditExport(
  params: AuditLogParams & { format: "csv" | "json" }
): Promise<void> {
  const response = await apiClient.get("/admin/actions/export", {
    params,
    responseType: "blob",
  });

  const disposition = response.headers["content-disposition"] as string | undefined;
  const match = disposition?.match(/filename="(.+)"/);
  const filename = match?.[1] || `audit-trail.${params.format}`;

  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
