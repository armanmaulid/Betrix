import { Search, Download, X } from "lucide-react";

export interface AuditFilterValues {
  search: string;
  action: string;
  actor: string;
  actorType: string;
  from: string;
  to: string;
}

interface AuditFiltersProps {
  values: AuditFilterValues;
  actionTypes: string[];
  onChange: (patch: Partial<AuditFilterValues>) => void;
  onReset: () => void;
  onExport: (format: "csv" | "json") => void;
  isExporting: boolean;
}

// Filter bar audit trail ala CloudTrail: search bebas, jenis aksi, aktor,
// rentang tanggal, export. Pola input mengikuti UserFilters.tsx.
export function AuditFilters({
  values,
  actionTypes,
  onChange,
  onReset,
  onExport,
  isExporting,
}: AuditFiltersProps) {
  const hasActiveFilter =
    values.search || values.action || values.actor || values.actorType || values.from || values.to;

  const inputClass =
    "rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";

  return (
    <div className="sticky top-0 z-20 -mx-5 -mt-5 mb-4 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <input
            value={values.search}
            onChange={(e) => onChange({ search: e.target.value })}
            placeholder="Cari aksi, aktor, target, detail..."
            className={`w-full py-2 pl-9 pr-3 ${inputClass}`}
          />
        </div>

        <select
          value={values.action}
          onChange={(e) => onChange({ action: e.target.value })}
          className={inputClass}
          aria-label="Filter jenis aksi"
        >
          <option value="">Semua Aksi</option>
          {actionTypes.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>

        <select
          value={values.actorType}
          onChange={(e) => onChange({ actorType: e.target.value })}
          className={inputClass}
          aria-label="Filter tipe aktor"
        >
          <option value="">Semua Aktor</option>
          <option value="admin">Admin</option>
          <option value="user">User</option>
        </select>

        <input
          value={values.actor}
          onChange={(e) => onChange({ actor: e.target.value })}
          placeholder="Aktor (nama/email)"
          className={inputClass}
          aria-label="Filter aktor"
        />

        <input
          type="date"
          value={values.from}
          onChange={(e) => onChange({ from: e.target.value })}
          className={inputClass}
          aria-label="Dari tanggal"
        />
        <span className="text-xs text-[var(--text-muted)]">–</span>
        <input
          type="date"
          value={values.to}
          onChange={(e) => onChange({ to: e.target.value })}
          className={inputClass}
          aria-label="Sampai tanggal"
        />

        {hasActiveFilter && (
          <button
            onClick={onReset}
            className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-[var(--surface-alt)]"
          >
            <X size={14} />
            Reset
          </button>
        )}

        <div className="ml-auto flex gap-2">
          <button
            onClick={() => onExport("csv")}
            disabled={isExporting}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-[var(--surface-alt)] disabled:opacity-50"
          >
            <Download size={14} />
            CSV
          </button>
          <button
            onClick={() => onExport("json")}
            disabled={isExporting}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-[var(--surface-alt)] disabled:opacity-50"
          >
            <Download size={14} />
            JSON
          </button>
        </div>
      </div>
    </div>
  );
}
