import type { Request, Response, NextFunction } from "express";
import { inject, injectable } from "tsyringe";
import { GetUsageUseCase } from "@application/use-cases/user/GetUsageUseCase.js";
import { GetMessagesUseCase } from "@application/use-cases/user/GetMessagesUseCase.js";
import { SendMessageUseCase } from "@application/use-cases/user/SendMessageUseCase.js";
import { GetSentMessagesUseCase } from "@application/use-cases/user/GetSentMessagesUseCase.js";
import { GetMessageDetailUseCase } from "@application/use-cases/user/GetMessageDetailUseCase.js";
import { GetMessageThreadUseCase } from "@application/use-cases/user/GetMessageThreadUseCase.js";
import { MarkMessageReadUseCase } from "@application/use-cases/user/MarkMessageReadUseCase.js";
import { DeleteMessageUseCase } from "@application/use-cases/user/DeleteMessageUseCase.js";
import { UpdateNotificationPrefsUseCase } from "@application/use-cases/user/UpdateNotificationPrefsUseCase.js";
import { GetNotificationPrefsUseCase } from "@application/use-cases/user/GetNotificationPrefsUseCase.js";
import { GetUserActivityUseCase } from "@application/use-cases/user/GetUserActivityUseCase.js";
import type { User } from "@domain/entities/User.js";

@injectable()
export class UserController {
  constructor(
    @inject("GetUserActivityUseCase") private getUserActivityUseCase: GetUserActivityUseCase,
    @inject("GetUsageUseCase") private getUsageUseCase: GetUsageUseCase,
    @inject("GetMessagesUseCase") private getMessagesUseCase: GetMessagesUseCase,
    @inject("SendUserMessageUseCase") private sendUserMessageUseCase: SendMessageUseCase,
    @inject("GetSentMessagesUseCase") private getSentMessagesUseCase: GetSentMessagesUseCase,
    @inject("GetMessageDetailUseCase") private getMessageDetailUseCase: GetMessageDetailUseCase,
    @inject("GetMessageThreadUseCase") private getMessageThreadUseCase: GetMessageThreadUseCase,
    @inject("MarkMessageReadUseCase") private markMessageReadUseCase: MarkMessageReadUseCase,
    @inject("UserDeleteMessageUseCase") private userDeleteMessageUseCase: DeleteMessageUseCase,
    @inject("UpdateNotificationPrefsUseCase") private updateNotificationPrefsUseCase: UpdateNotificationPrefsUseCase,
    @inject("GetNotificationPrefsUseCase") private getNotificationPrefsUseCase: GetNotificationPrefsUseCase
  ) {}

  private getUser(req: Request): User {
    return req.user as User;
  }

  async getActivity(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await this.getUserActivityUseCase.execute({
        userId: this.getUser(req).userId,
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 25,
        action: req.query.action as string,
        from: req.query.from ? new Date(req.query.from as string) : undefined,
        to: req.query.to ? new Date(req.query.to as string) : undefined,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async getUsage(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await this.getUsageUseCase.execute({
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
      const result = await this.getMessagesUseCase.execute({
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
      const result = await this.sendUserMessageUseCase.execute({
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

  async getSentMessages(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await this.getSentMessagesUseCase.execute({
        userId: this.getUser(req).userId,
        limit: parseInt(req.query.limit as string) || 50,
        offset: parseInt(req.query.offset as string) || 0,
        search: req.query.search as string,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async getMessageDetail(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await this.getMessageDetailUseCase.execute({
        id: req.params.id,
        userId: this.getUser(req).userId,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async getMessageThread(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await this.getMessageThreadUseCase.execute({
        threadId: req.params.threadId,
        userId: this.getUser(req).userId,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async markMessageRead(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await this.markMessageReadUseCase.execute({
        id: req.params.id,
        userId: this.getUser(req).userId,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async deleteMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await this.userDeleteMessageUseCase.execute({
        id: req.params.id,
        userId: this.getUser(req).userId,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async updateNotificationPrefs(req: Request, res: Response, next: NextFunction) {
    try {
      await this.updateNotificationPrefsUseCase.execute({
        userId: this.getUser(req).userId,
        emailEnabled: req.body.emailEnabled,
      });
      res.json({ message: "Preferences updated" });
    } catch (err) {
      next(err);
    }
  }

  async getNotificationPrefs(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await this.getNotificationPrefsUseCase.execute({ userId: this.getUser(req).userId });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
}