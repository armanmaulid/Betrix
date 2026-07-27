import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PaginationInfo } from "../../types";

interface PaginationProps {
  pagination: PaginationInfo;
  onPageChange: (page: number) => void;
}

export function Pagination({ pagination, onPageChange }: PaginationProps) {
  const { page, totalPages, total, limit } = pagination;
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="flex items-center justify-between border-t border-[var(--border)] pt-3 text-sm text-[var(--text-muted)]">
      <span className="tabular">
        {from}–{to} dari {total}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="rounded-md border border-[var(--border)] p-1.5 disabled:opacity-40 hover:bg-[var(--surface-alt)]"
          aria-label="Halaman sebelumnya"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="tabular px-1">
          {page} / {totalPages || 1}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="rounded-md border border-[var(--border)] p-1.5 disabled:opacity-40 hover:bg-[var(--surface-alt)]"
          aria-label="Halaman berikutnya"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
