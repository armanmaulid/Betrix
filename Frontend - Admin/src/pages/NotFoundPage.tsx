import { Link } from "react-router-dom";
import { Compass, Home } from "lucide-react";

// Shown for any route that doesn't match — previously unmatched routes
// silently redirected to /dashboard, which hid the fact that a link was
// broken or a URL was mistyped.
export function NotFoundPage() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-[var(--bg)] px-6 text-center text-[var(--text-primary)]">
      <div className="rounded-full bg-[var(--accent-soft)] p-4">
        <Compass size={32} className="text-[var(--accent)]" />
      </div>
      <div>
        <h1 className="font-display text-xl font-semibold">404 — Halaman Tidak Ditemukan</h1>
        <p className="mt-1 max-w-sm text-sm text-[var(--text-muted)]">
          URL yang kamu tuju tidak ada, atau mungkin sudah dipindahkan.
        </p>
      </div>
      <Link
        to="/dashboard"
        className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        <Home size={14} /> Kembali ke Dashboard
      </Link>
    </div>
  );
}
