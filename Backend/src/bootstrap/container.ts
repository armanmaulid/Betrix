import "reflect-metadata";
import { container, Lifecycle } from "tsyringe";

// Repositories
import { PgUserRepository } from "@data/repositories/PgUserRepository.js";
import { RedisSessionRepository } from "@data/repositories/RedisSessionRepository.js";
import { PgChatRepository } from "@data/repositories/PgChatRepository.js";
import { PgCreditRepository } from "@data/repositories/PgCreditRepository.js";
import { PgDeviceRepository } from "@data/repositories/PgDeviceRepository.js";
import { PgAdminActionRepository } from "@data/repositories/PgAdminActionRepository.js";
import { PgMessageRepository } from "@data/repositories/PgMessageRepository.js";
import { PgNewsRepository } from "@contexts/news/infrastructure/PgNewsRepository.js";
import { PgUserActivityRepository } from "@data/repositories/PgUserActivityRepository.js";
import { PgSymbolRepository } from "@data/repositories/PgSymbolRepository.js";
import { PgCalendarRepository } from "@data/repositories/PgCalendarRepository.js";
import { PgLoginAttemptRepository } from "@data/repositories/PgLoginAttemptRepository.js";
import { RedisDeviceSessionRepository } from "@data/repositories/RedisDeviceSessionRepository.js";
import { PgVerificationRepository } from "@data/repositories/PgVerificationRepository.js";
import { PgUsageRepository } from "@data/repositories/PgUsageRepository.js";
import { PgActivityLogRepository } from "@data/repositories/PgActivityLogRepository.js";
import { PgAnalyticsRepository } from "@data/repositories/PgAnalyticsRepository.js";
import { RedisMarketDataRepository } from "@data/repositories/RedisMarketDataRepository.js";
import { RedisCaptchaStore } from "@data/repositories/RedisCaptchaStore.js";
import { RedisStreamTicketStore } from "@data/repositories/RedisStreamTicketStore.js";
import { RedisOAuthCodeStore } from "@data/repositories/RedisOAuthCodeStore.js";

// External services
import { AiGatewayClient } from "@data/external/AiGatewayClient.js";
import { EmailService } from "@data/external/EmailService.js";
import { FinnhubClient } from "@data/external/FinnhubClient.js";
import { Mt5BrokerAdapter } from "@data/external/Mt5BrokerAdapter.js";
import { Mt5HttpClient } from "@data/external/Mt5HttpClient.js";
import { Mt5WebsocketClient } from "@data/external/Mt5WebsocketClient.js";
import { GeneralCacheStore } from "@data/cache/GeneralCacheStore.js";
import { FinnhubNewsAdapter } from "@contexts/news/infrastructure/FinnhubNewsAdapter.js";
import { SseNotifier } from "@infrastructure/sse/SseNotifier.js";
import { env } from "@config/env.js";
import { isDeviceEnforcementEnabled } from "@config/deviceEnforcement.js";
import { AppSettings } from "@core/settings/AppSettings.js";
import { ModelPolicy } from "@domain/services/ModelPolicy.js";
import { TradeAnalysisPromptBuilder } from "@domain/services/TradeAnalysisPromptBuilder.js";

// Use cases
import { RegisterUseCase } from "@modules/iam/application/use-cases/RegisterUseCase.js";
import { LoginUseCase } from "@modules/iam/application/use-cases/LoginUseCase.js";
import { LogoutUseCase } from "@modules/iam/application/use-cases/LogoutUseCase.js";
import { VerifyEmailUseCase } from "@modules/iam/application/use-cases/VerifyEmailUseCase.js";
import { ResendVerificationUseCase } from "@modules/iam/application/use-cases/ResendVerificationUseCase.js";
import { ChangePasswordUseCase } from "@modules/iam/application/use-cases/ChangePasswordUseCase.js";
import { ChangeEmailUseCase } from "@modules/iam/application/use-cases/ChangeEmailUseCase.js";
import { GetProfileUseCase } from "@modules/iam/application/use-cases/GetProfileUseCase.js";
import { UpdateProfileUseCase } from "@modules/iam/application/use-cases/UpdateProfileUseCase.js";
import { GetSessionsUseCase } from "@modules/iam/application/use-cases/GetSessionsUseCase.js";
import { GetStreamTicketUseCase } from "@modules/iam/application/use-cases/GetStreamTicketUseCase.js";
import { ExchangeOAuthCodeUseCase } from "@modules/iam/application/use-cases/ExchangeOAuthCodeUseCase.js";
import { RevokeSessionUseCase } from "@modules/iam/application/use-cases/RevokeSessionUseCase.js";
import { LogoutByCredentialsUseCase } from "@modules/iam/application/use-cases/LogoutByCredentialsUseCase.js";
import { LogoutAllUseCase } from "@modules/iam/application/use-cases/LogoutAllUseCase.js";

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

import { GetUsageUseCase } from "@modules/iam/application/use-cases/GetUsageUseCase.js";
import { GetMessagesUseCase } from "@modules/iam/application/use-cases/GetMessagesUseCase.js";
import { SendMessageUseCase as SendUserMessageUseCase } from "@modules/iam/application/use-cases/SendMessageUseCase.js";
import { UpdateNotificationPrefsUseCase } from "@modules/iam/application/use-cases/UpdateNotificationPrefsUseCase.js";
import { GetNotificationPrefsUseCase } from "@modules/iam/application/use-cases/GetNotificationPrefsUseCase.js";
import { GetUserActivityUseCase } from "@modules/iam/application/use-cases/GetUserActivityUseCase.js";
import { GetSentMessagesUseCase } from "@modules/iam/application/use-cases/GetSentMessagesUseCase.js";
import { GetMessageDetailUseCase } from "@modules/iam/application/use-cases/GetMessageDetailUseCase.js";
import { GetMessageThreadUseCase } from "@modules/iam/application/use-cases/GetMessageThreadUseCase.js";
import { MarkMessageReadUseCase } from "@modules/iam/application/use-cases/MarkMessageReadUseCase.js";
import { DeleteMessageUseCase as UserDeleteMessageUseCase } from "@modules/iam/application/use-cases/DeleteMessageUseCase.js";

import { GetSymbolsUseCase } from "@application/use-cases/market/GetSymbolsUseCase.js";
import { GetCalendarUseCase } from "@application/use-cases/market/GetCalendarUseCase.js";

import { FetchNewsUseCase } from "@contexts/news/application/use-cases/FetchNewsUseCase.js";
import { StoreNewsUseCase } from "@contexts/news/application/use-cases/StoreNewsUseCase.js";
import { GetNewsUseCase } from "@contexts/news/application/use-cases/GetNewsUseCase.js";

// Controllers
import { AuthController } from "@presentation/controllers/AuthController.js";
import { ChatController } from "@presentation/controllers/ChatController.js";
import { AdminController } from "@presentation/controllers/AdminController.js";
import { UserController } from "@presentation/controllers/UserController.js";
import { MarketController } from "@presentation/controllers/MarketController.js";
import { NewsController } from "@presentation/controllers/NewsController.js";
import { MarketDataService } from "@application/services/MarketDataService.js";
import { TradeAnalysisContextService } from "@application/services/TradeAnalysisContextService.js";
import { CalendarService } from "@application/services/CalendarService.js";
import { AuthService } from "@application/services/AuthService.js";
import { CaptchaService } from "@application/services/CaptchaService.js";
import { NewsService } from "@contexts/news/application/NewsService.js";

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
  container.register("AnalyticsRepository", { useClass: PgAnalyticsRepository });
  container.register("UserActivityRepository", { useClass: PgUserActivityRepository });
  container.register("SymbolRepository", { useClass: PgSymbolRepository });
  container.register("CalendarRepository", { useClass: PgCalendarRepository });
  container.register("LoginAttemptRepository", { useClass: PgLoginAttemptRepository });
  container.register("DeviceSessionRepository", { useClass: RedisDeviceSessionRepository });
  container.register("VerificationRepository", { useClass: PgVerificationRepository });
  container.register("UsageRepository", { useClass: PgUsageRepository });
  container.register("ActivityLogRepository", { useClass: PgActivityLogRepository });
  container.register("NewsRepository", { useClass: PgNewsRepository });
  container.register("NewsContextPort", { useClass: PgNewsRepository });
  container.register("MarketDataRepository", { useClass: RedisMarketDataRepository });
  container.register("CaptchaStore", { useClass: RedisCaptchaStore });
  container.register("StreamTicketStore", { useClass: RedisStreamTicketStore });
  container.register("OAuthCodeStore", { useClass: RedisOAuthCodeStore });

  // External services
  container.register("AiPort", { useClass: AiGatewayClient });
  container.register("EmailPort", { useClass: EmailService });
  container.register("FinnhubClient", { useClass: FinnhubClient });
  container.register("INewsProvider", { useClass: FinnhubNewsAdapter });
  container.register("Mt5HttpClient", { useClass: Mt5HttpClient }, { lifecycle: Lifecycle.Singleton });
  container.register("Mt5WebsocketClient", { useClass: Mt5WebsocketClient }, { lifecycle: Lifecycle.Singleton });
  container.register("IBrokerProvider", { useClass: Mt5BrokerAdapter }, { lifecycle: Lifecycle.Singleton });
  container.register("CachePort", { useClass: GeneralCacheStore }, { lifecycle: Lifecycle.Singleton });
  container.register("INotifier", { useClass: SseNotifier }, { lifecycle: Lifecycle.Singleton });
  container.register(SseNotifier, { useClass: SseNotifier }, { lifecycle: Lifecycle.Singleton });

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
  container.register("GetStreamTicketUseCase", { useClass: GetStreamTicketUseCase });
  container.register("ExchangeOAuthCodeUseCase", { useClass: ExchangeOAuthCodeUseCase });
  container.register("RevokeSessionUseCase", { useClass: RevokeSessionUseCase });
  container.register("LogoutByCredentialsUseCase", { useClass: LogoutByCredentialsUseCase });
  container.register("LogoutAllUseCase", { useClass: LogoutAllUseCase });

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
  container.register("GetNotificationPrefsUseCase", { useClass: GetNotificationPrefsUseCase });
  container.register("GetUserActivityUseCase", { useClass: GetUserActivityUseCase });
  container.register("GetSentMessagesUseCase", { useClass: GetSentMessagesUseCase });
  container.register("GetMessageDetailUseCase", { useClass: GetMessageDetailUseCase });
  container.register("GetMessageThreadUseCase", { useClass: GetMessageThreadUseCase });
  container.register("MarkMessageReadUseCase", { useClass: MarkMessageReadUseCase });
  container.register("UserDeleteMessageUseCase", { useClass: UserDeleteMessageUseCase });

  container.register("GetSymbolsUseCase", { useClass: GetSymbolsUseCase });
  container.register("GetCalendarUseCase", { useClass: GetCalendarUseCase });

  container.register("FetchNewsUseCase", { useClass: FetchNewsUseCase });
  container.register("StoreNewsUseCase", { useClass: StoreNewsUseCase });
  container.register("GetNewsUseCase", { useClass: GetNewsUseCase });

  // Settings & policies — env dibaca HANYA di sini (Phase 5),
  // application/domain tidak lagi menyentuh @config/* atau process.env.
  container.register("AppSettings", {
    useValue: new AppSettings(
      process.env.REQUIRE_EMAIL_VERIFICATION === "true",
      isDeviceEnforcementEnabled(),
      env.MT5_TRACK_CALENDAR,
      env.MT5_TRACK_PRICES,
      env.MT5_TRACK_OHLC,
      env.MT5_TRACK_MBOOK,
      env.MT5_TRACKING_SYMBOLS,
      env.MT5_BROKER_UTC_OFFSET
    ),
  });
  container.register("ModelPolicy", {
    useFactory: () => new ModelPolicy({
      cheap: { id: env.MODEL_CHEAP, label: "Model murah (General, kategorisasi)", maxTokens: env.MODEL_CHEAP_MAX_TOKENS },
      balanced: { id: env.MODEL_BALANCED, label: "Model seimbang (ringkasan, insight)", maxTokens: env.MODEL_BALANCED_MAX_TOKENS },
      deep: { id: env.MODEL_DEEP, label: "Model dalam (analisis, narasi risiko)", maxTokens: env.MODEL_DEEP_MAX_TOKENS },
    }),
  });

  // Services
  container.register("MarketDataService", { useClass: MarketDataService });
  container.register("CalendarService", { useClass: CalendarService });
  container.register("AuthService", { useClass: AuthService });
  container.register("NewsService", { useClass: NewsService });
  container.register("AiPromptRegistry", { useClass: AiPromptRegistry });
  container.register("CaptchaService", { useClass: CaptchaService });
  container.register("TradeAnalysisPromptBuilder", { useClass: TradeAnalysisPromptBuilder });
  container.register("TradeAnalysisContextService", { useClass: TradeAnalysisContextService });

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