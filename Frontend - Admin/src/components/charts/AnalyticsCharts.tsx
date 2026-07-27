import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type { AnalyticsResponse } from "../../types";

// Warna diambil langsung dari CSS variable tema aktif supaya chart ikut
// berubah pas toggle dark/light, tanpa perlu prop tambahan.
function cssVar(name: string): string {
  if (typeof window === "undefined") return "#000";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const tooltipStyle = {
  backgroundColor: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
};

export function UserGrowthChart({ data }: { data: AnalyticsResponse["userGrowth"] }) {
  const accent = cssVar("--accent");
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
        <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Line
          type="monotone"
          dataKey="newUsers"
          name="User Baru"
          stroke={accent}
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function TokenTrendChart({ data }: { data: AnalyticsResponse["tokenTrend"] }) {
  const success = cssVar("--success");
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
        <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
        <Tooltip contentStyle={tooltipStyle} />
        <Line
          type="monotone"
          dataKey="totalTokens"
          name="Total Token"
          stroke={success}
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function TaskTypeDistributionChart({
  data,
}: {
  data: AnalyticsResponse["chatByTaskType"];
}) {
  const accent = cssVar("--accent");
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ left: 24 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis type="number" tick={{ fontSize: 11, fill: "var(--text-muted)" }} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="taskType"
          tick={{ fontSize: 11, fill: "var(--text-muted)" }}
          width={100}
        />
        <Tooltip contentStyle={tooltipStyle} />
        <Bar dataKey="count" name="Jumlah" fill={accent} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ModelDistributionChart({
  data,
}: {
  data: AnalyticsResponse["modelDistribution"];
}) {
  const success = cssVar("--success");
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ left: 24 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis type="number" tick={{ fontSize: 11, fill: "var(--text-muted)" }} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="model"
          tick={{ fontSize: 10, fill: "var(--text-muted)" }}
          width={140}
        />
        <Tooltip contentStyle={tooltipStyle} />
        <Bar dataKey="totalTokens" name="Total Token" fill={success} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
