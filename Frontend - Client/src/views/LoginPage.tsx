"use client";
import { useState, useEffect, type FormEvent, type ReactNode } from "react";
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Loader2, AlertTriangle, LogIn } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { AuthLayout } from "../components/auth/AuthLayout";
import { AuthApiError, logoutByCredentials, resendVerification, getGoogleOAuthUrl } from "../lib/api/authClient";

// Which follow-up action to surface below the error message — the backend
// distinguishes these with needsVerification/hasActiveSession flags (see
// AuthApiError), so the UI can offer the actual fix instead of a dead end.
type Prompt = "none" | "needs-verification" | "active-session";

export function LoginPage() {
  const { login } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const redirectTo = searchParams?.get('from') || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<Prompt>("none");
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const errorParam = new URLSearchParams(location.search).get("error");
    if (errorParam) {
      const errorMap: Record<string, string> = {
        google_denied: "Login dibatalkan oleh pengguna.",
        auth_failed: "Autentikasi Google gagal.",
        account_banned: "Akun diblokir. Hubungi admin untuk info lebih lanjut.",
        account_suspended: "Akun ditangguhkan. Hubungi admin untuk info lebih lanjut.",
        device_bound: "Device ini sudah terdaftar ke akun lain. Satu device hanya bisa untuk satu akun.",
        already_logged_in: "Anda sudah login dari device ini. Logout terlebih dahulu untuk login ulang.",
        server_error: "Terjadi kesalahan pada server saat login Google.",
        rate_limit: "Terlalu banyak percobaan login/register, coba lagi dalam 5 menit."
      };
      setError(errorMap[errorParam] || "Gagal login dengan Google.");
      // clear query string without refreshing
      router.replace(pathname);
    }
  }, [router, pathname]);

  async function attemptLogin() {
    setIsSubmitting(true);
    setError(null);
    setPrompt("none");
    try {
      await login(email, password);
      router.replace(redirectTo);
    } catch (err: any) {
      if (err instanceof AuthApiError) {
        setError(err.message);
        if (err.needsVerification) setPrompt("needs-verification");
        else if (err.hasActiveSession) setPrompt("active-session");
      } else {
        setError("Gagal terhubung ke server. Coba lagi.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void attemptLogin();
  }

  // "409 hasActiveSession" means this same device already holds a live
  // session (see routes/auth.js device-session enforcement). The only way
  // to clear it without the old token is logout-by-credentials, then retry.
  async function handleForceLogoutAndRetry() {
    setIsSubmitting(true);
    setError(null);
    try {
      await logoutByCredentials(email, password);
      await attemptLogin();
    } catch {
      setError("Gagal logout perangkat sebelumnya. Coba lagi.");
      setIsSubmitting(false);
    }
  }

  async function handleResend() {
    setNote(null);
    try {
      const res = await resendVerification(email);
      setNote(res.message);
    } catch {
      setNote("Gagal mengirim ulang email verifikasi.");
    }
  }

  return (
    <AuthLayout
      eyebrow="Masuk"
      title="Lanjutkan ke dashboard analisa kamu"
      subtitle="Chart real-time, sinyal trading, dan Kiro — asisten AI buat bantu baca market — nunggu di dalam."
      footer={
        <>
          Belum punya akun?{" "}
          <Link href="/register" className="font-semibold text-[var(--accent)] hover:underline">
            Daftar
          </Link>
        </>
      }
    >
      <h2 className="mb-1 text-lg font-bold">Masuk</h2>
      <p className="mb-6 text-[12px] text-[var(--text-muted)]">Masuk dengan akun Google atau email kamu.</p>

      <button
        type="button"
        onClick={() => window.location.href = getGoogleOAuthUrl()}
        className="mb-4 flex w-full items-center justify-center gap-2 border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2.5 text-[13px] font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--border)]"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Lanjutkan dengan Google
      </button>

      <div className="mb-4 flex items-center gap-2">
        <div className="h-px flex-1 bg-[var(--border)]"></div>
        <span className="text-[10px] uppercase text-[var(--text-muted)]">atau masuk dengan email</span>
        <div className="h-px flex-1 bg-[var(--border)]"></div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3.5">
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
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onFocus={(e) => e.target.classList.add('input-typing')}
            onBlur={(e) => e.target.classList.remove('input-typing')}
            className="w-full border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2 text-[13px] outline-none transition-all focus:border-[var(--accent)] focus:shadow-[0_0_12px_2px_var(--accent-glow)]"
            placeholder="••••••••"
          />
        </Field>

        {error && (
          <div className="bx-alert bx-alert-error">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {prompt === "needs-verification" && (
          <button
            type="button"
            onClick={handleResend}
            className="w-full border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            Kirim ulang email verifikasi
          </button>
        )}

        {prompt === "active-session" && (
          <button
            type="button"
            onClick={handleForceLogoutAndRetry}
            disabled={isSubmitting}
            className="w-full border border-[var(--accent)] px-3 py-2 text-[12px] font-semibold text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-50"
          >
            Logout perangkat ini &amp; masuk ulang
          </button>
        )}

        {note && <p className="text-[11.5px] text-[var(--text-muted)]">{note}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-press btn-sweep flex w-full items-center justify-center gap-1.5 bg-[var(--accent)] px-3 py-2.5 text-[13px] font-bold text-[#050505] transition-transform hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />}
          {isSubmitting ? "MEMPROSES..." : "MASUK"}
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




