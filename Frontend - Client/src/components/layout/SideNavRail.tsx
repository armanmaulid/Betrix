import React from "react";
import { LayoutGrid, CandlestickChart, Sparkles, Newspaper, CalendarClock, Settings, LogOut } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

// anchorId cuma ada di DashboardPage ("/") — kalau lagi di halaman itu,
// klik langsung scroll ke section-nya. Kalau lagi di halaman lain (mis.
// AnalyzePage), klik akan pindah dulu ke "/" (tanpa auto-scroll — halaman
// tujuan pendek, jadi cukup terlihat begitu landing).
const NAV_ITEMS = [
  { icon: LayoutGrid, label: "Dashboard", path: "/", anchorId: "panel-dashboard" },
  { icon: CandlestickChart, label: "Chart", path: "/", anchorId: "panel-chart" },
  { icon: Sparkles, label: "Analisa AI", path: "/analyze" },
  { icon: Newspaper, label: "News", path: "/news" },
  { icon: CalendarClock, label: "Kalender Ekonomi", path: "/", anchorId: "panel-calendar" },
];

export const SideNavRail = React.memo(function SideNavRail() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  function handleClick(path: string, anchorId?: string) {
    if (location.pathname === path) {
      if (anchorId) {
        document.getElementById(anchorId)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } else {
      navigate(path);
    }
  }

  return (
    <div className="flex w-12 flex-shrink-0 flex-col items-center justify-between border-r border-[var(--border)] bg-[var(--surface)] py-3">
      <div className="flex flex-col items-center gap-1">
        {NAV_ITEMS.map(({ icon: Icon, label, path, anchorId }) => (
          <button
            key={label}
            onClick={() => handleClick(path, anchorId)}
            aria-label={label}
            title={label}
            className={
              "flex h-9 w-9 items-center justify-center hover:bg-[var(--surface-alt)] hover:text-[var(--accent)] " +
              (location.pathname === path ? "text-[var(--accent)]" : "text-[var(--text-muted)]")
            }
          >
            <Icon size={17} />
          </button>
        ))}
      </div>

      <div className="flex flex-col items-center gap-1">
        <button
          onClick={() => handleClick("/settings")}
          aria-label="Pengaturan"
          title="Pengaturan"
          className={
            "flex h-9 w-9 items-center justify-center hover:bg-[var(--surface-alt)] hover:text-[var(--accent)] " +
            (location.pathname === "/settings" ? "text-[var(--accent)] bg-[rgba(255,170,0,0.05)]" : "text-[var(--text-muted)]")
          }
        >
          <Settings size={17} />
        </button>
        <button
          onClick={() => void logout()}
          aria-label="Keluar"
          title="Keluar"
          className="flex h-9 w-9 items-center justify-center text-[var(--text-muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
        >
          <LogOut size={17} />
        </button>
      </div>
    </div>
  );
});
