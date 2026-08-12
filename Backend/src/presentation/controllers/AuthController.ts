import type { Request, Response, NextFunction } from "express";
import { container } from "tsyringe";
import { RegisterUseCase } from "@application/use-cases/auth/RegisterUseCase.js";
import { LoginUseCase } from "@application/use-cases/auth/LoginUseCase.js";
import { LogoutUseCase } from "@application/use-cases/auth/LogoutUseCase.js";
import { User } from "@domain/entities/User.js";
import { VerifyEmailUseCase } from "@application/use-cases/auth/VerifyEmailUseCase.js";
import { ResendVerificationUseCase } from "@application/use-cases/auth/ResendVerificationUseCase.js";
import { ChangePasswordUseCase } from "@application/use-cases/auth/ChangePasswordUseCase.js";
import { ChangeEmailUseCase } from "@application/use-cases/auth/ChangeEmailUseCase.js";
import { GetProfileUseCase } from "@application/use-cases/auth/GetProfileUseCase.js";
import { UpdateProfileUseCase } from "@application/use-cases/auth/UpdateProfileUseCase.js";
import { GetSessionsUseCase } from "@application/use-cases/auth/GetSessionsUseCase.js";
import { RevokeSessionUseCase } from "@application/use-cases/auth/RevokeSessionUseCase.js";
import type { RequestInput } from "@core/utils/request.js";

export class AuthController {
  private getRequestInput(req: Request): RequestInput {
    return {
      ip: req.ip!,
      userAgent: req.headers["user-agent"] ?? "",
      headers: req.headers,
    };
  }

  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(RegisterUseCase);
      const result = await useCase.execute({
        email: req.body.email,
        password: req.body.password,
        name: req.body.name,
        request: this.getRequestInput(req),
      });
      
      res.status(201).json({
        message: "Registration processed. Please check your email.",
        sessionToken: result.sessionToken,
        user: result.sessionToken ? this.serializeUser(result.user) : undefined,
      });
    } catch (err) {
      next(err);
    }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(LoginUseCase);
      const result = await useCase.execute({
        email: req.body.email,
        password: req.body.password,
        request: this.getRequestInput(req),
      });
      
      res.json({
        sessionToken: result.sessionToken,
        user: this.serializeUser(result.user),
      });
    } catch (err) {
      next(err);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(LogoutUseCase);
      const sessionToken = req.headers.authorization?.replace("Bearer ", "");
      if (!sessionToken) {
        return res.status(401).json({ error: "Session token required" });
      }

      await useCase.execute({
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
      const useCase = container.resolve("LogoutByCredentialsUseCase") as any;
      await useCase.execute({
        email: req.body.email,
        passwordRaw: req.body.password,
        ip: req.ip,
        headers: req.headers,
      });
      res.json({ message: "Logout berhasil" });
    } catch (err) {
      next(err);
    }
  }

  async logoutAll(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve("LogoutAllUseCase") as any;
      const user = req.user as User;
      const count = await useCase.execute({
        userId: user.userId || user.id,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });
      res.json({ message: `Logout dari ${count} device berhasil` });
    } catch (err) {
      next(err);
    }
  }

  async googleCallback(req: Request, res: Response, next: NextFunction) {
    try {
      // The user object comes from passport
      const user = req.user as any;
      if (!user) {
        return res.redirect(`${process.env.FRONTEND_URL || "http://localhost:5173"}/login?error=auth_failed`);
      }

      const authService = container.resolve("AuthDomainService") as any;
      const result = await authService.establishAuthenticatedSession(user, {
        ip: req.ip,
        headers: req.headers as any
      });

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
      const useCase = container.resolve(VerifyEmailUseCase);
      const token = (req.body.token || req.query.token) as string;
      await useCase.execute({ token });
      res.json({ message: "Email verified successfully" });
    } catch (err) {
      next(err);
    }
  }

  async resendVerification(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(ResendVerificationUseCase);
      await useCase.execute({ email: req.body.email });
      res.json({ message: "Verification email sent" });
    } catch (err) {
      next(err);
    }
  }

  async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(ChangePasswordUseCase);
      await useCase.execute({
        userId: (req.user as any).userId,
        sessionToken: req.headers.authorization?.replace("Bearer ", "")!,
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
      const useCase = container.resolve(ChangeEmailUseCase);
      const result = await useCase.execute({
        userId: (req.user as any).userId,
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
      const useCase = container.resolve(GetProfileUseCase);
      const result = await useCase.execute({ sessionToken: req.headers.authorization?.replace("Bearer ", "")! });
      res.json({ user: this.serializeUser(result.user) });
    } catch (err) {
      next(err);
    }
  }

  async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(UpdateProfileUseCase);
      const result = await useCase.execute({
        sessionToken: req.headers.authorization?.replace("Bearer ", "")!,
        name: req.body.name,
        phone: req.body.phone,
        address: req.body.address,
        birthdate: req.body.birthdate ? new Date(req.body.birthdate) : undefined,
        gender: req.body.gender,
        bio: req.body.bio,
      });
      res.json({ user: this.serializeUser(result.user) });
    } catch (err) {
      next(err);
    }
  }

  async getSessions(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(GetSessionsUseCase);
      const result = await useCase.execute({ sessionToken: req.headers.authorization?.replace("Bearer ", "")! });
      res.json({ sessions: result.sessions });
    } catch (err) {
      next(err);
    }
  }

  async revokeSession(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(RevokeSessionUseCase);
      await useCase.execute({
        sessionToken: req.headers.authorization?.replace("Bearer ", "")!,
        fingerprint: req.params.fingerprint,
        request: this.getRequestInput(req),
      });
      res.json({ message: "Session revoked" });
    } catch (err) {
      next(err);
    }
  }

  private serializeUser(user: any) {
    return {
      id: user.id,
      userId: user.id,
      email: user.email,
      name: user.name,
      isAdmin: user.isAdmin,
      status: user.status,
      emailVerified: user.emailVerified,
      credits: user.credits,
      createdAt: user.createdAt,
      lastActive: user.lastActive,
      phone: user.phone,
      address: user.address,
      birthdate: user.birthdate,
      gender: user.gender,
      bio: user.bio,
      googleId: user.googleId,
      verifiedAt: user.verifiedAt,
    };
  }
}