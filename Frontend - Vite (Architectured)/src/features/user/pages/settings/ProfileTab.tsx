import { useState, useEffect } from "react";
import { updateProfile } from "../../../auth/api/authClient";
import type { AuthUser } from "../../../auth/api/authClient";
import {
  Edit2, CheckCircle2, ShieldAlert, BadgeInfo,
  Calendar, Clock, Save, X, AlertCircle,
} from "lucide-react";

function formatDate(dateStr?: string): string {
  if (!dateStr) return "N/A";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface ProfileTabProps {
  user: AuthUser | null;
  setUser: (user: AuthUser) => void;
  sessionToken: string;
}

export function ProfileTab({ user, setUser, sessionToken }: ProfileTabProps) {
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [address, setAddress] = useState(user?.address || "");
  const [birthdate, setBirthdate] = useState(user?.birthdate ? new Date(user.birthdate).toISOString().split("T")[0] : "");
  const [gender, setGender] = useState(user?.gender || "");
  const [bio, setBio] = useState(user?.bio || "");

  // Sync state if user context updates
  useEffect(() => {
    if (user && !isEditingProfile) {
      setName(user.name || "");
      setPhone(user.phone || "");
      setAddress(user.address || "");
      setBirthdate(user.birthdate ? new Date(user.birthdate).toISOString().split("T")[0] : "");
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
      setUser(updatedUser);
      setMessage({ type: "success", text: "Profil berhasil diperbarui." });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Terjadi kesalahan" });
    } finally {
      setIsLoading(false);
    }
  };

  if (isEditingProfile) {
    return (
      <div className="border border-[var(--border)] p-4 bg-[var(--bg)] mt-4">
        <div className="flex justify-between items-center mb-6">
          <div className="bx-section-tag">EDIT PROFILE</div>
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
              <label htmlFor="settings-name" className="text-[10px] text-[var(--text-muted)] tracking-wider">FULL NAME</label>
              <input id="settings-name" type="text" value={name} onChange={e => setName(e.target.value)} className="w-full bg-transparent border border-[var(--border)] px-3 py-1.5 text-[12px] focus:border-[var(--accent)] outline-none text-[var(--accent)]" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="settings-phone" className="text-[10px] text-[var(--text-muted)] tracking-wider">PHONE</label>
              <input id="settings-phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="w-full bg-transparent border border-[var(--border)] px-3 py-1.5 text-[12px] focus:border-[var(--accent)] outline-none text-[var(--accent)]" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="settings-birthdate" className="text-[10px] text-[var(--text-muted)] tracking-wider">BIRTHDATE</label>
              <input id="settings-birthdate" type="date" value={birthdate} onChange={e => setBirthdate(e.target.value)} className="w-full bg-transparent border border-[var(--border)] px-3 py-1.5 text-[12px] focus:border-[var(--accent)] outline-none text-[var(--accent)]" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="settings-gender" className="text-[10px] text-[var(--text-muted)] tracking-wider">GENDER</label>
              <select id="settings-gender" value={gender} onChange={e => setGender(e.target.value)} className="w-full bg-black text-[var(--accent)] border border-[var(--border)] px-3 py-1.5 text-[12px] focus:border-[var(--accent)] outline-none">
                <option value="">Select...</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="settings-address" className="text-[10px] text-[var(--text-muted)] tracking-wider">ADDRESS</label>
              <input id="settings-address" type="text" value={address} onChange={e => setAddress(e.target.value)} className="w-full bg-transparent border border-[var(--border)] px-3 py-1.5 text-[12px] focus:border-[var(--accent)] outline-none text-[var(--accent)]" />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label htmlFor="settings-bio" className="text-[10px] text-[var(--text-muted)] tracking-wider">BIO</label>
              <textarea id="settings-bio" value={bio} onChange={e => setBio(e.target.value)} rows={3} className="w-full bg-transparent border border-[var(--border)] px-3 py-1.5 text-[12px] focus:border-[var(--accent)] outline-none text-[var(--accent)] resize-none"></textarea>
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
      {message && (
        <div className={`p-3 mb-4 text-[12px] flex items-center gap-2 border ${
          message.type === "success"
            ? "bg-green-500/10 border-[var(--success)]/20 text-[var(--success)]"
            : "bg-red-500/10 border-red-500/20 text-red-500"
        }`}>
          <AlertCircle size={15} />
          {message.text}
        </div>
      )}

      {/* Status Panels */}
      <div className="flex flex-col md:flex-row gap-0 border border-[var(--border)] mt-4">
        <div className="bx-stat-card flex-1 border-l-2 border-[var(--success)]">
          <div className="bx-stat-card-title">VERIFICATION</div>
          <div className="flex items-center gap-1.5 text-[var(--success)] font-bold text-[14px]">
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
        <div className="bx-section-tag">USER INFORMATION</div>
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
          <div className="bx-stat-card-value text-[var(--success)]">
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
}
