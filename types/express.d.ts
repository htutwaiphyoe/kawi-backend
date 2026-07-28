import type { AuthUser } from "@/features/users/users.model";

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
