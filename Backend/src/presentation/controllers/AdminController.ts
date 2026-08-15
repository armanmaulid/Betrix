import type { Request, Response, NextFunction } from "express";
import { inject, injectable } from "tsyringe";
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
import { User, UserStatus } from "@domain/entities/User.js";
import { AdminActionType } from "@domain/entities/AdminAction.js";
import type { RequestInput } from "@core/utils/request.js";

@injectable()
export class AdminController {
  constructor(
    @inject("GetUsersUseCase") private getUsersUseCase: GetUsersUseCase,
    @inject("GetUserDetailUseCase") private getUserDetailUseCase: GetUserDetailUseCase,
    @inject("UpdateUserUseCase") private updateUserUseCase: UpdateUserUseCase,
    @inject("DeleteUserUseCase") private deleteUserUseCase: DeleteUserUseCase,
    @inject("ResetUserPasswordUseCase") private resetUserPasswordUseCase: ResetUserPasswordUseCase,
    @inject("GetMetricsUseCase") private getMetricsUseCase: GetMetricsUseCase,
    @inject("GetAnalyticsUseCase") private getAnalyticsUseCase: GetAnalyticsUseCase,
    @inject("GetSystemInfoUseCase") private getSystemInfoUseCase: GetSystemInfoUseCase,
    @inject("GetAuditLogsUseCase") private getAuditLogsUseCase: GetAuditLogsUseCase,
    @inject("ExportAuditLogsUseCase") private exportAuditLogsUseCase: ExportAuditLogsUseCase,
    @inject("BroadcastMessageUseCase") private broadcastMessageUseCase: BroadcastMessageUseCase
  ) {}

  private getUser(req: Request): User {
    return req.user as User;
  }

  private getRequestInput(req: Request): RequestInput {
    return {
      ip: req.normalizedIP || req.ip || "",
      userAgent: req.headers["user-agent"] ?? "",
      headers: req.headers,
    };
  }

  async getUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await this.getUsersUseCase.execute({
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
        search: req.query.search as string,
        status: req.query.status as UserStatus | undefined,
        role: req.query.role as "admin" | "user" | undefined,
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
      const result = await this.getUserDetailUseCase.execute({ userId: req.params.id });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async updateUser(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await this.updateUserUseCase.execute({
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
      await this.deleteUserUseCase.execute({
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
      const result = await this.resetUserPasswordUseCase.execute({
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
      const result = await this.getMetricsUseCase.execute({ days: parseInt(req.query.days as string) || 30 });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async getAnalytics(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await this.getAnalyticsUseCase.execute({
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
      const result = await this.getSystemInfoUseCase.execute();
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async getAuditLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await this.getAuditLogsUseCase.execute({
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 25,
        search: req.query.search as string,
        action: req.query.action as AdminActionType | undefined,
        actorType: req.query.actorType as "admin" | "user" | undefined,
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
      const result = await this.exportAuditLogsUseCase.execute({
        format: (req.query.format as "json" | "csv") || "csv",
        search: req.query.search as string,
        action: req.query.action as AdminActionType | undefined,
        actorType: req.query.actorType as "admin" | "user" | undefined,
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
      const result = await this.broadcastMessageUseCase.execute({
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