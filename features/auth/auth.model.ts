import { pgTable, timestamp, uuid, varchar, index } from "drizzle-orm/pg-core";
import { usersTable } from "@/features/users/users.model";

export const refreshTokensTable = pgTable(
  "refresh_tokens",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    tokenHash: varchar({ length: 64 }).notNull().unique(),
    expiresAt: timestamp().notNull(),
    revokedAt: timestamp(),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (table) => [index("refresh_tokens_user_id_idx").on(table.userId)],
);
