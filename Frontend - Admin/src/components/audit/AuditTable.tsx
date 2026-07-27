import { useState } from "react";
import { ChevronUp, ChevronDown, ChevronRight, ChevronsUpDown } from "lucide-react";
import { Badge, type BadgeVariant } from "../ui/Badge";
import type { AdminAction } from "../../types";

// Kategori aksi → warna badge (pola statusToBadgeVariant di ui/Badge.tsx):
//   danger  — penghapusan / destruktif
//   warning — perubahan sensitif (status user, password, email)
//   info    — ekspor data / baca massal
//   accent  — broadcast / komunikasi
//   success — autentikasi berhasil (login, register, verifikasi email)
//   neutral — lainnya
export function actionToBadgeVariant(action: string): BadgeVariant {
  if (action.includes("delete")) return "danger";
  if (
    action.includes("update") ||
    action.includes("reset_password") ||
    action.includes("email_chang") ||
    action.includes("suspend") ||
    action.includes("ban")
  ) {
    return "warning";
  }
  if (action.startsWith("export")) return "info";
  if (action.includes("broadcast")) return "accent";
  if (
    action === "login" ||
    action === "register" ||
    action === "email_verified"
  ) {
    return "success";
  }
  return "neutral";
}

// Relative time tanpa library: <1 mnt, N mnt, N jam, N hari; fallback tanggal penuh.
function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} mnt lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} hari lalu`;
  return formatFullDate(iso);
}

function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Ubah key mentah (camelCase / snake_case) jadi label rapi: newEmail → "New Email",
// revoked_count → "Revoked Count". Dipakai di detail expand supaya tidak campur
// gaya penulisan antar field.
function humanizeKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Nilai target_type mentah ("user", "system") → label yang jelas untuk pembaca
function humanizeTargetType(type: string | null): string {
  if (type === "user") return "Akun User";
  if (type === "system") return "Sistem";
  if (!type) return "—";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function actorInitials(name: string | null, email: string): string {
  const source = name || email;
  return source
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join("");
}

interface AuditTableProps {
  rows: AdminAction[];
  isLoading: boolean;
  sortOrder: "ASC" | "DESC";
  onSortChange: () => void;
}

// Tabel audit trail pro ala CloudTrail. Markup disalin dari ui/Table.tsx
// dengan tambahan baris expandable (Table generik tidak mendukung ekspansi).
export function AuditTable({ rows, isLoading, sortOrder, onSortChange }: AuditTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--text-muted)]">
            <th className="sticky top-0 z-10 bg-[var(--surface)] py-2.5 pr-4 font-medium">
              <button
                onClick={onSortChange}
                className="flex items-center gap-1 transition-colors hover:text-[var(--text-primary)]"
              >
                Waktu
                {sortOrder === "DESC" ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronUp size={14} />
                )}
              </button>
            </th>
            <th className="sticky top-0 z-10 bg-[var(--surface)] py-2.5 pr-4 font-medium">Aktor</th>
            <th className="sticky top-0 z-10 bg-[var(--surface)] py-2.5 pr-4 font-medium">Aksi</th>
            <th className="sticky top-0 z-10 bg-[var(--surface)] py-2.5 pr-4 font-medium">Target</th>
            <th className="sticky top-0 z-10 bg-[var(--surface)] w-10 py-2.5 font-medium">
              <span className="sr-only">Detail</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-b border-[var(--border)]">
                {Array.from({ length: 5 }).map((_, j) => (
                  <td key={j} className="py-3 pr-4">
                    <div className="h-4 animate-pulse rounded bg-[var(--surface-alt)]" />
                  </td>
                ))}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-10 text-center text-[var(--text-muted)]">
                Tidak ada aktivitas yang cocok dengan filter
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const isExpanded = expandedId === row.id;
              return (
                <>
                  <tr
                    key={row.id}
                    onClick={() => toggleExpand(row.id)}
                    className="cursor-pointer border-b border-[var(--border)] transition-colors hover:bg-[var(--surface-alt)]"
                  >
                    <td className="whitespace-nowrap py-3 pr-4">
                      <span title={formatFullDate(row.timestamp)} className="tabular">
                        {formatRelativeTime(row.timestamp)}
                      </span>
                      <p className="text-xs text-[var(--text-muted)]">
                        {formatFullDate(row.timestamp)}
                      </p>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                            row.actorType === "admin"
                              ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                              : "bg-[var(--info-soft)] text-[var(--info)]"
                          }`}
                        >
                          {actorInitials(row.admin.name, row.admin.email)}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate font-medium">{row.admin.name || "—"}</p>
                            <Badge variant={row.actorType === "admin" ? "accent" : "info"}>
                              {row.actorType}
                            </Badge>
                          </div>
                          <p className="truncate text-xs text-[var(--text-muted)]">
                            {row.admin.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant={actionToBadgeVariant(row.action)}>{row.action}</Badge>
                    </td>
                    <td className="py-3 pr-4">
                      <TargetCell row={row} />
                    </td>
                    <td className="py-3">
                      {isExpanded ? (
                        <ChevronDown size={16} className="text-[var(--text-muted)]" />
                      ) : (
                        <ChevronRight size={16} className="text-[var(--text-muted)]" />
                      )}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${row.id}-detail`} className="border-b border-[var(--border)] bg-[var(--surface-alt)]">
                      <td colSpan={5} className="px-4 py-3">
                        <ExpandedDetail row={row} />
                      </td>
                    </tr>
                  )}
                </>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function TargetCell({ row }: { row: AdminAction }) {
  // Aksi pada diri sendiri (misal admin ganti emailnya sendiri): target = aktor
  const isSelf =
    row.targetEmail && row.targetEmail === row.admin.email;

  if (row.targetType === "user" && row.targetEmail) {
    return (
      <div>
        <p className="text-sm">{row.targetName || "—"}</p>
        <p className="text-xs text-[var(--text-muted)]">
          {row.targetEmail}
          {isSelf ? " (diri sendiri)" : ""}
        </p>
      </div>
    );
  }
  const detailsEmail = row.details?.email as string | undefined;
  if (row.targetType === "user" && detailsEmail) {
    return (
      <div>
        <p className="text-sm text-[var(--text-muted)]">{detailsEmail}</p>
        <p className="text-xs text-[var(--text-muted)]">(user sudah dihapus)</p>
      </div>
    );
  }
  if (row.targetType) {
    return (
      <span className="text-xs text-[var(--text-muted)]">
        {humanizeTargetType(row.targetType)}
        {row.targetId ? ` · ${row.targetId.slice(0, 8)}…` : ""}
      </span>
    );
  }
  return <span className="text-[var(--text-muted)]">—</span>;
}

function ExpandedDetail({ row }: { row: AdminAction }) {
  const details = row.details as Record<string, unknown> | null;
  // Konsisten dengan kolom Target: aksi pada diri sendiri bukan "Akun User"
  const isSelf = row.targetEmail && row.targetEmail === row.admin.email;
  const targetLabel = isSelf ? "Diri sendiri" : humanizeTargetType(row.targetType);
  return (
    <div className="space-y-2 font-mono text-xs">
      <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
        <p>
          <span className="text-[var(--text-muted)]">Event ID:</span>{" "}
          <span className="font-medium">{row.id}</span>
        </p>
        <p>
          <span className="text-[var(--text-muted)]">Waktu:</span>{" "}
          <span className="font-medium">{formatFullDate(row.timestamp)}</span>
        </p>
        <p>
          <span className="text-[var(--text-muted)]">Tipe Target:</span>{" "}
          <span className="font-medium">{targetLabel}</span>
        </p>
        <p>
          <span className="text-[var(--text-muted)]">Target ID:</span>{" "}
          <span className="font-medium">{row.targetId || "—"}</span>
        </p>
        <p>
          <span className="text-[var(--text-muted)]">IP:</span>{" "}
          <span className="font-medium">{row.ip || "—"}</span>
        </p>
        <p className="break-all">
          <span className="text-[var(--text-muted)]">User Agent:</span>{" "}
          <span className="font-medium">{row.userAgent || "—"}</span>
        </p>
      </div>
      {details && typeof details === "object" && Object.keys(details).length > 0 && (
        <div className="border-t border-[var(--border)] pt-2">
          <p className="mb-1 text-[var(--text-muted)]">Detail:</p>
          <div className="space-y-0.5">
            {Object.entries(details).map(([k, v]) => (
              <p key={k}>
                <span className="text-[var(--text-muted)]">{humanizeKey(k)}:</span>{" "}
                <span className="font-medium">{String(v)}</span>
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
