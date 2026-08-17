import { useState, useEffect } from "react";
import { fetchUsageMe, type UsageSummary } from "../../api/usageClient";
import { Activity } from "lucide-react";

interface UsageTabProps {
  credits?: number;
}

export function UsageTab({ credits = 0 }: UsageTabProps) {
  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const data = await fetchUsageMe(30);
        if (!cancelled) setUsageSummary(data);
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="mt-4 border border-[var(--border)] bg-[var(--bg)] p-12 flex justify-center items-center text-[var(--text-muted)] text-[12px]">
        Memuat data usage...
      </div>
    );
  }

  if (!usageSummary) {
    return (
      <div className="mt-4 border border-[var(--border)] bg-[var(--bg)] p-12 flex justify-center items-center text-[var(--text-muted)] text-[12px]">
        Gagal memuat ringkasan usage atau tidak ada data.
      </div>
    );
  }

  const maxTaskTokens = usageSummary.byTaskType.length > 0
    ? Math.max(...usageSummary.byTaskType.map(t => t.totalTokens))
    : 1;

  const inputT = usageSummary.summary.totalInputTokens || 0;
  const outputT = usageSummary.summary.totalOutputTokens || 0;
  const totalT = inputT + outputT;
  const inputPercent = totalT > 0 ? (inputT / totalT) * 100 : 0;
  const outputPercent = totalT > 0 ? (outputT / totalT) * 100 : 0;

  return (
    <div className="mt-4 border border-[var(--border)] bg-[var(--bg)]">
      <div className="p-4 border-b border-[var(--border)] flex justify-between items-center">
        <div>
          <div className="bx-section-tag mb-2">API USAGE & CREDITS</div>
          <p className="text-[11px] text-[var(--text-muted)] tracking-wider">PERIOD: LAST 30 DAYS</p>
        </div>
      </div>

      {/* 3 Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border-b border-[var(--border)]">
        <div className="bx-stat-card border-l-2 border-l-cyan-400">
          <div className="bx-stat-card-title">
            <Activity size={12} className="text-cyan-400"/> REQUESTS
          </div>
          <div className="bx-stat-card-value text-cyan-400">
            {usageSummary.summary.requestCount.toLocaleString()}
          </div>
          <div className="bx-stat-card-subtitle">Total API calls</div>
        </div>

        <div className="bx-stat-card border-l-2 border-l-orange-400">
          <div className="bx-stat-card-title">
            <Activity size={12} className="text-orange-400"/> TOKENS USED
          </div>
          <div className="bx-stat-card-value text-orange-400">
            {usageSummary.summary.totalTokens.toLocaleString()}
          </div>
          <div className="bx-stat-card-subtitle">Tokens consumed</div>
        </div>

        <div className="bx-stat-card border-r-0 border-l-2 border-l-green-400">
          <div className="bx-stat-card-title">
            <span className="text-green-400 font-bold">$</span> BALANCE
          </div>
          <div className="bx-stat-card-value text-green-400">
            {credits}
          </div>
          <div className="bx-stat-card-subtitle">Credits remaining</div>
        </div>
      </div>

      {/* Input vs Output Tokens Ratio */}
      <div className="p-4 border-b border-[var(--border)]">
        <div className="flex justify-between text-[11px] tracking-wider mb-2">
          <div className="text-cyan-400">{inputT.toLocaleString()} Input Tokens</div>
          <div className="text-[var(--text-muted)]">{totalT > 0 ? totalT.toLocaleString() : 0} Total Tokens</div>
          <div className="text-orange-400">{outputT.toLocaleString()} Output Tokens</div>
        </div>
        <div className="h-4 w-full bg-[var(--surface-alt)] border border-[var(--border)] flex">
          <div className="h-full bg-cyan-400 transition-all" style={{ width: `${inputPercent}%` }}></div>
          <div className="h-full bg-orange-400 transition-all" style={{ width: `${outputPercent}%` }}></div>
        </div>
        <div className="flex justify-between text-[10px] text-[var(--text-muted)] mt-2">
          <span>{inputPercent.toFixed(1)}% Input</span>
          <span>{outputPercent.toFixed(1)}% Output</span>
        </div>
      </div>

      {/* Top Endpoints Table */}
      <div className="p-4">
        <div className="bx-section-tag-sm mb-2">TOP TASKS (30 DAYS)</div>

        <div className="w-full mt-4">
          <div className="bx-table-header">
            <div className="bx-table-cell flex-[3]">ENDPOINT / TASK</div>
            <div className="bx-table-cell flex-1 text-right">CALLS</div>
            <div className="bx-table-cell flex-1 text-right">TOKENS</div>
            <div className="bx-table-cell flex-[3] text-right">USAGE</div>
          </div>
          {usageSummary.byTaskType.map((task, idx) => (
            <div key={idx} className="bx-table-row">
              <div className="bx-table-cell flex-[3] text-cyan-400 font-mono tracking-wide truncate pr-4">{task.taskType}</div>
              <div className="bx-table-cell flex-1 text-right font-bold text-[var(--text-primary)]">{task.requestCount.toLocaleString()}</div>
              <div className="bx-table-cell flex-1 text-right font-bold text-[var(--accent)]">{task.totalTokens.toLocaleString()}</div>
              <div className="bx-table-cell flex-[3] flex justify-end items-center pl-4">
                <div className="h-2 bg-[var(--accent)] transition-all" style={{ width: `${(task.totalTokens / maxTaskTokens) * 100}%` }}></div>
              </div>
            </div>
          ))}
          {usageSummary.byTaskType.length === 0 && (
            <div className="py-4 text-center text-[12px] text-[var(--text-muted)]">
              Belum ada data penggunaan selama 30 hari terakhir.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
