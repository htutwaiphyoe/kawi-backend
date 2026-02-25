import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import db from "@/db";
import { cartItemsTable } from "./cart.model";
import type {
  AddCartItemBody,
  CheckoutBody,
  UpdateCartItemBody,
} from "./cart.dto";
import { booksTable } from "@/features/books/books.model";
import {
  createOrderTransaction,
  enqueueOrderConfirmationEmail,
} from "@/features/orders/orders.service";
import { ApiError } from "@/libs/error";
import { MAX_CART_QUANTITY } from "@/constants";
import { fromCents, toCents } from "@/utils/money";

export const getCart = async (userId: string) => {
  const rows = await db
    .select({
      id: cartItemsTable.id,
      bookId: cartItemsTable.bookId,
      quantity: cartItemsTable.quantity,
      title: booksTable.title,
      coverUrl: booksTable.coverUrl,
      price: booksTable.price,
      stock: booksTable.stock,
      deletedAt: booksTable.deletedAt,
    })
    .from(cartItemsTable)
    .innerJoin(booksTable, eq(booksTable.id, cartItemsTable.bookId))
    .where(eq(cartItemsTable.userId, userId))
    .orderBy(asc(cartItemsTable.createdAt));

  const items = rows.map((row) => {
    const available = row.deletedAt === null && row.stock >= row.quantity;

    return {
      id: row.id,
      bookId: row.bookId,
      title: row.title,
      coverUrl: row.coverUrl,
      price: row.price,
      quantity: row.quantity,
      stock: row.stock,
      amount: fromCents(toCents(row.price) * row.quantity),
      available,
    };
  });

  const subtotal = items.reduce(
    (sum, item) => sum + toCents(item.price) * item.quantity,
    0,
  );

  return {
    items,
    subtotal: fromCents(subtotal),
    itemCount: items.reduce((count, item) => count + item.quantity, 0),
    hasUnavailableItems: items.some((item) => !item.available),
  };
};

export const addCartItem = async (params: {
  userId: string;
  body: AddCartItemBody;
}) => {
  const { userId, body } = params;

  const [book] = await db
    .select({ id: booksTable.id })
    .from(booksTable)
    .where(and(eq(booksTable.id, body.bookId), isNull(booksTable.deletedAt)))
    .limit(1);

  if (!book) {
    throw ApiError.badRequest("Book is unavailable.");
  }

  await db
    .insert(cartItemsTable)
    .values({ userId, bookId: body.bookId, quantity: body.quantity })
    .onConflictDoUpdate({
      target: [cartItemsTable.userId, cartItemsTable.bookId],
      set: {
        quantity: sql`least(
          ${cartItemsTable.quantity} + ${body.quantity},
          ${MAX_CART_QUANTITY}
        )`,
        updatedAt: new Date(),
      },
    });

  return getCart(userId);
};

export const updateCartItem = async (params: {
  userId: string;
  itemId: string;
  body: UpdateCartItemBody;
}) => {
  const { userId, itemId, body } = params;

  const [updated] = await db
    .update(cartItemsTable)
    .set({ quantity: body.quantity })
    .where(
      and(eq(cartItemsTable.userId, userId), eq(cartItemsTable.id, itemId)),
    )
    .returning({ id: cartItemsTable.id });

  if (!updated) {
    throw ApiError.notFound("Cart item is not found.");
  }

  return getCart(userId);
};

export const removeCartItem = async (params: {
  userId: string;
  itemId: string;
}) => {
  const { userId, itemId } = params;

  const [removed] = await db
    .delete(cartItemsTable)
    .where(
      and(eq(cartItemsTable.userId, userId), eq(cartItemsTable.id, itemId)),
    )
    .returning({ id: cartItemsTable.id });

  if (!removed) {
    throw ApiError.notFound("Cart item is not found.");
  }

  return getCart(userId);
};

export const clearCart = async (userId: string) => {
  await db.delete(cartItemsTable).where(eq(cartItemsTable.userId, userId));

  return getCart(userId);
};

export const checkout = async (params: {
  userId: string;
  body: CheckoutBody;
}) => {
  const { userId, body } = params;

  const { order, items } = await db.transaction(async (transaction) => {
    const lines = await transaction
      .select({
        id: cartItemsTable.id,
        bookId: cartItemsTable.bookId,
        quantity: cartItemsTable.quantity,
      })
      .from(cartItemsTable)
      .where(
        and(
          eq(cartItemsTable.userId, userId),
          body.itemIds ? inArray(cartItemsTable.id, body.itemIds) : undefined,
        ),
      )
      .orderBy(asc(cartItemsTable.createdAt));

    if (body.itemIds) {
      const found = new Set(lines.map((line) => line.id));
      const missing = body.itemIds.filter((itemId) => !found.has(itemId));

      if (missing.length > 0) {
        throw ApiError.badRequest("Some items are not in your cart.");
      }
    }

    if (lines.length === 0) {
      throw ApiError.badRequest("Cart is empty.");
    }

    const created = await createOrderTransaction(transaction, {
      userId,
      body: {
        items: lines.map((line) => ({
          bookId: line.bookId,
          quantity: line.quantity,
        })),
      },
    });

    await transaction.delete(cartItemsTable).where(
      and(
        eq(cartItemsTable.userId, userId),
        inArray(
          cartItemsTable.id,
          lines.map((line) => line.id),
        ),
      ),
    );

    return created;
  });

  await enqueueOrderConfirmationEmail(order, items);

  return { ...order, items };
};
