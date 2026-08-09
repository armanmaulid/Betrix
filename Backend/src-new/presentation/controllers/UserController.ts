import { Request, Response, NextFunction } from "express";
import { container } from "tsyringe";
import { GetUsageUseCase } from "@application/use-cases/user/GetUsageUseCase.js";
import { GetMessagesUseCase } from "@application/use-cases/user/GetMessagesUseCase.js";
import { SendMessageUseCase } from "@application/use-cases/user/SendMessageUseCase.js";
import { UpdateNotificationPrefsUseCase } from "@application/use-cases/user/UpdateNotificationPrefsUseCase.js";

export class UserController {
  async getUsage(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(GetUsageUseCase);
      const result = await useCase.execute({
        userId: req.user.userId,
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
        userId: req.user.userId,
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
      const useCase = container.resolve(SendMessageUseCase);
      const result = await useCase.execute({
        fromUserId: req.user.userId,
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
        userId: req.user.userId,
        emailEnabled: req.body.emailEnabled,
      });
      res.json({ message: "Preferences updated" });
    } catch (err) {
      next(err);
    }
  }
}