import { apiClient } from "./client";

export interface AdminProfile {
  id: string;
  email: string;
  name: string;
  is_admin: boolean;
  status: string;
  email_verified: boolean;
  created_at: string;
  last_active: string | null;
  birthdate: string | null;
  address: string | null;
  phone: string | null;
  gender: "male" | "female" | "other" | null;
  bio: string | null;
}

export type ProfileUpdates = Partial<
  Pick<AdminProfile, "name" | "email" | "birthdate" | "address" | "phone" | "gender" | "bio">
> & { currentPassword?: string }; // wajib saat mengganti email

export async function fetchProfile(): Promise<{ admin: AdminProfile }> {
  const { data } = await apiClient.get<{ admin: AdminProfile }>("/admin/me");
  return data;
}

export async function updateProfile(
  updates: ProfileUpdates
): Promise<{ admin: AdminProfile; message?: string; pendingEmail?: string }> {
  const { data } = await apiClient.patch("/admin/me", updates);
  return data;
}

export async function changePassword(
  oldPassword: string,
  newPassword: string
): Promise<{ message: string }> {
  const { data } = await apiClient.post("/admin/me/change-password", {
    oldPassword,
    newPassword,
  });
  return data;
}

// Verifikasi ganti email terjadi langsung saat user klik link di email
// (GET /api/admin/me/verify-email) — tidak ada pemanggilan API dari frontend.

