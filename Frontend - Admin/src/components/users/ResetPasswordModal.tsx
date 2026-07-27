import { useState } from "react";
import { Modal } from "../ui/Modal";
import { useResetPassword } from "../../hooks/useUsers";
import { getApiErrorMessage } from "../../api/client";

interface ResetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userEmail: string;
}

export function ResetPasswordModal({
  isOpen,
  onClose,
  userId,
  userEmail,
}: ResetPasswordModalProps) {
  const [sendEmail, setSendEmail] = useState(true);
  const [result, setResult] = useState<{ tempPassword?: string; emailSent: boolean } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const mutation = useResetPassword(userId);

  function handleReset() {
    setError(null);
    mutation.mutate(sendEmail, {
      onSuccess: (data) => setResult(data),
      onError: (err) => setError(getApiErrorMessage(err, "Gagal reset password")),
    });
  }

  function handleClose() {
    setResult(null);
    setError(null);
    onClose();
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Reset Password">
      {result ? (
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-muted)]">
            Password untuk <strong className="text-[var(--text-primary)]">{userEmail}</strong> berhasil direset.
          </p>
          {result.tempPassword && (
            <div className="rounded-lg bg-[var(--surface-alt)] p-3">
              <p className="mb-1 text-xs text-[var(--text-muted)]">Password sementara:</p>
              <p className="tabular text-base font-semibold">{result.tempPassword}</p>
            </div>
          )}
          <p className="text-xs text-[var(--text-muted)]">
            {result.emailSent
              ? "Email berisi password sementara sudah dikirim ke user."
              : "Email tidak dikirim — sampaikan password ini secara manual."}
          </p>
          <button
            onClick={handleClose}
            className="w-full rounded-lg bg-[var(--accent)] py-2 text-sm font-medium text-white"
          >
            Selesai
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-muted)]">
            Reset password untuk <strong className="text-[var(--text-primary)]">{userEmail}</strong>?
            Password sementara akan digenerate otomatis.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
            />
            Kirim password sementara via email
          </label>
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleClose}
              className="flex-1 rounded-lg border border-[var(--border)] py-2 text-sm font-medium hover:bg-[var(--surface-alt)]"
            >
              Batal
            </button>
            <button
              onClick={handleReset}
              disabled={mutation.isPending}
              className="flex-1 rounded-lg bg-[var(--accent)] py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {mutation.isPending ? "Memproses..." : "Reset Password"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
