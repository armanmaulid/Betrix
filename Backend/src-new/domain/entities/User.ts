export enum UserStatus {
  ACTIVE = "active",
  BANNED = "banned",
  SUSPENDED = "suspended",
}

export class User {
  constructor(
    public readonly id: string,
    public readonly email: string,
    public readonly passwordHash: string | null,
    public readonly name: string,
    public readonly isAdmin: boolean,
    public readonly status: UserStatus,
    public readonly emailVerified: boolean,
    public readonly credits: number,
    public readonly createdAt: Date,
    public readonly lastActive: Date | null,
    public readonly googleId: string | null,
    public readonly phone: string | null,
    public readonly address: string | null,
    public readonly birthdate: Date | null,
    public readonly gender: string | null,
    public readonly bio: string | null,
    public readonly verifiedAt: Date | null
  ) {}

  get userId(): string {
    return this.id;
  }

  static create(data: {
    id: string;
    email: string;
    passwordHash: string | null;
    name: string;
    emailVerified?: boolean;
    googleId?: string | null;
  }): User {
    return new User(
      data.id,
      data.email.toLowerCase(),
      data.passwordHash,
      data.name,
      false,
      UserStatus.ACTIVE,
      data.emailVerified ?? false,
      100,
      new Date(),
      null,
      data.googleId ?? null,
      null, null, null, null, null, null
    );
  }

  canLogin(): boolean {
    return this.status === UserStatus.ACTIVE;
  }

  isGoogleOnly(): boolean {
    return this.passwordHash === null && this.googleId !== null;
  }

  withUpdatedProfile(updates: Partial<Pick<User, "name" | "phone" | "address" | "birthdate" | "gender" | "bio">>): User {
    return new User(
      this.id, this.email, this.passwordHash,
      updates.name ?? this.name,
      this.isAdmin, this.status, this.emailVerified, this.credits,
      this.createdAt, this.lastActive, this.googleId,
      updates.phone ?? this.phone,
      updates.address ?? this.address,
      updates.birthdate ?? this.birthdate,
      updates.gender ?? this.gender,
      updates.bio ?? this.bio,
      this.verifiedAt
    );
  }

  withEmailVerified(): User {
    return new User(
      this.id, this.email, this.passwordHash, this.name,
      this.isAdmin, this.status, true, this.credits,
      this.createdAt, this.lastActive, this.googleId,
      this.phone, this.address, this.birthdate, this.gender, this.bio,
      new Date()
    );
  }

  withStatus(status: UserStatus): User {
    return new User(
      this.id, this.email, this.passwordHash, this.name,
      this.isAdmin, status, this.emailVerified, this.credits,
      this.createdAt, this.lastActive, this.googleId,
      this.phone, this.address, this.birthdate, this.gender, this.bio,
      this.verifiedAt
    );
  }

  withCredits(credits: number): User {
    return new User(
      this.id, this.email, this.passwordHash, this.name,
      this.isAdmin, this.status, this.emailVerified, credits,
      this.createdAt, this.lastActive, this.googleId,
      this.phone, this.address, this.birthdate, this.gender, this.bio,
      this.verifiedAt
    );
  }

  withLastActive(): User {
    return new User(
      this.id, this.email, this.passwordHash, this.name,
      this.isAdmin, this.status, this.emailVerified, this.credits,
      this.createdAt, new Date(), this.googleId,
      this.phone, this.address, this.birthdate, this.gender, this.bio,
      this.verifiedAt
    );
  }

  withIsAdmin(isAdmin: boolean): User {
    return new User(
      this.id, this.email, this.passwordHash, this.name,
      isAdmin, this.status, this.emailVerified, this.credits,
      this.createdAt, this.lastActive, this.googleId,
      this.phone, this.address, this.birthdate, this.gender, this.bio,
      this.verifiedAt
    );
  }
}