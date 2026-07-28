import { or, lt, isNotNull } from "drizzle-orm";
import db from "@/db";
import { refreshTokensTable } from "@/features/auth/auth.model";
import { usersTable } from "@/features/users/users.model";
import { logger } from "@/libs/logger";

export const cleanupExpiredTokens = async (): Promise<void> => {
  const now = new Date();

  const deletedRefreshTokens = await db
    .delete(refreshTokensTable)
    .where(
      or(
        isNotNull(refreshTokensTable.revokedAt),
        lt(refreshTokensTable.expiresAt, now),
      ),
    )
    .returning({ id: refreshTokensTable.id });

  const clearedResetTokens = await db
    .update(usersTable)
    .set({ passwordResetTokenHash: null, passwordResetExpiresAt: null })
    .where(lt(usersTable.passwordResetExpiresAt, now))
    .returning({ id: usersTable.id });

  logger.info(
    {
      refreshTokensDeleted: deletedRefreshTokens.length,
      resetTokensCleared: clearedResetTokens.length,
    },
    "Token cleanup completed",
  );
};
