import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { authorsTable } from "./authors.model";

export const createAuthorSchema = createInsertSchema(authorsTable, {
  name: () =>
    z
      .string("Name is required")
      .min(1, "Name is required")
      .max(255, "Name must be at most 255 characters"),
  email: () => z.email("Email must be a valid email"),
  birthDate: () =>
    z.iso.date("BirthDate must be a valid date (YYYY-MM-DD)").optional(),
}).pick({
  name: true,
  email: true,
  phone: true,
  bio: true,
  nationality: true,
  birthDate: true,
});

export type CreateAuthorBody = z.infer<typeof createAuthorSchema>;

export const updateAuthorSchema = createAuthorSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required to update.",
  });

export type UpdateAuthorBody = z.infer<typeof updateAuthorSchema>;

export const authorsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z
    .enum(["name", "email", "birthDate", "createdAt"])
    .default("createdAt"),
  orderBy: z.enum(["asc", "desc"]).default("desc"),
});

export type AuthorsQuery = z.infer<typeof authorsQuerySchema>;
