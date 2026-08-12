"use client";
import { ArrowUpRight, ArrowDownRight, Shuffle } from "lucide-react";

export interface SignalResult {
  direction: "buy" | "sell";
  entry: number;
  sl: number;
  tp: number;
  riskReward: number;
  confidence: number; // 0-100
  reasoning: string;
  alternative?: {
    direction: "buy" | "sell";
    entry: number;
    sl: number;
    tp: number;
    condition: string;
  };
}

function formatPrice(n: number): string {
  return n.toFixed(4);
}

// Dense 4-column grid, sharp corners, hairline dividers — matches the
// terminal-style redesign of the rest of AnalysisPage.
export function SignalResultCard({ signal }: { signal: SignalResult }) {
  const isBuy = signal.direction === "buy";

  return (
    <div className="border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3.5">
      <div className="mb-3 flex items-center gap-3">
        <span
          className={
            "flex items-center gap-1 px-2.5 py-1 text-xs font-bold " +
            (isBuy ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--danger-soft)] text-[var(--danger)]")
          }
        >
          {isBuy ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
          {isBuy ? "BUY" : "SELL"}
        </span>
        <span className="text-[11px] text-[var(--text-muted)]">Confidence {signal.confidence}%</span>
        <span className="tabular ml-auto text-[11px] text-[var(--text-muted)]">R:R 1:{signal.riskReward.toFixed(1)}</span>
      </div>

      <div className="grid grid-cols-4 border border-[var(--border)]">
        <SignalCell label="Entry" value={formatPrice(signal.entry)} tone="neutral" />
        <SignalCell label="Stop Loss" value={formatPrice(signal.sl)} tone="danger" />
        <SignalCell label="Take Profit" value={formatPrice(signal.tp)} tone="success" />
        <SignalCell label="Risk/Reward" value={`1 : ${signal.riskReward.toFixed(1)}`} tone="neutral" last />
      </div>

      <p className="mt-3 bg-[var(--surface-alt)] px-3 py-2 text-[12px] leading-relaxed text-[var(--text-primary)]">
        {signal.reasoning}
      </p>

      {signal.alternative && (
        <div className="mt-3 flex items-center gap-6 border border-dashed border-[var(--border)] px-3.5 py-2.5 text-[11.5px]">
          <Shuffle size={13} className="flex-shrink-0 text-[var(--text-muted)]" />
          <div>
            <div className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">Alt. Entry</div>
            <div className="tabular mt-0.5 font-semibold">{formatPrice(signal.alternative.entry)}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">SL</div>
            <div className="tabular mt-0.5 text-[var(--danger)]">{formatPrice(signal.alternative.sl)}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">TP</div>
            <div className="tabular mt-0.5 text-[var(--success)]">{formatPrice(signal.alternative.tp)}</div>
          </div>
          <div className="flex-1">
            <div className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">Trigger</div>
            <div className="mt-0.5 text-[var(--text-muted)]">{signal.alternative.condition}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function SignalCell({
  label,
  value,
  tone,
  last,
}: {
  label: string;
  value: string;
  tone: "neutral" | "success" | "danger";
  last?: boolean;
}) {
  const toneColor =
    tone === "success" ? "text-[var(--success)]" : tone === "danger" ? "text-[var(--danger)]" : "text-[var(--text-primary)]";

  return (
    <div className={"px-3.5 py-2.5 " + (last ? "" : "border-r border-[var(--border)]")}>
      <div className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">{label}</div>
      <div className={"tabular mt-0.5 text-base font-bold " + toneColor}>{value}</div>
    </div>
  );
}

