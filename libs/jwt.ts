import jwt from "jsonwebtoken";
import { env } from "@/libs/env";
import type { UserRole } from "@/features/users/users.model";

export type JwtPayload = { sub: string; role: UserRole };

export const signAccessToken = (payload: JwtPayload): string =>
  jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL_MINUTES * 60,
  });

export const verifyAccessToken = (token: string): JwtPayload =>
  jwt.verify(token, env.JWT_SECRET) as JwtPayload;
