import { useEffect, useState } from "react";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { useToast } from "../context/ToastContext";
import { fetchProfile, type AdminProfile } from "../api/profile";
import {
  ProfileForm,
  EmailForm,
  PasswordForm,
  Row,
  errMsg,
} from "../components/profile/ProfileForms";

export function ProfilePage() {
  const { showToast } = useToast();
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchProfile()
      .then(({ admin }) => setProfile(admin))
      .catch((err) => showToast(errMsg(err, "Gagal memuat profil"), "error"))
      .finally(() => setIsLoading(false));
  }, [showToast]);

  // Dari Topbar "Ganti Password" (/profile#password) — scroll ke card password.
  useEffect(() => {
    if (!isLoading && window.location.hash === "#password") {
      document.getElementById("password")?.scrollIntoView({ behavior: "smooth" });
    }
  }, [isLoading]);

  if (isLoading || !profile) {
    return (
      <DashboardLayout title="Profil Admin">
        <p className="text-[var(--text-muted)]">Memuat...</p>
      </DashboardLayout>
    );
  }

  const initials = (profile.name || profile.email)
    .split(/[\s@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

  return (
    <DashboardLayout title="Profil Admin">
      {/* Header identitas — pola GitHub: avatar + nama + email + badge */}
      <div className="mb-6 flex items-center gap-4">
        <div
          aria-hidden
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-xl font-semibold text-white"
        >
          {initials}
        </div>
        <div>
          <h2 className="font-display text-xl font-semibold">
            {profile.name || profile.email}
          </h2>
          <p className="text-sm text-[var(--text-muted)]">{profile.email}</p>
          <div className="mt-1 flex gap-2">
            <Badge variant={profile.status === "active" ? "success" : "danger"}>
              {profile.status}
            </Badge>
            <Badge variant={profile.email_verified ? "success" : "warning"}>
              {profile.email_verified ? "Email terverifikasi" : "Email belum terverifikasi"}
            </Badge>
            <Badge variant="info">Admin</Badge>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Profil">
          <ProfileForm
            profile={profile}
            onSaved={(admin) => {
              setProfile(admin);
              showToast("Profil berhasil diperbarui", "success");
            }}
          />
        </Card>

        <div className="space-y-4">
          <Card title="Keamanan">
            <div className="space-y-6">
              <section>
                <h3 className="mb-3 text-sm font-medium text-[var(--text-muted)]">
                  Ganti Email
                </h3>
                <EmailForm
                  profile={profile}
                  onPending={(newEmail) => {
                    showToast(`Link verifikasi dikirim ke ${newEmail}. Email berubah setelah Anda klik link tersebut.`, "info");
                  }}
                />
              </section>
              <hr className="border-[var(--border)]" />
              <section id="password" className="scroll-mt-6">
                <h3 className="mb-3 text-sm font-medium text-[var(--text-muted)]">
                  Ubah Password
                </h3>
                <PasswordForm />
              </section>
            </div>
          </Card>

          <Card title="Info Akun">
            <dl className="space-y-2 text-sm">
              <Row label="Status" value={
                <Badge variant={profile.status === "active" ? "success" : "danger"}>{profile.status}</Badge>
              } />
              <Row label="Email Terverifikasi" value={
                <Badge variant={profile.email_verified ? "success" : "warning"}>
                  {profile.email_verified ? "Ya" : "Belum"}
                </Badge>
              } />
              <Row label="Terdaftar" value={new Date(profile.created_at).toLocaleDateString("id-ID")} />
              <Row label="Login Terakhir" value={
                profile.last_active
                  ? new Date(profile.last_active).toLocaleString("id-ID")
                  : "-"
              } />
            </dl>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
