// Talks to the main "Arman" backend (Express + Postgres + Redis sessions) —
// NOT marketClient (that one's candle/calendar data only, see marketClient.ts).
// Session model: server returns a random 64-hex session token on login,
// frontend attaches it as `Authorization: Bearer <token>` on every
// subsequent request. No cookies, no refresh tokens — a single 24h-TTL
// token per device (see sessionStore.js / deviceSessionStore.js).
// Base URL to backend Express server. Defaults to Vite dev proxy target or local.
const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export function getGoogleOAuthUrl(): string {
  return `${BACKEND_URL}/api/v1/auth/google`;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  phone?: string;
  address?: string;
  birthdate?: string;
  gender?: string;
  bio?: string;
  isAdmin: boolean;
  status?: string;
  emailVerified?: boolean;
  credits?: number;
  createdAt?: string;
  lastActive?: string;
}

export interface DeviceSession {
  fingerprint: string;
  lastSeenAt: string;
}

export interface LoginSuccess {
  sessionToken: string;
  user: AuthUser;
}

// Carries the extra flags the backend sends on specific 403/409 responses
// so pages can render the right follow-up action instead of just an error
// string (e.g. "resend verification" vs "logout other device").
export class AuthApiError extends Error {
  status: number;
  needsVerification: boolean;
  hasActiveSession: boolean;

  constructor(
    message: string,
    status: number,
    extra?: { needsVerification?: boolean; hasActiveSession?: boolean }
  ) {
    super(message);
    this.name = "AuthApiError";
    this.status = status;
    this.needsVerification = extra?.needsVerification ?? false;
    this.hasActiveSession = extra?.hasActiveSession ?? false;
  }
}

async function parseErrorAndThrow(res: Response): Promise<never> {
  const body = await res.json().catch(() => null);
  throw new AuthApiError(body?.error || `Request gagal (${res.status})`, res.status, {
    needsVerification: body?.needsVerification,
    hasActiveSession: body?.hasActiveSession,
  });
}

// POST /api/auth/register
// NOTE: backend SENGAJA membalas dengan pesan sukses generik yang sama baik
// email-nya baru maupun sudah terdaftar (anti email-enumeration). Jangan
// pernah render UI yang menyiratkan salah satu dari dua kemungkinan itu —
// arahkan user ke "cek email kamu" tanpa embel-embel lain.
export async function register(
  email: string,
  password: string,
  name?: string
): Promise<{ message: string }> {
  const res = await fetch(`${BACKEND_URL}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

// POST /api/auth/login
// Bisa gagal dengan beberapa alasan berbeda — lihat AuthApiError di atas:
// 401 kredensial salah, 429 locked, 403 needsVerification, 403 device
// terikat akun lain, atau 409 hasActiveSession (device ini masih login).
export async function login(email: string, password: string): Promise<LoginSuccess> {
  const res = await fetch(`${BACKEND_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

// POST /api/auth/logout — cabut satu session (device ini) pakai token-nya.
export async function logout(sessionToken: string): Promise<{ message: string }> {
  const res = await fetch(`${BACKEND_URL}/api/v1/auth/logout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionToken }),
  });
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

// POST /api/auth/logout-by-credentials — cabut session device ini TANPA
// perlu token yang masih tersimpan (verifikasi pakai email+password).
// Dipakai khusus untuk alur "409 hasActiveSession" di halaman login: user
// coba login dari device yang sama sementara session lama masih aktif,
// jadi kita perlu cara logout yang tidak butuh token lama.
export async function logoutByCredentials(
  email: string,
  password: string
): Promise<{ message: string }> {
  const res = await fetch(`${BACKEND_URL}/api/v1/auth/logout-by-credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

// POST /api/auth/resend-verification
export async function resendVerification(email: string): Promise<{ message: string }> {
  const res = await fetch(`${BACKEND_URL}/api/v1/auth/resend-verification`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

// GET /api/auth/me — dipakai buat restore sesi saat app di-refresh: kalau
// ada token tersimpan, validasi dia masih hidup dan ambil data user terbaru.
export async function fetchMe(sessionToken: string): Promise<{ user: AuthUser }> {
  const res = await fetch(`${BACKEND_URL}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

export async function updateProfile(sessionToken: string, profileData: Partial<AuthUser>): Promise<AuthUser> {
  const res = await fetch(`${BACKEND_URL}/api/v1/auth/profile`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`
    },
    body: JSON.stringify(profileData)
  });
  if (!res.ok) return parseErrorAndThrow(res);
  const data = await res.json();
  return data.user;
}

export async function changePassword(sessionToken: string, currentPassword: string, newPassword: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/v1/auth/password`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`
    },
    body: JSON.stringify({ currentPassword, newPassword })
  });
  if (!res.ok) return parseErrorAndThrow(res);
}

export async function changeEmail(sessionToken: string, currentPassword: string, newEmail: string): Promise<{ pendingEmail: string }> {
  const res = await fetch(`${BACKEND_URL}/api/v1/auth/email`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`
    },
    body: JSON.stringify({ currentPassword, newEmail })
  });
  if (!res.ok) return parseErrorAndThrow(res);
  const data = await res.json();
  return { pendingEmail: data.pendingEmail };
}

export async function getSessions(sessionToken: string): Promise<DeviceSession[]> {
  const res = await fetch(`${BACKEND_URL}/api/v1/auth/sessions`, {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
  if (!res.ok) return parseErrorAndThrow(res);
  const data = await res.json();
  return data.devices;
}

export async function revokeSession(sessionToken: string, fingerprint: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/v1/auth/sessions/${encodeURIComponent(fingerprint)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
  if (!res.ok) return parseErrorAndThrow(res);
}
