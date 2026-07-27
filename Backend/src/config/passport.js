import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { findByEmail, createUser, findById } from "../services/userStore.js";

const googleOAuthConfigured =
  Boolean(process.env.GOOGLE_CLIENT_ID) &&
  Boolean(process.env.GOOGLE_CLIENT_SECRET) &&
  Boolean(process.env.GOOGLE_CALLBACK_URL);

if (googleOAuthConfigured) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;

          if (!email) {
            return done(new Error("Email tidak tersedia dari Google"), null);
          }

          let user = await findByEmail(email);

          if (!user) {
            try {
              user = await createUser({
                email,
                passwordHash: null,
                name: profile.displayName,
                emailVerified: true,
                googleId: profile.id,
              });
            } catch (createErr) {
              if (createErr.code === '23505') {
                user = await findByEmail(email);
                if (!user) throw createErr;
              } else {
                throw createErr;
              }
            }
          }

          return done(null, user);
        } catch (err) {
          console.error("[passport] Google OAuth error:", err);
          return done(err, null);
        }
      }
    )
  );
} else {
  console.warn(
    "[passport] GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_CALLBACK_URL belum lengkap di .env -- " +
      "Google OAuth strategy TIDAK didaftarkan. Endpoint /api/auth/google akan error kalau diakses. " +
      "Login via password tetap berfungsi normal."
  );
}

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

export default passport;
