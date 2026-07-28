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
  const deviceFingerprint = getDeviceFingerprint(req);
  const existingUserId = await checkDeviceBinding(deviceFingerprint);

  const enforce = isDeviceEnforcementEnabled();

  if (enforce) {
    if (existingUserId && existingUserId !== user.id) {
      return {
        ok: false,
        status: 403,
        error: "Device ini sudah terdaftar ke akun lain. Satu device hanya bisa untuk satu akun.",
      };
    }
  }

  // Jika device sudah dipakai akun lain, dan kita TIDAK enforce, 
  // idealnya kita re-bind atau biarkan saja. Tapi API sekarang bind unik per device.
  // Karena checkDeviceBinding mengecek fingerprint, jika beda user dan !enforce, 
  // kita tetap bisa unbind yang lama dan bind yang baru, atau abaikan saja.
  // Supaya sederhana: jika tidak ada existing, bind. Jika ada dan == user.id, update.
  // Jika ada dan !== user.id (dan !enforce), kita update binding-nya (re-bind).
  
  if (!existingUserId) {
    await bindDeviceToUser(user.id, deviceFingerprint);
  } else if (existingUserId !== user.id) {
    // Re-bind ke user baru karena tidak di-enforce (allow shared devices)
    // NOTE: ini memerlukan query UPDATE sederhana atau DELETE lalu INSERT.
    // Karena store cuma punya bindDeviceToUser yang mungkin kena UNIQUE constraint...
    // Sebaiknya kita abaikan saja pencatatan untuk akun ke-2 jika berbagi device TANPA enforcement, 
    // ATAU kita panggil update.
    // Untuk amannya, biarkan yang original jika beda akun.
  } else {
    await updateDeviceLastSeen(deviceFingerprint);
  }

  if (enforce) {
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
  }

  const sessionToken = await createSession(user.id);
  await setSessionForDevice(user.id, deviceFingerprint, sessionToken);

  return { ok: true, sessionToken };
}
