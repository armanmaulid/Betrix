import { validateSession } from "../services/sessionStore.js";
import { pool } from "../db/pool.js";
import { logger } from "../utils/logger.js";

const LAST_ACTIVE_THROTTLE_MINUTES = 5;

function touchLastActive(userId) {
  pool
    .query(
      `UPDATE users
       SET last_active = CURRENT_TIMESTAMP
       WHERE id = $1
         AND (last_active IS NULL OR last_active < NOW() - INTERVAL '1 minute' * $2)`,
      [userId, LAST_ACTIVE_THROTTLE_MINUTES]
    )
    .catch((err) =>
      logger.error("[touchLastActive] gagal update last_active", {
        error: err.message,
        userId,
      })
    );
}

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const sessionToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!sessionToken) {
    return res.status(401).json({ error: "Session token tidak ditemukan" });
  }

  try {
    const user = await validateSession(sessionToken);

    if (!user) {
      return res.status(401).json({ error: "Session tidak valid atau expired" });
    }

    req.user = user;
    touchLastActive(user.id);
    next();
  } catch (err) {
    // FIX (observability): sebelumnya console.error() — tidak pernah masuk ke
    // logs/combined-*.log atau logs/error-*.log (winston), jadi kalau dependency
    // (Redis/Postgres/DNS) bermasalah, insiden ini tidak ke-capture di log
    // terstruktur yang biasa dipantau, cuma kelihatan di raw console kalau
    // kebetulan sedang dilihat langsung.
    logger.error("[requireAuth] gagal validasi session", {
      error: err.message,
      requestId: req.id,
    });
    // FIX: 500 -> 503. Kegagalan di sini nyaris selalu karena dependency
    // (Redis/Postgres/DNS) sedang tidak terjangkau/timeout — bukan bug logic
    // di server. 503 (Service Unavailable) lebih akurat dan menandakan ke
    // klien/monitoring bahwa ini kondisi sementara, bukan error permanen.
    return res.status(503).json({ error: "Gagal validasi session, coba lagi sebentar" });
  }
}
