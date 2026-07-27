import { redis } from "../db/redis.js";

export async function getSessionByDevice(userId, deviceFingerprint) {
  const key = `device_session:${userId}:${deviceFingerprint}`;
  return await redis.get(key);
}

export async function setSessionForDevice(userId, deviceFingerprint, sessionToken) {
  const key = `device_session:${userId}:${deviceFingerprint}`;
  const expiresIn = 24 * 60 * 60;
  await redis.setex(key, expiresIn, sessionToken);
}

export async function removeSessionForDevice(userId, deviceFingerprint) {
  const key = `device_session:${userId}:${deviceFingerprint}`;
  await redis.del(key);
}
