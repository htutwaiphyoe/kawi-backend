import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { booksTable } from "./books.model";

export const createBookSchema = createInsertSchema(booksTable, {
  title: () =>
    z
      .string("Title is required")
      .min(1, "Title is required")
      .max(255, "Title must be at most 255 characters"),
  authorId: () => z.uuid("AuthorId must be a valid UUID"),
  price: () =>
    z
      .number("Price is required and must be a number")
      .min(0, "Price cannot be negative")
      .transform((n) => n.toFixed(2)),
  publishedDate: () =>
    z.iso.date("PublishedDate must be a valid date (YYYY-MM-DD)"),
  stock: () =>
    z
      .number("Stock must be a number")
      .int("Stock must be a whole number")
      .min(0, "Stock cannot be negative"),
}).pick({
  title: true,
  authorId: true,
  isbn: true,
  description: true,
  price: true,
  publishedDate: true,
  stock: true,
});

export type CreateBookBody = z.infer<typeof createBookSchema>;

export const updateBookSchema = createBookSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required to update.",
  });

export type UpdateBookBody = z.infer<typeof updateBookSchema>;

export const booksQuerySchema = z.object({
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z
    .enum(["title", "price", "publishedDate", "stock", "createdAt"])
    .default("createdAt"),
  orderBy: z.enum(["asc", "desc"]).default("desc"),
});

export type BooksQuery = z.infer<typeof booksQuerySchema>;
