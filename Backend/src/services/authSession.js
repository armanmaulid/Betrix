import { getDeviceFingerprint } from "../utils/deviceFingerprint.js";
import { checkDeviceBinding, bindDeviceToUser, updateDeviceLastSeen } from "./deviceStore.js";
import { getSessionByDevice, setSessionForDevice } from "./deviceSessionStore.js";
import { createSession, validateSession } from "./sessionStore.js";
import { isDeviceEnforcementEnabled } from "../utils/deviceEnforcement.js";

// FIX (redundansi): logic "cek device binding -> bind/update last seen ->
// cek session aktif di device ini -> buat session baru -> track device
// session" sebelumnya di-copy-paste HAMPIR IDENTIK di dua tempat berbeda
// (POST /login dan GET /google/callback di routes/auth.js). Selain bikin
// file itu panjang, kalau logic device enforcement berubah harus diubah di
// 2 tempat sekaligus dan gampang drift. Sekarang jadi satu fungsi di sini,
// dipakai kedua alur login (password & Google OAuth).
//
// Perilaku dipertahankan PERSIS SAMA seperti kode asli — cuma dipindah,
// bukan diubah logicnya.
//
// Return shape:
//   { ok: true, sessionToken }
//   { ok: false, status, error, hasActiveSession? }
export async function establishAuthenticatedSession(user, req) {
  if (!isDeviceEnforcementEnabled()) {
    const sessionToken = await createSession(user.id);
    return { ok: true, sessionToken };
  }

  const deviceFingerprint = getDeviceFingerprint(req);
  const existingUserId = await checkDeviceBinding(deviceFingerprint);

  if (existingUserId && existingUserId !== user.id) {
    return {
      ok: false,
      status: 403,
      error: "Device ini sudah terdaftar ke akun lain. Satu device hanya bisa untuk satu akun.",
    };
  }

  if (!existingUserId) {
    await bindDeviceToUser(user.id, deviceFingerprint);
  } else {
    await updateDeviceLastSeen(deviceFingerprint);
  }

  // Cek apakah sudah ada session aktif untuk device ini
  const existingSessionToken = await getSessionByDevice(user.id, deviceFingerprint);
  if (existingSessionToken) {
    const sessionUser = await validateSession(existingSessionToken);
    if (sessionUser) {
      return {
        ok: false,
        status: 409,
        error: "Anda sudah login dari device ini. Logout terlebih dahulu untuk login ulang.",
        hasActiveSession: true,
      };
    }
  }

  const sessionToken = await createSession(user.id);
  await setSessionForDevice(user.id, deviceFingerprint, sessionToken);

  return { ok: true, sessionToken };
}
