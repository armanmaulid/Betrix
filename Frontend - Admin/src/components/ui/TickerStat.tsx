import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import clsx from "clsx";

interface TickerStatProps {
  label: string;
  value: string | number;
  delta?: {
    value: string;
    direction: "up" | "down";
    tone?: "positive" | "negative"; // apakah arah "up" itu baik atau buruk secara konteks
  };
  icon?: ReactNode;
}

/**
 * Signature component dashboard ini: baris statistik bergaya ticker-tape
 * terminal trading — angka besar monospace, label kecil huruf kapital,
 * dan indikator delta kecil dengan panah. Dipakai berjejer horizontal
 * di baris paling atas Dashboard, meniru "ticker strip" bursa saham.
 */
export function TickerStat({ label, value, delta, icon }: TickerStatProps) {
  const isPositive = delta?.tone
    ? delta.tone === "positive"
    : delta?.direction === "up";

  return (
    <div className="flex-1 min-w-[160px] border-r border-[var(--border)] px-5 py-4 last:border-r-0">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
        {icon}
        {label}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="tabular font-display text-2xl font-semibold text-[var(--text-primary)]">
          {value}
        </span>
        {delta && (
          <span
            className={clsx(
              "tabular flex items-center gap-0.5 text-xs font-medium",
              isPositive ? "text-[var(--success)]" : "text-[var(--danger)]"
            )}
          >
            {delta.direction === "up" ? (
              <ArrowUpRight size={12} />
            ) : (
              <ArrowDownRight size={12} />
            )}
            {delta.value}
          </span>
        )}
      </div>
    </div>
  );
}
