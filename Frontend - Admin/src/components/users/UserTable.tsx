import { useNavigate } from "react-router-dom";
import { BadgeCheck, BadgeX } from "lucide-react";
import { Table, type Column } from "../ui/Table";
import { Badge, statusToBadgeVariant } from "../ui/Badge";
import type { AdminUserRow } from "../../types";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Khusus "Terakhir Aktif" — perlu jam biar bisa bedain user yang aktif
// pagi ini vs beberapa jam lalu, bukan cuma "hari ini".
function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("id-ID").format(n);
}

interface UserTableProps {
  users: AdminUserRow[];
  isLoading: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  sortBy?: string;
  sortOrder?: "ASC" | "DESC";
  onSortChange?: (key: string) => void;
}

export function UserTable({
  users,
  isLoading,
  selectedIds,
  onToggleSelect,
  sortBy,
  sortOrder,
  onSortChange,
}: UserTableProps) {
  const navigate = useNavigate();
  const selectable = !!onToggleSelect;

  const columns: Column<AdminUserRow>[] = [
    ...(selectable
      ? [
          {
            key: "select",
            header: "",
            className: "w-8",
            render: (row: AdminUserRow) => (
              <input
                type="checkbox"
                checked={selectedIds?.has(row.id) ?? false}
                onChange={() => onToggleSelect?.(row.id)}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Pilih ${row.email}`}
                className="rounded"
              />
            ),
          } as Column<AdminUserRow>,
        ]
      : []),
    {
      key: "email",
      header: "User",
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-medium text-[var(--text-primary)]">{row.name || "—"}</p>
          <p className="text-xs text-[var(--text-muted)]">{row.email}</p>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      render: (row) =>
        row.isAdmin ? (
          <Badge variant="accent">Admin</Badge>
        ) : (
          <span className="text-xs text-[var(--text-muted)]">User</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (row) => (
        <Badge variant={statusToBadgeVariant(row.status)}>{row.status}</Badge>
      ),
    },
    {
      key: "verified",
      header: "Verifikasi",
      render: (row) =>
        row.emailVerified ? (
          <span className="flex items-center gap-1 text-xs text-[var(--success)]">
            <BadgeCheck size={14} /> Terverifikasi
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
            <BadgeX size={14} /> Belum
          </span>
        ),
    },
    {
      key: "total_chats",
      header: "Chats",
      className: "tabular",
      sortable: true,
      render: (row) => formatNumber(row.stats.totalChats),
    },
    {
      key: "total_tokens",
      header: "Tokens",
      className: "tabular",
      sortable: true,
      render: (row) => formatNumber(row.stats.totalTokens),
    },
    {
      key: "last_active",
      header: "Terakhir Aktif",
      className: "tabular text-[var(--text-muted)]",
      sortable: true,
      render: (row) => formatDateTime(row.lastActive),
    },
    {
      key: "created_at",
      header: "Bergabung",
      className: "tabular text-[var(--text-muted)]",
      sortable: true,
      render: (row) => formatDate(row.createdAt),
    },
  ];

  return (
    <Table
      columns={columns}
      rows={users}
      keyExtractor={(row) => row.id}
      isLoading={isLoading}
      emptyMessage="Tidak ada user yang cocok dengan filter"
      onRowClick={(row) => navigate(`/users/${row.id}`)}
      sortBy={sortBy}
      sortOrder={sortOrder}
      onSortChange={onSortChange}
    />
  );
}
