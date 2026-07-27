import nodemailer from "nodemailer";
import { logger } from "../utils/logger.js";

// Create transporter (SMTP config from env)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Verify SMTP connection on startup (optional)
if (process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter.verify((err, success) => {
    if (err) {
      logger.error("SMTP connection failed", { error: err.message });
    } else {
      logger.info("Ready to send emails", { context: "SMTP" });
    }
  });
}

/**
 * Send verification email with token link
 */
export async function sendVerificationEmail(email, token) {
  const baseUrl = process.env.BASE_URL || "http://localhost:3000";
  const verificationUrl = `${baseUrl}/api/auth/verify-email?token=${token}`;

  const mailOptions = {
    from: process.env.SMTP_FROM || `"FA Terminal" <${process.env.SMTP_USER}>`,
    to: email,
    subject: "🔐 TERMINAL ACCESS | Auth Token Required",
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; background-color: #050505; font-family: 'JetBrains Mono', 'Courier New', monospace;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #050505; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #0f0f0f; border: 1px solid #2a2a2a; overflow: hidden;">
                <tr>
                  <td style="background-color: #0f0f0f; padding: 24px 32px; border-bottom: 2px solid #ff7700; border-left: 4px solid #ff7700;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td>
                          <div style="font-family: 'JetBrains Mono', 'Courier New', monospace; color: #ff7700; font-size: 11px; margin-bottom: 8px; letter-spacing: 1px;">
                            ▸ SYS.AUTH.REQUEST
                          </div>
                          <h1 style="margin: 0; color: #e8e8e8; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">
                            TERMINAL INITIALIZATION
                          </h1>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 32px; background-color: #0f0f0f;">
                    <p style="margin: 0 0 24px 0; color: #e8e8e8; font-size: 13px; line-height: 1.7;">
                      Terminal session created. Email verification required to unlock full market access and portfolio controls.
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #1a1a1a; border: 1px solid #2a2a2a; padding: 16px; margin: 24px 0;">
                      <tr>
                        <td>
                          <div style="font-family: 'JetBrains Mono', 'Courier New', monospace; color: #6b6b6b; font-size: 10px; margin-bottom: 6px; letter-spacing: 0.5px;">
                            USER.EMAIL
                          </div>
                          <div style="font-family: 'JetBrains Mono', 'Courier New', monospace; color: #00d9ff; font-size: 13px;">
                            ${email}
                          </div>
                        </td>
                      </tr>
                    </table>
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 32px 0;">
                      <tr>
                        <td align="center">
                          <a href="${verificationUrl}" style="display: inline-block; background-color: #ff7700; color: #050505; text-decoration: none; padding: 14px 40px; font-weight: 700; font-size: 13px; letter-spacing: 1px; font-family: 'JetBrains Mono', 'Courier New', monospace;">
                            AUTHENTICATE NOW ▸
                          </a>
                        </td>
                      </tr>
                    </table>
                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #1a1a1a; border-left: 2px solid #00d9ff; padding: 14px; margin: 24px 0;">
                      <tr>
                        <td>
                          <div style="font-family: 'JetBrains Mono', 'Courier New', monospace; color: #6b6b6b; font-size: 10px; margin-bottom: 8px;">
                            FALLBACK.URI
                          </div>
                          <div style="font-family: 'JetBrains Mono', 'Courier New', monospace; color: #00d9ff; font-size: 11px; word-break: break-all; line-height: 1.5;">
                            ${verificationUrl}
                          </div>
                        </td>
                      </tr>
                    </table>
                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #331a00; border: 1px solid #ff7700; padding: 14px; margin: 24px 0;">
                      <tr>
                        <td>
                          <p style="margin: 0; color: #ff7700; font-size: 11px; line-height: 1.6; font-family: 'JetBrains Mono', 'Courier New', monospace;">
                            ⏱ TTL: 24H | Token expires after timeout period
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 20px 32px; background-color: #0f0f0f; border-top: 1px solid #2a2a2a;">
                    <p style="margin: 0; color: #6b6b6b; font-size: 10px; line-height: 1.6; font-family: 'JetBrains Mono', 'Courier New', monospace;">
                      Unauthorized request? Ignore this message. Account remains locked without verification.
                    </p>
                    <p style="margin: 12px 0 0 0; color: #6b6b6b; font-size: 9px; font-family: 'JetBrains Mono', 'Courier New', monospace; letter-spacing: 0.5px;">
                      FA.TERMINAL.SYSTEM v2.1.0
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
    text: `
═══════════════════════════════════════════════════
  FA TERMINAL - AUTH REQUEST
═══════════════════════════════════════════════════

▸ SYS.AUTH.REQUEST

TERMINAL INITIALIZATION

Terminal session created. Email verification required to unlock full market access and portfolio controls.

USER.EMAIL: ${email}

AUTHENTICATE:
${verificationUrl}

⏱ TTL: 24H | Token expires after timeout period

Unauthorized request? Ignore this message. Account remains locked without verification.

FA.TERMINAL.SYSTEM v2.1.0
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    logger.info("Verification email sent", { email, messageId: info.messageId });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    logger.error("Failed to send verification email", { email, error: err.message });
    return { success: false, error: err.message };
  }
}

/**
 * Notifikasi ke alamat LAMA setelah email akun diganti.
 */
export async function sendEmailChangeNotification(oldEmail, newEmail) {
  return sendEmail({
    to: oldEmail,
    subject: "⚠️ SECURITY ALERT | Email Modified",
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; background-color: #050505; font-family: 'JetBrains Mono', 'Courier New', monospace;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #050505; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #0f0f0f; border: 1px solid #2a2a2a; overflow: hidden;">
                <tr>
                  <td style="background-color: #0f0f0f; padding: 24px 32px; border-bottom: 2px solid #ff2e5f; border-left: 4px solid #ff2e5f;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td>
                          <div style="font-family: 'JetBrains Mono', 'Courier New', monospace; color: #ff2e5f; font-size: 11px; margin-bottom: 8px; letter-spacing: 1px;">
                            ▸ SYS.SEC.ALERT
                          </div>
                          <h1 style="margin: 0; color: #e8e8e8; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">
                            ACCOUNT EMAIL MODIFIED
                          </h1>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 32px; background-color: #0f0f0f;">
                    <p style="margin: 0 0 24px 0; color: #e8e8e8; font-size: 13px; line-height: 1.7;">
                      Primary email address on your terminal account has been changed. All future auth attempts and notifications will use the new address.
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #1a1a1a; border: 1px solid #2a2a2a; padding: 16px; margin: 24px 0;">
                      <tr>
                        <td>
                          <div style="font-family: 'JetBrains Mono', 'Courier New', monospace; color: #6b6b6b; font-size: 10px; margin-bottom: 6px; letter-spacing: 0.5px;">
                            PREVIOUS.EMAIL
                          </div>
                          <div style="font-family: 'JetBrains Mono', 'Courier New', monospace; color: #6b6b6b; font-size: 13px; text-decoration: line-through;">
                            ${oldEmail}
                          </div>
                        </td>
                      </tr>
                    </table>
                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #1a1a1a; border: 1px solid #2a2a2a; padding: 16px; margin: 24px 0;">
                      <tr>
                        <td>
                          <div style="font-family: 'JetBrains Mono', 'Courier New', monospace; color: #6b6b6b; font-size: 10px; margin-bottom: 6px; letter-spacing: 0.5px;">
                            NEW.EMAIL
                          </div>
                          <div style="font-family: 'JetBrains Mono', 'Courier New', monospace; color: #00ff88; font-size: 13px;">
                            ${newEmail}
                          </div>
                        </td>
                      </tr>
                    </table>
                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #330011; border: 1px solid #ff2e5f; padding: 14px; margin: 24px 0;">
                      <tr>
                        <td>
                          <p style="margin: 0; color: #ff2e5f; font-size: 11px; line-height: 1.6; font-family: 'JetBrains Mono', 'Courier New', monospace;">
                            ⚠️ BREACH SUSPECTED? Contact admin immediately if this change was unauthorized.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 20px 32px; background-color: #0f0f0f; border-top: 1px solid #2a2a2a;">
                    <p style="margin: 0; color: #6b6b6b; font-size: 10px; line-height: 1.6; font-family: 'JetBrains Mono', 'Courier New', monospace;">
                      This is a security notification sent to your old email for audit trail purposes.
                    </p>
                    <p style="margin: 12px 0 0 0; color: #6b6b6b; font-size: 9px; font-family: 'JetBrains Mono', 'Courier New', monospace; letter-spacing: 0.5px;">
                      FA.TERMINAL.SYSTEM v2.1.0
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
    text: `
═══════════════════════════════════════════════════
  FA TERMINAL - SECURITY ALERT
═══════════════════════════════════════════════════

▸ SYS.SEC.ALERT

ACCOUNT EMAIL MODIFIED

Primary email address on your terminal account has been changed.

PREVIOUS.EMAIL: ${oldEmail}
NEW.EMAIL: ${newEmail}

⚠️ BREACH SUSPECTED? Contact admin immediately if this change was unauthorized.

FA.TERMINAL.SYSTEM v2.1.0
    `,
  });
}

/**
 * Send email-change verification link ke alamat BARU.
 */
export async function sendEmailChangeVerification(newEmail, token) {
  const baseUrl = process.env.BASE_URL || "http://localhost:3000";
  const verificationUrl = `${baseUrl}/api/admin/me/verify-email?token=${token}`;

  return sendEmail({
    to: newEmail,
    subject: "🔄 EMAIL UPDATE | Verification Required",
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; background-color: #050505; font-family: 'JetBrains Mono', 'Courier New', monospace;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #050505; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #0f0f0f; border: 1px solid #2a2a2a; overflow: hidden;">
                <tr>
                  <td style="background-color: #0f0f0f; padding: 24px 32px; border-bottom: 2px solid #00d9ff; border-left: 4px solid #00d9ff;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td>
                          <div style="font-family: 'JetBrains Mono', 'Courier New', monospace; color: #00d9ff; font-size: 11px; margin-bottom: 8px; letter-spacing: 1px;">
                            ▸ SYS.EMAIL.UPDATE
                          </div>
                          <h1 style="margin: 0; color: #e8e8e8; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">
                            VERIFY NEW ADDRESS
                          </h1>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 32px; background-color: #0f0f0f;">
                    <p style="margin: 0 0 24px 0; color: #e8e8e8; font-size: 13px; line-height: 1.7;">
                      Email change request detected. Confirm ownership of this new address to complete the migration. Your current login remains active until verification.
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #1a1a1a; border: 1px solid #2a2a2a; padding: 16px; margin: 24px 0;">
                      <tr>
                        <td>
                          <div style="font-family: 'JetBrains Mono', 'Courier New', monospace; color: #6b6b6b; font-size: 10px; margin-bottom: 6px; letter-spacing: 0.5px;">
                            TARGET.EMAIL
                          </div>
                          <div style="font-family: 'JetBrains Mono', 'Courier New', monospace; color: #00d9ff; font-size: 13px;">
                            ${newEmail}
                          </div>
                        </td>
                      </tr>
                    </table>
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 32px 0;">
                      <tr>
                        <td align="center">
                          <a href="${verificationUrl}" style="display: inline-block; background-color: #00d9ff; color: #050505; text-decoration: none; padding: 14px 40px; font-weight: 700; font-size: 13px; letter-spacing: 1px; font-family: 'JetBrains Mono', 'Courier New', monospace;">
                            CONFIRM UPDATE ▸
                          </a>
                        </td>
                      </tr>
                    </table>
                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #1a1a1a; border-left: 2px solid #00d9ff; padding: 14px; margin: 24px 0;">
                      <tr>
                        <td>
                          <div style="font-family: 'JetBrains Mono', 'Courier New', monospace; color: #6b6b6b; font-size: 10px; margin-bottom: 8px;">
                            FALLBACK.URI
                          </div>
                          <div style="font-family: 'JetBrains Mono', 'Courier New', monospace; color: #00d9ff; font-size: 11px; word-break: break-all; line-height: 1.5;">
                            ${verificationUrl}
                          </div>
                        </td>
                      </tr>
                    </table>
                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #331a00; border: 1px solid #ff7700; padding: 14px; margin: 24px 0;">
                      <tr>
                        <td>
                          <p style="margin: 0; color: #ff7700; font-size: 11px; line-height: 1.6; font-family: 'JetBrains Mono', 'Courier New', monospace;">
                            ⏱ TTL: 24H | Ignore this if you didn't request the change — old address stays active.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 20px 32px; background-color: #0f0f0f; border-top: 1px solid #2a2a2a;">
                    <p style="margin: 0; color: #6b6b6b; font-size: 10px; line-height: 1.6; font-family: 'JetBrains Mono', 'Courier New', monospace;">
                      No action required if you didn't initiate this change. Token expires in 24 hours.
                    </p>
                    <p style="margin: 12px 0 0 0; color: #6b6b6b; font-size: 9px; font-family: 'JetBrains Mono', 'Courier New', monospace; letter-spacing: 0.5px;">
                      FA.TERMINAL.SYSTEM v2.1.0
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
    text: `
═══════════════════════════════════════════════════
  FA TERMINAL - EMAIL UPDATE
═══════════════════════════════════════════════════

▸ SYS.EMAIL.UPDATE

VERIFY NEW ADDRESS

Email change request detected. Confirm ownership of this new address to complete the migration.

TARGET.EMAIL: ${newEmail}

CONFIRM:
${verificationUrl}

⏱ TTL: 24H | Ignore this if you didn't request the change — old address stays active.

FA.TERMINAL.SYSTEM v2.1.0
    `,
  });
}

// NOTE (fix redundansi): sendPasswordResetEmail() yang sebelumnya ada di
// sini DIHAPUS — cuma stub kosong (isinya cuma logger.info) dan tidak
// pernah dipanggil dari manapun di codebase (grep tidak menemukan
// pemanggilnya). Alur reset password admin (POST /api/admin/users/:id/
// reset-password) sekarang pakai sendEmail() generik di bawah, bukan fungsi
// ini. Kalau nanti butuh flow "user minta reset password sendiri", tinggal
// buat fungsi baru saat fitur itu benar-benar diimplementasi.

/**
 * Generic send email function
 */
export async function sendEmail({ to, subject, text, html }) {
  const mailOptions = {
    from: process.env.SMTP_FROM || `"Financial Advisor" <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
    html
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    logger.info("Email sent", { to, subject, messageId: info.messageId });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    logger.error("Failed to send email", { to, subject, error: err.message });
    throw err;
  }
}
