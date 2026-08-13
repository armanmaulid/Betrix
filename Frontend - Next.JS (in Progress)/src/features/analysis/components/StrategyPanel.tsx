"use client";

import { useState, type ReactNode } from "react";
import { Sparkles, Loader2 } from "lucide-react";

export interface AnalysisRequest {
  symbol: string;
  strategies: string[];
  mode: "conservative" | "balanced" | "aggressive";
  timeframes: string[];
  customCommand: string;
}

const STRATEGIES = [
  { key: "trend", label: "Trend" },
  { key: "breakout", label: "Breakout" },
  { key: "mean_reversion", label: "Mean Rev" },
  { key: "scalping", label: "Scalping" },
];

const MODES: Array<{ key: AnalysisRequest["mode"]; label: string }> = [
  { key: "conservative", label: "Conservative" },
  { key: "balanced", label: "Balanced" },
  { key: "aggressive", label: "Aggressive" },
];

// Timeframes the AI should factor into its analysis together — separate
// from the single timeframe shown on the chart itself (see AnalysisPage).
const ANALYSIS_TIMEFRAMES = ["M15", "H1", "H4", "D1"];

interface StrategyPanelProps {
  symbol: string;
  onGenerate: (request: AnalysisRequest) => void;
  isGenerating: boolean;
}

// Terminal-style horizontal toolbar — chips instead of checkboxes/radios,
// hairline dividers between groups, sharp corners. Replaces the earlier
// padded-card version to match the rest of the redesigned AnalysisPage.
export function StrategyPanel({ symbol, onGenerate, isGenerating }: StrategyPanelProps) {
  const [strategies, setStrategies] = useState<string[]>(["trend"]);
  const [mode, setMode] = useState<AnalysisRequest["mode"]>("balanced");
  const [timeframes, setTimeframes] = useState<string[]>(["H1", "H4"]);
  const [customCommand, setCustomCommand] = useState("");

  function toggleStrategy(key: string) {
    setStrategies((prev) => (prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]));
  }

  function toggleTimeframe(tf: string) {
    setTimeframes((prev) => (prev.includes(tf) ? prev.filter((t) => t !== tf) : [...prev, tf]));
  }

  function handleGenerate() {
    onGenerate({ symbol, strategies, mode, timeframes, customCommand });
  }

  const canGenerate = strategies.length > 0 && timeframes.length > 0 && !isGenerating;

  return (
    <div className="flex flex-col border-b border-[var(--border)] bg-[var(--surface)] text-[11.5px] lg:flex-row lg:items-stretch">
      <div className="flex items-center border-b border-[var(--border)] px-3.5 text-[10px] text-[var(--success)] lg:border-b-0 lg:border-r">
        ● BETA — GRATIS
      </div>

      <ToolbarGroup label="Strategi">
        <ChipRow>
          {STRATEGIES.map((s) => (
            <Chip key={s.key} active={strategies.includes(s.key)} onClick={() => toggleStrategy(s.key)}>
              {s.label}
            </Chip>
          ))}
        </ChipRow>
      </ToolbarGroup>

      <ToolbarGroup label="Mode">
        <ChipRow>
          {MODES.map((m) => (
            <Chip key={m.key} active={mode === m.key} onClick={() => setMode(m.key)}>
              {m.label}
            </Chip>
          ))}
        </ChipRow>
      </ToolbarGroup>

      <ToolbarGroup label="Timeframe Analisa">
        <ChipRow>
          {ANALYSIS_TIMEFRAMES.map((tf) => (
            <Chip key={tf} active={timeframes.includes(tf)} onClick={() => toggleTimeframe(tf)}>
              {tf}
            </Chip>
          ))}
        </ChipRow>
      </ToolbarGroup>

      <ToolbarGroup label="Command" grow>
        <input
          value={customCommand}
          onChange={(e) => setCustomCommand(e.target.value)}
          placeholder="fokus ke area supply/demand..."
          className="w-full border border-[var(--border)] bg-[var(--surface-alt)] px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
        />
      </ToolbarGroup>

      <button
        onClick={handleGenerate}
        disabled={!canGenerate}
        className="btn-sweep flex items-center justify-center gap-1.5 whitespace-nowrap bg-[var(--accent)] px-6 py-2 text-xs font-bold text-[var(--bg)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
        {isGenerating ? "MENGANALISA..." : "GENERATE"}
      </button>
    </div>
  );
}

function ToolbarGroup({ label, grow, children }: { label: string; grow?: boolean; children: ReactNode }) {
  return (
    <div className={"border-b border-[var(--border)] px-3.5 py-2 lg:border-b-0 lg:border-r " + (grow ? "lg:flex-1" : "")}>
      <div className="mb-1.5 text-[9px] uppercase tracking-wide text-[var(--text-muted)]">{label}</div>
      {children}
    </div>
  );
}

function ChipRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-1.5">{children}</div>;
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "btn-sweep border px-2.5 py-1 text-[11px] transition-colors " +
        (active
          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
          : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]")
      }
    >
      {children}
    </button>
  );
}
