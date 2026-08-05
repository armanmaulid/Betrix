import { useState, useEffect } from "react";
import { useShellContext } from "../components/layout/TerminalShellLayout";
import { useAuth } from "../context/AuthContext";
import { updateProfile, changePassword, changeEmail, getSessions, revokeSession, type DeviceSession } from "../api/authClient";
import { fetchUsageMe, type UsageSummary } from "../api/usageClient";
import { 
  Settings, User, Key, Shield, Bell, Activity, Clock, 
  Users, Edit2, CheckCircle2, ShieldAlert, BadgeInfo,
  Calendar, Lock, Save, X, AlertCircle, Trash2
} from "lucide-react";

type SettingsTab = "PROFILE" | "API KEY" | "SECURITY" | "NOTIFICATIONS" | "USAGE" | "LOGIN HISTORY" | "ACCOUNT";

export function SettingsPage() {
  const { setRightPanel, setOnSearch } = useShellContext();
  const { user, setUser } = useAuth();
  
  useEffect(() => {
    setOnSearch(() => {});
    setRightPanel(null);
  }, [setOnSearch, setRightPanel]);
  const sessionToken = localStorage.getItem("eaconsole.sessionToken") || "";
  
  // Navigation State
  const [activeTab, setActiveTab] = useState<SettingsTab>("PROFILE");
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  // Profile States (Credentials / Profile)
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [address, setAddress] = useState(user?.address || "");
  const [birthdate, setBirthdate] = useState(user?.birthdate ? new Date(user.birthdate).toISOString().split('T')[0] : "");
  const [gender, setGender] = useState(user?.gender || "");
  const [bio, setBio] = useState(user?.bio || "");
  
  // Security States
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  const [emailToChange, setEmailToChange] = useState("");
  const [emailCurrentPassword, setEmailCurrentPassword] = useState("");
  
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Sessions State
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [sessionToRevoke, setSessionToRevoke] = useState<string | null>(null);

  // Usage State
  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null);
  const [isLoadingUsage, setIsLoadingUsage] = useState(false);

  useEffect(() => {
    if (activeTab === "LOGIN HISTORY") {
      fetchSessions();
    } else if (activeTab === "USAGE") {
      fetchUsageData();
    }
  }, [activeTab]);

  const fetchUsageData = async () => {
    setIsLoadingUsage(true);
    try {
      const data = await fetchUsageMe(30);
      setUsageSummary(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsLoadingUsage(false);
    }
  };

  const fetchSessions = async () => {
    setIsLoadingSessions(true);
    try {
      const data = await getSessions(sessionToken);
      setSessions(data);
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Gagal memuat history login" });
    } finally {
      setIsLoadingSessions(false);
    }
  };

  // Sync state if user context updates
  useEffect(() => {
    if (user && !isEditingProfile) {
      setName(user.name || "");
      setPhone(user.phone || "");
      setAddress(user.address || "");
      setBirthdate(user.birthdate ? new Date(user.birthdate).toISOString().split('T')[0] : "");
      setGender(user.gender || "");
      setBio(user.bio || "");
    }
  }, [user, isEditingProfile]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);
    try {
      const updatedUser = await updateProfile(sessionToken, { name, phone, address, birthdate, gender, bio });
      if (setUser) setUser(updatedUser);
      setMessage({ type: "success", text: "Profil berhasil diperbarui." });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Terjadi kesalahan" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "Konfirmasi password tidak cocok" });
      return;
    }
    
    setIsLoading(true);
    setMessage(null);
    try {
      await changePassword(sessionToken, currentPassword, newPassword);
      setMessage({ type: "success", text: "Password berhasil diubah!" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Terjadi kesalahan" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);
    try {
      const { pendingEmail } = await changeEmail(sessionToken, emailCurrentPassword, emailToChange);
      setMessage({ type: "success", text: `Link konfirmasi sudah dikirim ke ${pendingEmail}. Email lama masih aktif sampai kamu klik link itu.` });
      setEmailToChange("");
      setEmailCurrentPassword("");
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Terjadi kesalahan" });
    } finally {
      setIsLoading(false);
    }
  };

  const executeRevokeSession = async (fingerprint: string) => {
    setIsLoading(true);
    try {
      await revokeSession(sessionToken, fingerprint);
      setSessions(sessions.filter(s => s.fingerprint !== fingerprint));
      setMessage({ type: "success", text: "Sesi perangkat dicabut" });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Gagal mencabut sesi" });
    } finally {
      setIsLoading(false);
      setSessionToRevoke(null);
    }
  };

  const TABS = [
    { id: "PROFILE", icon: User },
    { id: "API KEY", icon: Key },
    { id: "SECURITY", icon: Shield },
    { id: "NOTIFICATIONS", icon: Bell },
    { id: "USAGE", icon: Activity },
    { id: "LOGIN HISTORY", icon: Clock },
    { id: "ACCOUNT", icon: Users },
  ] as const;

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "N/A";
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const renderProfileView = () => {
    if (isEditingProfile) {
      return (
        <div className="border border-[var(--border)] p-4 bg-[var(--bg)] mt-4">
          <div className="flex justify-between items-center mb-6">
            <div className="bx-section-tag">
              EDIT PROFILE
            </div>
            <button 
              onClick={() => setIsEditingProfile(false)}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <X size={16} />
            </button>
          </div>
          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[10px] text-[var(--text-muted)] tracking-wider">FULL NAME</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full bg-transparent border border-[var(--border)] px-3 py-1.5 text-[12px] focus:border-[var(--accent)] outline-none text-[var(--accent)]" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] text-[var(--text-muted)] tracking-wider">PHONE</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="w-full bg-transparent border border-[var(--border)] px-3 py-1.5 text-[12px] focus:border-[var(--accent)] outline-none text-[var(--accent)]" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] text-[var(--text-muted)] tracking-wider">BIRTHDATE</label>
                <input type="date" value={birthdate} onChange={e => setBirthdate(e.target.value)} className="w-full bg-transparent border border-[var(--border)] px-3 py-1.5 text-[12px] focus:border-[var(--accent)] outline-none text-[var(--accent)]" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] text-[var(--text-muted)] tracking-wider">GENDER</label>
                <select value={gender} onChange={e => setGender(e.target.value)} className="w-full bg-black text-[var(--accent)] border border-[var(--border)] px-3 py-1.5 text-[12px] focus:border-[var(--accent)] outline-none">
                  <option value="">Select...</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] text-[var(--text-muted)] tracking-wider">ADDRESS</label>
                <input type="text" value={address} onChange={e => setAddress(e.target.value)} className="w-full bg-transparent border border-[var(--border)] px-3 py-1.5 text-[12px] focus:border-[var(--accent)] outline-none text-[var(--accent)]" />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[10px] text-[var(--text-muted)] tracking-wider">BIO</label>
                <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} className="w-full bg-transparent border border-[var(--border)] px-3 py-1.5 text-[12px] focus:border-[var(--accent)] outline-none text-[var(--accent)] resize-none"></textarea>
              </div>
            </div>
            <div className="flex justify-end pt-4">
              <button type="submit" disabled={isLoading} className="flex items-center gap-2 bg-[var(--accent)] text-black px-4 py-1.5 text-[12px] font-bold hover:opacity-90">
                <Save size={14} /> SAVE CHANGES
              </button>
            </div>
          </form>
        </div>
      );
    }

    return (
      <>
        {/* Status Panels */}
        <div className="flex flex-col md:flex-row gap-0 border border-[var(--border)] mt-4">
          <div className="bx-stat-card flex-1 border-l-2 border-green-500">
            <div className="bx-stat-card-title">VERIFICATION</div>
            <div className="flex items-center gap-1.5 text-green-500 font-bold text-[14px]">
              <CheckCircle2 size={14} /> {user?.emailVerified ? "VERIFIED" : "UNVERIFIED"}
            </div>
          </div>
          <div className="bx-stat-card flex-1 border-l-2 border-[var(--accent)]">
            <div className="bx-stat-card-title">TWO-FACTOR AUTH</div>
            <div className="flex items-center gap-1.5 text-[var(--accent)] font-bold text-[14px]">
              <ShieldAlert size={14} /> DISABLED
            </div>
          </div>
          <div className="bx-stat-card flex-1 border-r-0 border-l-2 border-cyan-400">
            <div className="bx-stat-card-title">ACCOUNT TYPE</div>
            <div className="flex items-center gap-1.5 text-cyan-400 font-bold text-[14px]">
              <BadgeInfo size={14} /> FREE
            </div>
          </div>
        </div>

        {/* User Information Label */}
        <div className="flex justify-between items-center mt-6 mb-0">
          <div className="bx-section-tag">
            USER INFORMATION
          </div>
          <button 
            onClick={() => setIsEditingProfile(true)}
            className="flex items-center gap-1.5 text-[var(--accent)] border border-[var(--accent)] px-3 py-1 text-[11px] font-bold hover:bg-[var(--accent)] hover:text-black transition-colors"
          >
            <Edit2 size={12} /> EDIT PROFILE
          </button>
        </div>

        {/* User Info Table */}
        <div className="border border-[var(--border)] border-b-0 bg-[var(--bg)] mt-0">
          {[
            { label: "NAME", value: user?.name || "N/A" },
            { label: "EMAIL", value: user?.email || "N/A" },
            { label: "PHONE", value: user?.phone || "N/A" },
            { label: "BIRTHDATE", value: user?.birthdate ? formatDate(user.birthdate) : "N/A" },
            { label: "GENDER", value: user?.gender ? (user.gender.charAt(0).toUpperCase() + user.gender.slice(1)) : "N/A" },
            { label: "ADDRESS", value: user?.address || "N/A" },
          ].map((item, idx) => (
            <div key={idx} className="bx-table-row">
              <div className="bx-table-cell w-48 text-[var(--text-muted)]">{item.label}</div>
              <div className="bx-table-cell font-bold text-[var(--accent)]">{item.value}</div>
            </div>
          ))}
        </div>

        {/* Bottom Panels */}
        <div className="flex flex-col md:flex-row gap-0 mt-6 border border-[var(--border)]">
          <div className="bx-stat-card flex-1">
            <div className="bx-stat-card-title">
              <Calendar size={12} className="text-[var(--text-muted)]" /> MEMBER SINCE
            </div>
            <div className="bx-stat-card-value text-green-500">
              {formatDate(user?.createdAt || new Date().toISOString())}
            </div>
          </div>
          <div className="bx-stat-card flex-1 border-r-0">
            <div className="bx-stat-card-title">
              <Clock size={12} className="text-[var(--text-muted)]" /> LAST LOGIN
            </div>
            <div className="bx-stat-card-value text-[var(--accent)]">
              {formatDate(user?.lastActive || new Date().toISOString())}
            </div>
          </div>
        </div>

        {/* Credits Panel */}
        <div className="bx-stat-card mt-6 border-l-2 border-l-cyan-400">
          <div className="bx-stat-card-value text-cyan-400 mb-1">{user?.credits || 0}</div>
          <div className="bx-stat-card-title m-0">AVAILABLE CREDITS</div>
        </div>
      </>
    );
  };

  const renderSecurityView = () => (
    <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Change Password Panel */}
      <div className="border border-[var(--border)] p-4 bg-[var(--bg)]">
        <div className="mb-4 pb-2 border-b border-[var(--border)]">
          <div className="bx-section-tag mb-2">CHANGE PASSWORD</div>
          <p className="text-[11px] text-[var(--text-muted)]">Ensure your account is using a long, random password to stay secure.</p>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] text-[var(--text-muted)] tracking-wider">CURRENT PASSWORD</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full bg-transparent border border-[var(--border)] px-3 py-1.5 text-[12px] focus:border-[var(--accent)] outline-none text-[var(--accent)]"
            />
          </div>
          
          <div className="space-y-1.5">
            <label className="text-[10px] text-[var(--text-muted)] tracking-wider">NEW PASSWORD</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-transparent border border-[var(--border)] px-3 py-1.5 text-[12px] focus:border-[var(--accent)] outline-none text-[var(--accent)]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] text-[var(--text-muted)] tracking-wider">CONFIRM NEW PASSWORD</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-transparent border border-[var(--border)] px-3 py-1.5 text-[12px] focus:border-[var(--accent)] outline-none text-[var(--accent)]"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading || !currentPassword || !newPassword || !confirmPassword}
              className="flex items-center gap-2 bg-[var(--accent)] text-black px-4 py-1.5 text-[12px] font-bold hover:opacity-90 disabled:opacity-50"
            >
              <Lock size={14} /> UPDATE PASSWORD
            </button>
          </div>
        </form>
      </div>

      {/* Change Email Panel */}
      <div className="border border-[var(--border)] p-4 bg-[var(--bg)]">
        <div className="mb-4 pb-2 border-b border-[var(--border)]">
          <div className="bx-section-tag mb-2">CHANGE EMAIL</div>
          <p className="text-[11px] text-[var(--text-muted)]">Update your account email address. Requires your current password.</p>
        </div>

        <form onSubmit={handleChangeEmail} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] text-[var(--text-muted)] tracking-wider">NEW EMAIL ADDRESS</label>
            <input
              type="email"
              value={emailToChange}
              onChange={(e) => setEmailToChange(e.target.value)}
              className="w-full bg-transparent border border-[var(--border)] px-3 py-1.5 text-[12px] focus:border-[var(--accent)] outline-none text-[var(--accent)]"
              placeholder={user?.email}
            />
          </div>
          
          <div className="space-y-1.5">
            <label className="text-[10px] text-[var(--text-muted)] tracking-wider">CURRENT PASSWORD</label>
            <input
              type="password"
              value={emailCurrentPassword}
              onChange={(e) => setEmailCurrentPassword(e.target.value)}
              className="w-full bg-transparent border border-[var(--border)] px-3 py-1.5 text-[12px] focus:border-[var(--accent)] outline-none text-[var(--accent)]"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading || !emailCurrentPassword || !emailToChange}
              className="flex items-center gap-2 bg-[var(--accent)] text-black px-4 py-1.5 text-[12px] font-bold hover:opacity-90 disabled:opacity-50"
            >
              <Lock size={14} /> UPDATE EMAIL
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  const renderLoginHistoryView = () => (
    <div className="mt-4 border border-[var(--border)] bg-[var(--bg)]">
      <div className="p-4 border-b border-[var(--border)]">
        <div className="bx-section-tag mb-2">
          ACTIVE SESSIONS
        </div>
        <p className="text-[11px] text-[var(--text-muted)]">Lihat daftar perangkat yang pernah login ke akun Anda.</p>
      </div>
      <div>
        {isLoadingSessions ? (
          <div className="p-4 text-center text-[var(--text-muted)] text-[12px]">Memuat sesi...</div>
        ) : sessions.length === 0 ? (
          <div className="p-4 text-center text-[var(--text-muted)] text-[12px]">Tidak ada riwayat sesi ditemukan.</div>
        ) : (
          <div className="w-full">
            <div className="bx-table-header px-4 border-t-0">
              <div className="bx-table-cell flex-[2]">DEVICE ID</div>
              <div className="bx-table-cell flex-[2]">LAST SEEN</div>
              <div className="bx-table-cell flex-[1] text-right">ACTION</div>
            </div>
            {sessions.map((session, idx) => (
              <div key={idx} className="bx-table-row px-4">
                <div className="bx-table-cell flex-[2] text-cyan-400 font-mono">{session.fingerprint.substring(0, 16)}...</div>
                <div className="bx-table-cell flex-[2] text-[var(--text-muted)]">{formatDate(session.lastSeenAt)}</div>
                <div className="bx-table-cell flex-[1] flex justify-end">
                  <button 
                    onClick={() => setSessionToRevoke(session.fingerprint)}
                    className="flex items-center gap-2 text-red-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={12} /> REVOKE
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderUsageView = () => {
    if (isLoadingUsage) {
      return (
        <div className="mt-4 border border-[var(--border)] bg-[var(--bg)] p-12 flex justify-center items-center text-[var(--text-muted)] text-[12px]">
          Memuat data usage...
        </div>
      );
    }

    if (!usageSummary) {
      return (
        <div className="mt-4 border border-[var(--border)] bg-[var(--bg)] p-12 flex justify-center items-center text-[var(--text-muted)] text-[12px]">
          Gagal memuat ringkasan usage atau tidak ada data.
        </div>
      );
    }

    const maxTaskTokens = usageSummary.byTaskType.length > 0 
      ? Math.max(...usageSummary.byTaskType.map(t => t.totalTokens)) 
      : 1;

    // Calculate Input vs Output Ratio
    const inputT = usageSummary.summary.totalInputTokens || 0;
    const outputT = usageSummary.summary.totalOutputTokens || 0;
    const totalT = inputT + outputT;
    const inputPercent = totalT > 0 ? (inputT / totalT) * 100 : 0;
    const outputPercent = totalT > 0 ? (outputT / totalT) * 100 : 0;

    return (
      <div className="mt-4 border border-[var(--border)] bg-[var(--bg)]">
        <div className="p-4 border-b border-[var(--border)] flex justify-between items-center">
          <div>
            <div className="bx-section-tag mb-2">
              API USAGE & CREDITS
            </div>
            <p className="text-[11px] text-[var(--text-muted)] tracking-wider">PERIOD: LAST 30 DAYS</p>
          </div>
        </div>

        {/* 3 Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border-b border-[var(--border)]">
          {/* Requests Card */}
          <div className="bx-stat-card border-l-2 border-l-cyan-400">
            <div className="bx-stat-card-title">
              <Activity size={12} className="text-cyan-400"/> REQUESTS
            </div>
            <div className="bx-stat-card-value text-cyan-400">
              {usageSummary.summary.requestCount.toLocaleString()}
            </div>
            <div className="bx-stat-card-subtitle">Total API calls</div>
          </div>
          
          {/* Tokens Used Card */}
          <div className="bx-stat-card border-l-2 border-l-orange-400">
            <div className="bx-stat-card-title">
              <Activity size={12} className="text-orange-400"/> TOKENS USED
            </div>
            <div className="bx-stat-card-value text-orange-400">
              {usageSummary.summary.totalTokens.toLocaleString()}
            </div>
            <div className="bx-stat-card-subtitle">Tokens consumed</div>
          </div>
          
          {/* Balance Card */}
          <div className="bx-stat-card border-r-0 border-l-2 border-l-green-400">
            <div className="bx-stat-card-title">
              <span className="text-green-400 font-bold">$</span> BALANCE
            </div>
            <div className="bx-stat-card-value text-green-400">
              {user?.credits || 0}
            </div>
            <div className="bx-stat-card-subtitle">Credits remaining</div>
          </div>
        </div>

        {/* Input vs Output Tokens Ratio */}
        <div className="p-4 border-b border-[var(--border)]">
          <div className="flex justify-between text-[11px] tracking-wider mb-2">
            <div className="text-cyan-400">{inputT.toLocaleString()} Input Tokens</div>
            <div className="text-[var(--text-muted)]">{totalT > 0 ? totalT.toLocaleString() : 0} Total Tokens</div>
            <div className="text-orange-400">{outputT.toLocaleString()} Output Tokens</div>
          </div>
          <div className="h-4 w-full bg-[var(--surface-alt)] border border-[var(--border)] flex">
            <div className="h-full bg-cyan-400 transition-all" style={{ width: `${inputPercent}%` }}></div>
            <div className="h-full bg-orange-400 transition-all" style={{ width: `${outputPercent}%` }}></div>
          </div>
          <div className="flex justify-between text-[10px] text-[var(--text-muted)] mt-2">
            <span>{inputPercent.toFixed(1)}% Input</span>
            <span>{outputPercent.toFixed(1)}% Output</span>
          </div>
        </div>

        {/* Top Endpoints Table */}
        <div className="p-4">
          <div className="bx-section-tag-sm mb-2">
            TOP TASKS (30 DAYS)
          </div>
          
          <div className="w-full mt-4">
            <div className="bx-table-header">
              <div className="bx-table-cell flex-[3]">ENDPOINT / TASK</div>
              <div className="bx-table-cell flex-1 text-right">CALLS</div>
              <div className="bx-table-cell flex-1 text-right">TOKENS</div>
              <div className="bx-table-cell flex-[3] text-right">USAGE</div>
            </div>
            {usageSummary.byTaskType.map((task, idx) => (
              <div key={idx} className="bx-table-row">
                <div className="bx-table-cell flex-[3] text-cyan-400 font-mono tracking-wide truncate pr-4">{task.taskType}</div>
                <div className="bx-table-cell flex-1 text-right font-bold text-[var(--text-primary)]">{task.requestCount.toLocaleString()}</div>
                <div className="bx-table-cell flex-1 text-right font-bold text-[var(--accent)]">{task.totalTokens.toLocaleString()}</div>
                <div className="bx-table-cell flex-[3] flex justify-end items-center pl-4">
                  <div className="h-2 bg-[var(--accent)] transition-all" style={{ width: `${(task.totalTokens / maxTaskTokens) * 100}%` }}></div>
                </div>
              </div>
            ))}
            {usageSummary.byTaskType.length === 0 && (
              <div className="py-4 text-center text-[12px] text-[var(--text-muted)]">
                Belum ada data penggunaan selama 30 hari terakhir.
              </div>
            )}
          </div>
        </div>

      </div>
    );
  };

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
              onClick={() => { setActiveTab(tab.id); setMessage(null); setIsEditingProfile(false); }}
              className={`flex items-center gap-2 px-4 py-2 border-r border-[var(--border)] text-[11px] font-bold tracking-wider transition-colors
                ${activeTab === tab.id ? 'text-[var(--accent)] bg-[rgba(255,170,0,0.05)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-alt)]'}`}
            >
              <tab.icon size={13} /> {tab.id}
            </button>
          ))}
        </div>

        {message && !isEditingProfile && activeTab !== "SECURITY" && (
          <div className={`p-3 mb-4 text-[12px] flex items-center gap-2 border ${
            message.type === "success" 
              ? "bg-green-500/10 border-green-500/20 text-green-500" 
              : "bg-red-500/10 border-red-500/20 text-red-500"
          }`}>
            <AlertCircle size={15} />
            {message.text}
          </div>
        )}

        {/* Content Header (e.g. PROFILE block with configure button) */}
        <div className="flex justify-between items-center bg-[#0a0a0a] border border-[var(--border)] border-l-4 border-l-[var(--accent)] px-4 py-2">
          <div className="flex items-center gap-2 text-[var(--accent)] font-bold text-[12px] tracking-widest">
            {activeTab === "PROFILE" && <User size={14} />}
            {activeTab === "SECURITY" && <Shield size={14} />}
            {activeTab}
          </div>
          {activeTab === "PROFILE" && !isEditingProfile && (
             <div className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
               <span className="text-[8px]">▶</span> CONFIGURE
             </div>
          )}
        </div>

        {/* Tab Content */}
        {activeTab === "PROFILE" && renderProfileView()}
        {activeTab === "SECURITY" && renderSecurityView()}
        {activeTab === "USAGE" && renderUsageView()}
        {activeTab === "LOGIN HISTORY" && renderLoginHistoryView()}
        {activeTab !== "PROFILE" && activeTab !== "SECURITY" && activeTab !== "LOGIN HISTORY" && activeTab !== "USAGE" && (
          <div className="border border-[var(--border)] mt-4 p-6 flex justify-center items-center text-[var(--text-muted)] text-[12px]">
            {activeTab} Configuration - Coming Soon
          </div>
        )}

      </div>
      
      {/* Custom Revoke Confirmation Modal */}
      {sessionToRevoke && (
        <div className="bx-modal-overlay">
          <div className="bx-modal bx-modal-error">
            <div className="bx-modal-header">
              <AlertCircle size={24} />
              <h3 className="bx-modal-title">REVOKE SESSION?</h3>
            </div>
            <p className="bx-modal-text">
              Aksi ini akan mencabut akses secara permanen dari perangkat tersebut. Perangkat target akan seketika di-logout. Lanjutkan?
            </p>
            <div className="bx-modal-footer">
              <button 
                onClick={() => setSessionToRevoke(null)}
                className="bx-modal-btn-cancel"
                disabled={isLoading}
              >
                CANCEL
              </button>
              <button 
                onClick={() => executeRevokeSession(sessionToRevoke)}
                className="bx-modal-btn-confirm"
                disabled={isLoading}
              >
                {isLoading ? "PROCESSING..." : "YES, REVOKE"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
