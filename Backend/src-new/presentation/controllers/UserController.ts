import { Request, Response, NextFunction } from "express";
import { container } from "tsyringe";
import { GetUsageUseCase } from "@application/use-cases/user/GetUsageUseCase.js";
import { GetMessagesUseCase } from "@application/use-cases/user/GetMessagesUseCase.js";
import { SendMessageUseCase } from "@application/use-cases/user/SendMessageUseCase.js";
import { UpdateNotificationPrefsUseCase } from "@application/use-cases/user/UpdateNotificationPrefsUseCase.js";
import { User } from "@domain/entities/User.js";

export class UserController {
  private getUser(req: Request): User {
    return req.user as User;
  }

  async getUsage(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(GetUsageUseCase);
      const result = await useCase.execute({
        userId: this.getUser(req).userId,
        days: parseInt(req.query.days as string) || 30,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async getMessages(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(GetMessagesUseCase);
      const result = await useCase.execute({
        userId: this.getUser(req).userId,
        limit: parseInt(req.query.limit as string) || 50,
        offset: parseInt(req.query.offset as string) || 0,
        unread: req.query.unread === "true",
        search: req.query.search as string,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async sendMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve<SendMessageUseCase>("SendUserMessageUseCase");
      const result = await useCase.execute({
        fromUserId: this.getUser(req).userId,
        toEmail: req.body.toEmail,
        subject: req.body.subject,
        body: req.body.body,
        replyToMessageId: req.body.replyToMessageId,
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  async updateNotificationPrefs(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(UpdateNotificationPrefsUseCase);
      await useCase.execute({
        userId: this.getUser(req).userId,
        emailEnabled: req.body.emailEnabled,
      });
      res.json({ message: "Preferences updated" });
    } catch (err) {
      next(err);
    }
  }
}