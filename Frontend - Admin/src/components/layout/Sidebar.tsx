import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Activity,
  ScrollText,
  History,
  TrendingUp,
  Mail,
  UserCircle,
} from "lucide-react";
import clsx from "clsx";
import { useUnreadMessagesCount } from "../../hooks/useUnreadMessages";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/users", label: "Users", icon: Users },
  { to: "/messages", label: "Messages", icon: Mail },
  { to: "/system", label: "System", icon: Activity },
  { to: "/logs", label: "Logs", icon: ScrollText },
  { to: "/audit-log", label: "Audit Trail", icon: History },
  { to: "/profile", label: "Profil", icon: UserCircle },
];

export function Sidebar() {
  const unreadCount = useUnreadMessagesCount();

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-5 py-5">
        <TrendingUp className="text-[var(--accent)]" size={22} />
        <span className="font-display text-base font-semibold tracking-tight">
          Betrix
        </span>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--surface-alt)] hover:text-[var(--text-primary)]"
              )
            }
          >
            <Icon size={17} />
            <span className="flex-1">{label}</span>
            {to === "/messages" && unreadCount > 0 && (
              <span className="tabular rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
