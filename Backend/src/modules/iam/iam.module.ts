// modules/iam/iam.module.ts
// Barrel export — PUBLIC API untuk module IAM (Identity & Access Management).
// Module lain hanya boleh import dari file ini, bukan dari internal paths.
//
// Public API:
//  - All use cases (Login, Register, GetProfile, ChangePassword, dll)
//  - IOC registration function (registerIamContainer)
//  - Public domain types & events
//  - Public DTOs

// === Use Cases (public) ===
export { LoginUseCase } from "./application/use-cases/LoginUseCase.js";
export { RegisterUseCase } from "./application/use-cases/RegisterUseCase.js";
export { LogoutUseCase } from "./application/use-cases/LogoutUseCase.js";
export { LogoutAllUseCase } from "./application/use-cases/LogoutAllUseCase.js";
export { LogoutByCredentialsUseCase } from "./application/use-cases/LogoutByCredentialsUseCase.js";
export { VerifyEmailUseCase } from "./application/use-cases/VerifyEmailUseCase.js";
export { ResendVerificationUseCase } from "./application/use-cases/ResendVerificationUseCase.js";
export { ChangePasswordUseCase } from "./application/use-cases/ChangePasswordUseCase.js";
export { ChangeEmailUseCase } from "./application/use-cases/ChangeEmailUseCase.js";
export { GetProfileUseCase } from "./application/use-cases/GetProfileUseCase.js";
export { UpdateProfileUseCase } from "./application/use-cases/UpdateProfileUseCase.js";
export { GetSessionsUseCase } from "./application/use-cases/GetSessionsUseCase.js";
export { RevokeSessionUseCase } from "./application/use-cases/RevokeSessionUseCase.js";
export { GetStreamTicketUseCase } from "./application/use-cases/GetStreamTicketUseCase.js";
export { ExchangeOAuthCodeUseCase } from "./application/use-cases/ExchangeOAuthCodeUseCase.js";

// === IOC ===
export { registerIamContainer } from "./ioc/register.js";

// === Public Types ===
export type { User } from "@domain/entities/User.js";
export type { Session } from "@domain/entities/Session.js";

// === Public Domain Events ===
export type { UserLoggedIn, UserRegistered } from "@domain/events/index.js";
