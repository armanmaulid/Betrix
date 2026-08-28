import type { Request, Response, NextFunction } from "express";
import { inject, injectable } from "tsyringe";
import { SendMessageUseCase } from "@modules/chat/application/use-cases/SendMessageUseCase.js";
import { StreamMessageUseCase } from "@modules/chat/application/use-cases/StreamMessageUseCase.js";
import { GetChatHistoryUseCase } from "@modules/chat/application/use-cases/GetChatHistoryUseCase.js";
import { DeleteChatSessionUseCase } from "@modules/chat/application/use-cases/DeleteChatSessionUseCase.js";
import { ExportChatHistoryUseCase } from "@modules/chat/application/use-cases/ExportChatHistoryUseCase.js";
import { ChatTaskType } from "@domain/entities/ChatMessage.js";
import type { User } from "@domain/entities/User.js";
import { isAppError } from "@core/errors/index.js";
import { env } from "@config/env.js";

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
        contextParams: req.body.contextParams,
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
    const controller = new AbortController();

    // SSE headers flush lazily on the first token — a pre-stream error
    // (e.g. SYMBOL_NOT_FOUND) must return a JSON 4xx, not `event: error` + HTTP 200.
    let sseStarted = false;
    let heartbeatInterval: NodeJS.Timeout | undefined;
    const stopHeartbeat = () => {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      heartbeatInterval = undefined;
    };
    // Client disconnect can arrive before the use-case promise settles
    // (e.g. the AI call hasn't reacted to the abort signal yet) — clear the
    // heartbeat immediately rather than leaving it ticking until then.
    req.on("close", () => {
      controller.abort();
      stopHeartbeat();
    });

    // `: comment` frames per the SSE spec — ignored by EventSource/manual
    // parsers but keep the connection alive through proxies (Railway,
    // Cloudflare) that close idle connections, and give the FE a liveness
    // signal independent of AI tokens (which can pause during tool-calling
    // or long thinking spans without the connection actually being dead).
    const startSse = () => {
      if (sseStarted) return;
      sseStarted = true;
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();
      heartbeatInterval = setInterval(() => {
        res.write(": heartbeat\n\n");
      }, env.SSE_HEARTBEAT_INTERVAL_MS);
    };

    try {
      const result = await this.streamMessageUseCase.execute({
        userId: this.getUser(req).userId,
        taskType: req.body.taskType,
        message: req.body.message,
        displayMessage: req.body.displayMessage,
        history: req.body.history || [],
        sessionId: req.body.sessionId,
        tier: req.body.tier,
        image: req.body.image,
        contextParams: req.body.contextParams,
        onToken: (token) => {
          startSse();
          res.write(`data: ${JSON.stringify({ token })}\n\n`);
        },
        signal: controller.signal,
      });

      startSse();
      stopHeartbeat();
      res.write(`event: done\ndata: ${JSON.stringify({
        modelUsed: result.modelUsed,
        latencyMs: result.latencyMs,
        usage: result.usage,
      })}\n\n`);
      res.end();
    } catch (err) {
      stopHeartbeat();
      // Pre-stream failure (headers not yet sent) → JSON error with correct status.
      if (isAppError(err) && !sseStarted) {
        return res.status(err.statusCode).json({
          error: err.message,
          code: err.code,
          ...(err.details && { details: err.details }),
        });
      }
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
        sessionId: req.params.sessionId as string,
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