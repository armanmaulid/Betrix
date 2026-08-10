import { Request, Response, NextFunction } from "express";
import { container } from "tsyringe";
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
import { RequestInput } from "@core/utils/request.js";

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
      await useCase.execute({
        sessionToken: req.body.sessionToken,
        request: this.getRequestInput(req),
      });
      res.json({ message: "Logout successful" });
    } catch (err) {
      next(err);
    }
  }

  async verifyEmail(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(VerifyEmailUseCase);
      await useCase.execute({ token: req.query.token as string });
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
    };
  }
}