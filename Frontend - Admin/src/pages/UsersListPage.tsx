import { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckSquare, Square, Ban, ShieldCheck, ShieldOff, Trash2, X } from "lucide-react";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import { Card } from "../components/ui/Card";
import { Pagination } from "../components/ui/Pagination";
import { UserFilters, type UserFilterValues } from "../components/users/UserFilters";
import { UserTable } from "../components/users/UserTable";
import { useUsers, useBulkUpdateStatus, useBulkDeleteUsers } from "../hooks/useUsers";
import { useDebounce } from "../hooks/useDebounce";
import { downloadUsersExport } from "../api/users";
import { getApiErrorMessage } from "../api/client";
import { useToast } from "../context/ToastContext";

type BulkAction = { type: "status"; status: "active" | "suspended" | "banned" } | { type: "delete" };
type SortOrder = "ASC" | "DESC";

const BULK_ACTION_LABELS: Record<string, string> = {
  active: "mengaktifkan kembali",
  suspended: "men-suspend",
  banned: "mem-banned",
};

// Kolom yang boleh di-sort (whitelist backend GET /admin/users)
const SORTABLE_KEYS = new Set([
  "created_at",
  "last_active",
  "email",
  "name",
  "status",
  "total_chats",
  "total_tokens",
]);

export function UsersListPage() {
  // Filter + page + sort hidup di URL supaya hasil filter bisa di-share —
  // pola yang sama dengan halaman Audit Trail.
  const [searchParams, setSearchParams] = useSearchParams();
  const [isExporting, setIsExporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingBulkAction, setPendingBulkAction] = useState<BulkAction | null>(null);

  const { showToast } = useToast();

  const page = Math.max(parseInt(searchParams.get("page") || "1") || 1, 1);
  const rawSortBy = searchParams.get("sortBy") || "";
  const sortBy = SORTABLE_KEYS.has(rawSortBy) ? rawSortBy : undefined;
  const sortOrder: SortOrder = searchParams.get("order") === "DESC" ? "DESC" : "ASC";
  const filters: UserFilterValues = {
    search: searchParams.get("search") || "",
    status: searchParams.get("status") || "",
    role: searchParams.get("role") || "",
    verified: searchParams.get("verified") || "",
  };

  function updateParams(patch: Record<string, string>) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(patch)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      return next;
    });
  }

  function patchFilters(patch: Partial<UserFilterValues>) {
    updateParams({ ...(patch as Record<string, string>), page: "" });
  }

  // Input terikat langsung ke URL (ketikan terasa instan); query & export
  // pakai nilai debounce supaya backend tidak dipanggil per ketikan.
  const debouncedSearch = useDebounce(filters.search, 400);

  const { data, isLoading } = useUsers({
    page,
    limit: 20,
    search: debouncedSearch,
    status: filters.status,
    role: filters.role as "admin" | "user" | "",
    verified: filters.verified as "true" | "false" | "",
    sortBy,
    order: sortOrder,
  });
  const bulkUpdateStatus = useBulkUpdateStatus();
  const bulkDelete = useBulkDeleteUsers();

  const usersOnPage = data?.users ?? [];
  const allOnPageSelected = usersOnPage.length > 0 && usersOnPage.every((u) => selectedIds.has(u.id));

  async function handleExport(format: "csv" | "json") {
    setIsExporting(true);
    try {
      await downloadUsersExport({
        search: debouncedSearch,
        status: filters.status,
        role: filters.role as "admin" | "user" | "",
        verified: filters.verified as "true" | "false" | "",
        format,
      });
    } finally {
      setIsExporting(false);
    }
  }

  function handleSortChange(key: string) {
    // Satu pemanggilan updateParams: dua pemanggilan berurutan bisa saling
    // menimpa karena setSearchParams tidak menjamin merge antar commit.
    if (sortBy === key) {
      updateParams({ order: sortOrder === "ASC" ? "DESC" : "", page: "" });
    } else {
      updateParams({ sortBy: key, order: "", page: "" });
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllOnPage() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        usersOnPage.forEach((u) => next.delete(u.id));
      } else {
        usersOnPage.forEach((u) => next.add(u.id));
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  const confirmText = useMemo(() => {
    if (!pendingBulkAction) return "";
    const n = selectedIds.size;
    if (pendingBulkAction.type === "delete") {
      return `Hapus ${n} user terpilih? Aksi ini tidak bisa dibatalkan.`;
    }
    return `Yakin mau ${BULK_ACTION_LABELS[pendingBulkAction.status]} ${n} user terpilih?`;
  }, [pendingBulkAction, selectedIds.size]);

  async function handleConfirmBulkAction() {
    if (!pendingBulkAction) return;

    const ids = Array.from(selectedIds);
    try {
      const result =
        pendingBulkAction.type === "delete"
          ? await bulkDelete.mutateAsync(ids)
          : await bulkUpdateStatus.mutateAsync({ ids, status: pendingBulkAction.status });

      if (result.failed > 0) {
        showToast(
          `Selesai: ${result.succeeded} berhasil, ${result.failed} gagal. Coba lagi untuk yang gagal.`,
          "error"
        );
      } else {
        showToast(`Berhasil diterapkan ke ${result.succeeded} user.`, "success");
      }
      clearSelection();
    } catch (err) {
      showToast(getApiErrorMessage(err, "Aksi bulk gagal"), "error");
    } finally {
      setPendingBulkAction(null);
    }
  }

  const isBulkBusy = bulkUpdateStatus.isPending || bulkDelete.isPending;

  return (
    <DashboardLayout title="Users">
      <Card>
        <UserFilters
          values={filters}
          onChange={patchFilters}
          onExport={handleExport}
          isExporting={isExporting}
        />

        {selectedIds.size > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">
              {selectedIds.size} user terpilih
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              <button
                onClick={() => setPendingBulkAction({ type: "status", status: "active" })}
                disabled={isBulkBusy}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-alt)] disabled:opacity-50"
              >
                <ShieldCheck size={14} /> Aktifkan
              </button>
              <button
                onClick={() => setPendingBulkAction({ type: "status", status: "suspended" })}
                disabled={isBulkBusy}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-alt)] disabled:opacity-50"
              >
                <ShieldOff size={14} /> Suspend
              </button>
              <button
                onClick={() => setPendingBulkAction({ type: "status", status: "banned" })}
                disabled={isBulkBusy}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-alt)] disabled:opacity-50"
              >
                <Ban size={14} /> Ban
              </button>
              <button
                onClick={() => setPendingBulkAction({ type: "delete" })}
                disabled={isBulkBusy}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--danger)] px-3 py-1.5 text-xs font-medium text-[var(--danger)] hover:bg-[var(--danger-soft)] disabled:opacity-50"
              >
                <Trash2 size={14} /> Hapus
              </button>
              <button
                onClick={clearSelection}
                disabled={isBulkBusy}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-alt)] disabled:opacity-50"
              >
                <X size={14} /> Batal pilih
              </button>
            </div>
          </div>
        )}

        {usersOnPage.length > 0 && (
          <button
            onClick={toggleSelectAllOnPage}
            className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            {allOnPageSelected ? <CheckSquare size={14} /> : <Square size={14} />}
            Pilih semua di halaman ini
          </button>
        )}

        <UserTable
          users={usersOnPage}
          isLoading={isLoading}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={handleSortChange}
        />

        {data && (
          <div className="mt-4">
            <Pagination
              pagination={data.pagination}
              onPageChange={(p) => updateParams({ page: p > 1 ? String(p) : "" })}
            />
          </div>
        )}
      </Card>

      {pendingBulkAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
            <h2 className="mb-3 font-display text-lg font-semibold text-[var(--text-primary)]">
              Konfirmasi Aksi Bulk
            </h2>
            <p className="mb-5 text-sm text-[var(--text-primary)]">{confirmText}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setPendingBulkAction(null)}
                disabled={isBulkBusy}
                className="flex-1 rounded-lg border border-[var(--border)] py-2 text-sm font-medium hover:bg-[var(--surface-alt)] disabled:opacity-50"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmBulkAction}
                disabled={isBulkBusy}
                className={
                  "flex-1 rounded-lg py-2 text-sm font-medium text-white disabled:opacity-60 " +
                  (pendingBulkAction.type === "delete" ? "bg-[var(--danger)]" : "bg-[var(--accent)]")
                }
              >
                {isBulkBusy ? "Memproses..." : "Ya, Lanjutkan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
