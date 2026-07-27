// @ts-nocheck
import { useState, useEffect } from "react";
import { TerminalShell } from "../components/layout/TerminalShell";
import { useAuth } from "../context/AuthContext";
import { updateProfile, changePassword } from "../api/authClient";
import { 
  Settings, User, Key, Shield, Bell, Activity, Clock, 
  Users, Edit2, CheckCircle2, ShieldAlert, BadgeInfo,
  Calendar, Phone, Mail, MapPin, FileText, Lock, Save,
  X
} from "lucide-react";

type SettingsTab = "PROFILE" | "API KEY" | "SECURITY" | "NOTIFICATIONS" | "USAGE" | "LOGIN HISTORY" | "ACCOUNT";

export function SettingsPage() {
  const { user, loginWithToken } = useAuth();
  
  // Navigation State
  const [activeTab, setActiveTab] = useState<SettingsTab>("PROFILE");
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  // Profile States (Credentials / Profile)
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [address, setAddress] = useState(user?.address || "");
  const [birthdate, setBirthdate] = useState(user?.birthdate ? new Date(user.birthdate).toISOString().split('T')[0] : "");
  const [gender, setGender] = useState(user?.gender || "");
  const [bio, setBio] = useState(user?.bio || "");
  
  // Security States
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Sync state if user context updates
  useEffect(() => {
    if (user && !isEditingProfile) {
      setName(user.name || "");
      setEmail(user.email || "");
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
      const token = localStorage.getItem("eaconsole.sessionToken");
      if (!token) throw new Error("Silakan login kembali");

      const updateData = {
        name,
        email,
        phone,
        address,
        birthdate: birthdate || null,
        gender,
        bio,
      };

      await updateProfile(token, updateData);
      await loginWithToken(token);
      setIsEditingProfile(false);
      setMessage({ type: "success", text: "Profil berhasil diperbarui!" });
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Gagal memperbarui profil" });
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
      const token = localStorage.getItem("eaconsole.sessionToken");
      if (!token) throw new Error("Silakan login kembali");

      await changePassword(token, currentPassword, newPassword);
      setMessage({ type: "success", text: "Password berhasil diubah!" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Gagal mengubah password" });
    } finally {
      setIsLoading(false);
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
              <div className="space-y-1.5">
                <label className="text-[10px] text-[var(--text-muted)] tracking-wider">FULL NAME</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full bg-transparent border border-[var(--border)] px-3 py-1.5 text-[12px] focus:border-[var(--accent)] outline-none text-[var(--accent)]" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] text-[var(--text-muted)] tracking-wider">EMAIL</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-transparent border border-[var(--border)] px-3 py-1.5 text-[12px] focus:border-[var(--accent)] outline-none text-[var(--accent)]" />
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
            { label: "PHONE", value: user?.phone || "N/A" },
            { label: "BIRTHDATE", value: user?.birthdate ? formatDate(user.birthdate) : "N/A" },
            { label: "GENDER", value: user?.gender ? (user.gender.charAt(0).toUpperCase() + user.gender.slice(1)) : "N/A" },
            { label: "ADDRESS", value: user?.address || "N/A" },
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
          <div className="text-[28px] font-bold text-cyan-400 leading-none mb-1">0.0</div>
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
        {activeTab !== "PROFILE" && activeTab !== "SECURITY" && (
          <div className="border border-[var(--border)] mt-4 p-8 flex justify-center items-center text-[var(--text-muted)] text-[12px]">
            {activeTab} Configuration - Coming Soon
          </div>
        )}

      </div>
    </TerminalShell>
  );
}
