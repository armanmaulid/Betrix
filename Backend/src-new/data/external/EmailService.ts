import nodemailer from "nodemailer";
import { env } from "@config/env";
import { logger } from "@core/logging/logger.js";

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
});

export class EmailService {
  async sendEmail(input: { to: string; subject: string; text?: string; html?: string }): Promise<{ success: boolean; error?: string }> {
    try {
      await transporter.sendMail({
        from: `"${env.SMTP_FROM}" <${env.SMTP_USER}>`,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      });
      return { success: true };
    } catch (err) {
      logger.error("Failed to send email", { context: "Email", to: input.to, error: (err as Error).message });
      return { success: false, error: (err as Error).message };
    }
  }

  async sendVerificationEmail(email: string, token: string): Promise<{ success: boolean; error?: string }> {
    const url = `${env.FRONTEND_URL}/verify-email?token=${token}`;
    return this.sendEmail({
      to: email,
      subject: "Verify your Betrix account",
      text: `Your OTP code is: ${token}\n\nAlternatively, please verify your email by clicking: ${url}`,
      html: `<p>Your OTP code is: <strong>${token}</strong></p><p>Alternatively, please verify your email by clicking: <a href="${url}">${url}</a></p>`,
    });
  }

  async sendEmailChangeVerification(email: string, token: string): Promise<{ success: boolean; error?: string }> {
    const url = `${env.FRONTEND_URL}/verify-email-change?token=${token}`;
    return this.sendEmail({
      to: email,
      subject: "Confirm your new email address",
      text: `Your OTP code is: ${token}\n\nAlternatively, confirm your new email by clicking: ${url}`,
      html: `<p>Your OTP code is: <strong>${token}</strong></p><p>Alternatively, confirm your new email by clicking: <a href="${url}">${url}</a></p>`,
    });
  }

  async sendEmailChangeNotification(oldEmail: string, newEmail: string): Promise<void> {
    await this.sendEmail({
      to: oldEmail,
      subject: "Your email address has been changed",
      text: `Your Betrix account email has been changed to ${newEmail}. If this wasn't you, contact support immediately.`,
      html: `<p>Your Betrix account email has been changed to <strong>${newEmail}</strong>.</p><p>If this wasn't you, contact support immediately.</p>`,
    });
  }

  async sendPasswordResetEmail(email: string, tempPassword: string): Promise<void> {
    await this.sendEmail({
      to: email,
      subject: "Your Betrix password has been reset",
      text: `Your temporary password is: ${tempPassword}\n\nPlease log in and change it immediately.`,
      html: `<p>Your temporary password is: <strong>${tempPassword}</strong></p><p>Please log in and change it immediately.</p>`,
    });
  }

  async sendDuplicateRegistrationNotice(email: string): Promise<void> {
    await this.sendEmail({
      to: email,
      subject: "Registration attempt with your email",
      text: "Someone tried to register with your email. If this was you, use forgot password. If not, ignore.",
      html: `<p>Someone tried to register with your email. If this was you, use forgot password. If not, ignore.</p>`,
    });
  }

  async sendPasswordChangedNotification(email: string): Promise<void> {
    await this.sendEmail({
      to: email,
      subject: "Your password was changed",
      text: "Your password was just changed. If this wasn't you, contact support and change it again.",
      html: `<p>Your password was just changed. If this wasn't you, contact support and change it again.</p>`,
    });
  }
}