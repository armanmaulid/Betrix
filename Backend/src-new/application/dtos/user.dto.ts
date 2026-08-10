import { z } from "zod";

export const getUsageDto = z.object({
  days: z.coerce.number().min(1).max(365).default(30),
});

export const getMessagesDto = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  unread: z.enum(["true", "false"]).optional(),
  search: z.string().optional(),
});

export const sendMessageDto = z.object({
  toEmail: z.string().email(),
  subject: z.string().min(1).max(200),
  body: z.string().min(1),
  replyToMessageId: z.string().uuid().optional(),
});

export const updateNotificationPrefsDto = z.object({
  emailEnabled: z.boolean(),
});

export type GetUsageDto = z.infer<typeof getUsageDto>;
export type GetMessagesDto = z.infer<typeof getMessagesDto>;
export type SendMessageDto = z.infer<typeof sendMessageDto>;
export type UpdateNotificationPrefsDto = z.infer<typeof updateNotificationPrefsDto>;