import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import { Card } from "../components/ui/Card";
import { Pagination } from "../components/ui/Pagination";
import { AuditFilters, type AuditFilterValues } from "../components/audit/AuditFilters";
import { AuditTable } from "../components/audit/AuditTable";
import { useActions, useActionTypes } from "../hooks/useMetrics";
import { useDebounce } from "../hooks/useDebounce";
import { downloadAuditExport } from "../api/metrics";
import { getApiErrorMessage } from "../api/client";
import { useToast } from "../context/ToastContext";

type SortOrder = "ASC" | "DESC";
const PAGE_SIZE = 25;

const EMPTY_FILTERS: AuditFilterValues = {
  search: "",
  action: "",
  actor: "",
  actorType: "",
  from: "",
  to: "",
};

export function AuditLogPage() {
  // Filter + page + sort hidup di URL (?page=&search=&action=...) supaya
  // hasil filter bisa di-share lewat link — pola GitHub/Vercel audit log.
  const [searchParams, setSearchParams] = useSearchParams();
  const [isExporting, setIsExporting] = useState(false);
  const { showToast } = useToast();

  const page = Math.max(parseInt(searchParams.get("page") || "1") || 1, 1);
  const sortOrder: SortOrder = searchParams.get("order") === "ASC" ? "ASC" : "DESC";
  const filters: AuditFilterValues = {
    search: searchParams.get("search") || "",
    action: searchParams.get("action") || "",
    actor: searchParams.get("actor") || "",
    actorType: searchParams.get("actorType") || "",
    from: searchParams.get("from") || "",
    to: searchParams.get("to") || "",
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

  function patchFilters(patch: Partial<AuditFilterValues>) {
    // Filter berubah → kembali ke halaman 1
    updateParams({ ...(patch as Record<string, string>), page: "" });
  }

  // Debounce field teks supaya URL & request tidak berubah per ketikan
  const debouncedSearch = useDebounce(filters.search, 400);
  const debouncedActor = useDebounce(filters.actor, 400);

  const effectiveParams = {
    page,
    limit: PAGE_SIZE,
    search: debouncedSearch,
    action: filters.action,
    actor: debouncedActor,
    actorType: filters.actorType as "admin" | "user" | "",
    from: filters.from,
    to: filters.to,
    order: sortOrder,
  };

  const { data, isLoading } = useActions(effectiveParams);
  const { data: actionTypes = [] } = useActionTypes();

  // Guard: kalau page di URL melebihi totalPages (misal filter diubah lewat
  // URL manual), mundur ke halaman terakhir yang valid.
  useEffect(() => {
    const totalPages = data?.pagination.totalPages ?? 0;
    if (totalPages > 0 && page > totalPages) {
      updateParams({ page: String(totalPages) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.pagination.totalPages]);

  async function handleExport(format: "csv" | "json") {
    setIsExporting(true);
    try {
      const { page: _p, limit: _l, order: _o, ...exportParams } = effectiveParams;
      await downloadAuditExport({ ...exportParams, format });
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <DashboardLayout title="Audit Trail">
      <Card className="overflow-visible">
        <AuditFilters
          values={filters}
          actionTypes={actionTypes}
          onChange={patchFilters}
          onReset={() => setSearchParams({})}
          onExport={handleExport}
          isExporting={isExporting}
        />

        <AuditTable
          rows={data?.actions ?? []}
          isLoading={isLoading}
          sortOrder={sortOrder}
          onSortChange={() =>
            updateParams({ order: sortOrder === "DESC" ? "ASC" : "" })
          }
        />

        {data?.pagination && (
          <Pagination
            pagination={data.pagination}
            onPageChange={(p) => updateParams({ page: p > 1 ? String(p) : "" })}
          />
        )}
      </Card>
    </DashboardLayout>
  );
}
