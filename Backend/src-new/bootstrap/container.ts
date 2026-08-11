import "reflect-metadata";
import { container, Lifecycle } from "tsyringe";
import { pgClient } from "@data/orm/pgClient.js";
import { redisClient } from "@data/orm/redisClient.js";

// Repositories
import { PgUserRepository } from "@data/repositories/PgUserRepository.js";
import { RedisSessionRepository } from "@data/repositories/RedisSessionRepository.js";
import { PgChatRepository } from "@data/repositories/PgChatRepository.js";
import { PgCreditRepository } from "@data/repositories/PgCreditRepository.js";
import { PgDeviceRepository } from "@data/repositories/PgDeviceRepository.js";
import { PgAdminActionRepository } from "@data/repositories/PgAdminActionRepository.js";
import { PgMessageRepository } from "@data/repositories/PgMessageRepository.js";
import { PgNewsRepository } from "@data/repositories/PgNewsRepository.js";
import { PgSymbolRepository } from "@data/repositories/PgSymbolRepository.js";
import { PgCalendarRepository } from "@data/repositories/PgCalendarRepository.js";
import { PgLoginAttemptRepository } from "@data/repositories/PgLoginAttemptRepository.js";
import { RedisDeviceSessionRepository } from "@data/repositories/RedisDeviceSessionRepository.js";
import { PgVerificationRepository } from "@data/repositories/PgVerificationRepository.js";
import { PgUsageRepository } from "@data/repositories/PgUsageRepository.js";
import { RedisMarketDataRepository } from "@data/repositories/RedisMarketDataRepository.js";

// External services
import { AiGatewayClient } from "@data/external/AiGatewayClient.js";
import { EmailService } from "@data/external/EmailService.js";
import { FinnhubClient } from "@data/external/FinnhubClient.js";
import { Mt5BrokerAdapter } from "@data/external/Mt5BrokerAdapter.js";
import { Mt5HttpClient } from "@data/external/Mt5HttpClient.js";
import { Mt5WebsocketClient } from "@data/external/Mt5WebsocketClient.js";
import { GeneralCacheStore } from "@data/cache/GeneralCacheStore.js";
import { FinnhubNewsAdapter } from "@data/external/FinnhubNewsAdapter.js";

// Use cases
import { RegisterUseCase } from "@application/use-cases/auth/RegisterUseCase.js";
import { LoginUseCase } from "@application/use-cases/auth/LoginUseCase.js";
import { LogoutUseCase } from "@application/use-cases/auth/LogoutUseCase.js";
import { VerifyEmailUseCase } from "@application/use-cases/auth/VerifyEmailUseCase.js";
import { ResendVerificationUseCase } from "@application/use-cases/auth/ResendVerificationUseCase.js";
import { ChangePasswordUseCase } from "@application/use-cases/auth/ChangePasswordUseCase.js";
import { ChangeEmailUseCase } from "@application/use-cases/auth/ChangeEmailUseCase.js";
import { GetProfileUseCase } from "@application/use-cases/auth/GetProfileUseCase.js";
import { UpdateProfileUseCase } from "@application/use-cases/auth/UpdateProfileUseCase.js";
import { GetSessionsUseCase } from "@application/use-cases/auth/GetSessionsUseCase.js";
import { RevokeSessionUseCase } from "@application/use-cases/auth/RevokeSessionUseCase.js";

import { SendMessageUseCase } from "@application/use-cases/chat/SendMessageUseCase.js";
import { StreamMessageUseCase } from "@application/use-cases/chat/StreamMessageUseCase.js";
import { GetChatHistoryUseCase } from "@application/use-cases/chat/GetChatHistoryUseCase.js";
import { DeleteChatSessionUseCase } from "@application/use-cases/chat/DeleteChatSessionUseCase.js";
import { ExportChatHistoryUseCase } from "@application/use-cases/chat/ExportChatHistoryUseCase.js";

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
import { SystemCleanupUseCase } from "@application/use-cases/admin/SystemCleanupUseCase.js";

import { GetUsageUseCase } from "@application/use-cases/user/GetUsageUseCase.js";
import { GetMessagesUseCase } from "@application/use-cases/user/GetMessagesUseCase.js";
import { SendMessageUseCase as SendUserMessageUseCase } from "@application/use-cases/user/SendMessageUseCase.js";
import { UpdateNotificationPrefsUseCase } from "@application/use-cases/user/UpdateNotificationPrefsUseCase.js";

import { GetSymbolsUseCase } from "@application/use-cases/market/GetSymbolsUseCase.js";
import { GetCalendarUseCase } from "@application/use-cases/market/GetCalendarUseCase.js";

import { FetchNewsUseCase } from "@application/use-cases/news/FetchNewsUseCase.js";
import { StoreNewsUseCase } from "@application/use-cases/news/StoreNewsUseCase.js";
import { GetNewsUseCase } from "@application/use-cases/news/GetNewsUseCase.js";

// Controllers
import { AuthController } from "@presentation/controllers/AuthController.js";
import { ChatController } from "@presentation/controllers/ChatController.js";
import { AdminController } from "@presentation/controllers/AdminController.js";
import { UserController } from "@presentation/controllers/UserController.js";
import { MarketController } from "@presentation/controllers/MarketController.js";
import { NewsController } from "@presentation/controllers/NewsController.js";
import { MarketDataService } from "@domain/services/MarketDataService.js";
import { AuthDomainService } from "@domain/services/AuthDomainServiceImpl.js";
import { NewsService } from "@domain/services/NewsService.js";

// Events & Handlers
import { EventDispatcher } from "@domain/events/index.js";
import { ChatLoggingHandler } from "@application/event-handlers/ChatLoggingHandler.js";
import { AiPromptRegistry } from "@domain/services/AiPromptRegistry.js";

export function registerDependencies() {
  // Repositories
  container.register("UserRepository", { useClass: PgUserRepository });
  container.register("SessionRepository", { useClass: RedisSessionRepository });
  container.register("ChatRepository", { useClass: PgChatRepository });
  container.register("CreditRepository", { useClass: PgCreditRepository });
  container.register("DeviceRepository", { useClass: PgDeviceRepository });
  container.register("AdminActionRepository", { useClass: PgAdminActionRepository });
  container.register("MessageRepository", { useClass: PgMessageRepository });
  container.register("NewsRepository", { useClass: PgNewsRepository });
  container.register("SymbolRepository", { useClass: PgSymbolRepository });
  container.register("CalendarRepository", { useClass: PgCalendarRepository });
  container.register("LoginAttemptRepository", { useClass: PgLoginAttemptRepository });
  container.register("DeviceSessionRepository", { useClass: RedisDeviceSessionRepository });
  container.register("VerificationRepository", { useClass: PgVerificationRepository });
  container.register("UsageRepository", { useClass: PgUsageRepository });
  container.register("MarketDataRepository", { useClass: RedisMarketDataRepository });

  // External services
  container.register("AiPort", { useClass: AiGatewayClient });
  container.register("EmailPort", { useClass: EmailService });
  container.register("FinnhubClient", { useClass: FinnhubClient });
  container.register("INewsProvider", { useClass: FinnhubNewsAdapter });
  container.register("Mt5HttpClient", { useClass: Mt5HttpClient }, { lifecycle: Lifecycle.Singleton });
  container.register("Mt5WebsocketClient", { useClass: Mt5WebsocketClient }, { lifecycle: Lifecycle.Singleton });
  container.register("IBrokerProvider", { useClass: Mt5BrokerAdapter }, { lifecycle: Lifecycle.Singleton });
  container.register("CachePort", { useClass: GeneralCacheStore }, { lifecycle: Lifecycle.Singleton });

  // Use cases
  container.register("RegisterUseCase", { useClass: RegisterUseCase });
  container.register("LoginUseCase", { useClass: LoginUseCase });
  container.register("LogoutUseCase", { useClass: LogoutUseCase });
  container.register("VerifyEmailUseCase", { useClass: VerifyEmailUseCase });
  container.register("ResendVerificationUseCase", { useClass: ResendVerificationUseCase });
  container.register("ChangePasswordUseCase", { useClass: ChangePasswordUseCase });
  container.register("ChangeEmailUseCase", { useClass: ChangeEmailUseCase });
  container.register("GetProfileUseCase", { useClass: GetProfileUseCase });
  container.register("UpdateProfileUseCase", { useClass: UpdateProfileUseCase });
  container.register("GetSessionsUseCase", { useClass: GetSessionsUseCase });
  container.register("RevokeSessionUseCase", { useClass: RevokeSessionUseCase });

  container.register("SendMessageUseCase", { useClass: SendMessageUseCase });
  container.register("StreamMessageUseCase", { useClass: StreamMessageUseCase });
  container.register("GetChatHistoryUseCase", { useClass: GetChatHistoryUseCase });
  container.register("DeleteChatSessionUseCase", { useClass: DeleteChatSessionUseCase });
  container.register("ExportChatHistoryUseCase", { useClass: ExportChatHistoryUseCase });

  container.register("GetUsersUseCase", { useClass: GetUsersUseCase });
  container.register("GetUserDetailUseCase", { useClass: GetUserDetailUseCase });
  container.register("UpdateUserUseCase", { useClass: UpdateUserUseCase });
  container.register("DeleteUserUseCase", { useClass: DeleteUserUseCase });
  container.register("ResetUserPasswordUseCase", { useClass: ResetUserPasswordUseCase });
  container.register("GetMetricsUseCase", { useClass: GetMetricsUseCase });
  container.register("GetAnalyticsUseCase", { useClass: GetAnalyticsUseCase });
  container.register("GetSystemInfoUseCase", { useClass: GetSystemInfoUseCase });
  container.register("GetAuditLogsUseCase", { useClass: GetAuditLogsUseCase });
  container.register("ExportAuditLogsUseCase", { useClass: ExportAuditLogsUseCase });
  container.register("BroadcastMessageUseCase", { useClass: BroadcastMessageUseCase });
  container.register("SystemCleanupUseCase", { useClass: SystemCleanupUseCase });

  container.register("GetUsageUseCase", { useClass: GetUsageUseCase });
  container.register("GetMessagesUseCase", { useClass: GetMessagesUseCase });
  container.register("SendUserMessageUseCase", { useClass: SendUserMessageUseCase });
  container.register("UpdateNotificationPrefsUseCase", { useClass: UpdateNotificationPrefsUseCase });

  container.register("GetSymbolsUseCase", { useClass: GetSymbolsUseCase });
  container.register("GetCalendarUseCase", { useClass: GetCalendarUseCase });

  container.register("FetchNewsUseCase", { useClass: FetchNewsUseCase });
  container.register("StoreNewsUseCase", { useClass: StoreNewsUseCase });
  container.register("GetNewsUseCase", { useClass: GetNewsUseCase });

  // Services
  container.register("MarketDataService", { useClass: MarketDataService });
  container.register("AuthDomainService", { useClass: AuthDomainService });
  container.register("NewsService", { useClass: NewsService });
  container.register("AiPromptRegistry", { useClass: AiPromptRegistry });

  // Events & Handlers
  container.register("EventDispatcher", { useClass: EventDispatcher }, { lifecycle: Lifecycle.Singleton });
  container.register("ChatLoggingHandler", { useClass: ChatLoggingHandler });

  // Controllers
  container.register("AuthController", { useClass: AuthController });
  container.register("ChatController", { useClass: ChatController });
  container.register("AdminController", { useClass: AdminController });
  container.register("UserController", { useClass: UserController });
  container.register("MarketController", { useClass: MarketController });
  container.register("NewsController", { useClass: NewsController });
}