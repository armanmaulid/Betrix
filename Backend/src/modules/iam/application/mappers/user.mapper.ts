import type { User } from "@domain/entities/User.js";

export function toUserResponseDto(user: User) {
  return {
    id: user.id,
    userId: user.id,
    email: user.email,
    name: user.name,
    isAdmin: user.isAdmin,
    status: user.status,
    emailVerified: user.emailVerified,
    credits: user.credits,
    createdAt: user.createdAt,
    lastActive: user.lastActive,
    phone: user.phone,
    address: user.address,
    birthdate: user.birthdate,
    gender: user.gender,
    bio: user.bio,
    googleId: user.googleId,
    verifiedAt: user.verifiedAt,
  };
}
