import { and, eq, isNull } from "drizzle-orm";
import db from "@/db";
import {
  usersTable,
  publicUserColumns,
  type UserRole,
} from "@/features/users/users.model";
import { refreshTokensTable } from "./auth.model";
import type { SignupBody, LoginBody } from "./auth.dto";
import { signAccessToken } from "@/libs/jwt";
import {
  generateToken,
  hashToken,
  refreshTokenExpiry,
  resetTokenExpiry,
} from "@/libs/token";
import { hashPassword, verifyPassword } from "@/libs/password";
import {
  emailQueue,
  PASSWORD_RESET_JOB,
  type PasswordResetJob,
} from "@/libs/queue";
import { env } from "@/libs/env";
import { ApiError } from "@/libs/error";

const issueTokens = async (userId: string, role: UserRole) => {
  const accessToken = signAccessToken({ sub: userId, role });

  const { token: refreshToken, tokenHash } = generateToken();

  await db.insert(refreshTokensTable).values({
    userId,
    tokenHash,
    expiresAt: refreshTokenExpiry(),
  });

  return { accessToken, refreshToken };
};

export const revokeUserRefreshTokens = async (userId: string) => {
  await db
    .update(refreshTokensTable)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(refreshTokensTable.userId, userId),
        isNull(refreshTokensTable.revokedAt),
      ),
    );
};

export const signup = async (body: SignupBody) => {
  const { password, ...rest } = body;

  const passwordHash = await hashPassword(password);

  const [user] = await db
    .insert(usersTable)
    .values({ ...rest, password: passwordHash })
    .returning(publicUserColumns);

  const tokens = await issueTokens(user.id, user.role);

  return { user, ...tokens };
};

export const login = async (body: LoginBody) => {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(
      and(eq(usersTable.email, body.email), isNull(usersTable.deactivatedAt)),
    )
    .limit(1);

  if (!user || !(await verifyPassword(body.password, user.password))) {
    throw ApiError.unauthenticated("Invalid email or password.");
  }

  const tokens = await issueTokens(user.id, user.role);

  const { password: _password, ...safeUser } = user;

  return { user: safeUser, ...tokens };
};

export const rotateTokens = async (rawToken: string) => {
  const [stored] = await db
    .select()
    .from(refreshTokensTable)
    .where(eq(refreshTokensTable.tokenHash, hashToken(rawToken)))
    .limit(1);

  if (!stored) {
    throw ApiError.unauthenticated("Invalid refresh token.");
  }

  if (stored.revokedAt) {
    await revokeUserRefreshTokens(stored.userId);
    throw ApiError.unauthenticated("Refresh token has been revoked.");
  }

  if (stored.expiresAt <= new Date()) {
    throw ApiError.unauthenticated("Refresh token has expired.");
  }

  const [user] = await db
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(
      and(eq(usersTable.id, stored.userId), isNull(usersTable.deactivatedAt)),
    )
    .limit(1);

  if (!user) {
    throw ApiError.unauthenticated("User is no longer active.");
  }

  await db
    .update(refreshTokensTable)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokensTable.id, stored.id));

  return issueTokens(stored.userId, user.role);
};

export const revokeRefreshToken = async (rawToken: string) => {
  await db
    .update(refreshTokensTable)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(refreshTokensTable.tokenHash, hashToken(rawToken)),
        isNull(refreshTokensTable.revokedAt),
      ),
    );
};

export const requestPasswordReset = async (email: string) => {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.email, email), isNull(usersTable.deactivatedAt)))
    .limit(1);

  if (!user) {
    return;
  }

  const { token, tokenHash } = generateToken();

  await db
    .update(usersTable)
    .set({
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: resetTokenExpiry(),
    })
    .where(eq(usersTable.id, user.id));

  const resetUrl = `${env.CLIENT_URL}/reset-password?token=${token}`;

  await emailQueue.add(PASSWORD_RESET_JOB, {
    to: user.email,
    resetUrl,
  } satisfies PasswordResetJob);
};

export const resetPassword = async (token: string, password: string) => {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.passwordResetTokenHash, hashToken(token)))
    .limit(1);

  if (
    !user ||
    !user.passwordResetExpiresAt ||
    user.passwordResetExpiresAt <= new Date()
  ) {
    throw ApiError.badRequest("Invalid or expired reset token.");
  }

  const passwordHash = await hashPassword(password);

  await db
    .update(usersTable)
    .set({
      password: passwordHash,
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
    })
    .where(eq(usersTable.id, user.id));

  await revokeUserRefreshTokens(user.id);
};
