import {
  check,
  index,
  integer,
  pgTable,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "@/features/users/users.model";
import { booksTable } from "@/features/books/books.model";
import { MAX_CART_QUANTITY } from "@/constants";

export const cartItemsTable = pgTable(
  "cart_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    bookId: uuid()
      .notNull()
      .references(() => booksTable.id, { onDelete: "cascade" }),
    quantity: integer().notNull(),
    createdAt: timestamp().defaultNow().notNull(),
    updatedAt: timestamp()
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("cart_items_user_book_key").on(table.userId, table.bookId),
    index("cart_items_user_id_idx").on(table.userId),
    check(
      "cart_items_quantity_range",
      sql`${table.quantity} between 1 and ${sql.raw(String(MAX_CART_QUANTITY))}`,
    ),
  ],
);

export type CartItem = typeof cartItemsTable.$inferSelect;
