import { and, asc, count, desc, eq, ilike, isNull } from "drizzle-orm";
import db from "@/db";
import { booksTable, bookSortColumns, type Book } from "./books.model";
import type { CreateBookBody, UpdateBookBody, BooksQuery } from "./books.dto";
import { authorsTable } from "@/features/authors/authors.model";
import { type AuthUser } from "@/features/users/users.model";
import { assertOwnership } from "@/libs/role";
import { ApiError } from "@/libs/error";

export const getBooks = async (query: BooksQuery) => {
  const offset = (query.page - 1) * query.limit;
  const where = and(
    isNull(booksTable.deletedAt),
    query.search ? ilike(booksTable.title, `%${query.search}%`) : undefined,
  );
  const orderBy = (query.orderBy === "asc" ? asc : desc)(
    bookSortColumns[query.sortBy],
  );

  const [books, [{ total }]] = await Promise.all([
    db
      .select()
      .from(booksTable)
      .where(where)
      .orderBy(orderBy)
      .limit(query.limit)
      .offset(offset),
    db.select({ total: count() }).from(booksTable).where(where),
  ]);

  return { books, total };
};

export const getBooksByAuthor = async (authorId: string, query: BooksQuery) => {
  const [author] = await db
    .select({ id: authorsTable.id })
    .from(authorsTable)
    .where(and(eq(authorsTable.id, authorId), isNull(authorsTable.deletedAt)))
    .limit(1);

  if (!author) {
    throw ApiError.notFound("Author is not found.");
  }

  const offset = (query.page - 1) * query.limit;
  const where = and(
    eq(booksTable.authorId, authorId),
    isNull(booksTable.deletedAt),
    query.search ? ilike(booksTable.title, `%${query.search}%`) : undefined,
  );
  const orderBy = (query.orderBy === "asc" ? asc : desc)(
    bookSortColumns[query.sortBy],
  );

  const [books, [{ total }]] = await Promise.all([
    db
      .select()
      .from(booksTable)
      .where(where)
      .orderBy(orderBy)
      .limit(query.limit)
      .offset(offset),
    db.select({ total: count() }).from(booksTable).where(where),
  ]);

  return { books, total };
};

export const getBook = async (id: string) => {
  const [data] = await db
    .select()
    .from(booksTable)
    .leftJoin(authorsTable, eq(booksTable.authorId, authorsTable.id))
    .where(and(eq(booksTable.id, id), isNull(booksTable.deletedAt)))
    .limit(1);

  if (!data) {
    throw ApiError.notFound("Book is not found.");
  }

  return { ...data.books, author: data.authors };
};

const findBookOwner = async (id: string) => {
  const [row] = await db
    .select({ createdBy: booksTable.createdBy })
    .from(booksTable)
    .where(and(eq(booksTable.id, id), isNull(booksTable.deletedAt)))
    .limit(1);
  if (!row) {
    throw ApiError.notFound("Book is not found.");
  }
  return row;
};

export const createBook = async (params: {
  userId: string;
  body: CreateBookBody;
}): Promise<Book> => {
  const [book] = await db
    .insert(booksTable)
    .values({ ...params.body, createdBy: params.userId })
    .returning();
  return book;
};

export const updateBook = async (params: {
  id: string;
  user: AuthUser;
  body: UpdateBookBody;
}): Promise<Book> => {
  const existing = await findBookOwner(params.id);
  assertOwnership(params.user, existing.createdBy);

  const [book] = await db
    .update(booksTable)
    .set(params.body)
    .where(eq(booksTable.id, params.id))
    .returning();
  return book;
};

export const deleteBook = async (params: {
  id: string;
  user: AuthUser;
}): Promise<void> => {
  const existing = await findBookOwner(params.id);
  assertOwnership(params.user, existing.createdBy);

  await db
    .update(booksTable)
    .set({ deletedAt: new Date() })
    .where(eq(booksTable.id, params.id));
};
