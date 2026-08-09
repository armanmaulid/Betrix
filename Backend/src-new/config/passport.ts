import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { container } from "tsyringe";
import { UserRepository } from "@domain/repositories/UserRepository.js";
import { env } from "@config/env";

const googleOAuthConfigured = Boolean(env.GOOGLE_CLIENT_ID) && Boolean(env.GOOGLE_CLIENT_SECRET) && Boolean(env.GOOGLE_CALLBACK_URL);

if (googleOAuthConfigured) {
  passport.use(new GoogleStrategy(
    {
      clientID: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackURL: env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) {
          return done(new Error("Email not available from Google"), undefined);
        }

        const userRepo = container.resolve(UserRepository);
        let user = await userRepo.findByEmail({ value: email } as any);

        if (!user) {
          try {
            user = await userRepo.save({
              id: crypto.randomUUID(),
              email,
              passwordHash: null,
              name: profile.displayName,
              isAdmin: false,
              status: "active",
              emailVerified: true,
              credits: 100,
              createdAt: new Date(),
              lastActive: null,
              googleId: profile.id,
              phone: null,
              address: null,
              birthdate: null,
              gender: null,
              bio: null,
              verifiedAt: new Date(),
            } as any);
          } catch (createErr: any) {
            if (createErr.code === '23505') {
              user = await userRepo.findByEmail({ value: email } as any);
              if (!user) throw createErr;
            } else {
              throw createErr;
            }
          }
        }

        return done(null, user);
      } catch (err) {
        return done(err as Error, undefined);
      }
    }
  ));
} else {
  console.warn("[passport] Google OAuth not configured - skipping strategy registration");
}

passport.serializeUser((user: any, done) => done(null, user.id));
passport.deserializeUser(async (id: string, done) => {
  try {
    const userRepo = container.resolve(UserRepository);
    const user = await userRepo.findById(id);
    done(null, user);
  } catch (err) {
    done(err as Error, null);
  }
});

export default passport;