import { and, asc, count, desc, eq, isNull, ne, sql } from "drizzle-orm";
import db, { type Transaction } from "@/db";
import { reviewsTable, type Review } from "./reviews.model";
import { booksTable } from "@/features/books/books.model";
import { usersTable, type AuthUser } from "@/features/users/users.model";
import { ordersTable, orderItemsTable } from "@/features/orders/orders.model";
import type {
  AllReviewsQuery,
  CreateReviewBody,
  UpdateReviewBody,
  ReviewsQuery,
} from "./reviews.dto";
import { assertOwnership } from "@/libs/role";
import { ApiError } from "@/libs/error";

const recomputeBookRating = async (
  transaction: Transaction,
  bookId: string,
) => {
  const [agg] = await transaction
    .select({
      average: sql<string>`coalesce(avg(${reviewsTable.rating}), 0)`,
      total: count(),
    })
    .from(reviewsTable)
    .where(eq(reviewsTable.bookId, bookId));

  await transaction
    .update(booksTable)
    .set({
      ratingsAverage: Number(agg.average).toFixed(2),
      ratingsCount: agg.total,
    })
    .where(eq(booksTable.id, bookId));
};

const findActiveBook = async (bookId: string) => {
  const [book] = await db
    .select({ id: booksTable.id })
    .from(booksTable)
    .where(and(eq(booksTable.id, bookId), isNull(booksTable.deletedAt)))
    .limit(1);
  return book;
};

const hasPurchased = async (userId: string, bookId: string) => {
  const [row] = await db
    .select({ id: orderItemsTable.id })
    .from(orderItemsTable)
    .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
    .where(
      and(
        eq(orderItemsTable.bookId, bookId),
        eq(ordersTable.userId, userId),
        ne(ordersTable.status, "cancelled"),
      ),
    )
    .limit(1);
  return Boolean(row);
};

export const createReview = async (params: {
  userId: string;
  bookId: string;
  body: CreateReviewBody;
}): Promise<Review> => {
  const { userId, bookId, body } = params;

  if (!(await findActiveBook(bookId))) {
    throw ApiError.notFound("Book is not found.");
  }

  if (!(await hasPurchased(userId, bookId))) {
    throw ApiError.forbidden("You can only review books you have purchased.");
  }

  return db.transaction(async (transaction) => {
    const [review] = await transaction
      .insert(reviewsTable)
      .values({ bookId, userId, rating: body.rating, comment: body.comment })
      .returning();

    await recomputeBookRating(transaction, bookId);

    return review;
  });
};

export const getBookReviews = async (bookId: string, query: ReviewsQuery) => {
  if (!(await findActiveBook(bookId))) {
    throw ApiError.notFound("Book is not found.");
  }

  const offset = (query.page - 1) * query.limit;
  const sortColumn =
    query.sortBy === "rating" ? reviewsTable.rating : reviewsTable.createdAt;
  const orderBy = (query.orderBy === "asc" ? asc : desc)(sortColumn);

  const [reviews, [{ total }]] = await Promise.all([
    db
      .select({
        id: reviewsTable.id,
        rating: reviewsTable.rating,
        comment: reviewsTable.comment,
        createdAt: reviewsTable.createdAt,
        user: { id: usersTable.id, name: usersTable.name },
      })
      .from(reviewsTable)
      .leftJoin(usersTable, eq(reviewsTable.userId, usersTable.id))
      .where(eq(reviewsTable.bookId, bookId))
      .orderBy(orderBy)
      .limit(query.limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(reviewsTable)
      .where(eq(reviewsTable.bookId, bookId)),
  ]);

  return { reviews, total };
};

const findReviewOrThrow = async (id: string): Promise<Review> => {
  const [review] = await db
    .select()
    .from(reviewsTable)
    .where(eq(reviewsTable.id, id))
    .limit(1);
  if (!review) {
    throw ApiError.notFound("Review is not found.");
  }
  return review;
};

export const updateReview = async (params: {
  id: string;
  user: AuthUser;
  body: UpdateReviewBody;
}): Promise<Review> => {
  const existing = await findReviewOrThrow(params.id);
  assertOwnership(params.user, existing.userId);

  return db.transaction(async (transaction) => {
    const [review] = await transaction
      .update(reviewsTable)
      .set(params.body)
      .where(eq(reviewsTable.id, params.id))
      .returning();

    await recomputeBookRating(transaction, existing.bookId);

    return review;
  });
};

export const deleteReview = async (params: {
  id: string;
  user: AuthUser;
}): Promise<void> => {
  const existing = await findReviewOrThrow(params.id);
  assertOwnership(params.user, existing.userId);

  await db.transaction(async (transaction) => {
    await transaction
      .delete(reviewsTable)
      .where(eq(reviewsTable.id, params.id));

    await recomputeBookRating(transaction, existing.bookId);
  });
};

export const getReviewEligibility = async (userId: string, bookId: string) => {
  if (!(await findActiveBook(bookId))) {
    throw ApiError.notFound("Book is not found.");
  }

  const [[purchased], [mine]] = await Promise.all([
    db
      .select({ id: orderItemsTable.id })
      .from(orderItemsTable)
      .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
      .where(
        and(
          eq(orderItemsTable.bookId, bookId),
          eq(ordersTable.userId, userId),
          ne(ordersTable.status, "cancelled"),
        ),
      )
      .limit(1),
    db
      .select({ id: reviewsTable.id })
      .from(reviewsTable)
      .where(and(eq(reviewsTable.bookId, bookId), eq(reviewsTable.userId, userId)))
      .limit(1),
  ]);

  return {
    hasPurchased: Boolean(purchased),
    reviewId: mine?.id ?? null,
    canReview: Boolean(purchased) && !mine,
  };
};

export const getAllReviews = async (query: AllReviewsQuery) => {
  const offset = (query.page - 1) * query.limit;

  const where = query.rating ? eq(reviewsTable.rating, query.rating) : undefined;

  const sortColumn =
    query.sortBy === "rating" ? reviewsTable.rating : reviewsTable.createdAt;
  const orderBy = (query.orderBy === "asc" ? asc : desc)(sortColumn);

  const [reviews, [{ total }]] = await Promise.all([
    db
      .select({
        id: reviewsTable.id,
        rating: reviewsTable.rating,
        comment: reviewsTable.comment,
        createdAt: reviewsTable.createdAt,
        book: {
          id: booksTable.id,
          title: booksTable.title,
          coverUrl: booksTable.coverUrl,
        },
        user: {
          id: usersTable.id,
          name: usersTable.name,
          email: usersTable.email,
        },
      })
      .from(reviewsTable)
      .innerJoin(booksTable, eq(booksTable.id, reviewsTable.bookId))
      .innerJoin(usersTable, eq(usersTable.id, reviewsTable.userId))
      .where(where)
      .orderBy(orderBy)
      .limit(query.limit)
      .offset(offset),
    db.select({ total: count() }).from(reviewsTable).where(where),
  ]);

  return { reviews, total };
};
