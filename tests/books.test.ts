import { describe, it, expect, beforeEach } from "bun:test";
import { eq } from "drizzle-orm";
import db from "@/db";
import { booksTable } from "@/features/books/books.model";
import {
  api,
  truncateAll,
  createUser,
  seedAuthor,
  seedBook,
} from "./helpers";

beforeEach(truncateAll);

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe("GET /books", () => {
  it("is public and returns a paginated list", async () => {
    await seedBook();
    const res = await api.get("/api/v1/books");
    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(1);
    expect(res.body.books).toHaveLength(1);
  });

  it("hides soft-deleted books", async () => {
    const book = await seedBook();
    await db
      .update(booksTable)
      .set({ deletedAt: new Date() })
      .where(eq(booksTable.id, book.id));

    const list = await api.get("/api/v1/books");
    expect(list.body.pagination.total).toBe(0);

    const byId = await api.get(`/api/v1/books/${book.id}`);
    expect(byId.status).toBe(404);
  });
});

describe("POST /books", () => {
  it("requires authentication", async () => {
    const author = await seedAuthor();
    const res = await api
      .post("/api/v1/books")
      .send({ title: "X", authorId: author.id, price: 5, publishedDate: "2020-01-01" });
    expect(res.status).toBe(401);
  });

  it("forbids a plain user (403)", async () => {
    const { token } = await createUser("user");
    const author = await seedAuthor();
    const res = await api
      .post("/api/v1/books")
      .set(bearer(token))
      .send({ title: "X", authorId: author.id, price: 5, publishedDate: "2020-01-01" });
    expect(res.status).toBe(403);
  });

  it("allows a publisher (201)", async () => {
    const { token } = await createUser("publisher");
    const author = await seedAuthor();
    const res = await api
      .post("/api/v1/books")
      .set(bearer(token))
      .send({ title: "X", authorId: author.id, price: 5, publishedDate: "2020-01-01" });
    expect(res.status).toBe(201);
    expect(res.body.book.title).toBe("X");
  });
});

describe("book ownership (PATCH/DELETE)", () => {
  it("lets the owner update, forbids another publisher, allows admin", async () => {
    const owner = await createUser("publisher");
    const other = await createUser("publisher");
    const admin = await createUser("admin");

    const author = await seedAuthor();
    const book = await seedBook({ authorId: author.id, createdBy: owner.user.id });

    const byOwner = await api
      .patch(`/api/v1/books/${book.id}`)
      .set(bearer(owner.token))
      .send({ stock: 3 });
    expect(byOwner.status).toBe(200);

    const byOther = await api
      .patch(`/api/v1/books/${book.id}`)
      .set(bearer(other.token))
      .send({ stock: 4 });
    expect(byOther.status).toBe(403);

    const byAdmin = await api
      .delete(`/api/v1/books/${book.id}`)
      .set(bearer(admin.token));
    expect(byAdmin.status).toBe(200);
  });
});
