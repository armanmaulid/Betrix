import clsx from "clsx";
import type { ReactNode } from "react";

// Kategori semantik badge:
//   success — kondisi baik/selesai (active, terverifikasi)
//   danger  — kondisi buruk/kritis (banned, gagal)
//   warning — perlu perhatian (suspended, belum terverifikasi)
//   info    — informasi netral bernuansa biru (role, kategori, label sistem)
//   accent  — penanda brand/highlight (badge utama, item unggulan)
//   neutral — default, metadata biasa
export type BadgeVariant =
  | "success"
  | "danger"
  | "warning"
  | "info"
  | "accent"
  | "neutral";

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
}

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  success: "bg-[var(--success-soft)] text-[var(--success)]",
  danger: "bg-[var(--danger-soft)] text-[var(--danger)]",
  warning: "bg-[var(--warning-soft)] text-[var(--warning)]",
  info: "bg-[var(--info-soft)] text-[var(--info)]",
  accent: "bg-[var(--accent-soft)] text-[var(--accent)]",
  neutral: "bg-[var(--surface-alt)] text-[var(--text-muted)]",
};

export function Badge({ variant = "neutral", children }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        VARIANT_STYLES[variant]
      )}
    >
      {children}
    </span>
  );
}

export function statusToBadgeVariant(status: string): BadgeVariant {
  if (status === "active") return "success";
  if (status === "banned") return "danger";
  if (status === "suspended") return "warning";
  return "neutral";
}
