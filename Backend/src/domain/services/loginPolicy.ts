// Policy login anti-bruteforce (layered, bukan hard lock — BUG-04).
// Murni: tidak ada IO, mudah diuji unit.

/** Jendela waktu hitung kegagalan per email (menit). */
export const LOGIN_FAILURE_WINDOW_MINUTES = 15;

/** Setelah N kegagalan, percobaan berikutnya wajib CAPTCHA. */
export const CAPTCHA_REQUIRED_MIN_FAILURES = 5;

/** Mulai progressive delay saat jumlah kegagalan mencapai nilai ini. */
export const DELAY_START_MIN_FAILURES = 6;

/** Cap delay agar user sah tidak menunggu terlalu lama. */
export const DELAY_CAP_SECONDS = 30;

/**
 * Progressive delay (detik) berdasarkan jumlah kegagalan terbaru per email.
 * Kegagalan 1-5: tanpa penalti. Kegagalan ke-6+: 1s, 2s, 4s, 8s, ... capped.
 */
export function computeLoginDelaySeconds(failures: number): number {
  if (failures < DELAY_START_MIN_FAILURES) return 0;
  const exponent = failures - DELAY_START_MIN_FAILURES;
  return Math.min(Math.pow(2, exponent), DELAY_CAP_SECONDS);
}

/** Apakah percobaan login berikutnya wajib menyertakan CAPTCHA. */
export function isCaptchaRequired(failures: number): boolean {
  return failures >= CAPTCHA_REQUIRED_MIN_FAILURES;
}
