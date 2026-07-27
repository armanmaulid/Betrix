import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--bg)] text-[var(--text-muted)]">
        Memeriksa sesi...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!user?.isAdmin) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 bg-[var(--bg)] text-[var(--text-primary)]">
        <p className="font-display text-xl font-semibold">Akses Ditolak</p>
        <p className="text-[var(--text-muted)]">
          Akun ini tidak punya akses admin ke dashboard.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
