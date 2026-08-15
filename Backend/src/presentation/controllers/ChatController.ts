import type { Request, Response, NextFunction } from "express";
import { inject, injectable } from "tsyringe";
import { SendMessageUseCase } from "@application/use-cases/chat/SendMessageUseCase.js";
import { StreamMessageUseCase } from "@application/use-cases/chat/StreamMessageUseCase.js";
import { GetChatHistoryUseCase } from "@application/use-cases/chat/GetChatHistoryUseCase.js";
import { DeleteChatSessionUseCase } from "@application/use-cases/chat/DeleteChatSessionUseCase.js";
import { ExportChatHistoryUseCase } from "@application/use-cases/chat/ExportChatHistoryUseCase.js";
import { ChatTaskType } from "@domain/entities/ChatMessage.js";
import type { User } from "@domain/entities/User.js";

@injectable()
export class ChatController {
  constructor(
    @inject("SendMessageUseCase") private sendMessageUseCase: SendMessageUseCase,
    @inject("StreamMessageUseCase") private streamMessageUseCase: StreamMessageUseCase,
    @inject("GetChatHistoryUseCase") private getChatHistoryUseCase: GetChatHistoryUseCase,
    @inject("DeleteChatSessionUseCase") private deleteChatSessionUseCase: DeleteChatSessionUseCase,
    @inject("ExportChatHistoryUseCase") private exportChatHistoryUseCase: ExportChatHistoryUseCase
  ) {}

  private getUser(req: Request): User {
    return req.user as User;
  }

  async sendMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await this.sendMessageUseCase.execute({
        userId: this.getUser(req).userId,
        taskType: req.body.taskType,
        message: req.body.message,
        displayMessage: req.body.displayMessage,
        history: req.body.history || [],
        sessionId: req.body.sessionId,
        tier: req.body.tier,
        image: req.body.image,
      });
      
      res.json({
        reply: result.reply,
        modelUsed: result.modelUsed,
        latencyMs: result.latencyMs,
        usage: result.usage,
      });
    } catch (err) {
      next(err);
    }
  }

  async streamMessage(req: Request, res: Response) {
    try {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();

      const controller = new AbortController();
      req.on("close", () => controller.abort());

      const result = await this.streamMessageUseCase.execute({
        userId: this.getUser(req).userId,
        taskType: req.body.taskType,
        message: req.body.message,
        displayMessage: req.body.displayMessage,
        history: req.body.history || [],
        sessionId: req.body.sessionId,
        tier: req.body.tier,
        image: req.body.image,
        onToken: (token) => {
          res.write(`data: ${JSON.stringify({ token })}\n\n`);
        },
        signal: controller.signal,
      });

      res.write(`event: done\ndata: ${JSON.stringify({
        modelUsed: result.modelUsed,
        latencyMs: result.latencyMs,
        usage: result.usage,
      })}\n\n`);
      res.end();
    } catch (err) {
      const errorMessage = (err as Error).message || "Failed to stream message";
      res.write(`event: error\ndata: ${JSON.stringify({ error: errorMessage })}\n\n`);
      res.end();
    }
  }

  async getHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await this.getChatHistoryUseCase.execute({
        userId: this.getUser(req).userId,
        limit: parseInt(req.query.limit as string) || 50,
        offset: parseInt(req.query.offset as string) || 0,
        taskType: req.query.taskType as ChatTaskType | undefined,
        startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
        endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async deleteSession(req: Request, res: Response, next: NextFunction) {
    try {
      await this.deleteChatSessionUseCase.execute({
        userId: this.getUser(req).userId,
        sessionId: req.params.sessionId,
      });
      res.json({ message: "Session deleted" });
    } catch (err) {
      next(err);
    }
  }

  async exportHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await this.exportChatHistoryUseCase.execute({
        userId: this.getUser(req).userId,
        format: (req.query.format as "json" | "csv") || "json",
        taskType: req.query.taskType as ChatTaskType | undefined,
        startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
        endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      });
      
      res.setHeader("Content-Type", result.contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
      res.send(result.data);
    } catch (err) {
      next(err);
    }
  }
}