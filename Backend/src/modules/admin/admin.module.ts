// modules/admin/admin.module.ts
// Barrel export — PUBLIC API untuk module Admin.

// === Use Cases (public) ===
export { GetUsersUseCase } from "./application/use-cases/GetUsersUseCase.js";
export { GetUserDetailUseCase } from "./application/use-cases/GetUserDetailUseCase.js";
export { UpdateUserUseCase } from "./application/use-cases/UpdateUserUseCase.js";
export { DeleteUserUseCase } from "./application/use-cases/DeleteUserUseCase.js";
export { ResetUserPasswordUseCase } from "./application/use-cases/ResetUserPasswordUseCase.js";
export { BroadcastMessageUseCase } from "./application/use-cases/BroadcastMessageUseCase.js";
export { GetAnalyticsUseCase } from "./application/use-cases/GetAnalyticsUseCase.js";
export { GetMetricsUseCase } from "./application/use-cases/GetMetricsUseCase.js";
export { GetAuditLogsUseCase } from "./application/use-cases/GetAuditLogsUseCase.js";
export { ExportAuditLogsUseCase } from "./application/use-cases/ExportAuditLogsUseCase.js";
export { GetSystemInfoUseCase } from "./application/use-cases/GetSystemInfoUseCase.js";
export { SystemCleanupUseCase } from "./application/use-cases/SystemCleanupUseCase.js";

// === IOC ===
export { registerAdminContainer } from "./ioc/register.js";

// === Public Types ===
export type { AdminAction } from "@domain/entities/AdminAction.js";
export type { UserActivity } from "@domain/entities/UserActivity.js";
