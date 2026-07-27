import { useState, type FormEvent, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { AxiosError } from "axios";
import { useToast } from "../../context/ToastContext";
import {
  updateProfile,
  changePassword,
  type AdminProfile,
  type ProfileUpdates,
} from "../../api/profile";

export const inputCls =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none";
export const btnCls =
  "rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50";

// Input password dengan toggle lihat/sembunyikan + glow merah saat error.
export function PasswordInput({
  id,
  value,
  onChange,
  hasError = false,
  autoComplete,
  placeholder,
  required = true,
  minLength,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  hasError?: boolean;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div
      className={`relative rounded-lg transition-shadow ${
        hasError ? "shadow-[0_0_0_3px_rgba(239,68,68,0.35)]" : ""
      }`}
    >
      <input
        id={id}
        type={visible ? "text" : "password"}
        className={`${inputCls} pr-10 ${hasError ? "border-red-500" : ""}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Sembunyikan password" : "Lihat password"}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

export function errMsg(err: unknown, fallback: string): string {
  return (err as AxiosError<{ error?: string }>)?.response?.data?.error || fallback;
}

export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="font-medium text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

export function ProfileForm({
  profile,
  onSaved,
}: {
  profile: AdminProfile;
  onSaved: (admin: AdminProfile, pendingEmail?: string) => void;
}) {
  const { showToast } = useToast();
  const [name, setName] = useState(profile.name ?? "");
  const [birthdate, setBirthdate] = useState(profile.birthdate?.slice(0, 10) ?? "");
  const [address, setAddress] = useState(profile.address ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [gender, setGender] = useState(profile.gender ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    try {
      const updates: ProfileUpdates = {};
      if (name.trim() !== (profile.name ?? "")) updates.name = name.trim();
      if (birthdate !== (profile.birthdate?.slice(0, 10) ?? "")) updates.birthdate = birthdate || null;
      if (address !== (profile.address ?? "")) updates.address = address || null;
      if (phone !== (profile.phone ?? "")) updates.phone = phone || null;
      if ((gender || null) !== profile.gender) updates.gender = (gender || null) as AdminProfile["gender"];
      if (bio !== (profile.bio ?? "")) updates.bio = bio || null;

      if (Object.keys(updates).length === 0) {
        showToast("Tidak ada perubahan", "info");
        return;
      }

      const res = await updateProfile(updates);
      onSaved(res.admin, res.pendingEmail);
    } catch (err) {
      showToast(errMsg(err, "Gagal memperbarui profil"), "error");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="profile-name" className="mb-1 block text-sm text-[var(--text-muted)]">
          Nama
        </label>
        <input
          id="profile-name"
          type="text"
          className={inputCls}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          required
        />
      </div>
      <div>
        <label htmlFor="profile-birthdate" className="mb-1 block text-sm text-[var(--text-muted)]">
          Tanggal Lahir
        </label>
        <input
          id="profile-birthdate"
          type="date"
          className={inputCls}
          value={birthdate}
          onChange={(e) => setBirthdate(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="profile-phone" className="mb-1 block text-sm text-[var(--text-muted)]">
          No. HP
        </label>
        <input
          id="profile-phone"
          type="tel"
          className={inputCls}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+62 812-3456-7890"
          maxLength={20}
        />
      </div>
      <div>
        <label htmlFor="profile-gender" className="mb-1 block text-sm text-[var(--text-muted)]">
          Jenis Kelamin
        </label>
        <select
          id="profile-gender"
          className={inputCls}
          value={gender ?? ""}
          onChange={(e) => setGender(e.target.value)}
        >
          <option value="">— Pilih —</option>
          <option value="male">Laki-laki</option>
          <option value="female">Perempuan</option>
          <option value="other">Lainnya</option>
        </select>
      </div>
      <div>
        <label htmlFor="profile-address" className="mb-1 block text-sm text-[var(--text-muted)]">
          Alamat
        </label>
        <textarea
          id="profile-address"
          className={inputCls}
          rows={2}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Alamat lengkap"
        />
      </div>
      <div>
        <label htmlFor="profile-bio" className="mb-1 block text-sm text-[var(--text-muted)]">
          Bio
        </label>
        <textarea
          id="profile-bio"
          className={inputCls}
          rows={3}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Tentang Anda"
        />
      </div>
      <button type="submit" className={btnCls} disabled={isSaving}>
        {isSaving ? "Menyimpan..." : "Simpan Perubahan"}
      </button>
    </form>
  );
}

// Form ganti email — terpisah dari profil karena alurnya beda: email baru
// tidak langsung aktif, backend mengirim link verifikasi ke alamat baru dulu.
export function EmailForm({
  profile,
  onPending,
}: {
  profile: AdminProfile;
  onPending: (pendingEmail: string) => void;
}) {
  const { showToast } = useToast();
  const [email, setEmail] = useState(profile.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (email.trim().toLowerCase() === profile.email.toLowerCase()) {
      showToast("Email tidak berubah", "info");
      return;
    }
    setIsSaving(true);
    setPasswordError(false);
    try {
      const res = await updateProfile({ email: email.trim(), currentPassword });
      if (res.pendingEmail) {
        onPending(res.pendingEmail);
        setCurrentPassword("");
      } else {
        showToast("Email diperbarui", "success");
      }
    } catch (err) {
      const msg = errMsg(err, "Gagal mengubah email");
      showToast(msg, "error");
      if (msg.toLowerCase().includes("password")) setPasswordError(true);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="profile-email" className="mb-1 block text-sm text-[var(--text-muted)]">
          Email Baru
        </label>
        <input
          id="profile-email"
          type="email"
          className={inputCls}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div>
        <label htmlFor="email-current-password" className="mb-1 block text-sm text-[var(--text-muted)]">
          Password Saat Ini
        </label>
        <PasswordInput
          id="email-current-password"
          value={currentPassword}
          onChange={(v) => {
            setCurrentPassword(v);
            setPasswordError(false);
          }}
          hasError={passwordError}
          autoComplete="current-password"
        />
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Demi keamanan, konfirmasi password Anda. Link verifikasi akan
          dikirim ke alamat baru; email berubah setelah Anda klik link itu.
        </p>
      </div>
      <button type="submit" className={btnCls} disabled={isSaving}>
        {isSaving ? "Mengirim..." : "Kirim Link Verifikasi"}
      </button>
    </form>
  );
}

export function PasswordForm({ onDone }: { onDone?: () => void }) {
  const { showToast } = useToast();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [oldPwError, setOldPwError] = useState(false);
  const [confirmError, setConfirmError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      showToast("Konfirmasi password tidak cocok", "error");
      setConfirmError(true);
      return;
    }
    setIsSaving(true);
    setOldPwError(false);
    try {
      await changePassword(oldPassword, newPassword);
      showToast("Password berhasil diubah. Sesi lain telah dicabut.", "success");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onDone?.();
    } catch (err) {
      const msg = errMsg(err, "Gagal mengubah password");
      showToast(msg, "error");
      if (msg.toLowerCase().includes("lama") || msg.toLowerCase().includes("salah")) {
        setOldPwError(true);
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="old-password" className="mb-1 block text-sm text-[var(--text-muted)]">
          Password Lama
        </label>
        <PasswordInput
          id="old-password"
          value={oldPassword}
          onChange={(v) => {
            setOldPassword(v);
            setOldPwError(false);
          }}
          hasError={oldPwError}
          autoComplete="current-password"
        />
      </div>
      <div>
        <label htmlFor="new-password" className="mb-1 block text-sm text-[var(--text-muted)]">
          Password Baru
        </label>
        <PasswordInput
          id="new-password"
          value={newPassword}
          onChange={setNewPassword}
          autoComplete="new-password"
          minLength={8}
        />
        <p className="mt-1 text-xs text-[var(--text-muted)]">Minimal 8 karakter.</p>
      </div>
      <div>
        <label htmlFor="confirm-password" className="mb-1 block text-sm text-[var(--text-muted)]">
          Konfirmasi Password Baru
        </label>
        <PasswordInput
          id="confirm-password"
          value={confirmPassword}
          onChange={(v) => {
            setConfirmPassword(v);
            setConfirmError(false);
          }}
          hasError={confirmError}
          autoComplete="new-password"
          minLength={8}
        />
      </div>
      <button type="submit" className={btnCls} disabled={isSaving}>
        {isSaving ? "Menyimpan..." : "Ubah Password"}
      </button>
    </form>
  );
}
