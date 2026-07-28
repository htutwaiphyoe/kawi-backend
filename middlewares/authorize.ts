import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@/features/users/users.model";
import { getCurrentUser } from "@/libs/user";
import { ApiError } from "@/libs/error";

export const authorize =
  (...roles: UserRole[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const user = getCurrentUser(req);

    if (!roles.includes(user.role)) {
      throw ApiError.forbidden(
        "You do not have permission to perform this action.",
      );
    }

    next();
  };
