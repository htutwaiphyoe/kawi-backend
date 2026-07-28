import { and, asc, count, desc, eq, isNull } from "drizzle-orm";
import db from "@/db";
import { authorsTable, type Author } from "./authors.model";
import type {
  CreateAuthorBody,
  UpdateAuthorBody,
  AuthorsQuery,
} from "./authors.dto";
import { type AuthUser } from "@/features/users/users.model";
import { assertOwnership } from "@/libs/role";
import { ApiError } from "@/libs/error";

const authorSortColumns = {
  name: authorsTable.name,
  email: authorsTable.email,
  birthDate: authorsTable.birthDate,
  createdAt: authorsTable.createdAt,
};

export const getAuthors = async (query: AuthorsQuery) => {
  const offset = (query.page - 1) * query.limit;
  const where = isNull(authorsTable.deletedAt);
  const orderBy = (query.orderBy === "asc" ? asc : desc)(
    authorSortColumns[query.sortBy],
  );

  const [authors, [{ total }]] = await Promise.all([
    db
      .select()
      .from(authorsTable)
      .where(where)
      .orderBy(orderBy)
      .limit(query.limit)
      .offset(offset),
    db.select({ total: count() }).from(authorsTable).where(where),
  ]);

  return { authors, total };
};

export const getAuthor = async (id: string): Promise<Author> => {
  const [author] = await db
    .select()
    .from(authorsTable)
    .where(and(eq(authorsTable.id, id), isNull(authorsTable.deletedAt)))
    .limit(1);

  if (!author) {
    throw ApiError.notFound("Author is not found.");
  }
  return author;
};

const findAuthorOwner = async (id: string) => {
  const [row] = await db
    .select({ createdBy: authorsTable.createdBy })
    .from(authorsTable)
    .where(and(eq(authorsTable.id, id), isNull(authorsTable.deletedAt)))
    .limit(1);
  if (!row) {
    throw ApiError.notFound("Author is not found.");
  }
  return row;
};

export const createAuthor = async (params: {
  userId: string;
  body: CreateAuthorBody;
}): Promise<Author> => {
  const [author] = await db
    .insert(authorsTable)
    .values({ ...params.body, createdBy: params.userId })
    .returning();
  return author;
};

export const updateAuthor = async (params: {
  id: string;
  user: AuthUser;
  body: UpdateAuthorBody;
}): Promise<Author> => {
  const existing = await findAuthorOwner(params.id);
  assertOwnership(params.user, existing.createdBy);

  const [author] = await db
    .update(authorsTable)
    .set(params.body)
    .where(eq(authorsTable.id, params.id))
    .returning();
  return author;
};

export const deleteAuthor = async (params: {
  id: string;
  user: AuthUser;
}): Promise<void> => {
  const existing = await findAuthorOwner(params.id);
  assertOwnership(params.user, existing.createdBy);

  await db
    .update(authorsTable)
    .set({ deletedAt: new Date() })
    .where(eq(authorsTable.id, params.id));
};
