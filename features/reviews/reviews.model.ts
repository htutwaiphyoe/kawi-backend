import {
  check,
  integer,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "@/features/users/users.model";
import { booksTable } from "@/features/books/books.model";

export const reviewsTable = pgTable(
  "reviews",
  {
    id: uuid().primaryKey().defaultRandom(),
    bookId: uuid()
      .notNull()
      .references(() => booksTable.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    rating: integer().notNull(),
    comment: varchar({ length: 1000 }),
    createdAt: timestamp().defaultNow().notNull(),
    updatedAt: timestamp()
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("reviews_book_user_key").on(table.bookId, table.userId),
    check("reviews_rating_range", sql`${table.rating} between 1 and 5`),
  ],
);

export type Review = typeof reviewsTable.$inferSelect;

export type NewReview = typeof reviewsTable.$inferInsert;
