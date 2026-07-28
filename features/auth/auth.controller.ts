import type { Request, Response } from "express";
import { COOKIES, MINUTE, DAY } from "@/constants";
import { env } from "@/libs/env";
import { ApiError } from "@/libs/error";
import {
  type SignupBody,
  type LoginBody,
  type ForgotPasswordBody,
  type ResetPasswordBody,
} from "./auth.dto";
import * as authService from "./auth.service";

const cookieBase = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "strict" as const,
};

const setAuthCookies = (
  res: Response,
  accessToken: string,
  refreshToken: string,
) => {
  res.cookie(COOKIES.access.name, accessToken, {
    ...cookieBase,
    path: COOKIES.access.path,
    maxAge: env.ACCESS_TOKEN_TTL_MINUTES * MINUTE,
  });

  res.cookie(COOKIES.refresh.name, refreshToken, {
    ...cookieBase,
    path: COOKIES.refresh.path,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * DAY,
  });
};

const clearAuthCookies = (res: Response) => {
  res.clearCookie(COOKIES.access.name, {
    ...cookieBase,
    path: COOKIES.access.path,
  });

  res.clearCookie(COOKIES.refresh.name, {
    ...cookieBase,
    path: COOKIES.refresh.path,
  });
};

const readRefreshToken = (req: Request): string | undefined =>
  req.cookies?.[COOKIES.refresh.name] ?? req.body?.refreshToken;

export const signup = async (
  req: Request<{}, unknown, SignupBody>,
  res: Response,
) => {
  const { user, accessToken, refreshToken } = await authService.signup(
    req.body,
  );

  setAuthCookies(res, accessToken, refreshToken);

  res.status(201).json({
    status: "success",
    accessToken,
    refreshToken,
    user,
  });
};

export const login = async (
  req: Request<{}, unknown, LoginBody>,
  res: Response,
) => {
  const { user, accessToken, refreshToken } = await authService.login(req.body);

  setAuthCookies(res, accessToken, refreshToken);

  res.status(200).json({
    status: "success",
    accessToken,
    refreshToken,
    user,
  });
};

export const refresh = async (req: Request, res: Response) => {
  const rawToken = readRefreshToken(req);

  if (!rawToken) {
    throw ApiError.unauthenticated("Refresh token is required.");
  }

  try {
    const { accessToken, refreshToken } =
      await authService.rotateTokens(rawToken);

    setAuthCookies(res, accessToken, refreshToken);

    res.status(200).json({ status: "success", accessToken, refreshToken });
  } catch (err) {
    clearAuthCookies(res);
    throw err;
  }
};

export const logout = async (req: Request, res: Response) => {
  const rawToken = readRefreshToken(req);

  if (rawToken) {
    await authService.revokeRefreshToken(rawToken);
  }

  clearAuthCookies(res);

  res.status(200).json({ status: "success" });
};

export const forgotPassword = async (
  req: Request<{}, unknown, ForgotPasswordBody>,
  res: Response,
) => {
  await authService.requestPasswordReset(req.body.email);

  res.status(200).json({
    status: "success",
    message: "If an account exists for that email, a reset link has been sent.",
  });
};

export const resetPassword = async (
  req: Request<{}, unknown, ResetPasswordBody>,
  res: Response,
) => {
  await authService.resetPassword(req.body.token, req.body.password);

  res.status(200).json({
    status: "success",
    message: "Password has been reset. Please log in.",
  });
};
