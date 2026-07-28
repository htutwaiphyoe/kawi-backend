import { describe, it, expect, beforeEach } from "bun:test";
import { eq } from "drizzle-orm";
import db from "@/db";
import { booksTable } from "@/features/books/books.model";
import {
  api,
  truncateAll,
  createUser,
  seedBook,
  seedOrder,
} from "./helpers";

beforeEach(truncateAll);

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

const ratingOf = async (bookId: string) => {
  const [book] = await db
    .select({
      average: booksTable.ratingsAverage,
      count: booksTable.ratingsCount,
    })
    .from(booksTable)
    .where(eq(booksTable.id, bookId))
    .limit(1);
  return book;
};

describe("POST /books/:bookId/reviews", () => {
  it("requires authentication", async () => {
    const book = await seedBook();

    const res = await api
      .post(`/api/v1/books/${book.id}/reviews`)
      .send({ rating: 5 });

    expect(res.status).toBe(401);
  });

  it("forbids reviewing a book you have not purchased", async () => {
    const user = await createUser();
    const book = await seedBook();

    const res = await api
      .post(`/api/v1/books/${book.id}/reviews`)
      .set(bearer(user.token))
      .send({ rating: 5 });

    expect(res.status).toBe(403);
  });

  it("creates a review after purchase and recomputes the book rating", async () => {
    const user = await createUser();
    const book = await seedBook();
    await seedOrder(user.user.id, book.id);

    const res = await api
      .post(`/api/v1/books/${book.id}/reviews`)
      .set(bearer(user.token))
      .send({ rating: 4, comment: "good" });

    expect(res.status).toBe(201);
    expect(res.body.review.rating).toBe(4);

    const rating = await ratingOf(book.id);
    expect(rating.average).toBe("4.00");
    expect(rating.count).toBe(1);
  });

  it("rejects a duplicate review from the same user", async () => {
    const user = await createUser();
    const book = await seedBook();
    await seedOrder(user.user.id, book.id);

    await api
      .post(`/api/v1/books/${book.id}/reviews`)
      .set(bearer(user.token))
      .send({ rating: 4 });

    const dup = await api
      .post(`/api/v1/books/${book.id}/reviews`)
      .set(bearer(user.token))
      .send({ rating: 2 });

    expect(dup.status).toBe(409);
  });

  it("averages ratings across reviewers", async () => {
    const book = await seedBook();
    const a = await createUser();
    const b = await createUser();
    await seedOrder(a.user.id, book.id);
    await seedOrder(b.user.id, book.id);

    await api
      .post(`/api/v1/books/${book.id}/reviews`)
      .set(bearer(a.token))
      .send({ rating: 5 });
    await api
      .post(`/api/v1/books/${book.id}/reviews`)
      .set(bearer(b.token))
      .send({ rating: 3 });

    const rating = await ratingOf(book.id);
    expect(rating.average).toBe("4.00");
    expect(rating.count).toBe(2);
  });

  it("returns 404 for a non-existent book", async () => {
    const user = await createUser();

    const res = await api
      .post("/api/v1/books/00000000-0000-0000-0000-000000000000/reviews")
      .set(bearer(user.token))
      .send({ rating: 5 });

    expect(res.status).toBe(404);
  });
});

describe("GET /books/:bookId/reviews", () => {
  it("is public and includes the reviewer name", async () => {
    const user = await createUser();
    const book = await seedBook();
    await seedOrder(user.user.id, book.id);
    await api
      .post(`/api/v1/books/${book.id}/reviews`)
      .set(bearer(user.token))
      .send({ rating: 4 });

    const res = await api.get(`/api/v1/books/${book.id}/reviews`);

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(1);
    expect(res.body.reviews[0].user.name).toBe(user.user.name);
  });
});

describe("PATCH/DELETE /reviews/:id", () => {
  const review = async (bookId: string, token: string, rating: number) => {
    const res = await api
      .post(`/api/v1/books/${bookId}/reviews`)
      .set(bearer(token))
      .send({ rating });
    return res.body.review.id as string;
  };

  it("lets the owner update and recomputes the rating; others are forbidden", async () => {
    const owner = await createUser();
    const other = await createUser();
    const book = await seedBook();
    await seedOrder(owner.user.id, book.id);
    const reviewId = await review(book.id, owner.token, 5);

    const byOther = await api
      .patch(`/api/v1/reviews/${reviewId}`)
      .set(bearer(other.token))
      .send({ rating: 1 });
    expect(byOther.status).toBe(403);

    const byOwner = await api
      .patch(`/api/v1/reviews/${reviewId}`)
      .set(bearer(owner.token))
      .send({ rating: 2 });
    expect(byOwner.status).toBe(200);

    const rating = await ratingOf(book.id);
    expect(rating.average).toBe("2.00");
  });

  it("lets an admin delete any review and recomputes to zero", async () => {
    const owner = await createUser();
    const admin = await createUser("admin");
    const book = await seedBook();
    await seedOrder(owner.user.id, book.id);
    const reviewId = await review(book.id, owner.token, 5);

    const res = await api
      .delete(`/api/v1/reviews/${reviewId}`)
      .set(bearer(admin.token));
    expect(res.status).toBe(200);

    const rating = await ratingOf(book.id);
    expect(rating.average).toBe("0.00");
    expect(rating.count).toBe(0);
  });
});
