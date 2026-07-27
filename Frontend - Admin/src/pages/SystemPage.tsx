import { Database, Server, Zap } from "lucide-react";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { useSystem } from "../hooks/useMetrics";

export function SystemPage() {
  const { data, isLoading } = useSystem();

  if (isLoading || !data) {
    return (
      <DashboardLayout title="System Health">
        <p className="text-[var(--text-muted)]">Memuat...</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="System Health">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Server">
          <div className="mb-3 flex items-center gap-2 text-[var(--accent)]">
            <Server size={18} />
            <span className="tabular text-sm">{data.server.uptime.formatted}</span>
          </div>
          <dl className="space-y-2 text-sm">
            <Row label="Node Version" value={data.server.nodeVersion} />
            <Row label="Platform" value={data.server.platform} />
            <Row label="Memory (RSS)" value={data.server.memory.rss} />
            <Row label="Heap Used" value={data.server.memory.heapUsed} />
            <Row label="Heap Total" value={data.server.memory.heapTotal} />
          </dl>
        </Card>

        <Card title="Database">
          <div className="mb-3 flex items-center gap-2">
            <Database size={18} className="text-[var(--accent)]" />
            <Badge variant={data.database.status === "connected" ? "success" : "danger"}>
              {data.database.status}
            </Badge>
          </div>
          <dl className="space-y-2 text-sm">
            <Row label="Ukuran DB" value={data.database.size} />
            <Row label="Users" value={String(data.database.tables.users)} />
            <Row label="Chats" value={String(data.database.tables.chats)} />
            <Row label="Token Usage Records" value={String(data.database.tables.tokenUsage)} />
          </dl>
        </Card>

        <Card title="Redis">
          <div className="mb-3 flex items-center gap-2">
            <Zap size={18} className="text-[var(--accent)]" />
            <Badge variant={data.redis.status === "connected" ? "success" : "danger"}>
              {data.redis.status}
            </Badge>
          </div>
          <dl className="space-y-2 text-sm">
            {data.redis.keys !== undefined && <Row label="Jumlah Keys" value={String(data.redis.keys)} />}
            {data.redis.uptime && <Row label="Uptime" value={data.redis.uptime} />}
            {data.redis.error && <Row label="Error" value={data.redis.error} />}
          </dl>
        </Card>
      </div>
    </DashboardLayout>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}
