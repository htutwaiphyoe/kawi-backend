import { and, asc, count, desc, eq, gte, isNull, sql } from "drizzle-orm";
import db from "@/db";
import {
  ordersTable,
  orderItemsTable,
  type Order,
  type OrderItem,
  type OrderStatus,
} from "./orders.model";
import type { CreateOrderBody, OrdersQuery } from "./orders.dto";
import { booksTable } from "@/features/books/books.model";
import { usersTable, type AuthUser } from "@/features/users/users.model";
import {
  emailQueue,
  ORDER_CONFIRMATION_JOB,
  ORDER_STATUS_JOB,
  type OrderConfirmationJob,
  type OrderStatusJob,
} from "@/libs/queue";
import { logger } from "@/libs/logger";
import { ApiError } from "@/libs/error";

const ORDER_SORT = {
  createdAt: ordersTable.createdAt,
  total: ordersTable.total,
  status: ordersTable.status,
};

const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["paid"],
  paid: ["shipped"],
  shipped: [],
  cancelled: [],
};

const getUserEmail = async (userId: string) => {
  const [user] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return user?.email;
};

const enqueueOrderStatusEmail = async (order: Order) => {
  const email = await getUserEmail(order.userId);
  if (!email) return;

  emailQueue
    .add(ORDER_STATUS_JOB, {
      to: email,
      orderId: order.id,
      status: order.status,
    } satisfies OrderStatusJob)
    .catch((err) => logger.error({ err }, "Failed to enqueue order status email"));
};

const enqueueOrderConfirmationEmail = async (order: Order, items: OrderItem[]) => {
  const email = await getUserEmail(order.userId);
  if (!email) return;

  emailQueue
    .add(ORDER_CONFIRMATION_JOB, {
      to: email,
      orderId: order.id,
      total: order.total,
      items: items.map((i) => ({
        title: i.title,
        price: i.price,
        quantity: i.quantity,
      })),
    } satisfies OrderConfirmationJob)
    .catch((err) =>
      logger.error({ err }, "Failed to enqueue order confirmation email"),
    );
};

export const createOrder = async (params: {
  userId: string;
  body: CreateOrderBody;
}) => {
  const { userId, body } = params;

  const { order, items } = await db.transaction(async (tx) => {
    let total = 0;
    const lineItems: {
      bookId: string;
      title: string;
      price: string;
      quantity: number;
    }[] = [];

    for (const { bookId, quantity } of body.items) {
      const [book] = await tx
        .update(booksTable)
        .set({ stock: sql`${booksTable.stock} - ${quantity}` })
        .where(
          and(
            eq(booksTable.id, bookId),
            isNull(booksTable.deletedAt),
            gte(booksTable.stock, quantity),
          ),
        )
        .returning({ title: booksTable.title, price: booksTable.price });

      if (!book) {
        throw ApiError.badRequest(
          `Book ${bookId} is unavailable or has insufficient stock.`,
        );
      }

      total += Number(book.price) * quantity;
      lineItems.push({ bookId, title: book.title, price: book.price, quantity });
    }

    const [order] = await tx
      .insert(ordersTable)
      .values({ userId, total: total.toFixed(2) })
      .returning();

    const items = await tx
      .insert(orderItemsTable)
      .values(lineItems.map((item) => ({ orderId: order.id, ...item })))
      .returning();

    return { order, items };
  });

  await enqueueOrderConfirmationEmail(order, items);

  return { ...order, items };
};

export const getOrders = async (user: AuthUser, query: OrdersQuery) => {
  const offset = (query.page - 1) * query.limit;

  const where =
    user.role === "admin" ? undefined : eq(ordersTable.userId, user.id);

  const orderBy = (query.orderBy === "asc" ? asc : desc)(
    ORDER_SORT[query.sortBy],
  );

  const [orders, [{ total }]] = await Promise.all([
    db
      .select()
      .from(ordersTable)
      .where(where)
      .orderBy(orderBy)
      .limit(query.limit)
      .offset(offset),
    db.select({ total: count() }).from(ordersTable).where(where),
  ]);

  return { orders, total };
};

export const getOrder = async (id: string, user: AuthUser) => {
  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, id))
    .limit(1);

  if (!order) {
    throw ApiError.notFound("Order is not found.");
  }

  if (order.userId !== user.id && user.role !== "admin") {
    throw ApiError.forbidden("You can only view your own orders.");
  }

  const items = await db
    .select()
    .from(orderItemsTable)
    .where(eq(orderItemsTable.orderId, id));

  return { ...order, items };
};

export const cancelOrder = async (id: string, user: AuthUser) => {
  const cancelled = await db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, id))
      .for("update")
      .limit(1);

    if (!order) {
      throw ApiError.notFound("Order is not found.");
    }

    if (order.userId !== user.id && user.role !== "admin") {
      throw ApiError.forbidden("You can only cancel your own orders.");
    }

    if (order.status !== "pending") {
      throw ApiError.conflict("Only pending orders can be cancelled.");
    }

    const items = await tx
      .select()
      .from(orderItemsTable)
      .where(eq(orderItemsTable.orderId, id));

    for (const item of items) {
      if (item.bookId) {
        await tx
          .update(booksTable)
          .set({ stock: sql`${booksTable.stock} + ${item.quantity}` })
          .where(eq(booksTable.id, item.bookId));
      }
    }

    const [updated] = await tx
      .update(ordersTable)
      .set({ status: "cancelled" })
      .where(eq(ordersTable.id, id))
      .returning();

    return updated;
  });

  await enqueueOrderStatusEmail(cancelled);

  return cancelled;
};

export const updateOrderStatus = async (id: string, status: OrderStatus) => {
  const [order] = await db
    .select({ status: ordersTable.status })
    .from(ordersTable)
    .where(eq(ordersTable.id, id))
    .limit(1);

  if (!order) {
    throw ApiError.notFound("Order is not found.");
  }

  if (!STATUS_TRANSITIONS[order.status].includes(status)) {
    throw ApiError.badRequest(
      `Cannot change status from ${order.status} to ${status}.`,
    );
  }

  const [updated] = await db
    .update(ordersTable)
    .set({ status })
    .where(eq(ordersTable.id, id))
    .returning();

  await enqueueOrderStatusEmail(updated);

  return updated;
};
