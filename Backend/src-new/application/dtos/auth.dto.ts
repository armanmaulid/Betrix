import { z } from "zod";

export const registerDto = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});

export const loginDto = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const changePasswordDto = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export const changeEmailDto = z.object({
  currentPassword: z.string().min(1),
  newEmail: z.string().email(),
});

export const updateProfileDto = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  birthdate: z.string().date().optional(),
  gender: z.enum(["male", "female", "other"]).optional(),
  bio: z.string().optional(),
});

export const verifyEmailDto = z.object({
  token: z.string().min(1),
});

export const resendVerificationDto = z.object({
  email: z.string().email(),
});

export type RegisterDto = z.infer<typeof registerDto>;
export type LoginDto = z.infer<typeof loginDto>;
export type ChangePasswordDto = z.infer<typeof changePasswordDto>;
export type ChangeEmailDto = z.infer<typeof changeEmailDto>;
export type UpdateProfileDto = z.infer<typeof updateProfileDto>;
export type VerifyEmailDto = z.infer<typeof verifyEmailDto>;
export type ResendVerificationDto = z.infer<typeof resendVerificationDto>;