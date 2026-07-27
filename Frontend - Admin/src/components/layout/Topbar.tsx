import { Moon, Sun, LogOut, UserCircle, KeyRound, ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { Dropdown } from "../ui/Dropdown";

interface TopbarProps {
  title: string;
}

export function Topbar({ title }: TopbarProps) {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-6 py-4">
      <h1 className="font-display text-lg font-semibold">{title}</h1>
      <div className="flex items-center gap-3">
        <button
          onClick={toggleTheme}
          aria-label="Ganti tema"
          className="rounded-lg border border-[var(--border)] p-2 text-[var(--text-muted)] hover:bg-[var(--surface-alt)]"
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        <Dropdown
          trigger={
            <button
              aria-label="Menu akun"
              className="flex items-center gap-2 rounded-lg px-2 py-1 text-right transition-colors hover:bg-[var(--surface-alt)]"
            >
              <div>
                <p className="text-sm font-medium leading-tight">{user?.name || user?.email}</p>
                <p className="text-xs text-[var(--text-muted)] leading-tight">Admin</p>
              </div>
              <ChevronDown size={14} className="text-[var(--text-muted)]" />
            </button>
          }
        >
          <div className="border-b border-[var(--border)] px-3 py-2">
            <p className="text-sm font-medium">{user?.name || "Admin"}</p>
            <p className="truncate text-xs text-[var(--text-muted)]">{user?.email}</p>
          </div>
          <DropdownItem
            icon={<UserCircle size={16} />}
            label="Profil Saya"
            onClick={() => navigate("/profile")}
          />
          <DropdownItem
            icon={<KeyRound size={16} />}
            label="Ganti Password"
            onClick={() => navigate("/profile#password")}
          />
          <div className="border-t border-[var(--border)]">
            <DropdownItem
              icon={<LogOut size={16} />}
              label="Logout"
              onClick={logout}
              danger
            />
          </div>
        </Dropdown>
      </div>
    </header>
  );
}

function DropdownItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
        danger
          ? "text-[var(--danger)] hover:bg-[var(--danger-soft)]"
          : "text-[var(--text-primary)] hover:bg-[var(--surface-alt)]"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
