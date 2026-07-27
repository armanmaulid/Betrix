import xss from "xss";

const SKIP_KEYS = new Set(["password", "newPassword", "currentPassword", "message", "content"]);

export function sanitizeInput(req, res, next) {
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }
  next();
}

function sanitizeObject(obj, keyName) {
  if (keyName && SKIP_KEYS.has(keyName)) {
    return obj;
  }
  if (typeof obj === "string") {
    return xss(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, keyName));
  }
  if (obj && typeof obj === "object") {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObject(value, key);
    }
    return sanitized;
  }
  return obj;
}
