import passport from "passport";
import type { Profile, VerifyCallback } from "passport-google-oauth20";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { container } from "tsyringe";
import type { UserRepository } from "@domain/repositories/UserRepository.js";
import type { SessionRepository } from "@domain/repositories/SessionRepository.js";
import { env } from "@config/env";
import { User } from "@domain/entities/User.js";
import { Email } from "@domain/value-objects";
import { logger } from "@infrastructure/observability/logger.js";

const log = logger.child({ module: "iam", component: "passport-config" });

const googleOAuthConfigured = Boolean(env.GOOGLE_CLIENT_ID) && Boolean(env.GOOGLE_CLIENT_SECRET) && Boolean(env.GOOGLE_CALLBACK_URL);

if (googleOAuthConfigured) {
  passport.use(new GoogleStrategy(
    {
      clientID: env.GOOGLE_CLIENT_ID!,
      clientSecret: env.GOOGLE_CLIENT_SECRET!,
      callbackURL: env.GOOGLE_CALLBACK_URL!,
    },
    async (accessToken: string, refreshToken: string, profile: Profile, done: VerifyCallback) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) {
          return done(new Error("Email not available from Google"), undefined);
        }

        const userRepo = container.resolve("UserRepository") as UserRepository;
        let user = await userRepo.findByEmail(new Email(email));

        if (!user) {
          try {
            const newUser = User.create({
              id: crypto.randomUUID(),
              email,
              passwordHash: null,
              name: profile.displayName,
              emailVerified: true,
              googleId: profile.id,
            });
            user = await userRepo.save(newUser);
          } catch (createErr: unknown) {
            const dbCode = createErr && typeof createErr === "object" && "code" in createErr
              ? String((createErr as { code?: unknown }).code)
              : undefined;
            if (dbCode === '23505') {
              user = await userRepo.findByEmail(new Email(email));
              if (!user) throw createErr;
            } else {
              throw createErr;
            }
          }
        } else if (!user.emailVerified) {
          // Reclaim (BUG-10): akun unverified bisa jadi pre-registrasi orang lain.
          // Google baru saja membuktikan pemilik email yang sah → set verified +
          // invalidasi password lama (paksa reset) — jangan auto-login buta ke
          // akun unverified yang password-nya diketahui pihak tak dikenal.
          const reclaimed = user.withEmailVerified().withPasswordHash(null).withGoogleId(profile.id);
          user = await userRepo.save(reclaimed);
          // Kill any live session the squatter may still hold — password
          // alone isn't enough, an already-issued session token stays valid
          // otherwise (same pattern as ChangePasswordUseCase/ResetUserPasswordUseCase).
          const sessionRepo = container.resolve("SessionRepository") as SessionRepository;
          await sessionRepo.deleteByUserId(user.id);
        }

        return done(null, user);
      } catch (err) {
        return done(err as Error, undefined);
      }
    }
  ));
} else {
  log.warn("Google OAuth not configured - skipping strategy registration");
}

passport.serializeUser((user: Express.User, done) => done(null, user.id));
passport.deserializeUser(async (id: string, done) => {
  try {
    const userRepo = container.resolve("UserRepository") as UserRepository;
    const user = await userRepo.findById(id);
    done(null, user);
  } catch (err) {
    done(err as Error, null);
  }
});

export default passport;