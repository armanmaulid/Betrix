import { useState } from "react";
import { changePassword, changeEmail } from "../../../auth/api/authClient";
import { Lock, AlertCircle } from "lucide-react";

interface SecurityTabProps {
  sessionToken: string;
  currentEmail?: string;
}

export function SecurityTab({ sessionToken, currentEmail }: SecurityTabProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [emailToChange, setEmailToChange] = useState("");
  const [emailCurrentPassword, setEmailCurrentPassword] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "Konfirmasi password tidak cocok" });
      return;
    }

    setIsLoading(true);
    setMessage(null);
    try {
      await changePassword(sessionToken, currentPassword, newPassword);
      setMessage({ type: "success", text: "Password berhasil diubah!" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Terjadi kesalahan" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);
    try {
      const { pendingEmail } = await changeEmail(sessionToken, emailCurrentPassword, emailToChange);
      setMessage({ type: "success", text: `Link konfirmasi sudah dikirim ke ${pendingEmail}. Email lama masih aktif sampai kamu klik link itu.` });
      setEmailToChange("");
      setEmailCurrentPassword("");
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Terjadi kesalahan" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
      {message && (
        <div className={`p-3 text-[12px] flex items-center gap-2 border lg:col-span-2 ${
          message.type === "success"
            ? "bg-green-500/10 border-[var(--success)]/20 text-[var(--success)]"
            : "bg-red-500/10 border-red-500/20 text-red-500"
        }`}>
          <AlertCircle size={15} />
          {message.text}
        </div>
      )}

      {/* Change Password Panel */}
      <div className="border border-[var(--border)] p-4 bg-[var(--bg)]">
        <div className="mb-4 pb-2 border-b border-[var(--border)]">
          <div className="bx-section-tag mb-2">CHANGE PASSWORD</div>
          <p className="text-[11px] text-[var(--text-muted)]">Ensure your account is using a long, random password to stay secure.</p>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="settings-current-password" className="text-[10px] text-[var(--text-muted)] tracking-wider">CURRENT PASSWORD</label>
            <input
              id="settings-current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full bg-transparent border border-[var(--border)] px-3 py-1.5 text-[12px] focus:border-[var(--accent)] outline-none text-[var(--accent)]"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="settings-new-password" className="text-[10px] text-[var(--text-muted)] tracking-wider">NEW PASSWORD</label>
            <input
              id="settings-new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-transparent border border-[var(--border)] px-3 py-1.5 text-[12px] focus:border-[var(--accent)] outline-none text-[var(--accent)]"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="settings-confirm-password" className="text-[10px] text-[var(--text-muted)] tracking-wider">CONFIRM NEW PASSWORD</label>
            <input
              id="settings-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-transparent border border-[var(--border)] px-3 py-1.5 text-[12px] focus:border-[var(--accent)] outline-none text-[var(--accent)]"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading || !currentPassword || !newPassword || !confirmPassword}
              className="flex items-center gap-2 bg-[var(--accent)] text-black px-4 py-1.5 text-[12px] font-bold hover:opacity-90 disabled:opacity-50"
            >
              <Lock size={14} /> UPDATE PASSWORD
            </button>
          </div>
        </form>
      </div>

      {/* Change Email Panel */}
      <div className="border border-[var(--border)] p-4 bg-[var(--bg)]">
        <div className="mb-4 pb-2 border-b border-[var(--border)]">
          <div className="bx-section-tag mb-2">CHANGE EMAIL</div>
          <p className="text-[11px] text-[var(--text-muted)]">Update your account email address. Requires your current password.</p>
        </div>

        <form onSubmit={handleChangeEmail} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="settings-new-email" className="text-[10px] text-[var(--text-muted)] tracking-wider">NEW EMAIL ADDRESS</label>
            <input
              id="settings-new-email"
              type="email"
              value={emailToChange}
              onChange={(e) => setEmailToChange(e.target.value)}
              className="w-full bg-transparent border border-[var(--border)] px-3 py-1.5 text-[12px] focus:border-[var(--accent)] outline-none text-[var(--accent)]"
              placeholder={currentEmail}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="settings-email-current-password" className="text-[10px] text-[var(--text-muted)] tracking-wider">CURRENT PASSWORD</label>
            <input
              id="settings-email-current-password"
              type="password"
              value={emailCurrentPassword}
              onChange={(e) => setEmailCurrentPassword(e.target.value)}
              className="w-full bg-transparent border border-[var(--border)] px-3 py-1.5 text-[12px] focus:border-[var(--accent)] outline-none text-[var(--accent)]"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading || !emailCurrentPassword || !emailToChange}
              className="flex items-center gap-2 bg-[var(--accent)] text-black px-4 py-1.5 text-[12px] font-bold hover:opacity-90 disabled:opacity-50"
            >
              <Lock size={14} /> UPDATE EMAIL
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
