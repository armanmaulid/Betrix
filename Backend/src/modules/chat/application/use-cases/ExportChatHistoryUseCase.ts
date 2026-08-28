import { inject, injectable } from "tsyringe";
import { ChatRepository } from "@domain/repositories/ChatRepository.js";
import { ChatTaskType } from "@domain/entities/ChatMessage.js";
import { escapeCsvField } from "@core/utils/csv.js";

interface ExportChatHistoryInput {
  userId: string;
  format: "json" | "csv";
  taskType?: ChatTaskType;
  startDate?: Date;
  endDate?: Date;
}

interface ExportChatHistoryOutput {
  data: string;
  contentType: string;
  filename: string;
}

@injectable()
export class ExportChatHistoryUseCase {
  constructor(
    @inject("ChatRepository") private chatRepo: ChatRepository
  ) {}

  async execute(input: ExportChatHistoryInput): Promise<ExportChatHistoryOutput> {
    const messages = await this.chatRepo.findForExport(input.userId, {
      taskType: input.taskType,
      startDate: input.startDate,
      endDate: input.endDate,
    });

    const timestamp = new Date().toISOString().split("T")[0];

    if (input.format === "json") {
      const conversations = messages.map(msg => ({
        task_type: msg.taskType,
        message: msg.message,
        reply: msg.reply,
        model_used: msg.modelUsed,
        latency_ms: msg.latencyMs,
        input_tokens: msg.inputTokens,
        output_tokens: msg.outputTokens,
        created_at: msg.createdAt.toISOString(),
      }));

      return {
        data: JSON.stringify({
          exported_at: new Date().toISOString(),
          user_id: input.userId,
          total: messages.length,
          conversations,
        }, null, 2),
        contentType: "application/json",
        filename: `chat-history-${timestamp}.json`,
      };
    }

    const csvRows = [
      "timestamp,task_type,message,reply,model_used,latency_ms,input_tokens,output_tokens",
      ...messages.map(msg => [
        escapeCsvField(msg.createdAt.toISOString()),
        escapeCsvField(msg.taskType),
        escapeCsvField(msg.message),
        escapeCsvField(msg.reply),
        escapeCsvField(msg.modelUsed),
        msg.latencyMs ?? "",
        msg.inputTokens,
        msg.outputTokens,
      ].join(",")),
    ];

    return {
      data: csvRows.join("\n"),
      contentType: "text/csv",
      filename: `chat-history-${timestamp}.csv`,
    };
  }
}