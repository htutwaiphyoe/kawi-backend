import {
  date,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["admin", "user", "publisher"]);

export type UserRole = (typeof userRoleEnum.enumValues)[number];

export const usersTable = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  name: varchar({ length: 255 }).notNull(),
  email: varchar({ length: 255 }).unique().notNull(),
  dob: date(),
  password: varchar({ length: 255 }).notNull(),
  profileUrl: varchar({ length: 500 }),
  role: userRoleEnum().notNull().default("user"),
  createdAt: timestamp().defaultNow().notNull(),
  updatedAt: timestamp()
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  deactivatedAt: timestamp(),
  passwordResetTokenHash: varchar({ length: 64 }),
  passwordResetExpiresAt: timestamp(),
});

export const publicUserColumns = {
  id: usersTable.id,
  name: usersTable.name,
  email: usersTable.email,
  dob: usersTable.dob,
  profileUrl: usersTable.profileUrl,
  role: usersTable.role,
  createdAt: usersTable.createdAt,
  updatedAt: usersTable.updatedAt,
};

export type AuthUser = Pick<typeof usersTable.$inferSelect, "id" | "role">;

export type PublicUser = Pick<
  typeof usersTable.$inferSelect,
  | "id"
  | "name"
  | "email"
  | "dob"
  | "profileUrl"
  | "role"
  | "createdAt"
  | "updatedAt"
>;
