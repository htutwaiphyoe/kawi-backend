import {
  date,
  index,
  integer,
  numeric,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { authorsTable } from "@/features/authors/authors.model";
import { usersTable } from "@/features/users/users.model";

export const booksTable = pgTable(
  "books",
  {
    id: uuid().primaryKey().defaultRandom(),
    title: varchar({ length: 255 }).notNull(),
    authorId: uuid()
      .notNull()
      .references(() => authorsTable.id, { onDelete: "cascade" }),
    isbn: varchar({ length: 20 }).unique(),
    description: varchar({ length: 1000 }),
    price: numeric({ precision: 10, scale: 2 }).notNull(),
    publishedDate: date().notNull(),
    stock: integer().notNull().default(0),
    ratingsAverage: numeric({ precision: 3, scale: 2 }).notNull().default("0"),
    ratingsCount: integer().notNull().default(0),
    createdBy: uuid().references(() => usersTable.id),
    createdAt: timestamp().defaultNow().notNull(),
    updatedAt: timestamp()
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp(),
  },
  (table) => [
    index("books_title_trgm_idx").using(
      "gin",
      sql`${table.title} gin_trgm_ops`,
    ),
  ],
);

export const bookSortColumns = {
  title: booksTable.title,
  price: booksTable.price,
  publishedDate: booksTable.publishedDate,
  stock: booksTable.stock,
  createdAt: booksTable.createdAt,
};

export type Book = typeof booksTable.$inferSelect;
