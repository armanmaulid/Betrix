import { useState, useMemo } from "react";
import { Search, X } from "lucide-react";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import { Card } from "../components/ui/Card";
import { useLogs } from "../hooks/useMetrics";
import type { LogEntry } from "../types";

function matchesSearch(log: LogEntry, query: string): boolean {
  if (!query) return true;
  return JSON.stringify(log).toLowerCase().includes(query.toLowerCase());
}

export function LogsPage() {
  const [type, setType] = useState<"error" | "combined">("error");
  const [limit, setLimit] = useState(50);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const { data, isLoading } = useLogs(type, limit);

  const allLogs = data?.logs ?? [];

  const distinctLevels = useMemo(() => {
    const set = new Set(allLogs.map((l) => l.level).filter((v): v is string => !!v));
    return Array.from(set).sort();
  }, [allLogs]);

  const filteredLogs = useMemo(() => {
    return allLogs.filter((log) => {
      if (levelFilter && log.level !== levelFilter) return false;
      if (!matchesSearch(log, search)) return false;
      return true;
    });
  }, [allLogs, search, levelFilter]);

  const hasActiveFilters = !!(search || levelFilter);

  return (
    <DashboardLayout title="Logs">
      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex gap-2">
            <button
              onClick={() => setType("error")}
              className={
                "rounded-lg px-3 py-1.5 text-xs font-medium " +
                (type === "error"
                  ? "bg-[var(--danger)] text-white"
                  : "border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-alt)]")
              }
            >
              Error
            </button>
            <button
              onClick={() => setType("combined")}
              className={
                "rounded-lg px-3 py-1.5 text-xs font-medium " +
                (type === "combined"
                  ? "bg-[var(--accent)] text-white"
                  : "border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-alt)]")
              }
            >
              Combined
            </button>
          </div>

          <div className="relative min-w-[220px] flex-1">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari kata kunci di log..."
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1.5 pl-8 pr-3 text-xs outline-none focus:border-[var(--accent)]"
            />
          </div>

          {distinctLevels.length > 0 && (
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs outline-none"
            >
              <option value="">Semua Level</option>
              {distinctLevels.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          )}

          {hasActiveFilters && (
            <button
              onClick={() => {
                setSearch("");
                setLevelFilter("");
              }}
              className="flex items-center gap-1 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <X size={13} /> Reset filter
            </button>
          )}

          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="ml-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs outline-none"
          >
            <option value={50}>50 baris</option>
            <option value={100}>100 baris</option>
            <option value={200}>200 baris</option>
          </select>
        </div>

        {hasActiveFilters && !isLoading && (
          <p className="mb-2 text-xs text-[var(--text-muted)]">
            Menampilkan {filteredLogs.length} dari {allLogs.length} baris yang sudah dimuat.
            Filter ini hanya berlaku pada data yang sudah di-load — perbesar limit di atas kalau
            hasil yang dicari mungkin lebih lama dari itu.
          </p>
        )}

        <div className="max-h-[560px] space-y-2 overflow-y-auto">
          {isLoading ? (
            <p className="text-sm text-[var(--text-muted)]">Memuat...</p>
          ) : filteredLogs.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              {hasActiveFilters ? "Tidak ada log yang cocok dengan filter" : data?.message || "Tidak ada log"}
            </p>
          ) : (
            filteredLogs.map((log, i) => (
              <pre
                key={i}
                className="tabular overflow-x-auto rounded-lg bg-[var(--surface-alt)] p-3 text-xs leading-relaxed"
              >
                {JSON.stringify(log, null, 2)}
              </pre>
            ))
          )}
        </div>
      </Card>
    </DashboardLayout>
  );
}
