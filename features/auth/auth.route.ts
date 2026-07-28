import express from "express";
import { validate } from "@/middlewares/validate";
import {
  signupSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "./auth.dto";
import {
  signup,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
} from "./auth.controller";

const router = express.Router();

router.post("/signup", validate("body", signupSchema), signup);

router.post("/login", validate("body", loginSchema), login);

router.post("/refresh", refresh);

router.post("/logout", logout);

router.post(
  "/forgot-password",
  validate("body", forgotPasswordSchema),
  forgotPassword,
);

router.post(
  "/reset-password",
  validate("body", resetPasswordSchema),
  resetPassword,
);

export default router;
