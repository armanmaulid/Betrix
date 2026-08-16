import { useState, useEffect, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Loader2, UserPlus, AlertTriangle, MailCheck } from "lucide-react";
import { AuthLayout } from "../components/AuthLayout";
import { register as registerApi, resendVerification, AuthApiError, getGoogleOAuthUrl } from "../api/authClient";

export function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [resendNote, setResendNote] = useState<string | null>(null);

  useEffect(() => {
    const errorParam = new URLSearchParams(location.search).get("error");
    if (errorParam) {
      const errorMap: Record<string, string> = {
        rate_limit: "Terlalu banyak percobaan login/register, coba lagi dalam 5 menit.",
        google_denied: "Pendaftaran dibatalkan oleh pengguna.",
        auth_failed: "Autentikasi Google gagal.",
        server_error: "Terjadi kesalahan pada server saat pendaftaran Google."
      };
      setError(errorMap[errorParam] || "Gagal mendaftar dengan Google.");
      navigate(location.pathname, { replace: true });
    }
  }, [location, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password minimal 8 karakter.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Konfirmasi password tidak cocok.");
      return;
    }

    setIsSubmitting(true);
    try {
      await registerApi(email, password, name || undefined);
      // Backend SENGAJA membalas pesan sukses generik yang sama persis baik
      // email ini baru maupun sudah terdaftar (anti email-enumeration) — di
      // sini kita cuma boleh bilang "cek email kamu", tidak boleh menyimpulkan
      // yang mana yang sebenarnya terjadi.
      setSubmittedEmail(email);
    } catch (err) {
      // Satu-satunya kegagalan nyata yang bisa terjadi di titik ini adalah
      // device sudah terikat akun lain (403), input tidak valid (400), atau
      // masalah jaringan — bukan "email sudah ada" (itu tidak pernah gagal).
      setError(
        err instanceof AuthApiError ? err.message : "Gagal terhubung ke server. Coba lagi."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResend() {
    if (!submittedEmail) return;
    setResendNote(null);
    try {
      const res = await resendVerification(submittedEmail);
      setResendNote(res.message);
    } catch {
      setResendNote("Gagal mengirim ulang email verifikasi.");
    }
  }

  if (submittedEmail) {
    return (
      <AuthLayout
        eyebrow="Cek Email"
        title="Satu langkah lagi"
        subtitle="Link verifikasi cuma berlaku 24 jam — kalau nggak ketemu di inbox, cek folder spam."
        footer={
          <>
            Sudah verifikasi?{" "}
            <Link to="/login" className="font-semibold text-[var(--accent)] hover:underline">
              Masuk
            </Link>
          </>
        }
      >
        <div className="mb-4 flex h-10 w-10 items-center justify-center border border-[var(--accent)] text-[var(--accent)]">
          <MailCheck size={18} className="animate-pulse" />
        </div>
        <h2 className="mb-1 text-lg font-bold">Cek inbox kamu</h2>
        <p className="mb-6 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
          Kalau <span className="text-[var(--text-primary)]">{submittedEmail}</span> valid dan belum terdaftar,
          kami sudah kirim link verifikasi ke sana. Klik link itu untuk aktifkan akun, lalu kembali ke sini untuk
          masuk.
        </p>
        <button
          type="button"
          onClick={handleResend}
          className="w-full border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          Kirim ulang email verifikasi
        </button>
        {resendNote && <p className="mt-3 text-[11.5px] text-[var(--text-muted)]">{resendNote}</p>}
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="Daftar"
      title="Mulai analisa market kamu"
      subtitle="Satu akun, konek langsung ke data broker MT5 kamu sendiri — nggak ada rate limit pihak ketiga."
      footer={
        <>
          Sudah punya akun?{" "}
          <Link to="/login" className="font-semibold text-[var(--accent)] hover:underline">
            Masuk
          </Link>
        </>
      }
    >
      <h2 className="mb-1 text-lg font-bold">Buat akun</h2>
      <p className="mb-6 text-[12px] text-[var(--text-muted)]">Daftar dengan Google atau gunakan email.</p>

      <button
        type="button"
        onClick={() => window.location.href = getGoogleOAuthUrl()}
        className="mb-4 flex w-full items-center justify-center gap-2 border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2.5 text-[13px] font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--border)]"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Daftar dengan Google
      </button>

      <div className="mb-4 flex items-center gap-2">
        <div className="h-px flex-1 bg-[var(--border)]"></div>
        <span className="text-[10px] uppercase text-[var(--text-muted)]">atau daftar dengan email</span>
        <div className="h-px flex-1 bg-[var(--border)]"></div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3.5">
        <Field label="Nama (opsional)">
          <input
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={(e) => e.target.classList.add('input-typing')}
            onBlur={(e) => e.target.classList.remove('input-typing')}
            className="w-full border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2 text-[13px] outline-none transition-all focus:border-[var(--accent)] focus:shadow-[0_0_12px_2px_var(--accent-glow)]"
            placeholder="Nama kamu"
          />
        </Field>

        <Field label="Email">
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onFocus={(e) => e.target.classList.add('input-typing')}
            onBlur={(e) => e.target.classList.remove('input-typing')}
            className="w-full border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2 text-[13px] outline-none transition-all focus:border-[var(--accent)] focus:shadow-[0_0_12px_2px_var(--accent-glow)]"
            placeholder="kamu@email.com"
          />
        </Field>

        <Field label="Password">
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onFocus={(e) => e.target.classList.add('input-typing')}
            onBlur={(e) => e.target.classList.remove('input-typing')}
            className="w-full border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2 text-[13px] outline-none transition-all focus:border-[var(--accent)] focus:shadow-[0_0_12px_2px_var(--accent-glow)]"
            placeholder="Minimal 8 karakter"
          />
        </Field>

        <Field label="Konfirmasi Password">
          <input
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onFocus={(e) => e.target.classList.add('input-typing')}
            onBlur={(e) => e.target.classList.remove('input-typing')}
            className="w-full border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2 text-[13px] outline-none transition-all focus:border-[var(--accent)] focus:shadow-[0_0_12px_2px_var(--accent-glow)]"
            placeholder="Ulangi password"
          />
        </Field>

        {error && (
          <div role="alert" className="bx-alert bx-alert-error">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-press btn-sweep flex w-full items-center justify-center gap-1.5 bg-[var(--accent)] px-3 py-2.5 text-[13px] font-bold text-[#050505] transition-transform hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
          {isSubmitting ? "MEMPROSES..." : "DAFTAR"}
        </button>
      </form>
    </AuthLayout>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{label}</span>
      {children}
    </label>
  );
}

