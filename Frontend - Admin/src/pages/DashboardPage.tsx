import { useState } from "react";
import { Users, MessageSquare, Coins, Gauge } from "lucide-react";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import { Card } from "../components/ui/Card";
import { TickerStat } from "../components/ui/TickerStat";
import {
  UserGrowthChart,
  TokenTrendChart,
  TaskTypeDistributionChart,
  ModelDistributionChart,
} from "../components/charts/AnalyticsCharts";
import { useMetrics } from "../hooks/useMetrics";
import { useAnalytics } from "../hooks/useAnalytics";

function formatNumber(n: number): string {
  return new Intl.NumberFormat("id-ID").format(n);
}

const RANGE_OPTIONS = [
  { label: "7 hari", value: 7 },
  { label: "30 hari", value: 30 },
  { label: "90 hari", value: 90 },
];

export function DashboardPage() {
  const [days, setDays] = useState(30);
  const { data: metrics, isLoading: metricsLoading } = useMetrics();
  const { data: analytics, isLoading: analyticsLoading } = useAnalytics({ days });

  return (
    <DashboardLayout title="Dashboard">
      {/* Ticker strip — signature element, ringkasan gaya terminal trading */}
      <Card className="mb-6 flex flex-wrap p-0">
        <TickerStat
          label="Total Users"
          value={metricsLoading ? "…" : formatNumber(metrics?.users.total ?? 0)}
          delta={
            metrics
              ? {
                  value: `+${metrics.users.newLast7Days} / 7d`,
                  direction: "up",
                  tone: "positive",
                }
              : undefined
          }
          icon={<Users size={12} />}
        />
        <TickerStat
          label="Active 24h"
          value={metricsLoading ? "…" : formatNumber(metrics?.users.activeLast24h ?? 0)}
          icon={<Gauge size={12} />}
        />
        <TickerStat
          label="Chats 24h"
          value={metricsLoading ? "…" : formatNumber(metrics?.chats.last24h ?? 0)}
          delta={
            metrics
              ? {
                  value: `${formatNumber(metrics.chats.total)} total`,
                  direction: "up",
                  tone: "positive",
                }
              : undefined
          }
          icon={<MessageSquare size={12} />}
        />
        <TickerStat
          label="Tokens 24h"
          value={metricsLoading ? "…" : formatNumber(metrics?.tokens.last24h ?? 0)}
          icon={<Coins size={12} />}
        />
        <TickerStat
          label="Avg Latency"
          value={metricsLoading ? "…" : `${metrics?.performance.avgLatencyMs ?? 0}ms`}
        />
        <TickerStat
          label="Banned"
          value={metricsLoading ? "…" : formatNumber(metrics?.users.banned ?? 0)}
        />
      </Card>

      <div className="mb-4 flex justify-end gap-2">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setDays(opt.value)}
            className={
              "rounded-lg px-3 py-1.5 text-xs font-medium " +
              (days === opt.value
                ? "bg-[var(--accent)] text-white"
                : "border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-alt)]")
            }
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Pertumbuhan User">
          {analyticsLoading ? (
            <ChartSkeleton />
          ) : (
            <UserGrowthChart data={analytics?.userGrowth ?? []} />
          )}
        </Card>
        <Card title="Tren Token Usage">
          {analyticsLoading ? (
            <ChartSkeleton />
          ) : (
            <TokenTrendChart data={analytics?.tokenTrend ?? []} />
          )}
        </Card>
        <Card title="Distribusi Task Type">
          {analyticsLoading ? (
            <ChartSkeleton />
          ) : (
            <TaskTypeDistributionChart data={analytics?.chatByTaskType ?? []} />
          )}
        </Card>
        <Card title="Distribusi Model">
          {analyticsLoading ? (
            <ChartSkeleton />
          ) : (
            <ModelDistributionChart data={analytics?.modelDistribution ?? []} />
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}

function ChartSkeleton() {
  return (
    <div className="flex h-[220px] items-center justify-center text-sm text-[var(--text-muted)]">
      Memuat grafik...
    </div>
  );
}
