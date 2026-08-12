import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="dark flex h-screen items-center justify-center bg-[var(--bg)] font-mono text-[12px] text-[var(--text-muted)]">
        Memuat sesi...
      </div>
    );
  }

  if (!user) {
    // Remember where they were headed so LoginPage can send them back after
    // a successful login instead of always dropping them on "/".
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
