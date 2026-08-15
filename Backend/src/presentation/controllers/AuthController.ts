import type { Request, Response, NextFunction } from "express";
import { inject, injectable } from "tsyringe";
import { RegisterUseCase } from "@application/use-cases/auth/RegisterUseCase.js";
import { LoginUseCase } from "@application/use-cases/auth/LoginUseCase.js";
import { LogoutUseCase } from "@application/use-cases/auth/LogoutUseCase.js";
import { VerifyEmailUseCase } from "@application/use-cases/auth/VerifyEmailUseCase.js";
import { ResendVerificationUseCase } from "@application/use-cases/auth/ResendVerificationUseCase.js";
import { ChangePasswordUseCase } from "@application/use-cases/auth/ChangePasswordUseCase.js";
import { ChangeEmailUseCase } from "@application/use-cases/auth/ChangeEmailUseCase.js";
import { GetProfileUseCase } from "@application/use-cases/auth/GetProfileUseCase.js";
import { UpdateProfileUseCase } from "@application/use-cases/auth/UpdateProfileUseCase.js";
import { GetSessionsUseCase } from "@application/use-cases/auth/GetSessionsUseCase.js";
import { RevokeSessionUseCase } from "@application/use-cases/auth/RevokeSessionUseCase.js";
import { LogoutByCredentialsUseCase } from "@application/use-cases/auth/LogoutByCredentialsUseCase.js";
import { LogoutAllUseCase } from "@application/use-cases/auth/LogoutAllUseCase.js";
import { AuthService } from "@application/services/AuthService.js";
import { User } from "@domain/entities/User.js";
import type { AppSettings } from "@core/settings/AppSettings.js";
import type { RequestInput } from "@core/utils/request.js";
import { toUserResponseDto } from "@application/mappers/user.mapper.js";

@injectable()
export class AuthController {
  constructor(
    @inject("RegisterUseCase") private registerUseCase: RegisterUseCase,
    @inject("LoginUseCase") private loginUseCase: LoginUseCase,
    @inject("LogoutUseCase") private logoutUseCase: LogoutUseCase,
    @inject("LogoutByCredentialsUseCase") private logoutByCredentialsUseCase: LogoutByCredentialsUseCase,
    @inject("LogoutAllUseCase") private logoutAllUseCase: LogoutAllUseCase,
    @inject("AuthService") private authService: AuthService,
    @inject("VerifyEmailUseCase") private verifyEmailUseCase: VerifyEmailUseCase,
    @inject("ResendVerificationUseCase") private resendVerificationUseCase: ResendVerificationUseCase,
    @inject("ChangePasswordUseCase") private changePasswordUseCase: ChangePasswordUseCase,
    @inject("ChangeEmailUseCase") private changeEmailUseCase: ChangeEmailUseCase,
    @inject("GetProfileUseCase") private getProfileUseCase: GetProfileUseCase,
    @inject("UpdateProfileUseCase") private updateProfileUseCase: UpdateProfileUseCase,
    @inject("GetSessionsUseCase") private getSessionsUseCase: GetSessionsUseCase,
    @inject("RevokeSessionUseCase") private revokeSessionUseCase: RevokeSessionUseCase,
    @inject("AppSettings") private settings: AppSettings
  ) {}

  private getRequestInput(req: Request): RequestInput {
    return {
      ip: req.normalizedIP || req.ip || "",
      userAgent: req.headers["user-agent"] ?? "",
      headers: req.headers,
    };
  }

  private getSessionToken(req: Request): string {
    return req.headers.authorization?.replace("Bearer ", "") ?? "";
  }

  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await this.registerUseCase.execute({
        email: req.body.email,
        password: req.body.password,
        name: req.body.name,
        request: this.getRequestInput(req),
      });

      res.status(201).json({
        message: "Registration processed. Please check your email.",
        sessionToken: result.sessionToken,
        user: result.sessionToken ? toUserResponseDto(result.user) : undefined,
      });
    } catch (err) {
      next(err);
    }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await this.loginUseCase.execute({
        email: req.body.email,
        password: req.body.password,
        request: this.getRequestInput(req),
      });

      res.json({
        sessionToken: result.sessionToken,
        user: toUserResponseDto(result.user),
      });
    } catch (err) {
      next(err);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const sessionToken = req.headers.authorization?.replace("Bearer ", "");
      if (!sessionToken) {
        return res.status(401).json({ error: "Session token required" });
      }

      await this.logoutUseCase.execute({
        sessionToken,
        request: this.getRequestInput(req),
      });

      res.json({ message: "Logout berhasil" });
    } catch (err) {
      next(err);
    }
  }

  async logoutByCredentials(req: Request, res: Response, next: NextFunction) {
    try {
      await this.logoutByCredentialsUseCase.execute({
        email: req.body.email,
        passwordRaw: req.body.password,
        ip: req.normalizedIP || req.ip || "",
        headers: { "user-agent": req.headers["user-agent"] },
      });
      res.json({ message: "Logout berhasil" });
    } catch (err) {
      next(err);
    }
  }

  async logoutAll(req: Request, res: Response, next: NextFunction) {
    try {
      const count = await this.logoutAllUseCase.execute({
        userId: (req.user as User).userId,
        ip: req.normalizedIP || req.ip || "",
        userAgent: req.headers["user-agent"],
      });
      res.json({ message: `Logout dari ${count} device berhasil` });
    } catch (err) {
      next(err);
    }
  }

  async googleCallback(req: Request, res: Response, next: NextFunction) {
    try {
      // The user object comes from passport (deserializeUser returns User entity)
      const user = req.user as User | undefined;
      if (!user) {
        return res.redirect(`${process.env.FRONTEND_URL || "http://localhost:5173"}/login?error=auth_failed`);
      }

      const result = await this.authService.establishAuthenticatedSession(
        user,
        { ip: req.normalizedIP || req.ip || "", headers: { "user-agent": req.headers["user-agent"] ?? "" } },
        this.settings.deviceEnforcementEnabled
      );

      if (!result.ok) {
        return res.redirect(`${process.env.FRONTEND_URL || "http://localhost:5173"}/login?error=session_failed`);
      }

      res.redirect(`${process.env.FRONTEND_URL || "http://localhost:5173"}/auth/callback?token=${result.sessionToken}`);
    } catch (err) {
      next(err);
    }
  }

  async verifyEmail(req: Request, res: Response, next: NextFunction) {
    try {
      const token = (req.body.token || req.query.token) as string;
      await this.verifyEmailUseCase.execute({ token });
      res.json({ message: "Email verified successfully" });
    } catch (err) {
      next(err);
    }
  }

  async resendVerification(req: Request, res: Response, next: NextFunction) {
    try {
      await this.resendVerificationUseCase.execute({ email: req.body.email });
      res.json({ message: "Verification email sent" });
    } catch (err) {
      next(err);
    }
  }

  async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      await this.changePasswordUseCase.execute({
        userId: (req.user as User).userId,
        sessionToken: this.getSessionToken(req),
        currentPassword: req.body.currentPassword,
        newPassword: req.body.newPassword,
        request: this.getRequestInput(req),
      });
      res.json({ message: "Password changed successfully" });
    } catch (err) {
      next(err);
    }
  }

  async changeEmail(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await this.changeEmailUseCase.execute({
        userId: (req.user as User).userId,
        currentPassword: req.body.currentPassword,
        newEmail: req.body.newEmail,
        request: this.getRequestInput(req),
      });
      res.json({ message: "Confirmation email sent to new address", pendingEmail: result.pendingEmail });
    } catch (err) {
      next(err);
    }
  }

  async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await this.getProfileUseCase.execute({ sessionToken: this.getSessionToken(req) });
      res.json({ user: toUserResponseDto(result.user) });
    } catch (err) {
      next(err);
    }
  }

  async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await this.updateProfileUseCase.execute({
        sessionToken: this.getSessionToken(req),
        name: req.body.name,
        phone: req.body.phone,
        address: req.body.address,
        birthdate: req.body.birthdate ? new Date(req.body.birthdate) : undefined,
        gender: req.body.gender,
        bio: req.body.bio,
      });
      res.json({ user: toUserResponseDto(result.user) });
    } catch (err) {
      next(err);
    }
  }

  async getSessions(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await this.getSessionsUseCase.execute({ sessionToken: this.getSessionToken(req) });
      res.json({ sessions: result.sessions });
    } catch (err) {
      next(err);
    }
  }

  async revokeSession(req: Request, res: Response, next: NextFunction) {
    try {
      await this.revokeSessionUseCase.execute({
        sessionToken: this.getSessionToken(req),
        fingerprint: req.params.fingerprint,
        request: this.getRequestInput(req),
      });
      res.json({ message: "Session revoked" });
    } catch (err) {
      next(err);
    }
  }
}