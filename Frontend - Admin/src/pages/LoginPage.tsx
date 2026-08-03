import { useState, type FormEvent } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { TrendingUp } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { getApiErrorMessage } from "../api/client";

export function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isLoading && isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const user = await login(email, password);
      if (!user.isAdmin) {
        setError("Akun ini tidak punya akses admin.");
        return;
      }
      navigate("/dashboard");
    } catch (err) {
      setError(getApiErrorMessage(err, "Login gagal"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <TrendingUp className="text-[var(--accent)]" size={32} />
          <h1 className="font-display text-xl font-semibold text-[var(--text-primary)]">
            Betrix Admin
          </h1>
          <p className="text-sm text-[var(--text-muted)]">Masuk untuk kelola dashboard</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6"
        >
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              placeholder="admin@domainkamu.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-[var(--accent)] py-2.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {isSubmitting ? "Masuk..." : "Masuk"}
          </button>
        </form>
      </div>
    </div>
  );
}
