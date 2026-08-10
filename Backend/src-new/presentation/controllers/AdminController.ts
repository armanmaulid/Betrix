import type { Request, Response, NextFunction } from "express";
import { container } from "tsyringe";
import { GetUsersUseCase } from "@application/use-cases/admin/GetUsersUseCase.js";
import { GetUserDetailUseCase } from "@application/use-cases/admin/GetUserDetailUseCase.js";
import { UpdateUserUseCase } from "@application/use-cases/admin/UpdateUserUseCase.js";
import { DeleteUserUseCase } from "@application/use-cases/admin/DeleteUserUseCase.js";
import { ResetUserPasswordUseCase } from "@application/use-cases/admin/ResetUserPasswordUseCase.js";
import { GetMetricsUseCase } from "@application/use-cases/admin/GetMetricsUseCase.js";
import { GetAnalyticsUseCase } from "@application/use-cases/admin/GetAnalyticsUseCase.js";
import { GetSystemInfoUseCase } from "@application/use-cases/admin/GetSystemInfoUseCase.js";
import { GetAuditLogsUseCase } from "@application/use-cases/admin/GetAuditLogsUseCase.js";
import { ExportAuditLogsUseCase } from "@application/use-cases/admin/ExportAuditLogsUseCase.js";
import { BroadcastMessageUseCase } from "@application/use-cases/admin/BroadcastMessageUseCase.js";
import type { User } from "@domain/entities/User.js";
import type { RequestInput } from "@core/utils/request.js";

export class AdminController {
  private getUser(req: Request): User {
    return req.user as User;
  }

  private getRequestInput(req: Request): RequestInput {
    return {
      ip: req.ip!,
      userAgent: req.headers["user-agent"] ?? "",
      headers: req.headers,
    };
  }

  async getUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(GetUsersUseCase);
      const result = await useCase.execute({
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
        search: req.query.search as string,
        status: req.query.status as any,
        role: req.query.role as any,
        verified: req.query.verified === "true" ? true : req.query.verified === "false" ? false : undefined,
        sortBy: req.query.sortBy as string || "created_at",
        order: (req.query.order as "ASC" | "DESC") || "DESC",
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async getUserDetail(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(GetUserDetailUseCase);
      const result = await useCase.execute({ userId: req.params.id });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async updateUser(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(UpdateUserUseCase);
      const result = await useCase.execute({
        adminId: this.getUser(req).userId,
        targetUserId: req.params.id,
        status: req.body.status,
        isAdmin: req.body.isAdmin,
        requestIp: this.getRequestInput(req).ip,
        requestUserAgent: this.getRequestInput(req).userAgent,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async deleteUser(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(DeleteUserUseCase);
      await useCase.execute({
        adminId: this.getUser(req).userId,
        targetUserId: req.params.id,
        requestIp: this.getRequestInput(req).ip,
        requestUserAgent: this.getRequestInput(req).userAgent,
      });
      res.json({ message: "User deleted" });
    } catch (err) {
      next(err);
    }
  }

  async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(ResetUserPasswordUseCase);
      const result = await useCase.execute({
        adminId: this.getUser(req).userId,
        targetUserId: req.params.id,
        sendEmail: req.body.sendEmail ?? true,
        requestIp: this.getRequestInput(req).ip,
        requestUserAgent: this.getRequestInput(req).userAgent,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async getMetrics(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(GetMetricsUseCase);
      const result = await useCase.execute({ days: parseInt(req.query.days as string) || 30 });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async getAnalytics(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(GetAnalyticsUseCase);
      const result = await useCase.execute({
        days: parseInt(req.query.days as string) || 30,
        fromDate: req.query.fromDate ? new Date(req.query.fromDate as string) : undefined,
        toDate: req.query.toDate ? new Date(req.query.toDate as string) : undefined,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async getSystemInfo(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(GetSystemInfoUseCase);
      const result = await useCase.execute();
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async getAuditLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(GetAuditLogsUseCase);
      const result = await useCase.execute({
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 25,
        search: req.query.search as string,
        action: req.query.action as any,
        actorType: req.query.actorType as any,
        actor: req.query.actor as string,
        from: req.query.from ? new Date(req.query.from as string) : undefined,
        to: req.query.to ? new Date(req.query.to as string) : undefined,
        order: (req.query.order as "ASC" | "DESC") || "DESC",
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async exportAuditLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(ExportAuditLogsUseCase);
      const result = await useCase.execute({
        format: (req.query.format as "json" | "csv") || "csv",
        search: req.query.search as string,
        action: req.query.action as any,
        actorType: req.query.actorType as any,
        actor: req.query.actor as string,
        from: req.query.from ? new Date(req.query.from as string) : undefined,
        to: req.query.to ? new Date(req.query.to as string) : undefined,
      });
      
      res.setHeader("Content-Type", result.contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
      res.send(result.data);
    } catch (err) {
      next(err);
    }
  }

  async broadcast(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(BroadcastMessageUseCase);
      const result = await useCase.execute({
        adminId: this.getUser(req).userId,
        subject: req.body.subject,
        body: req.body.body,
        recipients: req.body.recipients,
        requestIp: this.getRequestInput(req).ip,
        requestUserAgent: this.getRequestInput(req).userAgent,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
}