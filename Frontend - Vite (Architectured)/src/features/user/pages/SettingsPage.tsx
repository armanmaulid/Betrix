import { useState, useEffect } from "react";
import { useShellContext } from "../../../app/layout/TerminalShellLayout";
import { useAuth } from "../../auth/context/AuthContext";
import {
  Settings, User, Key, Shield, Bell, Activity, Clock, Users,
} from "lucide-react";
import { ProfileTab } from "./settings/ProfileTab";
import { SecurityTab } from "./settings/SecurityTab";
import { SessionsTab } from "./settings/SessionsTab";
import { UsageTab } from "./settings/UsageTab";

type SettingsTab = "PROFILE" | "API KEY" | "SECURITY" | "NOTIFICATIONS" | "USAGE" | "LOGIN HISTORY" | "ACCOUNT";

const TABS = [
  { id: "PROFILE", icon: User },
  { id: "API KEY", icon: Key },
  { id: "SECURITY", icon: Shield },
  { id: "NOTIFICATIONS", icon: Bell },
  { id: "USAGE", icon: Activity },
  { id: "LOGIN HISTORY", icon: Clock },
  { id: "ACCOUNT", icon: Users },
] as const;

export function SettingsPage() {
  const { setRightPanel, setOnSearch } = useShellContext();
  const { user, setUser } = useAuth();

  useEffect(() => {
    setOnSearch(() => {});
    setRightPanel(null);
  }, [setOnSearch, setRightPanel]);

  const sessionToken = localStorage.getItem("eaconsole.sessionToken") || "";
  const [activeTab, setActiveTab] = useState<SettingsTab>("PROFILE");

  return (
    <>
      <div className="flex flex-col flex-1 h-full overflow-y-auto bg-[var(--bg)] py-4 text-[var(--text-primary)] font-mono">
        {/* Page Header */}
        <div className="mb-4">
          <div className="bx-section-tag text-[12px]">
            <Settings size={14} /> SYSTEM SETTINGS
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap border border-[var(--border)] mb-4">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 border-r border-[var(--border)] text-[11px] font-bold tracking-wider transition-colors
                ${activeTab === tab.id ? 'text-[var(--accent)] bg-[rgba(255,170,0,0.05)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-alt)]'}`}
            >
              <tab.icon size={13} /> {tab.id}
            </button>
          ))}
        </div>

        {/* Content Header */}
        <div className="flex justify-between items-center bg-[#0a0a0a] border border-[var(--border)] border-l-4 border-l-[var(--accent)] page-container py-2">
          <div className="flex items-center gap-2 text-[var(--accent)] font-bold text-[12px] tracking-widest">
            {activeTab === "PROFILE" && <User size={14} />}
            {activeTab === "SECURITY" && <Shield size={14} />}
            {activeTab}
          </div>
          {activeTab === "PROFILE" && (
            <div className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
              <span className="text-[8px]">▶</span> CONFIGURE
            </div>
          )}
        </div>

        {/* Tab Content */}
        {activeTab === "PROFILE" && (
          <ProfileTab user={user} setUser={setUser} sessionToken={sessionToken} />
        )}
        {activeTab === "SECURITY" && (
          <SecurityTab sessionToken={sessionToken} currentEmail={user?.email} />
        )}
        {activeTab === "LOGIN HISTORY" && (
          <SessionsTab sessionToken={sessionToken} />
        )}
        {activeTab === "USAGE" && (
          <UsageTab credits={user?.credits || 0} />
        )}
        {activeTab !== "PROFILE" && activeTab !== "SECURITY" && activeTab !== "LOGIN HISTORY" && activeTab !== "USAGE" && (
          <div className="border border-[var(--border)] mt-4 p-6 flex justify-center items-center text-[var(--text-muted)] text-[12px]">
            {activeTab} Configuration - Coming Soon
          </div>
        )}
      </div>
    </>
  );
}
