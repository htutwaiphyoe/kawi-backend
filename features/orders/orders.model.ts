import {
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { usersTable } from "@/features/users/users.model";
import { booksTable } from "@/features/books/books.model";

export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "paid",
  "shipped",
  "cancelled",
]);

export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];

export const ordersTable = pgTable(
  "orders",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => usersTable.id),
    status: orderStatusEnum().notNull().default("pending"),
    total: numeric({ precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp().defaultNow().notNull(),
    updatedAt: timestamp()
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("orders_user_id_idx").on(table.userId)],
);

export const orderItemsTable = pgTable(
  "order_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => ordersTable.id, { onDelete: "cascade" }),
    bookId: uuid().references(() => booksTable.id),
    title: varchar({ length: 255 }).notNull(),
    price: numeric({ precision: 10, scale: 2 }).notNull(),
    quantity: integer().notNull(),
  },
  (table) => [index("order_items_order_id_idx").on(table.orderId)],
);

export type Order = typeof ordersTable.$inferSelect;

export type OrderItem = typeof orderItemsTable.$inferSelect;
