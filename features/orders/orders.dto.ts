import { z } from "zod";
import { orderStatusEnum } from "./orders.model";

export const shippingAddressSchema = z.object({
  recipient: z
    .string("Recipient is required")
    .trim()
    .min(1, "Recipient is required")
    .max(255, "Recipient must be at most 255 characters"),
  phone: z
    .string("Phone is required")
    .trim()
    .min(1, "Phone is required")
    .max(30, "Phone must be at most 30 characters"),
  line1: z
    .string("Address is required")
    .trim()
    .min(1, "Address is required")
    .max(255, "Address must be at most 255 characters"),
  line2: z.string().trim().max(255).optional(),
  city: z
    .string("City is required")
    .trim()
    .min(1, "City is required")
    .max(120, "City must be at most 120 characters"),
  postalCode: z.string().trim().max(20).optional(),
  country: z
    .string("Country is required")
    .trim()
    .min(1, "Country is required")
    .max(120, "Country must be at most 120 characters"),
});

export type ShippingAddressBody = z.infer<typeof shippingAddressSchema>;

export const createOrderSchema = z.object({
  address: shippingAddressSchema,
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

const toUtcMidnight = (value: string) => new Date(`${value}T00:00:00.000Z`);

const isCalendarDate = (value: string) => {
  const date = toUtcMidnight(value);

  return (
    !Number.isNaN(date.getTime()) && date.toISOString().startsWith(`${value}T`)
  );
};

const dayFilterSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be a date in YYYY-MM-DD format")
  .refine(isCalendarDate, "Must be a real calendar date");

export const ordersQuerySchema = z
  .object({
    status: z.enum(orderStatusEnum.enumValues).optional(),
    from: dayFilterSchema.optional(),
    to: dayFilterSchema.optional(),
    tzOffset: z.coerce
      .number("TzOffset must be a number")
      .int("TzOffset must be a whole number of minutes")
      .min(-840, "TzOffset must be at least -840")
      .max(840, "TzOffset must be at most 840")
      .default(0),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sortBy: z.enum(["createdAt", "total", "status"]).default("createdAt"),
    orderBy: z.enum(["asc", "desc"]).default("desc"),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    path: ["from"],
    message: "From must be on or before to",
  });

export type OrdersQuery = z.infer<typeof ordersQuerySchema>;
