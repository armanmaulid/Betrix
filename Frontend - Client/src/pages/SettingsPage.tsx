import { useState, useEffect } from "react";
import { TerminalShell } from "../components/layout/TerminalShell";
import { useAuth } from "../context/AuthContext";
import { updateProfile, changePassword, changeEmail, getSessions, revokeSession, type DeviceSession } from "../api/authClient";
import { 
  Settings, User, Key, Shield, Bell, Activity, Clock, 
  Users, Edit2, CheckCircle2, ShieldAlert, BadgeInfo,
  Calendar, Lock, Save, X, AlertCircle, Trash2, Smartphone
} from "lucide-react";

type SettingsTab = "PROFILE" | "API KEY" | "SECURITY" | "NOTIFICATIONS" | "USAGE" | "LOGIN HISTORY" | "ACCOUNT";

export function SettingsPage() {
  const { user } = useAuth();
  const sessionToken = localStorage.getItem("eaconsole.sessionToken") || "";
  
  // Navigation State
  const [activeTab, setActiveTab] = useState<SettingsTab>("PROFILE");
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  // Profile States (Credentials / Profile)
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState((user as any)?.phone || "");
  const [address, setAddress] = useState((user as any)?.address || "");
  const [birthdate, setBirthdate] = useState((user as any)?.birthdate ? new Date((user as any).birthdate).toISOString().split('T')[0] : "");
  const [gender, setGender] = useState((user as any)?.gender || "");
  const [bio, setBio] = useState((user as any)?.bio || "");
  
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

  useEffect(() => {
    if (activeTab === "LOGIN HISTORY") {
      fetchSessions();
    }
  }, [activeTab]);

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
      setPhone((user as any).phone || "");
      setAddress((user as any).address || "");
      setBirthdate((user as any).birthdate ? new Date((user as any).birthdate).toISOString().split('T')[0] : "");
      setGender((user as any).gender || "");
      setBio((user as any).bio || "");
    }
  }, [user, isEditingProfile]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);
    try {
      await updateProfile(sessionToken, { name, phone, address, birthdate, gender, bio });
      setMessage({ type: "success", text: "Profil berhasil diperbarui. Halaman akan dimuat ulang..." });
      setTimeout(() => window.location.reload(), 1500);
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
      await changeEmail(sessionToken, emailCurrentPassword, emailToChange);
      setMessage({ type: "success", text: "Email berhasil diubah! Halaman akan dimuat ulang..." });
      setTimeout(() => window.location.reload(), 1500);
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
            <h3 className="text-[var(--accent)] font-bold">EDIT PROFILE</h3>
            <button 
              onClick={() => setIsEditingProfile(false)}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <X size={16} />
            </button>
          </div>
          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
          <div className="flex-1 p-4 border-l-2 border-green-500 md:border-r md:border-[var(--border)]">
            <div className="text-[10px] text-[var(--text-muted)] tracking-wider mb-2">VERIFICATION</div>
            <div className="flex items-center gap-1.5 text-green-500 font-bold text-[12px]">
              <CheckCircle2 size={14} /> {user?.emailVerified ? "VERIFIED" : "UNVERIFIED"}
            </div>
          </div>
          <div className="flex-1 p-4 border-l-2 border-[var(--accent)] md:border-r md:border-[var(--border)]">
            <div className="text-[10px] text-[var(--text-muted)] tracking-wider mb-2">TWO-FACTOR AUTH</div>
            <div className="flex items-center gap-1.5 text-[var(--accent)] font-bold text-[12px]">
              <ShieldAlert size={14} /> DISABLED
            </div>
          </div>
          <div className="flex-1 p-4 border-l-2 border-cyan-400">
            <div className="text-[10px] text-[var(--text-muted)] tracking-wider mb-2">ACCOUNT TYPE</div>
            <div className="flex items-center gap-1.5 text-cyan-400 font-bold text-[12px]">
              <BadgeInfo size={14} /> FREE
            </div>
          </div>
        </div>

        {/* User Information Label */}
        <div className="flex justify-between items-center mt-6 mb-0">
          <div className="bg-[var(--accent)] text-black px-3 py-1 text-[11px] font-bold tracking-wider inline-block">
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
        <div className="border border-[var(--border)] bg-[var(--bg)] mt-0 divide-y divide-[var(--border)]">
          {[
            { label: "NAME", value: user?.name || "N/A" },
            { label: "EMAIL", value: user?.email || "N/A" },
            { label: "PHONE", value: (user as any)?.phone || "N/A" },
            { label: "BIRTHDATE", value: (user as any)?.birthdate ? formatDate((user as any).birthdate) : "N/A" },
            { label: "GENDER", value: (user as any)?.gender ? ((user as any).gender.charAt(0).toUpperCase() + (user as any).gender.slice(1)) : "N/A" },
            { label: "ADDRESS", value: (user as any)?.address || "N/A" },
          ].map((item, idx) => (
            <div key={idx} className="flex p-4 items-center">
              <div className="w-48 text-[11px] text-[var(--text-muted)] tracking-wider">{item.label}</div>
              <div className="text-[12px] text-[var(--accent)]">{item.value}</div>
            </div>
          ))}
        </div>

        {/* Bottom Panels */}
        <div className="flex flex-col md:flex-row gap-0 mt-6 border border-[var(--border)]">
          <div className="flex-1 p-4 border-b md:border-b-0 md:border-r border-[var(--border)]">
            <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] tracking-wider mb-2">
              <Calendar size={12} /> MEMBER SINCE
            </div>
            <div className="text-green-500 font-bold text-[14px]">
              {formatDate((user as any)?.createdAt || new Date().toISOString())}
            </div>
          </div>
          <div className="flex-1 p-4">
            <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] tracking-wider mb-2">
              <Clock size={12} /> LAST LOGIN
            </div>
            <div className="text-[var(--accent)] font-bold text-[14px]">
              {formatDate((user as any)?.lastActive || new Date().toISOString())}
            </div>
          </div>
        </div>

        {/* Credits Panel */}
        <div className="border border-[var(--border)] mt-6 p-6 border-l-2 border-l-cyan-400">
          <div className="text-[28px] font-bold text-cyan-400 leading-none mb-1">{user?.credits || 0}</div>
          <div className="text-[10px] text-[var(--text-muted)] tracking-wider">AVAILABLE CREDITS</div>
        </div>
      </>
    );
  };

  const renderSecurityView = () => (
    <div className="mt-4 border border-[var(--border)] p-6 bg-[var(--bg)]">
      <div className="mb-6">
        <h2 className="text-[16px] font-bold text-[var(--accent)] mb-1">CHANGE PASSWORD</h2>
        <p className="text-[12px] text-[var(--text-muted)]">Ensure your account is using a long, random password to stay secure.</p>
      </div>

      <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
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

      <div className="mt-10 mb-6">
        <h2 className="text-[16px] font-bold text-[var(--accent)] mb-1">CHANGE EMAIL</h2>
        <p className="text-[12px] text-[var(--text-muted)]">Update your account email address. Requires your current password.</p>
      </div>

      <form onSubmit={handleChangeEmail} className="space-y-4 max-w-md">
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
  );

  const renderLoginHistoryView = () => (
    <div className="mt-4 border border-[var(--border)] bg-[var(--bg)]">
      <div className="p-6 border-b border-[var(--border)]">
        <h2 className="text-[16px] font-bold text-[var(--accent)] mb-1">ACTIVE SESSIONS</h2>
        <p className="text-[12px] text-[var(--text-muted)]">Lihat daftar perangkat yang pernah login ke akun Anda.</p>
      </div>
      <div className="divide-y divide-[var(--border)]">
        {isLoadingSessions ? (
          <div className="p-6 text-center text-[var(--text-muted)] text-[12px]">Memuat sesi...</div>
        ) : sessions.length === 0 ? (
          <div className="p-6 text-center text-[var(--text-muted)] text-[12px]">Tidak ada riwayat sesi ditemukan.</div>
        ) : (
          sessions.map((session, idx) => (
            <div key={idx} className="p-4 flex items-center justify-between hover:bg-[var(--surface-alt)]">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 flex items-center justify-center bg-[var(--surface)] text-[var(--text-muted)] border border-[var(--border)]">
                  <Smartphone size={20} />
                </div>
                <div>
                  <div className="text-[12px] font-bold text-[var(--accent)] tracking-wider">Device ID: {session.fingerprint.substring(0, 16)}...</div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-1">Last Seen: {formatDate(session.lastSeenAt)}</div>
                </div>
              </div>
              <button 
                onClick={() => setSessionToRevoke(session.fingerprint)}
                className="flex items-center gap-2 text-red-500 border border-red-500/20 px-3 py-1.5 text-[11px] font-bold hover:bg-red-500 hover:text-black transition-colors"
              >
                <Trash2 size={12} /> REVOKE
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const renderUsageView = () => (
    <div className="mt-4 border border-[var(--border)] bg-[var(--bg)]">
      <div className="p-6 border-b border-[var(--border)] flex justify-between items-center">
        <div>
          <h2 className="text-[16px] font-bold text-[var(--accent)] mb-1">API USAGE & CREDITS</h2>
          <p className="text-[12px] text-[var(--text-muted)]">Ringkasan penggunaan kredit AI Anda selama bulan ini.</p>
        </div>
        <div className="text-right">
          <div className="text-[24px] font-bold text-cyan-400 leading-none">{user?.credits || 0}</div>
          <div className="text-[10px] text-[var(--text-muted)] tracking-wider">REMAINING</div>
        </div>
      </div>
      <div className="p-6">
        <div className="h-48 w-full border border-[var(--border)] flex items-end gap-2 p-4 justify-between" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(255,170,0,0.02) 100%)" }}>
          {[30, 45, 20, 60, 80, 40, 90, 50, 70, 45, 60, 30].map((h, i) => (
            <div key={i} className="w-full bg-[var(--accent)] opacity-80 hover:opacity-100 transition-opacity" style={{ height: `${h}%` }}></div>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-[var(--text-muted)] mt-2">
          <span>Day 1</span>
          <span>Day 30</span>
        </div>
      </div>
      <div className="p-6 border-t border-[var(--border)] text-[12px] text-[var(--text-muted)]">
        * Grafik di atas adalah pratinjau statis. Integrasi API usage sedang dikerjakan.
      </div>
    </div>
  );

  return (
    <TerminalShell onSearchSymbol={() => {}}>
      <div className="flex flex-col flex-1 h-full overflow-y-auto bg-[var(--bg)] p-4 md:p-6 text-[var(--text-primary)] font-mono">
        
        {/* Page Header */}
        <div className="mb-4">
          <div className="inline-flex items-center gap-2 bg-[var(--accent)] text-black px-3 py-1 text-[12px] font-bold tracking-wider">
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
          <div className="border border-[var(--border)] mt-4 p-8 flex justify-center items-center text-[var(--text-muted)] text-[12px]">
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
    </TerminalShell>
  );
}
