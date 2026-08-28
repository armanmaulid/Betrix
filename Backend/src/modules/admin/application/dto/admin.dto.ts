import { z } from "zod";

export const adminGetUsersDto = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(["active", "banned", "suspended"]).optional(),
  role: z.enum(["admin", "user"]).optional(),
  verified: z.enum(["true", "false"]).optional(),
  sortBy: z.enum(["created_at", "last_active", "email", "name", "status"]).default("created_at"),
  order: z.enum(["ASC", "DESC"]).default("DESC"),
});

export const adminUpdateUserDto = z.object({
  status: z.enum(["active", "banned", "suspended"]).optional(),
  isAdmin: z.boolean().optional(),
});

export const adminResetPasswordDto = z.object({
  sendEmail: z.boolean().default(true),
});

export const adminGetUserChatsDto = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
  taskType: z.string().optional(),
});

export const adminMetricsDto = z.object({
  days: z.coerce.number().min(1).max(365).default(30),
});

export const adminAnalyticsDto = z.object({
  days: z.coerce.number().min(1).max(365).default(30),
  fromDate: z.string().date().optional(),
  toDate: z.string().date().optional(),
});

export const adminLogsDto = z.object({
  type: z.enum(["error", "combined"]).default("error"),
  limit: z.coerce.number().min(1).max(500).default(50),
});

export const adminActionsDto = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(25),
  search: z.string().optional(),
  action: z.string().optional(),
  actor: z.string().optional(),
  actorType: z.enum(["admin", "user"]).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  order: z.enum(["ASC", "DESC"]).default("DESC"),
});

export const adminBroadcastDto = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1),
  recipients: z.union([z.literal("all"), z.array(z.string().uuid())]),
});

export type AdminGetUsersDto = z.infer<typeof adminGetUsersDto>;
export type AdminUpdateUserDto = z.infer<typeof adminUpdateUserDto>;
export type AdminResetPasswordDto = z.infer<typeof adminResetPasswordDto>;
export type AdminGetUserChatsDto = z.infer<typeof adminGetUserChatsDto>;
export type AdminMetricsDto = z.infer<typeof adminMetricsDto>;
export type AdminAnalyticsDto = z.infer<typeof adminAnalyticsDto>;
export type AdminLogsDto = z.infer<typeof adminLogsDto>;
export type AdminActionsDto = z.infer<typeof adminActionsDto>;
export type AdminBroadcastDto = z.infer<typeof adminBroadcastDto>;