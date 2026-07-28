import { date, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "@/features/users/users.model";

export const authorsTable = pgTable("authors", {
  id: uuid().primaryKey().defaultRandom(),
  name: varchar({ length: 255 }).notNull(),
  email: varchar({ length: 255 }).unique().notNull(),
  phone: varchar({ length: 20 }),
  bio: varchar({ length: 1000 }),
  nationality: varchar({ length: 100 }),
  birthDate: date(),
  createdBy: uuid().references(() => usersTable.id),
  createdAt: timestamp().defaultNow().notNull(),
  updatedAt: timestamp()
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp(),
});

export type Author = typeof authorsTable.$inferSelect;
