import { and, eq, isNotNull, isNull } from "drizzle-orm";
import db from "@/db";
import {
  usersTable,
  publicUserColumns,
  type UserRole,
  type AuthUser,
} from "./users.model";
import type { UpdateUserBody } from "./users.dto";
import { revokeUserRefreshTokens } from "@/features/auth/auth.service";
import { ApiError } from "@/libs/error";

export const getMe = async (userId: string) => {
  const [user] = await db
    .select(publicUserColumns)
    .from(usersTable)
    .where(and(eq(usersTable.id, userId), isNull(usersTable.deactivatedAt)))
    .limit(1);

  if (!user) {
    throw ApiError.unauthenticated("User is no longer active.");
  }
  return user;
};

export const getUserById = async (id: string) => {
  const [user] = await db
    .select(publicUserColumns)
    .from(usersTable)
    .where(and(eq(usersTable.id, id), isNull(usersTable.deactivatedAt)))
    .limit(1);

  if (!user) {
    throw ApiError.notFound("User is not found.");
  }
  return user;
};

export const updateUser = async (params: {
  id: string;
  currentUser: AuthUser;
  body: UpdateUserBody;
}) => {
  const { id, currentUser, body } = params;

  if (currentUser.id !== id && currentUser.role !== "admin") {
    throw ApiError.forbidden("You can only update your own profile.");
  }

  const [user] = await db
    .update(usersTable)
    .set(body)
    .where(and(eq(usersTable.id, id), isNull(usersTable.deactivatedAt)))
    .returning(publicUserColumns);

  if (!user) {
    throw ApiError.notFound("User is not found.");
  }
  return user;
};

export const deactivateUser = async (params: {
  id: string;
  currentUser: AuthUser;
}) => {
  const { id, currentUser } = params;

  if (currentUser.id !== id && currentUser.role !== "admin") {
    throw ApiError.forbidden("You can only deactivate your own account.");
  }

  const [target] = await db
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(and(eq(usersTable.id, id), isNull(usersTable.deactivatedAt)))
    .limit(1);

  if (!target) {
    throw ApiError.notFound("Active user is not found.");
  }

  if (target.role === "admin") {
    throw ApiError.forbidden("This account cannot be deactivated.");
  }

  const [user] = await db
    .update(usersTable)
    .set({ deactivatedAt: new Date() })
    .where(and(eq(usersTable.id, id), isNull(usersTable.deactivatedAt)))
    .returning(publicUserColumns);

  await revokeUserRefreshTokens(id);

  return user;
};

export const reactivateUser = async (id: string) => {
  const [user] = await db
    .update(usersTable)
    .set({ deactivatedAt: null })
    .where(and(eq(usersTable.id, id), isNotNull(usersTable.deactivatedAt)))
    .returning(publicUserColumns);

  if (!user) {
    throw ApiError.notFound("Deactivated user is not found.");
  }
  return user;
};

export const updateUserRole = async (params: {
  id: string;
  currentUser: AuthUser;
  role: UserRole;
}) => {
  const { id, currentUser, role } = params;

  if (currentUser.id === id) {
    throw ApiError.forbidden("You cannot change your own role.");
  }

  const [user] = await db
    .update(usersTable)
    .set({ role })
    .where(and(eq(usersTable.id, id), isNull(usersTable.deactivatedAt)))
    .returning(publicUserColumns);

  if (!user) {
    throw ApiError.notFound("Active user is not found.");
  }
  return user;
};
