import type { ReactNode } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
  // Opt a column into click-to-sort. `key` is used as the sort key sent to
  // onSortChange — callers decide what that key means for their API.
  sortable?: boolean;
}

interface TableProps<T> {
  columns: Column<T>[];
  rows: T[];
  keyExtractor: (row: T) => string;
  isLoading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  sortBy?: string;
  sortOrder?: "ASC" | "DESC";
  onSortChange?: (key: string) => void;
}

export function Table<T>({
  columns,
  rows,
  keyExtractor,
  isLoading,
  emptyMessage = "Tidak ada data",
  onRowClick,
  sortBy,
  sortOrder,
  onSortChange,
}: TableProps<T>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--text-muted)]">
            {columns.map((col) => {
              const isSortable = col.sortable && !!onSortChange;
              const isActive = isSortable && sortBy === col.key;

              return (
                <th key={col.key} className="py-2.5 pr-4 font-medium">
                  {isSortable ? (
                    <button
                      onClick={() => onSortChange!(col.key)}
                      className={
                        "flex items-center gap-1 transition-colors hover:text-[var(--text-primary)] " +
                        (isActive ? "text-[var(--text-primary)]" : "")
                      }
                    >
                      {col.header}
                      {isActive ? (
                        sortOrder === "DESC" ? (
                          <ChevronDown size={12} />
                        ) : (
                          <ChevronUp size={12} />
                        )
                      ) : (
                        <ChevronsUpDown size={12} className="opacity-40" />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={columns.length} className="py-8 text-center text-[var(--text-muted)]">
                Memuat...
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="py-8 text-center text-[var(--text-muted)]">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={keyExtractor(row)}
                onClick={() => onRowClick?.(row)}
                className={
                  "border-b border-[var(--border)] last:border-b-0" +
                  (onRowClick ? " cursor-pointer hover:bg-[var(--surface-alt)]" : "")
                }
              >
                {columns.map((col) => (
                  <td key={col.key} className={"py-3 pr-4 " + (col.className || "")}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
