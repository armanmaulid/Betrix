import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { findByEmail, createUser, findById, deleteUser } from "../services/userStore.js";
import { createSession, revokeSession, revokeAllUserSessions, validateSession } from "../services/sessionStore.js";
import { getDeviceFingerprint } from "../utils/deviceFingerprint.js";
import { checkDeviceBinding, bindDeviceToUser } from "../services/deviceStore.js";
import { isAccountLocked, recordFailedLogin, clearFailedLogins } from "../services/loginAttemptStore.js";
import { getSessionByDevice, removeSessionForDevice } from "../services/deviceSessionStore.js";
import { createVerificationToken, invalidateUserTokens, verifyToken } from "../services/verificationStore.js";
import { sendVerificationEmail, sendEmail } from "../services/emailService.js";
import { logger } from "../utils/logger.js";
import { isDeviceEnforcementEnabled } from "../utils/deviceEnforcement.js";
import { logUserActivity } from "../services/activityLogger.js";
import { establishAuthenticatedSession } from "../services/authSession.js";
import { redis } from "../db/redis.js";
import passport from "../config/passport.js";
import { addClient } from "../services/sseManager.js";

const router = Router();

function frontendUrl() {
  return process.env.FRONTEND_URL || "http://localhost:5173";
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// POST /api/auth/register
// body: { email, password, name? }
router.post("/register", async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: "Email tidak valid" });
  }
  if (!password || password.length < 8) {
    return res.status(400).json({ error: "Password minimal 8 karakter" });
  }

  try {
    if (isDeviceEnforcementEnabled()) {
      const deviceFingerprint = getDeviceFingerprint(req);
      const existingUserId = await checkDeviceBinding(deviceFingerprint);

      if (existingUserId) {
        return res.status(403).json({
          error: "Device ini sudah terdaftar ke akun lain. Satu device hanya bisa untuk satu akun."
        });
      }
    }

    const existingUser = await findByEmail(email);

    if (existingUser) {
      await bcrypt.hash(password, 10);
      sendEmail({
        to: existingUser.email,
        subject: "Percobaan Registrasi dengan Email Anda",
        text:
          "Seseorang baru saja mencoba mendaftar akun baru menggunakan email ini.\n\n" +
          "Kalau ini kamu dan lupa sudah pernah daftar, silakan gunakan fitur lupa password " +
          "untuk masuk ke akun yang sudah ada.\n\n" +
          "Kalau bukan kamu yang melakukan ini, abaikan saja email ini — tidak ada akun baru " +
          "yang dibuat dan akunmu tetap aman.",
        html:
          "<p>Seseorang baru saja mencoba mendaftar akun baru menggunakan email ini.</p>" +
          "<p>Kalau ini kamu dan lupa sudah pernah daftar, silakan gunakan fitur lupa password " +
          "untuk masuk ke akun yang sudah ada.</p>" +
          "<p>Kalau bukan kamu yang melakukan ini, abaikan saja email ini — tidak ada akun baru " +
          "yang dibuat dan akunmu tetap aman.</p>",
      }).catch((err) => {
        logger.error("Gagal kirim notifikasi duplicate register", {
          email: existingUser.email,
          error: err.message,
        });
      });

      return res.status(201).json({
        message: "Registrasi berhasil diproses. Silakan cek email Anda.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await createUser({ email, passwordHash, name });

    if (isDeviceEnforcementEnabled()) {
      const deviceFingerprint = getDeviceFingerprint(req);
      try {
        await bindDeviceToUser(user.id, deviceFingerprint);
      } catch (err) {
        if (err.message === "Device_Bound_To_Other") {
          // FIX (concurrency): checkDeviceBinding() di atas dan bindDeviceToUser()
          // di sini punya jendela waktu di antaranya — dua registrasi bersamaan
          // dari device yang sama bisa sama-sama lolos pengecekan awal sebelum
          // salah satunya menang race di bindDeviceToUser (yang sudah pakai
          // SELECT ... FOR UPDATE). Yang kalah race sampai di sini dengan user
          // row yang SUDAH terlanjur dibuat tapi device-nya gagal di-bind —
          // kalau dibiarkan, akun ini tetap bisa login normal tanpa pernah
          // benar-benar lolos "1 device = 1 akun". Jadi di-rollback (dihapus)
          // supaya registrasi ini benar-benar gagal total, bukan gagal
          // sebagian.
          await deleteUser(user.id).catch((delErr) =>
            logger.error("Gagal rollback user setelah device bind gagal (race condition)", {
              userId: user.id,
              error: delErr.message,
            })
          );
          return res.status(403).json({
            error: "Device ini sudah terdaftar ke akun lain."
          });
        }
        throw err;
      }
    }

    const token = await createVerificationToken(user.id);
    const emailResult = await sendVerificationEmail(user.email, token);

    if (!emailResult.success) {
      logger.warn("Failed to send verification email", {
        userId: user.id,
        email: user.email,
        error: emailResult.error
      });
    }

    res.status(201).json({
      message: "Registrasi berhasil diproses. Silakan cek email Anda.",
    });

    logUserActivity({
      userId: user.id,
      action: "register",
      details: { email: user.email, name: user.name ?? null },
      ip: req.normalizedIP || req.ip,
      userAgent: req.headers["user-agent"] ?? null,
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(201).json({
        message: "Registrasi berhasil diproses. Silakan cek email Anda.",
      });
    }
    console.error("[POST /api/auth/register] error:", err.message);
    res.status(500).json({ error: "Gagal mendaftarkan user" });
  }
});

// POST /api/auth/login
// body: { email, password }
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email dan password wajib diisi" });
  }

  try {
    const clientIP = req.normalizedIP || req.ip;

    if (await isAccountLocked(email, clientIP)) {
      return res.status(429).json({
        error: "Terlalu banyak percobaan login gagal. Coba lagi dalam 15 menit."
      });
    }

    const user = await findByEmail(email);
    if (!user) {
      await recordFailedLogin(email, clientIP);
      await bcrypt.compare(password, "$2a$10$vI8aWBnW3fID.ZQ4/zo1G.q1lRps.9cGLcZEiGDMVr5yUP1KUOYTa");
      return res.status(401).json({ error: "Email atau password salah" });
    }

    if (!user.passwordHash) {
      await recordFailedLogin(email, clientIP);
      return res.status(401).json({ error: "Gunakan login Google untuk akun ini" });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      await recordFailedLogin(email, clientIP);
      return res.status(401).json({ error: "Email atau password salah" });
    }

    await clearFailedLogins(email);

    if (user.status !== "active") {
      return res.status(403).json({
        error: `Akun ${user.status === "banned" ? "diblokir" : "ditangguhkan"}. Hubungi admin untuk info lebih lanjut.`,
        accountStatus: user.status,
      });
    }

    const requireVerification = process.env.REQUIRE_EMAIL_VERIFICATION === "true";

    if (requireVerification && !user.emailVerified) {
      return res.status(403).json({
        error: "Email belum diverifikasi. Silakan cek inbox Anda.",
        needsVerification: true,
      });
    }

    const result = await establishAuthenticatedSession(user, req);

    if (!result.ok) {
      return res.status(result.status).json({
        error: result.error,
        ...(result.hasActiveSession ? { hasActiveSession: true } : {}),
      });
    }

    logUserActivity({
      userId: user.id,
      action: "login",
      details: { email: user.email },
      ip: clientIP,
      userAgent: req.headers["user-agent"] ?? null,
    });

    res.json({
      sessionToken: result.sessionToken,
      user: { id: user.id, email: user.email, name: user.name, isAdmin: user.isAdmin, credits: user.credits },
    });
  } catch (err) {
    console.error("[POST /api/auth/login] error:", err.message);
    res.status(500).json({ error: "Gagal login", detail: err.message });
  }
});

// POST /api/auth/logout
// body: { sessionToken }
router.post("/logout", async (req, res) => {
  const { sessionToken } = req.body;

  if (!sessionToken) {
    return res.status(400).json({ error: "Session token wajib diisi" });
  }

  try {
    const user = await validateSession(sessionToken);

    if (!user) {
      return res.status(401).json({ error: "Session tidak valid atau expired" });
    }

    await revokeSession(sessionToken);
    res.json({ message: "Logout berhasil" });

    logUserActivity({
      userId: user.id,
      action: "logout",
      details: { email: user.email },
      ip: req.normalizedIP || req.ip,
      userAgent: req.headers["user-agent"] ?? null,
    });
  } catch (err) {
    console.error("[POST /api/auth/logout] error:", err.message);
    res.status(500).json({ error: "Gagal logout", detail: err.message });
  }
});

// POST /api/auth/logout-by-credentials
router.post("/logout-by-credentials", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email dan password wajib diisi" });
  }

  try {
    const user = await findByEmail(email);
    if (!user) {
      await bcrypt.compare(password, "$2a$10$vI8aWBnW3fID.ZQ4/zo1G.q1lRps.9cGLcZEiGDMVr5yUP1KUOYTa");
      return res.status(401).json({ error: "Email atau password salah" });
    }

    if (!user.passwordHash) {
      return res.status(401).json({ error: "Gunakan login Google untuk akun ini" });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: "Email atau password salah" });
    }

    const deviceFingerprint = getDeviceFingerprint(req);
    const sessionToken = await getSessionByDevice(user.id, deviceFingerprint);

    if (sessionToken) {
      await revokeSession(sessionToken);
      await removeSessionForDevice(user.id, deviceFingerprint);
    }

    res.json({ message: "Logout berhasil" });

    logUserActivity({
      userId: user.id,
      action: "logout",
      details: { email: user.email, via: "credentials" },
      ip: req.normalizedIP || req.ip,
      userAgent: req.headers["user-agent"] ?? null,
    });
  } catch (err) {
    console.error("[POST /api/auth/logout-by-credentials] error:", err.message);
    res.status(500).json({ error: "Gagal logout", detail: err.message });
  }
});

// POST /api/auth/logout-all
router.post("/logout-all", async (req, res) => {
  const sessionToken = req.headers.authorization?.replace("Bearer ", "");

  if (!sessionToken) {
    return res.status(401).json({ error: "Session token required" });
  }

  try {
    const user = await validateSession(sessionToken);

    if (!user) {
      return res.status(401).json({ error: "Session tidak valid" });
    }

    const count = await revokeAllUserSessions(user.id);
    res.json({ message: `Logout dari ${count} device berhasil` });

    logUserActivity({
      userId: user.id,
      action: "logout_all",
      details: { email: user.email, revokedCount: count },
      ip: req.normalizedIP || req.ip,
      userAgent: req.headers["user-agent"] ?? null,
    });
  } catch (err) {
    console.error("[POST /api/auth/logout-all] error:", err.message);
    res.status(500).json({ error: "Gagal logout", detail: err.message });
  }
});

// GET /api/auth/verify-email?token=xxx
router.get("/verify-email", async (req, res) => {
  const { token } = req.query;
  const frontend = frontendUrl();

  const page = (ok, title, message) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'JetBrains Mono','Courier New',monospace;background:#050505;color:#e8e8e8;display:flex;align-items:center;justify-content:center;min-height:100vh;line-height:1.6}
  .container{max-width:600px;width:100%;padding:20px}
  .card{background:#0f0f0f;border:1px solid #2a2a2a;padding:40px}
  .header{border-bottom:2px solid ${ok ? '#00ff88' : '#ff2e5f'};border-left:4px solid ${ok ? '#00ff88' : '#ff2e5f'};padding-bottom:20px;margin-bottom:32px}
  .status{color:${ok ? '#00ff88' : '#ff2e5f'};font-size:11px;letter-spacing:1px;margin-bottom:8px}
  h1{font-size:20px;font-weight:700;letter-spacing:0.5px;color:#e8e8e8}
  .icon{font-size:64px;text-align:center;margin:24px 0}
  .message{color:#e8e8e8;font-size:13px;line-height:1.7;margin-bottom:32px}
  .btn{display:inline-block;background:${ok ? '#00ff88' : '#ff7700'};color:#050505;text-decoration:none;padding:14px 40px;font-weight:700;font-size:13px;letter-spacing:1px;transition:opacity 0.1s linear}
  .btn:hover{opacity:0.9}
  .footer{margin-top:32px;padding-top:20px;border-top:1px solid #2a2a2a;color:#6b6b6b;font-size:10px}
</style></head>
<body><div class="container"><div class="card">
  <div class="header">
    <div class="status">▸ SYS.AUTH.VERIFY</div>
    <h1>${title}</h1>
  </div>
  <div class="icon">${ok ? "✓" : "⚠"}</div>
  <div class="message">${message}</div>
  <a href="${ok ? frontend : '/'}" class="btn">${ok ? 'OPEN TERMINAL ▸' : 'RETRY ▸'}</a>
  <div class="footer">FA.TERMINAL.SYSTEM v2.1.0</div>
</div></div></body></html>`;

  if (!token || typeof token !== "string") {
    return res.status(400).send(page(false, "TOKEN MISSING", "Verification token not provided. Check your email for the correct link."));
  }

  try {
    const result = await verifyToken(token);

    if (!result.success) {
      return res.status(400).send(page(false, "VERIFICATION FAILED", result.error || "Token invalid, expired, or already used."));
    }

    logger.info("Email verified successfully", { userId: result.userId });

    logUserActivity({
      userId: result.userId,
      action: "email_verified",
      ip: req.normalizedIP || req.ip,
      userAgent: req.headers["user-agent"] ?? null,
    });

    res.send(page(true, "EMAIL VERIFIED", "Account activated. Full terminal access granted. You may now authenticate and use all features."));
  } catch (err) {
    console.error("[GET /api/auth/verify-email] error:", err.message);
    res.status(500).send(page(false, "SYSTEM ERROR", "Verification processing failed. Retry later or contact support."));
  }
});

// POST /api/auth/resend-verification
router.post("/resend-verification", async (req, res) => {
  const { email } = req.body;

  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "Email wajib diisi" });
  }

  try {
    const user = await findByEmail(email);

    if (!user) {
      return res.json({
        message: "Jika email terdaftar, email verifikasi telah dikirim.",
      });
    }

    if (user.email_verified) {
      return res.status(400).json({ error: "Email sudah terverifikasi" });
    }

    await invalidateUserTokens(user.id);

    const token = await createVerificationToken(user.id);
    const emailResult = await sendVerificationEmail(user.email, token);

    if (!emailResult.success) {
      logger.error("Failed to resend verification email", {
        userId: user.id,
        email: user.email,
        error: emailResult.error
      });
      return res.status(500).json({ error: "Gagal mengirim email verifikasi" });
    }

    logger.info("Verification email resent", { userId: user.id, email: user.email });

    res.json({
      message: "Email verifikasi telah dikirim ulang. Silakan cek inbox Anda.",
    });
  } catch (err) {
    console.error("[POST /api/auth/resend-verification] error:", err.message);
    res.status(500).json({ error: "Gagal mengirim ulang email verifikasi", detail: err.message });
  }
});

// GET /api/auth/me
router.get("/me", async (req, res) => {
  const sessionToken = req.headers.authorization?.replace("Bearer ", "");

  if (!sessionToken) {
    return res.status(401).json({ error: "Session token required" });
  }

  try {
    const sessionUser = await validateSession(sessionToken);

    if (!sessionUser) {
      return res.status(401).json({ error: "Session tidak valid atau expired" });
    }

    const user = await findById(sessionUser.id);

    if (!user) {
      return res.status(401).json({ error: "User tidak ditemukan" });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: user.isAdmin,
        status: user.status,
        emailVerified: user.emailVerified,
        credits: user.credits,
      },
    });
  } catch (err) {
    console.error("[GET /api/auth/me] error:", err.message);
    res.status(500).json({ error: "Gagal validasi session", detail: err.message });
  }
});

// GET /api/auth/me/stream
router.get("/me/stream", async (req, res) => {
  const sessionToken = req.query.token;
  if (!sessionToken) return res.status(401).json({ error: "Token required" });

  try {
    const sessionUser = await validateSession(sessionToken);
    if (!sessionUser) return res.status(401).json({ error: "Invalid token" });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write('event: connected\ndata: {"status": "ok"}\n\n');

    addClient(sessionUser.id, res);
  } catch (err) {
    console.error("[GET /api/auth/me/stream] error:", err.message);
    res.status(500).end();
  }
});

// GET /api/auth/google
router.get("/google", async (req, res, next) => {
  // Generate a random state parameter for CSRF protection
  const state = crypto.randomBytes(16).toString("hex");
  await redis.setex(`oauth_state:${state}`, 300, "1"); // 5 min TTL

  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
    state,
  })(req, res, next);
});

// GET /api/auth/google/callback
router.get(
  "/google/callback",
  async (req, res, next) => {
    // Verify OAuth state parameter to prevent CSRF
    const state = req.query.state;
    if (!state) {
      return res.redirect(`${frontendUrl()}/login?error=oauth_csrf`);
    }
    const valid = await redis.get(`oauth_state:${state}`);
    if (!valid) {
      return res.redirect(`${frontendUrl()}/login?error=oauth_csrf`);
    }
    // Delete state after use (single-use)
    await redis.del(`oauth_state:${state}`);

    passport.authenticate("google", {
      session: false,
      failureRedirect: `${frontendUrl()}/login?error=google_denied`,
    })(req, res, next);
  },
  async (req, res) => {
    try {
      const user = req.user;

      if (!user) {
        return res.redirect(`${frontendUrl()}/login?error=auth_failed`);
      }

      if (user.status !== "active") {
        return res.redirect(`${frontendUrl()}/login?error=account_${user.status}`);
      }

      const result = await establishAuthenticatedSession(user, req);

      if (!result.ok) {
        const errorSlug = result.status === 403 ? "device_bound" : "already_logged_in";
        return res.redirect(`${frontendUrl()}/login?error=${errorSlug}`);
      }

      logUserActivity({
        userId: user.id,
        action: "login",
        details: { email: user.email, method: "google" },
        ip: req.normalizedIP || req.ip,
        userAgent: req.headers["user-agent"] ?? null,
      });

      return res.redirect(`${frontendUrl()}/auth/callback?token=${result.sessionToken}`);
    } catch (err) {
      console.error("[GET /api/auth/google/callback] error:", err.message);
      res.redirect(`${frontendUrl()}/login?error=server_error`);
    }
  }
);

export default router;
