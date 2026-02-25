import { z } from "zod";
import { MAX_CART_QUANTITY } from "@/constants";

const quantitySchema = z
  .number("Quantity is required and must be a number")
  .int("Quantity must be a whole number")
  .min(1, "Quantity must be at least 1")
  .max(MAX_CART_QUANTITY, `Quantity must be at most ${MAX_CART_QUANTITY}`);

export const addCartItemSchema = z.object({
  bookId: z.uuid("BookId must be a valid UUID"),
  quantity: quantitySchema.default(1),
});

export type AddCartItemBody = z.infer<typeof addCartItemSchema>;

export const updateCartItemSchema = z.object({
  quantity: quantitySchema,
});

export type UpdateCartItemBody = z.infer<typeof updateCartItemSchema>;

export const checkoutSchema = z.object({
  itemIds: z
    .array(z.uuid("ItemIds must contain valid UUIDs"))
    .min(1, "ItemIds must contain at least one item")
    .optional(),
});

export type CheckoutBody = z.infer<typeof checkoutSchema>;
