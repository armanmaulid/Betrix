// Middleware sanitize dinonaktifkan dari mutasi data (xss) karena merusak integritas data
// (misalnya nama O'Brien berubah jadi O&#39;Brien di database).
// Proteksi XSS diserahkan kepada frontend framework (React) pada saat proses render.
export function sanitizeInput(req, res, next) {
  next();
}
