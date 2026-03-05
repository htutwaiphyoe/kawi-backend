import { describe, it, expect, beforeEach } from "bun:test";
import { eq } from "drizzle-orm";
import db from "@/db";
import { booksTable } from "@/features/books/books.model";
import {
  ADDRESS,
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

describe("GET /books/:bookId/reviews/eligibility", () => {
  it("requires authentication", async () => {
    const book = await seedBook({ stock: 3 });

    const res = await api.get(`/api/v1/books/${book.id}/reviews/eligibility`);

    expect(res.status).toBe(401);
  });

  it("refuses a reader who has not bought the book", async () => {
    const { token } = await createUser();
    const book = await seedBook({ stock: 3 });

    const res = await api
      .get(`/api/v1/books/${book.id}/reviews/eligibility`)
      .set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body.eligibility).toEqual({
      hasPurchased: false,
      reviewId: null,
      canReview: false,
    });

    // and the API agrees when the review is actually attempted
    const attempt = await api
      .post(`/api/v1/books/${book.id}/reviews`)
      .set(bearer(token))
      .send({ rating: 5 });
    expect(attempt.status).toBe(403);
  });

  it("allows a reader who has bought the book, once", async () => {
    const { token } = await createUser();
    const book = await seedBook({ price: "10.00", stock: 3 });

    await api
      .post("/api/v1/orders")
      .set(bearer(token))
      .send({ address: ADDRESS, items: [{ bookId: book.id, quantity: 1 }] });

    const before = await api
      .get(`/api/v1/books/${book.id}/reviews/eligibility`)
      .set(bearer(token));
    expect(before.body.eligibility.hasPurchased).toBe(true);
    expect(before.body.eligibility.canReview).toBe(true);

    const created = await api
      .post(`/api/v1/books/${book.id}/reviews`)
      .set(bearer(token))
      .send({ rating: 4, comment: "Solid." });
    expect(created.status).toBe(201);

    const after = await api
      .get(`/api/v1/books/${book.id}/reviews/eligibility`)
      .set(bearer(token));
    expect(after.body.eligibility.canReview).toBe(false);
    expect(after.body.eligibility.reviewId).toBe(created.body.review.id);
  });

  it("stops counting a cancelled order as a purchase", async () => {
    const { token } = await createUser();
    const book = await seedBook({ stock: 3 });

    const order = await api
      .post("/api/v1/orders")
      .set(bearer(token))
      .send({ address: ADDRESS, items: [{ bookId: book.id, quantity: 1 }] });

    await api
      .patch(`/api/v1/orders/${order.body.order.id}/cancel`)
      .set(bearer(token));

    const res = await api
      .get(`/api/v1/books/${book.id}/reviews/eligibility`)
      .set(bearer(token));

    expect(res.body.eligibility.hasPurchased).toBe(false);
    expect(res.body.eligibility.canReview).toBe(false);
  });

  it("404s for a book that does not exist", async () => {
    const { token } = await createUser();

    const res = await api
      .get(`/api/v1/books/${crypto.randomUUID()}/reviews/eligibility`)
      .set(bearer(token));

    expect(res.status).toBe(404);
  });
});

describe("GET /reviews (console)", () => {
  const reviewBook = async (token: string, price = "10.00") => {
    const book = await seedBook({ price, stock: 3 });

    await api
      .post("/api/v1/orders")
      .set(bearer(token))
      .send({ address: ADDRESS, items: [{ bookId: book.id, quantity: 1 }] });

    return book;
  };

  it("is admin only", async () => {
    const anonymous = await api.get("/api/v1/reviews");
    expect(anonymous.status).toBe(401);

    const reader = await createUser();
    const asReader = await api.get("/api/v1/reviews").set(bearer(reader.token));
    expect(asReader.status).toBe(403);

    const publisher = await createUser("publisher");
    const asPublisher = await api
      .get("/api/v1/reviews")
      .set(bearer(publisher.token));
    expect(asPublisher.status).toBe(403);
  });

  it("lists every review with its book and reviewer", async () => {
    const admin = await createUser("admin");
    const reader = await createUser();

    const book = await reviewBook(reader.token);
    await api
      .post(`/api/v1/books/${book.id}/reviews`)
      .set(bearer(reader.token))
      .send({ rating: 5, comment: "Excellent." });

    const res = await api.get("/api/v1/reviews").set(bearer(admin.token));

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(1);

    const [review] = res.body.reviews;
    expect(review.rating).toBe(5);
    expect(review.comment).toBe("Excellent.");
    expect(review.book).toEqual({
      id: book.id,
      title: book.title,
      coverUrl: book.coverUrl ?? null,
    });
    expect(review.user.email).toBe(reader.email);
  });

  it("filters by rating and sorts by it", async () => {
    const admin = await createUser("admin");
    const reader = await createUser();

    const low = await reviewBook(reader.token);
    const high = await reviewBook(reader.token);

    await api
      .post(`/api/v1/books/${low.id}/reviews`)
      .set(bearer(reader.token))
      .send({ rating: 2 });
    await api
      .post(`/api/v1/books/${high.id}/reviews`)
      .set(bearer(reader.token))
      .send({ rating: 5 });

    const filtered = await api
      .get("/api/v1/reviews?rating=2")
      .set(bearer(admin.token));
    expect(filtered.body.pagination.total).toBe(1);
    expect(filtered.body.reviews[0].book.id).toBe(low.id);

    const sorted = await api
      .get("/api/v1/reviews?sortBy=rating&orderBy=asc")
      .set(bearer(admin.token));
    expect(sorted.body.reviews.map((r: { rating: number }) => r.rating)).toEqual(
      [2, 5],
    );

    const bad = await api
      .get("/api/v1/reviews?rating=9")
      .set(bearer(admin.token));
    expect(bad.status).toBe(400);
  });

  it("lets an admin delete someone else's review and rerates the book", async () => {
    const admin = await createUser("admin");
    const reader = await createUser();

    const book = await reviewBook(reader.token);
    const created = await api
      .post(`/api/v1/books/${book.id}/reviews`)
      .set(bearer(reader.token))
      .send({ rating: 4 });

    const rated = await api.get(`/api/v1/books/${book.id}`);
    expect(rated.body.book.ratingsCount).toBe(1);

    const removed = await api
      .delete(`/api/v1/reviews/${created.body.review.id}`)
      .set(bearer(admin.token));
    expect(removed.status).toBe(200);

    const after = await api.get(`/api/v1/books/${book.id}`);
    expect(after.body.book.ratingsCount).toBe(0);
    expect(after.body.book.ratingsAverage).toBe("0.00");

    const list = await api.get("/api/v1/reviews").set(bearer(admin.token));
    expect(list.body.pagination.total).toBe(0);
  });
});
