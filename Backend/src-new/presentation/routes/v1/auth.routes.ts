import { Router } from "express";
import { container } from "tsyringe";
import { AuthController } from "@presentation/controllers/AuthController.js";
import { authMiddleware, guestMiddleware } from "@presentation/middleware/auth.middleware.js";
import { validate } from "@presentation/middleware/validate.middleware.js";
import { registerDto, loginDto, changePasswordDto, changeEmailDto, updateProfileDto, verifyEmailDto, resendVerificationDto } from "@application/dtos/auth.dto.js";

const router = Router();
const controller = container.resolve(AuthController);

router.post("/register", guestMiddleware, validate(registerDto), controller.register.bind(controller));
router.post("/login", guestMiddleware, validate(loginDto), controller.login.bind(controller));
router.post("/logout", authMiddleware, controller.logout.bind(controller));
router.get("/verify-email", validate(verifyEmailDto), controller.verifyEmail.bind(controller));
router.post("/verify-email", validate(verifyEmailDto), controller.verifyEmail.bind(controller));
router.post("/resend-verification", validate(resendVerificationDto), controller.resendVerification.bind(controller));
router.put("/password", authMiddleware, validate(changePasswordDto), controller.changePassword.bind(controller));
router.put("/email", authMiddleware, validate(changeEmailDto), controller.changeEmail.bind(controller));
router.get("/me", authMiddleware, controller.getProfile.bind(controller));
router.put("/profile", authMiddleware, validate(updateProfileDto), controller.updateProfile.bind(controller));
router.get("/sessions", authMiddleware, controller.getSessions.bind(controller));
router.delete("/sessions/:fingerprint", authMiddleware, controller.revokeSession.bind(controller));

export default router;