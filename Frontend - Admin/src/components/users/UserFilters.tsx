import { Search, Download } from "lucide-react";

export interface UserFilterValues {
  search: string;
  status: string;
  role: string;
  verified: string;
}

interface UserFiltersProps {
  values: UserFilterValues;
  onChange: (patch: Partial<UserFilterValues>) => void;
  onExport: (format: "csv" | "json") => void;
  isExporting: boolean;
}

const selectClass =
  "rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";

export function UserFilters({ values, onChange, onExport, isExporting }: UserFiltersProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="relative min-w-[220px] flex-1">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
        />
        <input
          value={values.search}
          onChange={(e) => onChange({ search: e.target.value })}
          placeholder="Cari nama atau email..."
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-2 pl-9 pr-3 text-sm outline-none focus:border-[var(--accent)]"
        />
      </div>

      <select
        value={values.role}
        onChange={(e) => onChange({ role: e.target.value })}
        className={selectClass}
        aria-label="Filter role"
      >
        <option value="">Semua Role</option>
        <option value="admin">Admin</option>
        <option value="user">User</option>
      </select>

      <select
        value={values.status}
        onChange={(e) => onChange({ status: e.target.value })}
        className={selectClass}
        aria-label="Filter status"
      >
        <option value="">Semua Status</option>
        <option value="active">Active</option>
        <option value="suspended">Suspended</option>
        <option value="banned">Banned</option>
      </select>

      <select
        value={values.verified}
        onChange={(e) => onChange({ verified: e.target.value })}
        className={selectClass}
        aria-label="Filter verifikasi email"
      >
        <option value="">Semua Verifikasi</option>
        <option value="true">Terverifikasi</option>
        <option value="false">Belum Verifikasi</option>
      </select>

      <div className="ml-auto flex gap-2">
        <button
          onClick={() => onExport("csv")}
          disabled={isExporting}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-[var(--surface-alt)] disabled:opacity-50"
        >
          <Download size={14} /> CSV
        </button>
        <button
          onClick={() => onExport("json")}
          disabled={isExporting}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-[var(--surface-alt)] disabled:opacity-50"
        >
          <Download size={14} /> JSON
        </button>
      </div>
    </div>
  );
}
