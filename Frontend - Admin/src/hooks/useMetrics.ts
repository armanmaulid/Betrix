import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { fetchMetrics, fetchSystem, fetchLogs, fetchActions, fetchActionTypes } from "../api/metrics";
import type { AuditLogParams } from "../types";

export function useMetrics() {
  return useQuery({
    queryKey: ["metrics"],
    queryFn: fetchMetrics,
    refetchInterval: 60_000, // refresh tiap 1 menit, cocok buat overview dashboard
  });
}

export function useSystem() {
  return useQuery({
    queryKey: ["system"],
    queryFn: fetchSystem,
    refetchInterval: 30_000,
  });
}

export function useLogs(type: "error" | "combined", limit: number) {
  return useQuery({
    queryKey: ["logs", type, limit],
    queryFn: () => fetchLogs({ type, limit }),
  });
}

export function useActions(params: AuditLogParams) {
  return useQuery({
    queryKey: ["actions", params],
    queryFn: () => fetchActions(params),
    staleTime: 30_000,
    // keepPreviousData: tabel tidak flicker/kosong saat ganti halaman atau filter
    placeholderData: keepPreviousData,
  });
}

export function useActionTypes() {
  return useQuery({
    queryKey: ["actionTypes"],
    queryFn: fetchActionTypes,
    // Daftar aksi jarang berubah; cache lama tidak masalah
    staleTime: 5 * 60_000,
  });
}
