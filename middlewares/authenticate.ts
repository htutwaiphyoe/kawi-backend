import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "@/libs/jwt";
import { COOKIES, BEARER_PREFIX } from "@/constants";
import { ApiError } from "@/libs/error";

const extractToken = (req: Request): string | undefined => {
  const header = req.headers.authorization;
  if (header?.startsWith(BEARER_PREFIX)) {
    return header.slice(BEARER_PREFIX.length);
  }
  return req.cookies?.[COOKIES.access.name];
};

export const authenticate = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const token = extractToken(req);

  if (!token) {
    throw ApiError.unauthenticated("Authentication required.");
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw ApiError.unauthenticated("Invalid or expired token.");
  }

  req.user = { id: payload.sub, role: payload.role };
  next();
};
