import { z } from "zod";

export const createReviewSchema = z.object({
  rating: z
    .number("Rating is required and must be a number")
    .int("Rating must be a whole number")
    .min(1, "Rating must be between 1 and 5")
    .max(5, "Rating must be between 1 and 5"),
  comment: z
    .string()
    .max(1000, "Comment must be at most 1000 characters")
    .optional(),
});

export type CreateReviewBody = z.infer<typeof createReviewSchema>;

export const updateReviewSchema = createReviewSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required to update.",
  });

export type UpdateReviewBody = z.infer<typeof updateReviewSchema>;

export const reviewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["createdAt", "rating"]).default("createdAt"),
  orderBy: z.enum(["asc", "desc"]).default("desc"),
});

export type ReviewsQuery = z.infer<typeof reviewsQuerySchema>;
