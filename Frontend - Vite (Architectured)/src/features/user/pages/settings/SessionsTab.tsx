import { useState, useEffect } from "react";
import { getSessions, revokeSession, type DeviceSession } from "../../../auth/api/authClient";
import { Trash2, AlertCircle } from "lucide-react";

function formatDate(dateStr?: string): string {
  if (!dateStr) return "N/A";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface SessionsTabProps {
  sessionToken: string;
}

export function SessionsTab({ sessionToken }: SessionsTabProps) {
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [sessionToRevoke, setSessionToRevoke] = useState<string | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  const fetchSessions = async () => {
    setIsLoading(true);
    try {
      const data = await getSessions(sessionToken);
      setSessions(data);
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Gagal memuat history login" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const executeRevokeSession = async (fingerprint: string) => {
    setIsRevoking(true);
    try {
      await revokeSession(sessionToken, fingerprint);
      setSessions(sessions.filter(s => s.fingerprint !== fingerprint));
      setMessage({ type: "success", text: "Sesi perangkat dicabut" });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Gagal mencabut sesi" });
    } finally {
      setIsRevoking(false);
      setSessionToRevoke(null);
    }
  };

  return (
    <>
      {message && (
        <div className={`p-3 mb-4 text-[12px] flex items-center gap-2 border ${
          message.type === "success"
            ? "bg-green-500/10 border-[var(--success)]/20 text-[var(--success)]"
            : "bg-red-500/10 border-red-500/20 text-red-500"
        }`}>
          <AlertCircle size={15} />
          {message.text}
        </div>
      )}

      <div className="mt-4 border border-[var(--border)] bg-[var(--bg)]">
        <div className="p-4 border-b border-[var(--border)]">
          <div className="bx-section-tag mb-2">ACTIVE SESSIONS</div>
          <p className="text-[11px] text-[var(--text-muted)]">Lihat daftar perangkat yang pernah login ke akun Anda.</p>
        </div>
        <div>
          {isLoading ? (
            <div className="p-4 text-center text-[var(--text-muted)] text-[12px]">Memuat sesi...</div>
          ) : sessions.length === 0 ? (
            <div className="p-4 text-center text-[var(--text-muted)] text-[12px]">Tidak ada riwayat sesi ditemukan.</div>
          ) : (
            <div className="w-full">
              <div className="bx-table-header page-container border-t-0">
                <div className="bx-table-cell flex-[2]">DEVICE ID</div>
                <div className="bx-table-cell flex-[2]">LAST SEEN</div>
                <div className="bx-table-cell flex-[1] text-right">ACTION</div>
              </div>
              {sessions.map((session, idx) => (
                <div key={idx} className="bx-table-row page-container">
                  <div className="bx-table-cell flex-[2] text-cyan-400 font-mono">{session.fingerprint.substring(0, 16)}...</div>
                  <div className="bx-table-cell flex-[2] text-[var(--text-muted)]">{formatDate(session.lastSeenAt)}</div>
                  <div className="bx-table-cell flex-[1] flex justify-end">
                    <button
                      onClick={() => setSessionToRevoke(session.fingerprint)}
                      className="flex items-center gap-2 text-red-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={12} /> REVOKE
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {sessionToRevoke && (
        <div className="bx-modal-overlay">
          <div className="bx-modal bx-modal-error">
            <div className="bx-modal-header">
              <AlertCircle size={24} />
              <h3 className="bx-modal-title">REVOKE SESSION?</h3>
            </div>
            <p className="bx-modal-text">
              Aksi ini akan mencabut akses secara permanen dari perangkat tersebut. Perangkat target akan seketika di-logout. Lanjutkan?
            </p>
            <div className="bx-modal-footer">
              <button
                onClick={() => setSessionToRevoke(null)}
                className="bx-modal-btn-cancel"
                disabled={isRevoking}
              >
                CANCEL
              </button>
              <button
                onClick={() => executeRevokeSession(sessionToRevoke)}
                className="bx-modal-btn-confirm"
                disabled={isRevoking}
              >
                {isRevoking ? "PROCESSING..." : "YES, REVOKE"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
