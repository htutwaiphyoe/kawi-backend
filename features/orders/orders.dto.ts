import { z } from "zod";
import { orderStatusEnum } from "./orders.model";

export const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        bookId: z.uuid("BookId must be a valid UUID"),
        quantity: z
          .number("Quantity is required and must be a number")
          .int("Quantity must be a whole number")
          .min(1, "Quantity must be at least 1"),
      }),
    )
    .min(1, "At least one item is required"),
});

export type CreateOrderBody = z.infer<typeof createOrderSchema>;

export const updateOrderStatusSchema = z.object({
  status: z.enum(orderStatusEnum.enumValues),
});

export type UpdateOrderStatusBody = z.infer<typeof updateOrderStatusSchema>;

export const ordersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["createdAt", "total", "status"]).default("createdAt"),
  orderBy: z.enum(["asc", "desc"]).default("desc"),
});

export type OrdersQuery = z.infer<typeof ordersQuerySchema>;
