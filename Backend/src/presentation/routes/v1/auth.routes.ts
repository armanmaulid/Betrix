import { Router } from "express";
import { container } from "tsyringe";
import passport from "passport";
import { AuthController } from "@presentation/controllers/AuthController.js";
import { authMiddleware, guestMiddleware } from "@presentation/middleware/auth.middleware.js";
import { validate } from "@presentation/middleware/validate.middleware.js";
import { authLimiter, registerLimiter, sensitiveLimiter } from "@core/middleware/rateLimiter.js";
import { registerDto, loginDto, changePasswordDto, changeEmailDto, updateProfileDto, verifyEmailDto, resendVerificationDto } from "@application/dtos/auth.dto.js";

const router = Router();
const controller = container.resolve(AuthController);

// Guest (unauthenticated) routes — brute-force targets, get the strict per-IP
// authLimiter. Authenticated routes (logout/me/profile/sessions) rely on
// perUserLimiter (per-userId) mounted globally in registerMiddleware.
router.post("/register", authLimiter, registerLimiter, guestMiddleware, validate(registerDto), controller.register.bind(controller));
router.post("/login", authLimiter, guestMiddleware, validate(loginDto), controller.login.bind(controller));

// Google OAuth routes
router.get("/google", passport.authenticate("google", { scope: ["profile", "email"], session: false }));
router.get("/google/callback", passport.authenticate("google", { session: false, failureRedirect: "/login?error=google_denied" }), controller.googleCallback.bind(controller));

router.post("/logout-by-credentials", authLimiter, controller.logoutByCredentials.bind(controller));
router.get("/verify-email", authLimiter, validate(verifyEmailDto), controller.verifyEmail.bind(controller));
router.post("/verify-email", authLimiter, validate(verifyEmailDto), controller.verifyEmail.bind(controller));
router.post("/resend-verification", authLimiter, validate(resendVerificationDto), controller.resendVerification.bind(controller));

// Protected routes (requires auth middleware)
const protectedRouter = Router();
protectedRouter.use(authMiddleware);

protectedRouter.post("/logout", controller.logout.bind(controller));
protectedRouter.post("/logout-all", controller.logoutAll.bind(controller));
router.use(protectedRouter);
router.put("/password", authMiddleware, sensitiveLimiter, validate(changePasswordDto), controller.changePassword.bind(controller));
router.put("/email", authMiddleware, sensitiveLimiter, validate(changeEmailDto), controller.changeEmail.bind(controller));
router.get("/me", authMiddleware, controller.getProfile.bind(controller));
router.put("/profile", authMiddleware, validate(updateProfileDto), controller.updateProfile.bind(controller));
router.get("/sessions", authMiddleware, controller.getSessions.bind(controller));
router.delete("/sessions/:fingerprint", authMiddleware, controller.revokeSession.bind(controller));

export default router;