import request from "supertest";
import { sql, eq } from "drizzle-orm";
import { app } from "@/app";
import db from "@/db";
import {
  usersTable,
  type UserRole,
} from "@/features/users/users.model";
import { authorsTable } from "@/features/authors/authors.model";
import { booksTable } from "@/features/books/books.model";
import { ordersTable, orderItemsTable } from "@/features/orders/orders.model";

export const api = request(app);

let seq = 0;
const next = () => ++seq;

export const truncateAll = async () => {
  await db.execute(
    sql`TRUNCATE TABLE order_items, orders, refresh_tokens, books, authors, users RESTART IDENTITY CASCADE`,
  );
};

export const createUser = async (role: UserRole = "user") => {
  const n = next();
  const email = `user${n}@test.com`;
  const password = "password123";

  const signup = await api
    .post("/api/v1/auth/signup")
    .send({ name: `User ${n}`, email, password });

  let token = signup.body.accessToken as string;
  let user = signup.body.user;

  if (role !== "user") {
    await db.update(usersTable).set({ role }).where(eq(usersTable.id, user.id));
    const login = await api.post("/api/v1/auth/login").send({ email, password });
    token = login.body.accessToken;
    user = login.body.user;
  }

  return { token, user, email, password };
};

export const seedAuthor = async (
  overrides: Partial<typeof authorsTable.$inferInsert> = {},
) => {
  const n = next();
  const [author] = await db
    .insert(authorsTable)
    .values({ name: `Author ${n}`, email: `author${n}@test.com`, ...overrides })
    .returning();
  return author;
};

export const seedBook = async (
  overrides: Partial<typeof booksTable.$inferInsert> = {},
) => {
  let authorId = overrides.authorId;
  if (!authorId) {
    authorId = (await seedAuthor()).id;
  }

  const [book] = await db
    .insert(booksTable)
    .values({
      title: `Book ${next()}`,
      authorId,
      price: "10.00",
      publishedDate: "2020-01-01",
      stock: 10,
      ...overrides,
    })
    .returning();
  return book;
};

// Records a completed purchase so the reviewer passes the verified-purchase gate.
export const seedOrder = async (userId: string, bookId: string) => {
  const [order] = await db
    .insert(ordersTable)
    .values({ userId, total: "10.00" })
    .returning();

  await db.insert(orderItemsTable).values({
    orderId: order.id,
    bookId,
    title: "Book",
    price: "10.00",
    quantity: 1,
  });

  return order;
};
