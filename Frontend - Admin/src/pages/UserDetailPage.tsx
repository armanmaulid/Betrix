import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, KeyRound, Settings } from "lucide-react";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import { Card } from "../components/ui/Card";
import { Badge, statusToBadgeVariant } from "../components/ui/Badge";
import { ResetPasswordModal } from "../components/users/ResetPasswordModal";
import { EditUserModal } from "../components/users/EditUserModal";
import { useUserDetail, useUserChats } from "../hooks/useUsers";

function formatDate(iso: string | null): string {
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

export function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [chatPage, setChatPage] = useState(1);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const { data, isLoading } = useUserDetail(id);
  const { data: chatsData, isLoading: chatsLoading } = useUserChats(id, chatPage);

  if (isLoading || !data) {
    return (
      <DashboardLayout title="Detail User">
        <p className="text-[var(--text-muted)]">Memuat...</p>
      </DashboardLayout>
    );
  }

  const { user, stats, recentActivity } = data;

  return (
    <DashboardLayout title="Detail User">
      <button
        onClick={() => navigate("/users")}
        className="mb-4 flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft size={15} /> Kembali ke daftar user
      </button>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold">{user.name || "—"}</h2>
              <p className="text-sm text-[var(--text-muted)]">{user.email}</p>
              <div className="mt-2 flex gap-2">
                <Badge variant={statusToBadgeVariant(user.status)}>{user.status}</Badge>
                {user.isAdmin && <Badge variant="neutral">admin</Badge>}
                {user.emailVerified ? (
                  <Badge variant="success">email terverifikasi</Badge>
                ) : (
                  <Badge variant="warning">belum verifikasi</Badge>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowResetModal(true)}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium hover:bg-[var(--surface-alt)]"
              >
                <KeyRound size={14} /> Reset Password
              </button>
              <button
                onClick={() => setShowEditModal(true)}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium hover:bg-[var(--surface-alt)]"
              >
                <Settings size={14} /> Kelola
              </button>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-4 border-t border-[var(--border)] pt-4 text-sm">
            <div>
              <dt className="text-xs text-[var(--text-muted)]">Bergabung</dt>
              <dd className="tabular">{formatDate(user.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-muted)]">Terakhir Aktif</dt>
              <dd className="tabular">{formatDate(user.lastActive)}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-muted)]">Verifikasi Email</dt>
              <dd className="tabular">{formatDate(user.verifiedAt)}</dd>
            </div>
          </dl>
        </Card>

        <Card title="Statistik">
          <div className="space-y-3">
            <StatRow label="Total Chat" value={formatNumber(stats.totalChats)} />
            <StatRow label="Total Token" value={formatNumber(stats.totalTokens)} />
            <StatRow label="Total Request" value={formatNumber(stats.totalRequests)} />
          </div>
        </Card>
      </div>

      <Card title="Aktivitas Terakhir" className="mb-6">
        <div className="space-y-2">
          {recentActivity.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">Belum ada aktivitas</p>
          ) : (
            recentActivity.map((activity, i) => (
              <div
                key={i}
                className="flex items-center justify-between border-b border-[var(--border)] py-2 text-sm last:border-b-0"
              >
                <div>
                  <span className="font-medium">{activity.taskType}</span>
                  <span className="ml-2 text-xs text-[var(--text-muted)]">{activity.model}</span>
                </div>
                <div className="tabular flex gap-4 text-xs text-[var(--text-muted)]">
                  <span>{formatNumber(activity.tokens)} tokens</span>
                  <span>{activity.latency ?? "—"}ms</span>
                  <span>{formatDate(activity.timestamp)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card title="Histori Chat (Moderasi)">
        <div className="space-y-3">
          {chatsLoading ? (
            <p className="text-sm text-[var(--text-muted)]">Memuat...</p>
          ) : chatsData?.chats.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">Belum ada percakapan</p>
          ) : (
            chatsData?.chats.map((chat) => (
              <div
                key={chat.id}
                className="rounded-lg border border-[var(--border)] p-3 text-sm"
              >
                <div className="mb-1.5 flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <span>
                    {chat.taskType} · {chat.model}
                  </span>
                  <span className="tabular">{formatDate(chat.timestamp)}</span>
                </div>
                <p className="mb-1.5">
                  <span className="font-medium text-[var(--text-muted)]">User: </span>
                  {chat.message}
                </p>
                <p>
                  <span className="font-medium text-[var(--text-muted)]">AI: </span>
                  {chat.reply}
                </p>
              </div>
            ))
          )}
        </div>
        <div className="mt-4 flex justify-center gap-2">
          <button
            onClick={() => setChatPage((p) => Math.max(1, p - 1))}
            disabled={chatPage <= 1}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs disabled:opacity-40"
          >
            Sebelumnya
          </button>
          <button
            onClick={() => setChatPage((p) => p + 1)}
            disabled={!chatsData?.chats.length || chatsData.chats.length < 20}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs disabled:opacity-40"
          >
            Berikutnya
          </button>
        </div>
      </Card>

      <ResetPasswordModal
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
        userId={user.id}
        userEmail={user.email}
      />
      <EditUserModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        user={{
          id: user.id,
          email: user.email,
          name: user.name,
          isAdmin: user.isAdmin,
          status: user.status,
          emailVerified: user.emailVerified,
          createdAt: user.createdAt,
          lastActive: user.lastActive,
          stats: { totalChats: stats.totalChats, totalTokens: stats.totalTokens },
        }}
      />
    </DashboardLayout>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-[var(--text-muted)]">{label}</span>
      <span className="tabular font-semibold">{value}</span>
    </div>
  );
}
