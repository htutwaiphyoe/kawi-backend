import { randomBytes, createHash } from "crypto";
import { env } from "@/libs/env";

export const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

export const generateToken = (): { token: string; tokenHash: string } => {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: hashToken(token) };
};

export const refreshTokenExpiry = (): Date =>
  new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

export const resetTokenExpiry = (): Date =>
  new Date(Date.now() + env.RESET_TOKEN_TTL_MINUTES * 60 * 1000);
